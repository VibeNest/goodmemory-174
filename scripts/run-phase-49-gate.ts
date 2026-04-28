#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  ImplicitMemBenchComparisonReport,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchResearchReport,
  ImplicitMemBenchScorerFamily,
} from "../src/eval/implicitmembench-research";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49ComparisonOutputDir,
  resolvePhase49RepoRoot,
  resolvePhase49SmokeBenchmarkRoot,
} from "./run-phase-49-shared";

export interface Phase49GateOptions {
  benchmarkRoot?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase49GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase49GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase49GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase49GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase49GateExecutionResult[];
  evidence: {
    comparisonReportPath: string;
    coverage: {
      baselineProfilesPresent: string[];
      goodmemoryProfilesPresent: string[];
      primingAbsentFromDistilled: boolean;
      scorerFamiliesPresent: ImplicitMemBenchScorerFamily[];
      smokeBenchmarkRoot: string;
      totalComparisonCases: number;
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-49-gate.ts";
  phase: "phase-49";
  runDirectory: string;
  runId: string;
}

export interface Phase49GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase49GateCommand) => Promise<Phase49GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase49GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase49GateOptions) => Promise<Phase49GateReport>;
}

const GENERATED_BY = "scripts/run-phase-49-gate.ts";
export const PHASE49_CANONICAL_SMOKE_RUN_ID = "run-phase49-smoke-current";
const REQUIRED_GOODMEMORY_PROFILES = [
  "goodmemory-distilled-feedback",
  "goodmemory-raw-experience",
] as const satisfies readonly ImplicitMemBenchResearchProfile[];
const REQUIRED_SCORER_FAMILIES = [
  "priming_pair_judge",
  "structured_first_action",
  "text_behavior_judge",
] as const satisfies readonly ImplicitMemBenchScorerFamily[];

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
  command: Phase49GateCommand,
): Promise<Phase49GateCommandResult> {
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

export function resolvePhase49GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-49");
}

export function resolvePhase49CanonicalComparisonReportPath(root: string): string {
  return join(
    resolvePhase49ComparisonOutputDir(root),
    "comparison",
    PHASE49_CANONICAL_SMOKE_RUN_ID,
    "report.json",
  );
}

export function parsePhase49GateCliOptions(
  argv: readonly string[],
): Phase49GateOptions {
  return {
    benchmarkRoot: resolveCliFlagValue(argv, "--benchmark-root"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResearchProfile(value: string): value is ImplicitMemBenchResearchProfile {
  return (
    value === "baseline-upstream-chat" ||
    value === "goodmemory-distilled-feedback" ||
    value === "goodmemory-raw-experience"
  );
}

function parseResearchReport(
  parsed: unknown,
): ImplicitMemBenchResearchReport | string {
  if (!isRecord(parsed)) {
    return "Phase 49 research report must be a JSON object.";
  }

  if (
    parsed.kind !== "baseline" &&
    parsed.kind !== "goodmemory"
  ) {
    return "Phase 49 research report has the wrong kind.";
  }

  if (parsed.mode !== "smoke") {
    return "Phase 49 gate requires smoke-mode research reports.";
  }

  if (!isRecord(parsed.profiles)) {
    return "Phase 49 research report must include profiles.";
  }

  return parsed as unknown as ImplicitMemBenchResearchReport;
}

function parseComparisonReport(
  parsed: unknown,
): ImplicitMemBenchComparisonReport | string {
  if (!isRecord(parsed)) {
    return "Phase 49 comparison report must be a JSON object.";
  }

  if (parsed.kind !== "comparison") {
    return "Phase 49 comparison report has the wrong kind.";
  }

  if (parsed.mode !== "smoke") {
    return "Phase 49 gate requires a smoke-mode comparison report.";
  }

  if (!isRecord(parsed.comparison) || !Array.isArray(parsed.comparison.cases)) {
    return "Phase 49 comparison report must include comparison cases.";
  }

  if (!isRecord(parsed.comparison.byScorer)) {
    return "Phase 49 comparison report must include scorer summaries.";
  }

  return parsed as unknown as ImplicitMemBenchComparisonReport;
}

function collectScorerFamilies(
  report: ImplicitMemBenchComparisonReport,
): ImplicitMemBenchScorerFamily[] {
  return REQUIRED_SCORER_FAMILIES.filter((scorerFamily) => {
    return (
      isRecord(report.comparison.byScorer[scorerFamily]) &&
      typeof report.comparison.byScorer[scorerFamily].caseCount === "number" &&
      report.comparison.byScorer[scorerFamily].caseCount > 0
    );
  });
}

function buildPhase49GateCommands(input: {
  benchmarkRoot: string;
  root: string;
}): Phase49GateCommand[] {
  return [
    {
      args: ["bun", "run", "typecheck"],
      cwd: input.root,
      label: "typecheck",
    },
    {
      args: [
        "bun",
        "test",
        "tests/unit/implicitmembench-research.test.ts",
        "tests/unit/run-phase-49.script.test.ts",
        "tests/unit/run-phase-49.gate.test.ts",
      ],
      cwd: input.root,
      label: "phase-49-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-49",
        "--",
        "--smoke",
        "--benchmark-root",
        input.benchmarkRoot,
        "--run-id",
        PHASE49_CANONICAL_SMOKE_RUN_ID,
      ],
      cwd: input.root,
      label: "phase-49-smoke-eval",
    },
  ];
}

export async function runPhase49Gate(
  input?: Phase49GateOptions,
  dependencies?: Phase49GateDependencies,
): Promise<Phase49GateReport> {
  const root = resolvePhase49RepoRoot();
  const benchmarkRoot = resolve(
    input?.benchmarkRoot ?? resolvePhase49SmokeBenchmarkRoot(root),
  );
  const outputDir = resolve(
    input?.outputDir ?? resolvePhase49GateOutputDir(root),
  );
  const runId = input?.runId ?? `run-${Date.now()}`;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? ((path) => readFile(path, "utf8"));
  const writeTextFile =
    dependencies?.writeTextFile ?? ((path, content) => writeFile(path, content, "utf8"));
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const now = dependencies?.now ?? (() => new Date().toISOString());

  await ensureDir(runDirectory, { recursive: true });

  const commandResults: Phase49GateExecutionResult[] = [];
  for (const command of buildPhase49GateCommands({ benchmarkRoot, root })) {
    const result = await runCommand(command);
    commandResults.push({
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      label: command.label,
      status: result.exitCode === 0 ? "passed" : "failed",
      stderrTail: tailLines(result.stderr),
      stdoutTail: tailLines(result.stdout),
    });

    if (result.exitCode !== 0) {
      const report: Phase49GateReport = {
        acceptance: {
          decision: "blocked",
          reason: `Command failed: ${command.label}`,
        },
        commands: commandResults,
        evidence: {
          comparisonReportPath: toRepoRelativePath(
            root,
            resolvePhase49CanonicalComparisonReportPath(root),
          ),
          coverage: {
            baselineProfilesPresent: [],
            goodmemoryProfilesPresent: [],
            primingAbsentFromDistilled: false,
            scorerFamiliesPresent: [],
            smokeBenchmarkRoot: toRepoRelativePath(root, benchmarkRoot),
            totalComparisonCases: 0,
          },
        },
        generatedAt: now(),
        generatedBy: GENERATED_BY,
        phase: "phase-49",
        runDirectory,
        runId,
      };
      await writeTextFile(
        join(runDirectory, "phase-49-quality-gate.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    }
  }

  const baselinePath = join(
    resolvePhase49ComparisonOutputDir(root),
    "baseline",
    PHASE49_CANONICAL_SMOKE_RUN_ID,
    "report.json",
  );
  const goodmemoryPath = join(
    resolvePhase49ComparisonOutputDir(root),
    "goodmemory",
    PHASE49_CANONICAL_SMOKE_RUN_ID,
    "report.json",
  );
  const comparisonPath = resolvePhase49CanonicalComparisonReportPath(root);

  const baselineReport = parseResearchReport(
    JSON.parse(await readTextFile(baselinePath)) as unknown,
  );
  const goodmemoryReport = parseResearchReport(
    JSON.parse(await readTextFile(goodmemoryPath)) as unknown,
  );
  const comparisonReport = parseComparisonReport(
    JSON.parse(await readTextFile(comparisonPath)) as unknown,
  );

  let decision: "accepted" | "blocked" = "accepted";
  let reason = "Phase 49 smoke harness is regression-covered and comparison reporting is intact.";
  const coverage = {
    baselineProfilesPresent:
      typeof baselineReport === "string" ? [] : Object.keys(baselineReport.profiles),
    goodmemoryProfilesPresent:
      typeof goodmemoryReport === "string" ? [] : Object.keys(goodmemoryReport.profiles),
    primingAbsentFromDistilled: false,
    scorerFamiliesPresent:
      typeof comparisonReport === "string" ? [] : collectScorerFamilies(comparisonReport),
    smokeBenchmarkRoot: toRepoRelativePath(root, benchmarkRoot),
    totalComparisonCases:
      typeof comparisonReport === "string"
        ? 0
        : comparisonReport.comparison.cases.length,
  };

  if (typeof baselineReport === "string") {
    decision = "blocked";
    reason = baselineReport;
  } else if (typeof goodmemoryReport === "string") {
    decision = "blocked";
    reason = goodmemoryReport;
  } else if (typeof comparisonReport === "string") {
    decision = "blocked";
    reason = comparisonReport;
  } else {
    const baselineProfiles = Object.keys(baselineReport.profiles).filter(
      isResearchProfile,
    );
    const goodmemoryProfiles = Object.keys(goodmemoryReport.profiles).filter(
      isResearchProfile,
    );
    coverage.primingAbsentFromDistilled =
      (goodmemoryReport.profiles["goodmemory-distilled-feedback"]?.caseCountsByDataset
        .priming ?? 0) === 0;

    if (!baselineProfiles.includes("baseline-upstream-chat")) {
      decision = "blocked";
      reason = "Phase 49 baseline smoke report is missing baseline-upstream-chat.";
    } else if (
      REQUIRED_GOODMEMORY_PROFILES.some(
        (profile) => !goodmemoryProfiles.includes(profile),
      )
    ) {
      decision = "blocked";
      reason = "Phase 49 GoodMemory smoke report is missing required profiles.";
    } else if (!coverage.primingAbsentFromDistilled) {
      decision = "blocked";
      reason = "Phase 49 distilled-feedback must not include priming cases.";
    } else if (
      coverage.scorerFamiliesPresent.length !== REQUIRED_SCORER_FAMILIES.length
    ) {
      decision = "blocked";
      reason = "Phase 49 smoke comparison report does not cover every scorer family.";
    } else if (coverage.totalComparisonCases === 0) {
      decision = "blocked";
      reason = "Phase 49 smoke comparison report has no cases.";
    }
  }

  const report: Phase49GateReport = {
    acceptance: {
      decision,
      reason,
    },
    commands: commandResults,
    evidence: {
      comparisonReportPath: toRepoRelativePath(root, comparisonPath),
      coverage,
    },
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    phase: "phase-49",
    runDirectory,
    runId,
  };

  await writeTextFile(
    join(runDirectory, "phase-49-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase49GateMain(
  dependencies?: Phase49GateCliDependencies,
): Promise<void> {
  await runPhase49GateCli(dependencies);
}

export async function runPhase49GateCli(
  dependencies?: Phase49GateCliDependencies,
): Promise<void> {
  const argv = dependencies?.argv ?? process.argv;
  const log = dependencies?.log ?? console.log;
  const exit = dependencies?.exit ?? process.exit;
  const runGate = dependencies?.runGate ?? runPhase49Gate;
  const report = await runGate(parsePhase49GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await runPhase49GateMain();
}
