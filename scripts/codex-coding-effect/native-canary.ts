import { createHash } from "node:crypto";
import {
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { arch, cpus, platform, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import {
  normalizeCodexEvents,
  parseCodexJsonl,
} from "./codex-events";
import { auditAndSanitizeCodexTranscript, findCodexTranscriptByThreadId } from "./codex-transcript";
import {
  buildNativeCodexArgs,
  buildNativeCanaryPrompts,
  evaluateNativeCanaryEvidence,
  parseCodexFeatureList,
} from "./native-canary-contracts";
import { assertCanaryExecutableInsidePrefix } from "./native-canary-runtime";
import type {
  CodexHooksFeature,
  NativeCanaryEvaluation,
} from "./native-canary-contracts";
import {
  parseNativeCanaryCursorState,
  parseNativeCanaryInjectionState,
  parseNativeCanaryRememberResult,
  parseNativeCanaryStatus,
  parseNativeCanaryWritebackInspection,
} from "./native-canary-state";
import type { CodexNativeCanaryOptions } from "./canary-options";
import { runBoundaryProcess } from "./process";
import type { BoundaryProcessResult } from "./process";

const RUNTIME_MARKER = ".goodmemory-c2-runner-owned";

interface NativeCodexTurnResult {
  commandCount: number;
  eventCount: number;
  threadId: string;
  turnCompleted: boolean;
  usage: ReturnType<typeof normalizeCodexEvents>["usage"];
}

export interface CodexNativeCanaryResult {
  codex: {
    firstThreadId: string;
    model: string;
    reasoningEffort?: string;
    secondThreadId: string;
    version: string;
  };
  evidenceClass: "host-canary";
  evaluation: NativeCanaryEvaluation;
  generatedAt: string;
  manualRolloutSelectionUsed: false;
  modelResponseUsedForAcceptance: false;
  package: {
    sha256: string;
    version: string;
  };
  passed: boolean;
  rawRuntimeRetained: boolean;
  rawTranscriptPersistedByGoodMemory: false;
  runId: string;
  schemaVersion: 1;
  transcript: {
    codexVersion: string;
    conversationMessageCount: number;
    formatDrift: null;
    lineCount: number;
    sanitizedSha256: string;
    sessionId: string;
    sourceSha256: string;
  };
}

export interface NativeCanarySourceIdentity {
  commit: string;
  dirty: boolean;
  dirtyDiffSha256: string;
  dirtyStateSha256: string;
  untrackedFiles: Array<{ path: string; sha256: string }>;
}

export async function runCodexNativeCanary(
  options: CodexNativeCanaryOptions,
): Promise<CodexNativeCanaryResult> {
  await assertAbsent(options.runtimeRoot, "native canary runtime root");
  await assertAbsent(options.runOutputDir, "native canary output directory");
  await assertRegularFile(options.packageTarball, "GoodMemory package tarball");
  await assertRegularFile(options.authFile, "Codex auth source");

  const runtime = {
    codexHome: join(options.runtimeRoot, "home", ".codex"),
    home: join(options.runtimeRoot, "home"),
    npmCache: join(options.runtimeRoot, "npm-cache"),
    prefix: join(options.runtimeRoot, "prefix"),
    temp: join(options.runtimeRoot, "tmp"),
    workspace: join(options.runtimeRoot, "workspace"),
  };
  await mkdir(options.runOutputDir, { recursive: true });
  await mkdir(runtime.codexHome, { recursive: true });
  await mkdir(runtime.npmCache, { recursive: true });
  await mkdir(runtime.temp, { recursive: true });
  await mkdir(runtime.workspace, { recursive: true });
  await writeFile(join(options.runtimeRoot, RUNTIME_MARKER), "c2-native-canary\n", "utf8");

  const logPath = join(options.runOutputDir, "run-log.jsonl");
  const log = async (
    event: string,
    details: Record<string, unknown> = {},
  ): Promise<void> => {
    await appendFile(logPath, `${JSON.stringify({
      details,
      event,
      timestamp: new Date().toISOString(),
    })}\n`, "utf8");
  };

  try {
    await log("run_preflight_started", { runId: options.runId });
    const codexInvocationPath = resolveExecutable(options.codexBinary);
    const codexResolvedPath = await realpath(codexInvocationPath);
    const npmPath = resolveExecutable(options.npmBinary);
    const bunPath = resolveExecutable("bun");
    const nodePath = resolveExecutable("node");
    const gitPath = resolveExecutable("git");
    const sourceSnapshot = await captureGitSourceSnapshot(options.sourceRoot, gitPath);
    const source = sourceSnapshot.identity;
    await writeFile(
      join(options.runOutputDir, "source-dirty.diff"),
      sourceSnapshot.dirtyDiff,
      "utf8",
    );
    const packageSha256 = await sha256File(options.packageTarball);
    const codexExecutableSha256 = await sha256File(codexResolvedPath);
    const nonce = sha256(options.runId).slice(0, 12);
    const markers = {
      lookup: `c2-handoff-key-${nonce}`,
      openLoop: `c2-next-action-${nonce}`,
      seed: `c2-release-codename-${nonce}`,
    };
    const userId = `c2-user-${nonce}`;
    const workspaceId = `c2-workspace-${nonce}`;
    const env = buildIsolatedEnvironment({
      bunPath,
      codexHome: runtime.codexHome,
      home: runtime.home,
      npmCache: runtime.npmCache,
      prefix: runtime.prefix,
      temp: runtime.temp,
    });

    const runRequired = async (input: {
      artifact: string;
      args: readonly string[];
      cwd?: string;
      executable: string;
      stdin?: string;
      timeoutMs?: number;
    }): Promise<BoundaryProcessResult> => {
      await log("boundary_process_started", {
        argumentCount: input.args.length,
        artifact: input.artifact,
        executable: input.executable,
      });
      const result = await runBoundaryProcess({
        args: input.args,
        cwd: input.cwd ?? runtime.workspace,
        env,
        executable: input.executable,
        ...(input.stdin === undefined ? {} : { stdin: input.stdin }),
        timeoutMs: input.timeoutMs ?? 120_000,
      });
      await writeFile(
        join(options.runOutputDir, `${input.artifact}.stdout.log`),
        result.stdout,
        "utf8",
      );
      await writeFile(
        join(options.runOutputDir, `${input.artifact}.stderr.log`),
        result.stderr,
        "utf8",
      );
      await log("boundary_process_completed", {
        artifact: input.artifact,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        spawnFailed: result.spawnError !== undefined,
        timedOut: result.timedOut,
      });
      if (result.spawnError) {
        throw new Error(`${input.artifact} failed to start: ${result.spawnError}`);
      }
      if (result.timedOut) {
        throw new Error(`${input.artifact} timed out`);
      }
      if (result.exitCode !== 0) {
        throw new Error(`${input.artifact} exited with code ${result.exitCode}`);
      }
      return result;
    };

    await runRequired({
      args: ["init", "--quiet", "--initial-branch=main"],
      artifact: "workspace-git-init",
      cwd: runtime.workspace,
      executable: gitPath,
    });
    await runRequired({
      args: [
        "install",
        "--global",
        "--prefix",
        runtime.prefix,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        options.packageTarball,
      ],
      artifact: "package-install",
      cwd: runtime.temp,
      executable: npmPath,
      timeoutMs: 300_000,
    });

    const goodmemoryPath = join(runtime.prefix, "bin", "goodmemory");
    const goodmemoryMcpPath = join(runtime.prefix, "bin", "goodmemory-mcp");
    await assertCanaryExecutableInsidePrefix(
      goodmemoryPath,
      "isolated goodmemory executable",
      runtime.prefix,
    );
    await assertCanaryExecutableInsidePrefix(
      goodmemoryMcpPath,
      "isolated goodmemory-mcp executable",
      runtime.prefix,
    );
    const goodmemoryVersion = (await runRequired({
      args: ["--version"],
      artifact: "goodmemory-version",
      executable: goodmemoryPath,
    })).stdout.trim();

    await runRequired({
      args: [
        "setup",
        "--host",
        "codex",
        "--user-id",
        userId,
        "--activation-mode",
        "workspace_opt_in",
        "--writeback",
        "selective",
        "--no-interactive",
        "--json",
      ],
      artifact: "goodmemory-setup",
      executable: goodmemoryPath,
    });
    await runRequired({
      args: [
        "enable",
        "codex",
        "--workspace-root",
        runtime.workspace,
        "--workspace-id",
        workspaceId,
        "--writeback",
        "selective",
        "--json",
      ],
      artifact: "goodmemory-enable",
      executable: goodmemoryPath,
    });

    const statusRaw = (await runRequired({
      args: ["status", "codex", "--workspace-root", runtime.workspace, "--json"],
      artifact: "goodmemory-status-before",
      executable: goodmemoryPath,
    })).stdout;
    const hostStatus = parseNativeCanaryStatus(statusRaw);
    await runRequired({
      args: ["doctor", "codex", "--workspace-root", runtime.workspace, "--json"],
      artifact: "goodmemory-doctor",
      executable: goodmemoryPath,
    });

    const hooksPath = join(runtime.codexHome, "hooks.json");
    const codexConfigPath = join(runtime.codexHome, "config.toml");
    const hookConfig = await readFile(hooksPath, "utf8");
    const codexConfig = await readFile(codexConfigPath, "utf8");
    assertTrustedManagedHooks(hookConfig, runtime.home);
    if (!/^hooks\s*=\s*true\b/mu.test(codexConfig)) {
      throw new Error("isolated Codex config does not enable hooks");
    }
    await writeFile(join(options.runOutputDir, "hooks.sanitized.json"), hookConfig, "utf8");
    await writeFile(join(options.runOutputDir, "codex-config.toml"), codexConfig, "utf8");

    const codexVersion = (await runRequired({
      args: ["--version"],
      artifact: "codex-version",
      executable: codexInvocationPath,
    })).stdout.trim();
    const codexFeaturesRaw = (await runRequired({
      args: ["features", "list"],
      artifact: "codex-features",
      executable: codexInvocationPath,
    })).stdout;
    const codexHooks = parseCodexFeatureList(codexFeaturesRaw);
    const versions = {
      bun: (await runRequired({
        args: ["--version"],
        artifact: "bun-version",
        executable: bunPath,
      })).stdout.trim(),
      git: (await runRequired({
        args: ["--version"],
        artifact: "git-version",
        executable: gitPath,
      })).stdout.trim(),
      node: (await runRequired({
        args: ["--version"],
        artifact: "node-version",
        executable: nodePath,
      })).stdout.trim(),
      npm: (await runRequired({
        args: ["--version"],
        artifact: "npm-version",
        executable: npmPath,
      })).stdout.trim(),
    };
    if (!codexHooks.enabled || codexHooks.maturity !== "stable") {
      throw new Error("installed Codex does not expose stable enabled hooks");
    }
    if (
      !hostStatus.hookRegistered ||
      !hostStatus.mcpRegistered ||
      hostStatus.workspaceStatus !== "ok" ||
      hostStatus.writeback.mode !== "selective" ||
      hostStatus.writeback.persistRawTranscript
    ) {
      throw new Error("packaged GoodMemory host status failed C2 preflight");
    }

    await copyFile(options.authFile, join(runtime.codexHome, "auth.json"));
    await chmod(join(runtime.codexHome, "auth.json"), 0o600);

    const prompts = buildNativeCanaryPrompts({
      lookupKey: markers.lookup,
      openLoopMarker: markers.openLoop,
    });
    const firstPrompt = prompts.first;
    const secondPrompt = prompts.second;
    const seedMessage =
      `Remember that C2 canary handoff key ${markers.lookup} maps to release codename ${markers.seed}.`;
    const runIdentity = {
      authMode: "isolated-auth-file-copy",
      codex: {
        executablePath: codexInvocationPath,
        executableRealPath: codexResolvedPath,
        executableSha256: codexExecutableSha256,
        featuresSha256: sha256(codexFeaturesRaw),
        hooks: codexHooks,
        model: options.codexModel,
        ...(options.reasoningEffort
          ? { reasoningEffort: options.reasoningEffort }
          : {}),
        version: codexVersion,
      },
      evidenceClass: "host-canary",
      generatedAt: new Date().toISOString(),
      goodmemory: {
        hookConfigSha256: sha256(hookConfig),
        packageSha256,
        packageTarballName: basename(options.packageTarball),
        version: goodmemoryVersion,
      },
      hookTrustBypass: true,
      networkMode: "registry-and-codex-provider",
      paths: {
        codexHome: runtime.codexHome,
        goodmemoryHome: runtime.home,
        output: options.runOutputDir,
        runtime: options.runtimeRoot,
        workspace: runtime.workspace,
      },
      platform: {
        arch: arch(),
        cpuCount: cpus().length,
        name: platform(),
        totalMemoryBytes: totalmem(),
      },
      prompts: {
        firstSha256: sha256(firstPrompt),
        seedMessageSha256: sha256(seedMessage),
        secondSha256: sha256(secondPrompt),
      },
      runId: options.runId,
      schemaVersion: 1,
      source,
      versions,
    };
    await writeJson(join(options.runOutputDir, "run-identity.json"), runIdentity);
    await log("run_preflight_completed", {
      codexHooks: codexHooks.enabled,
      hookConfigSha256: sha256(hookConfig),
      packageSha256,
    });

    const rememberRaw = (await runRequired({
      args: [
        "remember",
        "--host",
        "codex",
        "--workspace-root",
        runtime.workspace,
        "--message",
        seedMessage,
        "--role",
        "user",
        "--extraction-strategy",
        "rules-only",
        "--json",
      ],
      artifact: "goodmemory-seed",
      executable: goodmemoryPath,
    })).stdout;
    const seed = parseNativeCanaryRememberResult(rememberRaw);

    const firstTurn = await runNativeCodexTurn({
      artifact: "codex-first",
      codexExecutable: codexInvocationPath,
      env,
      log,
      model: options.codexModel,
      outputRoot: options.runOutputDir,
      prompt: firstPrompt,
      ...(options.reasoningEffort
        ? { reasoningEffort: options.reasoningEffort }
        : {}),
      timeoutMs: options.timeoutMs,
      workspaceRoot: runtime.workspace,
    });
    const firstTranscriptPath = await findCodexTranscriptByThreadId({
      sessionsRoot: join(runtime.codexHome, "sessions"),
      threadId: firstTurn.threadId,
    });
    const transcript = auditAndSanitizeCodexTranscript({
      codexVersion,
      raw: await readFile(firstTranscriptPath, "utf8"),
      threadId: firstTurn.threadId,
    });
    await writeFile(
      join(options.runOutputDir, "codex-rollout.sanitized.jsonl"),
      transcript.sanitizedJsonl,
      "utf8",
    );
    await writeJson(
      join(options.runOutputDir, "codex-rollout.audit.json"),
      transcript.audit,
    );
    const firstInjectionEvents = await readInjectionEvents(runtime.home);
    const cursorSessionDigests = await readCursorSessionDigests(runtime.home);
    await writeJson(
      join(options.runOutputDir, "injection-state-after-first.json"),
      { events: firstInjectionEvents, schemaVersion: 1 },
    );
    await writeJson(
      join(options.runOutputDir, "cursor-state-after-first.json"),
      { schemaVersion: 1, sessionDigests: cursorSessionDigests },
    );
    await log("injection_audited", {
      eventCount: firstInjectionEvents.length,
      threadId: firstTurn.threadId,
    });

    const firstWritebackRaw = (await runRequired({
      args: [
        "codex",
        "writeback",
        "inspect",
        "--workspace-root",
        runtime.workspace,
        "--limit",
        "50",
        "--json",
      ],
      artifact: "writeback-inspect-first",
      executable: goodmemoryPath,
    })).stdout;
    parseNativeCanaryWritebackInspection(firstWritebackRaw);

    const secondTurn = await runNativeCodexTurn({
      artifact: "codex-second",
      codexExecutable: codexInvocationPath,
      env,
      log,
      model: options.codexModel,
      outputRoot: options.runOutputDir,
      prompt: secondPrompt,
      ...(options.reasoningEffort
        ? { reasoningEffort: options.reasoningEffort }
        : {}),
      timeoutMs: options.timeoutMs,
      workspaceRoot: runtime.workspace,
    });
    const allInjectionEvents = await readInjectionEvents(runtime.home);
    const secondInjectionEvents = allInjectionEvents.filter((event) =>
      !firstInjectionEvents.some((first) => JSON.stringify(first) === JSON.stringify(event))
    );
    await writeJson(
      join(options.runOutputDir, "injection-state-final.json"),
      { events: allInjectionEvents, schemaVersion: 1 },
    );
    const finalWritebackRaw = (await runRequired({
      args: [
        "codex",
        "writeback",
        "inspect",
        "--workspace-root",
        runtime.workspace,
        "--limit",
        "50",
        "--json",
      ],
      artifact: "writeback-inspect-final",
      executable: goodmemoryPath,
    })).stdout;
    const writebackEvents = parseNativeCanaryWritebackInspection(finalWritebackRaw);
    const evaluation = evaluateNativeCanaryEvidence({
      codexHooks,
      firstSession: {
        injectionEvents: firstInjectionEvents,
        threadId: firstTurn.threadId,
      },
      hostStatus,
      manualRolloutSelectionUsed: false,
      openLoopMarker: markers.openLoop,
      secondSession: {
        injectionEvents: secondInjectionEvents,
        threadId: secondTurn.threadId,
      },
      seedMemoryId: seed.memoryId,
      transcript: transcript.audit,
      transcriptCursorSessionDigests: cursorSessionDigests,
      writebackEvents,
    });
    const result: CodexNativeCanaryResult = {
      codex: {
        firstThreadId: firstTurn.threadId,
        model: options.codexModel,
        ...(options.reasoningEffort
          ? { reasoningEffort: options.reasoningEffort }
          : {}),
        secondThreadId: secondTurn.threadId,
        version: codexVersion,
      },
      evidenceClass: "host-canary",
      evaluation,
      generatedAt: new Date().toISOString(),
      manualRolloutSelectionUsed: false,
      modelResponseUsedForAcceptance: false,
      package: { sha256: packageSha256, version: goodmemoryVersion },
      passed: evaluation.passed,
      rawRuntimeRetained: options.keepRuntime,
      rawTranscriptPersistedByGoodMemory: false,
      runId: options.runId,
      schemaVersion: 1,
      transcript: transcript.audit,
    };
    await writeJson(join(options.runOutputDir, "canary-result.json"), result);
    await log("stop_writeback_audited", {
      passed: evaluation.passed,
      recalledWritebackRecordCount: evaluation.recalledWritebackRecordIds.length,
      writebackRecordCount: evaluation.writebackRecordIds.length,
    });
    if (!evaluation.passed) {
      throw new Error(`native Codex canary failed: ${evaluation.reasons.join("; ")}`);
    }
    return result;
  } catch (error) {
    await writeJson(join(options.runOutputDir, "failure.json"), {
      error: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
      runId: options.runId,
      schemaVersion: 1,
    });
    await log("attempt_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (!options.keepRuntime) {
      await cleanupOwnedRuntime(options.runtimeRoot);
    }
  }
}

export async function captureGitSourceIdentity(
  sourceRoot: string,
  gitExecutable = resolveExecutable("git"),
): Promise<NativeCanarySourceIdentity> {
  return (await captureGitSourceSnapshot(sourceRoot, gitExecutable)).identity;
}

async function captureGitSourceSnapshot(
  sourceRoot: string,
  gitExecutable: string,
): Promise<{ dirtyDiff: string; identity: NativeCanarySourceIdentity }> {
  const runGit = async (args: readonly string[]): Promise<string> => {
    const result = await runBoundaryProcess({
      args,
      cwd: sourceRoot,
      env: process.env,
      executable: gitExecutable,
      timeoutMs: 30_000,
    });
    if (result.spawnError) {
      throw new Error(`source identity git failed to start: ${result.spawnError}`);
    }
    if (result.timedOut) {
      throw new Error("source identity git timed out");
    }
    if (result.exitCode !== 0) {
      throw new Error(`source identity git exited with code ${result.exitCode}`);
    }
    return result.stdout;
  };
  const [commitRaw, dirtyDiff, untrackedRaw] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["diff", "--binary", "HEAD", "--"]),
    runGit(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const untrackedPaths = untrackedRaw.split("\0").filter((path) => path.length > 0);
  const untrackedFiles = await Promise.all(untrackedPaths.map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(join(sourceRoot, path)))
      .digest("hex"),
  })));
  const dirtyDiffSha256 = sha256(dirtyDiff);
  return {
    dirtyDiff,
    identity: {
      commit: commitRaw.trim(),
      dirty: dirtyDiff.length > 0 || untrackedFiles.length > 0,
      dirtyDiffSha256,
      dirtyStateSha256: sha256(JSON.stringify({ dirtyDiffSha256, untrackedFiles })),
      untrackedFiles,
    },
  };
}

async function runNativeCodexTurn(input: {
  artifact: string;
  codexExecutable: string;
  env: Record<string, string | undefined>;
  log: (event: string, details?: Record<string, unknown>) => Promise<void>;
  model: string;
  outputRoot: string;
  prompt: string;
  reasoningEffort?: string;
  timeoutMs: number;
  workspaceRoot: string;
}): Promise<NativeCodexTurnResult> {
  await input.log("codex_process_started", { artifact: input.artifact });
  const processResult = await runBoundaryProcess({
    args: buildNativeCodexArgs({
      model: input.model,
      prompt: input.prompt,
      ...(input.reasoningEffort
        ? { reasoningEffort: input.reasoningEffort }
        : {}),
      workspaceRoot: input.workspaceRoot,
    }),
    cwd: input.workspaceRoot,
    env: input.env,
    executable: input.codexExecutable,
    timeoutMs: input.timeoutMs,
  });
  await writeFile(
    join(input.outputRoot, `${input.artifact}.events.jsonl`),
    processResult.stdout,
    "utf8",
  );
  await writeFile(
    join(input.outputRoot, `${input.artifact}.stderr.log`),
    processResult.stderr,
    "utf8",
  );
  await input.log("codex_process_exited", {
    artifact: input.artifact,
    durationMs: processResult.durationMs,
    exitCode: processResult.exitCode,
    timedOut: processResult.timedOut,
  });
  if (processResult.spawnError) {
    throw new Error(`${input.artifact} failed to start: ${processResult.spawnError}`);
  }
  if (processResult.timedOut) {
    throw new Error(`${input.artifact} timed out`);
  }
  if (processResult.exitCode !== 0) {
    throw new Error(`${input.artifact} exited with code ${processResult.exitCode}`);
  }
  const events = parseCodexJsonl(processResult.stdout);
  const normalized = normalizeCodexEvents(events);
  const turnCompleted = events.some((event) => event.type === "turn.completed");
  if (!normalized.threadId || !turnCompleted) {
    throw new Error(`${input.artifact} did not emit thread.started and turn.completed`);
  }
  return {
    commandCount: normalized.commands.length,
    eventCount: events.length,
    threadId: normalized.threadId,
    turnCompleted,
    usage: normalized.usage,
  };
}

function buildIsolatedEnvironment(input: {
  bunPath: string;
  codexHome: string;
  home: string;
  npmCache: string;
  prefix: string;
  temp: string;
}): Record<string, string> {
  const pathParts = [
    join(input.prefix, "bin"),
    dirname(input.bunPath),
    dirname(resolveExecutable("node")),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const env: Record<string, string> = {
    CI: "1",
    CODEX_HOME: input.codexHome,
    GOODMEMORY_BUN_BINARY: input.bunPath,
    GOODMEMORY_HOME: input.home,
    HOME: input.home,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: [...new Set(pathParts)].join(":"),
    RUST_LOG: "error",
    TMPDIR: input.temp,
    npm_config_cache: input.npmCache,
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

export function assertTrustedManagedHooks(raw: string, expectedHome: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("isolated Codex hooks.json is not valid JSON");
  }
  if (!isRecord(parsed) || !isRecord(parsed.hooks)) {
    throw new Error("isolated Codex hooks.json has no hooks object");
  }
  const commandPrefix =
    `GOODMEMORY_HOME=${shellQuote(expectedHome)} `
    + "GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex hook ";
  const expected = {
    PreToolUse: { command: `${commandPrefix}pre-tool-use`, matcher: "Bash" },
    SessionStart: {
      command: `${commandPrefix}session-start`,
      matcher: "startup|resume|clear|compact",
    },
    Stop: { command: `${commandPrefix}session-stop`, matcher: undefined },
    UserPromptSubmit: {
      command: `${commandPrefix}user-prompt-submit`,
      matcher: undefined,
    },
  } as const;
  if (Object.keys(parsed.hooks).sort().join("\n") !== Object.keys(expected).sort().join("\n")) {
    throw new Error("isolated Codex hooks.json contains unexpected hook events");
  }
  for (const [eventName, expectedHook] of Object.entries(expected)) {
    const groups = parsed.hooks[eventName];
    if (!Array.isArray(groups) || groups.length !== 1 || !isRecord(groups[0])) {
      throw new Error(`isolated Codex ${eventName} hook is not singular`);
    }
    if (groups[0].matcher !== expectedHook.matcher) {
      throw new Error(`isolated Codex ${eventName} hook matcher is unexpected`);
    }
    const hooks = groups[0].hooks;
    if (!Array.isArray(hooks) || hooks.length !== 1 || !isRecord(hooks[0])) {
      throw new Error(`isolated Codex ${eventName} command hook is not singular`);
    }
    const command = hooks[0].command;
    if (
      hooks[0].type !== "command" ||
      typeof command !== "string" ||
      command !== expectedHook.command
    ) {
      throw new Error(`isolated Codex ${eventName} hook is not GoodMemory-managed`);
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

async function readInjectionEvents(home: string) {
  return parseNativeCanaryInjectionState(await readFile(
    join(home, ".goodmemory", "codex-injection-state.json"),
    "utf8",
  ));
}

async function readCursorSessionDigests(home: string) {
  return parseNativeCanaryCursorState(await readFile(
    join(home, ".goodmemory", "codex-transcript-cursors.json"),
    "utf8",
  ));
}

async function cleanupOwnedRuntime(runtimeRoot: string): Promise<void> {
  const marker = await readFile(join(runtimeRoot, RUNTIME_MARKER), "utf8");
  if (marker !== "c2-native-canary\n") {
    throw new Error("refusing to remove native canary runtime without ownership marker");
  }
  await rm(runtimeRoot, { force: true, recursive: true });
}

function resolveExecutable(value: string): string {
  if (value.includes("/") || value.includes("\\")) {
    return resolve(value);
  }
  const found = Bun.which(value);
  if (!found) {
    throw new Error(`required executable not found: ${value}`);
  }
  return found;
}

async function assertAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (isMissingPath(error)) {
      return;
    }
    throw error;
  }
  throw new Error(`${label} already exists: ${path}`);
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissingPath(error)) {
      throw new Error(`${label} does not exist: ${path}`);
    }
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  }
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isMissingPath(error: unknown): boolean {
  return isRecord(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
