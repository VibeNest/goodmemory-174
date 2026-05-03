#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchReport,
} from "../src/eval/implicitmembench-research";
import { resolveCliFlagValue } from "./cli-options";
import { PHASE56_CANONICAL_RUN_ID } from "./run-phase-56-eval";
import {
  PHASE56_CANONICAL_LIVE_RUN_ID,
} from "./run-phase-56-live-memory";
import {
  resolvePhase56FallbackOutputDir,
  resolvePhase56LiveMemoryOutputDir,
  resolvePhase56RepoRoot,
} from "./run-phase-56-shared";

export interface Phase56GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase56GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase56GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase56GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase56LiveReportEvidence {
  canonicalLiveReportPath: string;
  distilledBlockingCases: number;
  distilledPassedBlockingCases: number;
  explicitRecallLeakDelta: number;
  liveReportPath: string;
  rawBlockingCases: number;
  rawExplicitRecallLeakCount: number;
  rawPassedBlockingCases: number;
  requiredTaskFilesPresent: string[];
  status: "accepted" | "blocked";
  structuredRawPasses: number;
  structuredDistilledPasses: number;
}

export interface Phase56GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase56GateExecutionResult[];
  evidence: {
    deterministicReport: {
      artifactKind: "ignored_generated";
      ignoredReportPath: string;
      reason: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    liveMemoryReport: Phase56LiveReportEvidence;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-56-gate.ts";
  phase: "phase-56";
  runDirectory: string;
  runId: string;
}

export interface Phase56GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase56GateCommand) => Promise<Phase56GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-56-gate.ts";
export const PHASE56_CANONICAL_GATE_RUN_ID = "run-20260504003000";
const FROZEN_BASELINE_RAW_LEAK_COUNT = 0;
const FROZEN_BASELINE_RAW_PASSED_BLOCKING = 6;
const REQUIRED_TASK_FILES = [
  "conditioned_api_aversion.json",
  "conditioned_directory_restriction.json",
  "conditioned_jargon_avoidance.json",
  "conditioned_protocol_preference.json",
  "context_dependent_api_behavior.json",
  "logiql_query_language.json",
  "reversed_parameter_protocol.json",
  "session_key_prefix_rule.json",
  "the_alien_filesystem.json",
  "the_eccentric_api_call.json",
  "the_modified_recurrence_sequence.json",
  "the_omega_operation.json",
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

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

async function defaultRunCommand(
  command: Phase56GateCommand,
): Promise<Phase56GateCommandResult> {
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

export function resolvePhase56GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-56");
}

export function resolvePhase56CanonicalLiveReportPath(root: string): string {
  return join(
    resolvePhase56LiveMemoryOutputDir(root),
    PHASE56_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function resolvePhase56CanonicalFallbackReportPath(root: string): string {
  return join(
    resolvePhase56FallbackOutputDir(root),
    PHASE56_CANONICAL_RUN_ID,
    "report.json",
  );
}

export function parsePhase56GateCliOptions(
  argv: readonly string[],
): Phase56GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResearchReport(
  parsed: unknown,
): ImplicitMemBenchResearchReport | string {
  if (!isRecord(parsed)) {
    return "Phase 56 live report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 56 gate requires a GoodMemory research report.";
  }
  if (parsed.mode !== "live") {
    return "Phase 56 gate requires a live-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 56 live report must include profiles.";
  }

  return parsed as unknown as ImplicitMemBenchResearchReport;
}

function buildPhase56GateCommands(root: string): Phase56GateCommand[] {
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
        "tests/unit/eval.phase56.test.ts",
        "tests/unit/evolution.behavioral-policy.test.ts",
        "tests/unit/evolution.raw-behavioral-exemplars.test.ts",
        "tests/unit/host.pre-action-policy.test.ts",
        "tests/unit/runtime-kit.test.ts",
        "tests/unit/context-builder.outputs.test.ts",
        "tests/unit/implicitmembench-research.test.ts",
        "tests/unit/evolution.reviewer.test.ts",
        "tests/integration/evolution.outcome-telemetry.test.ts",
        "tests/integration/evolution.compiler.test.ts",
        "tests/integration/evolution.reviewer.test.ts",
        "tests/unit/run-phase-56.script.test.ts",
        "tests/unit/run-phase-56.gate.test.ts",
      ],
      cwd: root,
      label: "phase-56-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-56",
        "--",
        "--run-id",
        PHASE56_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-56",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-56-live-memory",
        "--",
        "--run-id",
        PHASE56_CANONICAL_LIVE_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-56-live-memory",
    },
  ];
}

function parseSmokeReport(
  parsed: unknown,
): ImplicitMemBenchResearchReport | string {
  if (!isRecord(parsed)) {
    return "Phase 56 deterministic report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 56 deterministic report must be a GoodMemory research report.";
  }
  if (parsed.mode !== "smoke") {
    return "Phase 56 deterministic report must be a smoke-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 56 deterministic report must include profiles.";
  }

  return parsed as unknown as ImplicitMemBenchResearchReport;
}

function collectStructuredPasses(
  summary: ImplicitMemBenchProfileSummary | undefined,
): number {
  if (!summary) {
    return 0;
  }

  return summary.cases.filter(
    (caseResult) =>
      caseResult.blocking &&
      caseResult.scorerFamily === "structured_first_action" &&
      caseResult.passed,
  ).length;
}

function collectTaskFiles(summary: ImplicitMemBenchProfileSummary | undefined): string[] {
  if (!summary) {
    return [];
  }

  return [...new Set(summary.cases.map((caseResult) => caseResult.taskFile))].sort();
}

function validatePhase56LiveEvidence(input: {
  canonicalLiveReportPath: string;
  liveReportPath: string;
  report: ImplicitMemBenchResearchReport;
}): Phase56LiveReportEvidence {
  const raw = input.report.profiles["goodmemory-raw-experience"];
  const distilled = input.report.profiles["goodmemory-distilled-feedback"];
  const rawTaskFiles = collectTaskFiles(raw);
  const distilledTaskFiles = collectTaskFiles(distilled);
  const allTaskFiles = [...new Set([...rawTaskFiles, ...distilledTaskFiles])].sort();
  const requiredTaskFilesPresent = REQUIRED_TASK_FILES.filter((taskFile) =>
    allTaskFiles.includes(taskFile),
  );
  const rawStructuredPasses = collectStructuredPasses(raw);
  const explicitRecallLeakDelta =
    (distilled?.explicitRecallLeakCount ?? 0) - (raw?.explicitRecallLeakCount ?? 0);

  const accepted =
    input.report.summary.executionFailures === 0 &&
    (raw?.totalBlockingCases ?? 0) === REQUIRED_TASK_FILES.length &&
    (distilled?.totalBlockingCases ?? 0) === REQUIRED_TASK_FILES.length &&
    (raw?.executionFailures ?? 0) === 0 &&
    (distilled?.executionFailures ?? 0) === 0 &&
    (raw?.explicitRecallLeakCount ?? 0) <= FROZEN_BASELINE_RAW_LEAK_COUNT &&
    (raw?.passedBlockingCases ?? 0) > FROZEN_BASELINE_RAW_PASSED_BLOCKING &&
    (distilled?.passedBlockingCases ?? 0) === REQUIRED_TASK_FILES.length &&
    collectStructuredPasses(distilled) >= 5 &&
    explicitRecallLeakDelta <= 0 &&
    requiredTaskFilesPresent.length === REQUIRED_TASK_FILES.length;

  return {
    canonicalLiveReportPath: input.canonicalLiveReportPath,
    distilledBlockingCases: distilled?.totalBlockingCases ?? 0,
    distilledPassedBlockingCases: distilled?.passedBlockingCases ?? 0,
    explicitRecallLeakDelta,
    liveReportPath: input.liveReportPath,
    rawBlockingCases: raw?.totalBlockingCases ?? 0,
    rawExplicitRecallLeakCount: raw?.explicitRecallLeakCount ?? 0,
    rawPassedBlockingCases: raw?.passedBlockingCases ?? 0,
    requiredTaskFilesPresent,
    status: accepted ? "accepted" : "blocked",
    structuredRawPasses: rawStructuredPasses,
    structuredDistilledPasses: collectStructuredPasses(distilled),
  };
}

export async function runPhase56Gate(
  options?: Phase56GateOptions,
  dependencies?: Phase56GateDependencies,
): Promise<Phase56GateReport> {
  const root = resolvePhase56RepoRoot();
  const runId = options?.runId ?? PHASE56_CANONICAL_GATE_RUN_ID;
  const outputDir = resolve(options?.outputDir ?? resolvePhase56GateOutputDir(root));
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? defaultReadTextFile;
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const canonicalFallbackReportPath = resolvePhase56CanonicalFallbackReportPath(root);
  const deterministicEvidence = {
    artifactKind: "ignored_generated" as const,
    ignoredReportPath: toRepoRelativePath(root, canonicalFallbackReportPath),
    reason:
      "Phase 56 deterministic targeted eval is generated evidence and remains reproducible ignored output.",
    regenerateCommand: `bun run eval:phase-56 -- --run-id ${PHASE56_CANONICAL_RUN_ID}`,
    status: "blocked" as const,
  };

  await ensureDir(runDirectory, { recursive: true });
  const commands: Phase56GateExecutionResult[] = [];

  for (const command of buildPhase56GateCommands(root)) {
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
      const report: Phase56GateReport = {
        acceptance: {
          decision: "blocked",
          reason: `Phase 56 gate command failed: ${command.label}`,
        },
        commands,
        evidence: {
          deterministicReport: deterministicEvidence,
          liveMemoryReport: {
            canonicalLiveReportPath: resolvePhase56CanonicalLiveReportPath(root),
            distilledBlockingCases: 0,
            distilledPassedBlockingCases: 0,
            explicitRecallLeakDelta: 0,
            liveReportPath: options?.liveReportPath ?? resolvePhase56CanonicalLiveReportPath(root),
            rawBlockingCases: 0,
            rawExplicitRecallLeakCount: 0,
            rawPassedBlockingCases: 0,
            requiredTaskFilesPresent: [],
            status: "blocked",
            structuredRawPasses: 0,
            structuredDistilledPasses: 0,
          },
        },
        generatedAt: now(),
        generatedBy: GENERATED_BY,
        phase: "phase-56",
        runDirectory,
        runId,
      };
      await writeTextFile(
        join(runDirectory, "phase-56-quality-gate.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    }
  }

  let parsedDeterministic: unknown;
  try {
    parsedDeterministic = JSON.parse(await readTextFile(canonicalFallbackReportPath));
  } catch (error) {
    const report: Phase56GateReport = {
      acceptance: {
        decision: "blocked",
        reason: `Phase 56 deterministic report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      },
      commands,
      evidence: {
        deterministicReport: deterministicEvidence,
        liveMemoryReport: {
          canonicalLiveReportPath: resolvePhase56CanonicalLiveReportPath(root),
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath: options?.liveReportPath ?? resolvePhase56CanonicalLiveReportPath(root),
          rawBlockingCases: 0,
          rawExplicitRecallLeakCount: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredRawPasses: 0,
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-56",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-56-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const deterministicReport = parseSmokeReport(parsedDeterministic);
  if (typeof deterministicReport === "string") {
    const report: Phase56GateReport = {
      acceptance: {
        decision: "blocked",
        reason: deterministicReport,
      },
      commands,
      evidence: {
        deterministicReport: deterministicEvidence,
        liveMemoryReport: {
          canonicalLiveReportPath: resolvePhase56CanonicalLiveReportPath(root),
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath: options?.liveReportPath ?? resolvePhase56CanonicalLiveReportPath(root),
          rawBlockingCases: 0,
          rawExplicitRecallLeakCount: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredRawPasses: 0,
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-56",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-56-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const canonicalLiveReportPath = resolvePhase56CanonicalLiveReportPath(root);
  const liveReportPath = resolve(options?.liveReportPath ?? canonicalLiveReportPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readTextFile(liveReportPath));
  } catch (error) {
    const report: Phase56GateReport = {
      acceptance: {
        decision: "blocked",
        reason: `Phase 56 canonical live report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      },
      commands,
      evidence: {
        deterministicReport: {
          ...deterministicEvidence,
          status: "accepted",
        },
        liveMemoryReport: {
          canonicalLiveReportPath,
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath,
          rawBlockingCases: 0,
          rawExplicitRecallLeakCount: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredRawPasses: 0,
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-56",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-56-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const parsedReport = parseResearchReport(parsed);
  const evidence =
    typeof parsedReport === "string"
      ? {
          canonicalLiveReportPath,
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath,
          rawBlockingCases: 0,
          rawExplicitRecallLeakCount: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked" as const,
          structuredRawPasses: 0,
          structuredDistilledPasses: 0,
        }
      : validatePhase56LiveEvidence({
          canonicalLiveReportPath,
          liveReportPath,
          report: parsedReport,
        });
  const accepted = evidence.status === "accepted";
  const report: Phase56GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason:
        typeof parsedReport === "string"
          ? parsedReport
          : accepted
            ? "Phase 56 targeted deterministic and live raw-carryover evidence passed."
            : "Phase 56 live-memory raw-carryover evidence did not meet the targeted bar.",
    },
    commands,
    evidence: {
      deterministicReport: {
        ...deterministicEvidence,
        status: "accepted",
      },
      liveMemoryReport: evidence,
    },
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    phase: "phase-56",
    runDirectory,
    runId,
  };

  await writeTextFile(
    join(runDirectory, "phase-56-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function main(): Promise<void> {
  const report = await runPhase56Gate(parsePhase56GateCliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
