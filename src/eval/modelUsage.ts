import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";

import {
  modelTokenTotal,
  type ModelUsageAttempt,
  type ModelUsageOperation,
  type ModelUsageSink,
} from "../provider/model-usage";
import {
  PHASE74_MODEL_USAGE_ACCOUNTING_VERSION,
  type Phase74ModelUsageBranchEvidence,
  type Phase74ModelUsageEvidence,
} from "./phase74PromotionGate";

export type Phase74ModelUsageBranch =
  | "baseline"
  | "candidate"
  | "judge"
  | "oracle_reader"
  | "protocol_reader"
  | "shadow";

export interface AttributedModelUsageAttempt extends ModelUsageAttempt {
  branch: Phase74ModelUsageBranch;
  caseId: string;
}

const PHASE74_USAGE_BRANCHES = new Set<Phase74ModelUsageBranch>([
  "baseline",
  "candidate",
  "judge",
  "oracle_reader",
  "protocol_reader",
  "shadow",
]);
const PHASE74_USAGE_OPERATIONS = new Set<ModelUsageOperation>([
  "answer_generation",
  "assisted_extraction",
  "embedding",
  "judge",
  "recall_plan",
  "recall_router_plan",
  "recall_router_rerank",
  "reranker_listwise",
  "reranker_pointwise",
]);

function isUsageTokenCount(value: unknown): boolean {
  return value === null || (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function isAttributedModelUsageAttempt(
  value: unknown,
): value is AttributedModelUsageAttempt {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  const usage = event.usage;
  return Number.isSafeInteger(event.attempt) && Number(event.attempt) > 0 &&
    typeof event.branch === "string" &&
    PHASE74_USAGE_BRANCHES.has(event.branch as Phase74ModelUsageBranch) &&
    typeof event.caseId === "string" && event.caseId.length > 0 &&
    (event.completeness === "complete" ||
      event.completeness === "missing" || event.completeness === "partial") &&
    typeof event.modelId === "string" && event.modelId.length > 0 &&
    typeof event.operation === "string" &&
    PHASE74_USAGE_OPERATIONS.has(event.operation as ModelUsageOperation) &&
    (event.outcome === "failed" || event.outcome === "succeeded") &&
    typeof event.providerId === "string" && event.providerId.length > 0 &&
    event.schemaVersion === 1 && usage !== null && typeof usage === "object" &&
    !Array.isArray(usage) && [
      "cacheCreationInputTokens",
      "cacheReadInputTokens",
      "inputTokens",
      "outputTokens",
      "uncachedInputTokens",
    ].every((key) => isUsageTokenCount((usage as Record<string, unknown>)[key]));
}

export async function loadPhase74ModelUsageEvents(
  path: string,
): Promise<AttributedModelUsageAttempt[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return raw.split("\n").filter(Boolean).map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Invalid Phase 74 model usage JSON at line ${index + 1}.`);
    }
    if (!isAttributedModelUsageAttempt(value)) {
      throw new Error(`Invalid Phase 74 model usage event at line ${index + 1}.`);
    }
    return value;
  });
}

interface Phase74ModelUsageAppendDependencies {
  close(fd: number): void;
  fsync(fd: number): void;
  open(path: string): number;
  write(fd: number, value: string): void;
}

const DEFAULT_APPEND_DEPENDENCIES: Phase74ModelUsageAppendDependencies = {
  close: closeSync,
  fsync: fsyncSync,
  open: (path) => openSync(path, "a"),
  write: (fd, value) => writeFileSync(fd, value, "utf8"),
};

export function appendPhase74ModelUsageEventSync(
  path: string,
  event: AttributedModelUsageAttempt,
  dependencies: Phase74ModelUsageAppendDependencies =
    DEFAULT_APPEND_DEPENDENCIES,
): void {
  const fd = dependencies.open(path);
  try {
    dependencies.write(fd, `${JSON.stringify(event)}\n`);
    dependencies.fsync(fd);
  } finally {
    dependencies.close(fd);
  }
}

export function createAttributedModelUsageSink(input: {
  branch: Phase74ModelUsageBranch;
  caseId: string;
  events: AttributedModelUsageAttempt[];
  onEvent?: (event: AttributedModelUsageAttempt) => void;
}): ModelUsageSink {
  return {
    emit(event) {
      const attributed = {
        ...event,
        branch: input.branch,
        caseId: input.caseId,
        usage: { ...event.usage },
      };
      input.onEvent?.(attributed);
      input.events.push(attributed);
    },
    strict: true,
  };
}

function aggregateBranch(
  events: readonly AttributedModelUsageAttempt[],
  branch: "baseline" | "candidate",
  expectedCaseIds?: readonly string[],
): Phase74ModelUsageBranchEvidence {
  const selected = events.filter((event) => event.branch === branch);
  const observedCaseIds = new Set(selected.map(({ caseId }) => caseId));
  if (expectedCaseIds !== undefined) {
    const expected = new Set(expectedCaseIds);
    if (expected.size !== expectedCaseIds.length) {
      throw new Error(`${branch} model usage expected case IDs must be unique.`);
    }
    const unexpected = [...observedCaseIds].filter((caseId) => !expected.has(caseId));
    if (unexpected.length > 0) {
      throw new Error(
        `${branch} model usage contains unexpected case(s): ${unexpected.join(", ")}`,
      );
    }
  }
  if (selected.some(({ operation }) => operation === "judge")) {
    throw new Error(`${branch} product usage must not include judge operations.`);
  }
  const caseIds = expectedCaseIds === undefined
    ? [...observedCaseIds].sort()
    : [...expectedCaseIds].sort();
  const operationCounts: Partial<Record<ModelUsageOperation, number>> = {};
  for (const event of selected) {
    operationCounts[event.operation] = (operationCounts[event.operation] ?? 0) + 1;
  }
  return {
    answerGenerationCaseCount: new Set(
      selected
        .filter(({ operation }) => operation === "answer_generation")
        .map(({ caseId }) => caseId),
    ).size,
    caseIdsSha256: createHash("sha256")
      .update(JSON.stringify(caseIds))
      .digest("hex"),
    completeRequestCount: selected.filter(
      ({ completeness }) => completeness === "complete",
    ).length,
    logicalCaseCount: expectedCaseIds?.length ?? observedCaseIds.size,
    missingRequestCount: selected.filter(
      ({ completeness }) => completeness === "missing",
    ).length,
    operationCounts,
    partialRequestCount: selected.filter(
      ({ completeness }) => completeness === "partial",
    ).length,
    requestCount: selected.length,
    totalTokens: selected.reduce(
      (total, event) => total + (modelTokenTotal(event.usage) ?? 0),
      0,
    ),
    unobservedCaseIds: expectedCaseIds?.filter(
      (caseId) => !observedCaseIds.has(caseId),
    ) ?? [],
  };
}

export function buildPhase74ModelUsageEvidence(
  events: readonly AttributedModelUsageAttempt[],
  expected?: {
    baselineCaseIds: readonly string[];
    candidateCaseIds: readonly string[];
    costBoundary?: Phase74ModelUsageEvidence["costBoundary"];
  },
): Phase74ModelUsageEvidence {
  return {
    accountingVersion: PHASE74_MODEL_USAGE_ACCOUNTING_VERSION,
    baseline: aggregateBranch(events, "baseline", expected?.baselineCaseIds),
    candidate: aggregateBranch(events, "candidate", expected?.candidateCaseIds),
    costBoundary: expected?.costBoundary ?? "full-product",
  };
}
