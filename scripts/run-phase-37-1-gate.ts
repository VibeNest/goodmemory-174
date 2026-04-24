import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolvePhase371DogfoodOutputDir } from "./run-phase-37-1-dogfood-summary";
import type { Phase371DogfoodReport } from "./run-phase-37-1-dogfood-summary";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase371GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase371GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase371GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase371GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase371GateExecutionResult[];
  evidence: {
    dogfood: {
      reason: string;
      reportPath: string;
      status: "accepted" | "blocked";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-37-1-gate.ts";
  phase: "phase-37.1";
  runDirectory: string;
  runId: string;
}

export interface Phase371GateOptions {
  dogfoodMode?: "deterministic" | "local";
  dogfoodReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase371GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase371GateCommand) => Promise<Phase371GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase371GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase371GateOptions) => Promise<Phase371GateReport>;
}

const GENERATED_BY = "scripts/run-phase-37-1-gate.ts";
const CANONICAL_RUN_ID = "run-20260424100757";
const CANONICAL_DOGFOOD_RUN_ID = "run-phase37-1-dogfood-current";
const LOCAL_RUN_ID = "run-phase37-1-local-current";
const LOCAL_DOGFOOD_RUN_ID = "run-phase37-1-local-dogfood-current";

export function parsePhase371GateCliOptions(
  argv: readonly string[],
): Phase371GateOptions {
  const dogfoodMode = resolveCliFlagValue(argv, "--dogfood-mode");
  return {
    dogfoodMode: dogfoodMode === "local" ? "local" : "deterministic",
    dogfoodReportPath: resolveCliFlagValue(argv, "--dogfood-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function resolvePhase371GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-37-1");
}

export function resolvePhase371LocalGateOutputDir(root: string): string {
  return join(root, ".tmp-goodmemory-phase37-1-local/quality-gates/phase-37-1");
}

export function resolvePhase371LocalDogfoodOutputDir(root: string): string {
  return join(root, ".tmp-goodmemory-phase37-1-local/eval/dogfood/phase-37-1");
}

export function buildPhase371GateCommands(
  root: string,
  options: {
    dogfoodMode?: "deterministic" | "local";
  } = {},
): Phase371GateCommand[] {
  const dogfoodMode = options.dogfoodMode ?? "deterministic";
  const dogfoodOutputDir = dogfoodMode === "local"
    ? resolvePhase371LocalDogfoodOutputDir(root)
    : resolvePhase371DogfoodOutputDir(root);
  const dogfoodRunId = dogfoodMode === "local"
    ? LOCAL_DOGFOOD_RUN_ID
    : CANONICAL_DOGFOOD_RUN_ID;
  const dogfoodArgs = [
    "bun",
    "run",
    "eval:phase-37-1-dogfood",
    "--",
    "--run-id",
    dogfoodRunId,
    "--output-dir",
    dogfoodOutputDir,
  ];
  if (dogfoodMode === "deterministic") {
    dogfoodArgs.push("--fixture", "accepted");
  }

  return [
    {
      args: ["bun", "run", "typecheck"],
      cwd: root,
      label: "typecheck",
    },
    {
      args: [
        "bun",
        "test",
        "tests/unit/host-writeback-audit-ledger.test.ts",
        "tests/unit/host-writeback-runtime.test.ts",
        "tests/integration/installed-host-writeback-audit.test.ts",
        "tests/integration/installed-host-writeback.test.ts",
        "tests/unit/run-phase-37-1-dogfood-summary.test.ts",
        "tests/unit/run-phase-37-1-gate.test.ts",
        "tests/cli/cli.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "phase-37-1-targeted-regressions",
    },
    {
      args: dogfoodArgs,
      cwd: root,
      label: "phase-37-1-dogfood-summary",
    },
    {
      args: ["bun", "run", "gate:phase-37"],
      cwd: root,
      label: "phase-37-regression-gate",
    },
    {
      args: ["bun", "run", "gate:phase-35"],
      cwd: root,
      label: "phase-35-regression-gate",
    },
    {
      args: ["bun", "run", "gate:phase-36"],
      cwd: root,
      label: "phase-36-regression-gate",
    },
  ];
}

export async function runPhase371QualityGate(
  options: Phase371GateOptions = {},
  dependencies: Phase371GateDependencies = {},
): Promise<Phase371GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const dogfoodMode = options.dogfoodMode ?? "deterministic";
  const outputDir = options.outputDir ?? (dogfoodMode === "local"
    ? resolvePhase371LocalGateOutputDir(root)
    : resolvePhase371GateOutputDir(root));
  const runId = options.runId ?? (dogfoodMode === "local"
    ? LOCAL_RUN_ID
    : CANONICAL_RUN_ID);
  const runDirectory = join(outputDir, runId);
  const ensureDir =
    dependencies.ensureDir ??
    (async (path: string, options?: { recursive?: boolean }) => {
      await mkdir(path, options);
    });
  const now = dependencies.now ?? (() => new Date().toISOString());
  const readTextFile = dependencies.readTextFile ?? ((path: string) => readFile(path, "utf8"));
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const commands: Phase371GateExecutionResult[] = [];
  const dogfoodOutputDir = dogfoodMode === "local"
    ? resolvePhase371LocalDogfoodOutputDir(root)
    : resolvePhase371DogfoodOutputDir(root);
  const dogfoodRunId = dogfoodMode === "local"
    ? LOCAL_DOGFOOD_RUN_ID
    : CANONICAL_DOGFOOD_RUN_ID;
  const dogfoodReportPath = options.dogfoodReportPath
    ? resolveMaybeRelativePath(root, options.dogfoodReportPath)
    : join(dogfoodOutputDir, dogfoodRunId, "report.json");
  const commandsToRun = options.dogfoodReportPath
    ? buildPhase371GateCommands(root, { dogfoodMode }).filter(
        (command) => command.label !== "phase-37-1-dogfood-summary",
      )
    : buildPhase371GateCommands(root, { dogfoodMode });

  for (const command of commandsToRun) {
    const result = await runCommand(command);
    commands.push(toExecutionResult(command, result));
    if (result.exitCode !== 0) {
      return await writeReport({
        commands,
        dogfoodAccepted: false,
        dogfoodReason: `Required Phase 37.1 command failed: ${command.label}.`,
        dogfoodReportPath,
        ensureDir,
        now,
        outputPath: join(runDirectory, "phase-37-1-quality-gate.json"),
        root,
        runDirectory,
        runId,
        writeTextFile,
      });
    }
  }

  let dogfood: Phase371DogfoodReport;
  try {
    dogfood = JSON.parse(await readTextFile(dogfoodReportPath)) as Phase371DogfoodReport;
  } catch (error) {
    return await writeReport({
      commands,
      dogfoodAccepted: false,
      dogfoodReason: error instanceof Error ? error.message : "Phase 37.1 dogfood evidence could not be read.",
      dogfoodReportPath,
      ensureDir,
      now,
      outputPath: join(runDirectory, "phase-37-1-quality-gate.json"),
      root,
      runDirectory,
      runId,
      writeTextFile,
    });
  }
  const expectedEvidenceSource = dogfoodMode === "local"
    ? "local_audit_ledger"
    : "deterministic_fixture";
  const dogfoodAccepted = isAcceptedDogfoodReport(
    dogfood,
    expectedEvidenceSource,
  );
  return await writeReport({
    commands,
    dogfoodAccepted,
    dogfoodReason: dogfoodAccepted
      ? "Dogfood report met Phase 37.1 minimum session and metric requirements."
      : `Phase 37.1 dogfood report is incomplete, below the session floor, has the wrong evidence source for ${dogfoodMode} mode, or is not accepted.`,
    dogfoodReportPath,
    ensureDir,
    now,
    outputPath: join(runDirectory, "phase-37-1-quality-gate.json"),
    root,
    runDirectory,
    runId,
    writeTextFile,
  });
}

export async function runPhase371GateCli(
  dependencies: Phase371GateCliDependencies = {},
): Promise<Phase371GateReport> {
  const argv = dependencies.argv ?? process.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runGate = dependencies.runGate ??
    ((options?: Phase371GateOptions) => runPhase371QualityGate(options));
  const report = await runGate(parsePhase371GateCliOptions(argv));

  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
  return report;
}

function isAcceptedDogfoodReport(
  report: Phase371DogfoodReport,
  expectedEvidenceSource: Phase371DogfoodReport["evidenceSource"],
): boolean {
  return report.acceptance.decision === "accepted" &&
    report.evidenceSource === expectedEvidenceSource &&
    report.generatedBy === "scripts/run-phase-37-1-dogfood-summary.ts" &&
    report.phase === "phase-37.1" &&
    report.summary.sessionCount >= 20 &&
    report.summary.candidateCount >= 20 &&
    report.summary.durableWriteCount > 0 &&
    report.summary.duplicateCount >= 0 &&
    report.summary.forgottenCount >= 0 &&
    report.summary.nextSessionRecallHitCount > 0 &&
    Number.isFinite(report.summary.falseWriteRateManual) &&
    report.summary.falseWriteRateManual >= 0 &&
    report.summary.falseWriteRateManual <= 1;
}

async function writeReport(input: {
  commands: Phase371GateExecutionResult[];
  dogfoodAccepted: boolean;
  dogfoodReason: string;
  dogfoodReportPath: string;
  ensureDir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now: () => string;
  outputPath: string;
  root: string;
  runDirectory: string;
  runId: string;
  writeTextFile: (path: string, content: string) => Promise<void>;
}): Promise<Phase371GateReport> {
  const accepted = input.dogfoodAccepted;
  const report: Phase371GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 37.1 writeback productization polish gate passed."
        : input.dogfoodReason,
    },
    commands: input.commands,
    evidence: {
      dogfood: {
        reason: input.dogfoodReason,
        reportPath: toRepoRelativePath(input.root, input.dogfoodReportPath),
        status: accepted ? "accepted" : "blocked",
      },
    },
    generatedAt: input.now(),
    generatedBy: GENERATED_BY,
    phase: "phase-37.1",
    runDirectory: input.runDirectory,
    runId: input.runId,
  };
  await input.ensureDir(input.runDirectory, { recursive: true });
  await input.writeTextFile(input.outputPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}

async function defaultRunCommand(
  command: Phase371GateCommand,
): Promise<Phase371GateCommandResult> {
  const startedAtMs = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] =>
        entry[1] !== undefined
      ),
    ),
    stderr: "pipe",
    stdout: "pipe",
  });
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

function toExecutionResult(
  command: Phase371GateCommand,
  result: Phase371GateCommandResult,
): Phase371GateExecutionResult {
  return {
    command: command.args.join(" "),
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    label: command.label,
    status: result.exitCode === 0 ? "passed" : "failed",
    stderrTail: tailLines(result.stderr),
    stdoutTail: tailLines(result.stdout),
  };
}

function tailLines(value: string, count = 20): string[] {
  return value.trim().length === 0 ? [] : value.trimEnd().split(/\r?\n/u).slice(-count);
}

function resolveMaybeRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

if (import.meta.main) {
  await runPhase371GateCli();
}
