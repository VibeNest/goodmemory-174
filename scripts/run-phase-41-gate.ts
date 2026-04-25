import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase41GateCommand {
  args: string[];
  cwd: string;
  label:
    | "typecheck"
    | "targeted-regressions"
    | "phase-41-fallback-eval"
    | "phase-41-live-memory"
    | "phase-34-gate"
    | "phase-35-gate"
    | "phase-37-gate";
}

export interface Phase41GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase41GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: Phase41GateCommand["label"];
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase41DeterministicReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase41LiveMemoryEvidence {
  liveReportPath: string;
  reason: string;
  runtimePath: "installed_package_pretooluse_and_action_bridge";
  status: "accepted" | "blocked";
}

export interface Phase41PriorGateEvidence {
  gatePath: string;
  phase: "phase-34" | "phase-35" | "phase-37";
  reason: string;
  status: "accepted" | "blocked";
}

export interface Phase41GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase41GateExecutionResult[];
  evidence: {
    deterministicReport: Phase41DeterministicReportEvidence;
    liveMemory: Phase41LiveMemoryEvidence;
    phase34Gate: Phase41PriorGateEvidence;
    phase35Gate: Phase41PriorGateEvidence;
    phase37Gate: Phase41PriorGateEvidence;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-41-gate.ts";
  phase: "phase-41";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase41GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase41GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase41GateCommand) => Promise<Phase41GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase41GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase41GateOptions) => Promise<Phase41GateReport>;
}

interface ValidatedPhase41DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  generatedBy: "scripts/run-phase-41-eval.ts";
  mode: "fallback";
  phase: "phase-41";
  runId: string;
  summary: {
    installedNonRegressionPassCount: number;
    installedWinOverNoMemoryCount: number;
    storageParityPassCount: number;
    totalCases: number;
  };
}

interface ValidatedPhase41LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  evidence: {
    install: {
      registeredPreToolUseMatchesManagedConfig: boolean;
    };
    preAction: {
      deepAnalyzerDenied: boolean;
      deepAnalyzerExecutedStep?: string;
      destructiveVetoed: boolean;
      lowRiskAllowed: boolean;
      sharedInstalledStorage: boolean;
    };
    releaseContract: {
      distribution: "tarball-first";
      runtime: "bun-only";
    };
  };
  evidenceContract: {
    phase41: {
      packageBoundary: "installed_package_public_imports";
      runner: string;
      runtimePath: "installed_package_pretooluse_and_action_bridge";
    };
  };
  generatedBy: string;
  mode: "live-memory";
  outputDir: string;
  phase: "phase-41";
  runDirectory: string;
  runId: string;
}

interface ValidatedPriorGateReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  generatedBy: string;
  phase: "phase-34" | "phase-35" | "phase-37";
}

const GENERATED_BY = "scripts/run-phase-41-gate.ts";
const PHASE41_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260425213045";
const PHASE41_CANONICAL_LIVE_RUN_ID = "run-phase41-live-current";
const PHASE34_CANONICAL_GATE_PATH =
  "reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json";
const PHASE35_CANONICAL_GATE_PATH =
  "reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json";
const PHASE37_CANONICAL_GATE_PATH =
  "reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json";
const PHASE41_IN_SCOPE = [
  "installed Codex PreToolUse registration plus installed action bridge closure",
  "deterministic rewrite, veto, low-risk non-regression, and shared-storage parity evidence",
  "tarball-first installed-package live validation for the managed PreToolUse hook and installed action bridge",
  "regression coverage against accepted Phase 34, Phase 35, and Phase 37 guarantees",
] as const;
const PHASE41_OUT_OF_SCOPE = [
  "reopening Phase 34 bootstrap-wrapper closure",
  "widening the root GoodMemory API",
  "claiming Claude pre-action parity or a second live blocker",
  "default-on writeback or transcript persistence",
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
  command: Phase41GateCommand,
  result: Phase41GateCommandResult,
): Phase41GateExecutionResult {
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

function createChildEnv(): Record<string, string> {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      entry[1] !== undefined
    ),
  );
  env.PHASE41_GATE_IN_PROGRESS = "1";
  return env;
}

async function defaultRunPhase41GateCommand(
  command: Phase41GateCommand,
): Promise<Phase41GateCommandResult> {
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

export function resolvePhase41GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-41");
}

export function resolvePhase41CanonicalDeterministicReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-41",
    PHASE41_CANONICAL_DETERMINISTIC_RUN_ID,
    "report.json",
  );
}

export function resolvePhase41CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-41",
    PHASE41_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase41GateRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase41gate"}`;
}

export function parsePhase41GateCliOptions(
  argv: readonly string[],
): Phase41GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function buildPhase41GateCommands(root: string): Phase41GateCommand[] {
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
        "tests/unit/host-install.test.ts",
        "tests/unit/host-hook-runtime.test.ts",
        "tests/unit/host-action-runtime.test.ts",
        "tests/unit/host-bootstrap.test.ts",
        "tests/integration/installed-host-action.test.ts",
        "tests/unit/run-phase-41-eval.test.ts",
        "tests/unit/run-phase-41-live-memory.test.ts",
        "tests/unit/run-phase-41-gate.test.ts",
        "tests/cli/cli.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-41",
        "--run-id",
        PHASE41_CANONICAL_DETERMINISTIC_RUN_ID,
      ],
      cwd: root,
      label: "phase-41-fallback-eval",
    },
    {
      args: ["bun", "run", "eval:phase-41-live-memory"],
      cwd: root,
      label: "phase-41-live-memory",
    },
    {
      args: ["bun", "run", "gate:phase-34"],
      cwd: root,
      label: "phase-34-gate",
    },
    {
      args: ["bun", "run", "gate:phase-35"],
      cwd: root,
      label: "phase-35-gate",
    },
    {
      args: ["bun", "run", "gate:phase-37"],
      cwd: root,
      label: "phase-37-gate",
    },
  ];
}

function validatePhase41DeterministicReport(
  report: ValidatedPhase41DeterministicReport,
): Phase41DeterministicReportEvidence {
  const accepted =
    report.acceptance.decision === "accepted" &&
    report.generatedBy === "scripts/run-phase-41-eval.ts" &&
    report.mode === "fallback" &&
    report.phase === "phase-41" &&
    report.summary.installedNonRegressionPassCount === 3 &&
    report.summary.installedWinOverNoMemoryCount === 3 &&
    report.summary.storageParityPassCount === 1 &&
    report.summary.totalCases === 4;

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath: `reports/eval/fallback/phase-41/${report.runId}/report.json`,
    reason: accepted
      ? "Installed deterministic rewrite, veto, low-risk guidance, and shared-storage parity evidence is accepted."
      : "Phase 41 deterministic evidence is missing the required installed non-regression, win-over-no-memory, or storage parity counts.",
    regenerateCommand: `bun run eval:phase-41 --run-id ${report.runId}`,
    status: accepted ? "accepted" : "blocked",
  };
}

function validatePhase41LiveReport(
  root: string,
  report: ValidatedPhase41LiveReport,
  liveReportPath: string,
): Phase41LiveMemoryEvidence {
  const accepted =
    report.acceptance.decision === "accepted" &&
    report.mode === "live-memory" &&
    report.phase === "phase-41" &&
    report.generatedBy === "scripts/run-phase-41-live-memory.ts" &&
    report.evidence.install.registeredPreToolUseMatchesManagedConfig &&
    report.evidence.preAction.deepAnalyzerDenied &&
    report.evidence.preAction.deepAnalyzerExecutedStep === "./tools/QuickCheck" &&
    report.evidence.preAction.destructiveVetoed &&
    report.evidence.preAction.lowRiskAllowed &&
    report.evidence.preAction.sharedInstalledStorage &&
    report.evidence.releaseContract.distribution === "tarball-first" &&
    report.evidence.releaseContract.runtime === "bun-only" &&
    report.evidenceContract.phase41.packageBoundary ===
      "installed_package_public_imports" &&
    report.evidenceContract.phase41.runtimePath ===
      "installed_package_pretooluse_and_action_bridge";

  return {
    liveReportPath: toRepoRelativePath(root, liveReportPath),
    reason: accepted
      ? "Installed-package Codex live evidence confirms managed PreToolUse, installed action-bridge rewrite/veto behavior, low-risk allow, and shared installed storage."
      : "Phase 41 live installed Codex evidence is missing managed-hook proof, rewrite/veto behavior, low-risk allow, or shared-storage confirmation.",
    runtimePath: "installed_package_pretooluse_and_action_bridge",
    status: accepted ? "accepted" : "blocked",
  };
}

function validatePriorGate(input: {
  expectedPhase: "phase-34" | "phase-35" | "phase-37";
  gatePath: string;
  report: ValidatedPriorGateReport;
}): Phase41PriorGateEvidence {
  const accepted =
    input.report.acceptance.decision === "accepted" &&
    input.report.phase === input.expectedPhase;

  return {
    gatePath: input.gatePath,
    phase: input.expectedPhase,
    reason: accepted
      ? `${input.expectedPhase} remains accepted and regression-covered for Phase 41 closure.`
      : `${input.expectedPhase} is not accepted, so Phase 41 cannot close on top of it.`,
    status: accepted ? "accepted" : "blocked",
  };
}

export async function runPhase41QualityGate(
  options: Phase41GateOptions = {},
  dependencies: Phase41GateDependencies = {},
): Promise<Phase41GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase41GateOutputDir(root);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand =
    dependencies.runCommand ?? defaultRunPhase41GateCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const runId = options.runId ?? buildPhase41GateRunId(now());
  const runDirectory = join(outputDir, runId);
  const commands: Phase41GateExecutionResult[] = [];

  await ensureDir(runDirectory, { recursive: true });

  for (const command of buildPhase41GateCommands(root)) {
    const result = await runCommand(command);
    commands.push(toExecutionResult(command, result));
  }

  const deterministicReport = JSON.parse(
    await readTextFile(resolvePhase41CanonicalDeterministicReportPath(root)),
  ) as ValidatedPhase41DeterministicReport;
  const liveReportPath =
    options.liveReportPath ?? resolvePhase41CanonicalLiveReportPath(root);
  const liveReport = JSON.parse(
    await readTextFile(liveReportPath),
  ) as ValidatedPhase41LiveReport;
  const phase34Gate = JSON.parse(
    await readTextFile(resolveMaybeRelativePath(root, PHASE34_CANONICAL_GATE_PATH)),
  ) as ValidatedPriorGateReport;
  const phase35Gate = JSON.parse(
    await readTextFile(resolveMaybeRelativePath(root, PHASE35_CANONICAL_GATE_PATH)),
  ) as ValidatedPriorGateReport;
  const phase37Gate = JSON.parse(
    await readTextFile(resolveMaybeRelativePath(root, PHASE37_CANONICAL_GATE_PATH)),
  ) as ValidatedPriorGateReport;

  const deterministicEvidence = validatePhase41DeterministicReport(
    deterministicReport,
  );
  const liveEvidence = validatePhase41LiveReport(root, liveReport, liveReportPath);
  const phase34Evidence = validatePriorGate({
    expectedPhase: "phase-34",
    gatePath: PHASE34_CANONICAL_GATE_PATH,
    report: phase34Gate,
  });
  const phase35Evidence = validatePriorGate({
    expectedPhase: "phase-35",
    gatePath: PHASE35_CANONICAL_GATE_PATH,
    report: phase35Gate,
  });
  const phase37Evidence = validatePriorGate({
    expectedPhase: "phase-37",
    gatePath: PHASE37_CANONICAL_GATE_PATH,
    report: phase37Gate,
  });

  const commandFailures = commands.some((command) => command.status === "failed");
  const accepted =
    !commandFailures &&
    deterministicEvidence.status === "accepted" &&
    liveEvidence.status === "accepted" &&
    phase34Evidence.status === "accepted" &&
    phase35Evidence.status === "accepted" &&
    phase37Evidence.status === "accepted" &&
    pathsMatch(
      root,
      deterministicEvidence.ignoredReportPath,
      resolvePhase41CanonicalDeterministicReportPath(root),
    ) &&
    pathsMatch(root, liveEvidence.liveReportPath, liveReportPath);

  const report: Phase41GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 41 is closed: deterministic installed pre-action evidence, tarball-first installed live evidence, and the accepted Phase 34/35/37 gates all hold."
        : "Phase 41 cannot close until the deterministic report, live installed Codex report, and prior accepted phase gates all pass on the canonical paths.",
    },
    commands,
    evidence: {
      deterministicReport: deterministicEvidence,
      liveMemory: liveEvidence,
      phase34Gate: phase34Evidence,
      phase35Gate: phase35Evidence,
      phase37Gate: phase37Evidence,
    },
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    phase: "phase-41",
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE41_IN_SCOPE],
      outOfScope: [...PHASE41_OUT_OF_SCOPE],
    },
  };

  await writeTextFile(
    join(runDirectory, "phase-41-quality-gate.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  return report;
}

export async function main(
  dependencies: Phase41GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const runGate = dependencies.runGate ?? runPhase41QualityGate;
  const report = await runGate(parsePhase41GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
