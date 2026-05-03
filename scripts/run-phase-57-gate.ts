#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ImplicitMemBenchResearchReport } from "../src/eval/implicitmembench-research";
import type { RawInternalizationDiagnosisSummary } from "../src/eval/implicitmembench-diagnostics";
import { buildRawInternalizationDiagnosisSummary } from "../src/eval/implicitmembench-diagnostics";
import { resolveCliFlagValue } from "./cli-options";
import { PHASE57_CANONICAL_RUN_ID } from "./run-phase-57-eval";
import {
  resolvePhase57FallbackOutputDir,
  resolvePhase57RepoRoot,
} from "./run-phase-57-shared";

export interface Phase57GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase57GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase57GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase57GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase57GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase57GateExecutionResult[];
  evidence: {
    deterministicReport: {
      artifactKind: "ignored_generated";
      ignoredReportPath: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    rawDiagnosticsArtifact: {
      artifactKind: "ignored_generated";
      ignoredArtifactPath: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    rawInternalizationDiagnostics: RawInternalizationDiagnosisSummary;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-57-gate.ts";
  phase: "phase-57";
  runDirectory: string;
  runId: string;
}

export interface Phase57GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase57GateCommand) => Promise<Phase57GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-57-gate.ts";
export const PHASE57_CANONICAL_GATE_RUN_ID = "run-20260504013000";
const PHASE57_TARGETED_RAW_MIN_BLOCKING_PASSES = 7;
const PHASE57_TARGETED_MAX_RAW_LEAKS = 1;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

async function defaultRunCommand(
  command: Phase57GateCommand,
): Promise<Phase57GateCommandResult> {
  const startedAt = Date.now();
  const process = Bun.spawn(command.args, {
    cwd: command.cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return {
    durationMs: Date.now() - startedAt,
    exitCode,
    stderr,
    stdout,
  };
}

async function defaultReadTextFile(path: string): Promise<string> {
  const buffer = await readFile(path);
  return new TextDecoder().decode(buffer);
}

export function resolvePhase57GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-57");
}

export function resolvePhase57CanonicalFallbackReportPath(root: string): string {
  return join(
    resolvePhase57FallbackOutputDir(root),
    PHASE57_CANONICAL_RUN_ID,
    "report.json",
  );
}

export function parsePhase57GateCliOptions(
  argv: readonly string[],
): Phase57GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSmokeReport(
  parsed: unknown,
): ImplicitMemBenchResearchReport | string {
  if (!isRecord(parsed)) {
    return "Phase 57 deterministic report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 57 deterministic report must be a GoodMemory research report.";
  }
  if (parsed.mode !== "smoke") {
    return "Phase 57 deterministic report must be a smoke-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 57 deterministic report must include profiles.";
  }

  return parsed as unknown as ImplicitMemBenchResearchReport;
}

function buildPhase57GateCommands(root: string): Phase57GateCommand[] {
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
        "tests/unit/eval.phase57.test.ts",
        "tests/unit/evolution.raw-behavioral-exemplars.test.ts",
        "tests/unit/implicitmembench-diagnostics.test.ts",
        "tests/unit/implicitmembench-research.test.ts",
        "tests/unit/run-phase-57.script.test.ts",
        "tests/unit/runtime-kit.test.ts",
      ],
      cwd: root,
      label: "phase-57-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-57",
        "--",
        "--run-id",
        PHASE57_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-57",
    },
  ];
}

function emptyDiagnostics(): RawInternalizationDiagnosisSummary {
  return buildRawInternalizationDiagnosisSummary([]);
}

function validatePhase57Evidence(input: {
  report: ImplicitMemBenchResearchReport;
}): {
  accepted: boolean;
  reason: string;
  summary: RawInternalizationDiagnosisSummary;
} {
  const raw = input.report.profiles["goodmemory-raw-experience"];
  const distilled = input.report.profiles["goodmemory-distilled-feedback"];
  const summary = buildRawInternalizationDiagnosisSummary([input.report]);
  const accepted =
    input.report.summary.executionFailures === 0 &&
    (raw?.executionFailures ?? 0) === 0 &&
    (raw?.explicitRecallLeakCount ?? 0) <= PHASE57_TARGETED_MAX_RAW_LEAKS &&
    (raw?.passedBlockingCases ?? 0) >= PHASE57_TARGETED_RAW_MIN_BLOCKING_PASSES &&
    (distilled?.executionFailures ?? 0) === 0 &&
    (distilled?.passedBlockingCases ?? 0) === (distilled?.totalBlockingCases ?? -1);

  return {
    accepted,
    reason: accepted
      ? "Phase 57 targeted raw-internalization mechanisms passed the deterministic gate."
      : "Phase 57 deterministic evidence did not meet the targeted raw-internalization bar.",
    summary,
  };
}

async function writeGateReport(input: {
  commands: Phase57GateExecutionResult[];
  decision: "accepted" | "blocked";
  deterministicReportPath: string;
  diagnostics: RawInternalizationDiagnosisSummary;
  now: () => string;
  reason: string;
  root: string;
  runDirectory: string;
  runId: string;
  writeTextFile: (path: string, content: string) => Promise<void>;
}): Promise<Phase57GateReport> {
  const report: Phase57GateReport = {
    acceptance: {
      decision: input.decision,
      reason: input.reason,
    },
    commands: input.commands,
    evidence: {
      deterministicReport: {
        artifactKind: "ignored_generated",
        ignoredReportPath: toRepoRelativePath(input.root, input.deterministicReportPath),
        regenerateCommand: `bun run eval:phase-57 -- --run-id ${PHASE57_CANONICAL_RUN_ID}`,
        status: input.decision,
      },
      rawDiagnosticsArtifact: {
        artifactKind: "ignored_generated",
        ignoredArtifactPath: toRepoRelativePath(
          input.root,
          join(input.deterministicReportPath, "..", "raw-diagnostics.json"),
        ),
        regenerateCommand:
          `bun run eval:phase-57-diagnostics -- --run-id ${PHASE57_CANONICAL_RUN_ID} --report ${toRepoRelativePath(input.root, input.deterministicReportPath)} --output ${toRepoRelativePath(input.root, join(input.deterministicReportPath, "..", "raw-diagnostics.json"))}`,
        status: input.decision,
      },
      rawInternalizationDiagnostics: input.diagnostics,
    },
    generatedAt: input.now(),
    generatedBy: GENERATED_BY,
    phase: "phase-57",
    runDirectory: input.runDirectory,
    runId: input.runId,
  };
  await input.writeTextFile(
    join(input.runDirectory, "phase-57-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase57Gate(
  options?: Phase57GateOptions,
  dependencies?: Phase57GateDependencies,
): Promise<Phase57GateReport> {
  const root = resolvePhase57RepoRoot();
  const runId = options?.runId ?? PHASE57_CANONICAL_GATE_RUN_ID;
  const outputDir = resolve(options?.outputDir ?? resolvePhase57GateOutputDir(root));
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? defaultReadTextFile;
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const canonicalFallbackReportPath = resolvePhase57CanonicalFallbackReportPath(root);

  await ensureDir(runDirectory, { recursive: true });
  const commands: Phase57GateExecutionResult[] = [];

  for (const command of buildPhase57GateCommands(root)) {
    const result = await runCommand(command);
    commands.push({
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      label: command.label,
      status: result.exitCode === 0 ? "passed" : "failed",
      stderrTail: tailLines(result.stderr),
      stdoutTail: tailLines(result.stdout),
    });
    if (result.exitCode !== 0) {
      return writeGateReport({
        commands,
        decision: "blocked",
        deterministicReportPath: canonicalFallbackReportPath,
        diagnostics: emptyDiagnostics(),
        now,
        reason: `Phase 57 gate command failed: ${command.label}`,
        root,
        runDirectory,
        runId,
        writeTextFile,
      });
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readTextFile(canonicalFallbackReportPath));
  } catch (error) {
    return writeGateReport({
      commands,
      decision: "blocked",
      deterministicReportPath: canonicalFallbackReportPath,
      diagnostics: emptyDiagnostics(),
      now,
      reason: `Phase 57 deterministic report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      root,
      runDirectory,
      runId,
      writeTextFile,
    });
  }

  const report = parseSmokeReport(parsed);
  if (typeof report === "string") {
    return writeGateReport({
      commands,
      decision: "blocked",
      deterministicReportPath: canonicalFallbackReportPath,
      diagnostics: emptyDiagnostics(),
      now,
      reason: report,
      root,
      runDirectory,
      runId,
      writeTextFile,
    });
  }

  const evidence = validatePhase57Evidence({ report });
  return writeGateReport({
    commands,
    decision: evidence.accepted ? "accepted" : "blocked",
    deterministicReportPath: canonicalFallbackReportPath,
    diagnostics: evidence.summary,
    now,
    reason: evidence.reason,
    root,
    runDirectory,
    runId,
    writeTextFile,
  });
}

async function main(): Promise<void> {
  const report = await runPhase57Gate(parsePhase57GateCliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
