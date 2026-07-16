import { join } from "node:path";

import type {
  CodexCodingEffectAttemptLedger,
  CodexCodingEffectAttemptRow,
} from "./attempts";
import type { NoMemoryRuntimeAudit } from "./c3-arms";
import type { C3EvaluatedArmExecution } from "./c3-evaluator";
import type { C3InstalledHostCanary } from "./c3-host-canary";
import { persistC3PilotStageEvidence } from "./c3-stage-evidence";
import type { C3ArmStageEvidence } from "./c3-stage-evidence";
import type { CodexCodingEffectLogger } from "./logging";
import type { CodexCodingEffectCaseResult } from "./reporting";
import type { CodexStageScore } from "./test-scoring";

export async function finalizeC3Arm(input: {
  arm: "goodmemory-installed" | "no-memory";
  armEvidence: C3ArmStageEvidence;
  canary?: C3InstalledHostCanary;
  caseResults: CodexCodingEffectCaseResult[];
  episodeId: string;
  evaluated: C3EvaluatedArmExecution;
  forcedFailureStage?: string;
  ledger: CodexCodingEffectAttemptLedger;
  logger: CodexCodingEffectLogger;
  outputDirectory: string;
  pairKey: string;
  repetition: number;
  seed: number;
  stageId: string;
  workKey: string;
}): Promise<void> {
  const score = input.forcedFailureStage !== undefined
    ? infrastructureFailureScore(input.forcedFailureStage)
    : input.canary !== undefined && !input.canary.passed
    ? failedCanaryScore(input.canary)
    : input.evaluated.score;
  const attemptId = input.ledger.nextAttemptId(input.workKey);
  const attempt: CodexCodingEffectAttemptRow = {
    attemptId,
    disposition: score.disposition,
    result: {
      executionFailureStage: score.executionFailureStage,
      resolved: score.resolved,
      taskFailureReasons: score.taskFailureReasons,
    },
    schemaVersion: 1,
    workKey: input.workKey,
  };
  const caseResult: CodexCodingEffectCaseResult = {
    arm: input.arm,
    attemptId,
    changedFiles: input.evaluated.patch.changedFiles,
    codexStatus: input.evaluated.codex.status,
    disposition: score.disposition,
    episodeId: input.episodeId,
    executionFailureStage: score.executionFailureStage,
    failToPassStatus: input.evaluated.failToPass.status,
    forbiddenFiles: input.evaluated.patch.forbiddenFiles,
    pairKey: input.pairKey,
    passToPassStatus: input.evaluated.passToPass.status,
    patchSha256: input.evaluated.patch.sha256,
    repetition: input.repetition,
    resolved: score.resolved,
    schemaVersion: 1,
    seed: input.seed,
    stageId: input.stageId,
    taskFailureReasons: score.taskFailureReasons,
    workKey: input.workKey,
  };
  await persistC3PilotStageEvidence(
    join(input.outputDirectory, "stage-evidence"),
    {
      armEvidence: input.armEvidence,
      attempt,
      caseResult,
      codexStderr: input.evaluated.codex.stderr,
      codexStdout: "",
      failToPassStderr: input.evaluated.failToPass.stderr,
      failToPassStdout: input.evaluated.failToPass.stdout,
      passToPassStderr: input.evaluated.passToPass.stderr,
      passToPassStdout: input.evaluated.passToPass.stdout,
      patchDiff: input.evaluated.patch.diff,
      schemaVersion: 1,
    },
  );
  await input.ledger.appendAttempt(attempt);
  input.caseResults.push(caseResult);
  if (score.disposition === "infrastructure-failure") {
    input.logger("attempt_failed", {
      attemptId,
      executionFailureStage: score.executionFailureStage,
      workKey: input.workKey,
    });
  } else {
    input.logger("stage_finalized", {
      attemptId,
      resolved: score.resolved,
      workKey: input.workKey,
    });
  }
}

export function requireStrictNoMemoryAbsenceAudit(
  audit: NoMemoryRuntimeAudit,
): Extract<
  C3ArmStageEvidence,
  { arm: "no-memory" }
>["absenceAudit"] {
  if (
    audit.goodMemoryFileCount !== 0 ||
    audit.hookConfigPresent ||
    audit.mcpConfigPresent ||
    !audit.passed ||
    audit.preexistingSessionCount !== 0 ||
    audit.reasons.length > 0
  ) {
    throw new Error("no-memory runtime does not satisfy the strict absence audit");
  }
  return {
    codexHomeEntryNames: audit.codexHomeEntryNames,
    goodMemoryFileCount: 0,
    hookConfigPresent: false,
    mcpConfigPresent: false,
    passed: true,
    preexistingSessionCount: 0,
    reasons: [],
  };
}

function failedCanaryScore(canary: C3InstalledHostCanary): CodexStageScore {
  if (canary.failureStage === null) {
    throw new Error("failed installed canary must identify its failure stage");
  }
  return infrastructureFailureScore(canary.failureStage);
}

function infrastructureFailureScore(failureStage: string): CodexStageScore {
  return {
    disposition: "infrastructure-failure",
    executionFailureStage: failureStage,
    resolved: false,
    taskFailureReasons: [],
  };
}
