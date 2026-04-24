import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase35GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase35GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase35GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase35DeterministicReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase35LiveMemoryEvidence {
  liveReportPath: string;
  reason: string;
  runtimePath: "installed_package_user_level_hooks_and_mcp";
  status: "accepted" | "blocked";
}

export interface Phase35GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase35GateExecutionResult[];
  evidence: {
    deterministicReport: Phase35DeterministicReportEvidence;
    liveMemory: Phase35LiveMemoryEvidence;
  };
  generatedAt: string;
  generatedBy: string;
  phase: "phase-35";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase35GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase35GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase35GateCommand) => Promise<Phase35GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase35GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase35GateOptions) => Promise<Phase35GateReport>;
}

interface ValidatedPhase35DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  generatedBy: "scripts/run-phase-35-eval.ts";
  mode: "fallback";
  phase: "phase-35";
  runId: string;
  summary: {
    middlewareNonRegressionPassCount: number;
    middlewareWinOverNoMemoryCount: number;
    totalCases: number;
  };
}

interface ValidatedPhase35LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  evidence: {
    hooks: {
      installRegistersHooks: boolean;
      sessionStart: {
        matchedExpectedFieldCount: number;
        registeredCommandMatchesManagedConfig: boolean;
      };
      userPromptSubmit: {
        matchedExpectedFieldCount: number;
        registeredCommandMatchesManagedConfig: boolean;
      };
    };
    mcp: {
      contextIncludesBlocker: boolean;
      contextIncludesSummaryRule: boolean;
      installRegistersMcp: boolean;
      registeredCommandMatchesManagedConfig: boolean;
    };
    releaseContract: {
      distribution: "tarball-first";
      runtime: "bun-only";
    };
    repoOptIn: {
      enabled: boolean;
      workspaceId?: string;
    };
  };
  evidenceContract: {
    phase35: {
      packageBoundary: "installed_package_public_imports";
      runner: string;
      runtimePath: "installed_package_user_level_hooks_and_mcp";
    };
  };
  generatedBy: string;
  mode: "live-memory";
  outputDir: string;
  phase: "phase-35";
  runDirectory: string;
  runId: string;
}

const GENERATED_BY = "scripts/run-phase-35-gate.ts";
const PHASE35_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260423173045";
const PHASE35_CANONICAL_LIVE_RUN_ID = "run-phase35-live-current";
const PHASE35_IN_SCOPE = [
  "phase-35 deterministic installed-hook middleware evaluation against the frozen Phase 32 text-only path and the no-memory baseline",
  "tarball-first installed-package Codex middleware validation for install, repo opt-in, hook injection, and read-only MCP availability",
  "phase-35 quality-gate generation and fail-closed closure validation",
] as const;
const PHASE35_OUT_OF_SCOPE = [
  "widening the root API or exposing public goodmemory/evolution",
  "automatic writeback, transcript persistence, or stop-hook behavior",
  "making Claude a second live gate blocker",
  "claiming the frozen Phase 32 text-only path remains the canonical product line after Phase 35",
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
  command: Phase35GateCommand,
  result: Phase35GateCommandResult,
): Phase35GateExecutionResult {
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
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

async function defaultRunPhase35GateCommand(
  command: Phase35GateCommand,
): Promise<Phase35GateCommandResult> {
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

export function resolvePhase35GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-35");
}

export function resolvePhase35CanonicalDeterministicReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-35",
    PHASE35_CANONICAL_DETERMINISTIC_RUN_ID,
    "report.json",
  );
}

export function resolvePhase35CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-35",
    PHASE35_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

function buildPhase35DeterministicRegenerateCommand(): string {
  return `bun run eval:phase-35 --run-id ${PHASE35_CANONICAL_DETERMINISTIC_RUN_ID}`;
}

export function buildPhase35GateRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase35gate"}`;
}

export function parsePhase35GateCliOptions(
  argv: readonly string[],
): Phase35GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function buildPhase35GateCommands(root: string): Phase35GateCommand[] {
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
        "tests/integration/host-mcp-server.test.ts",
        "tests/unit/run-phase-35.script.test.ts",
        "tests/unit/run-phase-35.live-memory.test.ts",
        "tests/unit/run-phase-35.gate.test.ts",
        "tests/cli/cli.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "targeted-regressions",
    },
  ];
}

function validatePhase35DeterministicReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase35DeterministicReport {
  const parsed = JSON.parse(content) as ValidatedPhase35DeterministicReport;

  if (parsed.phase !== "phase-35" || parsed.mode !== "fallback") {
    throw new Error("Phase 35 deterministic report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-35-eval.ts") {
    throw new Error("Phase 35 deterministic report was not generated by the canonical runner.");
  }
  if (!pathsMatch(root, reportPath, resolvePhase35CanonicalDeterministicReportPath(root))) {
    throw new Error("Phase 35 deterministic report path is not canonical.");
  }

  return parsed;
}

function validatePhase35LiveReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase35LiveReport {
  const parsed = JSON.parse(content) as ValidatedPhase35LiveReport;

  if (parsed.phase !== "phase-35" || parsed.mode !== "live-memory") {
    throw new Error("Phase 35 live report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-35-live-memory.ts") {
    throw new Error("Phase 35 live report was not generated by the canonical runner.");
  }
  if (!pathsMatch(root, reportPath, resolvePhase35CanonicalLiveReportPath(root))) {
    throw new Error("Phase 35 live report path is not canonical.");
  }

  return parsed;
}

export async function runPhase35QualityGate(
  options: Phase35GateOptions = {},
  dependencies: Phase35GateDependencies = {},
): Promise<Phase35GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase35GateOutputDir(root);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const runId = options.runId ?? buildPhase35GateRunId(timestamp);
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand =
    dependencies.runCommand ?? defaultRunPhase35GateCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;

  const commands: Phase35GateExecutionResult[] = [];
  for (const command of buildPhase35GateCommands(root)) {
    const result = await runCommand(command);
    commands.push(toExecutionResult(command, result));
    if (result.exitCode !== 0) {
      const blockedReport: Phase35GateReport = {
        acceptance: {
          decision: "blocked",
          reason: `Targeted regression command failed: ${command.label}.`,
        },
        commands,
        evidence: {
          deterministicReport: {
            artifactKind: "ignored_generated",
            ignoredReportPath: toRepoRelativePath(root, resolvePhase35CanonicalDeterministicReportPath(root)),
            reason: "Targeted regressions failed before deterministic evidence could be validated.",
            regenerateCommand: buildPhase35DeterministicRegenerateCommand(),
            status: "blocked",
          },
          liveMemory: {
            liveReportPath: toRepoRelativePath(
              root,
              options.liveReportPath
                ? resolveMaybeRelativePath(root, options.liveReportPath)
                : resolvePhase35CanonicalLiveReportPath(root),
            ),
            reason: "Targeted regressions failed before live middleware evidence could be validated.",
            runtimePath: "installed_package_user_level_hooks_and_mcp",
            status: "blocked",
          },
        },
        generatedAt: timestamp,
        generatedBy: GENERATED_BY,
        phase: "phase-35",
        runDirectory,
        runId,
        scope: {
          inScope: [...PHASE35_IN_SCOPE],
          outOfScope: [...PHASE35_OUT_OF_SCOPE],
        },
      };
      await ensureDir(runDirectory, { recursive: true });
      await writeTextFile(
        join(runDirectory, "phase-35-quality-gate.json"),
        JSON.stringify(blockedReport, null, 2) + "\n",
      );
      return blockedReport;
    }
  }

  const deterministicReportPath = resolvePhase35CanonicalDeterministicReportPath(root);
  const liveReportPath = options.liveReportPath
    ? resolveMaybeRelativePath(root, options.liveReportPath)
    : resolvePhase35CanonicalLiveReportPath(root);
  const deterministic = validatePhase35DeterministicReport(
    root,
    deterministicReportPath,
    await readTextFile(deterministicReportPath),
  );
  const live = validatePhase35LiveReport(
    root,
    liveReportPath,
    await readTextFile(liveReportPath),
  );

  const deterministicAccepted =
    deterministic.acceptance.decision === "accepted" &&
    deterministic.summary.middlewareNonRegressionPassCount ===
      deterministic.summary.totalCases &&
    deterministic.summary.middlewareWinOverNoMemoryCount ===
      deterministic.summary.totalCases;
  const liveAccepted =
    live.acceptance.decision === "accepted" &&
    live.evidence.repoOptIn.enabled &&
    live.evidence.repoOptIn.workspaceId === "consumer-workspace" &&
    live.evidence.hooks.installRegistersHooks &&
    live.evidence.hooks.sessionStart.registeredCommandMatchesManagedConfig &&
    live.evidence.hooks.sessionStart.matchedExpectedFieldCount === 2 &&
    live.evidence.hooks.userPromptSubmit.registeredCommandMatchesManagedConfig &&
    live.evidence.hooks.userPromptSubmit.matchedExpectedFieldCount === 2 &&
    live.evidence.mcp.installRegistersMcp &&
    live.evidence.mcp.registeredCommandMatchesManagedConfig &&
    live.evidence.mcp.contextIncludesSummaryRule &&
    live.evidence.mcp.contextIncludesBlocker &&
    live.evidence.releaseContract.distribution === "tarball-first" &&
    live.evidence.releaseContract.runtime === "bun-only" &&
    live.evidenceContract.phase35.packageBoundary ===
      "installed_package_public_imports" &&
    live.evidenceContract.phase35.runtimePath ===
      "installed_package_user_level_hooks_and_mcp";
  const accepted = deterministicAccepted && liveAccepted;

  const report: Phase35GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 35 deterministic and installed-package live middleware evidence both passed."
        : "Phase 35 deterministic or installed-package live middleware evidence did not satisfy the canonical gate.",
    },
    commands,
    evidence: {
      deterministicReport: {
        artifactKind: "ignored_generated",
        ignoredReportPath: toRepoRelativePath(root, deterministicReportPath),
        reason: deterministicAccepted
          ? "Deterministic installed-hook middleware report stayed non-regressive against the frozen Phase 32 text-only path and beat the no-memory baseline."
          : "Deterministic installed-hook middleware report failed the dual-baseline acceptance rule.",
        regenerateCommand: buildPhase35DeterministicRegenerateCommand(),
        status: deterministicAccepted ? "accepted" : "blocked",
      },
      liveMemory: {
        liveReportPath: toRepoRelativePath(root, liveReportPath),
        reason: liveAccepted
          ? "Installed-package Codex middleware report proved global install, repo opt-in, hook injection, and MCP deep-read availability."
          : "Installed-package Codex middleware report did not prove install, repo opt-in, hook injection, and MCP availability together.",
        runtimePath: "installed_package_user_level_hooks_and_mcp",
        status: liveAccepted ? "accepted" : "blocked",
      },
    },
    generatedAt: timestamp,
    generatedBy: GENERATED_BY,
    phase: "phase-35",
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE35_IN_SCOPE],
      outOfScope: [...PHASE35_OUT_OF_SCOPE],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-35-quality-gate.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

if (import.meta.main) {
  const report = await runPhase35QualityGate(
    parsePhase35GateCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
