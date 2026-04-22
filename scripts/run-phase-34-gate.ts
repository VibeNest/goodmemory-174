import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase34GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase34GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase34GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase34DeterministicReportEvidence {
  reason: string;
  reportPath: string;
  status: "accepted" | "blocked";
}

export interface Phase34LiveMemoryEvidence {
  hostKind: "codex";
  liveEnforcementPath: "installed_package_action_gate_wrapper";
  liveReportPath: string;
  reason: string;
  status: "accepted" | "blocked";
}

export interface Phase34GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase34GateExecutionResult[];
  evidence: {
    deterministicReport: Phase34DeterministicReportEvidence;
    liveMemory: Phase34LiveMemoryEvidence;
  };
  generatedAt: string;
  generatedBy: string;
  phase: "phase-34";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase34GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase34GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase34GateCommand) => Promise<Phase34GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase34GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase34GateOptions) => Promise<Phase34GateReport>;
}

interface ValidatedPhase34DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  generatedBy: "scripts/run-phase-34-eval.ts";
  mode: "fallback";
  phase: "phase-34";
  runId: string;
  summary: {
    completionNonRegressionPassCount: number;
    correctedFirstStepCount: number;
    correctedFirstStepRate: number;
    falseBlockCount: number;
    falseBlockRate: number;
    firstActionInterceptionCount: number;
    firstActionInterceptionRate: number;
    highRiskCaseCount: number;
    lowRiskCaseCount: number;
    noMemoryReminderCount: number;
    phase32SoftGuardReminderCount: number;
    totalCases: number;
  };
}

interface ValidatedPhase34LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  comparison: {
    baselines: {
      noMemory: "no-memory";
    };
    cases: Array<{
      caseId: "command-blocked-veto" | "command-rewrite" | "low-risk-guidance";
      completionNonRegressionPass: boolean;
      correctedFirstStep: boolean;
      falseBlock: boolean;
      firstActionIntercepted: boolean;
      risk: "high" | "low";
    }>;
  };
  evidence: {
    host: {
      actionGatePath: ".goodmemory/bootstrap/codex-action.mjs";
      bootstrapArtifactsPresent: {
        actionGateScript: boolean;
        agents: boolean;
        hooksConfig: boolean;
        hooksToml: boolean;
        rulesFile: boolean;
      };
      hookParityScaffoldOnly: true;
      installedPackageBootstrap: true;
      kind: "codex";
      liveEnforcementPath: "installed_package_action_gate_wrapper";
    };
  };
  evidenceContract: {
    phase34: {
      packageBoundary: "installed_package_public_imports";
      runner: string;
      runtimePath: "installed_package_action_gate_wrapper";
    };
  };
  generatedBy: string;
  mode: "live-memory";
  outputDir: string;
  phase: "phase-34";
  runDirectory: string;
  runId: string;
  summary: {
    completionNonRegressionPassCount: number;
    correctedFirstStepCount: number;
    correctedFirstStepRate: number;
    executableRewriteCount: number;
    falseBlockCount: number;
    falseBlockRate: number;
    firstActionInterceptionCount: number;
    firstActionInterceptionRate: number;
    highRiskCaseCount: number;
    lowRiskCaseCount: number;
    totalCases: number;
  };
}

const GENERATED_BY = "scripts/run-phase-34-gate.ts";
const PHASE34_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260422213045";
const PHASE34_CANONICAL_LIVE_RUN_ID = "run-phase34-live-current";
const PHASE34_CANONICAL_GATE_RUN_ID = "run-20260422235930";
const PHASE34_REQUIRED_LIVE_CASE_IDS = [
  "command-rewrite",
  "command-blocked-veto",
  "low-risk-guidance",
] as const;
const PHASE34_IN_SCOPE = [
  "phase-34 deterministic pre-action evidence against the Phase 32 soft-guard and no-memory baselines",
  "one canonical installed-package Codex action-gate live report for executable rewrite, destructive veto, and low-risk non-regression",
  "repo-local Codex bootstrap scaffolds for AGENTS, wrapper, hooks, config, and rules through public package imports",
  "phase-34 quality-gate generation and fail-closed closure validation",
] as const;
const PHASE34_OUT_OF_SCOPE = [
  "claiming native Codex hook interception is the canonical live blocker when the current runtime does not prove it",
  "widening the root API or opening a public goodmemory/evolution module",
  "making Claude a second live gate blocker",
  "new memory capability work beyond the accepted host pre-action contract slice",
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
  command: Phase34GateCommand,
  result: Phase34GateCommandResult,
): Phase34GateExecutionResult {
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

function createChildEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }

  return env;
}

export function resolvePhase34GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-34");
}

export function resolvePhase34CanonicalDeterministicReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-34",
    PHASE34_CANONICAL_DETERMINISTIC_RUN_ID,
    "report.json",
  );
}

export function resolvePhase34CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-34",
    PHASE34_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase34GateRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase34gate"}`;
}

export function parsePhase34GateCliOptions(
  argv: readonly string[],
): Phase34GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function buildPhase34GateCommands(root: string): Phase34GateCommand[] {
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
        "tests/unit/host.action-execution.test.ts",
        "tests/unit/host.pre-action-policy.test.ts",
        "tests/integration/host.action-assessment.test.ts",
        "tests/unit/run-phase-34.script.test.ts",
        "tests/unit/run-phase-34.live-memory.test.ts",
        "tests/unit/run-phase-34.gate.test.ts",
        "tests/cli/cli.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "targeted-regressions",
    },
  ];
}

export async function defaultRunPhase34GateCommand(
  command: Phase34GateCommand,
): Promise<Phase34GateCommandResult> {
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

function validatePhase34DeterministicReport(
  raw: string,
): ValidatedPhase34DeterministicReport {
  const report = JSON.parse(raw) as ValidatedPhase34DeterministicReport;

  if (report.phase !== "phase-34" || report.mode !== "fallback") {
    throw new Error("Phase 34 deterministic report has the wrong phase or mode.");
  }
  if (report.generatedBy !== "scripts/run-phase-34-eval.ts") {
    throw new Error("Phase 34 deterministic report was not generated by the canonical runner.");
  }
  if (report.acceptance.decision !== "accepted") {
    throw new Error("Phase 34 deterministic report is not accepted.");
  }
  if (
    report.summary.firstActionInterceptionCount !== report.summary.highRiskCaseCount ||
    report.summary.correctedFirstStepCount !== report.summary.highRiskCaseCount ||
    report.summary.falseBlockCount !== 0 ||
    report.summary.completionNonRegressionPassCount !== report.summary.totalCases
  ) {
    throw new Error(
      "Phase 34 deterministic report does not satisfy the interception/non-regression thresholds.",
    );
  }

  return report;
}

function validatePhase34LiveReport(raw: string): ValidatedPhase34LiveReport {
  const report = JSON.parse(raw) as ValidatedPhase34LiveReport;

  if (report.phase !== "phase-34" || report.mode !== "live-memory") {
    throw new Error("Phase 34 live report has the wrong phase or mode.");
  }
  if (report.generatedBy !== "scripts/run-phase-34-live-memory.ts") {
    throw new Error("Phase 34 live report was not generated by the canonical runner.");
  }
  if (report.acceptance.decision !== "accepted") {
    throw new Error("Phase 34 live report is not accepted.");
  }
  if (report.evidence.host.kind !== "codex") {
    throw new Error("Phase 34 live report must stay on the Codex line.");
  }
  if (!report.evidence.host.installedPackageBootstrap) {
    throw new Error("Phase 34 live report must prove installed-package bootstrap.");
  }
  if (report.evidence.host.liveEnforcementPath !== "installed_package_action_gate_wrapper") {
    throw new Error("Phase 34 live report must use the action-gate wrapper as the canonical path.");
  }
  if (!report.evidence.host.hookParityScaffoldOnly) {
    throw new Error("Phase 34 live report must keep hooks as parity scaffolds only.");
  }
  if (
    !report.evidence.host.bootstrapArtifactsPresent.actionGateScript ||
    !report.evidence.host.bootstrapArtifactsPresent.agents ||
    !report.evidence.host.bootstrapArtifactsPresent.hooksConfig ||
    !report.evidence.host.bootstrapArtifactsPresent.hooksToml ||
    !report.evidence.host.bootstrapArtifactsPresent.rulesFile
  ) {
    throw new Error("Phase 34 live report is missing required bootstrap scaffold evidence.");
  }
  if (
    report.summary.firstActionInterceptionCount !== report.summary.highRiskCaseCount ||
    report.summary.correctedFirstStepCount !== report.summary.highRiskCaseCount ||
    report.summary.executableRewriteCount < 1 ||
    report.summary.falseBlockCount !== 0 ||
    report.summary.completionNonRegressionPassCount !== report.summary.totalCases
  ) {
    throw new Error(
      "Phase 34 live report does not satisfy the executable rewrite or non-regression thresholds.",
    );
  }

  const caseIds = new Set(report.comparison.cases.map((caseResult) => caseResult.caseId));
  for (const caseId of PHASE34_REQUIRED_LIVE_CASE_IDS) {
    if (!caseIds.has(caseId)) {
      throw new Error(`Phase 34 live report is missing the required case: ${caseId}`);
    }
  }

  return report;
}

export async function runPhase34QualityGate(
  options: Phase34GateOptions = {},
  dependencies: Phase34GateDependencies = {},
): Promise<Phase34GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase34GateOutputDir(root);
  const runId = options.runId ?? PHASE34_CANONICAL_GATE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand =
    dependencies.runCommand ?? defaultRunPhase34GateCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const commands: Phase34GateExecutionResult[] = [];

  await ensureDir(runDirectory, { recursive: true });

  for (const command of buildPhase34GateCommands(root)) {
    const result = await runCommand(command);
    commands.push(toExecutionResult(command, result));
    if (result.exitCode !== 0) {
      throw new Error(`Phase 34 gate command failed: ${command.label}`);
    }
  }

  const deterministicReportPath = resolvePhase34CanonicalDeterministicReportPath(root);
  const liveReportPath = options.liveReportPath
    ? resolveMaybeRelativePath(root, options.liveReportPath)
    : resolvePhase34CanonicalLiveReportPath(root);
  const deterministicReport = validatePhase34DeterministicReport(
    await readTextFile(deterministicReportPath),
  );
  const liveReport = validatePhase34LiveReport(await readTextFile(liveReportPath));

  const expectedLiveRunDirectorySuffix = join(
    "reports/eval/live-memory/phase-34",
    liveReport.runId,
  );
  if (!liveReport.runDirectory.endsWith(expectedLiveRunDirectorySuffix)) {
    throw new Error("Phase 34 live report runDirectory does not match its runId.");
  }

  const report: Phase34GateReport = {
    acceptance: {
      decision: "accepted",
      reason:
        "Phase 34 deterministic and installed-package Codex action-gate live evidence are both accepted, and the targeted host/package/release regressions passed.",
    },
    commands,
    evidence: {
      deterministicReport: {
        reason: deterministicReport.acceptance.reason,
        reportPath: toRepoRelativePath(root, deterministicReportPath),
        status: deterministicReport.acceptance.decision,
      },
      liveMemory: {
        hostKind: liveReport.evidence.host.kind,
        liveEnforcementPath: liveReport.evidence.host.liveEnforcementPath,
        liveReportPath: toRepoRelativePath(root, liveReportPath),
        reason: liveReport.acceptance.reason,
        status: liveReport.acceptance.decision,
      },
    },
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    phase: "phase-34",
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE34_IN_SCOPE],
      outOfScope: [...PHASE34_OUT_OF_SCOPE],
    },
  };

  await writeTextFile(
    join(runDirectory, "phase-34-quality-gate.json"),
    JSON.stringify(report, null, 2),
  );

  return report;
}

export async function runPhase34GateCli(
  dependencies: Phase34GateCliDependencies = {},
): Promise<Phase34GateReport> {
  const argv = dependencies.argv ?? process.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runGate = dependencies.runGate ?? runPhase34QualityGate;

  try {
    const report = await runGate(parsePhase34GateCliOptions(argv));
    log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    console.error(error);
    exit(1);
    throw error;
  }
}

if (import.meta.main) {
  runPhase34GateCli();
}
