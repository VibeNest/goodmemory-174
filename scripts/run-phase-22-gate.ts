import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase22GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase22GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase22GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase22GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase22GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-22";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase22GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase22GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase22GateCommand) => Promise<Phase22GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase22GateCliDependencies {
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: () => Promise<Phase22GateReport>;
}

const GENERATED_BY = "scripts/run-phase-22-gate.ts";

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase22GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-22");
}

export function buildPhase22GateCommands(root: string): Phase22GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-22-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/recall.assistant.test.ts",
        "tests/unit/provider.layer.test.ts",
        "tests/unit/model-adapters.test.ts",
        "tests/unit/recall.router.test.ts",
        "tests/unit/run-phase-22.script.test.ts",
        "tests/integration/recall.api.test.ts",
      ],
    },
    {
      label: "phase-22-fallback-eval",
      cwd: root,
      args: ["bun", "run", "eval:phase-22"],
    },
  ];
}

export async function defaultRunPhase22GateCommand(
  command: Phase22GateCommand,
): Promise<Phase22GateCommandResult> {
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

export function buildPhase22GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase22"}`;
}

export async function runPhase22QualityGate(
  input?: Phase22GateOptions,
  dependencies?: Phase22GateDependencies,
): Promise<Phase22GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const runCommand = dependencies?.runCommand ?? defaultRunPhase22GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase22GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase22GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase22GateExecutionResult[] = [];
  const commands = buildPhase22GateCommands(root);

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
  const report: Phase22GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 22 recall-router provider hardening and promotion-readiness scope is regression-covered on the deterministic gate path.",
        },
    commands: commandResults,
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-22",
    runDirectory,
    runId,
    scope: {
      inScope: [
        "recall-router provider wire-shape hardening and redacted diagnostics",
        "router influence status reporting for applied, partial fallback, and full fallback paths",
        "phase-22 fallback eval and gate artifact closure",
      ],
      outOfScope: [
        "public config widening for recall router",
        "default llm-assisted recall promotion",
        "trusted promotion authorization generation",
      ],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-22-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase22GateCli(
  dependencies?: Phase22GateCliDependencies,
): Promise<Phase22GateReport> {
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate = dependencies?.runGate ?? (() => runPhase22QualityGate());
  const report = await runGate();
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase22GateCli();
}
