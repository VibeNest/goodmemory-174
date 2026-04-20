import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase25GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase25GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase25GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase25GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase25GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-25";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase25GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase25GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase25GateCommand) => Promise<Phase25GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase25GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase25GateOptions) => Promise<Phase25GateReport>;
}

const GENERATED_BY = "scripts/run-phase-25-gate.ts";

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase25GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-25");
}

export function buildPhase25GateCommands(root: string): Phase25GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-25-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/evolution.behavioral-telemetry.test.ts",
        "tests/unit/evolution.reviewer.test.ts",
        "tests/unit/evolution.gates.test.ts",
        "tests/unit/eval.behavioral-adaptation.test.ts",
        "tests/unit/run-phase-25.script.test.ts",
        "tests/integration/evolution.outcome-telemetry.test.ts",
      ],
    },
    {
      label: "phase-25-fallback-eval",
      cwd: root,
      args: ["bun", "run", "eval:phase-25"],
    },
  ];
}

export async function defaultRunPhase25GateCommand(
  command: Phase25GateCommand,
): Promise<Phase25GateCommandResult> {
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

export function buildPhase25GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase25"}`;
}

export async function runPhase25QualityGate(
  input?: Phase25GateOptions,
  dependencies?: Phase25GateDependencies,
): Promise<Phase25GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const runCommand = dependencies?.runCommand ?? defaultRunPhase25GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase25GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase25GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase25GateExecutionResult[] = [];

  for (const command of buildPhase25GateCommands(root)) {
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
  const report: Phase25GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 25 internal outcome-telemetry runtime and canonical Layer D reporting are regression-covered on the deterministic gate path; provider-backed live-memory behavioral closure remains outside this gate.",
        },
    commands: commandResults,
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-25",
    runDirectory,
    runId,
    scope: {
      inScope: [
        "tool_outcome telemetry to proposal/gate/compiler chain",
        "canonical layer_d behavioral adaptation report contract",
        "phase-25 deterministic fallback eval and gate",
      ],
      outOfScope: [
        "public API or public config widening",
        "making priming a blocking release metric",
        "changing README-level default runtime behavior",
        "provider-backed live-memory behavioral closure",
      ],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-25-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export function parsePhase25GateCliOptions(
  argv: readonly string[],
): Phase25GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase25GateCli(
  dependencies?: Phase25GateCliDependencies,
): Promise<Phase25GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase25QualityGate(options));
  const report = await runGate(parsePhase25GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase25GateCli();
}
