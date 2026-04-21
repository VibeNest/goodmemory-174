import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import { detectBundledSQLiteVssRuntime } from "../src/storage/sqliteRuntime";

export interface Phase28GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase28GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase28GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase28GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase28GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-28";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase28GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase28GateDependencies {
  detectBundledRuntime?: () => boolean;
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase28GateCommand) => Promise<Phase28GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase28GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase28GateOptions) => Promise<Phase28GateReport>;
}

const GENERATED_BY = "scripts/run-phase-28-gate.ts";
const PHASE28_TEST_ENV = {
  GOODMEMORY_EMBEDDING_API_KEY: "",
  GOODMEMORY_EMBEDDING_BASE_URL: "",
  GOODMEMORY_EMBEDDING_MODEL: "",
  GOODMEMORY_EMBEDDING_PROVIDER: "",
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_MODE: "",
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: "",
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
} as const;
const PHASE28_IN_SCOPE = [
  "real sqlite-vss indexed local backend on supported runtimes",
  "automatic bundled sqlite-vss runtime detection and explicit fallback diagnostics",
  "durable fallback and rules-only regressions preserved under the upgraded local backend",
  "phase-28 gate and canonical closure evidence",
] as const;
const PHASE28_OUT_OF_SCOPE = [
  "bundled local embedding generation",
  "installer CLI or package publish automation",
  "reopening phase-26 storage-resolution semantics",
  "claiming accelerated local support on unsupported runtimes",
] as const;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase28GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-28");
}

export function buildPhase28GateScope(): Phase28GateReport["scope"] {
  return {
    inScope: [...PHASE28_IN_SCOPE],
    outOfScope: [...PHASE28_OUT_OF_SCOPE],
  };
}

export function buildPhase28GateCommands(root: string): Phase28GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-28-targeted-regressions",
      cwd: root,
      env: { ...PHASE28_TEST_ENV },
      args: [
        "bun",
        "test",
        "tests/unit/sqlite.runtime.test.ts",
        "tests/unit/sqlite.vector-extension.search.test.ts",
        "tests/unit/run-phase-28.script.test.ts",
        "tests/integration/storage.sqlite.test.ts",
        "tests/integration/storage.sqlite-vss.test.ts",
        "tests/integration/api.auto-storage.test.ts",
        "tests/cli/cli.test.ts",
      ],
    },
  ];
}

export async function defaultRunPhase28GateCommand(
  command: Phase28GateCommand,
): Promise<Phase28GateCommandResult> {
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

export function buildPhase28GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase28"}`;
}

export async function runPhase28QualityGate(
  input?: Phase28GateOptions,
  dependencies?: Phase28GateDependencies,
): Promise<Phase28GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const detectBundledRuntime =
    dependencies?.detectBundledRuntime ??
    (() => detectBundledSQLiteVssRuntime() !== null);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const runCommand =
    dependencies?.runCommand ?? defaultRunPhase28GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase28GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase28GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commands: Phase28GateExecutionResult[] = [];

  if (!detectBundledRuntime()) {
    const blocked: Phase28GateReport = {
      acceptance: {
        decision: "blocked",
        reason:
          "Phase 28 requires a supported sqlite-vss runtime on the current machine before the canonical gate can pass.",
      },
      commands,
      generatedAt,
      generatedBy: GENERATED_BY,
      phase: "phase-28",
      runDirectory,
      runId,
      scope: buildPhase28GateScope(),
    };

    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "phase-28-quality-gate.json"),
      `${JSON.stringify(blocked, null, 2)}\n`,
    );

    return blocked;
  }

  for (const command of buildPhase28GateCommands(root)) {
    const result = await runCommand(command);
    commands.push({
      label: command.label,
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? "passed" : "failed",
      stdoutTail: tailLines(result.stdout),
      stderrTail: tailLines(result.stderr),
    });

    if (result.exitCode !== 0) {
      break;
    }
  }

  const failedCommand = commands.find((command) => command.status === "failed");
  const report: Phase28GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 28 real sqlite-vss local acceleration, explicit fallback diagnostics, and Phase 26 compatibility guarantees are regression-covered on a supported runtime.",
        },
    commands,
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-28",
    runDirectory,
    runId,
    scope: buildPhase28GateScope(),
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-28-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export function parsePhase28GateCliOptions(
  argv: readonly string[],
): Phase28GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase28GateCli(
  dependencies?: Phase28GateCliDependencies,
): Promise<Phase28GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase28QualityGate(options));
  const report = await runGate(parsePhase28GateCliOptions(argv));

  log(`Phase 28 quality gate: ${report.acceptance.decision}`);
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase28GateCli();
}
