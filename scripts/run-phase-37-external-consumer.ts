import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase37ExternalConsumerOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase37ExternalConsumerCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
  stdin?: string;
}

export interface Phase37ExternalConsumerCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase37ExternalConsumerExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase37ExternalConsumerDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  makeTempDir?: (prefix: string) => Promise<string>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  removeDir?: (
    path: string,
    options?: {
      force?: boolean;
      recursive?: boolean;
    },
  ) => Promise<void>;
  runCommand?: (
    command: Phase37ExternalConsumerCommand,
  ) => Promise<Phase37ExternalConsumerCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase37ExternalConsumerReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase37ExternalConsumerExecutionResult[];
  evidence: {
    installedPackageUsed: boolean;
    manualSeedUsed: false;
    nextSessionRecallHit: boolean;
    rawTranscriptPersisted: boolean;
    tarballName: string | null;
    wroteDurableMemory: boolean;
    writebackMode: "selective";
  };
  evidenceContract: {
    phase37: {
      packageBoundary: "external_consumer_installed_package";
      runner: "scripts/run-phase-37-external-consumer.ts";
      runtimePath: "external_consumer_installed_host_writeback";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-37-external-consumer.ts";
  mode: "external-consumer";
  outputDir: string;
  phase: "phase-37";
  runDirectory: string;
  runId: string;
}

const GENERATED_BY = "scripts/run-phase-37-external-consumer.ts";
const PHASE37_OPEN_LOOP = "Next step is to add the phase-37 external consumer report.";

export function resolvePhase37ExternalConsumerOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-37");
}

export function buildPhase37ExternalConsumerRunId(timestamp: string): string {
  const value = timestamp.replace(/\D/g, "").slice(0, 14) || "phase37external";
  return `run-${value}-external-consumer`;
}

export function parsePhase37ExternalConsumerCliOptions(
  argv: readonly string[],
): Phase37ExternalConsumerOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/u).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function toExecutionResult(
  command: Phase37ExternalConsumerCommand,
  result: Phase37ExternalConsumerCommandResult,
): Phase37ExternalConsumerExecutionResult {
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

async function defaultRunCommand(
  command: Phase37ExternalConsumerCommand,
): Promise<Phase37ExternalConsumerCommandResult> {
  const startedAtMs = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: command.env ? { ...process.env, ...command.env } : process.env,
    stderr: "pipe",
    stdin: command.stdin ? "pipe" : "ignore",
    stdout: "pipe",
  });
  if (command.stdin && child.stdin) {
    child.stdin.write(command.stdin);
    child.stdin.end();
  }
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

function extractJsonObject<T>(value: string): T {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Expected JSON output but received: ${value.trim()}`);
  }

  return JSON.parse(value.slice(start, end + 1)) as T;
}

function createBlockedReport(input: {
  commands: Phase37ExternalConsumerExecutionResult[];
  outputDir: string;
  reason: string;
  runDirectory: string;
  runId: string;
  tarballName: string | null;
  timestamp: string;
}): Phase37ExternalConsumerReport {
  return {
    acceptance: {
      decision: "blocked",
      reason: input.reason,
    },
    commands: input.commands,
    evidence: {
      installedPackageUsed: false,
      manualSeedUsed: false,
      nextSessionRecallHit: false,
      rawTranscriptPersisted: false,
      tarballName: input.tarballName,
      wroteDurableMemory: false,
      writebackMode: "selective",
    },
    evidenceContract: {
      phase37: {
        packageBoundary: "external_consumer_installed_package",
        runner: GENERATED_BY,
        runtimePath: "external_consumer_installed_host_writeback",
      },
    },
    generatedAt: input.timestamp,
    generatedBy: GENERATED_BY,
    mode: "external-consumer",
    outputDir: input.outputDir,
    phase: "phase-37",
    runDirectory: input.runDirectory,
    runId: input.runId,
  };
}

export async function runPhase37ExternalConsumerSmoke(
  options: Phase37ExternalConsumerOptions = {},
  dependencies: Phase37ExternalConsumerDependencies = {},
): Promise<Phase37ExternalConsumerReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase37ExternalConsumerOutputDir(root);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const makeTempDir =
    dependencies.makeTempDir ??
    ((prefix: string) => mkdtemp(join(tmpdir(), prefix)));
  const now = dependencies.now ?? (() => new Date().toISOString());
  const removeDir = dependencies.removeDir ?? rm;
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const timestamp = now();
  const runId = options.runId ?? buildPhase37ExternalConsumerRunId(timestamp);
  const runDirectory = join(outputDir, runId);
  const commands: Phase37ExternalConsumerExecutionResult[] = [];
  let tarballName: string | null = null;
  const tempRoot = await makeTempDir("goodmemory-phase37-external-");

  try {
    const packDir = join(tempRoot, "pack");
    const consumerRoot = join(tempRoot, "consumer");
    const homeRoot = join(tempRoot, "home");
    await mkdir(packDir, { recursive: true });
    await mkdir(consumerRoot, { recursive: true });
    await writeFile(
      join(consumerRoot, "package.json"),
      JSON.stringify({ name: "phase37-consumer", private: true }, null, 2) + "\n",
      "utf8",
    );

    const runStep = async (command: Phase37ExternalConsumerCommand) => {
      const result = await runCommand(command);
      commands.push(toExecutionResult(command, result));
      if (result.exitCode !== 0) {
        throw new Error(`External consumer command failed: ${command.label}`);
      }
      return result;
    };

    const pack = await runStep({
      args: ["npm", "pack", "--pack-destination", packDir],
      cwd: root,
      label: "npm-pack",
    });
    tarballName = pack.stdout.trim().split(/\r?\n/u).at(-1) ?? null;
    if (!tarballName) {
      throw new Error("npm pack did not report a tarball name.");
    }
    const tarballPath = join(packDir, tarballName);

    await runStep({
      args: ["npm", "install", tarballPath],
      cwd: consumerRoot,
      label: "consumer-install-package",
    });
    const env = { GOODMEMORY_HOME: homeRoot };
    const bin = join(consumerRoot, "node_modules/.bin/goodmemory");
    await runStep({
      args: [
        bin,
        "install",
        "codex",
        "--user-id",
        "phase37-external-user",
        "--writeback",
        "selective",
        "--no-interactive",
      ],
      cwd: consumerRoot,
      env,
      label: "consumer-install-codex",
    });
    await runStep({
      args: [bin, "enable", "codex", "--writeback", "selective"],
      cwd: consumerRoot,
      env,
      label: "consumer-enable-codex",
    });
    const writeback = await runStep({
      args: [bin, "codex", "writeback", "--json"],
      cwd: consumerRoot,
      env,
      label: "consumer-codex-writeback",
      stdin: JSON.stringify({
        cwd: consumerRoot,
        messages: [
          {
            content: PHASE37_OPEN_LOOP,
            role: "user",
          },
        ],
        session_id: "phase37-external-session-1",
      }),
    });
    const hook = await runStep({
      args: [bin, "codex", "hook", "user-prompt-submit"],
      cwd: consumerRoot,
      env,
      label: "consumer-codex-user-prompt-submit",
      stdin: JSON.stringify({
        cwd: consumerRoot,
        prompt: "What should continue for phase 37?",
        session_id: "phase37-external-session-2",
      }),
    });
    const writebackJson = extractJsonObject<{
      reason?: string;
      trace?: { rawTranscriptPersisted?: boolean };
      wrote?: boolean;
    }>(writeback.stdout);
    const hookJson = extractJsonObject<{
      hookSpecificOutput?: {
        additionalContext?: string;
      };
    }>(hook.stdout);
    const context = hookJson.hookSpecificOutput?.additionalContext ?? "";
    const wroteDurableMemory = writebackJson.wrote === true;
    const nextSessionRecallHit = context.includes("phase-37 external consumer report");
    const rawTranscriptPersisted = writebackJson.trace?.rawTranscriptPersisted === true;
    const installedPackageUsed = commands.some(
      (command) => command.label === "consumer-install-package" && command.status === "passed",
    );
    const accepted =
      installedPackageUsed &&
      wroteDurableMemory &&
      nextSessionRecallHit &&
      !rawTranscriptPersisted;
    const report: Phase37ExternalConsumerReport = {
      acceptance: {
        decision: accepted ? "accepted" : "blocked",
        reason: accepted
          ? "External consumer installed the packed package, ran Codex selective writeback, and recalled the written open loop without manual seeding."
          : "External consumer smoke did not prove installed-package selective writeback and next-session recall.",
      },
      commands,
      evidence: {
        installedPackageUsed,
        manualSeedUsed: false,
        nextSessionRecallHit,
        rawTranscriptPersisted,
        tarballName,
        wroteDurableMemory,
        writebackMode: "selective",
      },
      evidenceContract: {
        phase37: {
          packageBoundary: "external_consumer_installed_package",
          runner: GENERATED_BY,
          runtimePath: "external_consumer_installed_host_writeback",
        },
      },
      generatedAt: timestamp,
      generatedBy: GENERATED_BY,
      mode: "external-consumer",
      outputDir,
      phase: "phase-37",
      runDirectory,
      runId,
    };
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    return report;
  } catch (error) {
    const blocked = createBlockedReport({
      commands,
      outputDir,
      reason: error instanceof Error
        ? error.message
        : "Phase 37 external consumer smoke failed.",
      runDirectory,
      runId,
      tarballName,
      timestamp,
    });
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(blocked, null, 2) + "\n",
    );
    return blocked;
  } finally {
    await removeDir(tempRoot, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  const report = await runPhase37ExternalConsumerSmoke(
    parsePhase37ExternalConsumerCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
