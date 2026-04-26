import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase43GateOptions {
  evalReportPath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase43GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase43GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase43GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase43GateCommand) => Promise<Phase43GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase43GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase43GateOptions) => Promise<Phase43GateReport>;
}

export interface Phase43DeterministicReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase43GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase43GateCommandResult & { label: string }>;
  evidence: {
    aiSdkUsesRuntimeKit: boolean;
    deterministicReport: Phase43DeterministicReportEvidence;
    evalSummary: {
      passCount: number;
      totalChecks: number;
    };
    noRootApiWidening: boolean;
    runtimeKitSubpathExported: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-43-gate.ts";
  outputDir: string;
  phase: "phase-43";
  runDirectory: string;
  runId: string;
}

interface Phase43EvalReportSnapshot {
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

const GENERATED_BY = "scripts/run-phase-43-gate.ts";
const CANONICAL_PHASE43_EVAL_RUN_ID = "run-20260426113000";
const PHASE43_REQUIRED_EVAL_CASES = [
  "aiSdkRuntimeKitReuseBoundary",
  "eventScopeDigestOnly",
  "fragmentLifecyclePass",
  "observeNoDurableWrite",
  "preActionExecutionPlanPass",
  "progressiveLifecyclePass",
  "selectiveWritebackGovernancePass",
  "sessionLifecycleNoTranscriptArchive",
] as const;

export function resolvePhase43GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-43");
}

export function resolvePhase43CanonicalEvalReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-43",
    CANONICAL_PHASE43_EVAL_RUN_ID,
    "report.json",
  );
}

export function buildPhase43GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase43GateCliOptions(
  argv: readonly string[],
): Phase43GateOptions {
  return {
    evalReportPath: resolveCliFlagValue(argv, "--eval-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase43GateCommands(root: string): Phase43GateCommand[] {
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
        "tests/unit/runtime-kit.test.ts",
        "tests/unit/ai-sdk.public.test.ts",
        "tests/unit/architecture.boundaries.test.ts",
        "tests/unit/run-phase-43-eval.test.ts",
        "tests/unit/run-phase-43-gate.test.ts",
        "--test-name-pattern",
        "runtime-kit|ai-sdk adapter|AI SDK adapter|run-phase-43",
      ],
      cwd: root,
      label: "phase-43-core-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-43",
        "--run-id",
        CANONICAL_PHASE43_EVAL_RUN_ID,
      ],
      cwd: root,
      label: "phase-43-fallback-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/examples/examples.test.ts",
        "--test-name-pattern",
        "vercel ai example|plain ai sdk server",
      ],
      cwd: root,
      label: "phase-43-example-regressions",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-43|models fallback eval evidence|package metadata exposes bin|root exports stay aligned|current status doc points|task-board current note|packs a tarball",
      ],
      cwd: root,
      env: {
        PHASE43_GATE_IN_PROGRESS: "1",
      },
      label: "phase-43-release-regressions",
    },
  ];
}

export async function runPhase43QualityGate(
  options: Phase43GateOptions = {},
  dependencies: Phase43GateDependencies = {},
): Promise<Phase43GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase43GateOutputDir(root);
  const runId = options.runId ?? buildPhase43GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(buildPhase43GateCommands(root), dependencies);
  const evalReportPath =
    options.evalReportPath ?? resolvePhase43CanonicalEvalReportPath(root);
  const evalReport = parseEvalReport(await readText(evalReportPath, dependencies));
  const aiSdkSource = await readText(join(root, "src/ai-sdk/public.ts"), dependencies);
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    exports?: Record<string, unknown>;
  };
  const deterministicReportEvidence = validatePhase43DeterministicReport({
    evalReport,
    reportPath: evalReportPath,
    root,
  });
  const evidence = {
    aiSdkUsesRuntimeKit:
      aiSdkSource.includes("createGoodMemoryRuntimeKit") &&
      aiSdkSource.includes("beforeModelCall") &&
      aiSdkSource.includes("afterModelCall") &&
      !aiSdkSource.includes("config.memory.recall") &&
      !aiSdkSource.includes("config.memory.buildContext") &&
      !aiSdkSource.includes("config.memory.remember") &&
      !aiSdkSource.includes("input.memory.recall") &&
      !aiSdkSource.includes("input.memory.buildContext") &&
      !aiSdkSource.includes("input.memory.remember"),
    deterministicReport: deterministicReportEvidence,
    evalSummary: {
      passCount: evalReport.summary.passCount,
      totalChecks: evalReport.summary.totalChecks,
    },
    noRootApiWidening: !rootSource.includes("createGoodMemoryRuntimeKit"),
    runtimeKitSubpathExported: Boolean(packageJson.exports?.["./runtime-kit"]),
  };
  const accepted =
    deterministicReportEvidence.status === "accepted" &&
    evalReport.summary.passCount === evalReport.summary.totalChecks &&
    evidence.aiSdkUsesRuntimeKit &&
    evidence.noRootApiWidening &&
    evidence.runtimeKitSubpathExported &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase43GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 43 runtime-kit is accepted with package export coverage, lifecycle orchestration, preAction plan reuse, afterModelCall governance, AI SDK reuse, and redaction-safe runtime events."
        : "Phase 43 gate blocked because deterministic evidence, regressions, or boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-43",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-43-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function validatePhase43DeterministicReport(input: {
  evalReport: {
    acceptance: { decision: "accepted" | "blocked" };
    cases: Record<(typeof PHASE43_REQUIRED_EVAL_CASES)[number], true>;
    mode: "fallback";
    runId: typeof CANONICAL_PHASE43_EVAL_RUN_ID;
    summary: { passCount: number; totalChecks: number };
  };
  reportPath: string;
  root: string;
}): Phase43DeterministicReportEvidence {
  const accepted =
    input.evalReport.acceptance.decision === "accepted" &&
    input.evalReport.mode === "fallback" &&
    input.evalReport.runId === CANONICAL_PHASE43_EVAL_RUN_ID &&
    PHASE43_REQUIRED_EVAL_CASES.every((caseName) => (
      input.evalReport.cases[caseName] === true
    )) &&
    input.evalReport.summary.passCount === input.evalReport.summary.totalChecks;
  const ignoredReportPath = relative(input.root, input.reportPath);

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath,
    reason: accepted
      ? "Phase 43 deterministic runtime-kit evidence is accepted."
      : "Phase 43 deterministic runtime-kit evidence is incomplete.",
    regenerateCommand: `bun run eval:phase-43 --run-id ${CANONICAL_PHASE43_EVAL_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

async function runGateCommands(
  commands: Phase43GateCommand[],
  dependencies: Phase43GateDependencies,
): Promise<Array<Phase43GateCommandResult & { label: string }>> {
  const results: Array<Phase43GateCommandResult & { label: string }> = [];
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
  dependencies: Phase43GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runCommand(
  command: Phase43GateCommand,
): Promise<Phase43GateCommandResult> {
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
  cases: Record<(typeof PHASE43_REQUIRED_EVAL_CASES)[number], true>;
  mode: "fallback";
  runId: typeof CANONICAL_PHASE43_EVAL_RUN_ID;
  summary: { passCount: number; totalChecks: number };
} {
  const parsed = JSON.parse(content) as Phase43EvalReportSnapshot;
  const cases = parsed.cases;
  if (
    parsed.phase !== "phase-43" ||
    parsed.generatedBy !== "scripts/run-phase-43-eval.ts" ||
    parsed.mode !== "fallback" ||
    parsed.runId !== CANONICAL_PHASE43_EVAL_RUN_ID ||
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    typeof parsed.summary?.passCount !== "number" ||
    typeof parsed.summary.totalChecks !== "number" ||
    !cases ||
    PHASE43_REQUIRED_EVAL_CASES.some((caseName) => cases[caseName] !== true)
  ) {
    throw new Error("Phase 43 eval report does not match the expected schema.");
  }

  return {
    acceptance: {
      decision: parsed.acceptance.decision,
    },
    cases: PHASE43_REQUIRED_EVAL_CASES.reduce(
      (result, caseName) => ({
        ...result,
        [caseName]: true,
      }),
      {} as Record<(typeof PHASE43_REQUIRED_EVAL_CASES)[number], true>,
    ),
    mode: parsed.mode,
    runId: parsed.runId,
    summary: {
      passCount: parsed.summary.passCount,
      totalChecks: parsed.summary.totalChecks,
    },
  };
}

export async function runPhase43GateCli(
  dependencies: Phase43GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase43GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase43QualityGate)(options);
    dependencies.log?.(
      `Phase 43 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(
      error instanceof Error ? error.message : String(error),
    );
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase43GateCli({
    log: console.log,
  });
}
