import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import type { Phase63BeamLiveClosureReport } from "./run-phase-63-beam-live-closure";
import { resolvePhase63RepoRoot } from "./run-phase-63-shared";

export const PHASE63_BEAM_CLOSURE_GATE_RUN_ID =
  "run-phase63-beam-closure-gate-current";

const GENERATED_BY = "scripts/run-phase-63-beam-closure-gate.ts";

export interface Phase63BeamClosureGateOptions {
  closureReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase63BeamClosureGateReport {
  closureReportPath: string;
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  phase: "phase-63";
  runDirectory: string;
  runId: string;
  status: "accepted";
  summary: {
    answerAccuracy: number;
    closureRunId: string;
    correctCases: number;
    executionFailures: number;
    liveReportPath: string;
    recallDiagnosticRunId: string;
    recallReportPath: string;
    scale: string;
    totalCases: number;
  };
}

export interface Phase63BeamClosureGateDependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  runCommand?: (command: string[]) => Promise<void>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

function parseGateOptions(argv: readonly string[]): Phase63BeamClosureGateOptions {
  return {
    closureReportPath: resolveCliFlagValue(argv, "--closure-report"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function resolvePhase63BeamClosureGateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-63/beam-closure");
}

async function defaultRunCommand(command: string[]): Promise<void> {
  const proc = Bun.spawn(command, {
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateClosureReport(value: unknown): Phase63BeamLiveClosureReport {
  if (!isRecord(value)) {
    throw new Error("Phase 63 BEAM closure gate requires a closure report object");
  }
  const report = value as Phase63BeamLiveClosureReport;
  if (report.phase !== "phase-63") {
    throw new Error("Phase 63 BEAM closure gate requires a phase-63 report");
  }
  if (report.mode !== "live-answer-closure") {
    throw new Error("Phase 63 BEAM closure gate requires live-answer-closure mode");
  }
  if (report.source?.benchmark !== "BEAM") {
    throw new Error("Phase 63 BEAM closure gate requires a BEAM report");
  }
  if (report.status !== "ready-for-gate") {
    throw new Error("Phase 63 BEAM closure report must be ready for gate");
  }
  if (report.summary.scale !== "100K") {
    throw new Error("Phase 63 BEAM closure gate currently requires 100K scale");
  }
  if (report.summary.totalCases !== report.summary.expectedTotalCases) {
    throw new Error("Phase 63 BEAM closure report must cover every expected case");
  }
  if (
    report.summary.recallDiagnosticTotalCases !==
    report.summary.expectedTotalCases
  ) {
    throw new Error(
      "Phase 63 BEAM closure recall diagnostic must cover every expected case",
    );
  }
  if (report.summary.executionFailures !== 0) {
    throw new Error("Phase 63 BEAM closure live report must have zero failures");
  }
  if (report.summary.recallDiagnosticExecutionFailures !== 0) {
    throw new Error("Phase 63 BEAM closure recall report must have zero failures");
  }
  return report;
}

export async function runPhase63BeamClosureGate(
  options: Phase63BeamClosureGateOptions = {},
  dependencies: Phase63BeamClosureGateDependencies = {},
): Promise<Phase63BeamClosureGateReport> {
  if (!options.closureReportPath) {
    throw new Error("Phase 63 BEAM closure gate requires --closure-report.");
  }
  const root = resolvePhase63RepoRoot();
  const outputDir =
    options.outputDir ?? resolvePhase63BeamClosureGateOutputDir(root);
  const runId = options.runId ?? PHASE63_BEAM_CLOSURE_GATE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const runCommand = dependencies.runCommand ?? defaultRunCommand;

  await runCommand([
    "bun",
    "test",
    "tests/unit/run-phase-63.beam-live-closure.test.ts",
    "tests/unit/run-phase-63.beam-live-slice.test.ts",
  ]);

  const closureReport = validateClosureReport(
    JSON.parse(await readFileImpl(options.closureReportPath)),
  );
  const gate: Phase63BeamClosureGateReport = {
    closureReportPath: options.closureReportPath,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    phase: "phase-63",
    runDirectory,
    runId,
    status: "accepted",
    summary: {
      answerAccuracy: closureReport.summary.answerAccuracy,
      closureRunId: closureReport.runId,
      correctCases: closureReport.summary.correctCases,
      executionFailures: closureReport.summary.executionFailures,
      liveReportPath: closureReport.liveReportPath,
      recallDiagnosticRunId: closureReport.summary.recallDiagnosticRunId,
      recallReportPath: closureReport.recallReportPath,
      scale: closureReport.summary.scale,
      totalCases: closureReport.summary.totalCases,
    },
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, "phase-63-beam-closure-gate.json"),
    `${JSON.stringify(gate, null, 2)}\n`,
  );
  return gate;
}

if (import.meta.main) {
  const report = await runPhase63BeamClosureGate(parseGateOptions(Bun.argv));
  console.log(JSON.stringify(report, null, 2));
}
