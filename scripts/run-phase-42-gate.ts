import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase42GateOptions {
  evalReportPath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase42GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase42GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase42GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase42GateCommand) => Promise<Phase42GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase42GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase42GateOptions) => Promise<Phase42GateReport>;
}

export interface Phase42DeterministicReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase42GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase42GateCommandResult & { label: string }>;
  evidence: {
    deterministicReport: Phase42DeterministicReportEvidence;
    evalSummary: {
      passCount: number;
      totalChecks: number;
    };
    mcpWrapsProgressiveService: boolean;
    noRootApiWidening: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-42-gate.ts";
  outputDir: string;
  phase: "phase-42";
  runDirectory: string;
  runId: string;
}

interface Phase42EvalReportSnapshot {
  acceptance?: {
    decision?: unknown;
  };
  generatedBy?: unknown;
  phase?: unknown;
  summary?: {
    passCount?: unknown;
    totalChecks?: unknown;
  };
}

const GENERATED_BY = "scripts/run-phase-42-gate.ts";
const CANONICAL_PHASE42_EVAL_RUN_ID = "run-20260426093000";

export function resolvePhase42GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-42");
}

export function resolvePhase42CanonicalEvalReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-42",
    CANONICAL_PHASE42_EVAL_RUN_ID,
    "report.json",
  );
}

export function buildPhase42GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase42GateCliOptions(
  argv: readonly string[],
): Phase42GateOptions {
  return {
    evalReportPath: resolveCliFlagValue(argv, "--eval-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase42GateCommands(root: string): Phase42GateCommand[] {
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
        "tests/unit/progressive-recall.service.test.ts",
        "tests/integration/host-mcp-server.test.ts",
        "tests/unit/host-hook-runtime.test.ts",
        "tests/unit/host-writeback-config.test.ts",
        "tests/unit/host-install.test.ts",
        "tests/unit/run-phase-42-eval.test.ts",
        "tests/unit/run-phase-42-gate.test.ts",
      ],
      cwd: root,
      label: "phase-42-core-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-42",
        "--run-id",
        CANONICAL_PHASE42_EVAL_RUN_ID,
      ],
      cwd: root,
      label: "phase-42-fallback-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/cli/cli.test.ts",
        "--test-name-pattern",
        "contextMode|context mode|status text does not report invalid contextMode|status reports installed host activation",
      ],
      cwd: root,
      label: "phase-42-cli-regressions",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-42|models fallback eval evidence|package metadata exposes bin|packs a tarball",
      ],
      cwd: root,
      env: {
        PHASE42_GATE_IN_PROGRESS: "1",
      },
      label: "phase-42-release-regressions",
    },
  ];
}

export async function runPhase42QualityGate(
  options: Phase42GateOptions = {},
  dependencies: Phase42GateDependencies = {},
): Promise<Phase42GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase42GateOutputDir(root);
  const runId = options.runId ?? buildPhase42GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(buildPhase42GateCommands(root), dependencies);
  const evalReportPath =
    options.evalReportPath ?? resolvePhase42CanonicalEvalReportPath(root);
  const evalReport = parseEvalReport(await readText(evalReportPath, dependencies));
  const mcpSource = await readText(
    join(root, "src/install/hostMcpServer.ts"),
    dependencies,
  );
  const rootSource = await readText(
    join(root, "src/index.ts"),
    dependencies,
  );
  const deterministicReportEvidence = validatePhase42DeterministicReport({
    evalReport,
    root,
    reportPath: evalReportPath,
  });
  const evidence = {
    deterministicReport: deterministicReportEvidence,
    evalSummary: {
      passCount: evalReport.summary.passCount,
      totalChecks: evalReport.summary.totalChecks,
    },
    mcpWrapsProgressiveService:
      mcpSource.includes("createInstalledHostProgressiveRecallService") &&
      mcpSource.includes("goodmemory_search_index") &&
      !mcpSource.includes("encodeGoodMemoryRecordRef"),
    noRootApiWidening: !rootSource.includes("ProgressiveRecallService"),
  };
  const accepted =
    deterministicReportEvidence.status === "accepted" &&
    evalReport.summary.passCount === evalReport.summary.totalChecks &&
    evidence.mcpWrapsProgressiveService &&
    evidence.noRootApiWidening &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase42GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 42 progressive recall protocol is accepted with shared service reuse, scoped recordRefs, fallback behavior, token-budget enforcement, and no root API widening."
        : "Phase 42 gate blocked because deterministic evidence, regressions, or boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-42",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-42-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function validatePhase42DeterministicReport(input: {
  evalReport: {
    acceptance: { decision: "accepted" | "blocked" };
    summary: { passCount: number; totalChecks: number };
  };
  reportPath: string;
  root: string;
}): Phase42DeterministicReportEvidence {
  const accepted =
    input.evalReport.acceptance.decision === "accepted" &&
    input.evalReport.summary.passCount === input.evalReport.summary.totalChecks;
  const ignoredReportPath = relative(input.root, input.reportPath);

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath,
    reason: accepted
      ? "Phase 42 deterministic progressive recall protocol evidence is accepted."
      : "Phase 42 deterministic progressive recall protocol evidence is incomplete.",
    regenerateCommand: `bun run eval:phase-42 --run-id ${CANONICAL_PHASE42_EVAL_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

async function runGateCommands(
  commands: Phase42GateCommand[],
  dependencies: Phase42GateDependencies,
): Promise<Array<Phase42GateCommandResult & { label: string }>> {
  const results: Array<Phase42GateCommandResult & { label: string }> = [];
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
  dependencies: Phase42GateDependencies,
): Promise<string> {
  return await (dependencies.readTextFile ?? defaultReadText)(path);
}

async function defaultReadText(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

async function runCommand(
  command: Phase42GateCommand,
): Promise<Phase42GateCommandResult> {
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
  summary: { passCount: number; totalChecks: number };
} {
  const parsed = JSON.parse(content) as Phase42EvalReportSnapshot;
  if (
    parsed.phase !== "phase-42" ||
    parsed.generatedBy !== "scripts/run-phase-42-eval.ts" ||
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    typeof parsed.summary?.passCount !== "number" ||
    typeof parsed.summary.totalChecks !== "number"
  ) {
    throw new Error("Phase 42 eval report does not match the expected schema.");
  }

  return {
    acceptance: {
      decision: parsed.acceptance.decision,
    },
    summary: {
      passCount: parsed.summary.passCount,
      totalChecks: parsed.summary.totalChecks,
    },
  };
}

export async function runPhase42GateCli(
  dependencies: Phase42GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase42GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase42QualityGate)(options);
    dependencies.log?.(
      `Phase 42 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
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
  await runPhase42GateCli({
    log: console.log,
  });
}
