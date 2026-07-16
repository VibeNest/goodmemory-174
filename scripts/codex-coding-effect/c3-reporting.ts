import { createHash } from "node:crypto";

import { z } from "zod";

import type { CodexCodingEffectAttemptRow } from "./attempts";
import {
  serializeCodexCodingEffectCases,
} from "./reporting";
import type { CodexCodingEffectCaseResult } from "./reporting";

const c3PilotOutcomeSchema = z.enum([
  "rescue",
  "regression",
  "tie-both-pass",
  "tie-both-fail",
  "incomparable",
]);

const c3FrozenPrehistoryPilotSummarySchema = z.object({
  schemaVersion: z.literal(1),
  evidenceClass: z.literal("frozen-prehistory-pilot"),
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  attemptedCount: z.number().int().nonnegative(),
  finalizedCount: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  infrastructureFailureCount: z.number().int().nonnegative(),
  comparablePairs: z.union([z.literal(0), z.literal(1)]),
  outcome: c3PilotOutcomeSchema,
  taskScoringSource: z.literal("deterministic-hidden-tests"),
  memoryDiagnosticsUsedForTaskScore: z.literal(false),
  sourceCasesSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  publicClaimEligible: z.literal(false),
}).strict().superRefine((summary, context) => {
  const comparable = summary.comparablePairs === 1;
  if (comparable === (summary.outcome === "incomparable")) {
    context.addIssue({
      code: "custom",
      message: "C3 outcome does not match pair comparability",
      path: ["outcome"],
    });
  }
  if (
    summary.resolvedCount > summary.finalizedCount ||
    summary.finalizedCount > summary.attemptedCount ||
    summary.infrastructureFailureCount > summary.attemptedCount
  ) {
    context.addIssue({
      code: "custom",
      message: "C3 summary counts are inconsistent",
    });
  }
});

export type C3FrozenPrehistoryPilotSummary = z.infer<
  typeof c3FrozenPrehistoryPilotSummarySchema
>;

export function buildC3FrozenPrehistoryPilotSummary(input: {
  attempts: readonly CodexCodingEffectAttemptRow[];
  cases: readonly CodexCodingEffectCaseResult[];
  generatedAt: string;
  runId: string;
}): C3FrozenPrehistoryPilotSummary {
  assertExactPairedEvidence(input.attempts, input.cases);
  const casesBytes = serializeCodexCodingEffectCases(input.cases);
  const finalized = input.cases.filter(
    (row) => row.disposition === "finalized",
  );
  const noMemory = finalized.find((row) => row.arm === "no-memory");
  const goodMemory = finalized.find(
    (row) => row.arm === "goodmemory-installed",
  );
  const comparable = noMemory !== undefined &&
    goodMemory !== undefined &&
    noMemory.pairKey === goodMemory.pairKey;

  return parseC3FrozenPrehistoryPilotSummary({
    schemaVersion: 1,
    evidenceClass: "frozen-prehistory-pilot",
    runId: input.runId,
    generatedAt: input.generatedAt,
    attemptedCount: input.attempts.length,
    finalizedCount: finalized.length,
    resolvedCount: finalized.filter((row) => row.resolved).length,
    infrastructureFailureCount: input.attempts.filter(
      (row) => row.disposition === "infrastructure-failure",
    ).length,
    comparablePairs: comparable ? 1 : 0,
    outcome: comparable
      ? classifyOutcome(noMemory.resolved, goodMemory.resolved)
      : "incomparable",
    taskScoringSource: "deterministic-hidden-tests",
    memoryDiagnosticsUsedForTaskScore: false,
    sourceCasesSha256: createHash("sha256").update(casesBytes).digest("hex"),
    publicClaimEligible: false,
  });
}

function assertExactPairedEvidence(
  attempts: readonly CodexCodingEffectAttemptRow[],
  cases: readonly CodexCodingEffectCaseResult[],
): void {
  const armCounts = new Map<string, number>();
  for (const row of cases) {
    armCounts.set(row.arm, (armCounts.get(row.arm) ?? 0) + 1);
  }
  if (
    cases.length !== 2 ||
    armCounts.get("no-memory") !== 1 ||
    armCounts.get("goodmemory-installed") !== 1
  ) {
    throw new Error("C3 summary requires exactly one case per arm");
  }
  if (new Set(cases.map((row) => row.pairKey)).size !== 1) {
    throw new Error("C3 summary cases do not share one pair key");
  }
  const attemptsById = new Map(
    attempts.map((attempt) => [attempt.attemptId, attempt] as const),
  );
  if (attempts.length !== 2 || attemptsById.size !== attempts.length) {
    throw new Error("C3 summary requires exact attempt/case linkage");
  }
  for (const row of cases) {
    const attempt = attemptsById.get(row.attemptId);
    if (
      attempt === undefined ||
      attempt.workKey !== row.workKey ||
      attempt.disposition !== row.disposition ||
      attempt.result.executionFailureStage !== row.executionFailureStage ||
      attempt.result.resolved !== row.resolved ||
      JSON.stringify(attempt.result.taskFailureReasons) !==
        JSON.stringify(row.taskFailureReasons)
    ) {
      throw new Error("C3 summary has inconsistent attempt/case linkage");
    }
  }
}

export function parseC3FrozenPrehistoryPilotSummary(
  value: unknown,
): C3FrozenPrehistoryPilotSummary {
  const result = c3FrozenPrehistoryPilotSummarySchema.safeParse(value);
  if (!result.success) {
    throw new Error("invalid C3 frozen-prehistory summary");
  }
  return result.data;
}

export function serializeC3FrozenPrehistoryPilotSummary(
  summary: C3FrozenPrehistoryPilotSummary,
): string {
  const parsed = parseC3FrozenPrehistoryPilotSummary(summary);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function classifyOutcome(
  noMemoryResolved: boolean,
  goodMemoryResolved: boolean,
): Exclude<C3FrozenPrehistoryPilotSummary["outcome"], "incomparable"> {
  if (noMemoryResolved === goodMemoryResolved) {
    return noMemoryResolved ? "tie-both-pass" : "tie-both-fail";
  }
  return goodMemoryResolved ? "rescue" : "regression";
}
