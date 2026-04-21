import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import { detectBundledSQLiteVssRuntime } from "../src/storage/sqliteRuntime";

export interface Phase29RcDryRunCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase29RcDryRunCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase29RcDryRunExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase29RcDryRunReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  artifact: {
    packageSpec: string;
    tarballName: string;
    tarballPath: string;
  };
  commands: Phase29RcDryRunExecutionResult[];
  elapsedMs: number;
  generatedAt: string;
  generatedBy: string;
  phase: "phase-29";
  releaseContract: {
    distribution: "tarball-first";
    runtime: "bun-only";
    version: string;
  };
  runDirectory: string;
  runId: string;
  verification: {
    artifactPaths: string[];
    cliCommand: string;
    cliProvider?: string;
    contextIncludesBlocker: boolean;
    docsInstallCommand: string;
    recallHitCount?: number;
    runtimeMode: "rules-only";
    smokeOk: boolean;
    sqliteRuntimeOutcome: string;
  };
}

export interface Phase29RcDryRunOptions {
  outputDir?: string;
  runId?: string;
  tarballName?: string;
}

export interface Phase29RcDryRunDependencies {
  detectBundledRuntime?: () => boolean;
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  makeTempDir?: (prefix: string) => Promise<string>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  removeDir?: (
    path: string,
    options?: {
      force?: boolean;
      recursive?: boolean;
    },
  ) => Promise<void>;
  renameFile?: (from: string, to: string) => Promise<void>;
  runCommand?: (
    command: Phase29RcDryRunCommand,
  ) => Promise<Phase29RcDryRunCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase29RcDryRunCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runDryRun?: (
    options?: Phase29RcDryRunOptions,
  ) => Promise<Phase29RcDryRunReport>;
}

const GENERATED_BY = "scripts/run-phase-29-rc-dry-run.ts";
const PHASE29_REQUIRED_MEMORY_ARTIFACT = "MEMORY.md";
const PHASE29_REQUIRED_STORAGE_PROVIDER = "sqlite";
const PHASE29_RELEASE_ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "",
  GOODMEMORY_EMBEDDING_API_KEY: "",
  GOODMEMORY_EMBEDDING_BASE_URL: "",
  GOODMEMORY_EMBEDDING_MODEL: "",
  GOODMEMORY_EMBEDDING_PROVIDER: "",
  GOODMEMORY_JUDGE_API_KEY: "",
  GOODMEMORY_JUDGE_BASE_URL: "",
  GOODMEMORY_JUDGE_MODEL: "",
  GOODMEMORY_JUDGE_PROVIDER: "",
  GOODMEMORY_RECALL_ROUTER_API_KEY: "",
  GOODMEMORY_RECALL_ROUTER_BASE_URL: "",
  GOODMEMORY_RECALL_ROUTER_MODEL: "",
  GOODMEMORY_RECALL_ROUTER_PROVIDER: "",
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_MODE: "",
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: "",
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
  GOODMEMORY_TEST_POSTGRES_URL: "",
} as const;
const PHASE29_RC_SMOKE_FILE = "smoke.mjs";
const PHASE29_RC_SMOKE_SOURCE = `import { createGoodMemory } from "goodmemory";
import { createGoodMemoryAISDK } from "goodmemory/ai-sdk";
import { createHostAdapter } from "goodmemory/host";

const scope = {
  userId: "consumer-user",
  workspaceId: "consumer-workspace",
};

const memory = createGoodMemory({});

await memory.remember({
  scope: {
    ...scope,
    sessionId: "consumer-s0",
  },
  messages: [
    {
      role: "user",
      content: "Remember that I prefer concise release checklists and the blocker is prod verification.",
    },
  ],
});

const aiSDK = createGoodMemoryAISDK({
  memory,
  dependencies: {
    streamText: ((input) => {
      const finishPromise = Promise.resolve(
        input.onFinish?.({
          text: "The blocker is still prod verification.",
        }),
      );

      return {
        text: finishPromise.then(() => "The blocker is still prod verification."),
        finishReason: Promise.resolve("stop"),
      };
    }),
  },
});

await aiSDK.streamText({
  scope: {
    ...scope,
    sessionId: "consumer-s1",
  },
  messages: [
    {
      role: "user",
      content: "Remember that the blocker is prod verification.",
    },
  ],
  system: "You are a concise project copilot.",
  model: {},
}).text;

const recall = await memory.recall({
  scope: {
    ...scope,
    sessionId: "consumer-s2",
  },
  query: "What is the blocker and how should I answer this user?",
  retrievalProfile: "general_chat",
});
const context = await memory.buildContext({
  recall,
  output: "markdown",
  maxTokens: 160,
});

const adapter = createHostAdapter({
  id: "consumer-host",
  hostKind: "claude",
  memory,
  readableArtifactTypes: ["memory_index"],
});

const artifacts = await adapter.readArtifacts({
  scope: {
    ...scope,
    sessionId: "consumer-s2",
  },
});

console.log(JSON.stringify({
  artifactPaths: artifacts.artifacts.map((artifact) => artifact.relativePath),
  contextIncludesBlocker: context.content.includes("prod verification"),
  ok: true,
  recallHitCount: recall.metadata.hits.length,
}, null, 2));
`;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function extractJsonObject(value: string): Record<string, unknown> {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Expected JSON output but none was found.");
  }

  return JSON.parse(value.slice(start, end + 1)) as Record<string, unknown>;
}

function assertPhase29SmokeOutput(stdout: string): {
  artifactPaths: string[];
  contextIncludesBlocker: boolean;
  recallHitCount: number;
  smokeOk: boolean;
} {
  const smokeJson = extractJsonObject(stdout);
  const artifactPaths = Array.isArray(smokeJson.artifactPaths)
    ? smokeJson.artifactPaths.filter(
        (artifactPath): artifactPath is string =>
          typeof artifactPath === "string",
      )
    : [];
  const contextIncludesBlocker = smokeJson.contextIncludesBlocker === true;
  const recallHitCount =
    typeof smokeJson.recallHitCount === "number"
      ? smokeJson.recallHitCount
      : 0;
  const smokeOk = smokeJson.ok === true;
  const failures: string[] = [];

  if (!smokeOk) {
    failures.push("ok was not true");
  }
  if (!contextIncludesBlocker) {
    failures.push("context did not include the recalled blocker");
  }
  if (recallHitCount <= 0) {
    failures.push("recallHitCount was not positive");
  }
  if (!artifactPaths.includes(PHASE29_REQUIRED_MEMORY_ARTIFACT)) {
    failures.push(`${PHASE29_REQUIRED_MEMORY_ARTIFACT} was not exported`);
  }
  if (failures.length > 0) {
    throw new Error(
      `Packed tarball public reference smoke did not prove recall: ${failures.join(
        ", ",
      )}.`,
    );
  }

  return {
    artifactPaths,
    contextIncludesBlocker,
    recallHitCount,
    smokeOk,
  };
}

function assertPhase29CliOutput(stdout: string): {
  cliProvider: string;
} {
  const cliJson = extractJsonObject(stdout) as {
    storage?: {
      provider?: unknown;
    };
  };
  const cliProvider =
    typeof cliJson.storage?.provider === "string"
      ? cliJson.storage.provider
      : undefined;

  if (cliProvider !== PHASE29_REQUIRED_STORAGE_PROVIDER) {
    throw new Error(
      `Installed CLI did not use the expected ${PHASE29_REQUIRED_STORAGE_PROVIDER} local-first provider.`,
    );
  }

  return {
    cliProvider,
  };
}

async function readPackageVersion(
  root: string,
  readTextFile: (path: string) => Promise<string>,
): Promise<string> {
  const packageJson = JSON.parse(
    await readTextFile(join(root, "package.json")),
  ) as {
    version?: string;
  };

  if (!packageJson.version) {
    throw new Error("package.json is missing version.");
  }

  return packageJson.version;
}

export function resolvePhase29OutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-29");
}

export function buildPhase29RcDryRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase29rc"}`;
}

export function buildPhase29TarballName(version: string): string {
  return `goodmemory-${version}.tgz`;
}

export function resolvePhase29RcDryRunReportPath(
  root: string,
  runId: string,
): string {
  return join(resolvePhase29OutputDir(root), runId, "phase-29-rc-dry-run.json");
}

export function parsePhase29RcDryRunCliOptions(
  argv: readonly string[],
): Phase29RcDryRunOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    tarballName: resolveCliFlagValue(argv, "--tarball-name"),
  };
}

export async function defaultRunPhase29RcDryRunCommand(
  command: Phase29RcDryRunCommand,
): Promise<Phase29RcDryRunCommandResult> {
  const startedAtMs = Date.now();
  const spawnedProcess = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: command.env ? { ...process.env, ...command.env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(spawnedProcess.stdout).text();
  const stderrPromise = new Response(spawnedProcess.stderr).text();
  const [exitCode, stdout, stderr] = await Promise.all([
    spawnedProcess.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  const finishedAtMs = Date.now();

  return {
    durationMs: finishedAtMs - startedAtMs,
    exitCode,
    stderr,
    stdout,
  };
}

export async function runPhase29RcDryRun(
  input?: Phase29RcDryRunOptions,
  dependencies?: Phase29RcDryRunDependencies,
): Promise<Phase29RcDryRunReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const detectBundledRuntime =
    dependencies?.detectBundledRuntime ??
    (() => detectBundledSQLiteVssRuntime() !== null);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const makeTempDir = dependencies?.makeTempDir ?? mkdtemp;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const renameFile = dependencies?.renameFile ?? rename;
  const removeDir = dependencies?.removeDir ?? rm;
  const runCommand =
    dependencies?.runCommand ?? defaultRunPhase29RcDryRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const startedAtMs = Date.now();
  const runId = input?.runId ?? buildPhase29RcDryRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase29OutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commands: Phase29RcDryRunExecutionResult[] = [];

  await ensureDir(runDirectory, { recursive: true });

  const version = await readPackageVersion(root, readTextFile);
  let tarballName = buildPhase29TarballName(version);
  let tarballPath = join(runDirectory, tarballName);
  const workspaceRoot = await makeTempDir(
    join(tmpdir(), "goodmemory-phase29-rc-dry-run-"),
  );

  const recordCommandResult = (
    command: Phase29RcDryRunCommand,
    result: Phase29RcDryRunCommandResult,
  ) => {
    commands.push({
      label: command.label,
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? "passed" : "failed",
      stdoutTail: tailLines(result.stdout),
      stderrTail: tailLines(result.stderr),
    });
  };

  try {
    const packageJsonCommand: Phase29RcDryRunCommand = {
      label: "create-workspace-package-json",
      cwd: workspaceRoot,
      args: ["write", "package.json"],
    };
    await writeTextFile(
      join(workspaceRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "goodmemory-phase-29-rc-dry-run",
          private: true,
          type: "module",
        },
        null,
        2,
      )}\n`,
    );
    recordCommandResult(packageJsonCommand, {
      durationMs: 0,
      exitCode: 0,
      stderr: "",
      stdout: "package.json written",
    });

    const packCommand: Phase29RcDryRunCommand = {
      label: "pack-tarball",
      cwd: root,
      args: ["bun", "pm", "pack", "--destination", runDirectory, "--quiet"],
    };
    const packResult = await runCommand(packCommand);
    recordCommandResult(packCommand, packResult);

    if (packResult.exitCode !== 0) {
      throw new Error("Failed to pack Phase 29 tarball.");
    }

    const tarballOutput = packResult.stdout.trim();
    const generatedTarballName =
      tarballOutput.length > 0
        ? basename(tarballOutput)
        : buildPhase29TarballName(version);
    tarballName = input?.tarballName ?? generatedTarballName;
    tarballPath =
      tarballOutput.length === 0
        ? join(runDirectory, tarballName)
        : tarballOutput.includes("/")
          ? tarballOutput
          : join(runDirectory, tarballOutput);

    if (tarballName !== generatedTarballName) {
      await renameFile(
        tarballPath,
        join(runDirectory, tarballName),
      );
      tarballPath = join(runDirectory, tarballName);
    }

    const installCommand: Phase29RcDryRunCommand = {
      label: "install-tarball",
      cwd: workspaceRoot,
      env: { ...PHASE29_RELEASE_ENV },
      args: ["bun", "add", tarballPath],
    };
    const installResult = await runCommand(installCommand);
    recordCommandResult(installCommand, installResult);

    if (installResult.exitCode !== 0) {
      throw new Error("Failed to install packed tarball in dry-run workspace.");
    }

    const smokeFileCommand: Phase29RcDryRunCommand = {
      label: "write-smoke-script",
      cwd: workspaceRoot,
      args: ["write", PHASE29_RC_SMOKE_FILE],
    };
    await writeTextFile(
      join(workspaceRoot, PHASE29_RC_SMOKE_FILE),
      `${PHASE29_RC_SMOKE_SOURCE}\n`,
    );
    recordCommandResult(smokeFileCommand, {
      durationMs: 0,
      exitCode: 0,
      stderr: "",
      stdout: `${PHASE29_RC_SMOKE_FILE} written`,
    });

    const smokeCommand: Phase29RcDryRunCommand = {
      label: "public-reference-smoke",
      cwd: workspaceRoot,
      env: { ...PHASE29_RELEASE_ENV },
      args: ["bun", "run", PHASE29_RC_SMOKE_FILE],
    };
    const smokeResult = await runCommand(smokeCommand);
    recordCommandResult(smokeCommand, smokeResult);

    if (smokeResult.exitCode !== 0) {
      throw new Error("Packed tarball failed the public reference smoke.");
    }

    const smokeVerification = assertPhase29SmokeOutput(smokeResult.stdout);
    const cliCommand: Phase29RcDryRunCommand = {
      label: "installed-cli-stats",
      cwd: workspaceRoot,
      env: { ...PHASE29_RELEASE_ENV },
      args: [
        "bun",
        "run",
        "goodmemory",
        "--",
        "stats",
        "--json",
        "--user-id",
        "consumer-user",
        "--workspace-id",
        "consumer-workspace",
      ],
    };
    const cliResult = await runCommand(cliCommand);
    recordCommandResult(cliCommand, cliResult);

    if (cliResult.exitCode !== 0) {
      throw new Error("Installed CLI failed in the Phase 29 dry run.");
    }

    const cliVerification = assertPhase29CliOutput(cliResult.stdout);
    const sqliteRuntimeOutcome = detectBundledRuntime()
      ? "bundled sqlite-vss runtime detected; dry run remained rules-only because GOODMEMORY_EMBEDDING_* was unset"
      : "bundled sqlite-vss runtime not detected; dry run verified explicit durable fallback under rules-only mode";
    const elapsedMs = Date.now() - startedAtMs;
    const report: Phase29RcDryRunReport = {
      acceptance: {
        decision: "accepted",
        reason:
          "Packed tarball installed cleanly in a fresh Bun workspace, public imports worked, and the installed CLI succeeded on the default local-first runtime.",
      },
      artifact: {
        packageSpec: tarballPath,
        tarballName,
        tarballPath,
      },
      commands,
      elapsedMs,
      generatedAt,
      generatedBy: GENERATED_BY,
      phase: "phase-29",
      releaseContract: {
        distribution: "tarball-first",
        runtime: "bun-only",
        version,
      },
      runDirectory,
      runId,
      verification: {
        artifactPaths: smokeVerification.artifactPaths,
        cliCommand: formatCommand(cliCommand.args),
        cliProvider: cliVerification.cliProvider,
        contextIncludesBlocker: smokeVerification.contextIncludesBlocker,
        docsInstallCommand: `bun add ./${tarballName}`,
        recallHitCount: smokeVerification.recallHitCount,
        runtimeMode: "rules-only",
        smokeOk: smokeVerification.smokeOk,
        sqliteRuntimeOutcome,
      },
    };

    await writeTextFile(
      join(runDirectory, "phase-29-rc-dry-run.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    return report;
  } catch (error) {
    const elapsedMs = Date.now() - startedAtMs;
    const report: Phase29RcDryRunReport = {
      acceptance: {
        decision: "blocked",
        reason: error instanceof Error ? error.message : String(error),
      },
      artifact: {
        packageSpec: tarballPath,
        tarballName,
        tarballPath,
      },
      commands,
      elapsedMs,
      generatedAt,
      generatedBy: GENERATED_BY,
      phase: "phase-29",
      releaseContract: {
        distribution: "tarball-first",
        runtime: "bun-only",
        version,
      },
      runDirectory,
      runId,
      verification: {
        artifactPaths: [],
        cliCommand:
          "bun run goodmemory -- stats --json --user-id consumer-user --workspace-id consumer-workspace",
        contextIncludesBlocker: false,
        docsInstallCommand: `bun add ./${tarballName}`,
        runtimeMode: "rules-only",
        smokeOk: false,
        sqliteRuntimeOutcome: detectBundledRuntime()
          ? "bundled sqlite-vss runtime detected"
          : "bundled sqlite-vss runtime not detected",
      },
    };

    await writeTextFile(
      join(runDirectory, "phase-29-rc-dry-run.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    return report;
  } finally {
    await removeDir(workspaceRoot, { recursive: true, force: true });
  }
}

export async function runPhase29RcDryRunCli(
  dependencies?: Phase29RcDryRunCliDependencies,
): Promise<Phase29RcDryRunReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runDryRun = dependencies?.runDryRun ?? runPhase29RcDryRun;
  const options = parsePhase29RcDryRunCliOptions(argv);
  const report = await runDryRun(options);

  log(
    `Phase 29 RC dry run: ${report.acceptance.decision} (${report.acceptance.reason})`,
  );

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase29RcDryRunCli();
}
