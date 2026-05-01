#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchReport,
} from "../src/eval/implicitmembench-research";
import { resolveCliFlagValue } from "./cli-options";
import { PHASE51_CANONICAL_RUN_ID } from "./run-phase-51-eval";
import {
  PHASE51_CANONICAL_LIVE_RUN_ID,
} from "./run-phase-51-live-memory";
import {
  resolvePhase51FallbackOutputDir,
  resolvePhase51LiveMemoryOutputDir,
  resolvePhase51RepoRoot,
} from "./run-phase-51-shared";

export interface Phase51GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase51GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase51GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase51GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase51LiveReportEvidence {
  canonicalLiveReportPath: string;
  distilledBlockingCases: number;
  distilledPassedBlockingCases: number;
  explicitRecallLeakDelta: number;
  liveReportPath: string;
  primingOnlyInRaw: boolean;
  rawBlockingCases: number;
  rawPassedBlockingCases: number;
  requiredTaskFilesPresent: string[];
  status: "accepted" | "blocked";
  structuredDistilledPasses: number;
}

export interface Phase51GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase51GateExecutionResult[];
  evidence: {
    deterministicReport: {
      artifactKind: "ignored_generated";
      ignoredReportPath: string;
      reason: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    liveMemoryReport: Phase51LiveReportEvidence;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-51-gate.ts";
  phase: "phase-51";
  runDirectory: string;
  runId: string;
}

export interface Phase51GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase51GateCommand) => Promise<Phase51GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-51-gate.ts";
export const PHASE51_CANONICAL_GATE_RUN_ID = "run-20260430164000";
const REQUIRED_TASK_FILES = [
  "conditioned_directory_restriction.json",
  "conditioned_protocol_preference.json",
  "corporate_etiquette_mandate.json",
  "logiql_query_language.json",
  "reversed_parameter_protocol.json",
  "the_modified_recurrence_sequence.json",
  "the_omega_operation.json",
  "the_scribe_s_signature.json",
  "volcanic_eruption.json",
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
  command: Phase51GateCommand,
): Promise<Phase51GateCommandResult> {
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

export function resolvePhase51GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-51");
}

export function resolvePhase51CanonicalLiveReportPath(root: string): string {
  return join(
    resolvePhase51LiveMemoryOutputDir(root),
    PHASE51_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function resolvePhase51CanonicalFallbackReportPath(root: string): string {
  return join(
    resolvePhase51FallbackOutputDir(root),
    PHASE51_CANONICAL_RUN_ID,
    "report.json",
  );
}

export function parsePhase51GateCliOptions(
  argv: readonly string[],
): Phase51GateOptions {
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
    return "Phase 51 live report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 51 gate requires a GoodMemory research report.";
  }
  if (parsed.mode !== "live") {
    return "Phase 51 gate requires a live-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 51 live report must include profiles.";
  }

  return parsed as unknown as ImplicitMemBenchResearchReport;
}

function buildPhase51GateCommands(root: string): Phase51GateCommand[] {
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
        "tests/integration/evolution.outcome-telemetry.test.ts",
        "tests/integration/evolution.compiler.test.ts",
        "tests/unit/run-phase-51.script.test.ts",
        "tests/unit/run-phase-51.gate.test.ts",
      ],
      cwd: root,
      label: "phase-51-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-51",
        "--",
        "--run-id",
        PHASE51_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-51",
    },
  ];
}

function parseSmokeReport(
  parsed: unknown,
): ImplicitMemBenchResearchReport | string {
  if (!isRecord(parsed)) {
    return "Phase 51 deterministic report must be a JSON object.";
  }
  if (parsed.kind !== "goodmemory") {
    return "Phase 51 deterministic report must be a GoodMemory research report.";
  }
  if (parsed.mode !== "smoke") {
    return "Phase 51 deterministic report must be a smoke-mode report.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 51 deterministic report must include profiles.";
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

function validatePhase51LiveEvidence(input: {
  canonicalLiveReportPath: string;
  liveReportPath: string;
  report: ImplicitMemBenchResearchReport;
}): Phase51LiveReportEvidence {
  const raw = input.report.profiles["goodmemory-raw-experience"];
  const distilled = input.report.profiles["goodmemory-distilled-feedback"];
  const rawTaskFiles = collectTaskFiles(raw);
  const distilledTaskFiles = collectTaskFiles(distilled);
  const allTaskFiles = [...new Set([...rawTaskFiles, ...distilledTaskFiles])].sort();
  const requiredTaskFilesPresent = REQUIRED_TASK_FILES.filter((taskFile) =>
    allTaskFiles.includes(taskFile),
  );
  const primingOnlyInRaw =
    (raw?.caseCountsByDataset.priming ?? 0) > 0 &&
    (distilled?.caseCountsByDataset.priming ?? 0) === 0;
  const explicitRecallLeakDelta =
    (distilled?.explicitRecallLeakCount ?? 0) - (raw?.explicitRecallLeakCount ?? 0);

  const accepted =
    input.report.summary.executionFailures === 0 &&
    (raw?.totalBlockingCases ?? 0) >= 8 &&
    (distilled?.totalBlockingCases ?? 0) >= 8 &&
    (distilled?.passedBlockingCases ?? 0) >= 6 &&
    (distilled?.passedBlockingCases ?? 0) > (raw?.passedBlockingCases ?? 0) &&
    collectStructuredPasses(distilled) >= 1 &&
    primingOnlyInRaw &&
    requiredTaskFilesPresent.length === REQUIRED_TASK_FILES.length;

  return {
    canonicalLiveReportPath: input.canonicalLiveReportPath,
    distilledBlockingCases: distilled?.totalBlockingCases ?? 0,
    distilledPassedBlockingCases: distilled?.passedBlockingCases ?? 0,
    explicitRecallLeakDelta,
    liveReportPath: input.liveReportPath,
    primingOnlyInRaw,
    rawBlockingCases: raw?.totalBlockingCases ?? 0,
    rawPassedBlockingCases: raw?.passedBlockingCases ?? 0,
    requiredTaskFilesPresent,
    status: accepted ? "accepted" : "blocked",
    structuredDistilledPasses: collectStructuredPasses(distilled),
  };
}

export async function runPhase51Gate(
  options?: Phase51GateOptions,
  dependencies?: Phase51GateDependencies,
): Promise<Phase51GateReport> {
  const root = resolvePhase51RepoRoot();
  const runId = options?.runId ?? PHASE51_CANONICAL_GATE_RUN_ID;
  const outputDir = resolve(options?.outputDir ?? resolvePhase51GateOutputDir(root));
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? defaultReadTextFile;
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const canonicalFallbackReportPath = resolvePhase51CanonicalFallbackReportPath(root);
  const deterministicEvidence = {
    artifactKind: "ignored_generated" as const,
    ignoredReportPath: toRepoRelativePath(root, canonicalFallbackReportPath),
    reason:
      "Phase 51 deterministic targeted eval is generated evidence and remains reproducible ignored output.",
    regenerateCommand: `bun run eval:phase-51 -- --run-id ${PHASE51_CANONICAL_RUN_ID}`,
    status: "blocked" as const,
  };

  await ensureDir(runDirectory, { recursive: true });
  const commands: Phase51GateExecutionResult[] = [];

  for (const command of buildPhase51GateCommands(root)) {
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
      const report: Phase51GateReport = {
        acceptance: {
          decision: "blocked",
          reason: `Phase 51 gate command failed: ${command.label}`,
        },
        commands,
        evidence: {
          deterministicReport: deterministicEvidence,
          liveMemoryReport: {
            canonicalLiveReportPath: resolvePhase51CanonicalLiveReportPath(root),
            distilledBlockingCases: 0,
            distilledPassedBlockingCases: 0,
            explicitRecallLeakDelta: 0,
            liveReportPath: options?.liveReportPath ?? resolvePhase51CanonicalLiveReportPath(root),
            primingOnlyInRaw: false,
            rawBlockingCases: 0,
            rawPassedBlockingCases: 0,
            requiredTaskFilesPresent: [],
            status: "blocked",
            structuredDistilledPasses: 0,
          },
        },
        generatedAt: now(),
        generatedBy: GENERATED_BY,
        phase: "phase-51",
        runDirectory,
        runId,
      };
      await writeTextFile(
        join(runDirectory, "phase-51-quality-gate.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    }
  }

  let parsedDeterministic: unknown;
  try {
    parsedDeterministic = JSON.parse(await readTextFile(canonicalFallbackReportPath));
  } catch (error) {
    const report: Phase51GateReport = {
      acceptance: {
        decision: "blocked",
        reason: `Phase 51 deterministic report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      },
      commands,
      evidence: {
        deterministicReport: deterministicEvidence,
        liveMemoryReport: {
          canonicalLiveReportPath: resolvePhase51CanonicalLiveReportPath(root),
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath: options?.liveReportPath ?? resolvePhase51CanonicalLiveReportPath(root),
          primingOnlyInRaw: false,
          rawBlockingCases: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-51",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-51-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const deterministicReport = parseSmokeReport(parsedDeterministic);
  if (typeof deterministicReport === "string") {
    const report: Phase51GateReport = {
      acceptance: {
        decision: "blocked",
        reason: deterministicReport,
      },
      commands,
      evidence: {
        deterministicReport: deterministicEvidence,
        liveMemoryReport: {
          canonicalLiveReportPath: resolvePhase51CanonicalLiveReportPath(root),
          distilledBlockingCases: 0,
          distilledPassedBlockingCases: 0,
          explicitRecallLeakDelta: 0,
          liveReportPath: options?.liveReportPath ?? resolvePhase51CanonicalLiveReportPath(root),
          primingOnlyInRaw: false,
          rawBlockingCases: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-51",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-51-quality-gate.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  }

  const canonicalLiveReportPath = resolvePhase51CanonicalLiveReportPath(root);
  const liveReportPath = resolve(options?.liveReportPath ?? canonicalLiveReportPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readTextFile(liveReportPath));
  } catch (error) {
    const report: Phase51GateReport = {
      acceptance: {
        decision: "blocked",
        reason: `Phase 51 canonical live report is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
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
          primingOnlyInRaw: false,
          rawBlockingCases: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked",
          structuredDistilledPasses: 0,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      phase: "phase-51",
      runDirectory,
      runId,
    };
    await writeTextFile(
      join(runDirectory, "phase-51-quality-gate.json"),
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
          primingOnlyInRaw: false,
          rawBlockingCases: 0,
          rawPassedBlockingCases: 0,
          requiredTaskFilesPresent: [],
          status: "blocked" as const,
          structuredDistilledPasses: 0,
        }
      : validatePhase51LiveEvidence({
          canonicalLiveReportPath,
          liveReportPath,
          report: parsedReport,
        });
  const accepted = evidence.status === "accepted";
  const report: Phase51GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason:
        typeof parsedReport === "string"
          ? parsedReport
          : accepted
            ? "Phase 51 targeted deterministic and live behavioral evidence passed."
            : "Phase 51 live-memory behavioral evidence did not meet the targeted bar.",
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
    phase: "phase-51",
    runDirectory,
    runId,
  };

  await writeTextFile(
    join(runDirectory, "phase-51-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function main(): Promise<void> {
  const report = await runPhase51Gate(parsePhase51GateCliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
