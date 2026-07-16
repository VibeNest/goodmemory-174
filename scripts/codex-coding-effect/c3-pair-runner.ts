import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  openCodexCodingEffectAttemptLedger,
} from "./attempts";
import type {
  CodexCodingEffectAttemptLedger,
  CodexCodingEffectAttemptRow,
} from "./attempts";
import {
  buildC3CodexArgs,
  buildFrozenPrehistoryArmPlans,
  normalizeC3CodexTreatmentArgs,
} from "./c3-arms";
import type {
  NoMemoryRuntimeAudit,
} from "./c3-arms";
import {
  collectC3InstalledHostCanary,
} from "./c3-host-canary";
import type {
  C3InstalledHostCanary,
} from "./c3-host-canary";
import {
  buildC3FrozenPrehistoryPilotSummary,
  serializeC3FrozenPrehistoryPilotSummary,
} from "./c3-reporting";
import type {
  C3FrozenPrehistoryPilotSummary,
} from "./c3-reporting";
import {
  auditC3PermissionIsolation,
  cleanupC3ArmRuntime,
  preflightC3InstalledRecall,
  prepareC3InstalledArm,
  prepareC3NoMemoryArm,
  seedC3InstalledArm,
} from "./c3-runtime";
import type {
  C3InstalledArmRuntime,
  C3NoMemoryArmRuntime,
  C3PermissionIsolationEvidence,
  C3RecallPreflightEvidence,
  C3SeedResult,
} from "./c3-runtime";
import {
  persistC3PilotStageEvidence,
} from "./c3-stage-evidence";
import type {
  C3ArmStageEvidence,
} from "./c3-stage-evidence";
import {
  runCodexProcess,
} from "./codex-runner";
import type {
  CodexRunRequest,
  CodexRunResult,
} from "./codex-runner";
import {
  auditFrozenPrehistoryLeakage,
  loadFrozenPrehistory,
  sealFrozenPrehistory,
} from "./frozen-prehistory";
import type { FrozenPrehistoryLeakageAudit } from "./frozen-prehistory";
import {
  createCodexCodingEffectLogger,
} from "./logging";
import type {
  CodexCodingEffectLogEvent,
  CodexCodingEffectLogger,
} from "./logging";
import {
  applyWorkspacePatch,
  captureWorkspacePatch,
} from "./patch";
import type {
  WorkspacePatch,
} from "./patch";
import {
  serializeCodexCodingEffectCases,
} from "./reporting";
import type {
  CodexCodingEffectCaseResult,
} from "./reporting";
import {
  runEvaluatorTest,
  scoreCodexStage,
} from "./test-scoring";
import type {
  CodexStageScore,
  EvaluatorTestResult,
} from "./test-scoring";
import {
  prepareC3IsolatedClone,
} from "./c3-workspace";
import {
  assertUniqueWorkspacePaths,
  prepareIsolatedWorkspace,
  releaseIsolatedWorkspace,
} from "./workspace";

const OWNERSHIP_MARKER = ".goodmemory-c3-pair-owned";

interface C3PairDependencies {
  auditPermissionIsolation: typeof auditC3PermissionIsolation;
  cleanupRuntime: (
    runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime,
  ) => Promise<void>;
  collectInstalledCanary: (input: {
    codex: CodexRunResult;
    runtime: C3InstalledArmRuntime;
    seed: C3SeedResult;
  }) => Promise<C3InstalledHostCanary>;
  prepareInstalled: typeof prepareC3InstalledArm;
  prepareNoMemory: typeof prepareC3NoMemoryArm;
  preflightInstalledRecall: typeof preflightC3InstalledRecall;
  runCodex: (request: CodexRunRequest) => Promise<CodexRunResult>;
  seedInstalled: typeof seedC3InstalledArm;
}

interface AgentArmExecution {
  codex: CodexRunResult;
  patch: WorkspacePatch;
}

interface EvaluatedArmExecution extends AgentArmExecution {
  failToPass: EvaluatorTestResult;
  passToPass: EvaluatorTestResult;
  score: CodexStageScore;
}

interface EvaluateArmInput {
  agent: AgentArmExecution;
  evaluationWorkspace: string;
  evaluatorEnv: Record<string, string>;
  evaluatorRoot: string;
  expectedCommit: string;
  failToPassCommand: readonly string[];
  logger: CodexCodingEffectLogger;
  passToPassCommand: readonly string[];
  sourceRepository: string;
  testTimeoutMs: number;
}

export interface C3FrozenPrehistoryPairResult {
  cases: CodexCodingEffectCaseResult[];
  casesBytes: string;
  summary: C3FrozenPrehistoryPilotSummary;
  summaryBytes: string;
}

export async function runC3FrozenPrehistoryPair(input: {
  authFile: string;
  bunExecutable: string;
  codexExecutable: string;
  declaredForbiddenSourceSha256: readonly string[];
  dependencies?: Partial<C3PairDependencies>;
  episodeId: string;
  evaluatorRoot: string;
  evaluatorFiles: ReadonlyArray<{ relativePath: string; sha256: string }>;
  expectedCommit: string;
  failToPassCommand: readonly string[];
  forbiddenPaths?: readonly string[];
  forbiddenSources: ReadonlyArray<{ content: string; label: string }>;
  forbiddenStrings: readonly string[];
  generatedAt: string;
  historySourcePath: string;
  historySourceSha256: string;
  materializeEvaluator: () => Promise<void>;
  materializePrehistory: () => Promise<void>;
  model: string;
  npmExecutable: string;
  onLog?: (event: CodexCodingEffectLogEvent) => void;
  outputDirectory: string;
  packageTarball: string;
  passToPassCommand: readonly string[];
  prompt: string;
  reasoningEffort: string;
  repetition: number;
  runId: string;
  runtimeRoot: string;
  seed: number;
  sourceRepository: string;
  stageId: string;
  stageTimeoutMs: number;
  testTimeoutMs: number;
  workspaceRoot: string;
}): Promise<C3FrozenPrehistoryPairResult> {
  const outputDirectory = resolve(input.outputDirectory);
  const runtimeRoot = resolve(input.runtimeRoot);
  const workspaceRoot = resolve(input.workspaceRoot);
  const evaluatorRoot = resolve(input.evaluatorRoot);
  const sourceRepository = resolve(input.sourceRepository);
  validateEvaluatorCommitments(input.evaluatorFiles);
  assertFreshDisjointRoots({
    evaluatorRoot,
    outputDirectory,
    runtimeRoot,
    sourceRepository,
    workspaceRoot,
  });
  await assertAbsent(outputDirectory, "output directory");
  await assertAbsent(runtimeRoot, "runtime root");
  await assertAbsent(workspaceRoot, "workspace root");
  await assertAbsent(evaluatorRoot, "evaluator root");
  await assertAbsent(input.historySourcePath, "frozen prehistory source");
  await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    createOwnedRoot(runtimeRoot),
    createOwnedRoot(workspaceRoot),
  ]);

  const pairKey = [
    input.episodeId,
    input.stageId,
    input.seed,
    input.repetition,
  ].join("/");
  const workKeys = (["no-memory", "goodmemory-installed"] as const).map(
    (arm) => [
      input.episodeId,
      input.stageId,
      arm,
      input.seed,
      input.repetition,
    ].join("/"),
  );
  const [noMemoryPlan, installedPlan] = buildFrozenPrehistoryArmPlans({
    episodeId: input.episodeId,
    repetition: input.repetition,
    resultRoot: join(outputDirectory, "arms"),
    runId: input.runId,
    runtimeRoot,
    seed: input.seed,
    stageId: input.stageId,
    workspaceRoot,
  });
  const evaluationPaths = [
    `${noMemoryPlan.paths.workspace}-evaluation`,
    `${installedPlan.paths.workspace}-evaluation`,
  ] as const;
  assertUniqueWorkspacePaths([
    noMemoryPlan.paths.workspace,
    installedPlan.paths.workspace,
    ...evaluationPaths,
  ]);

  const dependencies: C3PairDependencies = {
    auditPermissionIsolation: auditC3PermissionIsolation,
    cleanupRuntime: cleanupC3ArmRuntime,
    collectInstalledCanary: collectC3InstalledHostCanary,
    prepareInstalled: prepareC3InstalledArm,
    prepareNoMemory: prepareC3NoMemoryArm,
    preflightInstalledRecall: preflightC3InstalledRecall,
    runCodex: runCodexProcess,
    seedInstalled: seedC3InstalledArm,
    ...input.dependencies,
  };
  const preflightLogger = createPairLogger(input, workKeys[0]!, "no-memory");
  preflightLogger("run_preflight_started", {
    armCount: 2,
    evidenceClass: "frozen-prehistory-pilot",
  });

  let noMemoryRuntime: C3NoMemoryArmRuntime | undefined;
  let installedRuntime: C3InstalledArmRuntime | undefined;
  try {
    const promptLeakageAudit = auditPromptLeakage(input);
    await persistLeakageAudit(
      join(outputDirectory, "prompt-leakage-audit.json"),
      promptLeakageAudit,
    );
    if (!promptLeakageAudit.passed) {
      throw new Error("C3 prompt failed the leakage audit");
    }
    await prepareC3IsolatedClone({
      destination: noMemoryPlan.paths.workspace,
      expectedCommit: input.expectedCommit,
      sourceRepository,
    });
    await prepareC3IsolatedClone({
      destination: installedPlan.paths.workspace,
      expectedCommit: input.expectedCommit,
      sourceRepository,
    });

    noMemoryRuntime = await dependencies.prepareNoMemory({
      authFile: input.authFile,
      bunExecutable: input.bunExecutable,
      codexExecutable: input.codexExecutable,
      plan: noMemoryPlan,
    });
    preflightLogger("goodmemory_setup_started", {
      arm: "goodmemory-installed",
      packageTarballSha256: await sha256File(input.packageTarball),
    });
    installedRuntime = await dependencies.prepareInstalled({
      authFile: input.authFile,
      bunExecutable: input.bunExecutable,
      codexExecutable: input.codexExecutable,
      npmExecutable: input.npmExecutable,
      packageTarball: input.packageTarball,
      plan: installedPlan,
    });
    preflightLogger("goodmemory_setup_completed", {
      activationMode: installedRuntime.profile.activationMode,
      packageVersion: installedRuntime.package.version,
      workspaceStatus: installedRuntime.profile.workspaceStatus,
      writebackMode: installedRuntime.profile.writebackMode,
    });
    assertRuntimeInvariants(noMemoryRuntime, installedRuntime);
    await Promise.all([
      assertWorkspaceClean(noMemoryPlan.paths.workspace),
      assertWorkspaceClean(installedPlan.paths.workspace),
    ]);

    const noMemoryArgs = buildC3CodexArgs({
      arm: "no-memory",
      model: input.model,
      prompt: input.prompt,
      reasoningEffort: input.reasoningEffort,
      workspaceRoot: noMemoryPlan.paths.workspace,
    });
    const installedArgs = buildC3CodexArgs({
      arm: "goodmemory-installed",
      model: input.model,
      prompt: input.prompt,
      reasoningEffort: input.reasoningEffort,
      workspaceRoot: installedPlan.paths.workspace,
    });
    assertCodexArgsComparable(
      noMemoryArgs,
      installedArgs,
      noMemoryPlan.paths.workspace,
      installedPlan.paths.workspace,
    );

    const permissionSentinelPath = join(
      outputDirectory,
      "permission-deny-sentinel.txt",
    );
    await writeFile(permissionSentinelPath, "c3 evaluator-owned output\n", {
      encoding: "utf8",
      flag: "wx",
    });
    const noMemoryPermissionIsolation = await dependencies
      .auditPermissionIsolation({
        deniedReadPaths: permissionDeniedReadPaths({
          authFile: input.authFile,
          otherRuntime: installedRuntime,
          packageTarball: input.packageTarball,
          permissionSentinelPath,
          runtime: noMemoryRuntime,
          sourceRepository,
        }),
        phase: "preflight",
        runtime: noMemoryRuntime,
      });
    const installedPreflightPermissionIsolation = await dependencies
      .auditPermissionIsolation({
        deniedReadPaths: permissionDeniedReadPaths({
          authFile: input.authFile,
          otherRuntime: noMemoryRuntime,
          packageTarball: input.packageTarball,
          permissionSentinelPath,
          runtime: installedRuntime,
          sourceRepository,
        }),
        phase: "preflight",
        runtime: installedRuntime,
      });

    const identity = await buildRunIdentity({
      input,
      installedArgs,
      installedPermissionIsolation: installedPreflightPermissionIsolation,
      installedRuntime,
      noMemoryArgs,
      noMemoryPermissionIsolation,
      noMemoryRuntime,
      promptLeakageAudit,
    });
    const ledger = await openCodexCodingEffectAttemptLedger({
      directory: outputDirectory,
      identity,
      resume: false,
      selectedWorkKeys: workKeys,
    });
    preflightLogger("run_preflight_completed", {
      instructionSha256: noMemoryRuntime.instructionSha256,
      selectedWorkCount: workKeys.length,
      snapshotCommit: input.expectedCommit,
    });
    preflightLogger("pair_started", { pairKey });
    const noMemoryLogger = createPairLogger(
      input,
      ledger.nextAttemptId(workKeys[0]!),
      "no-memory",
    );
    const installedLogger = createPairLogger(
      input,
      ledger.nextAttemptId(workKeys[1]!),
      "goodmemory-installed",
    );
    const noMemoryExecution = await runAgentArm({
      args: noMemoryArgs,
      forbiddenPaths: input.forbiddenPaths,
      logger: noMemoryLogger,
      runCodex: dependencies.runCodex,
      runtime: noMemoryRuntime,
      stageTimeoutMs: input.stageTimeoutMs,
    });

    await input.materializePrehistory();
    await assertAbsent(
      evaluatorRoot,
      "evaluator root before both Codex processes exit",
    );
    const sourceArtifact = await loadFrozenPrehistory({
      expectedSha256: input.historySourceSha256,
      path: input.historySourcePath,
    });
    const prehistoryLeakageAudit = auditFrozenPrehistoryLeakage({
      artifact: sourceArtifact,
      declaredForbiddenSourceSha256: input.declaredForbiddenSourceSha256,
      forbiddenSources: input.forbiddenSources,
      forbiddenStrings: input.forbiddenStrings,
    });
    await persistLeakageAudit(
      join(outputDirectory, "prehistory-leakage-audit.json"),
      prehistoryLeakageAudit,
    );
    if (!prehistoryLeakageAudit.passed) {
      throw new Error("C3 frozen prehistory failed the leakage audit");
    }
    const sealedArtifact = await sealFrozenPrehistory({
      artifact: sourceArtifact,
      sealedPath: join(
        outputDirectory,
        "sealed-prehistory",
        basename(input.historySourcePath),
      ),
    });
    const installedPermissionIsolation = await dependencies
      .auditPermissionIsolation({
        deniedReadPaths: [
          ...permissionDeniedReadPaths({
            authFile: input.authFile,
            otherRuntime: noMemoryRuntime,
            packageTarball: input.packageTarball,
            permissionSentinelPath,
            runtime: installedRuntime,
            sourceRepository,
          }),
          { label: "raw-prehistory", path: input.historySourcePath },
          { label: "sealed-prehistory", path: sealedArtifact.path },
        ],
        phase: "pre-seed",
        runtime: installedRuntime,
      });
    const seed = await dependencies.seedInstalled({
      artifact: sealedArtifact,
      declaredForbiddenSourceSha256: input.declaredForbiddenSourceSha256,
      forbiddenSources: input.forbiddenSources,
      forbiddenStrings: input.forbiddenStrings,
      receiptPath: join(outputDirectory, "frozen-prehistory-seed-receipt.json"),
      runtime: installedRuntime,
    });
    let recallPreflight: C3RecallPreflightEvidence;
    try {
      recallPreflight = await dependencies.preflightInstalledRecall({
        prompt: input.prompt,
        runtime: installedRuntime,
        seed,
      });
      await assertWorkspaceClean(installedPlan.paths.workspace);
    } catch (error) {
      recallPreflight = failedRecallPreflight(seed, error);
    }
    const installedPreflightFailureStage = recallPreflight.passed
      ? undefined
      : "goodmemory-recall-preflight";
    const installedExecution = recallPreflight.passed
      ? await runAgentArm({
          args: installedArgs,
          forbiddenPaths: input.forbiddenPaths,
          logger: installedLogger,
          runCodex: dependencies.runCodex,
          runtime: installedRuntime,
          stageTimeoutMs: input.stageTimeoutMs,
        })
      : await skippedAgentArm({
          forbiddenPaths: input.forbiddenPaths,
          reason: recallPreflight.reason,
          runtime: installedRuntime,
        });
    let installedCanary = recallPreflight.passed
      ? await dependencies.collectInstalledCanary({
          codex: installedExecution.codex,
          runtime: installedRuntime,
          seed,
        })
      : null;
    const duplicateThread = duplicateThreadId(
      noMemoryExecution.codex,
      installedExecution.codex,
    );
    if (duplicateThread !== null && installedCanary !== null) {
      installedCanary = failInstalledCanary(
        installedCanary,
        "codex-session-isolation",
        `C3 arms reused Codex thread ${duplicateThread}`,
      );
    }
    const noMemoryThreadId = currentThreadId(noMemoryExecution.codex);
    const noMemoryThreadFailureStage = duplicateThread !== null ||
        (noMemoryExecution.codex.status === "completed" && noMemoryThreadId === null)
      ? "codex-session-isolation"
      : undefined;

    let evaluatorSetupFailure: string | undefined;
    let evaluatorEnv: Record<string, string> = {};
    try {
      await input.materializeEvaluator();
      await verifyEvaluatorFiles(evaluatorRoot, input.evaluatorFiles);
      await assertWorkspaceClean(sourceRepository);
      evaluatorEnv = await createEvaluatorEnvironment({
        bunExecutable: input.bunExecutable,
        outputDirectory,
      });
    } catch (error) {
      evaluatorSetupFailure = errorMessage(error);
    }
    const noMemoryEvaluationInput: EvaluateArmInput = {
      agent: noMemoryExecution,
      evaluationWorkspace: evaluationPaths[0],
      evaluatorEnv,
      evaluatorRoot,
      expectedCommit: input.expectedCommit,
      failToPassCommand: input.failToPassCommand,
      logger: noMemoryLogger,
      passToPassCommand: input.passToPassCommand,
      sourceRepository,
      testTimeoutMs: input.testTimeoutMs,
    };
    const installedEvaluationInput: EvaluateArmInput = {
      agent: installedExecution,
      evaluationWorkspace: evaluationPaths[1],
      evaluatorEnv,
      evaluatorRoot,
      expectedCommit: input.expectedCommit,
      failToPassCommand: input.failToPassCommand,
      logger: installedLogger,
      passToPassCommand: input.passToPassCommand,
      sourceRepository,
      testTimeoutMs: input.testTimeoutMs,
    };
    const noMemoryEvaluated = evaluatorSetupFailure === undefined
      ? await evaluateArmSafely(noMemoryEvaluationInput)
      : evaluatorInfrastructureFailure(
        noMemoryEvaluationInput,
        evaluatorSetupFailure,
      );
    const installedEvaluated = evaluatorSetupFailure === undefined
      ? await evaluateArmSafely(installedEvaluationInput)
      : evaluatorInfrastructureFailure(
        installedEvaluationInput,
        evaluatorSetupFailure,
      );

    const cases: CodexCodingEffectCaseResult[] = [];
    await finalizeArm({
      armEvidence: {
        absenceAudit: strictNoMemoryAbsenceAudit(noMemoryRuntime.isolation),
        arm: "no-memory",
        historyExposure: "none",
        historySourceSha256: sealedArtifact.sourceSha256,
        instructionSha256: noMemoryRuntime.instructionSha256,
        permissionIsolation: noMemoryPermissionIsolation,
        schemaVersion: 1,
        threadId: noMemoryThreadId,
      },
      arm: "no-memory",
      caseResults: cases,
      episodeId: input.episodeId,
      evaluated: noMemoryEvaluated,
      forcedFailureStage: noMemoryThreadFailureStage,
      ledger,
      logger: noMemoryLogger,
      outputDirectory,
      pairKey,
      repetition: input.repetition,
      seed: input.seed,
      stageId: input.stageId,
      workKey: workKeys[0]!,
    });
    await finalizeArm({
      armEvidence: {
        arm: "goodmemory-installed",
        historyExposure: "goodmemory-installed",
        historySourceSha256: sealedArtifact.sourceSha256,
        hostCanary: installedCanary,
        instructionSha256: installedRuntime.instructionSha256,
        package: installedRuntime.package,
        permissionIsolation: installedPermissionIsolation,
        profile: installedRuntime.profile,
        recallPreflight,
        schemaVersion: 1,
        seedReceipt: seed.receipt,
      },
      arm: "goodmemory-installed",
      ...(installedCanary === null ? {} : { canary: installedCanary }),
      caseResults: cases,
      episodeId: input.episodeId,
      evaluated: installedEvaluated,
      forcedFailureStage: installedPreflightFailureStage,
      ledger,
      logger: installedLogger,
      outputDirectory,
      pairKey,
      repetition: input.repetition,
      seed: input.seed,
      stageId: input.stageId,
      workKey: workKeys[1]!,
    });

    const casesBytes = serializeCodexCodingEffectCases(cases);
    const summary = buildC3FrozenPrehistoryPilotSummary({
      attempts: ledger.attempts,
      cases,
      generatedAt: input.generatedAt,
      runId: input.runId,
    });
    const summaryBytes = serializeC3FrozenPrehistoryPilotSummary(summary);
    await Promise.all([
      writeFile(join(outputDirectory, "cases.jsonl"), casesBytes, {
        encoding: "utf8",
        flag: "wx",
      }),
      writeFile(join(outputDirectory, "summary.json"), summaryBytes, {
        encoding: "utf8",
        flag: "wx",
      }),
    ]);
    installedLogger("pair_completed", {
      comparablePairs: summary.comparablePairs,
      outcome: summary.outcome,
      pairKey,
    });
    installedLogger("run_aggregated", {
      attemptedCount: summary.attemptedCount,
      finalizedCount: summary.finalizedCount,
      resolvedCount: summary.resolvedCount,
      sourceCasesSha256: summary.sourceCasesSha256,
    });
    return { cases, casesBytes, summary, summaryBytes };
  } finally {
    await cleanupPair({
      dependencies,
      installedRuntime,
      noMemoryRuntime,
      runtimeRoot,
      workspaceRoot,
    });
  }
}

async function runAgentArm(input: {
  args: readonly string[];
  forbiddenPaths?: readonly string[];
  logger: CodexCodingEffectLogger;
  runCodex: (request: CodexRunRequest) => Promise<CodexRunResult>;
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
  stageTimeoutMs: number;
}): Promise<AgentArmExecution> {
  const codex = await input.runCodex({
    args: input.args,
    cwd: input.runtime.plan.paths.workspace,
    env: input.runtime.env,
    executable: input.runtime.codex.executable,
    logger: input.logger,
    timeoutMs: input.stageTimeoutMs,
  });
  const patch = await captureWorkspacePatch({
    baseCommit: await workspaceCommit(input.runtime.plan.paths.workspace),
    forbiddenPaths: input.forbiddenPaths ?? [".goodmemory", "evaluator"],
    logger: input.logger,
    workspace: input.runtime.plan.paths.workspace,
  });
  return { codex, patch };
}

async function skippedAgentArm(input: {
  forbiddenPaths?: readonly string[];
  reason: string;
  runtime: C3InstalledArmRuntime;
}): Promise<AgentArmExecution> {
  const patch = await captureWorkspacePatch({
    baseCommit: await workspaceCommit(input.runtime.plan.paths.workspace),
    forbiddenPaths: input.forbiddenPaths ?? [".goodmemory", "evaluator"],
    workspace: input.runtime.plan.paths.workspace,
  });
  return {
    codex: {
      durationMs: 0,
      events: [],
      exitCode: null,
      normalized: null,
      status: "not-started",
      stderr: `C3 installed Codex was not launched: ${input.reason}`,
      stdout: "",
      timedOut: false,
    },
    patch,
  };
}

function failedRecallPreflight(
  seed: C3SeedResult,
  error: unknown,
): C3RecallPreflightEvidence {
  return {
    expectedMemoryIds: [...new Set(seed.receipt.writtenMemoryIds)].sort(),
    injectedMemoryIds: [],
    outputSha256: null,
    passed: false,
    reason: errorMessage(error),
    schemaVersion: 1,
    stateSha256: null,
  };
}

async function evaluateArm(
  input: EvaluateArmInput,
): Promise<EvaluatedArmExecution> {
  await prepareIsolatedWorkspace({
    destination: input.evaluationWorkspace,
    expectedCommit: input.expectedCommit,
    logger: input.logger,
    sourceRepository: input.sourceRepository,
  });
  try {
    await applyWorkspacePatch({
      logger: input.logger,
      patch: input.agent.patch,
      workspace: input.evaluationWorkspace,
    });
    const failToPass = await runEvaluatorTest({
      command: input.failToPassCommand,
      cwd: input.evaluationWorkspace,
      env: input.evaluatorEnv,
      evaluatorRoot: input.evaluatorRoot,
      kind: "fail-to-pass",
      logger: input.logger,
      timeoutMs: input.testTimeoutMs,
    });
    const passToPass = await runEvaluatorTest({
      command: input.passToPassCommand,
      cwd: input.evaluationWorkspace,
      env: input.evaluatorEnv,
      evaluatorRoot: input.evaluatorRoot,
      kind: "pass-to-pass",
      logger: input.logger,
      timeoutMs: input.testTimeoutMs,
    });
    return {
      ...input.agent,
      failToPass,
      passToPass,
      score: scoreCodexStage({
        codex: input.agent.codex,
        failToPass,
        passToPass,
        patch: input.agent.patch,
      }),
    };
  } finally {
    await releaseIsolatedWorkspace({
      path: input.evaluationWorkspace,
      sourceRepository: input.sourceRepository,
    });
  }
}

async function evaluateArmSafely(
  input: EvaluateArmInput,
): Promise<EvaluatedArmExecution> {
  try {
    return await evaluateArm(input);
  } catch (error) {
    return evaluatorInfrastructureFailure(input, errorMessage(error));
  }
}

function evaluatorInfrastructureFailure(
  input: EvaluateArmInput,
  reason: string,
): EvaluatedArmExecution {
  const failure = (
    kind: "fail-to-pass" | "pass-to-pass",
    command: readonly string[],
  ): EvaluatorTestResult => ({
    command: [...command],
    durationMs: 0,
    exitCode: null,
    kind,
    status: "infrastructure-failure",
    stderr: `C3 evaluator infrastructure failed: ${reason}`,
    stdout: "",
  });
  const failToPass = failure("fail-to-pass", input.failToPassCommand);
  const passToPass = failure("pass-to-pass", input.passToPassCommand);
  return {
    ...input.agent,
    failToPass,
    passToPass,
    score: scoreCodexStage({
      codex: input.agent.codex,
      failToPass,
      passToPass,
      patch: input.agent.patch,
    }),
  };
}

async function finalizeArm(input: {
  arm: "goodmemory-installed" | "no-memory";
  armEvidence: C3ArmStageEvidence;
  canary?: C3InstalledHostCanary;
  caseResults: CodexCodingEffectCaseResult[];
  episodeId: string;
  evaluated: EvaluatedArmExecution;
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

function strictNoMemoryAbsenceAudit(
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

function auditPromptLeakage(
  input: {
    declaredForbiddenSourceSha256: readonly string[];
    forbiddenSources: ReadonlyArray<{ content: string; label: string }>;
    forbiddenStrings: readonly string[];
    prompt: string;
  },
): FrozenPrehistoryLeakageAudit {
  return auditFrozenPrehistoryLeakage({
    artifact: {
      path: "evaluator-owned-prompt",
      records: [{ id: "prompt", message: input.prompt, role: "user" }],
      sourceBytes: input.prompt,
      sourceSha256: sha256(input.prompt),
    },
    declaredForbiddenSourceSha256: input.declaredForbiddenSourceSha256,
    forbiddenSources: input.forbiddenSources,
    forbiddenStrings: input.forbiddenStrings,
  });
}

async function persistLeakageAudit(
  path: string,
  audit: FrozenPrehistoryLeakageAudit,
): Promise<void> {
  await writeFile(path, `${JSON.stringify({
    algorithmVersion: 1,
    audit,
  }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

async function buildRunIdentity(input: {
  input: {
    authFile: string;
    episodeId: string;
    evaluatorFiles: ReadonlyArray<{ relativePath: string; sha256: string }>;
    expectedCommit: string;
    failToPassCommand: readonly string[];
    generatedAt: string;
    historySourceSha256: string;
    model: string;
    passToPassCommand: readonly string[];
    prompt: string;
    reasoningEffort: string;
    repetition: number;
    runId: string;
    seed: number;
    stageId: string;
    stageTimeoutMs: number;
    testTimeoutMs: number;
  };
  installedArgs: readonly string[];
  installedPermissionIsolation: C3PermissionIsolationEvidence;
  installedRuntime: C3InstalledArmRuntime;
  noMemoryArgs: readonly string[];
  noMemoryPermissionIsolation: C3PermissionIsolationEvidence;
  noMemoryRuntime: C3NoMemoryArmRuntime;
  promptLeakageAudit: FrozenPrehistoryLeakageAudit;
}): Promise<Record<string, unknown>> {
  return {
    armOrder: ["no-memory", "goodmemory-installed"],
    arms: {
      goodmemoryInstalled: {
        argsSha256: sha256(JSON.stringify(input.installedArgs)),
        package: input.installedRuntime.package,
        paths: input.installedRuntime.plan.paths,
        permissionIsolation: input.installedPermissionIsolation,
        permissionProfile: input.installedRuntime.permissionProfile,
        profile: input.installedRuntime.profile,
        scopes: input.installedRuntime.plan.scopes,
      },
      noMemory: {
        absenceAudit: input.noMemoryRuntime.isolation,
        argsSha256: sha256(JSON.stringify(input.noMemoryArgs)),
        paths: input.noMemoryRuntime.plan.paths,
        permissionIsolation: input.noMemoryPermissionIsolation,
        permissionProfile: input.noMemoryRuntime.permissionProfile,
        scopes: input.noMemoryRuntime.plan.scopes,
      },
    },
    authSha256: await sha256File(input.input.authFile),
    codex: {
      executableSha256: input.noMemoryRuntime.codex.executableSha256,
      model: input.input.model,
      permissionProfile: "c3-task",
      reasoningEffort: input.input.reasoningEffort,
      version: input.noMemoryRuntime.codex.version,
    },
    episodeId: input.input.episodeId,
    evaluator: {
      failToPassCommand: input.input.failToPassCommand,
      files: [...input.input.evaluatorFiles].sort((first, second) =>
        first.relativePath.localeCompare(second.relativePath)
      ),
      materialization: "after-both-codex-processes",
      passToPassCommand: input.input.passToPassCommand,
    },
    evidenceClass: "frozen-prehistory-pilot",
    expectedCommit: input.input.expectedCommit,
    generatedAt: input.input.generatedAt,
    historyMaterialization: "after-no-memory-process",
    historySourceSha256: input.input.historySourceSha256,
    instructionSha256: input.noMemoryRuntime.instructionSha256,
    leakageAudit: {
      algorithmVersion: 1,
      promptSourceSha256: input.promptLeakageAudit.sourceSha256,
    },
    promptSha256: sha256(input.input.prompt),
    repetition: input.input.repetition,
    runId: input.input.runId,
    schemaVersion: 1,
    seed: input.input.seed,
    stageId: input.input.stageId,
    stageTimeoutMs: input.input.stageTimeoutMs,
    testTimeoutMs: input.input.testTimeoutMs,
  };
}

function assertRuntimeInvariants(
  noMemory: C3NoMemoryArmRuntime,
  installed: C3InstalledArmRuntime,
): void {
  if (
    noMemory.codex.executableSha256 !== installed.codex.executableSha256 ||
    noMemory.codex.version !== installed.codex.version
  ) {
    throw new Error("C3 arms do not use the same Codex executable and version");
  }
  if (noMemory.instructionSha256 !== installed.instructionSha256) {
    throw new Error("C3 arms do not share identical repository instructions");
  }
}

function assertCodexArgsComparable(
  noMemory: readonly string[],
  installed: readonly string[],
  noMemoryWorkspace: string,
  installedWorkspace: string,
): void {
  const normalize = (args: readonly string[], workspace: string): string[] =>
    normalizeC3CodexTreatmentArgs(args).map((value) =>
      value === workspace ? "<workspace>" : value
    );
  if (
    JSON.stringify(normalize(noMemory, noMemoryWorkspace)) !==
      JSON.stringify(normalize(installed, installedWorkspace))
  ) {
    throw new Error("C3 Codex arms differ outside the frozen treatment surface");
  }
}

function duplicateThreadId(
  noMemory: CodexRunResult,
  installed: CodexRunResult,
): string | null {
  const first = currentThreadId(noMemory);
  const second = currentThreadId(installed);
  return first !== null && first === second ? first : null;
}

function currentThreadId(
  result: CodexRunResult,
): string | null {
  const threadId = result.normalized?.threadId;
  if (threadId === null || threadId === undefined || threadId.length === 0) {
    return null;
  }
  return threadId;
}

function failInstalledCanary(
  canary: C3InstalledHostCanary,
  failureStage: string,
  reason: string,
): C3InstalledHostCanary {
  return {
    ...canary,
    failureStage,
    passed: false,
    reasons: [...new Set([...canary.reasons, reason])],
  };
}

function createPairLogger(
  input: {
    episodeId: string;
    generatedAt: string;
    onLog?: (event: CodexCodingEffectLogEvent) => void;
    repetition: number;
    runId: string;
    seed: number;
    stageId: string;
  },
  attemptId: string,
  arm: "goodmemory-installed" | "no-memory",
): CodexCodingEffectLogger {
  return createCodexCodingEffectLogger({
    arm,
    attemptId,
    episodeId: input.episodeId,
    repetition: input.repetition,
    runId: input.runId,
    seed: input.seed,
    stageId: input.stageId,
    traceId: `${input.runId}:${attemptId}`,
  }, input.onLog ?? (() => undefined), () => input.generatedAt);
}

function permissionDeniedReadPaths(input: {
  authFile: string;
  otherRuntime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
  packageTarball: string;
  permissionSentinelPath: string;
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
  sourceRepository: string;
}): Array<{ label: string; path: string }> {
  const runnerDirectory = dirname(fileURLToPath(import.meta.url));
  return [
    { label: "codex-auth-source", path: input.authFile },
    {
      label: "controlled-evaluator-source",
      path: join(runnerDirectory, "c3-controlled-pilot.ts"),
    },
    {
      label: "current-runtime-config",
      path: join(input.runtime.plan.paths.codexHome, "config.toml"),
    },
    {
      label: "other-arm-runtime-config",
      path: join(input.otherRuntime.plan.paths.codexHome, "config.toml"),
    },
    {
      label: "other-arm-workspace",
      path: join(input.otherRuntime.plan.paths.workspace, ".git", "HEAD"),
    },
    { label: "output-root", path: input.permissionSentinelPath },
    { label: "package-tarball", path: input.packageTarball },
    { label: "runner-source", path: fileURLToPath(import.meta.url) },
    {
      label: "source-repository",
      path: join(input.sourceRepository, ".git", "HEAD"),
    },
  ];
}

async function verifyEvaluatorFiles(
  evaluatorRoot: string,
  commitments: ReadonlyArray<{ relativePath: string; sha256: string }>,
): Promise<void> {
  validateEvaluatorCommitments(commitments);
  const rootInfo = await lstat(evaluatorRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("C3 evaluator root must be a real directory");
  }
  const actualFiles = await collectEvaluatorFiles(evaluatorRoot, evaluatorRoot);
  const expected = [...commitments].sort((first, second) =>
    first.relativePath.localeCompare(second.relativePath)
  );
  if (
    actualFiles.length !== expected.length ||
    actualFiles.some((file, index) => file.relativePath !== expected[index]?.relativePath)
  ) {
    throw new Error("C3 evaluator files do not match the committed manifest");
  }
  for (const [index, file] of actualFiles.entries()) {
    if (await sha256File(file.path) !== expected[index]?.sha256) {
      throw new Error(`C3 evaluator hash mismatch: ${file.relativePath}`);
    }
  }
}

function validateEvaluatorCommitments(
  commitments: ReadonlyArray<{ relativePath: string; sha256: string }>,
): void {
  if (commitments.length === 0) {
    throw new Error("C3 evaluator manifest must not be empty");
  }
  const paths = new Set<string>();
  for (const commitment of commitments) {
    const normalized = commitment.relativePath.replaceAll("\\", "/");
    if (
      normalized !== commitment.relativePath ||
      normalized.length === 0 ||
      isAbsolute(normalized) ||
      normalized.split("/").some((segment) => segment === "" || segment === "..") ||
      !/^[a-f0-9]{64}$/u.test(commitment.sha256) ||
      paths.has(normalized)
    ) {
      throw new Error("invalid C3 evaluator file commitment");
    }
    paths.add(normalized);
  }
}

async function collectEvaluatorFiles(
  root: string,
  directory: string,
): Promise<Array<{ path: string; relativePath: string }>> {
  const files: Array<{ path: string; relativePath: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("C3 evaluator tree must not contain symbolic links");
    }
    if (entry.isDirectory()) {
      files.push(...await collectEvaluatorFiles(root, path));
    } else if (entry.isFile()) {
      files.push({
        path,
        relativePath: relative(root, path).split(sep).join("/"),
      });
    } else {
      throw new Error("C3 evaluator tree contains an unsupported entry");
    }
  }
  return files.sort((first, second) =>
    first.relativePath.localeCompare(second.relativePath)
  );
}

async function assertWorkspaceClean(workspace: string): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", "status", "--porcelain=v1", "--untracked-files=all"],
    cwd: workspace,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`failed to audit C3 workspace status: ${stderr.trim()}`);
  }
  if (stdout.trim().length > 0) {
    throw new Error(`C3 workspace changed before Codex execution: ${stdout.trim()}`);
  }
}

async function createEvaluatorEnvironment(input: {
  bunExecutable: string;
  outputDirectory: string;
}): Promise<Record<string, string>> {
  const home = join(input.outputDirectory, "evaluator-home");
  const temp = join(input.outputDirectory, "evaluator-tmp");
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(temp, { recursive: true }),
  ]);
  return {
    CI: "1",
    HOME: home,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: [...new Set([
      dirname(resolve(input.bunExecutable)),
      "/usr/bin",
      "/bin",
    ])].join(":"),
    TMPDIR: temp,
  };
}

async function cleanupPair(input: {
  dependencies: C3PairDependencies;
  installedRuntime?: C3InstalledArmRuntime;
  noMemoryRuntime?: C3NoMemoryArmRuntime;
  runtimeRoot: string;
  workspaceRoot: string;
}): Promise<void> {
  const errors: string[] = [];
  for (const runtime of [input.installedRuntime, input.noMemoryRuntime]) {
    if (runtime === undefined) {
      continue;
    }
    try {
      await input.dependencies.cleanupRuntime(runtime);
    } catch (error) {
      errors.push(`runtime cleanup failed: ${errorMessage(error)}`);
    }
  }
  if (errors.length === 0) {
    await Promise.all([
      removeOwnedRoot(input.runtimeRoot),
      removeOwnedRoot(input.workspaceRoot),
    ]);
    return;
  }
  throw new Error(errors.join("; "));
}

function assertFreshDisjointRoots(input: {
  evaluatorRoot: string;
  outputDirectory: string;
  runtimeRoot: string;
  sourceRepository: string;
  workspaceRoot: string;
}): void {
  const roots = Object.entries(input);
  for (const [index, [firstLabel, firstPath]] of roots.entries()) {
    for (const [secondLabel, secondPath] of roots.slice(index + 1)) {
      if (pathsOverlap(firstPath, secondPath)) {
        throw new Error(`${firstLabel} and ${secondLabel} must be disjoint`);
      }
    }
  }
}

function pathsOverlap(firstPath: string, secondPath: string): boolean {
  return pathInsideOrEqual(firstPath, secondPath) ||
    pathInsideOrEqual(secondPath, firstPath);
}

function pathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const child = relative(resolve(parentPath), resolve(candidatePath));
  return child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

async function assertAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
    throw new Error(`${label} already exists: ${path}`);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }
}

async function createOwnedRoot(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, OWNERSHIP_MARKER), "c3-pair\n", {
    encoding: "utf8",
    flag: "wx",
  });
}

async function removeOwnedRoot(path: string): Promise<void> {
  const markerPath = join(path, OWNERSHIP_MARKER);
  if (await readFile(markerPath, "utf8") !== "c3-pair\n") {
    throw new Error(`refusing to remove unowned C3 pair root: ${path}`);
  }
  await rm(path, { force: true, recursive: true });
}

async function workspaceCommit(workspace: string): Promise<string> {
  const process = Bun.spawn({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: workspace,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`failed to resolve workspace commit: ${stderr.trim()}`);
  }
  return stdout.trim();
}

async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
