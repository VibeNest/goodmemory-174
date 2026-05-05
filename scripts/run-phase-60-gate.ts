#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  Phase60OverallProfile,
  Phase60OverallSummary,
  Phase60ProfileOverallSummary,
} from "../src/eval/phase60";
import { resolveCliFlagValue } from "./cli-options";
import { PHASE60_CANONICAL_RUN_ID } from "./run-phase-60-eval";
import {
  resolvePhase60FallbackOutputDir,
  resolvePhase60OverallSummaryPath,
  resolvePhase60RepoRoot,
} from "./run-phase-60-shared";

export interface Phase60GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase60GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase60GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase60GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase60GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase60GateExecutionResult[];
  evidence: {
    overallSummary: {
      artifactKind: "ignored_generated";
      ignoredArtifactPath: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    protocol: {
      controlledPrimingCases: number;
      full300OverallProfiles: Phase60OverallProfile[];
      legacyPhase49SemanticsPreserved: boolean;
      requiredFields: string[];
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-60-gate.ts";
  phase: "phase-60";
  runDirectory: string;
  runId: string;
}

export interface Phase60GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase60GateCommand) => Promise<Phase60GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-60-gate.ts";
export const PHASE60_CANONICAL_GATE_RUN_ID = "run-20260505120000";

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/u).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

async function defaultReadTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function defaultRunCommand(
  command: Phase60GateCommand,
): Promise<Phase60GateCommandResult> {
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

export function resolvePhase60GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-60");
}

export function parsePhase60GateCliOptions(
  argv: readonly string[],
): Phase60GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function buildPhase60GateCommands(root: string): Phase60GateCommand[] {
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
        "tests/unit/eval.phase60.test.ts",
        "tests/unit/run-phase-60.script.test.ts",
        "tests/unit/run-phase-60.gate.test.ts",
        "tests/unit/implicitmembench-research.test.ts",
        "tests/unit/run-phase-49.gate.test.ts",
      ],
      cwd: root,
      label: "phase-60-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-60",
        "--",
        "--run-id",
        PHASE60_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-60",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-60-overall",
        "--",
        "--run-id",
        PHASE60_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "eval:phase-60-overall",
    },
  ];
}

function emptyProtocolEvidence(): Phase60GateReport["evidence"]["protocol"] {
  return {
    controlledPrimingCases: 0,
    full300OverallProfiles: [],
    legacyPhase49SemanticsPreserved: false,
    requiredFields: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseOverallSummary(parsed: unknown): Phase60OverallSummary | string {
  if (!isRecord(parsed)) {
    return "Phase 60 overall summary must be a JSON object.";
  }
  if (parsed.kind !== "phase-60-implicitmembench-overall-summary") {
    return "Phase 60 overall summary has the wrong kind.";
  }
  if (parsed.phase !== "phase-60") {
    return "Phase 60 overall summary has the wrong phase.";
  }
  if (!isRecord(parsed.profiles)) {
    return "Phase 60 overall summary must include profiles.";
  }
  if (!isRecord(parsed.protocol)) {
    return "Phase 60 overall summary must include protocol metadata.";
  }

  return parsed as unknown as Phase60OverallSummary;
}

function requiredProfileFieldsPresent(
  profile: Phase60ProfileOverallSummary | undefined,
): boolean {
  return Boolean(
    profile?.blockingScore &&
      profile.primingScore &&
      profile.full300OverallScore &&
      typeof profile.overallComparableToOfficial === "boolean" &&
      typeof profile.primingContaminationCount === "number" &&
      typeof profile.primingTaskViolationCount === "number" &&
      typeof profile.primingExplicitLeakCount === "number" &&
      isRecord(profile.primingViolationCounts) &&
      Array.isArray(profile.primingViolationExamples),
  );
}

function controlledPrimingCases(summary: Phase60OverallSummary): number {
  return Math.max(
    summary.profiles["goodmemory-controlled-priming"]?.primingScore.total ?? 0,
    summary.profiles["goodmemory-raw-experience"]?.primingScore.total ?? 0,
    summary.profiles["goodmemory-distilled-feedback+controlled-priming"]
      ?.primingScore.total ?? 0,
  );
}

function contaminatedPositiveCreditCount(
  summary: Phase60OverallSummary,
): number {
  return Object.values(summary.profiles).reduce(
    (total, profile) =>
      total + (profile?.primingScore.contaminatedPositiveCreditCount ?? 0),
    0,
  );
}

function validatePhase60Summary(summary: Phase60OverallSummary): {
  accepted: boolean;
  controlledPrimingCases: number;
  full300OverallProfiles: Phase60OverallProfile[];
  reason: string;
} {
  const requiredFields = [
    "blockingScore",
    "primingScore",
    "full300OverallScore",
    "overallComparableToOfficial",
    "primingContaminationCount",
    "primingTaskViolationCount",
    "primingExplicitLeakCount",
    "primingViolationCounts",
    "primingViolationExamples",
  ];
  const controlledCases = controlledPrimingCases(summary);
  const full300OverallProfiles = Object.entries(summary.profiles)
    .filter(([, profile]) => requiredProfileFieldsPresent(profile))
    .map(([profile]) => profile as Phase60OverallProfile);

  if (summary.claimBoundary.publicClaim || summary.claimBoundary.releaseGate) {
    return {
      accepted: false,
      controlledPrimingCases: controlledCases,
      full300OverallProfiles,
      reason: "Phase 60 summary must remain internal research evidence only.",
    };
  }
  if (!summary.protocol.legacyPhase49SemanticsPreserved) {
    return {
      accepted: false,
      controlledPrimingCases: controlledCases,
      full300OverallProfiles,
      reason: "Phase 60 summary must preserve legacy Phase 49 semantics.",
    };
  }
  if (!("bestGoodMemoryBlockingOnlyRate" in summary.comparison)) {
    return {
      accepted: false,
      controlledPrimingCases: controlledCases,
      full300OverallProfiles,
      reason: "Phase 60 summary must separately report the best GoodMemory blocking-only rate.",
    };
  }
  for (const field of requiredFields) {
    if (!summary.protocol.requiredFields.includes(field)) {
      return {
        accepted: false,
        controlledPrimingCases: controlledCases,
        full300OverallProfiles,
        reason: `Phase 60 summary is missing required field metadata: ${field}`,
      };
    }
  }
  if (
    !requiredProfileFieldsPresent(summary.profiles["goodmemory-raw-experience"]) ||
    !requiredProfileFieldsPresent(
      summary.profiles["goodmemory-distilled-feedback+controlled-priming"],
    )
  ) {
    return {
      accepted: false,
      controlledPrimingCases: controlledCases,
      full300OverallProfiles,
      reason: "Phase 60 summary must include raw and distilled+controlled overall profiles.",
    };
  }
  if (controlledCases < 1) {
    return {
      accepted: false,
      controlledPrimingCases: controlledCases,
      full300OverallProfiles,
      reason: "Phase 60 summary must include controlled priming cases.",
    };
  }
  if (contaminatedPositiveCreditCount(summary) > 0) {
    return {
      accepted: false,
      controlledPrimingCases: controlledCases,
      full300OverallProfiles,
      reason: "Phase 60 summary gave positive credit to contaminated priming.",
    };
  }

  return {
    accepted: true,
    controlledPrimingCases: controlledCases,
    full300OverallProfiles,
    reason:
      "Phase 60 overall and priming protocol passed the deterministic gate.",
  };
}

async function writeGateReport(input: {
  commands: Phase60GateExecutionResult[];
  decision: "accepted" | "blocked";
  now: () => string;
  protocol: Phase60GateReport["evidence"]["protocol"];
  reason: string;
  root: string;
  runDirectory: string;
  runId: string;
  summaryPath: string;
  writeTextFile: (path: string, content: string) => Promise<void>;
}): Promise<Phase60GateReport> {
  const report: Phase60GateReport = {
    acceptance: {
      decision: input.decision,
      reason: input.reason,
    },
    commands: input.commands,
    evidence: {
      overallSummary: {
        artifactKind: "ignored_generated",
        ignoredArtifactPath: toRepoRelativePath(input.root, input.summaryPath),
        regenerateCommand: `bun run eval:phase-60 && bun run eval:phase-60-overall -- --run-id ${PHASE60_CANONICAL_RUN_ID}`,
        status: input.decision,
      },
      protocol: input.protocol,
    },
    generatedAt: input.now(),
    generatedBy: GENERATED_BY,
    phase: "phase-60",
    runDirectory: input.runDirectory,
    runId: input.runId,
  };

  await input.writeTextFile(
    join(input.runDirectory, "phase-60-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase60Gate(
  options?: Phase60GateOptions,
  dependencies?: Phase60GateDependencies,
): Promise<Phase60GateReport> {
  const root = resolvePhase60RepoRoot();
  const runId = options?.runId ?? PHASE60_CANONICAL_GATE_RUN_ID;
  const outputDir = resolve(options?.outputDir ?? resolvePhase60GateOutputDir(root));
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? defaultReadTextFile;
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const summaryPath = resolvePhase60OverallSummaryPath(
    resolvePhase60FallbackOutputDir(root),
    PHASE60_CANONICAL_RUN_ID,
  );

  await ensureDir(runDirectory, { recursive: true });
  const commands: Phase60GateExecutionResult[] = [];

  for (const command of buildPhase60GateCommands(root)) {
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
        now,
        protocol: emptyProtocolEvidence(),
        reason: `Phase 60 gate command failed: ${command.label}`,
        root,
        runDirectory,
        runId,
        summaryPath,
        writeTextFile,
      });
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readTextFile(summaryPath)) as unknown;
  } catch (error) {
    return writeGateReport({
      commands,
      decision: "blocked",
      now,
      protocol: emptyProtocolEvidence(),
      reason: `Phase 60 overall summary is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      root,
      runDirectory,
      runId,
      summaryPath,
      writeTextFile,
    });
  }

  const summary = parseOverallSummary(parsed);
  if (typeof summary === "string") {
    return writeGateReport({
      commands,
      decision: "blocked",
      now,
      protocol: emptyProtocolEvidence(),
      reason: summary,
      root,
      runDirectory,
      runId,
      summaryPath,
      writeTextFile,
    });
  }

  const evidence = validatePhase60Summary(summary);
  return writeGateReport({
    commands,
    decision: evidence.accepted ? "accepted" : "blocked",
    now,
    protocol: {
      controlledPrimingCases: evidence.controlledPrimingCases,
      full300OverallProfiles: evidence.full300OverallProfiles,
      legacyPhase49SemanticsPreserved:
        summary.protocol.legacyPhase49SemanticsPreserved,
      requiredFields: summary.protocol.requiredFields,
    },
    reason: evidence.reason,
    root,
    runDirectory,
    runId,
    summaryPath,
    writeTextFile,
  });
}

async function main(): Promise<void> {
  const report = await runPhase60Gate(parsePhase60GateCliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
