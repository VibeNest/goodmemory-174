import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  createInternalGoodMemory,
} from "../api/createGoodMemory";
import type {
  GoodMemory,
  RecallResult,
  RememberResult,
} from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { MemoryExtractor } from "../remember/candidates";
import {
  createProviderConversationalMemoryExtractor,
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
  createProviderPointwiseReranker,
  createProviderRecallPlanAssistant,
} from "../provider/layer";
import type { ModelUsageSink } from "../provider/model-usage";
import type { GeneralizedFusionChannel } from "../recall/generalizedFusion";
import { createLexicalCoverageReranker } from "../recall/reranker";
import type { EvidenceLedgerFormat } from "./evidenceLedgerFormats";
import {
  createAttributedModelUsageSink,
  type AttributedModelUsageAttempt,
} from "./modelUsage";
import { phase74ComparisonBranch } from "./phase74Generalization";
import type {
  Phase74RawEvidenceItem,
  Phase74RecallCase,
  Phase74RetrievalExecutionInput,
  Phase74RetrievalSnapshot,
} from "./phase74Generalization";
import type { Phase74LiveModels } from "./phase74Live";
import type { EvalRunJsonObject } from "./runIdentity";

const CONTEXT_TOKEN_BUDGET = 6_000;
const EVIDENCE_LEDGER_FORMATS = [
  "prose",
  "chronology",
  "compact_json",
  "json_locale_note",
] as const satisfies readonly EvidenceLedgerFormat[];

export const PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION = {
  assistedExtraction: {
    maxOutputTokens: 4_096,
    temperature: 0,
  },
  assistedRecallPlan: {
    maxOutputTokens: 1_024,
    temperature: 0,
  },
  pointwiseReranker: {
    maxOutputTokens: 256,
    temperature: 0,
  },
} as const;

const RAW_EVIDENCE_EXTRACTOR: MemoryExtractor = {
  async extract({ messages }) {
    return {
      candidates: messages.map((message, sourceMessageIndex) => ({
        content: message.content,
        explicitness: "explicit" as const,
        extractionSources: ["rules-only" as const],
        id: `raw-${sourceMessageIndex + 1}`,
        kindHint: "fact" as const,
        sourceMessageIndex,
        sourceRole: message.role,
      })),
      ignoredMessageCount: 0,
    };
  },
};

interface IngestionModelIdentity {
  gateway: string;
  model: string;
  provider: string;
}

export interface Phase74IngestionKeyInput {
  datasetSha256: string;
  embedding: IngestionModelIdentity & {
    adapterVersion: string;
  };
  evaluatorSourceSha256: string;
  extraction: IngestionModelIdentity & {
    contextualDescriptors: boolean;
    extractorVersion: string;
    maxOutputTokens: number;
    promptSha256: string;
    temperature: number;
  };
  memoryGroupId: string;
  rawEvidence: readonly Phase74RawEvidenceItem[];
  representation: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildPhase74RetrievalSnapshotId(input: {
  arm: string;
  evidenceLedgers?: unknown;
  retrievedMemories: readonly unknown[];
  stage: string;
  storedMemories: readonly unknown[];
}): string {
  return sha256(canonicalJson({
    arm: input.arm,
    evidenceLedgers: input.evidenceLedgers,
    retrievedMemories: input.retrievedMemories,
    stage: input.stage,
    storedMemories: input.storedMemories,
  }));
}

export function buildPhase74IngestionKey(
  input: Phase74IngestionKeyInput,
): string {
  return sha256(canonicalJson({
    ...input,
    schemaVersion: 4,
  }));
}

export function phase74ExecutionBranch(
  stage: Phase74RetrievalExecutionInput["stage"],
  arm: Phase74RetrievalExecutionInput["arm"],
): "baseline" | "candidate" | "shadow" {
  return phase74ComparisonBranch(stage, arm);
}

function modelIdentity(model: Phase74LiveModels["answer"]): IngestionModelIdentity {
  return {
    gateway: model.baseURL ?? "",
    model: model.model,
    provider: model.provider,
  };
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function fusionChannels(value: unknown): GeneralizedFusionChannel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const allowed = new Set<GeneralizedFusionChannel>([
    "dense",
    "entity",
    "lexical",
    "relation",
    "temporal",
  ]);
  return value.filter(
    (item): item is GeneralizedFusionChannel =>
      typeof item === "string" && allowed.has(item as GeneralizedFusionChannel),
  );
}

function isoDate(value: string | undefined): string {
  if (value === undefined) {
    return new Date(0).toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Phase 74 observed time: ${value}.`);
  }
  return date.toISOString();
}

function groupSessionId(item: Phase74RawEvidenceItem): string {
  const sourceId = item.sourceIds[0] ?? "source";
  return sourceId.match(/^([^:]+):/u)?.[1] ?? sourceId;
}

export function buildPhase74LabelFreeScope(
  testCase: Phase74RecallCase,
): MemoryScope {
  const memoryGroupId = testCase.memoryGroupId ?? testCase.caseId;
  return {
    userId: `user-${sha256(memoryGroupId).slice(0, 32)}`,
    workspaceId: `workspace-${sha256("label-free-evaluation-workspace").slice(0, 32)}`,
  };
}

type Phase74EvidenceLink = Pick<
  RecallResult["evidence"][number],
  "linkedArchiveIds" | "linkedMemoryIds" | "sourceMessageIds"
>;

function sourceIdsForMemory(input: {
  evidence: readonly Phase74EvidenceLink[];
  memoryId: string;
  sourceIdsByMessageId: ReadonlyMap<string, readonly string[]>;
}): string[] {
  return [...new Set(
    input.evidence
      .filter((record) =>
        record.linkedMemoryIds.includes(input.memoryId) ||
        record.linkedArchiveIds.includes(input.memoryId)
      )
      .flatMap((record) => record.sourceMessageIds)
      .flatMap((messageId) => input.sourceIdsByMessageId.get(messageId) ?? []),
  )];
}

export function buildPhase74ContextItems(input: {
  evidence: readonly Phase74EvidenceLink[];
  records: readonly {
    content: string;
    id: string;
    sourceMemoryId?: string;
  }[];
  sourceIdsByMessageId: ReadonlyMap<string, readonly string[]>;
}) {
  return input.records.map((record) => ({
    content: record.content,
    id: record.id,
    sourceIds: sourceIdsForMemory({
      evidence: input.evidence,
      memoryId: record.sourceMemoryId ?? record.id,
      sourceIdsByMessageId: input.sourceIdsByMessageId,
    }),
  }));
}

function createMemory(input: {
  configuration: EvalRunJsonObject;
  includeExtractor: boolean;
  models: Phase74LiveModels;
  now: string;
  rerankerMode: "deterministic" | "provider";
  sqlitePath: string;
  usageSink: ModelUsageSink;
}): {
  extractionStrategy: "llm-assisted" | "rules-only";
  memory: GoodMemory;
} {
  const representation = readString(input.configuration.representation, "raw-only");
  const retrieval = objectValue(input.configuration.retrieval);
  const planner = objectValue(input.configuration.planner);
  const plannerMode = readString(planner.mode, "off");
  const contextualDescriptors = representation === "atomic-contextual-raw-pointer";
  const assistedExtractor = !input.includeExtractor || representation === "raw-only"
    ? undefined
    : contextualDescriptors
      ? createProviderConversationalMemoryExtractor({
          contextualDescriptor: true,
          ...PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION.assistedExtraction,
          model: input.models.assistedExtraction,
          modelUsageSink: input.usageSink,
        })
      : createProviderMemoryExtractor({
          ...PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION.assistedExtraction,
          model: input.models.assistedExtraction,
          modelUsageSink: input.usageSink,
        });
  const channels = fusionChannels(retrieval.generalizedFusionChannels);
  const memory = createInternalGoodMemory({
    adapters: {
      ...(assistedExtractor === undefined ? {} : { assistedExtractor }),
      embeddingAdapter: createProviderEmbeddingAdapter({
        model: input.models.embedding,
        modelUsageSink: input.usageSink,
      }),
      reranker: input.rerankerMode === "deterministic"
        ? createLexicalCoverageReranker()
        : createProviderPointwiseReranker({
            ...PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION.pointwiseReranker,
            model: input.models.reranker,
            modelUsageSink: input.usageSink,
          }),
      ...(plannerMode === "assisted"
        ? {
            recallPlanner: createProviderRecallPlanAssistant({
              ...PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION.assistedRecallPlan,
              model: input.models.planner,
              modelUsageSink: input.usageSink,
            }),
          }
        : {}),
    },
    retrieval: {
      ...(channels === undefined ? {} : { generalizedFusionChannels: channels }),
      preset: "recommended",
      recallPlanExecution: readBoolean(retrieval.recallPlanExecution),
    },
    remember: {
      profiles: [{
        assistantOutputs: { mode: "confirmed_or_verified_only" },
        id: "external-evidence",
      }],
    },
    storage: { provider: "sqlite", url: input.sqlitePath },
    testing: {
      ...(representation === "raw-only"
        ? { extractor: RAW_EVIDENCE_EXTRACTOR }
        : {}),
      now: () => new Date(input.now),
    },
  }, { environment: {} });
  return {
    extractionStrategy: assistedExtractor === undefined ? "rules-only" : "llm-assisted",
    memory,
  };
}

async function seedMemory(input: {
  memory: GoodMemory;
  extractionStrategy: "llm-assisted" | "rules-only";
  testCase: Phase74RecallCase;
}): Promise<void> {
  const scope = buildPhase74LabelFreeScope(input.testCase);
  const groups = new Map<string, Phase74RawEvidenceItem[]>();
  for (const item of input.testCase.rawEvidence) {
    const sessionId = groupSessionId(item);
    groups.set(sessionId, [...(groups.get(sessionId) ?? []), item]);
  }
  for (const [sessionId, items] of groups) {
    const messages = items.map((item) => ({
      content: item.content,
      id: item.id,
      observedAt: isoDate(item.observedAt ?? input.testCase.referenceTime),
      role: item.role === "assistant" ? "assistant" as const : "user" as const,
    }));
    const result = await input.memory.remember({
      annotations: messages.map((_, messageIndex) => ({
        confirmed: true,
        kindHint: "fact" as const,
        messageIndex,
        reason: "Preserve immutable external benchmark evidence.",
        remember: "always" as const,
        verified: true,
      })),
      extractionStrategy: input.extractionStrategy,
      messages,
      scope: { ...scope, sessionId },
    });
    assertPhase74IngestionRememberResult({
      extractionStrategy: input.extractionStrategy,
      result,
    });
  }
}

export function assertPhase74IngestionRememberResult(input: {
  extractionStrategy: "llm-assisted" | "rules-only";
  result: RememberResult;
}): void {
  if (
    input.extractionStrategy === "llm-assisted" &&
    input.result.warnings?.includes("assisted_extraction_failed")
  ) {
    throw new Error(
      "Phase 74 assisted extraction failed; refusing to persist a degraded ingestion snapshot.",
    );
  }
}

export function assertPhase74RecallProviderIntegrity(input: {
  plannerMode: string;
  policyApplied: readonly string[];
  reranker?: {
    fallbackReason?: string;
    status: "applied" | "fallback" | "skipped";
  };
}): void {
  if (input.reranker?.status === "fallback") {
    throw new Error(
      `Phase 74 provider reranker fell back (${input.reranker.fallbackReason ?? "unknown"}).`,
    );
  }
  if (
    input.plannerMode === "assisted" &&
    input.policyApplied.includes("recall_plan_assistant_fallback")
  ) {
    throw new Error("Phase 74 assisted recall plan fell back.");
  }
}

export function createPhase74FullRetrievalRuntime(input: {
  datasetSha256: string;
  evaluatorSourceSha256: string;
  events: AttributedModelUsageAttempt[];
  models: Phase74LiveModels;
  onUsageEvent?: (event: AttributedModelUsageAttempt) => void;
  promptSha256s: Readonly<Record<string, string>>;
  rerankerMode?: "deterministic" | "provider";
  runDirectory: string;
}): {
  execute(value: Phase74RetrievalExecutionInput): Promise<Phase74RetrievalSnapshot>;
  render(input: {
    format: EvidenceLedgerFormat;
    snapshot: Phase74RetrievalSnapshot;
  }): Promise<string>;
} {
  const ready = new Map<string, Promise<string>>();

  const ensureIngested = (
    testCase: Phase74RecallCase,
    configuration: EvalRunJsonObject,
  ): Promise<string> => {
    const representation = readString(configuration.representation, "raw-only");
    const memoryGroupId = testCase.memoryGroupId ?? testCase.caseId;
    const contextualDescriptors = representation === "atomic-contextual-raw-pointer";
    const key = buildPhase74IngestionKey({
      datasetSha256: input.datasetSha256,
      embedding: {
        ...modelIdentity(input.models.embedding),
        adapterVersion: "openai-compatible-embedding-v1",
      },
      evaluatorSourceSha256: input.evaluatorSourceSha256,
      extraction: {
        ...modelIdentity(input.models.assistedExtraction),
        contextualDescriptors,
        extractorVersion: contextualDescriptors
          ? "provider-conversational-memory-extractor-v1"
          : "provider-memory-extractor-v1",
        maxOutputTokens:
          PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION.assistedExtraction
            .maxOutputTokens,
        promptSha256: input.promptSha256s[
          contextualDescriptors
            ? "conversationalExtraction"
            : "assistedExtraction"
        ] ?? "",
        temperature:
          PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION.assistedExtraction
            .temperature,
      },
      memoryGroupId,
      rawEvidence: testCase.rawEvidence,
      representation,
    });
    const existing = ready.get(key);
    if (existing) {
      return existing;
    }
    const pending = (async () => {
      const directory = join(input.runDirectory, "ingestion", key);
      const sqlitePath = join(directory, "memory.sqlite");
      const manifestPath = join(directory, "manifest.json");
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        if (manifest.key !== key) {
          throw new Error(`Phase 74 ingestion manifest drift at ${manifestPath}.`);
        }
        await access(sqlitePath);
        return sqlitePath;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      await rm(directory, { force: true, recursive: true });
      await mkdir(directory, { recursive: true });
      const sink = createAttributedModelUsageSink({
        branch: "shadow",
        caseId: memoryGroupId,
        events: input.events,
        onEvent: input.onUsageEvent,
      });
      const runtime = createMemory({
        configuration,
        includeExtractor: true,
        models: input.models,
        now: isoDate(testCase.referenceTime),
        rerankerMode: input.rerankerMode ?? "provider",
        sqlitePath,
        usageSink: sink,
      });
      await seedMemory({
        extractionStrategy: runtime.extractionStrategy,
        memory: runtime.memory,
        testCase,
      });
      await writeFile(manifestPath, `${JSON.stringify({
        key,
        memoryGroupId,
        representation,
        schemaVersion: 4,
        sourceMessageCount: testCase.rawEvidence.length,
      }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      return sqlitePath;
    })();
    ready.set(key, pending);
    return pending;
  };

  return {
    async execute({ arm, configuration, stage, testCase }) {
      const frozenSqlitePath = await ensureIngested(testCase, configuration);
      const queryPathStartedAt = performance.now();
      const queryRoot = join(input.runDirectory, "query-work");
      await mkdir(queryRoot, { recursive: true });
      const queryDirectory = await mkdtemp(join(queryRoot, "query-"));
      const sqlitePath = join(queryDirectory, "memory.sqlite");
      await copyFile(
        frozenSqlitePath,
        sqlitePath,
        fsConstants.COPYFILE_FICLONE,
      );
      try {
        const sink = createAttributedModelUsageSink({
          branch: phase74ExecutionBranch(stage, arm),
          caseId: testCase.caseId,
          events: input.events,
          onEvent: input.onUsageEvent,
        });
        const runtime = createMemory({
          configuration,
          includeExtractor: false,
          models: input.models,
          now: isoDate(testCase.referenceTime),
          rerankerMode: input.rerankerMode ?? "provider",
          sqlitePath,
          usageSink: sink,
        });
        const scope = buildPhase74LabelFreeScope(testCase);
        const recall = await runtime.memory.recall({
          includeEvidence: true,
          locale: testCase.locale,
          query: testCase.question,
          scope,
          strategy: "hybrid",
        });
        assertPhase74RecallProviderIntegrity({
          plannerMode: readString(
            objectValue(configuration.planner).mode,
            "off",
          ),
          policyApplied: recall.metadata.policyApplied,
          ...(recall.metadata.retrievalTrace?.reranker === undefined
            ? {}
            : { reranker: recall.metadata.retrievalTrace.reranker }),
        });
        const exported = await runtime.memory.exportMemory({ scope });
        const sourceIdsByMessageId = new Map(
          testCase.rawEvidence.map((item) => [item.id, item.sourceIds] as const),
        );
        const storedMemories = buildPhase74ContextItems({
          evidence: exported.durable.evidence,
          records: exported.durable.facts.map(({ content, id }) => ({ content, id })),
          sourceIdsByMessageId,
        });
        const retrievedMemories = buildPhase74ContextItems({
          evidence: recall.evidence,
          records: recall.facts.map(({ attributes, content, id }) => ({
            content,
            id,
            ...(typeof attributes?.sourceMemoryId === "string"
              ? { sourceMemoryId: attributes.sourceMemoryId }
              : {}),
          })),
          sourceIdsByMessageId,
        });
        const evidenceLedgers =
          stage === "E3" && arm === "recall-plan-deterministic"
            ? Object.fromEntries(await Promise.all(EVIDENCE_LEDGER_FORMATS.map(
                async (format) => [format, (await runtime.memory.buildContext({
                  evidenceLedgerFormat: format,
                  maxTokens: CONTEXT_TOKEN_BUDGET,
                  output: "markdown",
                  recall,
                })).content],
              ))) as Record<EvidenceLedgerFormat, string>
            : undefined;
        const snapshotId = buildPhase74RetrievalSnapshotId({
          arm,
          evidenceLedgers,
          retrievedMemories,
          stage,
          storedMemories,
        });
        return {
          ...(evidenceLedgers === undefined ? {} : { evidenceLedgers }),
          recallMetadata: {
            candidateTraces: recall.metadata.candidateTraces,
            latencyMs: recall.metadata.latencyMs,
            ...(recall.metadata.retrievalTrace === undefined
              ? {}
              : { retrievalTrace: recall.metadata.retrievalTrace }),
            queryPathLatencyMs: Math.max(
              0,
              performance.now() - queryPathStartedAt,
            ),
            routingDecision: recall.metadata.routingDecision,
          },
          retrievedMemories,
          snapshotId,
          storedMemories,
        };
      } finally {
        await rm(queryDirectory, { force: true, recursive: true });
      }
    },
    async render({ format, snapshot }) {
      const rendered = snapshot.evidenceLedgers?.[format];
      if (rendered === undefined) {
        throw new Error(
          `Phase 74 snapshot ${snapshot.snapshotId} has no ${format} ledger.`,
        );
      }
      return rendered;
    },
  };
}
