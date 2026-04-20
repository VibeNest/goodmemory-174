import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase21GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase21GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase21GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase21GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase21GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-21";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase21GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase21GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase21GateCommand) => Promise<Phase21GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase21GateCliDependencies {
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: () => Promise<Phase21GateReport>;
}

const GENERATED_BY = "scripts/run-phase-21-gate.ts";

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase21GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-21");
}

export function buildPhase21GateCommands(root: string): Phase21GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-21-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/recall.assistant.test.ts",
        "tests/unit/provider.layer.test.ts",
        "tests/unit/model-adapters.test.ts",
        "tests/unit/recall.router.test.ts",
        "tests/unit/run-phase-21.script.test.ts",
        "tests/integration/recall.api.test.ts",
      ],
    },
    {
      label: "phase-21-fallback-eval",
      cwd: root,
      args: ["bun", "run", "eval:phase-21"],
    },
  ];
}

export async function defaultRunPhase21GateCommand(
  command: Phase21GateCommand,
): Promise<Phase21GateCommandResult> {
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

export function buildPhase21GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase21"}`;
}

export async function runPhase21QualityGate(
  input?: Phase21GateOptions,
  dependencies?: Phase21GateDependencies,
): Promise<Phase21GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const runCommand = dependencies?.runCommand ?? defaultRunPhase21GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase21GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase21GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase21GateExecutionResult[] = [];
  const commands = buildPhase21GateCommands(root);

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
  const report: Phase21GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 21 recall-side LLM router observe/assist scope is regression-covered on the deterministic gate path.",
        },
    commands: commandResults,
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-21",
    runDirectory,
    runId,
    scope: {
      inScope: [
        "internal recall-side llm router contracts and bounded safety guards",
        "deterministic recall regressions plus phase-21 observe eval entrypoint",
        "phase-21 task-board and quality-gate artifact closure",
      ],
      outOfScope: [
        "promotion authorization or default rollout switching",
        "public config widening for recall router",
        "owner-managed live-provider validation beyond the dedicated phase-21 live-memory run",
      ],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-21-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase21GateCli(
  dependencies?: Phase21GateCliDependencies,
): Promise<Phase21GateReport> {
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate = dependencies?.runGate ?? (() => runPhase21QualityGate());
  const report = await runGate();
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase21GateCli();
}
