#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchReport,
} from "../src/eval/implicitmembench-research";
import { resolveCliFlagValue } from "./cli-options";
import { PHASE52_CANONICAL_RUN_ID } from "./run-phase-52-eval";
import {
  PHASE52_CANONICAL_LIVE_RUN_ID,
} from "./run-phase-52-live-memory";
import {
  resolvePhase52FallbackOutputDir,
  resolvePhase52LiveMemoryOutputDir,
  resolvePhase52RepoRoot,
} from "./run-phase-52-shared";

export interface Phase52GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase52GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase52GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase52GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase52LiveReportEvidence {
  canonicalLiveReportPath: string;
  distilledBlockingCases: number;
  distilledPassedBlockingCases: number;
  explicitRecallLeakDelta: number;
  liveReportPath: string;
  rawBlockingCases: number;
  rawPassedBlockingCases: number;
  requiredTaskFilesPresent: string[];
  status: "accepted" | "blocked";
  structuredDistilledPasses: number;
}

export interface Phase52GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase52GateExecutionResult[];
  evidence: {
    deterministicReport: {
      artifactKind: "ignored_generated";
      ignoredReportPath: string;
      reason: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    liveMemoryReport: Phase52LiveReportEvidence;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-52-gate.ts";
  phase: "phase-52";
  runDirectory: string;
  runId: string;
}

export interface Phase52GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase52GateCommand) => Promise<Phase52GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-52-gate.ts";
export const PHASE52_CANONICAL_GATE_RUN_ID = "run-20260502183000";
const REQUIRED_TASK_FILES = [
  "conditioned_api_aversion.json",
  "conditioned_directory_restriction.json",
  "conditioned_jargon_avoidance.json",
  "conditioned_protocol_preference.json",
  "context_dependent_api_behavior.json",
  "corporate_etiquette_mandate.json",
  "logiql_query_language.json",
  "reversed_parameter_protocol.json",
  "the_modified_recurrence_sequence.json",
  "the_omega_operation.json",
  "the_scribe_s_signature.json",
  "tool_use_with_side_effects.json",
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
  command: Phase52GateCommand,
): Promise<Phase52GateCommandResult> {
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

export function resolvePhase52GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-52");
}

export function resolvePhase52CanonicalLiveReportPath(root: string): string {
  return join(
    resolvePhase52LiveMemoryOutputDir(root),
    PHASE52_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function resolvePhase52CanonicalFallbackReportPath(root: string): string {
  return join(
    resolvePhase52FallbackOutputDir(root),
    PHASE52_CANONICAL_RUN_ID,
    "report.json",
  );
}

export function parsePhase52GateCliOptions(
  argv: readonly string[],
): Phase52GateOptions {
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
    return "Phase 52 live report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 52 gate requires a GoodMemory research report.";
  }
  if (parsed.mode !== "live") {
    return "Phase 52 gate requires a live-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 52 live report must include profiles.";
  }

  return parsed as unknown as ImplicitMemBenchResearchReport;
}

function buildPhase52GateCommands(root: string): Phase52GateCommand[] {
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
        "tests/unit/evolution.behavioral-policy.test.ts",
        "tests/unit/host.pre-action-policy.test.ts",
        "tests/unit/runtime-kit.test.ts",
        "tests/unit/context-builder.outputs.test.ts",
        "tests/unit/evolution.reviewer.test.ts",
        "tests/integration/evolution.outcome-telemetry.test.ts",
        "tests/integration/evolution.compiler.test.ts",
        "tests/integration/evolution.reviewer.test.ts",
        "tests/unit/run-phase-52.script.test.ts",
        "tests/unit/run-phase-52.gate.test.ts",
      ],
      cwd: root,
      label: "phase-52-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-52",
        "--",
        "--run-id",
        PHASE52_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-52",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-52-live-memory",
        "--",
        "--run-id",
        PHASE52_CANONICAL_LIVE_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-52-live-memory",
    },
  ];
}

function parseSmokeReport(
  parsed: unknown,
): ImplicitMemBenchResearchReport | string {
  if (!isRecord(parsed)) {
    return "Phase 52 deterministic report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 52 deterministic report must be a GoodMemory research report.";
  }
  if (parsed.mode !== "smoke") {
    return "Phase 52 deterministic report must be a smoke-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 52 deterministic report must include profiles.";
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

function validatePhase52LiveEvidence(input: {
  canonicalLiveReportPath: string;
  liveReportPath: string;
  report: ImplicitMemBenchResearchReport;
}): Phase52LiveReportEvidence {
  const raw = input.report.profiles["goodmemory-raw-experience"];
  const distilled = input.report.profiles["goodmemory-distilled-feedback"];
  const rawTaskFiles = collectTaskFiles(raw);
  const distilledTaskFiles = collectTaskFiles(distilled);
  const allTaskFiles = [...new Set([...rawTaskFiles, ...distilledTaskFiles])].sort();
  const requiredTaskFilesPresent = REQUIRED_TASK_FILES.filter((taskFile) =>
    allTaskFiles.includes(taskFile),
  );
  const explicitRecallLeakDelta =
    (distilled?.explicitRecallLeakCount ?? 0) - (raw?.explicitRecallLeakCount ?? 0);

  const accepted =
    input.report.summary.executionFailures === 0 &&
    (raw?.totalBlockingCases ?? 0) === REQUIRED_TASK_FILES.length &&
    (distilled?.totalBlockingCases ?? 0) === REQUIRED_TASK_FILES.length &&
    (distilled?.passedBlockingCases ?? 0) === REQUIRED_TASK_FILES.length &&
    collectStructuredPasses(distilled) >= 2 &&
    explicitRecallLeakDelta <= 0 &&
    requiredTaskFilesPresent.length === REQUIRED_TASK_FILES.length;

  return {
    canonicalLiveReportPath: input.canonicalLiveReportPath,
    distilledBlockingCases: distilled?.totalBlockingCases ?? 0,
    distilledPassedBlockingCases: distilled?.passedBlockingCases ?? 0,
    explicitRecallLeakDelta,
    liveReportPath: input.liveReportPath,
    rawBlockingCases: raw?.totalBlockingCases ?? 0,
    rawPassedBlockingCases: raw?.passedBlockingCases ?? 0,
    requiredTaskFilesPresent,
    status: accepted ? "accepted" : "blocked",
    structuredDistilledPasses: collectStructuredPasses(distilled),
  };
}

export async function runPhase52Gate(
  options?: Phase52GateOptions,
  dependencies?: Phase52GateDependencies,
): Promise<Phase52GateReport> {
  const root = resolvePhase52RepoRoot();
  const runId = options?.runId ?? PHASE52_CANONICAL_GATE_RUN_ID;
  const outputDir = resolve(options?.outputDir ?? resolvePhase52GateOutputDir(root));
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? defaultReadTextFile;
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const canonicalFallbackReportPath = resolvePhase52CanonicalFallbackReportPath(root);
  const deterministicEvidence = {
    artifactKind: "ignored_generated" as const,
    ignoredReportPath: toRepoRelativePath(root, canonicalFallbackReportPath),
    reason:
      "Phase 52 deterministic targeted eval is generated evidence and remains reproducible ignored output.",
    regenerateCommand: `bun run eval:phase-52 -- --run-id ${PHASE52_CANONICAL_RUN_ID}`,
    status: "blocked" as const,
  };

  await ensureDir(runDirectory, { recursive: true });
  const commands: Phase52GateExecutionResult[] = [];

  for (const command of buildPhase52GateCommands(root)) {
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
      const report: Phase52GateReport = {
        acceptance: {
          decision: "blocked",
          reason: `Phase 52 gate command failed: ${command.label}`,
        },
        commands,
        evidence: {
          deterministicReport: deterministicEvidence,
          liveMemoryReport: {
            canonicalLiveReportPath: resolvePhase52CanonicalLiveReportPath(root),
            distilledBlockingCases: 0,
            distilledPassedBlockingCases: 0,
            explicitRecallLeakDelta: 0,
            liveReportPath: options?.liveReportPath ?? resolvePhase52CanonicalLiveReportPath(root),
            rawBlockingCases: 0,
            rawPassedBlockingCases: 0,
            requiredTaskFilesPresent: [],
            status: "blocked",
            structuredDistilledPasses: 0,
          },
        },
        generatedAt: now(),
        generatedBy: GENERATED_BY,
        phase: "phase-52",
        runDirectory,
        runId,
      };
      await writeTextFile(
        join(runDirectory, "phase-52-quality-gate.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    }
  }

  let parsedDeterministic: unknown;
  try {
    parsedDeterministic = JSON.parse(await readTextFile(canonicalFallbackReportPath));
  } catch (error) {
    const report: Phase52GateReport = {
      acceptance: {
        decision: "blocked",
        reason: `Phase 52 deterministic report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      },
      commands,
      evidence: {
        deterministicReport: deterministicEvidence,
        liveMemoryReport: {
          canonicalLiveReportPath: resolvePhase52CanonicalLiveReportPath(root),
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath: options?.liveReportPath ?? resolvePhase52CanonicalLiveReportPath(root),
          rawBlockingCases: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-52",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-52-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const deterministicReport = parseSmokeReport(parsedDeterministic);
  if (typeof deterministicReport === "string") {
    const report: Phase52GateReport = {
      acceptance: {
        decision: "blocked",
        reason: deterministicReport,
      },
      commands,
      evidence: {
        deterministicReport: deterministicEvidence,
        liveMemoryReport: {
          canonicalLiveReportPath: resolvePhase52CanonicalLiveReportPath(root),
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath: options?.liveReportPath ?? resolvePhase52CanonicalLiveReportPath(root),
          rawBlockingCases: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-52",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-52-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const canonicalLiveReportPath = resolvePhase52CanonicalLiveReportPath(root);
  const liveReportPath = resolve(options?.liveReportPath ?? canonicalLiveReportPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readTextFile(liveReportPath));
  } catch (error) {
    const report: Phase52GateReport = {
      acceptance: {
        decision: "blocked",
        reason: `Phase 52 canonical live report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
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
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-52",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-52-quality-gate.json"),
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
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked" as const,
          structuredDistilledPasses: 0,
        }
      : validatePhase52LiveEvidence({
          canonicalLiveReportPath,
          liveReportPath,
          report: parsedReport,
        });
  const accepted = evidence.status === "accepted";
  const report: Phase52GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason:
        typeof parsedReport === "string"
          ? parsedReport
          : accepted
            ? "Phase 52 targeted deterministic and live behavioral evidence passed."
            : "Phase 52 live-memory behavioral evidence did not meet the targeted bar.",
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
    phase: "phase-52",
    runDirectory,
    runId,
  };

  await writeTextFile(
    join(runDirectory, "phase-52-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function main(): Promise<void> {
  const report = await runPhase52Gate(parsePhase52GateCliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
