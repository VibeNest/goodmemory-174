import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import {
  buildPackageTarballName,
  resolveCurrentPackageMetadataSync,
} from "./package-metadata";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const CURRENT_TARBALL_NAME = buildPackageTarballName(
  resolveCurrentPackageMetadataSync(import.meta.url),
);

const GENERATED_BY = "scripts/run-phase-41-live-memory.ts";
const PHASE41_CANONICAL_LIVE_RUN_ID = "run-phase41-live-current";
const PHASE41_SESSION_ID = "consumer-session";
const PHASE41_USER_ID = "consumer-user";
const PHASE41_WORKSPACE_ID = "consumer-workspace";
const PHASE41_SEED_SCRIPT_PATH = "phase41-seed-installed-memory.mjs";
const PHASE41_INSPECT_SCRIPT_PATH = "phase41-inspect-installed-memory.mjs";
const PHASE41_CLI_ENV = {
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
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
  GOODMEMORY_TEST_POSTGRES_URL: "",
} as const;

export interface Phase41LiveMemoryCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label:
    | "pack-tarball"
    | "install-tarball"
    | "codex-install"
    | "codex-enable"
    | "seed-installed-memory"
    | "codex-hook-pre-tool-use-deepanalyzer"
    | "codex-action-deepanalyzer"
    | "codex-hook-pre-tool-use-destructive"
    | "codex-action-destructive"
    | "codex-hook-pre-tool-use-low-risk"
    | "inspect-installed-storage";
  stdin?: string;
}

export interface Phase41LiveMemoryCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase41LiveMemoryExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: Phase41LiveMemoryCommand["label"];
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase41LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase41LiveMemoryExecutionResult[];
  evidence: {
    install: {
      registeredPreToolUseMatchesManagedConfig: boolean;
      repoOptInEnabled: boolean;
      workspaceId?: string;
    };
    preAction: {
      deepAnalyzerDenied: boolean;
      deepAnalyzerExecutedStep?: string;
      destructiveVetoed: boolean;
      lowRiskAllowed: boolean;
      sharedInstalledStorage: boolean;
    };
    releaseContract: {
      distribution: "tarball-first";
      runtime: "bun-only";
      tarballName: string;
    };
  };
  evidenceContract: {
    phase41: {
      packageBoundary: "installed_package_public_imports";
      runner: "scripts/run-phase-41-live-memory.ts";
      runtimePath: "installed_package_pretooluse_and_action_bridge";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-41-live-memory.ts";
  mode: "live-memory";
  outputDir: string;
  phase: "phase-41";
  runDirectory: string;
  runId: string;
}

export interface Phase41LiveMemoryOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase41LiveMemoryDependencies {
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
  runCommand?: (
    command: Phase41LiveMemoryCommand,
  ) => Promise<Phase41LiveMemoryCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase41LiveMemoryCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (options?: Phase41LiveMemoryOptions) => Promise<Phase41LiveReport>;
}

interface Phase41InspectPayload {
  actionTraceRecorded: boolean;
  followupTraceRecorded: boolean;
  sharedInstalledStorage: boolean;
  toolResultEvidenceRecorded: boolean;
}

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/u).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function createChildEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }

  return env;
}

function createInstalledPackageEnv(
  workspaceRoot: string,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const binPath = join(workspaceRoot, "node_modules", ".bin");
  const existingPath = overrides.PATH ?? process.env.PATH ?? "";
  return {
    ...overrides,
    PATH:
      existingPath.length > 0
        ? `${binPath}${delimiter}${existingPath}`
        : binPath,
  };
}

function toExecutionResult(
  command: Phase41LiveMemoryCommand,
  result: Phase41LiveMemoryCommandResult,
): Phase41LiveMemoryExecutionResult {
  return {
    command: formatCommand(command.args),
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    label: command.label,
    status: result.exitCode === 0 ? "passed" : "failed",
    stderrTail: tailLines(result.stderr),
    stdoutTail: tailLines(result.stdout),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\"'\"'`)}'`;
}

function resolveTarballPath(
  outputDir: string,
  stdout: string,
): { tarballName: string; tarballPath: string } {
  const tarballOutput = stdout.trim();
  const tarballName =
    tarballOutput.length === 0
      ? CURRENT_TARBALL_NAME
      : tarballOutput.includes("/")
        ? basename(tarballOutput)
        : tarballOutput;
  const tarballPath =
    tarballOutput.length === 0
      ? join(outputDir, tarballName)
      : tarballOutput.includes("/")
        ? tarballOutput
        : join(outputDir, tarballOutput);

  return {
    tarballName,
    tarballPath,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJsonObject<T>(value: string): T {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Expected JSON output but received an empty string.");
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Expected JSON output but received: ${trimmed}`);
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

function buildManagedPreToolUseCommand(homeRoot: string): string {
  return [
    `GOODMEMORY_HOME=${shellQuote(homeRoot)}`,
    "GOODMEMORY_MANAGED_BY='goodmemory'",
    "goodmemory",
    "codex",
    "hook",
    "pre-tool-use",
  ].join(" ");
}

function resolveRegisteredPreToolUseCommands(config: string): string[] {
  const parsed = JSON.parse(config) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.hooks)) {
    return [];
  }

  const eventValue = parsed.hooks.PreToolUse;
  if (!Array.isArray(eventValue)) {
    return [];
  }

  const commands: string[] = [];
  for (const group of eventValue) {
    if (
      !isRecord(group) ||
      group.matcher !== "Bash" ||
      !Array.isArray(group.hooks)
    ) {
      continue;
    }
    for (const hook of group.hooks) {
      if (
        isRecord(hook) &&
        hook.type === "command" &&
        typeof hook.command === "string" &&
        hook.command.includes("goodmemory codex hook pre-tool-use")
      ) {
        commands.push(hook.command);
      }
    }
  }

  return commands;
}

async function runRegisteredPreToolUseCommand(input: {
  env: Record<string, string>;
  homeRoot: string;
  hooksConfig: string;
  label:
    | "codex-hook-pre-tool-use-deepanalyzer"
    | "codex-hook-pre-tool-use-destructive"
    | "codex-hook-pre-tool-use-low-risk";
  payload: Record<string, unknown>;
  runCommand: (
    command: Phase41LiveMemoryCommand,
  ) => Promise<Phase41LiveMemoryCommandResult>;
  workspaceRoot: string;
}): Promise<{
  command: Phase41LiveMemoryCommand;
  registeredPreToolUseMatchesManagedConfig: boolean;
  result: Phase41LiveMemoryCommandResult;
}> {
  const registeredCommands = resolveRegisteredPreToolUseCommands(input.hooksConfig);
  const expectedCommand = buildManagedPreToolUseCommand(input.homeRoot);
  const registeredCommand = registeredCommands.includes(expectedCommand)
    ? expectedCommand
    : registeredCommands[0] ?? null;
  const command: Phase41LiveMemoryCommand = {
    args: ["sh", "-c", registeredCommand ?? ""],
    cwd: input.workspaceRoot,
    env: createInstalledPackageEnv(input.workspaceRoot, input.env),
    label: input.label,
    stdin: JSON.stringify(input.payload),
  };
  const registeredPreToolUseMatchesManagedConfig =
    registeredCommand === expectedCommand;

  if (!registeredPreToolUseMatchesManagedConfig) {
    return {
      command,
      registeredPreToolUseMatchesManagedConfig,
      result: {
        durationMs: 0,
        exitCode: 1,
        stderr:
          registeredCommand === null
            ? "No managed PreToolUse command was registered."
            : "Registered PreToolUse command does not match the GoodMemory-managed install command.",
        stdout: "",
      },
    };
  }

  return {
    command,
    registeredPreToolUseMatchesManagedConfig,
    result: await input.runCommand(command),
  };
}

function extractRecommendedActionCommand(result: Phase41LiveMemoryCommandResult): string | null {
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
    return null;
  }

  const payload = extractJsonObject<{
    hookSpecificOutput?: {
      permissionDecision?: string;
      permissionDecisionReason?: string;
    };
  }>(result.stdout);
  const reason = payload.hookSpecificOutput?.permissionDecisionReason ?? "";
  const match = reason.match(/Run this instead:\s*(.+)$/u);
  return match?.[1]?.trim() ?? null;
}

function buildSeedScript(sqlitePath: string): string {
  return [
    'import {',
    "  createEvidenceRecord,",
    "  createFeedbackMemory,",
    "  createGoodMemory,",
    "  createMemorySource,",
    "  createSQLiteDocumentStore,",
    "  createSQLiteSessionStore,",
    "  EVIDENCE_COLLECTION,",
    '} from "goodmemory";',
    "",
    `const sqlitePath = ${JSON.stringify(sqlitePath)};`,
    `const scope = ${JSON.stringify({
      sessionId: PHASE41_SESSION_ID,
      userId: PHASE41_USER_ID,
      workspaceId: PHASE41_WORKSPACE_ID,
    })};`,
    "const documentStore = createSQLiteDocumentStore(sqlitePath);",
    "const sessionStore = createSQLiteSessionStore(sqlitePath);",
    "const memory = createGoodMemory({",
    "  adapters: { documentStore, sessionStore },",
    "  storage: { provider: \"sqlite\", url: sqlitePath },",
    "});",
    "const source = createMemorySource({",
    '  method: "explicit",',
    '  extractedAt: "2026-04-25T00:00:00.000Z",',
    `  sessionId: ${JSON.stringify(PHASE41_SESSION_ID)},`,
    "});",
    "",
    "await documentStore.set(",
    '  "feedback",',
    '  "feedback-rewrite",',
    "  createFeedbackMemory({",
    '    id: "feedback-rewrite",',
    `    userId: ${JSON.stringify(PHASE41_USER_ID)},`,
    `    workspaceId: ${JSON.stringify(PHASE41_WORKSPACE_ID)},`,
    `    sessionId: ${JSON.stringify(PHASE41_SESSION_ID)},`,
    '    kind: "validated_pattern",',
    '    appliesTo: "coding_agent",',
    '    rule: "Rather than DeepAnalyzer, use QuickCheck first.",',
    '    evidence: ["evidence-rewrite"],',
    "    source,",
    "  }),",
    ");",
    "await documentStore.set(",
    "  EVIDENCE_COLLECTION,",
    '  "evidence-rewrite",',
    "  createEvidenceRecord({",
    '    id: "evidence-rewrite",',
    `    userId: ${JSON.stringify(PHASE41_USER_ID)},`,
    `    workspaceId: ${JSON.stringify(PHASE41_WORKSPACE_ID)},`,
    `    sessionId: ${JSON.stringify(PHASE41_SESSION_ID)},`,
    '    kind: "correction_context",',
    '    excerpt: "DeepAnalyzer detailed scan failed because QuickCheck had not run first.",',
    "    source,",
    '    sourceMessageIds: ["message-rewrite"],',
    "  }),",
    ");",
    "",
    "await documentStore.set(",
    '  "feedback",',
    '  "feedback-block",',
    "  createFeedbackMemory({",
    '    id: "feedback-block",',
    `    userId: ${JSON.stringify(PHASE41_USER_ID)},`,
    `    workspaceId: ${JSON.stringify(PHASE41_WORKSPACE_ID)},`,
    `    sessionId: ${JSON.stringify(PHASE41_SESSION_ID)},`,
    '    kind: "validated_pattern",',
    '    appliesTo: "coding_agent",',
    '    rule: "Never delete AGENTS.md from the host bootstrap surface.",',
    '    why: "It breaks repo-local host wiring and package bootstrap continuity.",',
    '    evidence: ["evidence-block"],',
    "    source,",
    "  }),",
    ");",
    "await documentStore.set(",
    "  EVIDENCE_COLLECTION,",
    '  "evidence-block",',
    "  createEvidenceRecord({",
    '    id: "evidence-block",',
    `    userId: ${JSON.stringify(PHASE41_USER_ID)},`,
    `    workspaceId: ${JSON.stringify(PHASE41_WORKSPACE_ID)},`,
    `    sessionId: ${JSON.stringify(PHASE41_SESSION_ID)},`,
    '    kind: "verification_result",',
    '    excerpt: "Deleting AGENTS.md broke the repo-local host bootstrap surface.",',
    "    source,",
    '    sourceMessageIds: ["message-block"],',
    "  }),",
    ");",
    "",
    "await memory.runtime.startSession({ scope });",
    "await memory.runtime.startSession({ scope: { ...scope, agentId: \"codex\" } });",
    "await memory.runtime.updateWorkingMemory({",
    "  scope: { ...scope, agentId: \"codex\" },",
    "  patch: { currentGoal: \"Close the installed pre-action rollout\" },",
    "});",
    "await memory.runtime.updateWorkingMemory({",
    "  scope,",
    "  patch: { temporaryDecisions: [\"Use the current runbook before deploy.\"] },",
    "});",
    "await memory.runtime.updateSessionJournal({",
    "  scope,",
    "  patch: {",
    '    currentState: "Deployment verification still needs the current runbook.",',
    '    workflow: ["Review the exported session handoff"],',
    "  },",
    "});",
    "",
    'console.log(JSON.stringify({ ok: true }));',
    "",
  ].join("\n");
}

function buildInspectScript(sqlitePath: string): string {
  return [
    'import {',
    "  createGoodMemory,",
    "  createSQLiteDocumentStore,",
    "  createSQLiteSessionStore,",
    '} from "goodmemory";',
    "",
    `const sqlitePath = ${JSON.stringify(sqlitePath)};`,
    "const memory = createGoodMemory({",
    "  adapters: {",
    "    documentStore: createSQLiteDocumentStore(sqlitePath),",
    "    sessionStore: createSQLiteSessionStore(sqlitePath),",
    "  },",
    "  storage: { provider: \"sqlite\", url: sqlitePath },",
    "});",
    `const scope = ${JSON.stringify({
      agentId: "codex",
      sessionId: PHASE41_SESSION_ID,
      userId: PHASE41_USER_ID,
      workspaceId: PHASE41_WORKSPACE_ID,
    })};`,
    "const exported = await memory.exportMemory({ scope, includeRuntime: true });",
    "const actionTraceIds = exported.durable.experiences",
    "  .map((record) => record.traceId)",
    "  .filter((traceId) => typeof traceId === \"string\" && traceId.startsWith(\"goodmemory-installed-pretool-\"));",
    "const actionRecord = exported.durable.experiences.find((record) =>",
    "  typeof record.traceId === \"string\" && record.traceId.startsWith(\"goodmemory-installed-pretool-\")",
    ");",
    "const followupTraceRecorded = actionTraceIds.some((traceId) =>",
    "  exported.durable.experiences.some((record) =>",
    "    Array.isArray(record.sourceTraceIds) &&",
    "    record.sourceTraceIds.includes(traceId) &&",
    "    record.traceId !== traceId",
    "  )",
    ");",
    "const toolResultEvidenceRecorded = exported.durable.evidence.some((record) =>",
    '  record.kind === "tool_result_excerpt"',
    ");",
    "console.log(JSON.stringify({",
    "  actionTraceRecorded: Boolean(actionRecord),",
    "  followupTraceRecorded,",
    "  toolResultEvidenceRecorded,",
    "  sharedInstalledStorage:",
    "    Boolean(actionRecord) && followupTraceRecorded && toolResultEvidenceRecorded,",
    "}));",
    "",
  ].join("\n");
}

async function defaultRunPhase41LiveMemoryCommand(
  command: Phase41LiveMemoryCommand,
): Promise<Phase41LiveMemoryCommandResult> {
  const startedAtMs = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: command.env ? createChildEnv(command.env) : createChildEnv(),
    stderr: "pipe",
    stdin: command.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
  });

  if (command.stdin !== undefined) {
    if (!child.stdin) {
      throw new Error(`Command ${command.label} did not expose a writable stdin.`);
    }
    child.stdin.write(command.stdin);
    child.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    durationMs: Date.now() - startedAtMs,
    exitCode,
    stderr,
    stdout,
  };
}

export function resolvePhase41LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-41");
}

export function buildPhase41LiveMemoryRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase41live"}`;
}

export function parsePhase41LiveMemoryCliOptions(
  argv: readonly string[],
): Phase41LiveMemoryOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase41LiveMemoryEvaluation(
  options: Phase41LiveMemoryOptions = {},
  dependencies: Phase41LiveMemoryDependencies = {},
): Promise<Phase41LiveReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase41LiveMemoryOutputDir(root);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const makeTempDir =
    dependencies.makeTempDir ??
    ((prefix: string) => mkdtemp(join(tmpdir(), prefix)));
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const removeDir = dependencies.removeDir ?? rm;
  const runCommand =
    dependencies.runCommand ?? defaultRunPhase41LiveMemoryCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const timestamp = (dependencies.now ?? (() => new Date().toISOString()))();
  const runId = options.runId ?? PHASE41_CANONICAL_LIVE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const commands: Phase41LiveMemoryExecutionResult[] = [];
  const packDir = await makeTempDir("goodmemory-phase41-pack-");
  const workspaceRoot = await makeTempDir("goodmemory-phase41-workspace-");
  const homeRoot = await makeTempDir("goodmemory-phase41-home-");
  const sqlitePath = join(homeRoot, ".goodmemory", "memory.sqlite");
  const packageJsonPath = join(workspaceRoot, "package.json");

  try {
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      packageJsonPath,
      JSON.stringify(
        {
          dependencies: {},
          name: "goodmemory-phase41-consumer",
          private: true,
          version: "0.0.0",
        },
        null,
        2,
      ) + "\n",
    );

    const packCommand: Phase41LiveMemoryCommand = {
      args: ["bun", "pm", "pack", "--destination", packDir, "--quiet"],
      cwd: root,
      env: PHASE41_CLI_ENV,
      label: "pack-tarball",
    };
    const packResult = await runCommand(packCommand);
    commands.push(toExecutionResult(packCommand, packResult));
    if (packResult.exitCode !== 0) {
      throw new Error("Failed to pack the Phase 41 tarball.");
    }
    const { tarballName, tarballPath } = resolveTarballPath(packDir, packResult.stdout);

    await writeTextFile(
      packageJsonPath,
      JSON.stringify(
        {
          dependencies: {
            goodmemory: `file:${tarballPath}`,
          },
          name: "goodmemory-phase41-consumer",
          private: true,
          version: "0.0.0",
        },
        null,
        2,
      ) + "\n",
    );

    const installTarballCommand: Phase41LiveMemoryCommand = {
      args: ["bun", "install"],
      cwd: workspaceRoot,
      env: PHASE41_CLI_ENV,
      label: "install-tarball",
    };
    const installTarballResult = await runCommand(installTarballCommand);
    commands.push(toExecutionResult(installTarballCommand, installTarballResult));
    if (installTarballResult.exitCode !== 0) {
      throw new Error("Failed to install the packed Phase 41 tarball.");
    }

    await mkdir(join(workspaceRoot, "tools"), { recursive: true });
    await writeTextFile(
      join(workspaceRoot, "tools", "QuickCheck"),
      [
        "#!/usr/bin/env sh",
        `echo quickcheck >> ${JSON.stringify(join(workspaceRoot, "quickcheck.log"))}`,
      ].join("\n"),
    );
    await writeTextFile(
      join(workspaceRoot, "tools", "DeepAnalyzer"),
      [
        "#!/usr/bin/env sh",
        `echo deepanalyzer >> ${JSON.stringify(join(workspaceRoot, "deepanalyzer.log"))}`,
      ].join("\n"),
    );
    await writeTextFile(join(workspaceRoot, "AGENTS.md"), "# Managed\n");
    await chmod(join(workspaceRoot, "tools", "QuickCheck"), 0o755);
    await chmod(join(workspaceRoot, "tools", "DeepAnalyzer"), 0o755);

    const managedEnv = {
      ...PHASE41_CLI_ENV,
      GOODMEMORY_HOME: homeRoot,
    };
    const codexInstallCommand: Phase41LiveMemoryCommand = {
      args: [
        "./node_modules/.bin/goodmemory",
        "install",
        "codex",
        "--user-id",
        PHASE41_USER_ID,
        "--json",
      ],
      cwd: workspaceRoot,
      env: managedEnv,
      label: "codex-install",
    };
    const codexInstallResult = await runCommand(codexInstallCommand);
    commands.push(toExecutionResult(codexInstallCommand, codexInstallResult));
    if (codexInstallResult.exitCode !== 0) {
      throw new Error("Failed to install Codex middleware config for Phase 41.");
    }

    const codexEnableCommand: Phase41LiveMemoryCommand = {
      args: [
        "./node_modules/.bin/goodmemory",
        "enable",
        "codex",
        "--workspace-id",
        PHASE41_WORKSPACE_ID,
        "--workspace-root",
        workspaceRoot,
        "--json",
      ],
      cwd: workspaceRoot,
      env: managedEnv,
      label: "codex-enable",
    };
    const codexEnableResult = await runCommand(codexEnableCommand);
    commands.push(toExecutionResult(codexEnableCommand, codexEnableResult));
    if (codexEnableResult.exitCode !== 0) {
      throw new Error("Failed to enable the Codex repo opt-in for Phase 41.");
    }

    await writeTextFile(join(workspaceRoot, PHASE41_SEED_SCRIPT_PATH), buildSeedScript(sqlitePath));
    const seedCommand: Phase41LiveMemoryCommand = {
      args: ["bun", `./${PHASE41_SEED_SCRIPT_PATH}`],
      cwd: workspaceRoot,
      env: managedEnv,
      label: "seed-installed-memory",
    };
    const seedResult = await runCommand(seedCommand);
    commands.push(toExecutionResult(seedCommand, seedResult));
    if (seedResult.exitCode !== 0) {
      throw new Error("Failed to seed Phase 41 installed memory.");
    }

    await writeTextFile(
      join(workspaceRoot, PHASE41_INSPECT_SCRIPT_PATH),
      buildInspectScript(sqlitePath),
    );

    const hooksConfig = await readTextFile(join(homeRoot, ".codex/hooks.json"));
    const repoOptIn = JSON.parse(
      await readTextFile(join(workspaceRoot, ".goodmemory/codex.json")),
    ) as {
      enabled?: boolean;
      workspaceId?: string;
    };

    const deepAnalyzerHook = await runRegisteredPreToolUseCommand({
      env: managedEnv,
      homeRoot,
      hooksConfig,
      label: "codex-hook-pre-tool-use-deepanalyzer",
      payload: {
        cwd: workspaceRoot,
        hook_event_name: "PreToolUse",
        session_id: PHASE41_SESSION_ID,
        tool_input: {
          command: "./tools/DeepAnalyzer --detailed",
        },
        tool_name: "Bash",
      },
      runCommand,
      workspaceRoot,
    });
    commands.push(toExecutionResult(deepAnalyzerHook.command, deepAnalyzerHook.result));
    const deepAnalyzerActionCommand = extractRecommendedActionCommand(
      deepAnalyzerHook.result,
    );
    const deepAnalyzerActionResult = deepAnalyzerActionCommand
      ? await runCommand({
          args: ["sh", "-c", deepAnalyzerActionCommand],
          cwd: workspaceRoot,
          env: createInstalledPackageEnv(workspaceRoot, managedEnv),
          label: "codex-action-deepanalyzer",
        })
      : {
          durationMs: 0,
          exitCode: 1,
          stderr: "No recommended action command was returned for the DeepAnalyzer deny payload.",
          stdout: "",
        };
    commands.push(
      toExecutionResult(
        {
          args: ["sh", "-c", deepAnalyzerActionCommand ?? ""],
          cwd: workspaceRoot,
          env: createInstalledPackageEnv(workspaceRoot, managedEnv),
          label: "codex-action-deepanalyzer",
        },
        deepAnalyzerActionResult,
      ),
    );

    const destructiveHook = await runRegisteredPreToolUseCommand({
      env: managedEnv,
      homeRoot,
      hooksConfig,
      label: "codex-hook-pre-tool-use-destructive",
      payload: {
        cwd: workspaceRoot,
        hook_event_name: "PreToolUse",
        session_id: PHASE41_SESSION_ID,
        tool_input: {
          command: "rm -rf AGENTS.md",
        },
        tool_name: "Bash",
      },
      runCommand,
      workspaceRoot,
    });
    commands.push(toExecutionResult(destructiveHook.command, destructiveHook.result));
    const destructiveActionCommand = extractRecommendedActionCommand(
      destructiveHook.result,
    );
    const destructiveActionResult = destructiveActionCommand
      ? await runCommand({
          args: ["sh", "-c", destructiveActionCommand],
          cwd: workspaceRoot,
          env: createInstalledPackageEnv(workspaceRoot, managedEnv),
          label: "codex-action-destructive",
        })
      : {
          durationMs: 0,
          exitCode: 1,
          stderr: "No recommended action command was returned for the destructive deny payload.",
          stdout: "",
        };
    commands.push(
      toExecutionResult(
        {
          args: ["sh", "-c", destructiveActionCommand ?? ""],
          cwd: workspaceRoot,
          env: createInstalledPackageEnv(workspaceRoot, managedEnv),
          label: "codex-action-destructive",
        },
        destructiveActionResult,
      ),
    );

    const lowRiskHook = await runRegisteredPreToolUseCommand({
      env: managedEnv,
      homeRoot,
      hooksConfig,
      label: "codex-hook-pre-tool-use-low-risk",
      payload: {
        cwd: workspaceRoot,
        hook_event_name: "PreToolUse",
        session_id: PHASE41_SESSION_ID,
        tool_input: {
          command: "./tools/QuickCheck --network",
        },
        tool_name: "Bash",
      },
      runCommand,
      workspaceRoot,
    });
    commands.push(toExecutionResult(lowRiskHook.command, lowRiskHook.result));

    const inspectCommand: Phase41LiveMemoryCommand = {
      args: ["bun", `./${PHASE41_INSPECT_SCRIPT_PATH}`],
      cwd: workspaceRoot,
      env: managedEnv,
      label: "inspect-installed-storage",
    };
    const inspectResult = await runCommand(inspectCommand);
    commands.push(toExecutionResult(inspectCommand, inspectResult));
    if (inspectResult.exitCode !== 0) {
      throw new Error("Failed to inspect Phase 41 installed storage evidence.");
    }

    const deepAnalyzerDenied = deepAnalyzerHook.result.stdout.includes(
      '"permissionDecision":"deny"',
    ) || deepAnalyzerHook.result.stdout.includes('"permissionDecision": "deny"');
    const deepAnalyzerActionPayload =
      deepAnalyzerActionResult.stdout.trim().length > 0
        ? extractJsonObject<{
            decision?: string;
            executed?: boolean;
            executedStep?: string;
          }>(deepAnalyzerActionResult.stdout)
        : {};
    const destructiveActionPayload =
      destructiveActionResult.stdout.trim().length > 0
        ? extractJsonObject<{
            decision?: string;
            executed?: boolean;
          }>(destructiveActionResult.stdout)
        : {};
    const inspectPayload = extractJsonObject<Phase41InspectPayload>(
      inspectResult.stdout,
    );

    const report: Phase41LiveReport = {
      acceptance: {
        decision:
          deepAnalyzerHook.registeredPreToolUseMatchesManagedConfig &&
          deepAnalyzerDenied &&
          deepAnalyzerActionPayload.executedStep === "./tools/QuickCheck" &&
          destructiveActionPayload.decision === "blocked" &&
          destructiveActionPayload.executed === false &&
          lowRiskHook.result.exitCode === 0 &&
          ["", "{}"].includes(lowRiskHook.result.stdout.trim()) &&
          inspectPayload.sharedInstalledStorage
            ? "accepted"
            : "blocked",
        reason:
          deepAnalyzerHook.registeredPreToolUseMatchesManagedConfig &&
          deepAnalyzerDenied &&
          deepAnalyzerActionPayload.executedStep === "./tools/QuickCheck" &&
          destructiveActionPayload.decision === "blocked" &&
          destructiveActionPayload.executed === false &&
          lowRiskHook.result.exitCode === 0 &&
          ["", "{}"].includes(lowRiskHook.result.stdout.trim()) &&
          inspectPayload.sharedInstalledStorage
            ? "Tarball-installed Codex used the managed PreToolUse hook, redirected DeepAnalyzer through the installed action bridge, vetoed destructive AGENTS deletion, left low-risk QuickCheck unblocked, and wrote action evidence to the shared installed storage."
            : "Phase 41 live installed Codex evidence did not satisfy the managed-hook, rewrite, veto, low-risk, and shared-storage contract.",
      },
      commands,
      evidence: {
        install: {
          registeredPreToolUseMatchesManagedConfig:
            deepAnalyzerHook.registeredPreToolUseMatchesManagedConfig,
          repoOptInEnabled: repoOptIn.enabled === true,
          workspaceId: repoOptIn.workspaceId,
        },
        preAction: {
          deepAnalyzerDenied,
          deepAnalyzerExecutedStep: deepAnalyzerActionPayload.executedStep,
          destructiveVetoed:
            destructiveActionPayload.decision === "blocked" &&
            destructiveActionPayload.executed === false,
          lowRiskAllowed:
            lowRiskHook.result.exitCode === 0 &&
            ["", "{}"].includes(lowRiskHook.result.stdout.trim()),
          sharedInstalledStorage: inspectPayload.sharedInstalledStorage,
        },
        releaseContract: {
          distribution: "tarball-first",
          runtime: "bun-only",
          tarballName,
        },
      },
      evidenceContract: {
        phase41: {
          packageBoundary: "installed_package_public_imports",
          runner: GENERATED_BY,
          runtimePath: "installed_package_pretooluse_and_action_bridge",
        },
      },
      generatedAt: timestamp,
      generatedBy: GENERATED_BY,
      mode: "live-memory",
      outputDir,
      phase: "phase-41",
      runDirectory,
      runId,
    };

    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );

    return report;
  } finally {
    await removeDir(packDir, { force: true, recursive: true });
    await removeDir(workspaceRoot, { force: true, recursive: true });
    await removeDir(homeRoot, { force: true, recursive: true });
  }
}

export async function main(
  dependencies: Phase41LiveMemoryCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const runEval = dependencies.runEval ?? runPhase41LiveMemoryEvaluation;
  const report = await runEval(parsePhase41LiveMemoryCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
