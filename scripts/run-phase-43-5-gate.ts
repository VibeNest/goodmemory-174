import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase435GateOptions {
  evalReportPath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase435GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase435GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase435GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase435GateCommand) => Promise<Phase435GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase435GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase435GateOptions) => Promise<Phase435GateReport>;
}

export interface Phase435DeterministicReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase435GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase435GateCommandResult & { label: string }>;
  evidence: {
    deterministicReport: Phase435DeterministicReportEvidence;
    evalSummary: {
      passCount: number;
      totalChecks: number;
    };
    noRootApiWidening: boolean;
    packageScriptsRegistered: boolean;
    workerCliSurface: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-43-5-gate.ts";
  outputDir: string;
  phase: "phase-43-5";
  runDirectory: string;
  runId: string;
}

interface Phase435EvalReportSnapshot {
  acceptance?: {
    decision?: unknown;
  };
  cases?: Record<string, unknown>;
  generatedBy?: unknown;
  mode?: unknown;
  phase?: unknown;
  runId?: unknown;
  summary?: {
    passCount?: unknown;
    totalChecks?: unknown;
  };
}

const GENERATED_BY = "scripts/run-phase-43-5-gate.ts";
const CANONICAL_PHASE435_EVAL_RUN_ID = "run-20260426133000";
const PHASE435_REQUIRED_EVAL_CASES = [
  "cliSurfacePass",
  "coalescingPass",
  "daemonOptionalPass",
  "drainOnceIdempotencyPass",
  "envelopeRedactionPass",
  "noRootApiWideningPass",
  "recoverDryRunPass",
  "workerFailureIsolationPass",
] as const;

export function resolvePhase435GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-43-5");
}

export function resolvePhase435CanonicalEvalReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-43-5",
    CANONICAL_PHASE435_EVAL_RUN_ID,
    "report.json",
  );
}

export function buildPhase435GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase435GateCliOptions(
  argv: readonly string[],
): Phase435GateOptions {
  return {
    evalReportPath: resolveCliFlagValue(argv, "--eval-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase435GateCommands(root: string): Phase435GateCommand[] {
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
        "tests/unit/runtime-worker.test.ts",
        "tests/cli/runtime-worker-cli.test.ts",
        "tests/unit/run-phase-43-5-eval.test.ts",
        "tests/unit/run-phase-43-5-gate.test.ts",
        "--test-name-pattern",
        "runtime worker|run-phase-43-5",
      ],
      cwd: root,
      label: "phase-43-5-core-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-43-5",
        "--run-id",
        CANONICAL_PHASE435_EVAL_RUN_ID,
      ],
      cwd: root,
      label: "phase-43-5-fallback-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-43.5|phase-43-5|models fallback eval evidence|package metadata exposes bin|current status doc points|task-board current note|packs a tarball",
      ],
      cwd: root,
      env: {
        PHASE435_GATE_IN_PROGRESS: "1",
      },
      label: "phase-43-5-release-regressions",
    },
  ];
}

export async function runPhase435QualityGate(
  options: Phase435GateOptions = {},
  dependencies: Phase435GateDependencies = {},
): Promise<Phase435GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase435GateOutputDir(root);
  const runId = options.runId ?? buildPhase435GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(buildPhase435GateCommands(root), dependencies);
  const evalReportPath =
    options.evalReportPath ?? resolvePhase435CanonicalEvalReportPath(root);
  const evalReport = parseEvalReport(await readText(evalReportPath, dependencies));
  const cliSource = await readText(join(root, "src/cli.ts"), dependencies);
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    exports?: Record<string, unknown>;
    scripts?: Record<string, unknown>;
  };
  const deterministicReportEvidence = validatePhase435DeterministicReport({
    evalReport,
    reportPath: evalReportPath,
    root,
  });
  const evidence = {
    deterministicReport: deterministicReportEvidence,
    evalSummary: {
      passCount: evalReport.summary.passCount,
      totalChecks: evalReport.summary.totalChecks,
    },
    noRootApiWidening:
      !rootSource.includes("runtime-worker") &&
      !rootSource.includes("createRuntimeWorkerQueue"),
    packageScriptsRegistered:
      packageJson.scripts?.["eval:phase-43-5"] ===
        "bun run scripts/run-phase-43-5-eval.ts" &&
      packageJson.scripts?.["gate:phase-43-5"] ===
        "bun run scripts/run-phase-43-5-gate.ts" &&
      packageJson.exports?.["./runtime-worker"] === undefined,
    workerCliSurface:
      cliSource.includes("goodmemory runtime worker drain-once") &&
      cliSource.includes("handleRuntimeWorker") &&
      cliSource.includes("createRuntimeWorkerQueue"),
  };
  const accepted =
    deterministicReportEvidence.status === "accepted" &&
    evalReport.summary.passCount === evalReport.summary.totalChecks &&
    evidence.noRootApiWidening &&
    evidence.packageScriptsRegistered &&
    evidence.workerCliSurface &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase435GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 43.5 optional runtime worker is accepted with bounded envelopes, drain/status/recover, optional daemon markers, redaction, failure isolation, and package hygiene."
        : "Phase 43.5 gate blocked because deterministic evidence, regressions, or boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-43-5",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-43-5-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function validatePhase435DeterministicReport(input: {
  evalReport: {
    acceptance: { decision: "accepted" | "blocked" };
    cases: Record<(typeof PHASE435_REQUIRED_EVAL_CASES)[number], true>;
    mode: "fallback";
    runId: typeof CANONICAL_PHASE435_EVAL_RUN_ID;
    summary: { passCount: number; totalChecks: number };
  };
  reportPath: string;
  root: string;
}): Phase435DeterministicReportEvidence {
  const accepted =
    input.evalReport.acceptance.decision === "accepted" &&
    input.evalReport.mode === "fallback" &&
    input.evalReport.runId === CANONICAL_PHASE435_EVAL_RUN_ID &&
    PHASE435_REQUIRED_EVAL_CASES.every((caseName) => (
      input.evalReport.cases[caseName] === true
    )) &&
    input.evalReport.summary.passCount === input.evalReport.summary.totalChecks;
  const ignoredReportPath = relative(input.root, input.reportPath);

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath,
    reason: accepted
      ? "Phase 43.5 deterministic optional-worker evidence is accepted."
      : "Phase 43.5 deterministic optional-worker evidence is incomplete.",
    regenerateCommand: `bun run eval:phase-43-5 --run-id ${CANONICAL_PHASE435_EVAL_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

async function runGateCommands(
  commands: Phase435GateCommand[],
  dependencies: Phase435GateDependencies,
): Promise<Array<Phase435GateCommandResult & { label: string }>> {
  const results: Array<Phase435GateCommandResult & { label: string }> = [];
  for (const command of commands) {
    const result = await (dependencies.runCommand ?? runCommand)(command);
    results.push({
      ...result,
      label: command.label,
    });
    if (result.exitCode !== 0) {
      break;
    }
  }
  return results;
}

async function readText(
  path: string,
  dependencies: Phase435GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runCommand(
  command: Phase435GateCommand,
): Promise<Phase435GateCommandResult> {
  const startedAt = Date.now();
  const childProcess = Bun.spawn(command.args, {
    cwd: command.cwd,
    env: command.env
      ? {
          ...process.env,
          ...command.env,
        }
      : process.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text(),
    childProcess.exited,
  ]);
  return {
    durationMs: Date.now() - startedAt,
    exitCode,
    stderr,
    stdout,
  };
}

function parseEvalReport(content: string): {
  acceptance: { decision: "accepted" | "blocked" };
  cases: Record<(typeof PHASE435_REQUIRED_EVAL_CASES)[number], true>;
  mode: "fallback";
  runId: typeof CANONICAL_PHASE435_EVAL_RUN_ID;
  summary: { passCount: number; totalChecks: number };
} {
  const parsed = JSON.parse(content) as Phase435EvalReportSnapshot;
  const cases = parsed.cases;
  if (
    parsed.phase !== "phase-43-5" ||
    parsed.generatedBy !== "scripts/run-phase-43-5-eval.ts" ||
    parsed.mode !== "fallback" ||
    parsed.runId !== CANONICAL_PHASE435_EVAL_RUN_ID ||
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    typeof parsed.summary?.passCount !== "number" ||
    typeof parsed.summary.totalChecks !== "number" ||
    !cases ||
    PHASE435_REQUIRED_EVAL_CASES.some((caseName) => cases[caseName] !== true)
  ) {
    throw new Error("Phase 43.5 eval report does not match the expected schema.");
  }

  return {
    acceptance: {
      decision: parsed.acceptance.decision,
    },
    cases: PHASE435_REQUIRED_EVAL_CASES.reduce(
      (result, caseName) => ({
        ...result,
        [caseName]: true,
      }),
      {} as Record<(typeof PHASE435_REQUIRED_EVAL_CASES)[number], true>,
    ),
    mode: parsed.mode,
    runId: parsed.runId,
    summary: {
      passCount: parsed.summary.passCount,
      totalChecks: parsed.summary.totalChecks,
    },
  };
}

export async function runPhase435GateCli(
  dependencies: Phase435GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase435GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase435QualityGate)(options);
    dependencies.log?.(
      `Phase 43.5 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(error instanceof Error ? error.message : String(error));
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase435GateCli({
    log: console.log,
  });
}
