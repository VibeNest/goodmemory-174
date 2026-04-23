import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase36GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase36GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase36GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase36GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase36GateExecutionResult[];
  evidence: {
    deterministicReport: {
      reason: string;
      reportPath: string;
      status: "accepted" | "blocked";
    };
    liveMemory: {
      liveReportPath: string;
      reason: string;
      runtimePath: "provider_backed_public_write_smoke";
      status: "accepted" | "blocked";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-36-gate.ts";
  phase: "phase-36";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase36GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase36GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase36GateCommand) => Promise<Phase36GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

interface ValidatedPhase36DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  cases: Array<{
    caseId: string;
    extractorIds?: string[];
    passed: boolean;
  }>;
  generatedBy: "scripts/run-phase-36-eval.ts";
  mode: "fallback";
  phase: "phase-36";
  summary: {
    acceptedCaseCount: number;
    annotationPolicyPassCount: number;
    domainMetadataPassCount: number;
    extractorCompositionPassCount: number;
    rulesDslPassCount: number;
    traceCompletenessPassCount: number;
    totalCases: number;
  };
}

interface ValidatedPhase36LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  evidence: {
    extractorIds?: string[];
    providerBacked: boolean;
    publicConfigOnly: boolean;
    wroteDomainMemory: boolean;
  };
  evidenceContract: {
    phase36: {
      runner: "scripts/run-phase-36-live-memory.ts";
      runtimePath: "provider_backed_public_write_smoke";
    };
  };
  generatedBy: "scripts/run-phase-36-live-memory.ts";
  mode: "live-memory";
  phase: "phase-36";
}

const GENERATED_BY = "scripts/run-phase-36-gate.ts";
const PHASE36_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260423221045";
const PHASE36_CANONICAL_LIVE_RUN_ID = "run-phase36-live-current";
const PHASE36_CANONICAL_GATE_RUN_ID = "run-20260423223045";
const PHASE36_FALLBACK_EXTRACTOR_ID = "life-coach-launch-owner-extractor";
const PHASE36_LIVE_EXTRACTOR_ID = "life-coach-live-domain-extractor";
const PHASE36_IN_SCOPE = [
  "public remember config, profile resolution, rules DSL, annotations, assistant-output policy, and metadata persistence",
  "deterministic Phase 36 eval over life-coach/domain-write public configuration",
  "provider-backed live-memory smoke evidence through the public write customization surface",
  "Phase 36 quality-gate generation and fail-closed closure validation",
] as const;
const PHASE36_OUT_OF_SCOPE = [
  "turning OneLife into a built-in preset",
  "requiring assisted extraction or provider storage for zero-config users",
  "widening top-level memory kinds beyond the stable taxonomy",
  "automatic assistant-output memory without host confirmation or verification",
] as const;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/u).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function createChildEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      entry[1] !== undefined
    ),
  );
}

function resolveMaybeRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);

  return relativePath.length > 0 ? relativePath : ".";
}

function pathsMatch(root: string, left: string, right: string): boolean {
  return resolveMaybeRelativePath(root, left) === resolveMaybeRelativePath(root, right);
}

function toExecutionResult(
  command: Phase36GateCommand,
  result: Phase36GateCommandResult,
): Phase36GateExecutionResult {
  return {
    command: formatCommand(command.args),
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    label: command.label,
    status: result.exitCode === 0 ? "passed" : "failed",
    stderrTail: tailLines(result.stderr),
    stdoutTail: tailLines(result.stdout),
  };
}

async function defaultRunPhase36GateCommand(
  command: Phase36GateCommand,
): Promise<Phase36GateCommandResult> {
  const startedAtMs = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: createChildEnv(),
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

export function resolvePhase36GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-36");
}

export function resolvePhase36CanonicalDeterministicReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-36",
    PHASE36_CANONICAL_DETERMINISTIC_RUN_ID,
    "report.json",
  );
}

export function resolvePhase36CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-36",
    PHASE36_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase36GateRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase36gate"}`;
}

export function parsePhase36GateCliOptions(
  argv: readonly string[],
): Phase36GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function buildPhase36GateCommands(root: string): Phase36GateCommand[] {
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
        "tests/unit/remember.profiles.test.ts",
        "tests/unit/remember.extraction.test.ts",
        "tests/unit/remember.engine.test.ts",
        "tests/integration/remember.profiles.test.ts",
        "tests/unit/markdown-artifacts.test.ts",
        "tests/unit/run-phase-36.script.test.ts",
        "tests/unit/run-phase-36.live-memory.test.ts",
        "tests/unit/run-phase-36.gate.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "phase-36-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-36",
        "--run-id",
        PHASE36_CANONICAL_DETERMINISTIC_RUN_ID,
      ],
      cwd: root,
      label: "phase-36-fallback-eval",
    },
  ];
}

function validatePhase36DeterministicReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase36DeterministicReport {
  const parsed = JSON.parse(content) as ValidatedPhase36DeterministicReport;

  if (parsed.phase !== "phase-36" || parsed.mode !== "fallback") {
    throw new Error("Phase 36 deterministic report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-36-eval.ts") {
    throw new Error("Phase 36 deterministic report was not generated by the canonical runner.");
  }
  if (!pathsMatch(root, reportPath, resolvePhase36CanonicalDeterministicReportPath(root))) {
    throw new Error("Phase 36 deterministic report path is not canonical.");
  }

  return parsed;
}

function validatePhase36LiveReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase36LiveReport {
  const parsed = JSON.parse(content) as ValidatedPhase36LiveReport;

  if (parsed.phase !== "phase-36" || parsed.mode !== "live-memory") {
    throw new Error("Phase 36 live report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-36-live-memory.ts") {
    throw new Error("Phase 36 live report was not generated by the canonical runner.");
  }
  if (!pathsMatch(root, reportPath, resolvePhase36CanonicalLiveReportPath(root))) {
    throw new Error("Phase 36 live report path is not canonical.");
  }

  return parsed;
}

function buildBlockedReport(input: {
  commands: Phase36GateExecutionResult[];
  deterministicReportPath: string;
  liveReportPath: string;
  reason: string;
  root: string;
  runDirectory: string;
  runId: string;
  timestamp: string;
}): Phase36GateReport {
  return {
    acceptance: {
      decision: "blocked",
      reason: input.reason,
    },
    commands: input.commands,
    evidence: {
      deterministicReport: {
        reason: input.reason,
        reportPath: toRepoRelativePath(input.root, input.deterministicReportPath),
        status: "blocked",
      },
      liveMemory: {
        liveReportPath: toRepoRelativePath(input.root, input.liveReportPath),
        reason: input.reason,
        runtimePath: "provider_backed_public_write_smoke",
        status: "blocked",
      },
    },
    generatedAt: input.timestamp,
    generatedBy: GENERATED_BY,
    phase: "phase-36",
    runDirectory: input.runDirectory,
    runId: input.runId,
    scope: {
      inScope: [...PHASE36_IN_SCOPE],
      outOfScope: [...PHASE36_OUT_OF_SCOPE],
    },
  };
}

export async function runPhase36QualityGate(
  options: Phase36GateOptions = {},
  dependencies: Phase36GateDependencies = {},
): Promise<Phase36GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase36GateOutputDir(root);
  const runId = options.runId ?? PHASE36_CANONICAL_GATE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand = dependencies.runCommand ?? defaultRunPhase36GateCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const commands: Phase36GateExecutionResult[] = [];
  const deterministicReportPath = resolvePhase36CanonicalDeterministicReportPath(root);
  const liveReportPath = options.liveReportPath
    ? resolveMaybeRelativePath(root, options.liveReportPath)
    : resolvePhase36CanonicalLiveReportPath(root);

  for (const command of buildPhase36GateCommands(root)) {
    const result = await runCommand(command);
    commands.push(toExecutionResult(command, result));
    if (result.exitCode !== 0) {
      const blocked = buildBlockedReport({
        commands,
        deterministicReportPath,
        liveReportPath,
        reason: `Required Phase 36 command failed: ${command.label}.`,
        root,
        runDirectory,
        runId,
        timestamp: now(),
      });
      await ensureDir(runDirectory, { recursive: true });
      await writeTextFile(
        join(runDirectory, "phase-36-quality-gate.json"),
        JSON.stringify(blocked, null, 2) + "\n",
      );
      return blocked;
    }
  }

  let deterministic: ValidatedPhase36DeterministicReport;
  let live: ValidatedPhase36LiveReport;
  try {
    deterministic = validatePhase36DeterministicReport(
      root,
      deterministicReportPath,
      await readTextFile(deterministicReportPath),
    );
    live = validatePhase36LiveReport(
      root,
      liveReportPath,
      await readTextFile(liveReportPath),
    );
  } catch (error) {
    const blocked = buildBlockedReport({
      commands,
      deterministicReportPath,
      liveReportPath,
      reason: error instanceof Error
        ? error.message
        : "Phase 36 canonical evidence could not be validated.",
      root,
      runDirectory,
      runId,
      timestamp: now(),
    });
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "phase-36-quality-gate.json"),
      JSON.stringify(blocked, null, 2) + "\n",
    );
    return blocked;
  }

  const deterministicAccepted =
    deterministic.acceptance.decision === "accepted" &&
    deterministic.summary.acceptedCaseCount === deterministic.summary.totalCases &&
    deterministic.summary.rulesDslPassCount === 1 &&
    deterministic.summary.annotationPolicyPassCount === 2 &&
    deterministic.summary.extractorCompositionPassCount === 1 &&
    deterministic.summary.traceCompletenessPassCount === 1 &&
    deterministic.cases.some(
      (caseResult) =>
        caseResult.caseId === "custom-assisted-composition" &&
        caseResult.passed &&
        caseResult.extractorIds?.includes(PHASE36_FALLBACK_EXTRACTOR_ID) === true,
    ) &&
    deterministic.summary.domainMetadataPassCount === 1;
  const liveAccepted =
    live.acceptance.decision === "accepted" &&
    live.evidence.extractorIds?.includes(PHASE36_LIVE_EXTRACTOR_ID) === true &&
    live.evidence.providerBacked &&
    live.evidence.publicConfigOnly &&
    live.evidence.wroteDomainMemory &&
    live.evidenceContract.phase36.runner === "scripts/run-phase-36-live-memory.ts" &&
    live.evidenceContract.phase36.runtimePath ===
      "provider_backed_public_write_smoke";
  const accepted = deterministicAccepted && liveAccepted;
  const report: Phase36GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 36 deterministic and provider-backed public write customization evidence both passed."
        : "Phase 36 deterministic or provider-backed public write customization evidence did not satisfy the canonical gate.",
    },
    commands,
    evidence: {
      deterministicReport: {
        reason: deterministicAccepted
          ? "Deterministic public remember customization eval passed every Phase 36 case."
          : "Deterministic public remember customization eval did not pass every required case.",
        reportPath: toRepoRelativePath(root, deterministicReportPath),
        status: deterministicAccepted ? "accepted" : "blocked",
      },
      liveMemory: {
        liveReportPath: toRepoRelativePath(root, liveReportPath),
        reason: liveAccepted
          ? "Provider-backed live-memory smoke proved public config-only domain writes."
          : "Provider-backed live-memory smoke did not prove public config-only domain writes.",
        runtimePath: "provider_backed_public_write_smoke",
        status: liveAccepted ? "accepted" : "blocked",
      },
    },
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    phase: "phase-36",
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE36_IN_SCOPE],
      outOfScope: [...PHASE36_OUT_OF_SCOPE],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-36-quality-gate.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

if (import.meta.main) {
  const report = await runPhase36QualityGate(
    parsePhase36GateCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
