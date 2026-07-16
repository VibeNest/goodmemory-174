import { createHash } from "node:crypto";

import { z } from "zod";

import type { CodexCodingEffectAttemptRow } from "./attempts";
import {
  CODEX_CODING_EFFECT_ARMS,
} from "./contracts";
import type {
  CodexCodingEffectArm,
} from "./contracts";
const caseResultSchema = z.object({
  arm: z.enum(CODEX_CODING_EFFECT_ARMS),
  attemptId: z.string().min(1),
  changedFiles: z.array(z.string().min(1)),
  codexStatus: z.enum([
    "completed",
    "event-parse-failed",
    "missing-final-message",
    "non-zero-exit",
    "not-started",
    "spawn-failed",
    "timed-out",
  ]),
  disposition: z.enum(["finalized", "infrastructure-failure"]),
  episodeId: z.string().min(1),
  executionFailureStage: z.string().min(1).nullable(),
  failToPassStatus: z.enum([
    "failed",
    "infrastructure-failure",
    "passed",
    "timed-out",
  ]),
  forbiddenFiles: z.array(z.string().min(1)),
  pairKey: z.string().min(1),
  passToPassStatus: z.enum([
    "failed",
    "infrastructure-failure",
    "passed",
    "timed-out",
  ]),
  patchSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  repetition: z.number().int().positive(),
  resolved: z.boolean(),
  schemaVersion: z.literal(1),
  seed: z.number().int().positive(),
  stageId: z.string().min(1),
  taskFailureReasons: z.array(z.string().min(1)),
  workKey: z.string().min(1),
}).strict();

export type CodexCodingEffectCaseResult = z.infer<typeof caseResultSchema>;

export interface CodexCodingEffectArmSummary {
  arm: CodexCodingEffectArm;
  attemptedCount: number;
  finalizedCount: number;
  resolvedCount: number;
}

export interface CodexCodingEffectDeterministicSummary {
  arms: CodexCodingEffectArmSummary[];
  attemptedCount: number;
  evidenceClass: "deterministic-smoke";
  finalizedCount: number;
  generatedAt: string;
  infrastructureFailureCount: number;
  paired: {
    comparablePairs: number;
    regressions: number;
    rescues: number;
  };
  resolvedCount: number;
  retriedCount: number;
  runId: string;
  schemaVersion: 1;
  sourceCasesSha256: string;
}

export function serializeCodexCodingEffectCases(
  cases: readonly CodexCodingEffectCaseResult[],
): string {
  if (cases.length === 0) {
    return "";
  }
  return `${cases.map((row) =>
    JSON.stringify(parseCodexCodingEffectCaseResult(row))
  ).join("\n")}\n`;
}

export function parseCodexCodingEffectCaseResult(
  value: unknown,
): CodexCodingEffectCaseResult {
  const result = caseResultSchema.safeParse(value);
  if (!result.success) {
    throw new Error("invalid Codex coding-effect case result");
  }
  const row = result.data;
  const expectedPairKey = [
    row.episodeId,
    row.stageId,
    row.seed,
    row.repetition,
  ].join("/");
  const expectedWorkKey = [
    row.episodeId,
    row.stageId,
    row.arm,
    row.seed,
    row.repetition,
  ].join("/");
  if (row.pairKey !== expectedPairKey || row.workKey !== expectedWorkKey) {
    throw new Error("Codex coding-effect case identity is inconsistent");
  }
  if (!row.attemptId.startsWith(`${row.workKey}#attempt-`)) {
    throw new Error("Codex coding-effect case attempt identity is inconsistent");
  }
  if ((row.patchSha256 === null) !== (row.changedFiles.length === 0)) {
    throw new Error("Codex coding-effect case patch metadata is inconsistent");
  }
  if (row.forbiddenFiles.some((path) => !row.changedFiles.includes(path))) {
    throw new Error("Codex coding-effect forbidden files are inconsistent");
  }
  return row;
}

export function buildCodexCodingEffectDeterministicSummary(input: {
  arms: readonly CodexCodingEffectArm[];
  attempts: readonly CodexCodingEffectAttemptRow[];
  cases: readonly CodexCodingEffectCaseResult[];
  generatedAt: string;
  runId: string;
}): CodexCodingEffectDeterministicSummary {
  const casesBytes = serializeCodexCodingEffectCases(input.cases);
  const armByWorkKey = new Map(
    input.cases.map((row) => [row.workKey, row.arm]),
  );
  const armOrder = CODEX_CODING_EFFECT_ARMS.filter((arm) =>
    input.arms.includes(arm)
  );
  const arms = armOrder.map((arm) => {
    const attempts = input.attempts.filter((row) =>
      armByWorkKey.get(row.workKey) === arm
    );
    const finalized = input.cases.filter((row) =>
      row.arm === arm && row.disposition === "finalized"
    );
    return {
      arm,
      attemptedCount: attempts.length,
      finalizedCount: finalized.length,
      resolvedCount: finalized.filter((row) => row.resolved).length,
    };
  });
  const pairs = collectComparablePairs(input.cases);
  const uniqueAttemptedWork = new Set(
    input.attempts.map((row) => row.workKey),
  ).size;

  return {
    arms,
    attemptedCount: input.attempts.length,
    evidenceClass: "deterministic-smoke",
    finalizedCount: input.cases.filter(
      (row) => row.disposition === "finalized",
    ).length,
    generatedAt: input.generatedAt,
    infrastructureFailureCount: input.attempts.filter(
      (row) => row.disposition === "infrastructure-failure",
    ).length,
    paired: {
      comparablePairs: pairs.length,
      regressions: pairs.filter((pair) =>
        pair.noMemory.resolved && !pair.goodMemory.resolved
      ).length,
      rescues: pairs.filter((pair) =>
        !pair.noMemory.resolved && pair.goodMemory.resolved
      ).length,
    },
    resolvedCount: input.cases.filter((row) =>
      row.disposition === "finalized" && row.resolved
    ).length,
    retriedCount: input.attempts.length - uniqueAttemptedWork,
    runId: input.runId,
    schemaVersion: 1,
    sourceCasesSha256: createHash("sha256").update(casesBytes).digest("hex"),
  };
}

export function serializeCodexCodingEffectSummary(
  summary: CodexCodingEffectDeterministicSummary,
): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function collectComparablePairs(
  cases: readonly CodexCodingEffectCaseResult[],
): Array<{
  goodMemory: CodexCodingEffectCaseResult;
  noMemory: CodexCodingEffectCaseResult;
}> {
  const byPair = new Map<string, Map<CodexCodingEffectArm, CodexCodingEffectCaseResult>>();
  for (const row of cases) {
    if (row.disposition !== "finalized") {
      continue;
    }
    const arms = byPair.get(row.pairKey) ?? new Map();
    arms.set(row.arm, row);
    byPair.set(row.pairKey, arms);
  }

  const pairs: Array<{
    goodMemory: CodexCodingEffectCaseResult;
    noMemory: CodexCodingEffectCaseResult;
  }> = [];
  for (const arms of byPair.values()) {
    const noMemory = arms.get("no-memory");
    const goodMemory = arms.get("goodmemory-installed");
    if (noMemory !== undefined && goodMemory !== undefined) {
      pairs.push({ goodMemory, noMemory });
    }
  }
  return pairs;
}
