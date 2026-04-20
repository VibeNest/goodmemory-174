import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase20GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase20GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase20GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase20GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase20GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-20";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase20GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase20GateCommandOptions {
  runDirectory?: string;
  runId?: string;
}

export interface Phase20GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase20GateCommand) => Promise<Phase20GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase20GateCliDependencies {
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: () => Promise<Phase20GateReport>;
}

const GENERATED_BY = "scripts/run-phase-20-gate.ts";

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase20GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-20");
}

function buildPhase20DependencyGateArgs(
  args: string[],
  dependency: string,
  options?: Phase20GateCommandOptions,
): string[] {
  if (!options?.runDirectory || !options.runId) {
    return args;
  }

  return [
    ...args,
    "--output-dir",
    join(options.runDirectory, "dependency-gates", dependency),
    "--run-id",
    `${options.runId}-${dependency}`,
  ];
}

export function buildPhase20GateCommands(
  root: string,
  options?: Phase20GateCommandOptions,
): Phase20GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "coverage-regression-suite",
      cwd: root,
      args: ["bun", "run", "test:coverage"],
    },
    {
      label: "cli-and-example-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/cli/cli.test.ts",
        "tests/examples/examples.test.ts",
        "tests/release/release.test.ts",
      ],
    },
    {
      label: "eval-smoke",
      cwd: root,
      args: ["bun", "run", "eval:smoke"],
    },
    {
      label: "phase-16-gate",
      cwd: root,
      args: buildPhase20DependencyGateArgs(
        ["bun", "run", "eval:phase-16"],
        "phase-16",
        options,
      ),
    },
    {
      label: "phase-17-gate",
      cwd: root,
      args: buildPhase20DependencyGateArgs(
        ["bun", "run", "eval:phase-17"],
        "phase-17",
        options,
      ),
    },
    {
      label: "phase-18-gate",
      cwd: root,
      args: buildPhase20DependencyGateArgs(
        ["bun", "run", "gate:phase-18"],
        "phase-18",
        options,
      ),
    },
    {
      label: "phase-19-reviewer-gate",
      cwd: root,
      args: buildPhase20DependencyGateArgs(
        ["bun", "run", "gate:phase-19-reviewer"],
        "phase-19-reviewer",
        options,
      ),
    },
    {
      label: "phase-19-maintenance-gate",
      cwd: root,
      args: buildPhase20DependencyGateArgs(
        ["bun", "run", "gate:phase-19-maintenance"],
        "phase-19-maintenance",
        options,
      ),
    },
    {
      label: "chat-example",
      cwd: root,
      args: ["bun", "run", "example:chat"],
    },
    {
      label: "coding-agent-example",
      cwd: root,
      args: ["bun", "run", "example:coding-agent"],
    },
    {
      label: "host-example-claude",
      cwd: root,
      args: ["bun", "run", "example:host-claude"],
    },
    {
      label: "host-example-codex",
      cwd: root,
      args: ["bun", "run", "example:host-codex"],
    },
  ];
}

export async function defaultRunPhase20GateCommand(
  command: Phase20GateCommand,
): Promise<Phase20GateCommandResult> {
  const startedAtMs = Date.now();
  const process = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(process.stdout).text();
  const stderrPromise = new Response(process.stderr).text();
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  const finishedAtMs = Date.now();

  return {
    durationMs: finishedAtMs - startedAtMs,
    exitCode,
    stderr,
    stdout,
  };
}

export function buildPhase20GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase20"}`;
}

export async function runPhase20QualityGate(
  input?: Phase20GateOptions,
  dependencies?: Phase20GateDependencies,
): Promise<Phase20GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const runCommand = dependencies?.runCommand ?? defaultRunPhase20GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase20GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase20GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase20GateExecutionResult[] = [];
  const commands = buildPhase20GateCommands(root, { runDirectory, runId });

  for (const command of commands) {
    const result = await runCommand(command);
    commandResults.push({
      label: command.label,
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? "passed" : "failed",
      stdoutTail: tailLines(result.stdout),
      stderrTail: tailLines(result.stderr),
    });

    if (result.exitCode !== 0) {
      break;
    }
  }

  const failedCommand = commandResults.find((result) => result.status === "failed");
  const report: Phase20GateReport = {
    phase: "phase-20",
    generatedAt,
    generatedBy: GENERATED_BY,
    runId,
    runDirectory,
    commands: commandResults,
    scope: {
      inScope: [
        "integrated typecheck and coverage regression across the canonical tests tree",
        "cli, examples, and release metadata alignment on the supported OSS path",
        "phase-16 procedural promotion and outcome-maintenance closure",
        "phase-17 retrieval rollout closure",
        "phase-18 host-adapter closure",
        "phase-19 reviewer and maintenance rollout closure",
        "current public examples across chat, coding-agent, and host-assisted paths",
      ],
      outOfScope: [
        "owner-managed live-provider credentials and manual production data checks",
        "new public config widening beyond the closed phase-19 decision",
        "new post-phase-20 product capability work",
      ],
    },
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 20 integrated release-hardening scope is regression-covered across the current v1 and post-v1 growth surfaces.",
        },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-20-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase20GateCli(
  dependencies?: Phase20GateCliDependencies,
): Promise<Phase20GateReport> {
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate = dependencies?.runGate ?? (() => runPhase20QualityGate());
  const report = await runGate();
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase20GateCli();
}
