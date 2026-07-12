import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase44GateOptions {
  evalReportPath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase44GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase44GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase44GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase44GateCommand) => Promise<Phase44GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase44GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase44GateOptions) => Promise<Phase44GateReport>;
}

export interface Phase44DeterministicReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase44GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase44GateCommandResult & { label: string }>;
  evidence: {
    deterministicReport: Phase44DeterministicReportEvidence;
    evalSummary: {
      passCount: number;
      totalChecks: number;
    };
    noRootApiWidening: boolean;
    packageScriptsRegistered: boolean;
    readOnlySecurityContracts: boolean;
    viewerCliSurface: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-44-gate.ts";
  outputDir: string;
  phase: "phase-44";
  runDirectory: string;
  runId: string;
}

interface Phase44EvalReportSnapshot {
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

const GENERATED_BY = "scripts/run-phase-44-gate.ts";
const CANONICAL_PHASE44_EVAL_RUN_ID = "run-20260426153000";
const PHASE44_REQUIRED_EVAL_CASES = [
  "auditTraceSessionViewsPass",
  "handoffReadOnlyPass",
  "localBindPass",
  "noCorsPass",
  "noMutationRoutesPass",
  "noRawTranscriptPass",
  "noRootApiWideningPass",
  "packageLicenseHygienePass",
  "progressiveDrilldownPass",
  "staticShellPass",
  "tokenSecurityPass",
] as const;

export function resolvePhase44GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-44");
}

export function resolvePhase44CanonicalEvalReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-44",
    CANONICAL_PHASE44_EVAL_RUN_ID,
    "report.json",
  );
}

export function buildPhase44GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase44GateCliOptions(
  argv: readonly string[],
): Phase44GateOptions {
  return {
    evalReportPath: resolveCliFlagValue(argv, "--eval-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase44GateCommands(root: string): Phase44GateCommand[] {
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
        "tests/unit/runtime-viewer.test.ts",
        "tests/cli/runtime-viewer-cli.test.ts",
        "tests/unit/run-phase-44-eval.test.ts",
        "tests/unit/run-phase-44-gate.test.ts",
        "--test-name-pattern",
        "runtime viewer|run-phase-44",
      ],
      cwd: root,
      label: "phase-44-viewer-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-44",
        "--run-id",
        CANONICAL_PHASE44_EVAL_RUN_ID,
      ],
      cwd: root,
      label: "phase-44-fallback-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-44|models fallback eval evidence|package metadata exposes bin|current status doc points|task-board current note|packs a tarball|root exports stay aligned",
      ],
      cwd: root,
      env: {
        PHASE44_GATE_IN_PROGRESS: "1",
      },
      label: "phase-44-release-regressions",
    },
  ];
}

export async function runPhase44QualityGate(
  options: Phase44GateOptions = {},
  dependencies: Phase44GateDependencies = {},
): Promise<Phase44GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase44GateOutputDir(root);
  const runId = options.runId ?? buildPhase44GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(buildPhase44GateCommands(root), dependencies);
  const evalReportPath =
    options.evalReportPath ?? resolvePhase44CanonicalEvalReportPath(root);
  const evalReport = parseEvalReport(await readText(evalReportPath, dependencies));
  const cliSource = await readText(join(root, "src/cli.ts"), dependencies);
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const viewerSource = await readText(join(root, "src/runtime-viewer/public.ts"), dependencies);
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    exports?: Record<string, unknown>;
    files?: string[];
    scripts?: Record<string, unknown>;
  };
  const deterministicReportEvidence = validatePhase44DeterministicReport({
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
      !rootSource.includes("runtime-viewer") &&
      !rootSource.includes("createRuntimeViewerApp") &&
      !rootSource.includes("serveRuntimeViewer"),
    packageScriptsRegistered:
      packageJson.scripts?.["eval:phase-44"] ===
        "bun run scripts/run-phase-44-eval.ts" &&
      packageJson.scripts?.["gate:phase-44"] ===
        "bun run scripts/run-phase-44-gate.ts" &&
      packageJson.exports?.["./runtime-viewer"] === undefined &&
      !(packageJson.files ?? []).includes("third-party/claude-mem-main"),
    readOnlySecurityContracts:
      viewerSource.includes("normalizeRuntimeViewerBindHost") &&
      viewerSource.includes("createInspectorApp") &&
      viewerSource.includes("serveInspector") &&
      viewerSource.includes("readOnly: true") &&
      viewerSource.includes("access-control-allow-origin") === false &&
      viewerSource.includes('"/api/') === false &&
      viewerSource.includes("`/api/") === false,
    viewerCliSurface:
      cliSource.includes("goodmemory runtime viewer --host <codex|claude>") &&
      cliSource.includes("serveRuntimeViewer") &&
      cliSource.includes("RUNTIME_VIEWER_HELP_TEXT"),
  };
  const accepted =
    deterministicReportEvidence.status === "accepted" &&
    evalReport.summary.passCount === evalReport.summary.totalChecks &&
    evidence.noRootApiWidening &&
    evidence.packageScriptsRegistered &&
    evidence.readOnlySecurityContracts &&
    evidence.viewerCliSurface &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase44GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 44 compatibility is accepted through the token-gated, loopback-only, scope-bound read-only Inspector adapter with no duplicate viewer HTTP implementation."
        : "Phase 44 gate blocked because deterministic evidence, regressions, or viewer boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-44",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-44-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function validatePhase44DeterministicReport(input: {
  evalReport: {
    acceptance: { decision: "accepted" | "blocked" };
    cases: Record<(typeof PHASE44_REQUIRED_EVAL_CASES)[number], true>;
    mode: "fallback";
    runId: typeof CANONICAL_PHASE44_EVAL_RUN_ID;
    summary: { passCount: number; totalChecks: number };
  };
  reportPath: string;
  root: string;
}): Phase44DeterministicReportEvidence {
  const accepted =
    input.evalReport.acceptance.decision === "accepted" &&
    input.evalReport.mode === "fallback" &&
    input.evalReport.runId === CANONICAL_PHASE44_EVAL_RUN_ID &&
    PHASE44_REQUIRED_EVAL_CASES.every((caseName) => (
      input.evalReport.cases[caseName] === true
    )) &&
    input.evalReport.summary.passCount === input.evalReport.summary.totalChecks;
  const ignoredReportPath = relative(input.root, input.reportPath);

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath,
    reason: accepted
      ? "Phase 44 deterministic local-viewer evidence is accepted."
      : "Phase 44 deterministic local-viewer evidence is incomplete.",
    regenerateCommand: `bun run eval:phase-44 --run-id ${CANONICAL_PHASE44_EVAL_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

async function runGateCommands(
  commands: Phase44GateCommand[],
  dependencies: Phase44GateDependencies,
): Promise<Array<Phase44GateCommandResult & { label: string }>> {
  const results: Array<Phase44GateCommandResult & { label: string }> = [];
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
  dependencies: Phase44GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runCommand(
  command: Phase44GateCommand,
): Promise<Phase44GateCommandResult> {
  const started = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: {
      ...process.env,
      ...(command.env ?? {}),
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    durationMs: Date.now() - started,
    exitCode,
    stderr,
    stdout,
  };
}

function parseEvalReport(raw: string): {
  acceptance: { decision: "accepted" | "blocked" };
  cases: Record<(typeof PHASE44_REQUIRED_EVAL_CASES)[number], true>;
  mode: "fallback";
  runId: typeof CANONICAL_PHASE44_EVAL_RUN_ID;
  summary: { passCount: number; totalChecks: number };
} {
  const parsed = JSON.parse(raw) as Phase44EvalReportSnapshot;
  if (
    parsed.acceptance?.decision !== "accepted" &&
    parsed.acceptance?.decision !== "blocked"
  ) {
    throw new Error("Phase 44 eval report does not match the expected schema.");
  }
  if (
    parsed.generatedBy !== "scripts/run-phase-44-eval.ts" ||
    parsed.mode !== "fallback" ||
    parsed.phase !== "phase-44" ||
    parsed.runId !== CANONICAL_PHASE44_EVAL_RUN_ID ||
    typeof parsed.summary?.passCount !== "number" ||
    typeof parsed.summary.totalChecks !== "number" ||
    !parsed.cases ||
    !PHASE44_REQUIRED_EVAL_CASES.every((caseName) => parsed.cases?.[caseName] === true)
  ) {
    throw new Error("Phase 44 eval report does not match the expected schema.");
  }

  return {
    acceptance: { decision: parsed.acceptance.decision },
    cases: parsed.cases as Record<(typeof PHASE44_REQUIRED_EVAL_CASES)[number], true>,
    mode: "fallback",
    runId: CANONICAL_PHASE44_EVAL_RUN_ID,
    summary: {
      passCount: parsed.summary.passCount,
      totalChecks: parsed.summary.totalChecks,
    },
  };
}

export async function runPhase44GateCli(
  dependencies: Phase44GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase44GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase44QualityGate)(options);
    dependencies.log?.(
      `Phase 44 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
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
  await runPhase44GateCli({
    log: console.log,
  });
}
