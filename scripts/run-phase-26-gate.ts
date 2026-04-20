import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase26GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase26GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase26GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase26GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase26GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-26";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase26GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase26GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase26GateCommand) => Promise<Phase26GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase26GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase26GateOptions) => Promise<Phase26GateReport>;
}

const GENERATED_BY = "scripts/run-phase-26-gate.ts";
const PHASE26_CANONICAL_RUN_ID = "run-20260420193000";
const PHASE26_CANONICAL_REPORT_FILE_NAME = "phase-26-quality-gate.json";
const PHASE26_CANONICAL_ARTIFACT_SHA256 =
  "0951b1a92652df7f3320f24c3bdeff1d3bb8bbeab7347cc5516cea70e5290f6f";
const PHASE26_IN_SCOPE = [
  "default storage resolution with explicit-over-auto precedence",
  "automatic embedding enablement via GOODMEMORY_EMBEDDING_*",
  "durable local SQLite vector storage",
  "SQLite runtime guardrails and extension-assisted search path",
  "CLI/runtime storage-resolution alignment",
  "phase-26 closure contract for the gate script and canonical accepted evidence chain",
] as const;
const PHASE26_OUT_OF_SCOPE = [
  "promoting sqlite-vss indexed acceleration as the canonical default backend",
  "provider-backed live-memory acceptance evidence for phase-26 closure",
  "widening the public config surface beyond the current local-first defaults",
] as const;
const PHASE26_DETERMINISTIC_TEST_ENV = {
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

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase26GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-26");
}

export function resolvePhase26CanonicalRunDirectory(root: string): string {
  return join(resolvePhase26GateOutputDir(root), PHASE26_CANONICAL_RUN_ID);
}

export function resolvePhase26CanonicalReportPath(root: string): string {
  return join(
    resolvePhase26CanonicalRunDirectory(root),
    PHASE26_CANONICAL_REPORT_FILE_NAME,
  );
}

export function buildPhase26GateCommands(root: string): Phase26GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-26-targeted-regressions",
      cwd: root,
      env: { ...PHASE26_DETERMINISTIC_TEST_ENV },
      args: [
        "bun",
        "test",
        "tests/unit/runtime-resolution.test.ts",
        "tests/unit/sqlite.runtime.test.ts",
        "tests/unit/sqlite.vector-extension.search.test.ts",
        "tests/integration/api.smoke.test.ts",
        "tests/integration/api.auto-storage.test.ts",
        "tests/integration/storage.sqlite.test.ts",
        "tests/cli/cli.test.ts",
      ],
    },
    {
      label: "phase-26-closure-contract",
      cwd: root,
      env: { ...PHASE26_DETERMINISTIC_TEST_ENV },
      args: [
        "bun",
        "test",
        "tests/unit/run-phase-26.script.test.ts",
        "tests/release/release.test.ts",
      ],
    },
  ];
}

export async function defaultRunPhase26GateCommand(
  command: Phase26GateCommand,
): Promise<Phase26GateCommandResult> {
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

export function buildPhase26GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase26"}`;
}

function buildPhase26ArtifactDriftDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function validateArchivedCanonicalPhase26Report(
  root: string,
  readTextFile: (path: string) => Promise<string>,
): Promise<string | undefined> {
  const canonicalReportPath = resolvePhase26CanonicalReportPath(root);
  let canonicalReportText: string;

  try {
    canonicalReportText = await readTextFile(canonicalReportPath);
  } catch {
    return `Archived canonical Phase 26 report is missing or unreadable: ${canonicalReportPath}`;
  }

  let canonicalReport: Partial<Phase26GateReport>;
  try {
    canonicalReport = JSON.parse(canonicalReportText) as Partial<Phase26GateReport>;
  } catch {
    return `Archived canonical Phase 26 report is not valid JSON: ${canonicalReportPath}`;
  }

  if (canonicalReport.phase !== "phase-26") {
    return `Archived canonical Phase 26 report has the wrong phase: ${canonicalReportPath}`;
  }

  if (canonicalReport.runId !== PHASE26_CANONICAL_RUN_ID) {
    return `Archived canonical Phase 26 report has the wrong run id: ${canonicalReportPath}`;
  }

  if (canonicalReport.acceptance?.decision !== "accepted") {
    return `Archived canonical Phase 26 report is not accepted: ${canonicalReportPath}`;
  }

  if (
    buildPhase26ArtifactDriftDigest(canonicalReportText) !==
    PHASE26_CANONICAL_ARTIFACT_SHA256
  ) {
    return `Archived canonical Phase 26 report drifted from the accepted snapshot: ${canonicalReportPath}`;
  }

  return undefined;
}

function buildPhase26GateScope(): Phase26GateReport["scope"] {
  return {
    inScope: [...PHASE26_IN_SCOPE],
    outOfScope: [...PHASE26_OUT_OF_SCOPE],
  };
}

export async function runPhase26QualityGate(
  input?: Phase26GateOptions,
  dependencies?: Phase26GateDependencies,
): Promise<Phase26GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand =
    dependencies?.runCommand ?? defaultRunPhase26GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const validatesArchivedCanonicalRun =
    input?.outputDir === undefined && input?.runId === undefined;
  const runId = input?.runId ??
    (validatesArchivedCanonicalRun
      ? PHASE26_CANONICAL_RUN_ID
      : buildPhase26GateRunId(generatedAt));
  const outputDir = input?.outputDir ?? resolvePhase26GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const shouldPersistReport = !validatesArchivedCanonicalRun;
  const commandResults: Phase26GateExecutionResult[] = [];

  const canonicalArtifactFailure = validatesArchivedCanonicalRun
    ? await validateArchivedCanonicalPhase26Report(root, readTextFile)
    : undefined;

  if (canonicalArtifactFailure) {
    return {
      acceptance: {
        decision: "blocked",
        reason: canonicalArtifactFailure,
      },
      commands: commandResults,
      generatedAt,
      generatedBy: GENERATED_BY,
      phase: "phase-26",
      runDirectory,
      runId,
      scope: buildPhase26GateScope(),
    };
  }

  for (const command of buildPhase26GateCommands(root)) {
    const result = await runCommand(command);
    commandResults.push({
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

  const failedCommand = commandResults.find((result) => result.status === "failed");
  const report: Phase26GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 26 local-first runtime behavior and closure contract are regression-covered on the deterministic gate path: default resolution, durable local SQLite vectors, SQLite runtime guardrails, CLI/runtime alignment, and the canonical accepted evidence chain are in place without promoting sqlite-vss indexed acceleration as the canonical default backend.",
        },
    commands: commandResults,
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-26",
    runDirectory,
    runId,
    scope: buildPhase26GateScope(),
  };

  if (shouldPersistReport) {
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, PHASE26_CANONICAL_REPORT_FILE_NAME),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  return report;
}

export function parsePhase26GateCliOptions(
  argv: readonly string[],
): Phase26GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase26GateCli(
  dependencies?: Phase26GateCliDependencies,
): Promise<Phase26GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase26QualityGate(options));
  const report = await runGate(parsePhase26GateCliOptions(argv));

  log(`Phase 26 quality gate: ${report.acceptance.decision}`);
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase26GateCli();
}
