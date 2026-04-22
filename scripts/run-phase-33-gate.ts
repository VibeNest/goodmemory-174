import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase33GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase33GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase33GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase33GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase33GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-33";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase33GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase33GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase33GateCommand) => Promise<Phase33GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase33GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase33GateOptions) => Promise<Phase33GateReport>;
}

const GENERATED_BY = "scripts/run-phase-33-gate.ts";
const PHASE33_IN_SCOPE = [
  "compiled dist and declaration outputs for goodmemory, goodmemory/ai-sdk, and goodmemory/host",
  "node-safe packaged library imports with runtime fallback coverage for createGoodMemory({})",
  "bun-backed installed CLI isolation behind a node-safe package bin wrapper",
  "release and consumer package-boundary regression coverage for Bun and Node installs",
] as const;
const PHASE33_OUT_OF_SCOPE = [
  "declaring built-in Bun-specific storage adapters universally available in every runtime",
  "new memory capability expansion or dashboard/admin product work",
  "claiming phase-33 is fully closed without dedicated archive evidence and synchronized closure docs",
] as const;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value
    .trim()
    .split(/\r?\n/u)
    .slice(-count);
}

async function defaultRunCommand(
  command: Phase33GateCommand,
): Promise<Phase33GateCommandResult> {
  const startedAt = Date.now();
  const process = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(process.stdout).text();
  const stderr = await new Response(process.stderr).text();
  const exitCode = await process.exited;

  return {
    durationMs: Date.now() - startedAt,
    exitCode,
    stderr,
    stdout,
  };
}

export function resolvePhase33GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-33");
}

export function buildPhase33GateRunId(timestamp: string): string {
  const digits = timestamp.replace(/\D/gu, "").slice(0, 14);
  return `run-${digits}`;
}

export function parsePhase33GateCliOptions(
  argv: readonly string[],
): Phase33GateOptions {
  const outputDir = resolveCliFlagValue(argv, "--output-dir");
  const runId = resolveCliFlagValue(argv, "--run-id");

  return {
    ...(outputDir ? { outputDir } : {}),
    ...(runId ? { runId } : {}),
  };
}

export function buildPhase33GateCommands(root: string): Phase33GateCommand[] {
  return [
    {
      args: ["bun", "run", "typecheck"],
      cwd: root,
      label: "typecheck",
    },
    {
      args: ["bun", "run", "build"],
      cwd: root,
      label: "build",
    },
    {
      args: [
        "bun",
        "test",
        "tests/unit/runtime-resolution.test.ts",
        "tests/release/node-package-boundary.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "package-boundary-regressions",
    },
  ];
}

export async function runPhase33QualityGate(
  root: string,
  options: Phase33GateOptions = {},
  dependencies: Phase33GateDependencies = {},
): Promise<Phase33GateReport> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const outputDir = options.outputDir
    ? resolve(root, options.outputDir)
    : resolvePhase33GateOutputDir(root);
  const runId = options.runId ?? buildPhase33GateRunId(now());
  const runDirectory = join(outputDir, runId);
  const commands = buildPhase33GateCommands(root);
  const results: Phase33GateExecutionResult[] = [];

  for (const command of commands) {
    const result = await runCommand(command);
    results.push({
      command: command.args.join(" "),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      label: command.label,
      status: result.exitCode === 0 ? "passed" : "failed",
      stderrTail: tailLines(result.stderr),
      stdoutTail: tailLines(result.stdout),
    });

    if (result.exitCode !== 0) {
      break;
    }
  }

  const failed = results.find((result) => result.exitCode !== 0);
  const report: Phase33GateReport = {
    acceptance: failed
      ? {
          decision: "blocked",
          reason: `Command failed: ${failed.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Build output, runtime fallback, and Bun/Node package-boundary regressions all passed.",
        },
    commands: results,
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    phase: "phase-33",
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE33_IN_SCOPE],
      outOfScope: [...PHASE33_OUT_OF_SCOPE],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-33-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase33GateCli(
  dependencies: Phase33GateCliDependencies = {},
): Promise<Phase33GateReport> {
  const argv = dependencies.argv ?? process.argv;
  const runGate =
    dependencies.runGate ??
    ((options?: Phase33GateOptions) =>
      runPhase33QualityGate(resolveRepoRootFromScriptUrl(import.meta.url), options));
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const options = parsePhase33GateCliOptions(argv);
  const report = await runGate(options);

  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);

  return report;
}

if (import.meta.main) {
  await runPhase33GateCli();
}
