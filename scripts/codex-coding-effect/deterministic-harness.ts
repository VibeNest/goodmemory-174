import { lstat, mkdir, rmdir, writeFile } from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  openCodexCodingEffectAttemptLedger,
  serializeAttemptRow,
} from "./attempts";
import type {
  CodexCodingEffectAttemptLedger,
  CodexCodingEffectAttemptRow,
} from "./attempts";
import type { CodexCodingEffectArm } from "./contracts";
import { runCodexProcess } from "./codex-runner";
import {
  assertUniqueWorkspacePaths,
  prepareIsolatedWorkspace,
  releaseIsolatedWorkspace,
} from "./workspace";
import {
  createCodexCodingEffectLogger,
} from "./logging";
import type {
  CodexCodingEffectLogEvent,
} from "./logging";
import {
  applyWorkspacePatch,
  captureWorkspacePatch,
} from "./patch";
import {
  buildCodexCodingEffectDeterministicSummary,
  serializeCodexCodingEffectCases,
  serializeCodexCodingEffectSummary,
} from "./reporting";
import type {
  CodexCodingEffectCaseResult,
  CodexCodingEffectDeterministicSummary,
} from "./reporting";
import {
  runEvaluatorTest,
  scoreCodexStage,
} from "./test-scoring";
import {
  loadCodexCodingEffectStageEvidence,
  persistCodexCodingEffectStageEvidence,
} from "./stage-evidence";
import type {
  CodexCodingEffectStageEvidence,
} from "./stage-evidence";

export interface DeterministicSmokeArm {
  arm: "no-memory" | "goodmemory-installed";
  codexArgs: readonly string[];
  codexExecutable: string;
}

export interface CodexCodingEffectDeterministicSmokeResult {
  cases: CodexCodingEffectCaseResult[];
  casesBytes: string;
  summary: CodexCodingEffectDeterministicSummary;
  summaryBytes: string;
}

export async function runCodexCodingEffectDeterministicSmoke(input: {
  arms: readonly DeterministicSmokeArm[];
  episodeId: string;
  evaluatorRoot: string;
  expectedCommit: string;
  failToPassCommand: readonly string[];
  generatedAt: string;
  onLog?: (event: CodexCodingEffectLogEvent) => void;
  outputDirectory: string;
  passToPassCommand: readonly string[];
  repetition: number;
  resume?: boolean;
  runId: string;
  seed: number;
  sourceRepository: string;
  stageId: string;
  stageTimeoutMs: number;
  testTimeoutMs: number;
  testHooks?: {
    afterStageEvidencePersisted?: (
      evidence: CodexCodingEffectStageEvidence,
    ) => void | Promise<void>;
  };
  workspaceRoot: string;
}): Promise<CodexCodingEffectDeterministicSmokeResult> {
  assertDeterministicSmokeArms(input.arms);
  const outputDirectory = resolve(input.outputDirectory);
  const workspaceRoot = resolve(input.workspaceRoot);
  const pairKey = [
    input.episodeId,
    input.stageId,
    input.seed,
    input.repetition,
  ].join("/");
  const workKeys = input.arms.map((arm) =>
    createWorkKey(input, arm.arm)
  );
  const agentWorkspacePaths = input.arms.map((arm) =>
    join(
      workspaceRoot,
      input.episodeId,
      String(input.seed),
      arm.arm,
      input.stageId,
    )
  );
  const evaluationWorkspacePaths = agentWorkspacePaths.map((path) =>
    `${path}-evaluation`
  );
  const workspacePaths = [
    ...agentWorkspacePaths,
    ...evaluationWorkspacePaths,
  ];
  assertUniqueWorkspacePaths(workspacePaths);
  const preflightLogger = createCodexCodingEffectLogger({
    arm: "no-memory",
    attemptId: `${workKeys[0]}#attempt-1`,
    episodeId: input.episodeId,
    repetition: input.repetition,
    runId: input.runId,
    seed: input.seed,
    stageId: input.stageId,
    traceId: `${input.runId}:${pairKey}`,
  }, input.onLog ?? (() => undefined), () => input.generatedAt);
  preflightLogger("run_preflight_started", {
    armCount: input.arms.length,
    networkMode: "disabled",
  });
  assertPathsDisjoint("output directory", outputDirectory, "workspace root", workspaceRoot);
  assertPathsDisjoint(
    "output directory",
    outputDirectory,
    "source repository",
    input.sourceRepository,
  );
  assertPathsDisjoint(
    "output directory",
    outputDirectory,
    "evaluator root",
    input.evaluatorRoot,
  );
  assertPathsDisjoint(
    "workspace root",
    workspaceRoot,
    "source repository",
    input.sourceRepository,
  );
  assertPathsDisjoint(
    "workspace root",
    workspaceRoot,
    "evaluator root",
    input.evaluatorRoot,
  );
  assertPathsDisjoint(
    "source repository",
    input.sourceRepository,
    "evaluator root",
    input.evaluatorRoot,
  );
  if (await pathExists(workspaceRoot)) {
    throw new Error(`workspace root already exists: ${workspaceRoot}`);
  }
  const stageEvidenceDirectory = join(outputDirectory, "stage-evidence");
  const casesPath = join(outputDirectory, "cases.jsonl");
  const summaryPath = join(outputDirectory, "summary.json");
  if (
    !input.resume &&
    (
      await pathExists(stageEvidenceDirectory) ||
      await pathExists(casesPath) ||
      await pathExists(summaryPath)
    )
  ) {
    throw new Error("fresh run output already contains stage evidence or reports");
  }
  await mkdir(outputDirectory, { recursive: true });

  const identity = {
    arms: input.arms.map((arm) => arm.arm),
    episodeId: input.episodeId,
    evidenceClass: "deterministic-smoke",
    expectedCommit: input.expectedCommit,
    generatedAt: input.generatedAt,
    repetition: input.repetition,
    runId: input.runId,
    schemaVersion: 1,
    seed: input.seed,
    stageId: input.stageId,
  };
  const ledger = await openCodexCodingEffectAttemptLedger({
    directory: outputDirectory,
    identity,
    resume: input.resume ?? false,
    selectedWorkKeys: workKeys,
  });
  const cases = await reconcileStageEvidence({
    evidence: await loadCodexCodingEffectStageEvidence(
      stageEvidenceDirectory,
    ),
    ledger,
    selectedWorkKeys: new Set(workKeys),
  });
  preflightLogger("run_preflight_completed", {
    selectedWorkCount: workKeys.length,
  });
  preflightLogger("pair_started", { pairKey });

  try {
    for (const [index, arm] of input.arms.entries()) {
      const workKey = workKeys[index];
      const workspace = agentWorkspacePaths[index];
      const evaluationWorkspace = evaluationWorkspacePaths[index];
      if (
        workKey === undefined ||
        workspace === undefined ||
        evaluationWorkspace === undefined
      ) {
        throw new Error("deterministic arm selection is inconsistent");
      }
      if (!ledger.shouldRun(workKey)) {
        continue;
      }
      const attemptId = ledger.nextAttemptId(workKey);
      const logger = createCodexCodingEffectLogger({
        arm: arm.arm,
        attemptId,
        episodeId: input.episodeId,
        repetition: input.repetition,
        runId: input.runId,
        seed: input.seed,
        stageId: input.stageId,
        traceId: `${input.runId}:${workKey}`,
      }, input.onLog ?? (() => undefined), () => input.generatedAt);
      let agentPrepared = false;
      let evaluationPrepared = false;
      try {
        await prepareIsolatedWorkspace({
          destination: workspace,
          expectedCommit: input.expectedCommit,
          logger,
          sourceRepository: input.sourceRepository,
        });
        agentPrepared = true;
        const codex = await runCodexProcess({
          args: arm.codexArgs,
          cwd: workspace,
          executable: arm.codexExecutable,
          logger,
          timeoutMs: input.stageTimeoutMs,
        });
        const patch = await captureWorkspacePatch({
          baseCommit: input.expectedCommit,
          forbiddenPaths: ["evaluator"],
          logger,
          workspace,
        });
        await prepareIsolatedWorkspace({
          destination: evaluationWorkspace,
          expectedCommit: input.expectedCommit,
          logger,
          sourceRepository: input.sourceRepository,
        });
        evaluationPrepared = true;
        await applyWorkspacePatch({
          logger,
          patch,
          workspace: evaluationWorkspace,
        });
        const failToPass = await runEvaluatorTest({
          command: input.failToPassCommand,
          cwd: evaluationWorkspace,
          evaluatorRoot: input.evaluatorRoot,
          kind: "fail-to-pass",
          logger,
          timeoutMs: input.testTimeoutMs,
        });
        const passToPass = await runEvaluatorTest({
          command: input.passToPassCommand,
          cwd: evaluationWorkspace,
          evaluatorRoot: input.evaluatorRoot,
          kind: "pass-to-pass",
          logger,
          timeoutMs: input.testTimeoutMs,
        });
        const score = scoreCodexStage({
          codex,
          failToPass,
          passToPass,
          patch,
        });
        const attempt: CodexCodingEffectAttemptRow = {
          attemptId,
          disposition: score.disposition,
          result: {
            executionFailureStage: score.executionFailureStage,
            resolved: score.resolved,
            taskFailureReasons: score.taskFailureReasons,
          },
          schemaVersion: 1,
          workKey,
        };
        const caseResult: CodexCodingEffectCaseResult = {
          arm: arm.arm,
          attemptId,
          changedFiles: patch.changedFiles,
          codexStatus: codex.status,
          disposition: score.disposition,
          episodeId: input.episodeId,
          executionFailureStage: score.executionFailureStage,
          failToPassStatus: failToPass.status,
          forbiddenFiles: patch.forbiddenFiles,
          pairKey,
          passToPassStatus: passToPass.status,
          patchSha256: patch.sha256,
          repetition: input.repetition,
          resolved: score.resolved,
          schemaVersion: 1,
          seed: input.seed,
          stageId: input.stageId,
          taskFailureReasons: score.taskFailureReasons,
          workKey,
        };
        const evidence: CodexCodingEffectStageEvidence = {
          attempt,
          caseResult,
          codexStderr: codex.stderr,
          codexStdout: codex.stdout,
          failToPassStderr: failToPass.stderr,
          failToPassStdout: failToPass.stdout,
          passToPassStderr: passToPass.stderr,
          passToPassStdout: passToPass.stdout,
          patchDiff: patch.diff,
          schemaVersion: 1,
        };
        await persistCodexCodingEffectStageEvidence(
          stageEvidenceDirectory,
          evidence,
        );
        await input.testHooks?.afterStageEvidencePersisted?.(evidence);
        await ledger.appendAttempt(attempt);
        cases.push(caseResult);
        if (score.disposition === "infrastructure-failure") {
          logger("attempt_failed", {
            attemptId,
            executionFailureStage: score.executionFailureStage,
            workKey,
          });
        } else {
          logger("stage_finalized", {
            attemptId,
            resolved: score.resolved,
            workKey,
          });
        }
      } finally {
        try {
          if (evaluationPrepared) {
            await releaseIsolatedWorkspace({
              path: evaluationWorkspace,
              sourceRepository: input.sourceRepository,
            });
          }
        } finally {
          if (agentPrepared) {
            await releaseIsolatedWorkspace({
              path: workspace,
              sourceRepository: input.sourceRepository,
            });
          }
        }
      }
    }

    const finalLogger = createCodexCodingEffectLogger({
      arm: "goodmemory-installed",
      attemptId: ledger.attempts.at(-1)?.attemptId ?? "not-attempted",
      episodeId: input.episodeId,
      repetition: input.repetition,
      runId: input.runId,
      seed: input.seed,
      stageId: input.stageId,
      traceId: `${input.runId}:${pairKey}`,
    }, input.onLog ?? (() => undefined), () => input.generatedAt);
    finalLogger("pair_completed", {
      pairKey,
      resolvedCount: cases.filter((row) => row.resolved).length,
    });
    const casesBytes = serializeCodexCodingEffectCases(cases);
    const summary = buildCodexCodingEffectDeterministicSummary({
      arms: input.arms.map((arm) => arm.arm),
      attempts: ledger.attempts,
      cases,
      generatedAt: input.generatedAt,
      runId: input.runId,
    });
    const summaryBytes = serializeCodexCodingEffectSummary(summary);
    await writeFile(casesPath, casesBytes, "utf8");
    await writeFile(summaryPath, summaryBytes, "utf8");
    finalLogger("run_aggregated", {
      attemptedCount: summary.attemptedCount,
      finalizedCount: summary.finalizedCount,
      resolvedCount: summary.resolvedCount,
      sourceCasesSha256: summary.sourceCasesSha256,
    });
    return { cases, casesBytes, summary, summaryBytes };
  } finally {
    await removeEmptyWorkspacePaths(workspacePaths, workspaceRoot);
  }
}

async function reconcileStageEvidence(input: {
  evidence: readonly CodexCodingEffectStageEvidence[];
  ledger: CodexCodingEffectAttemptLedger;
  selectedWorkKeys: ReadonlySet<string>;
}): Promise<CodexCodingEffectCaseResult[]> {
  const evidenceByAttemptId = new Map(
    input.evidence.map((row) => [row.attempt.attemptId, row]),
  );
  const attemptsById = new Map(
    input.ledger.attempts.map((row) => [row.attemptId, row]),
  );

  for (const evidence of input.evidence) {
    if (!input.selectedWorkKeys.has(evidence.attempt.workKey)) {
      throw new Error(
        `stage evidence is outside selected scope: ${evidence.attempt.workKey}`,
      );
    }
    const existing = attemptsById.get(evidence.attempt.attemptId);
    if (existing === undefined) {
      await input.ledger.appendAttempt(evidence.attempt);
      attemptsById.set(evidence.attempt.attemptId, evidence.attempt);
    } else if (
      serializeAttemptRow(existing) !==
      serializeAttemptRow(evidence.attempt)
    ) {
      throw new Error(
        `stage evidence does not match attempt ${evidence.attempt.attemptId}`,
      );
    }
  }

  return input.ledger.attempts.map((attempt) => {
    const evidence = evidenceByAttemptId.get(attempt.attemptId);
    if (evidence === undefined) {
      throw new Error(`attempt is missing stage evidence ${attempt.attemptId}`);
    }
    return evidence.caseResult;
  });
}

function assertDeterministicSmokeArms(
  arms: readonly DeterministicSmokeArm[],
): void {
  const selected = arms.map((arm) => arm.arm);
  if (
    selected.length !== 2 ||
    selected[0] !== "no-memory" ||
    selected[1] !== "goodmemory-installed"
  ) {
    throw new Error(
      "deterministic smoke requires ordered no-memory and goodmemory-installed arms",
    );
  }
}

function createWorkKey(
  input: {
    episodeId: string;
    repetition: number;
    seed: number;
    stageId: string;
  },
  arm: CodexCodingEffectArm,
): string {
  return [
    input.episodeId,
    input.stageId,
    arm,
    input.seed,
    input.repetition,
  ].join("/");
}

function assertPathsDisjoint(
  firstLabel: string,
  firstPath: string,
  secondLabel: string,
  secondPath: string,
): void {
  if (
    pathIsInsideOrEqual(firstPath, secondPath) ||
    pathIsInsideOrEqual(secondPath, firstPath)
  ) {
    throw new Error(`${firstLabel} and ${secondLabel} must be disjoint`);
  }
}

function pathIsInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function removeEmptyWorkspacePaths(
  workspacePaths: readonly string[],
  workspaceRoot: string,
): Promise<void> {
  for (const workspacePath of workspacePaths) {
    let current = workspacePath;
    while (pathIsInsideOrEqual(workspaceRoot, current)) {
      try {
        await rmdir(current);
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) {
          // The Git-owned worktree removal already removed this path.
        } else if (
          hasErrorCode(error, "ENOTEMPTY") ||
          hasErrorCode(error, "EEXIST")
        ) {
          break;
        } else {
          throw error;
        }
      }
      if (current === workspaceRoot) {
        break;
      }
      current = dirname(current);
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
