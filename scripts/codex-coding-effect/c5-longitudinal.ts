import type {
  C5PilotArm,
  C5PilotCluster,
  C5PilotEpisodeArmRun,
  C5PilotPlan,
  C5PilotStageRun,
} from "./c5-pilot-plan";
import type { NormalizedCodexUsage } from "./codex-events";

export type C5MemoryChannelStatus = "failed" | "not-applicable" | "passed";

export interface C5StageExecution {
  arm: C5PilotArm;
  codexDurationMs: number;
  codexStatus: string;
  codexUsage: NormalizedCodexUsage | null;
  infrastructureFailureStage: string | null;
  memoryObservation: {
    injectedRecordCount: number;
    irrelevantInjection: boolean;
    recalledPriorMemoryCount: number;
    writebackCommitted: boolean;
    writtenMemoryCount: number;
  } | null;
  memoryChannelStatus: C5MemoryChannelStatus;
  stageEvidenceSha256: string;
  stageRunId: string;
  threadId: string | null;
}

export interface C5RecordedStageExecution extends C5StageExecution {
  clusterId: string;
  episodeId: string;
  repetition: 1 | 2;
  stageId: string;
}

export interface C5StageEvaluation {
  arm: C5PilotArm;
  disposition: "finalized" | "infrastructure-failure";
  evaluationEvidenceSha256: string;
  resolved: boolean;
  taskFailureReasons: string[];
}

export interface C5LiveLeakageAuditResult {
  auditSha256: string;
  status: "accepted" | "rejected";
}

export type C5PairOutcome =
  | "incomparable"
  | "regression"
  | "rescue"
  | "shared-fail"
  | "shared-pass";

export interface C5LongitudinalPairResult {
  clusterId: string;
  comparable: boolean;
  episodeId: string;
  evaluations: C5StageEvaluation[];
  incomparabilityReasons: string[];
  leakageAuditSha256: string;
  memoryExpectation: "irrelevant-control" | "none" | "required";
  outcome: C5PairOutcome;
  repetition: 1 | 2;
  stageId: string;
}

export interface C5LongitudinalPilotResult {
  pairs: C5LongitudinalPairResult[];
  stageExecutions: C5RecordedStageExecution[];
}

export async function runC5LongitudinalPilot<Handle>(input: {
  auditLiveLeakage: (context: {
    cluster: C5PilotCluster;
    executions: readonly C5RecordedStageExecution[];
    runs: readonly C5PilotEpisodeArmRun[];
    stage: C5PilotStageRun;
  }) => Promise<C5LiveLeakageAuditResult>;
  cleanupTrajectory: (context: {
    handle: Handle;
    run: C5PilotEpisodeArmRun;
  }) => Promise<void>;
  commitCluster?: (context: { cluster: C5PilotCluster }) => Promise<void>;
  clusterIds?: readonly string[];
  evaluatePair: (context: {
    cluster: C5PilotCluster;
    executions: readonly C5RecordedStageExecution[];
    runs: readonly C5PilotEpisodeArmRun[];
    stage: C5PilotStageRun;
  }) => Promise<C5StageEvaluation[]>;
  executeStage: (context: {
    handle: Handle;
    run: C5PilotEpisodeArmRun;
    stage: C5PilotStageRun;
  }) => Promise<C5StageExecution>;
  plan: C5PilotPlan;
  prepareTrajectory: (context: {
    run: C5PilotEpisodeArmRun;
  }) => Promise<Handle>;
  recordPair?: (pair: C5LongitudinalPairResult) => Promise<void>;
  recordStageExecution?: (
    execution: C5RecordedStageExecution,
  ) => Promise<void>;
  restoreCredential: (context: {
    handle: Handle;
    run: C5PilotEpisodeArmRun;
    stage: C5PilotStageRun;
  }) => Promise<void>;
  revokeCredential: (context: {
    handle: Handle;
    run: C5PilotEpisodeArmRun;
    stage: C5PilotStageRun;
  }) => Promise<void>;
}): Promise<C5LongitudinalPilotResult> {
  assertC5CoordinatorPlan(input.plan);
  const seenThreadIds = new Set<string>();
  const stageExecutions: C5RecordedStageExecution[] = [];
  const pairs: C5LongitudinalPairResult[] = [];

  for (const cluster of selectedClusters(input.plan, input.clusterIds)) {
    const runs = runsForCluster(input.plan, cluster);
    const prepared: Array<{ handle: Handle; run: C5PilotEpisodeArmRun }> = [];
    const cleanupFailures: unknown[] = [];
    let primaryFailure: unknown;
    try {
      for (const run of runs) {
        prepared.push({
          handle: await input.prepareTrajectory({ run }),
          run,
        });
      }
      for (let stageIndex = 0; stageIndex < runs[0]!.stages.length; stageIndex += 1) {
        const executions: C5RecordedStageExecution[] = [];
        for (const item of prepared) {
          const stage = item.run.stages[stageIndex]!;
          const execution = await input.executeStage({
            handle: item.handle,
            run: item.run,
            stage,
          });
          validateExecution(execution, item.run, stage, seenThreadIds);
          const recorded = {
            ...execution,
            clusterId: cluster.id,
            episodeId: cluster.episodeId,
            repetition: cluster.repetition,
            stageId: stage.stageId,
          };
          executions.push(recorded);
          stageExecutions.push(recorded);
          await input.recordStageExecution?.(recorded);
        }

        for (const [index, item] of prepared.entries()) {
          await input.revokeCredential({
            handle: item.handle,
            run: item.run,
            stage: item.run.stages[stageIndex]!,
          });
          if (executions[index] === undefined) {
            throw new Error("C5 stage execution disappeared before credential revocation");
          }
        }

        const stage = runs[0]!.stages[stageIndex]!;
        const leakage = await input.auditLiveLeakage({
          cluster,
          executions,
          runs,
          stage,
        });
        validateLeakageAudit(leakage);
        const evaluations = await input.evaluatePair({
          cluster,
          executions,
          runs,
          stage,
        });
        validateEvaluations(evaluations);
        const pair = buildPairResult({
          cluster,
          evaluations,
          executions,
          leakage,
          stage,
        });
        pairs.push(pair);
        await input.recordPair?.(pair);

        if (stageIndex < runs[0]!.stages.length - 1) {
          for (const item of prepared) {
            await input.restoreCredential({
              handle: item.handle,
              run: item.run,
              stage: item.run.stages[stageIndex]!,
            });
          }
        }
      }
    } catch (error) {
      primaryFailure = error;
    } finally {
      for (const item of prepared.reverse()) {
        try {
          await input.cleanupTrajectory(item);
        } catch (error) {
          cleanupFailures.push(error);
        }
      }
    }

    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        primaryFailure === undefined
          ? cleanupFailures
          : [primaryFailure, ...cleanupFailures],
        primaryFailure === undefined
          ? "C5 trajectory cleanup failed"
          : "C5 longitudinal execution failed and trajectory cleanup also failed",
      );
    }
    if (primaryFailure !== undefined) {
      throw primaryFailure;
    }
    await input.commitCluster?.({ cluster });
  }

  return { pairs, stageExecutions };
}

function selectedClusters(
  plan: C5PilotPlan,
  clusterIds: readonly string[] | undefined,
): C5PilotCluster[] {
  if (clusterIds === undefined) return plan.clusters;
  const selected = new Set(clusterIds);
  if (selected.size === 0 || selected.size !== clusterIds.length) {
    throw new Error("C5 selected clusters must be non-empty and unique");
  }
  const clusters = plan.clusters.filter((cluster) => selected.has(cluster.id));
  if (clusters.length !== selected.size) {
    throw new Error("C5 selected cluster is outside the frozen pilot plan");
  }
  return clusters;
}

function buildPairResult(input: {
  cluster: C5PilotCluster;
  evaluations: C5StageEvaluation[];
  executions: C5RecordedStageExecution[];
  leakage: C5LiveLeakageAuditResult;
  stage: C5PilotStageRun;
}): C5LongitudinalPairResult {
  const reasons: string[] = [];
  if (input.leakage.status === "rejected") {
    reasons.push("live-leakage-audit-rejected");
  }
  for (const execution of input.executions) {
    if (execution.infrastructureFailureStage !== null) {
      reasons.push(
        `${execution.arm}-infrastructure-${execution.infrastructureFailureStage}`,
      );
    }
  }
  const installed = input.executions.find((execution) =>
    execution.arm === "goodmemory-installed"
  );
  if (
    input.stage.memoryExpectation === "required" &&
    installed?.memoryChannelStatus !== "passed"
  ) {
    reasons.push("goodmemory-required-memory-channel-failed");
  }
  for (const evaluation of input.evaluations) {
    if (evaluation.disposition === "infrastructure-failure") {
      reasons.push(`${evaluation.arm}-evaluator-infrastructure-failure`);
    }
  }
  const incomparabilityReasons = [...new Set(reasons)];
  return {
    clusterId: input.cluster.id,
    comparable: incomparabilityReasons.length === 0,
    episodeId: input.cluster.episodeId,
    evaluations: input.evaluations,
    incomparabilityReasons,
    leakageAuditSha256: input.leakage.auditSha256,
    memoryExpectation: input.stage.memoryExpectation,
    outcome: incomparabilityReasons.length > 0
      ? "incomparable"
      : pairOutcome(input.evaluations),
    repetition: input.cluster.repetition,
    stageId: input.stage.stageId,
  };
}

function pairOutcome(evaluations: readonly C5StageEvaluation[]): C5PairOutcome {
  const noMemory = evaluations.find((item) => item.arm === "no-memory")!;
  const installed = evaluations.find((item) =>
    item.arm === "goodmemory-installed"
  )!;
  if (noMemory.resolved && installed.resolved) {
    return "shared-pass";
  }
  if (!noMemory.resolved && !installed.resolved) {
    return "shared-fail";
  }
  return installed.resolved ? "rescue" : "regression";
}

function runsForCluster(
  plan: C5PilotPlan,
  cluster: C5PilotCluster,
): C5PilotEpisodeArmRun[] {
  const runs = plan.episodeArmRuns.filter((run) => run.clusterId === cluster.id);
  if (
    runs.length !== 2 ||
    runs.map((run) => run.arm).join(",") !== cluster.armOrder.join(",")
  ) {
    throw new Error(`C5 cluster ${cluster.id} does not bind exactly two ordered arms`);
  }
  return runs;
}

function validateExecution(
  execution: C5StageExecution,
  run: C5PilotEpisodeArmRun,
  stage: C5PilotStageRun,
  seenThreadIds: Set<string>,
): void {
  if (execution.arm !== run.arm || execution.stageRunId !== stage.id) {
    throw new Error("C5 stage execution does not match its scheduled work item");
  }
  if (!/^[a-f0-9]{64}$/u.test(execution.stageEvidenceSha256)) {
    throw new Error("C5 stage execution has no bound evidence digest");
  }
  if (
    !Number.isFinite(execution.codexDurationMs) ||
    execution.codexDurationMs < 0 ||
    !validUsage(execution.codexUsage)
  ) {
    throw new Error("C5 stage execution has invalid resource usage");
  }
  if (
    run.arm === "no-memory" &&
    (execution.memoryChannelStatus !== "not-applicable" ||
      execution.memoryObservation !== null)
  ) {
    throw new Error("C5 no-memory execution reported a memory channel");
  }
  if (!validMemoryObservation(execution.memoryObservation)) {
    throw new Error("C5 stage execution has invalid memory observation");
  }
  if (execution.codexStatus === "completed" && execution.threadId === null) {
    throw new Error("C5 completed Codex execution has no thread ID");
  }
  if (execution.threadId !== null) {
    if (seenThreadIds.has(execution.threadId)) {
      throw new Error("C5 Codex thread ID was reused");
    }
    seenThreadIds.add(execution.threadId);
  }
}

function validUsage(usage: C5StageExecution["codexUsage"]): boolean {
  return usage === null || [
    usage.cachedInputTokens,
    usage.inputTokens,
    usage.outputTokens,
  ].every((value) => Number.isSafeInteger(value) && value >= 0);
}

function validMemoryObservation(
  observation: C5StageExecution["memoryObservation"],
): boolean {
  return observation === null || [
    observation.injectedRecordCount,
    observation.recalledPriorMemoryCount,
    observation.writtenMemoryCount,
  ].every((value) => Number.isSafeInteger(value) && value >= 0);
}

function validateEvaluations(evaluations: readonly C5StageEvaluation[]): void {
  if (
    evaluations.length !== 2 ||
    new Set(evaluations.map((evaluation) => evaluation.arm)).size !== 2 ||
    !evaluations.some((evaluation) => evaluation.arm === "no-memory") ||
    !evaluations.some((evaluation) => evaluation.arm === "goodmemory-installed")
  ) {
    throw new Error("C5 pair evaluation must return exactly one result per arm");
  }
  if (evaluations.some((evaluation) =>
    !/^[a-f0-9]{64}$/u.test(evaluation.evaluationEvidenceSha256)
  )) {
    throw new Error("C5 pair evaluation has no bound evidence digest");
  }
}

function validateLeakageAudit(audit: C5LiveLeakageAuditResult): void {
  if (!/^[a-f0-9]{64}$/u.test(audit.auditSha256)) {
    throw new Error("C5 live leakage audit has an invalid SHA-256 binding");
  }
}

function assertC5CoordinatorPlan(plan: C5PilotPlan): void {
  if (
    plan.evidenceClass !== "native-longitudinal-pilot" ||
    plan.publicClaimEligible ||
    plan.counts.episodeArmRuns !== 24 ||
    plan.counts.stageRuns !== 72 ||
    plan.clusters.length !== 12 ||
    plan.episodeArmRuns.length !== 24
  ) {
    throw new Error("C5 longitudinal coordinator requires the frozen pilot plan");
  }
}
