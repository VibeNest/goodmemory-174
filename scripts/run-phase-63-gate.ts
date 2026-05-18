import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PHASE63_CANONICAL_RUN_ID } from "./run-phase-63-eval";
import { resolvePhase63OutputDir, resolvePhase63RepoRoot } from "./run-phase-63-shared";
import { resolveCliFlagValue } from "./cli-options";
import type { BeamProfile, BeamReport } from "../src/eval/beam";

export const PHASE63_CANONICAL_GATE_RUN_ID = "run-20260518003000";

const GENERATED_BY = "scripts/run-phase-63-gate.ts";
const REQUIRED_PROFILES: BeamProfile[] = [
  "baseline-no-memory",
  "baseline-full-context",
  "goodmemory-rules-only",
  "goodmemory-hybrid",
];

export interface Phase63GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase63GateReport {
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  phase: "phase-63";
  runDirectory: string;
  runId: string;
  status: "accepted" | "rejected";
  summary: {
    canonicalEvalRunId: string;
    profilesCompared: BeamProfile[];
    totalCases: number;
  };
}

export interface Phase63GateDependencies {
  readFile?: (path: string) => Promise<string>;
  runCommand?: (command: string[]) => Promise<void>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

function parseGateOptions(argv: readonly string[]): Phase63GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function resolvePhase63GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-63");
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

function validateReport(value: unknown): BeamReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Phase 63 BEAM report must be an object");
  }
  const report = value as BeamReport;
  if (report.phase !== "phase-63") {
    throw new Error("Phase 63 gate requires a phase-63 report");
  }
  if (report.mode !== "smoke") {
    throw new Error("Phase 63 canonical gate requires smoke mode");
  }
  if (report.source?.benchmark !== "BEAM") {
    throw new Error("Phase 63 gate requires a BEAM report");
  }
  if (report.summary.executionFailures !== 0) {
    throw new Error("Phase 63 smoke report must have zero execution failures");
  }
  for (const profile of REQUIRED_PROFILES) {
    if (!report.profiles[profile]) {
      throw new Error(`Phase 63 report is missing profile ${profile}`);
    }
  }
  return report;
}

export async function runPhase63Gate(
  options: Phase63GateOptions = {},
  dependencies: Phase63GateDependencies = {},
): Promise<Phase63GateReport> {
  const root = resolvePhase63RepoRoot();
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const outputDir = options.outputDir ?? resolvePhase63GateOutputDir(root);
  const runId = options.runId ?? PHASE63_CANONICAL_GATE_RUN_ID;
  const runDirectory = join(outputDir, runId);

  await runCommand([
    "bun",
    "test",
    "tests/unit/beam.test.ts",
    "tests/unit/run-phase-63.script.test.ts",
    "tests/unit/run-phase-63.gate.test.ts",
  ]);
  await runCommand([
    "bun",
    "run",
    "eval:phase-63",
    "--",
    "--run-id",
    PHASE63_CANONICAL_RUN_ID,
  ]);

  const reportPath = join(
    resolvePhase63OutputDir(root),
    PHASE63_CANONICAL_RUN_ID,
    "report.json",
  );
  const report = validateReport(JSON.parse(await readFileImpl(reportPath)));
  const gate: Phase63GateReport = {
    generatedAt: new Date().toISOString(),
    generatedBy: GENERATED_BY,
    phase: "phase-63",
    runDirectory,
    runId,
    status: "accepted",
    summary: {
      canonicalEvalRunId: report.runId,
      profilesCompared: report.summary.profilesCompared,
      totalCases: report.summary.totalCases,
    },
  };

  await mkdir(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, "phase-63-quality-gate.json"),
    `${JSON.stringify(gate, null, 2)}\n`,
  );

  return gate;
}

if (import.meta.main) {
  const report = await runPhase63Gate(parseGateOptions(Bun.argv));
  console.log(JSON.stringify(report, null, 2));
}
