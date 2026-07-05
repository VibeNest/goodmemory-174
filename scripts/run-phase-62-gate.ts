import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import { PHASE62_CANONICAL_RUN_ID } from "./run-phase-62-eval";
import { resolvePhase62OutputDir, resolvePhase62RepoRoot } from "./run-phase-62-shared";
import type { LongMemEvalProfile, LongMemEvalReport } from "../src/eval/longmemeval";

export const PHASE62_CANONICAL_GATE_RUN_ID = "run-20260505200000";

const GENERATED_BY = "scripts/run-phase-62-gate.ts";
const REQUIRED_PROFILES: LongMemEvalProfile[] = [
  "baseline-no-memory",
  "baseline-full-context",
  "goodmemory-rules-only",
  "goodmemory-hybrid",
];

export interface Phase62GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase62GateReport {
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  phase: "phase-62";
  runDirectory: string;
  runId: string;
  status: "accepted" | "rejected";
  summary: {
    canonicalEvalRunId: string;
    profilesCompared: LongMemEvalProfile[];
    totalCases: number;
  };
}

export interface Phase62GateDependencies {
  readFile?: (path: string) => Promise<string>;
  runCommand?: (command: string[]) => Promise<void>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

export function parsePhase62GateCliOptions(
  argv: readonly string[],
): Phase62GateOptions {
  return {
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

function resolvePhase62GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-62");
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

function validateReport(value: unknown): LongMemEvalReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Phase 62 LongMemEval report must be an object");
  }
  const report = value as LongMemEvalReport;
  if (report.phase !== "phase-62") {
    throw new Error("Phase 62 gate requires a phase-62 report");
  }
  if (report.mode !== "smoke") {
    throw new Error("Phase 62 canonical gate requires smoke mode");
  }
  if (report.source?.benchmark !== "LongMemEval") {
    throw new Error("Phase 62 gate requires a LongMemEval report");
  }
  if (report.summary.executionFailures !== 0) {
    throw new Error("Phase 62 smoke report must have zero execution failures");
  }
  for (const profile of REQUIRED_PROFILES) {
    if (!report.profiles[profile]) {
      throw new Error(`Phase 62 report is missing profile ${profile}`);
    }
  }
  return report;
}

export async function runPhase62Gate(
  options: Phase62GateOptions = {},
  dependencies: Phase62GateDependencies = {},
): Promise<Phase62GateReport> {
  const root = resolvePhase62RepoRoot();
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const outputDir = options.outputDir ?? resolvePhase62GateOutputDir(root);
  const runId = options.runId ?? PHASE62_CANONICAL_GATE_RUN_ID;
  const runDirectory = join(outputDir, runId);

  await runCommand([
    "bun",
    "test",
    "tests/unit/longmemeval.test.ts",
    "tests/unit/run-phase-62.script.test.ts",
    "tests/unit/run-phase-62.gate.test.ts",
  ]);
  await runCommand([
    "bun",
    "run",
    "eval:phase-62",
    "--",
    "--run-id",
    PHASE62_CANONICAL_RUN_ID,
  ]);

  const reportPath = join(
    resolvePhase62OutputDir(root),
    PHASE62_CANONICAL_RUN_ID,
    "report.json",
  );
  const report = validateReport(JSON.parse(await readFileImpl(reportPath)));
  const gate: Phase62GateReport = {
    generatedAt: new Date().toISOString(),
    generatedBy: GENERATED_BY,
    phase: "phase-62",
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
    join(runDirectory, "phase-62-quality-gate.json"),
    `${JSON.stringify(gate, null, 2)}\n`,
  );

  return gate;
}

if (import.meta.main) {
  const report = await runPhase62Gate(parsePhase62GateCliOptions(Bun.argv));
  console.log(JSON.stringify(report, null, 2));
}
