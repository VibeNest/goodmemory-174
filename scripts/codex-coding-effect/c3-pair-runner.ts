import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
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
import {
  buildC3CodexArgs,
  buildFrozenPrehistoryArmPlans,
  normalizeC3CodexTreatmentArgs,
} from "./c3-arms";
import {
  assertC3BaseHealthPassed,
  runC3BaseHealthProbe,
  serializeC3BaseHealthEvidence,
} from "./c3-base-health";
import {
  assertC3WorkspaceClean,
  c3EvaluatorInfrastructureFailure,
  createC3EvaluatorEnvironment,
  evaluateC3ArmSafely,
  validateC3EvaluatorCommitments,
  verifyC3EvaluatorFiles,
} from "./c3-evaluator";
import type {
  C3AgentArmExecution,
  C3EvaluateArmInput,
} from "./c3-evaluator";
import {
  finalizeC3Arm,
  requireStrictNoMemoryAbsenceAudit,
} from "./c3-finalization";
import {
  collectC3InstalledHostCanary,
} from "./c3-host-canary";
import type {
  C3InstalledHostCanary,
} from "./c3-host-canary";
import {
  collectC3HostConfigurationEvidence,
  serializeC3HostConfigurationEvidence,
} from "./c3-host-configuration";
import {
  collectC3HostPreflightEvidence,
  serializeC3HostPreflightEvidence,
} from "./c3-host-preflight";
import {
  C3_BASE_DENIED_READ_LABELS,
  C3_INSTALLED_DENIED_READ_LABELS,
} from "./c3-permission-isolation";
import {
  buildC3FrozenPrehistoryPilotSummary,
  serializeC3FrozenPrehistoryPilotSummary,
} from "./c3-reporting";
import type {
  C3FrozenPrehistoryPilotSummary,
} from "./c3-reporting";
import {
  buildC3AuditEvidence,
  buildC3RunIdentity,
} from "./c3-run-provenance";
import {
  assertC3ArmModelCredentialRemoved,
  auditC3PermissionIsolation,
  buildC3EvaluatorSecurityContract,
  buildC3EvaluatorSecurityEvidence,
  cleanupC3ArmRuntime,
  preflightC3InstalledRecall,
  prepareC3InstalledArm,
  prepareC3NoMemoryArm,
  removeC3ArmModelCredential,
  seedC3InstalledArm,
} from "./c3-runtime";
import type {
  C3InstalledArmRuntime,
  C3NoMemoryArmRuntime,
  C3RecallPreflightEvidence,
  C3SeedResult,
} from "./c3-runtime";
import {
  prepareCodexEvaluatorSandbox,
} from "./evaluator-sandbox";
import {
  assertC3GoodMemorySourceClean,
  collectC3GoodMemorySourceProvenance,
} from "./c3-source-provenance";
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
import { captureWorkspacePatch } from "./patch";
import {
  serializeCodexCodingEffectCases,
} from "./reporting";
import type {
  CodexCodingEffectCaseResult,
} from "./reporting";
import {
  prepareC3IsolatedClone,
} from "./c3-workspace";
import {
  assertUniqueWorkspacePaths,
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
  collectBaseHealth: typeof runC3BaseHealthProbe;
  collectHostConfigurations: typeof collectC3HostConfigurationEvidence;
  collectHostPreflight: typeof collectC3HostPreflightEvidence;
  collectSourceProvenance: typeof collectC3GoodMemorySourceProvenance;
  prepareInstalled: typeof prepareC3InstalledArm;
  prepareNoMemory: typeof prepareC3NoMemoryArm;
  prepareEvaluatorSandbox: typeof prepareCodexEvaluatorSandbox;
  preflightInstalledRecall: typeof preflightC3InstalledRecall;
  removeModelCredential: typeof removeC3ArmModelCredential;
  runCodex: (request: CodexRunRequest) => Promise<CodexRunResult>;
  seedInstalled: typeof seedC3InstalledArm;
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
  expectedFailToPassOutputFragments: readonly string[];
  failToPassSource: string;
  failToPassCommand: readonly string[];
  forbiddenPaths?: readonly string[];
  forbiddenSources: ReadonlyArray<{ content: string; label: string }>;
  forbiddenStrings: readonly string[];
  generatedAt: string;
  goodMemorySourceRoot?: string;
  historySourcePath: string;
  historySourceSha256: string;
  materializeEvaluator: () => Promise<void>;
  materializePrehistory: () => Promise<void>;
  model: string;
  npmExecutable: string;
  onLog?: (event: CodexCodingEffectLogEvent) => void;
  outputDirectory: string;
  packageTarball: string;
  passToPassSource: string;
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
  visibleBaseHealthCommand: readonly string[];
  workspaceRoot: string;
}): Promise<C3FrozenPrehistoryPairResult> {
  const outputDirectory = resolve(input.outputDirectory);
  const runtimeRoot = resolve(input.runtimeRoot);
  const workspaceRoot = resolve(input.workspaceRoot);
  const evaluatorRoot = resolve(input.evaluatorRoot);
  const runnerSourceRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const goodMemorySourceRoot = resolve(
    input.goodMemorySourceRoot ?? runnerSourceRoot,
  );
  const sourceRepository = resolve(input.sourceRepository);
  validateC3EvaluatorCommitments(input.evaluatorFiles);
  assertC3BaseHealthSourcesCommitted(input);
  assertFreshDisjointRoots({
    evaluatorRoot,
    outputDirectory,
    runtimeRoot,
    sourceRepository,
    workspaceRoot,
  });
  assertMutableRootsOutsideRunnerSource({
    evaluatorRoot,
    historySourcePath: resolve(input.historySourcePath),
    outputDirectory,
    runnerSourceRoot,
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
  const evaluatorSandboxRoots = {
    goodmemoryInstalled: join(
      runtimeRoot,
      "evaluator-sandboxes",
      "goodmemory-installed",
    ),
    noMemory: join(
      runtimeRoot,
      "evaluator-sandboxes",
      "no-memory",
    ),
  } as const;
  const evaluationPaths = [
    join(evaluatorSandboxRoots.noMemory, "workspace"),
    join(evaluatorSandboxRoots.goodmemoryInstalled, "workspace"),
  ] as const;
  const baseHealthWorkspace = join(workspaceRoot, "base-health");
  assertUniqueWorkspacePaths([
    baseHealthWorkspace,
    noMemoryPlan.paths.workspace,
    installedPlan.paths.workspace,
    ...evaluationPaths,
  ]);

  const dependencies: C3PairDependencies = {
    auditPermissionIsolation: auditC3PermissionIsolation,
    cleanupRuntime: cleanupC3ArmRuntime,
    collectBaseHealth: runC3BaseHealthProbe,
    collectHostConfigurations: collectC3HostConfigurationEvidence,
    collectHostPreflight: collectC3HostPreflightEvidence,
    collectInstalledCanary: collectC3InstalledHostCanary,
    collectSourceProvenance: collectC3GoodMemorySourceProvenance,
    prepareInstalled: prepareC3InstalledArm,
    prepareNoMemory: prepareC3NoMemoryArm,
    prepareEvaluatorSandbox: prepareCodexEvaluatorSandbox,
    preflightInstalledRecall: preflightC3InstalledRecall,
    removeModelCredential: removeC3ArmModelCredential,
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
    await prepareC3IsolatedClone({
      destination: baseHealthWorkspace,
      expectedCommit: input.expectedCommit,
      sourceRepository,
    });
    const collectedBaseHealth = await dependencies.collectBaseHealth({
      bunExecutable: input.bunExecutable,
      expectedCommit: input.expectedCommit,
      expectedFailToPassOutputFragments:
        input.expectedFailToPassOutputFragments,
      failToPassSource: input.failToPassSource,
      passToPassSource: input.passToPassSource,
      visibleCommand: input.visibleBaseHealthCommand,
      workspace: baseHealthWorkspace,
    });
    const baseHealthBytes = serializeC3BaseHealthEvidence(collectedBaseHealth);
    await writeFile(
      join(outputDirectory, "base-health.json"),
      baseHealthBytes,
      { encoding: "utf8", flag: "wx" },
    );
    const baseHealth = assertC3BaseHealthPassed(collectedBaseHealth);
    await rm(baseHealthWorkspace, { recursive: true });

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
      assertC3WorkspaceClean(noMemoryPlan.paths.workspace),
      assertC3WorkspaceClean(installedPlan.paths.workspace),
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
          goodMemorySourceRoot,
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
          goodMemorySourceRoot,
          otherRuntime: noMemoryRuntime,
          packageTarball: input.packageTarball,
          permissionSentinelPath,
          runtime: installedRuntime,
          sourceRepository,
        }),
        phase: "preflight",
        runtime: installedRuntime,
      });

    const [
      hostConfigurations,
      runnerSourceProvenance,
      sourceProvenance,
    ] = await Promise.all([
      dependencies.collectHostConfigurations({
        installedRuntime,
        noMemoryRuntime,
      }),
      dependencies.collectSourceProvenance(),
      dependencies.collectSourceProvenance({
        repositoryRoot: goodMemorySourceRoot,
      }),
    ]);
    const hostConfigurationsBytes = serializeC3HostConfigurationEvidence(
      hostConfigurations,
    );
    assertC3GoodMemorySourceClean(runnerSourceProvenance.provenance);
    assertC3GoodMemorySourceClean(sourceProvenance.provenance);
    let hostPreflight;
    try {
      hostPreflight = await dependencies.collectHostPreflight({
        baseHealth: {
          goodmemoryInstalled: baseHealth,
          noMemory: baseHealth,
        },
        bunExecutable: input.bunExecutable,
        hostConfigurations,
        hostConfigurationsBytes,
        installedRuntime,
        model: input.model,
        noMemoryRuntime,
        npmExecutable: input.npmExecutable,
        reasoningEffort: input.reasoningEffort,
      });
    } catch (error) {
      const reason = sanitizeFailureReason(errorMessage(error));
      await writeFile(
        join(outputDirectory, "host-preflight-failure.sanitized.json"),
        `${JSON.stringify({
          errorSha256: sha256(reason),
          passed: false,
          reason,
          schemaVersion: 1,
        }, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      throw error;
    }
    const hostPreflightBytes = serializeC3HostPreflightEvidence(hostPreflight);
    const evaluatorSecurityContract = buildC3EvaluatorSecurityContract({
      authFile: input.authFile,
      deniedPaths: evaluatorDeniedPaths({
        authFile: input.authFile,
        goodMemorySourceRoot,
        historySourcePath: input.historySourcePath,
        installedRuntime,
        noMemoryRuntime,
        outputDirectory,
        packageTarball: input.packageTarball,
        runnerSourceRoot,
        sourceRepository,
      }),
      evaluatorRoot,
      goodmemoryInstalled: {
        evaluationWorkspace: evaluationPaths[1],
        runtime: installedRuntime,
        sandboxRoot: evaluatorSandboxRoots.goodmemoryInstalled,
      },
      noMemory: {
        evaluationWorkspace: evaluationPaths[0],
        runtime: noMemoryRuntime,
        sandboxRoot: evaluatorSandboxRoots.noMemory,
      },
    });
    await Promise.all([
      writeFile(
        join(outputDirectory, "host-preflight.sanitized.json"),
        hostPreflightBytes,
        { encoding: "utf8", flag: "wx" },
      ),
      writeFile(
        join(outputDirectory, "host-configurations.sanitized.json"),
        hostConfigurationsBytes,
        { encoding: "utf8", flag: "wx" },
      ),
      writeFile(
        join(outputDirectory, "goodmemory-source-state.json"),
        sourceProvenance.sourceStateArtifactBytes,
        { encoding: "utf8", flag: "wx" },
      ),
      writeFile(
        join(outputDirectory, "runner-source-state.json"),
        runnerSourceProvenance.sourceStateArtifactBytes,
        { encoding: "utf8", flag: "wx" },
      ),
    ]);
    const identity = await buildC3RunIdentity({
      baseHealthBytes,
      evaluatorSecurity: evaluatorSecurityContract,
      goodMemorySource: sourceProvenance.provenance,
      hostConfigurations,
      hostConfigurationsBytes,
      hostPreflight,
      hostPreflightBytes,
      input,
      installedArgs,
      installedPermissionIsolation: installedPreflightPermissionIsolation,
      installedRuntime,
      noMemoryArgs,
      noMemoryPermissionIsolation,
      noMemoryRuntime,
      promptLeakageAudit,
      runnerSource: runnerSourceProvenance.provenance,
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
    const installedDeniedReadPaths = [
      ...permissionDeniedReadPaths({
        authFile: input.authFile,
        goodMemorySourceRoot,
        otherRuntime: noMemoryRuntime,
        packageTarball: input.packageTarball,
        permissionSentinelPath,
        runtime: installedRuntime,
        sourceRepository,
      }),
      { label: "raw-prehistory", path: input.historySourcePath },
      { label: "sealed-prehistory", path: sealedArtifact.path },
    ];
    assertDeniedReadLabels(
      installedDeniedReadPaths,
      C3_INSTALLED_DENIED_READ_LABELS,
    );
    const preSeedInstalledPermissionIsolation = await dependencies
      .auditPermissionIsolation({
        deniedReadPaths: installedDeniedReadPaths,
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
      await assertC3WorkspaceClean(installedPlan.paths.workspace);
    } catch (error) {
      recallPreflight = failedRecallPreflight(seed, error);
    }
    const installedPreflightFailureStage = recallPreflight.passed
      ? undefined
      : "goodmemory-recall-preflight";
    const installedPermissionIsolation = recallPreflight.passed
      ? await dependencies.auditPermissionIsolation({
          deniedReadPaths: installedDeniedReadPaths,
          phase: "pre-launch",
          runtime: installedRuntime,
        })
      : preSeedInstalledPermissionIsolation;
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

    const noMemoryCredentialRevocation =
      await dependencies.removeModelCredential(noMemoryRuntime);
    await assertC3ArmModelCredentialRemoved(noMemoryRuntime);
    const installedCredentialRevocation =
      await dependencies.removeModelCredential(installedRuntime);
    await assertC3ArmModelCredentialRemoved(installedRuntime);

    let evaluatorSetupFailure: string | undefined;
    let evaluatorEnv: Record<string, string> = {};
    let evaluatorSecuritySha256: string | null = null;
    let noMemoryEvaluatorRunProcess: C3EvaluateArmInput["runProcess"];
    let installedEvaluatorRunProcess: C3EvaluateArmInput["runProcess"];
    let noMemoryEvaluatorRoot =
      evaluatorSecurityContract.arms.noMemory.evaluatorRoot.path;
    let installedEvaluatorRoot =
      evaluatorSecurityContract.arms.goodmemoryInstalled.evaluatorRoot.path;
    try {
      await Promise.all([
        assertC3ArmModelCredentialRemoved(noMemoryRuntime),
        assertC3ArmModelCredentialRemoved(installedRuntime),
      ]);
      await input.materializeEvaluator();
      await verifyC3EvaluatorFiles(evaluatorRoot, input.evaluatorFiles);
      await assertC3WorkspaceClean(sourceRepository);
      evaluatorEnv = await createC3EvaluatorEnvironment({
        bunExecutable: input.bunExecutable,
        outputDirectory,
      });
      const evaluatorReadProbePath = join(
        evaluatorRoot,
        input.evaluatorFiles[0]!.relativePath,
      );
      const noMemoryEvaluatorSandbox =
        await dependencies.prepareEvaluatorSandbox({
          authFile: input.authFile,
          baseEnv: evaluatorEnv,
          bunExecutable: input.bunExecutable,
          codexExecutable: noMemoryRuntime.codex.executable,
          copiedAuthRemovedBeforeEvaluator: true,
          evaluationWorkspace: evaluationPaths[0],
          evaluatorReadProbePath,
          evaluatorRoot,
          profileName: "c3-evaluator",
          sandboxRoot: evaluatorSandboxRoots.noMemory,
        });
      const installedEvaluatorSandbox =
        await dependencies.prepareEvaluatorSandbox({
          authFile: input.authFile,
          baseEnv: evaluatorEnv,
          bunExecutable: input.bunExecutable,
          codexExecutable: installedRuntime.codex.executable,
          copiedAuthRemovedBeforeEvaluator: true,
          evaluationWorkspace: evaluationPaths[1],
          evaluatorReadProbePath,
          evaluatorRoot,
          profileName: "c3-evaluator",
          sandboxRoot: evaluatorSandboxRoots.goodmemoryInstalled,
        });
      await Promise.all([
        verifyC3EvaluatorFiles(
          noMemoryEvaluatorSandbox.evaluatorRoot,
          input.evaluatorFiles,
        ),
        verifyC3EvaluatorFiles(
          installedEvaluatorSandbox.evaluatorRoot,
          input.evaluatorFiles,
        ),
      ]);
      const evaluatorSecurityBytes = `${JSON.stringify(
        buildC3EvaluatorSecurityEvidence({
          contract: evaluatorSecurityContract,
          credentialRevocations: {
            goodmemoryInstalled: installedCredentialRevocation,
            noMemory: noMemoryCredentialRevocation,
          },
          sandboxes: {
            goodmemoryInstalled: {
              evidence: installedEvaluatorSandbox.evidence,
              evaluatorRoot: installedEvaluatorSandbox.evaluatorRoot,
            },
            noMemory: {
              evidence: noMemoryEvaluatorSandbox.evidence,
              evaluatorRoot: noMemoryEvaluatorSandbox.evaluatorRoot,
            },
          },
        }),
        null,
        2,
      )}\n`;
      evaluatorSecuritySha256 = sha256(evaluatorSecurityBytes);
      await writeFile(
        join(outputDirectory, "evaluator-security.sanitized.json"),
        evaluatorSecurityBytes,
        { encoding: "utf8", flag: "wx" },
      );
      noMemoryEvaluatorRunProcess = noMemoryEvaluatorSandbox.runProcess;
      installedEvaluatorRunProcess = installedEvaluatorSandbox.runProcess;
      noMemoryEvaluatorRoot = noMemoryEvaluatorSandbox.evaluatorRoot;
      installedEvaluatorRoot = installedEvaluatorSandbox.evaluatorRoot;
    } catch (error) {
      evaluatorSetupFailure = errorMessage(error);
    }
    const noMemoryEvaluationInput: C3EvaluateArmInput = {
      agent: noMemoryExecution,
      evaluationWorkspace: evaluationPaths[0],
      evaluatorEnv,
      evaluatorRoot: noMemoryEvaluatorRoot,
      expectedCommit: input.expectedCommit,
      failToPassCommand: input.failToPassCommand,
      logger: noMemoryLogger,
      passToPassCommand: input.passToPassCommand,
      runProcess: noMemoryEvaluatorRunProcess,
      sourceRepository,
      testTimeoutMs: input.testTimeoutMs,
    };
    const installedEvaluationInput: C3EvaluateArmInput = {
      agent: installedExecution,
      evaluationWorkspace: evaluationPaths[1],
      evaluatorEnv,
      evaluatorRoot: installedEvaluatorRoot,
      expectedCommit: input.expectedCommit,
      failToPassCommand: input.failToPassCommand,
      logger: installedLogger,
      passToPassCommand: input.passToPassCommand,
      runProcess: installedEvaluatorRunProcess,
      sourceRepository,
      testTimeoutMs: input.testTimeoutMs,
    };
    const noMemoryEvaluated = evaluatorSetupFailure === undefined
      ? await evaluateC3ArmSafely(noMemoryEvaluationInput)
      : c3EvaluatorInfrastructureFailure(
        noMemoryEvaluationInput,
        evaluatorSetupFailure,
      );
    const installedEvaluated = evaluatorSetupFailure === undefined
      ? await evaluateC3ArmSafely(installedEvaluationInput)
      : c3EvaluatorInfrastructureFailure(
        installedEvaluationInput,
        evaluatorSetupFailure,
      );

    const cases: CodexCodingEffectCaseResult[] = [];
    await finalizeC3Arm({
      armEvidence: {
        absenceAudit: requireStrictNoMemoryAbsenceAudit(noMemoryRuntime.isolation),
        arm: "no-memory",
        evaluatorSecuritySha256,
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
    await finalizeC3Arm({
      armEvidence: {
        arm: "goodmemory-installed",
        evaluatorSecuritySha256,
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
    const [postRunRunnerSourceProvenance, postRunSourceProvenance] =
      await Promise.all([
        dependencies.collectSourceProvenance(),
        dependencies.collectSourceProvenance({
          repositoryRoot: goodMemorySourceRoot,
        }),
      ]);
    assertC3GoodMemorySourceClean(postRunRunnerSourceProvenance.provenance);
    assertC3GoodMemorySourceClean(postRunSourceProvenance.provenance);
    if (
      postRunSourceProvenance.provenance.sourceStateSha256 !==
        sourceProvenance.provenance.sourceStateSha256 ||
      postRunSourceProvenance.provenance.commit !==
        sourceProvenance.provenance.commit ||
      postRunSourceProvenance.provenance.tree !==
        sourceProvenance.provenance.tree
    ) {
      throw new Error("GoodMemory source changed during the C3 live pair");
    }
    if (
      postRunRunnerSourceProvenance.provenance.sourceStateSha256 !==
        runnerSourceProvenance.provenance.sourceStateSha256 ||
      postRunRunnerSourceProvenance.provenance.commit !==
        runnerSourceProvenance.provenance.commit ||
      postRunRunnerSourceProvenance.provenance.tree !==
        runnerSourceProvenance.provenance.tree
    ) {
      throw new Error("C3 runner source changed during the live pair");
    }
    await Promise.all([
      writeFile(
        join(outputDirectory, "goodmemory-source-state-post-run.json"),
        postRunSourceProvenance.sourceStateArtifactBytes,
        { encoding: "utf8", flag: "wx" },
      ),
      writeFile(
        join(outputDirectory, "runner-source-state-post-run.json"),
        postRunRunnerSourceProvenance.sourceStateArtifactBytes,
        { encoding: "utf8", flag: "wx" },
      ),
    ]);
    const auditEvidenceBytes = `${JSON.stringify(buildC3AuditEvidence({
      evaluatorSecuritySha256,
      identity,
      postRunSource: postRunSourceProvenance.provenance,
      postRunRunnerSource: postRunRunnerSourceProvenance.provenance,
      summary,
      summaryBytes,
    }), null, 2)}\n`;
    await Promise.all([
      writeFile(
        join(outputDirectory, "audit-evidence.sanitized.json"),
        auditEvidenceBytes,
        { encoding: "utf8", flag: "wx" },
      ),
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
}): Promise<C3AgentArmExecution> {
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
}): Promise<C3AgentArmExecution> {
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

function assertC3BaseHealthSourcesCommitted(input: {
  evaluatorFiles: ReadonlyArray<{ relativePath: string; sha256: string }>;
  expectedFailToPassOutputFragments: readonly string[];
  failToPassSource: string;
  passToPassSource: string;
  visibleBaseHealthCommand: readonly string[];
}): void {
  const committedHashes = new Set(input.evaluatorFiles.map((file) => file.sha256));
  const failToPassSha256 = sha256(input.failToPassSource);
  const passToPassSha256 = sha256(input.passToPassSource);
  if (
    failToPassSha256 === passToPassSha256 ||
    !committedHashes.has(failToPassSha256) ||
    !committedHashes.has(passToPassSha256) ||
    input.expectedFailToPassOutputFragments.length === 0 ||
    input.expectedFailToPassOutputFragments.some((fragment) =>
      fragment.trim().length === 0
    ) ||
    input.visibleBaseHealthCommand.length === 0
  ) {
    throw new Error(
      "C3 live base-health sources do not match the frozen evaluator commitments",
    );
  }
}

function sanitizeFailureReason(reason: string): string {
  return reason.replace(
    /\/(?:Users|home|private|tmp|var\/folders)\/[^\s"'`,;()]+/gu,
    "<host-path>",
  );
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
  goodMemorySourceRoot: string;
  otherRuntime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
  packageTarball: string;
  permissionSentinelPath: string;
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
  sourceRepository: string;
}): Array<{ label: string; path: string }> {
  const runnerDirectory = dirname(fileURLToPath(import.meta.url));
  const paths = [
    { label: "codex-auth-source", path: input.authFile },
    {
      label: "goodmemory-source-package",
      path: join(input.goodMemorySourceRoot, "package.json"),
    },
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
  assertDeniedReadLabels(paths, C3_BASE_DENIED_READ_LABELS);
  return paths;
}

function evaluatorDeniedPaths(input: {
  authFile: string;
  goodMemorySourceRoot: string;
  historySourcePath: string;
  installedRuntime: C3InstalledArmRuntime;
  noMemoryRuntime: C3NoMemoryArmRuntime;
  outputDirectory: string;
  packageTarball: string;
  runnerSourceRoot: string;
  sourceRepository: string;
}): Array<{ label: string; path: string }> {
  return [
    { label: "codex-auth-source", path: input.authFile },
    {
      label: "goodmemory-installed-runtime",
      path: input.installedRuntime.plan.paths.armRoot,
    },
    {
      label: "goodmemory-source",
      path: join(input.goodMemorySourceRoot, "package.json"),
    },
    {
      label: "no-memory-runtime",
      path: input.noMemoryRuntime.plan.paths.armRoot,
    },
    { label: "output-root", path: input.outputDirectory },
    { label: "package-tarball", path: input.packageTarball },
    { label: "raw-prehistory", path: input.historySourcePath },
    {
      label: "runner-source",
      path: join(input.runnerSourceRoot, "scripts", "codex-coding-effect"),
    },
    { label: "source-repository", path: input.sourceRepository },
  ];
}

function assertDeniedReadLabels(
  paths: ReadonlyArray<{ label: string }>,
  expectedLabels: readonly string[],
): void {
  const labels = paths.map((entry) => entry.label).sort();
  const expected = [...expectedLabels].sort();
  if (
    new Set(labels).size !== labels.length ||
    JSON.stringify(labels) !== JSON.stringify(expected)
  ) {
    throw new Error("C3 permission deny labels do not match the frozen protocol");
  }
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

function assertMutableRootsOutsideRunnerSource(input: {
  evaluatorRoot: string;
  historySourcePath: string;
  outputDirectory: string;
  runnerSourceRoot: string;
  runtimeRoot: string;
  sourceRepository: string;
  workspaceRoot: string;
}): void {
  for (const [label, path] of Object.entries(input)) {
    if (label === "runnerSourceRoot") {
      continue;
    }
    if (pathsOverlap(input.runnerSourceRoot, path)) {
      throw new Error(
        `${label} must not overlap the C3 runner source checkout`,
      );
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
