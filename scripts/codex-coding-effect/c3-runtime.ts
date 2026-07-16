import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { z } from "zod";

import {
  auditNoMemoryRuntime,
  buildInstalledGoodMemorySetupArgs,
} from "./c3-arms";
import type {
  C3ArmPlan,
  NoMemoryRuntimeAudit,
} from "./c3-arms";
import {
  auditFrozenPrehistoryLeakage,
  assertFrozenPrehistoryUnchanged,
  persistFrozenPrehistorySeedReceipt,
} from "./frozen-prehistory";
import type {
  FrozenPrehistoryArtifact,
  FrozenPrehistoryLeakageAudit,
  FrozenPrehistorySeedReceipt,
} from "./frozen-prehistory";
import {
  buildNativeCanarySessionDigest,
  parseCodexFeatureList,
} from "./native-canary-contracts";
import { assertCanaryExecutableInsidePrefix } from "./native-canary-runtime";
import {
  assertTrustedManagedHooks,
} from "./native-canary";
import {
  parseNativeCanaryWritebackInspection,
  parseNativeCanaryInjectionState,
} from "./native-canary-state";
import { runBoundaryProcess } from "./process";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "./process";

const RUNTIME_MARKER = ".goodmemory-c3-runner-owned";
const C3_PERMISSION_PROFILE_NAME = "c3-task";

const statusSchema = z.object({
  hosts: z.array(z.object({
    activationMode: z.string(),
    hookRegistered: z.boolean(),
    host: z.literal("codex"),
    mcpRegistered: z.boolean(),
    workspaceStatus: z.string(),
    writeback: z.object({
      mode: z.string(),
      persistRawTranscript: z.boolean(),
    }).passthrough(),
  }).passthrough()).length(1),
}).passthrough();

const globalConfigSchema = z.object({
  activationMode: z.string(),
  retrievalProfile: z.string(),
  storage: z.object({
    path: z.string().min(1),
    provider: z.literal("sqlite"),
  }).passthrough(),
  userId: z.string().min(1),
  writeback: z.object({
    mode: z.string(),
    persistRawTranscript: z.boolean().optional(),
  }).passthrough(),
}).passthrough();

const writebackResultSchema = z.object({
  reason: z.string(),
  trace: z.object({
    rawTranscriptPersisted: z.boolean(),
    transcriptPathUsed: z.boolean(),
    transcriptSessionDigest: z.string().min(1),
  }).passthrough(),
  wrote: z.boolean(),
}).passthrough();

const hookOutputSchema = z.object({
  hookSpecificOutput: z.object({
    additionalContext: z.string().trim().min(1),
    hookEventName: z.literal("UserPromptSubmit"),
  }).passthrough(),
}).passthrough();

export type C3BoundaryRunner = (
  request: BoundaryProcessRequest,
) => Promise<BoundaryProcessResult>;

export interface C3PermissionProfile {
  configSha256: string;
  filesystemDefault: "deny";
  minimalRead: true;
  name: "c3-task";
  networkAccess: false;
  workspaceWrite: true;
}

export interface C3InstalledArmRuntime {
  codex: {
    executable: string;
    executableSha256: string;
    hooksEnabled: boolean;
    version: string;
  };
  env: Record<string, string>;
  goodmemoryExecutable: string;
  instructionSha256: string;
  package: {
    sha256: string;
    version: string;
  };
  permissionProfile: C3PermissionProfile;
  plan: C3ArmPlan & { arm: "goodmemory-installed" };
  preexistingSessionCount: number;
  profile: {
    activationMode: "global";
    hookRegistered: true;
    mcpRegistered: true;
    persistRawTranscript: false;
    retrievalProfile: "coding_agent";
    workspaceStatus: "ok";
    writebackMode: "selective";
  };
  storagePath: string;
}

export interface C3NoMemoryArmRuntime {
  codex: {
    executable: string;
    executableSha256: string;
    version: string;
  };
  env: Record<string, string>;
  instructionSha256: string;
  isolation: NoMemoryRuntimeAudit;
  permissionProfile: C3PermissionProfile;
  plan: C3ArmPlan & { arm: "no-memory" };
}

export interface C3SeedResult {
  exportLeakageAudit: FrozenPrehistoryLeakageAudit;
  receipt: FrozenPrehistorySeedReceipt;
}

interface C3RecallPreflightEvidenceBase {
  expectedMemoryIds: string[];
  injectedMemoryIds: string[];
  schemaVersion: 1;
  sourceProjectionSha256?: string;
}

export type C3RecallPreflightEvidence =
  | C3RecallPreflightEvidenceBase & {
      outputSha256: string;
      passed: true;
      stateSha256: string;
    }
  | C3RecallPreflightEvidenceBase & {
      outputSha256: string | null;
      passed: false;
      reason: string;
      stateSha256: string | null;
    };

export async function preflightC3InstalledRecall(input: {
  prompt: string;
  runProcess?: C3BoundaryRunner;
  runtime: C3InstalledArmRuntime;
  seed: C3SeedResult;
}): Promise<C3RecallPreflightEvidence> {
  const expectedMemoryIds = [...new Set(
    input.seed.receipt.writtenMemoryIds,
  )].sort();
  const run = input.runProcess ?? runBoundaryProcess;
  const sessionId = `${input.runtime.plan.scopes.sessionId}-recall-preflight`;
  const sessionDigest = buildNativeCanarySessionDigest(sessionId);
  let output: string | null = null;
  let stateRaw: string | null = null;
  let injectedMemoryIds: string[] = [];
  let hookOutput: z.infer<typeof hookOutputSchema>["hookSpecificOutput"] | null =
    null;
  let injectionEvents: ReturnType<typeof parseNativeCanaryInjectionState> = [];
  let evidence: C3RecallPreflightEvidence;
  try {
    output = (await runRequired(run, {
      args: ["codex", "hook", "user-prompt-submit"],
      cwd: input.runtime.plan.paths.workspace,
      env: input.runtime.env,
      executable: input.runtime.goodmemoryExecutable,
      label: "frozen-prehistory-recall-preflight",
      stdin: JSON.stringify({
        cwd: input.runtime.plan.paths.workspace,
        hook_event_name: "UserPromptSubmit",
        prompt: input.prompt,
        session_id: sessionId,
        turn_id: `${sessionId}-turn`,
      }),
    })).stdout;
    hookOutput = parseExternalJson(
      output,
      hookOutputSchema,
      "C3 recall preflight output",
    ).hookSpecificOutput;
    stateRaw = await readFile(
      join(
        input.runtime.plan.paths.home,
        ".goodmemory",
        "codex-injection-state.json",
      ),
      "utf8",
    );
    injectionEvents = parseNativeCanaryInjectionState(stateRaw).filter(
      (event) => event.sessionDigest === sessionDigest,
    );
    injectedMemoryIds = [...new Set(
      injectionEvents
        .filter((event) =>
          event.command === "user-prompt-submit" &&
          event.decision === "injected"
        )
        .flatMap((event) => event.recordIds)
        .filter((memoryId) => expectedMemoryIds.includes(memoryId)),
    )].sort();
    if (
      expectedMemoryIds.length === 0 ||
      injectedMemoryIds.length !== expectedMemoryIds.length
    ) {
      throw new Error("frozen prehistory is not retrievable before Codex execution");
    }
    evidence = {
      expectedMemoryIds,
      injectedMemoryIds,
      outputSha256: sha256(output),
      passed: true,
      schemaVersion: 1,
      stateSha256: sha256(stateRaw),
    };
  } catch (error) {
    evidence = {
      expectedMemoryIds,
      injectedMemoryIds,
      outputSha256: output === null ? null : sha256(output),
      passed: false,
      reason: error instanceof Error ? error.message : String(error),
      schemaVersion: 1,
      stateSha256: stateRaw === null ? null : sha256(stateRaw),
    };
  }
  const sourceProjectionBytes = `${JSON.stringify({
    hookOutput: hookOutput === null
      ? null
      : {
          additionalContextLength: hookOutput.additionalContext.length,
          additionalContextSha256: sha256(hookOutput.additionalContext),
          hookEventName: hookOutput.hookEventName,
        },
    injectionEvents: injectionEvents.map((event) => ({
      command: event.command,
      decision: event.decision,
      recordIds: event.recordIds,
      sessionDigest: event.sessionDigest,
    })),
    schemaVersion: 1,
    sessionDigest,
  }, null, 2)}\n`;
  await writeFile(
    join(
      input.runtime.plan.paths.result,
      "recall-preflight-source.sanitized.json",
    ),
    sourceProjectionBytes,
    { encoding: "utf8", flag: "wx" },
  );
  evidence = {
    ...evidence,
    sourceProjectionSha256: sha256(sourceProjectionBytes),
  };
  await writeFile(
    join(input.runtime.plan.paths.result, "recall-preflight.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return evidence;
}

export interface C3PermissionIsolationAudit {
  configSha256: string;
  deniedReads: Array<{
    denied: boolean;
    exitCode: number | null;
    label: string;
    pathSha256: string;
  }>;
  networkAccess: false;
  passed: boolean;
  profileName: "c3-task";
  reasons: string[];
  schemaVersion: 1;
  workspaceRead: boolean;
  workspaceWrite: boolean;
}

export interface C3PermissionIsolationEvidence {
  audit: C3PermissionIsolationAudit & {
    deniedReads: Array<C3PermissionIsolationAudit["deniedReads"][number] & {
      denied: true;
    }>;
    passed: true;
    workspaceRead: true;
    workspaceWrite: true;
  };
  evidenceSha256: string;
}

export async function auditC3PermissionIsolation(input: {
  deniedReadPaths: ReadonlyArray<{ label: string; path: string }>;
  phase: "pre-seed" | "preflight";
  runProcess?: C3BoundaryRunner;
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
}): Promise<C3PermissionIsolationEvidence> {
  if (input.deniedReadPaths.length === 0) {
    throw new Error("C3 permission audit requires at least one denied read path");
  }
  const profile = input.runtime.permissionProfile;
  const configPath = join(input.runtime.plan.paths.codexHome, "config.toml");
  const actualConfigSha256 = await sha256File(configPath);
  const workspace = input.runtime.plan.paths.workspace;
  const readProbePath = join(workspace, ".c3-permission-read-probe");
  const writeProbePath = join(workspace, ".c3-permission-write-probe");
  await Promise.all([
    assertAbsentPath(readProbePath, "C3 permission read probe"),
    assertAbsentPath(writeProbePath, "C3 permission write probe"),
  ]);
  const readSentinel = "c3-workspace-read-allowed\n";
  await writeFile(readProbePath, readSentinel, { encoding: "utf8", flag: "wx" });
  const run = input.runProcess ?? runBoundaryProcess;
  let workspaceRead = false;
  let workspaceWrite = false;
  const deniedReads: C3PermissionIsolationAudit["deniedReads"] = [];
  const reasons: string[] = [];
  try {
    const read = await runPermissionProbe(run, input.runtime, [
      "/bin/cat",
      readProbePath,
    ]);
    workspaceRead = probeSucceeded(read) && read.stdout === readSentinel;
    if (!workspaceRead) {
      reasons.push("permission profile did not allow the current workspace read");
    }

    const write = await runPermissionProbe(run, input.runtime, [
      "/usr/bin/touch",
      writeProbePath,
    ]);
    workspaceWrite = probeSucceeded(write) && await pathExists(writeProbePath);
    if (!workspaceWrite) {
      reasons.push("permission profile did not allow the current workspace write");
    }

    for (const deniedPath of [...input.deniedReadPaths].sort((first, second) =>
      first.label.localeCompare(second.label)
    )) {
      await assertRegularFile(deniedPath.path, `denied read probe ${deniedPath.label}`);
      const result = await runPermissionProbe(run, input.runtime, [
        "/bin/cat",
        resolve(deniedPath.path),
      ]);
      const denied = result.spawnError === undefined &&
        !result.timedOut &&
        result.exitCode !== null &&
        result.exitCode !== 0;
      deniedReads.push({
        denied,
        exitCode: result.exitCode,
        label: deniedPath.label,
        pathSha256: sha256(resolve(deniedPath.path)),
      });
      if (!denied) {
        reasons.push(`permission profile exposed denied path ${deniedPath.label}`);
      }
    }
  } finally {
    await Promise.all([
      rm(readProbePath, { force: true }),
      rm(writeProbePath, { force: true }),
    ]);
  }
  if (actualConfigSha256 !== profile.configSha256) {
    reasons.push("permission profile config changed after runtime preparation");
  }
  const audit: C3PermissionIsolationAudit = {
    configSha256: actualConfigSha256,
    deniedReads,
    networkAccess: false,
    passed: reasons.length === 0,
    profileName: C3_PERMISSION_PROFILE_NAME,
    reasons,
    schemaVersion: 1,
    workspaceRead,
    workspaceWrite,
  };
  const bytes = `${JSON.stringify(audit, null, 2)}\n`;
  await writeFile(
    join(
      input.runtime.plan.paths.result,
      `permission-isolation-${input.phase}.json`,
    ),
    bytes,
    { encoding: "utf8", flag: "wx" },
  );
  if (!audit.passed) {
    throw new Error(`C3 permission isolation failed: ${reasons.join("; ")}`);
  }
  return {
    audit: requirePassedPermissionIsolationAudit(audit),
    evidenceSha256: sha256(bytes),
  };
}

function requirePassedPermissionIsolationAudit(
  audit: C3PermissionIsolationAudit,
): C3PermissionIsolationEvidence["audit"] {
  if (
    !audit.passed ||
    !audit.workspaceRead ||
    !audit.workspaceWrite ||
    audit.deniedReads.some((probe) => !probe.denied)
  ) {
    throw new Error("C3 permission isolation evidence is not passing");
  }
  return {
    ...audit,
    deniedReads: audit.deniedReads.map((probe) => ({
      ...probe,
      denied: true,
    })),
    passed: true,
    workspaceRead: true,
    workspaceWrite: true,
  };
}

export async function prepareC3NoMemoryArm(input: {
  authFile: string;
  bunExecutable: string;
  codexExecutable: string;
  plan: C3ArmPlan & { arm: "no-memory" };
  runProcess?: C3BoundaryRunner;
}): Promise<C3NoMemoryArmRuntime> {
  const [bunExecutable, codexExecutable] = await Promise.all([
    resolveExecutablePath(input.bunExecutable, "Bun executable"),
    resolveExecutablePath(input.codexExecutable, "Codex executable"),
  ]);
  await initializeRuntime(input.plan);
  await installAuthFile(input.authFile, input.plan.paths.codexHome);
  const permissionProfile = await installC3PermissionProfile(
    input.plan.paths.codexHome,
  );
  const env = buildIsolatedEnvironment({
    bunExecutable,
    plan: input.plan,
  });
  await assertGoodMemoryAbsentFromPath(env.PATH);
  const isolation = await auditNoMemoryRuntime({
    codexHome: input.plan.paths.codexHome,
    home: input.plan.paths.home,
  });
  if (!isolation.passed) {
    throw new Error(`no-memory isolation failed: ${isolation.reasons.join("; ")}`);
  }
  const run = input.runProcess ?? runBoundaryProcess;
  const version = (await runRequired(run, {
    args: ["--version"],
    cwd: input.plan.paths.workspace,
    env,
    executable: codexExecutable,
    label: "codex-version-no-memory",
  })).stdout.trim();

  return {
    codex: {
      executable: codexExecutable,
      executableSha256: await sha256File(codexExecutable),
      version,
    },
    env,
    instructionSha256: await captureInstructionSha256(
      input.plan.paths.workspace,
    ),
    isolation,
    permissionProfile,
    plan: input.plan,
  };
}

export async function prepareC3InstalledArm(input: {
  authFile: string;
  bunExecutable: string;
  codexExecutable: string;
  npmExecutable: string;
  packageTarball: string;
  plan: C3ArmPlan & { arm: "goodmemory-installed" };
  runProcess?: C3BoundaryRunner;
}): Promise<C3InstalledArmRuntime> {
  await assertRegularFile(input.packageTarball, "GoodMemory package tarball");
  const [bunExecutable, codexExecutable, npmExecutable] = await Promise.all([
    resolveExecutablePath(input.bunExecutable, "Bun executable"),
    resolveExecutablePath(input.codexExecutable, "Codex executable"),
    resolveExecutablePath(input.npmExecutable, "npm executable"),
  ]);
  await initializeRuntime(input.plan);
  const instructionSha256 = await captureInstructionSha256(
    input.plan.paths.workspace,
  );
  const prefix = input.plan.paths.packagePrefix;
  if (prefix === undefined) {
    throw new Error("installed C3 arm requires an isolated package prefix");
  }
  const env = buildIsolatedEnvironment({
    bunExecutable,
    packagePrefix: prefix,
    plan: input.plan,
  });
  const run = input.runProcess ?? runBoundaryProcess;
  await runRequired(run, {
    args: [
      "install",
      "--global",
      "--prefix",
      prefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      input.packageTarball,
    ],
    cwd: input.plan.paths.temp,
    env,
    executable: npmExecutable,
    label: "package-install",
    timeoutMs: 300_000,
  });
  await installAuthFile(input.authFile, input.plan.paths.codexHome);
  const goodmemoryExecutable = join(prefix, "bin", "goodmemory");
  await Promise.all([
    assertCanaryExecutableInsidePrefix(
      goodmemoryExecutable,
      "isolated goodmemory executable",
      prefix,
    ),
    assertCanaryExecutableInsidePrefix(
      join(prefix, "bin", "goodmemory-mcp"),
      "isolated goodmemory-mcp executable",
      prefix,
    ),
  ]);
  const packageVersion = (await runRequired(run, {
    args: ["--version"],
    cwd: input.plan.paths.workspace,
    env,
    executable: goodmemoryExecutable,
    label: "goodmemory-version",
  })).stdout.trim();
  await runRequired(run, {
    args: buildInstalledGoodMemorySetupArgs({
      userId: input.plan.scopes.userId,
    }),
    cwd: input.plan.paths.workspace,
    env,
    executable: goodmemoryExecutable,
    label: "goodmemory-setup",
  });
  if (
    await captureInstructionSha256(input.plan.paths.workspace) !==
      instructionSha256 ||
    await pathExists(join(input.plan.paths.workspace, ".goodmemory"))
  ) {
    throw new Error("recommended global setup mutated the task workspace");
  }

  const statusRaw = (await runRequired(run, {
    args: [
      "status",
      "codex",
      "--workspace-root",
      input.plan.paths.workspace,
      "--json",
    ],
    cwd: input.plan.paths.workspace,
    env,
    executable: goodmemoryExecutable,
    label: "goodmemory-status",
  })).stdout;
  await runRequired(run, {
    args: [
      "doctor",
      "codex",
      "--workspace-root",
      input.plan.paths.workspace,
      "--json",
    ],
    cwd: input.plan.paths.workspace,
    env,
    executable: goodmemoryExecutable,
    label: "goodmemory-doctor",
  });
  const host = parseExternalJson(statusRaw, statusSchema, "C3 host status").hosts[0]!;
  const globalConfig = parseExternalJson(
    await readFile(
      join(input.plan.paths.home, ".goodmemory", "codex.json"),
      "utf8",
    ),
    globalConfigSchema,
    "C3 installed profile",
  );
  const persistRawTranscript = host.writeback.persistRawTranscript ||
    globalConfig.writeback.persistRawTranscript === true;
  if (
    host.activationMode !== "global" ||
    !host.hookRegistered ||
    !host.mcpRegistered ||
    host.workspaceStatus !== "ok" ||
    host.writeback.mode !== "selective" ||
    globalConfig.activationMode !== "global" ||
    globalConfig.retrievalProfile !== "coding_agent" ||
    globalConfig.writeback.mode !== "selective" ||
    persistRawTranscript
  ) {
    throw new Error("installed C3 profile does not match recommended global selective mode");
  }
  if (globalConfig.userId !== input.plan.scopes.userId) {
    throw new Error("installed C3 profile user scope does not match the arm plan");
  }

  const hooksRaw = await readFile(
    join(input.plan.paths.codexHome, "hooks.json"),
    "utf8",
  );
  assertTrustedManagedHooks(hooksRaw, input.plan.paths.home);
  const codexConfig = await readFile(
    join(input.plan.paths.codexHome, "config.toml"),
    "utf8",
  );
  if (!/^hooks\s*=\s*true\b/mu.test(codexConfig)) {
    throw new Error("installed C3 Codex config does not enable hooks");
  }
  const permissionProfile = await installC3PermissionProfile(
    input.plan.paths.codexHome,
  );
  const codexVersion = (await runRequired(run, {
    args: ["--version"],
    cwd: input.plan.paths.workspace,
    env,
    executable: codexExecutable,
    label: "codex-version-installed",
  })).stdout.trim();
  const featureRaw = (await runRequired(run, {
    args: ["features", "list"],
    cwd: input.plan.paths.workspace,
    env,
    executable: codexExecutable,
    label: "codex-features-installed",
  })).stdout;
  const hooks = parseCodexFeatureList(featureRaw);
  if (!hooks.enabled || hooks.maturity !== "stable") {
    throw new Error("installed Codex does not expose stable enabled hooks");
  }
  const preexistingSessionCount = await countSessionFiles(
    input.plan.paths.codexHome,
  );
  if (preexistingSessionCount !== 0) {
    throw new Error("installed C3 arm contains pre-existing Codex sessions");
  }

  return {
    codex: {
      executable: codexExecutable,
      executableSha256: await sha256File(codexExecutable),
      hooksEnabled: true,
      version: codexVersion,
    },
    env,
    goodmemoryExecutable,
    instructionSha256,
    package: {
      sha256: await sha256File(input.packageTarball),
      version: packageVersion,
    },
    permissionProfile,
    plan: input.plan,
    preexistingSessionCount,
    profile: {
      activationMode: "global",
      hookRegistered: true,
      mcpRegistered: true,
      persistRawTranscript: false,
      retrievalProfile: "coding_agent",
      workspaceStatus: "ok",
      writebackMode: "selective",
    },
    storagePath: globalConfig.storage.path,
  };
}

export async function seedC3InstalledArm(input: {
  artifact: FrozenPrehistoryArtifact;
  declaredForbiddenSourceSha256: readonly string[];
  forbiddenSources: ReadonlyArray<{ content: string; label: string }>;
  forbiddenStrings: readonly string[];
  receiptPath: string;
  runProcess?: C3BoundaryRunner;
  runtime: C3InstalledArmRuntime;
}): Promise<C3SeedResult> {
  await assertFrozenPrehistoryUnchanged(input.artifact);
  const run = input.runProcess ?? runBoundaryProcess;
  const writebackRaw = (await runRequired(run, {
    args: [
      "codex",
      "writeback",
      "--from-rollout",
      "--rollout-path",
      input.artifact.path,
      "--workspace-root",
      input.runtime.plan.paths.workspace,
      "--json",
    ],
    cwd: input.runtime.plan.paths.workspace,
    env: input.runtime.env,
    executable: input.runtime.goodmemoryExecutable,
    label: "frozen-prehistory-writeback",
  })).stdout;
  const writeback = parseExternalJson(
    writebackRaw,
    writebackResultSchema,
    "C3 frozen-prehistory writeback",
  );
  if (
    !writeback.wrote ||
    writeback.reason !== "written" ||
    writeback.trace.rawTranscriptPersisted ||
    !writeback.trace.transcriptPathUsed
  ) {
    throw new Error("frozen-prehistory selective writeback did not commit safely");
  }

  const sourceSessionDigest = writeback.trace.transcriptSessionDigest;
  const inspectionRaw = (await runRequired(run, {
    args: [
      "codex",
      "writeback",
      "inspect",
      "--workspace-root",
      input.runtime.plan.paths.workspace,
      "--limit",
      "50",
      "--json",
    ],
    cwd: input.runtime.plan.paths.workspace,
    env: input.runtime.env,
    executable: input.runtime.goodmemoryExecutable,
    label: "frozen-prehistory-writeback-inspect",
  })).stdout;
  const writtenMemoryIds = [...new Set(
    parseNativeCanaryWritebackInspection(inspectionRaw)
      .filter((event) =>
        event.command === "session-end" &&
        event.sessionDigest === sourceSessionDigest &&
        event.status === "committed"
      )
      .flatMap((event) => event.linkedRecordIds)
      .filter((record) => record.type === "memory")
      .map((record) => record.id),
  )].sort();
  if (writtenMemoryIds.length === 0) {
    throw new Error("frozen-prehistory writeback has no committed memory receipt");
  }

  const exportRoot = join(input.runtime.plan.paths.result, "seed-export");
  await runRequired(run, {
    args: [
      "export-memory",
      "--user-id",
      input.runtime.plan.scopes.userId,
      "--workspace-id",
      input.runtime.plan.scopes.workspaceId,
      "--storage-provider",
      "sqlite",
      "--storage-url",
      input.runtime.storagePath,
      "--output",
      exportRoot,
    ],
    cwd: input.runtime.plan.paths.workspace,
    env: input.runtime.env,
    executable: input.runtime.goodmemoryExecutable,
    label: "frozen-prehistory-export",
  });
  const memoryExport = await readFile(
    join(exportRoot, "memory-export.json"),
    "utf8",
  );
  const exportLeakageAudit = auditFrozenPrehistoryLeakage({
    artifact: {
      path: join(exportRoot, "memory-export.json"),
      records: [{
        id: "memory-export",
        message: memoryExport,
        role: "assistant",
      }],
      sourceBytes: memoryExport,
      sourceSha256: sha256(memoryExport),
    },
    declaredForbiddenSourceSha256: input.declaredForbiddenSourceSha256,
    forbiddenSources: input.forbiddenSources,
    forbiddenStrings: input.forbiddenStrings,
  });
  await writeFile(
    join(input.runtime.plan.paths.result, "seed-export-leakage-audit.json"),
    `${JSON.stringify(exportLeakageAudit, null, 2)}\n`,
    "utf8",
  );
  if (!exportLeakageAudit.passed) {
    throw new Error("seeded GoodMemory export failed the leakage audit");
  }
  await assertFrozenPrehistoryUnchanged(input.artifact);

  const receipt: FrozenPrehistorySeedReceipt = {
    historySourceSha256: input.artifact.sourceSha256,
    memoryExportSha256: sha256(memoryExport),
    rawTranscriptPersisted: false,
    schemaVersion: 1,
    seedSurface: "codex-writeback-from-rollout",
    sourceSessionDigest,
    writebackOutcome: "written",
    writtenMemoryIds,
  };
  await persistFrozenPrehistorySeedReceipt(input.receiptPath, receipt);
  return { exportLeakageAudit, receipt };
}

export async function cleanupC3ArmRuntime(
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime,
): Promise<void> {
  const marker = await readFile(
    join(runtime.plan.paths.armRoot, RUNTIME_MARKER),
    "utf8",
  );
  if (marker !== `${runtime.plan.arm}\n`) {
    throw new Error("refusing to remove C3 runtime without its ownership marker");
  }
  await rm(runtime.plan.paths.armRoot, { force: true, recursive: true });
}

async function initializeRuntime(plan: C3ArmPlan): Promise<void> {
  if (await pathExists(plan.paths.armRoot)) {
    throw new Error(`C3 arm runtime already exists: ${plan.paths.armRoot}`);
  }
  await Promise.all([
    mkdir(plan.paths.cache, { recursive: true }),
    mkdir(plan.paths.codexHome, { recursive: true }),
    mkdir(plan.paths.result, { recursive: true }),
    mkdir(plan.paths.temp, { recursive: true }),
    mkdir(join(plan.paths.workspace, ".git", "c3-tmp"), { recursive: true }),
  ]);
  await writeFile(
    join(plan.paths.armRoot, RUNTIME_MARKER),
    `${plan.arm}\n`,
    "utf8",
  );
}

async function installAuthFile(
  authFile: string,
  codexHome: string,
): Promise<void> {
  await assertRegularFile(authFile, "Codex auth source");
  const destination = join(codexHome, "auth.json");
  await copyFile(authFile, destination);
  await chmod(destination, 0o600);
}

async function installC3PermissionProfile(
  codexHome: string,
): Promise<C3PermissionProfile> {
  const configPath = join(codexHome, "config.toml");
  const existing = await readOptionalText(configPath) ?? "";
  if (
    /^default_permissions\s*=/mu.test(existing) ||
    /^\[permissions\./mu.test(existing)
  ) {
    throw new Error("isolated Codex config already defines a permission profile");
  }
  const config = [
    `default_permissions = "${C3_PERMISSION_PROFILE_NAME}"`,
    'web_search = "disabled"',
    "",
    existing.trim(),
    existing.trim().length > 0 ? "" : undefined,
    `[permissions.${C3_PERMISSION_PROFILE_NAME}.filesystem]`,
    '":root" = "deny"',
    '":minimal" = "read"',
    "",
    `[permissions.${C3_PERMISSION_PROFILE_NAME}.filesystem.":workspace_roots"]`,
    '"." = "write"',
    "",
    `[permissions.${C3_PERMISSION_PROFILE_NAME}.network]`,
    "enabled = false",
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
  await writeFile(configPath, config, "utf8");
  return {
    configSha256: sha256(config),
    filesystemDefault: "deny",
    minimalRead: true,
    name: C3_PERMISSION_PROFILE_NAME,
    networkAccess: false,
    workspaceWrite: true,
  };
}

function buildIsolatedEnvironment(input: {
  bunExecutable: string;
  packagePrefix?: string;
  plan: C3ArmPlan;
}): Record<string, string> {
  const nodeExecutable = Bun.which("node");
  const pathParts = [
    ...(input.packagePrefix ? [join(input.packagePrefix, "bin")] : []),
    dirname(resolve(input.bunExecutable)),
    ...(nodeExecutable ? [dirname(nodeExecutable)] : []),
    "/usr/bin",
    "/bin",
  ];
  const env: Record<string, string> = {
    CI: "1",
    CODEX_HOME: input.plan.paths.codexHome,
    GOODMEMORY_BUN_BINARY: resolve(input.bunExecutable),
    HOME: input.plan.paths.home,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: [...new Set(pathParts)].join(":"),
    RUST_LOG: "error",
    TMPDIR: join(input.plan.paths.workspace, ".git", "c3-tmp"),
    npm_config_cache: input.plan.paths.cache,
    ...(input.packagePrefix
      ? { GOODMEMORY_HOME: input.plan.paths.home }
      : {}),
  };
  for (const name of [
    "ALL_PROXY",
    "CODEX_CA_CERTIFICATE",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "all_proxy",
    "https_proxy",
    "http_proxy",
    "no_proxy",
  ]) {
    const value = process.env[name];
    if (value) {
      env[name] = value;
    }
  }
  return env;
}

async function assertGoodMemoryAbsentFromPath(pathValue: string): Promise<void> {
  for (const directory of pathValue.split(":")) {
    if (await pathExists(join(directory, "goodmemory"))) {
      throw new Error(`no-memory PATH exposes a goodmemory executable: ${directory}`);
    }
  }
}

async function runRequired(
  run: C3BoundaryRunner,
  input: {
    args: readonly string[];
    cwd: string;
    env: Record<string, string>;
    executable: string;
    label: string;
    stdin?: string;
    timeoutMs?: number;
  },
): Promise<BoundaryProcessResult> {
  const result = await run({
    args: input.args,
    cwd: input.cwd,
    env: input.env,
    executable: input.executable,
    stdin: input.stdin,
    timeoutMs: input.timeoutMs ?? 120_000,
  });
  if (result.spawnError !== undefined) {
    throw new Error(`${input.label} failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error(`${input.label} timed out`);
  }
  if (result.exitCode !== 0) {
    throw new Error(`${input.label} exited with code ${result.exitCode}`);
  }
  return result;
}

async function runPermissionProbe(
  run: C3BoundaryRunner,
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime,
  command: readonly string[],
): Promise<BoundaryProcessResult> {
  return run({
    args: [
      "sandbox",
      "-P",
      runtime.permissionProfile.name,
      "-C",
      runtime.plan.paths.workspace,
      "--",
      ...command,
    ],
    cwd: runtime.plan.paths.workspace,
    env: runtime.env,
    executable: runtime.codex.executable,
    timeoutMs: 30_000,
  });
}

function probeSucceeded(result: BoundaryProcessResult): boolean {
  return result.spawnError === undefined &&
    !result.timedOut &&
    result.exitCode === 0;
}

async function captureInstructionSha256(workspace: string): Promise<string> {
  const entries = await collectInstructionFiles(workspace, workspace);
  const hash = createHash("sha256");
  for (const path of entries.sort()) {
    hash.update(relative(workspace, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collectInstructionFiles(
  root: string,
  directory: string,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".goodmemory") {
        continue;
      }
      files.push(...await collectInstructionFiles(root, path));
      continue;
    }
    const relativePath = relative(root, path);
    if (
      entry.name === "AGENTS.md" ||
      entry.name === "AGENTS.override.md" ||
      entry.name === "CLAUDE.md" ||
      entry.name === "CODEX.md" ||
      relativePath.startsWith(`.codex${process.platform === "win32" ? "\\" : "/"}`)
    ) {
      files.push(path);
    }
  }
  return files;
}

async function countSessionFiles(codexHome: string): Promise<number> {
  const sessionsRoot = join(codexHome, "sessions");
  if (!await pathExists(sessionsRoot)) {
    return 0;
  }
  let count = 0;
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(join(directory, entry.name));
      } else {
        count += 1;
      }
    }
  };
  await walk(sessionsRoot);
  return count;
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  }
}

async function resolveExecutablePath(
  value: string,
  label: string,
): Promise<string> {
  const candidate = value.includes("/") || value.includes("\\")
    ? resolve(value)
    : Bun.which(value);
  if (candidate === null || candidate === undefined) {
    throw new Error(`${label} is not available on PATH: ${value}`);
  }
  const path = await realpath(candidate);
  await assertRegularFile(path, label);
  return path;
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseExternalJson<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${label} failed schema validation`);
  }
  return parsed.data;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

async function assertAbsentPath(path: string, label: string): Promise<void> {
  if (await pathExists(path)) {
    throw new Error(`${label} already exists: ${path}`);
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
