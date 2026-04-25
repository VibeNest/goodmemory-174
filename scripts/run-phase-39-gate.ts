import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase39GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase39GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase39GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase39EvidenceStatus {
  reason: string;
  status: "accepted" | "blocked";
}

export interface Phase39GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase39GateExecutionResult[];
  evidence: {
    asyncRememberJobs: Phase39EvidenceStatus;
    httpContract: Phase39EvidenceStatus;
    packagedBridge: Phase39EvidenceStatus;
    policyMapping: Phase39EvidenceStatus;
    pythonConsumer: Phase39EvidenceStatus;
    referenceBridge: Phase39EvidenceStatus;
    regressionChain: Phase39EvidenceStatus;
    scopedAuthorization: Phase39EvidenceStatus;
    userControl: Phase39EvidenceStatus;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-39-gate.ts";
  phase: "phase-39";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase39GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase39GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase39GateCommand) => Promise<Phase39GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase39GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase39GateOptions) => Promise<Phase39GateReport>;
}

const GENERATED_BY = "scripts/run-phase-39-gate.ts";
const DEFAULT_RUN_ID = "run-20260425041112";
const PHASE39_IN_SCOPE = [
  "backend-only Python/FastAPI HTTP memory bridge contract",
  "public goodmemory/http bridge API and goodmemory-http-bridge packaged bin",
  "recall-context response with prompt-ready context and compact structured items",
  "bridge-level async remember mode routed through memory.jobs",
  "life-coach reference write profile without a built-in OneLife preset",
  "scoped authorization for export, forget, and targeted revise",
  "targeted /memory/revise by explicit memoryId only",
  "Python process smoke against both the bridge API and packaged bridge server",
  "Phase 39 docs, targeted regressions, and CI gate",
] as const;
const PHASE39_OUT_OF_SCOPE = [
  "client-side GoodMemory runtime bundling",
  "built-in OneLife preset",
  "query-resolved correction targets",
  "remember background mode overloads",
  "consumer-side lock or do-not-remember as a native bridge mutation",
  "default raw transcript archive",
  "managed cloud, dashboard, or hosted sync",
  "cross-service exactly-once claims between product storage and GoodMemory",
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

function createChildEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      entry[1] !== undefined
    ),
  );
  env.PHASE39_GATE_IN_PROGRESS = "1";

  return env;
}

function toExecutionResult(
  command: Phase39GateCommand,
  result: Phase39GateCommandResult,
): Phase39GateExecutionResult {
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
  command: Phase39GateCommand,
): Promise<Phase39GateCommandResult> {
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

function toTimestampRunId(value: string): string {
  const date = new Date(value);
  const pad = (part: number): string => String(part).padStart(2, "0");

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function buildEvidenceStatus(
  accepted: boolean,
  acceptedReason: string,
  blockedReason: string,
): Phase39EvidenceStatus {
  return {
    reason: accepted ? acceptedReason : blockedReason,
    status: accepted ? "accepted" : "blocked",
  };
}

async function writeReport(input: {
  commands: Phase39GateExecutionResult[];
  ensureDir: NonNullable<Phase39GateDependencies["ensureDir"]>;
  now: NonNullable<Phase39GateDependencies["now"]>;
  outputPath: string;
  runDirectory: string;
  runId: string;
  writeTextFile: NonNullable<Phase39GateDependencies["writeTextFile"]>;
}): Promise<Phase39GateReport> {
  const failedCommand = input.commands.find((command) => command.status === "failed");
  const accepted = failedCommand === undefined;
  const blockedReason = failedCommand
    ? `Required Phase 39 command failed: ${failedCommand.label}.`
    : "Phase 39 regression chain did not complete.";
  const acceptedReason =
    "Phase 39 Python HTTP bridge passed targeted regressions and the CI gate.";
  const report: Phase39GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted ? acceptedReason : blockedReason,
    },
    commands: input.commands,
    evidence: {
      asyncRememberJobs: buildEvidenceStatus(
        accepted,
        "bridge async remember mode routes to memory.jobs.enqueueRemember with job idempotency evidence.",
        blockedReason,
      ),
      httpContract: buildEvidenceStatus(
        accepted,
        "Python/FastAPI HTTP contract validation passed for recall-context, remember, feedback, export, forget, and revise.",
        blockedReason,
      ),
      packagedBridge: buildEvidenceStatus(
        accepted,
        "package metadata exposes goodmemory/http and goodmemory-http-bridge, with installed-package smoke coverage.",
        blockedReason,
      ),
      policyMapping: buildEvidenceStatus(
        accepted,
        "life-coach profile, assistant confirmation, consumer-owned lock/do-not-remember, and proposal mapping guidance are documented and regression-covered.",
        blockedReason,
      ),
      pythonConsumer: buildEvidenceStatus(
        accepted,
        "Python standard-library consumer smoke called the running bridge API and packaged bridge server over HTTP.",
        blockedReason,
      ),
      referenceBridge: buildEvidenceStatus(
        accepted,
        "reference bridge uses only public goodmemory APIs and keeps framework coupling thin.",
        blockedReason,
      ),
      regressionChain: buildEvidenceStatus(
        accepted,
        "Phase 39 targeted regressions, test:ci, and the Phase 38 hermetic preflight gate passed.",
        blockedReason,
      ),
      scopedAuthorization: buildEvidenceStatus(
        accepted,
        "default bridge authorization rejects broadened tenant/workspace scopes for scoped memory operations.",
        blockedReason,
      ),
      userControl: buildEvidenceStatus(
        accepted,
        "export, forget, feedback, and targeted revise user-control flows passed scoped regression coverage.",
        blockedReason,
      ),
    },
    generatedAt: input.now(),
    generatedBy: GENERATED_BY,
    phase: "phase-39",
    runDirectory: input.runDirectory,
    runId: input.runId,
    scope: {
      inScope: [...PHASE39_IN_SCOPE],
      outOfScope: [...PHASE39_OUT_OF_SCOPE],
    },
  };

  await input.ensureDir(input.runDirectory, { recursive: true });
  await input.writeTextFile(input.outputPath, `${JSON.stringify(report, null, 2)}\n`);

  return report;
}

export function parsePhase39GateCliOptions(
  argv: readonly string[],
): Phase39GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function resolvePhase39GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-39");
}

export function buildPhase39GateRunId(now: string): string {
  return `run-${toTimestampRunId(now)}`;
}

export function buildPhase39GateCommands(root: string): Phase39GateCommand[] {
  return [
    {
      args: [
        "bun",
        "test",
        "tests/integration/python-http-bridge.test.ts",
        "tests/integration/remember.profiles.test.ts",
        "tests/integration/background-jobs.api.test.ts",
        "tests/integration/revise-memory.api.test.ts",
        "tests/integration/runtime-facade.api.test.ts",
        "tests/unit/run-phase-39.gate.test.ts",
        "tests/release/node-package-boundary.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "phase-39-targeted-regressions",
    },
    {
      args: ["bun", "run", "test:ci"],
      cwd: root,
      label: "ci-regression-gate",
    },
    {
      args: [
        "bun",
        "run",
        "gate:phase-38",
        "--",
        "--output-dir",
        join(root, ".tmp-goodmemory-phase39/quality-gates/phase-38"),
        "--run-id",
        "run-phase39-preflight-38",
      ],
      cwd: root,
      label: "phase-38-hermetic-preflight-gate",
    },
  ];
}

export async function runPhase39QualityGate(
  options: Phase39GateOptions = {},
  dependencies: Phase39GateDependencies = {},
): Promise<Phase39GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const runId = options.runId ?? DEFAULT_RUN_ID;
  const outputDir = options.outputDir ?? resolvePhase39GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const ensureDir =
    dependencies.ensureDir ??
    (async (path: string, options?: { recursive?: boolean }) => {
      await mkdir(path, options);
    });
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const commands: Phase39GateExecutionResult[] = [];

  for (const command of buildPhase39GateCommands(root)) {
    const commandResult = await runCommand(command);
    const execution = toExecutionResult(command, commandResult);
    commands.push(execution);

    if (execution.status === "failed") {
      return await writeReport({
        commands,
        ensureDir,
        now,
        outputPath: join(runDirectory, "phase-39-quality-gate.json"),
        runDirectory,
        runId,
        writeTextFile,
      });
    }
  }

  return await writeReport({
    commands,
    ensureDir,
    now,
    outputPath: join(runDirectory, "phase-39-quality-gate.json"),
    runDirectory,
    runId,
    writeTextFile,
  });
}

export async function runPhase39GateCli(
  dependencies: Phase39GateCliDependencies = {},
): Promise<Phase39GateReport> {
  const argv = dependencies.argv ?? process.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runGate = dependencies.runGate ?? runPhase39QualityGate;
  const report = await runGate(parsePhase39GateCliOptions(argv));

  if (report.acceptance.decision === "accepted") {
    log(`Phase 39 quality gate accepted: ${report.runId}`);
  } else {
    log(`Phase 39 quality gate blocked: ${report.acceptance.reason}`);
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase39GateCli();
}
