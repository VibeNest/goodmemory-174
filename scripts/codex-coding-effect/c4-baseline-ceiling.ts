import { createHash } from "node:crypto";

import { validateC4ControlledPilotDataset } from "./c4-contracts";
import type { CodexCodingEffectDataset } from "./dataset";

export interface C4BaselineCeilingTarget {
  episodeId: string;
  position: 2 | 3;
  stageId: "stage-2" | "stage-3";
}

export interface C4BaselineStageResult {
  changedFiles: string[];
  codexStatus: string;
  disposition: "finalized" | "infrastructure-failure";
  episodeId: string;
  executionFailureStage: string | null;
  failToPassStatus: string;
  passToPassStatus: string;
  patchSha256: string | null;
  resolved: boolean;
  stageEvidenceSha256: string;
  stageId: string;
  taskFailureReasons: string[];
  threadId: string | null;
}

export interface C4BaselineCeilingRound {
  attemptedCount: number;
  ceilingThreshold: number;
  infrastructureFailureCount: number;
  position: 2 | 3;
  resolvedCount: number;
  stageId: "stage-2" | "stage-3";
}

export interface C4BaselineCeilingReport {
  assetLockSha256: string;
  assetRootSha256: string;
  attemptedCount: number;
  ceilingRisk: boolean | null;
  claimBoundary: "diagnostic-no-memory-ceiling-only";
  codexExecutableSha256: string;
  codexVersion: string;
  datasetId: string;
  decision:
    | "inconclusive"
    | "proceed-to-c5-pilot"
    | "redesign-episodes-before-c5";
  generatedAt: string;
  infrastructureFailureCount: number;
  manifestSha256: string;
  model: string;
  networkAccess: false;
  publicClaimEligible: false;
  reasoningEffort: string;
  resolvedCount: number;
  results: C4BaselineStageResult[];
  rounds: C4BaselineCeilingRound[];
  runIdentitySha256: string;
  runId: string;
  schemaVersion: 1;
  stageEvidenceAggregateSha256: string;
  strategy: {
    earlyCeilingThreshold: 5;
    finalCeilingThreshold: 10;
    firstRound: "stage-3-all-episodes";
    secondRound: "stage-2-all-episodes-if-needed";
    stage1Excluded: true;
  };
}

export interface C4BaselineRunIdentity {
  assetLockSha256: string;
  assetRootSha256: string;
  claimBoundary: "diagnostic-no-memory-ceiling-only";
  codexExecutableSha256: string;
  codexVersion: string;
  datasetId: string;
  generatedAt: string;
  host: "codex";
  manifestSha256: string;
  model: string;
  networkAccess: false;
  publicClaimEligible: false;
  reasoningEffort: string;
  runId: string;
  schemaVersion: 1;
  strategy: "stage-3-first-then-stage-2-if-needed";
}

export function buildC4BaselineCeilingTargets(
  dataset: CodexCodingEffectDataset,
): C4BaselineCeilingTarget[] {
  return validateC4ControlledPilotDataset(dataset).episodes.flatMap((episode) =>
    episode.stages
      .filter((stage) => stage.position === 2 || stage.position === 3)
      .map((stage) => ({
        episodeId: episode.id,
        position: stage.position as 2 | 3,
        stageId: stage.id as "stage-2" | "stage-3",
      }))
  );
}

export function buildC4BaselinePrompt(input: {
  allowedFeedback: readonly string[];
  prompt: string;
}): string {
  const prompt = input.prompt.trim();
  if (input.allowedFeedback.length === 0) {
    return prompt;
  }
  return [
    prompt,
    "",
    "Prior user-visible feedback:",
    ...input.allowedFeedback,
  ].join("\n");
}

export async function runC4AdaptiveBaselineCeiling(input: {
  executeStage: (
    target: C4BaselineCeilingTarget,
  ) => Promise<C4BaselineStageResult>;
  runIdentity: C4BaselineRunIdentity;
  targets: readonly C4BaselineCeilingTarget[];
}): Promise<C4BaselineCeilingReport> {
  const targets = validateTargets(input.targets);
  const runIdentityBytes = serializeC4BaselineRunIdentity(input.runIdentity);
  const results: C4BaselineStageResult[] = [];
  const rounds: C4BaselineCeilingRound[] = [];

  await runRound({
    executeStage: input.executeStage,
    results,
    roundTargets: targets.filter((target) => target.position === 3),
  });
  rounds.push(summarizeRound(results, 3, 5));

  if (infrastructureFailureCount(results) === 0 && resolvedCount(results) < 5) {
    await runRound({
      executeStage: input.executeStage,
      results,
      roundTargets: targets.filter((target) => target.position === 2),
    });
    rounds.push(summarizeRound(results, 2, 10));
  }

  const failures = infrastructureFailureCount(results);
  const resolved = resolvedCount(results);
  const ceilingRisk = failures > 0
    ? null
    : rounds.length === 1
    ? true
    : resolved >= 10;
  const report: C4BaselineCeilingReport = {
    assetLockSha256: input.runIdentity.assetLockSha256,
    assetRootSha256: input.runIdentity.assetRootSha256,
    attemptedCount: results.length,
    ceilingRisk,
    claimBoundary: "diagnostic-no-memory-ceiling-only",
    codexExecutableSha256: input.runIdentity.codexExecutableSha256,
    codexVersion: input.runIdentity.codexVersion,
    datasetId: input.runIdentity.datasetId,
    decision: ceilingRisk === null
      ? "inconclusive"
      : ceilingRisk
      ? "redesign-episodes-before-c5"
      : "proceed-to-c5-pilot",
    generatedAt: input.runIdentity.generatedAt,
    infrastructureFailureCount: failures,
    manifestSha256: input.runIdentity.manifestSha256,
    model: input.runIdentity.model,
    networkAccess: false,
    publicClaimEligible: false,
    reasoningEffort: input.runIdentity.reasoningEffort,
    resolvedCount: resolved,
    results,
    rounds,
    runIdentitySha256: sha256(runIdentityBytes),
    runId: input.runIdentity.runId,
    schemaVersion: 1,
    stageEvidenceAggregateSha256: sha256(JSON.stringify(results)),
    strategy: {
      earlyCeilingThreshold: 5,
      finalCeilingThreshold: 10,
      firstRound: "stage-3-all-episodes",
      secondRound: "stage-2-all-episodes-if-needed",
      stage1Excluded: true,
    },
  };
  assertC4BaselineCeilingReportBindings(report);
  return report;
}

export function assertC4BaselineCeilingReportBindings(
  report: C4BaselineCeilingReport,
): void {
  const runIdentity: C4BaselineRunIdentity = {
    assetLockSha256: report.assetLockSha256,
    assetRootSha256: report.assetRootSha256,
    claimBoundary: "diagnostic-no-memory-ceiling-only",
    codexExecutableSha256: report.codexExecutableSha256,
    codexVersion: report.codexVersion,
    datasetId: report.datasetId,
    generatedAt: report.generatedAt,
    host: "codex",
    manifestSha256: report.manifestSha256,
    model: report.model,
    networkAccess: false,
    publicClaimEligible: false,
    reasoningEffort: report.reasoningEffort,
    runId: report.runId,
    schemaVersion: 1,
    strategy: "stage-3-first-then-stage-2-if-needed",
  };
  if (
    report.runIdentitySha256 !==
      sha256(serializeC4BaselineRunIdentity(runIdentity))
  ) {
    throw new Error("C4 baseline run identity hash is inconsistent");
  }
  if (
    report.stageEvidenceAggregateSha256 !==
      sha256(JSON.stringify(report.results))
  ) {
    throw new Error("C4 baseline stage evidence aggregate is inconsistent");
  }
  if (
    report.attemptedCount !== report.results.length ||
    report.resolvedCount !== resolvedCount(report.results) ||
    report.infrastructureFailureCount !==
      infrastructureFailureCount(report.results)
  ) {
    throw new Error("C4 baseline result counts are inconsistent");
  }
  const stage3Results = report.results.filter((result) =>
    result.stageId === "stage-3"
  );
  const stage2Results = report.results.filter((result) =>
    result.stageId === "stage-2"
  );
  const resultKeys = report.results.map((result) =>
    `${result.episodeId}/${result.stageId}`
  );
  const shouldRunSecondRound =
    infrastructureFailureCount(stage3Results) === 0 &&
    resolvedCount(stage3Results) < 5;
  if (
    stage3Results.length !== 6 ||
    stage2Results.length !== (shouldRunSecondRound ? 6 : 0) ||
    new Set(resultKeys).size !== resultKeys.length ||
    report.results.some((result) =>
      result.stageId !== "stage-2" && result.stageId !== "stage-3"
    )
  ) {
    throw new Error("C4 baseline adaptive rounds are inconsistent");
  }
  const expectedRounds = [
    summarizeRound(report.results, 3, 5),
    ...(shouldRunSecondRound
      ? [summarizeRound(report.results, 2, 10)]
      : []),
  ];
  if (JSON.stringify(report.rounds) !== JSON.stringify(expectedRounds)) {
    throw new Error("C4 baseline round summaries are inconsistent");
  }
  const expectedCeilingRisk = report.infrastructureFailureCount > 0
    ? null
    : expectedRounds.length === 1
    ? true
    : report.resolvedCount >= 10;
  const expectedDecision = expectedCeilingRisk === null
    ? "inconclusive"
    : expectedCeilingRisk
    ? "redesign-episodes-before-c5"
    : "proceed-to-c5-pilot";
  if (
    report.ceilingRisk !== expectedCeilingRisk ||
    report.decision !== expectedDecision
  ) {
    throw new Error("C4 baseline ceiling decision is inconsistent");
  }
}

export function serializeC4BaselineRunIdentity(
  identity: C4BaselineRunIdentity,
): string {
  return `${JSON.stringify(identity, null, 2)}\n`;
}

export function serializeC4BaselineCeilingReport(
  report: C4BaselineCeilingReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function runRound(input: {
  executeStage: (
    target: C4BaselineCeilingTarget,
  ) => Promise<C4BaselineStageResult>;
  results: C4BaselineStageResult[];
  roundTargets: readonly C4BaselineCeilingTarget[];
}): Promise<void> {
  for (const target of input.roundTargets) {
    const result = await input.executeStage(target);
    if (
      result.episodeId !== target.episodeId ||
      result.stageId !== target.stageId
    ) {
      throw new Error("C4 baseline stage result does not match its target");
    }
    input.results.push(result);
  }
}

function summarizeRound(
  results: readonly C4BaselineStageResult[],
  position: 2 | 3,
  ceilingThreshold: number,
): C4BaselineCeilingRound {
  const stageId = `stage-${position}` as const;
  const roundResults = results.filter((result) => result.stageId === stageId);
  return {
    attemptedCount: roundResults.length,
    ceilingThreshold,
    infrastructureFailureCount: infrastructureFailureCount(roundResults),
    position,
    resolvedCount: resolvedCount(roundResults),
    stageId,
  };
}

function validateTargets(
  targets: readonly C4BaselineCeilingTarget[],
): C4BaselineCeilingTarget[] {
  if (targets.length !== 12) {
    throw new Error("C4 baseline requires stage 2 and stage 3 for six episodes");
  }
  const keys = new Set<string>();
  const episodeIds = new Set<string>();
  for (const target of targets) {
    if (target.stageId !== `stage-${target.position}`) {
      throw new Error("C4 baseline target position and stage id must match");
    }
    const key = `${target.episodeId}/${target.stageId}`;
    if (keys.has(key)) {
      throw new Error(`C4 baseline repeats target ${key}`);
    }
    keys.add(key);
    episodeIds.add(target.episodeId);
  }
  if (
    episodeIds.size !== 6 ||
    [...episodeIds].some((episodeId) =>
      !keys.has(`${episodeId}/stage-2`) ||
      !keys.has(`${episodeId}/stage-3`)
    )
  ) {
    throw new Error("C4 baseline targets must cover two stages for six episodes");
  }
  return [...targets].sort((first, second) =>
    first.position === second.position
      ? first.episodeId.localeCompare(second.episodeId)
      : second.position - first.position
  );
}

function infrastructureFailureCount(
  results: readonly C4BaselineStageResult[],
): number {
  return results.filter((result) =>
    result.disposition === "infrastructure-failure"
  ).length;
}

function resolvedCount(results: readonly C4BaselineStageResult[]): number {
  return results.filter((result) => result.resolved).length;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
