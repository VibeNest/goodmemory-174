import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Phase19ReviewerGateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase19ReviewerGateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase19ReviewerGateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase19ReviewerGateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase19ReviewerGateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-19-reviewer";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase19ReviewerGateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase19ReviewerGateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (
    command: Phase19ReviewerGateCommand,
  ) => Promise<Phase19ReviewerGateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-19-reviewer-gate.ts";

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase19ReviewerGateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-19-reviewer");
}

export function buildPhase19ReviewerGateCommands(
  root: string,
): Phase19ReviewerGateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "reviewer-rollout-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/eval/runners.test.ts",
        "tests/eval/suite.test.ts",
        "tests/eval/reporting.test.ts",
        "tests/unit/evolution.reviewer.test.ts",
        "tests/integration/evolution.reviewer.test.ts",
        "tests/integration/maintenance.api.test.ts",
      ],
    },
    {
      label: "retrieval-rollout-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/eval.strategy-rollout.test.ts",
        "tests/unit/eval.strategy-promotion-gate.test.ts",
      ],
    },
    {
      label: "host-adapter-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/markdown-artifacts.test.ts",
        "tests/unit/host.adapter.test.ts",
        "tests/unit/host.writeback.test.ts",
        "tests/examples/examples.test.ts",
        "tests/release/release.test.ts",
      ],
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

async function defaultRunCommand(
  command: Phase19ReviewerGateCommand,
): Promise<Phase19ReviewerGateCommandResult> {
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

function buildRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase19reviewer"}`;
}

export async function runPhase19ReviewerQualityGate(
  input?: Phase19ReviewerGateOptions,
  dependencies?: Phase19ReviewerGateDependencies,
): Promise<Phase19ReviewerGateReport> {
  const root = new URL("..", import.meta.url).pathname;
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase19ReviewerGateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase19ReviewerGateExecutionResult[] = [];
  const commands = buildPhase19ReviewerGateCommands(root);

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
  const report: Phase19ReviewerGateReport = {
    phase: "phase-19-reviewer",
    generatedAt,
    generatedBy: GENERATED_BY,
    runId,
    runDirectory,
    commands: commandResults,
    scope: {
      inScope: [
        "reviewer rollout family observe/assist/promote lifecycle",
        "family-aware eval/runtime/reporting rollout substrate",
        "retrieval rollout regression coverage required by the reviewer family",
        "phase-18 host-adapter public-path regressions",
      ],
      outOfScope: [
        "maintenance rollout family closure",
        "public config widening for reviewer controls",
        "non-deterministic live-model acceptance",
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
            "Phase 19 reviewer rollout is regression-covered on top of the closed retrieval and host surfaces.",
        },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-19-reviewer-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

async function main(): Promise<void> {
  const report = await runPhase19ReviewerQualityGate();
  console.log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
