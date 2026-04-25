import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase38GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase38GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase38GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase38EvidenceStatus {
  reason: string;
  status: "accepted" | "blocked";
}

export interface Phase38GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase38GateExecutionResult[];
  evidence: {
    backgroundJobs: Phase38EvidenceStatus;
    expressFastifyExamples: Phase38EvidenceStatus;
    providerFacade: Phase38EvidenceStatus;
    regressionChain: Phase38EvidenceStatus;
    revision: Phase38EvidenceStatus;
    runtimeFacade: Phase38EvidenceStatus;
    traceSink: Phase38EvidenceStatus;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-38-gate.ts";
  phase: "phase-38";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase38GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase38GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  runCommand?: (command: Phase38GateCommand) => Promise<Phase38GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase38GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase38GateOptions) => Promise<Phase38GateReport>;
}

const GENERATED_BY = "scripts/run-phase-38-gate.ts";
const DEFAULT_RUN_ID = "run-20260425084045";
const PHASE38_IN_SCOPE = [
  "traceSink public contract and redaction-safe spans",
  "targeted reviseMemory by explicit memoryId",
  "memory.runtime facade with transcript-like archive persistence off by default",
  "memory.jobs explicit background remember scheduler",
  "providers.embedding and providers.extraction facade over existing provider adapters",
  "thin Express and Fastify examples without framework runtime dependencies",
  "Phase 37.1 hermetic preflight gate, CI gate, and targeted Phase 38 regressions",
] as const;
const PHASE38_OUT_OF_SCOPE = [
  "correctMemory as the primary public name",
  "query-resolved revision targets",
  "memory.facts.add or unmanaged CRUD APIs",
  "remember background mode overloads",
  "default-on writeback",
  "raw transcript archive by default",
  "public router-provider configuration",
  "dashboard, managed cloud, analytics, or framework-first coupling",
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
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      entry[1] !== undefined
    ),
  );
}

function toExecutionResult(
  command: Phase38GateCommand,
  result: Phase38GateCommandResult,
): Phase38GateExecutionResult {
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
  command: Phase38GateCommand,
): Promise<Phase38GateCommandResult> {
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
): Phase38EvidenceStatus {
  return {
    reason: accepted ? acceptedReason : blockedReason,
    status: accepted ? "accepted" : "blocked",
  };
}

async function writeReport(input: {
  commands: Phase38GateExecutionResult[];
  ensureDir: NonNullable<Phase38GateDependencies["ensureDir"]>;
  now: NonNullable<Phase38GateDependencies["now"]>;
  outputPath: string;
  runDirectory: string;
  runId: string;
  writeTextFile: NonNullable<Phase38GateDependencies["writeTextFile"]>;
}): Promise<Phase38GateReport> {
  const failedCommand = input.commands.find((command) => command.status === "failed");
  const accepted = failedCommand === undefined;
  const blockedReason = failedCommand
    ? `Required Phase 38 command failed: ${failedCommand.label}.`
    : "Phase 38 regression chain did not complete.";
  const acceptedReason =
    "Phase 38 governed runtime surface passed targeted regressions, CI, and the Phase 37.1 hermetic preflight gate.";
  const report: Phase38GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted ? acceptedReason : blockedReason,
    },
    commands: input.commands,
    evidence: {
      backgroundJobs: buildEvidenceStatus(
        accepted,
        "memory.jobs explicit background remember scheduler passed integration and CI regressions.",
        blockedReason,
      ),
      expressFastifyExamples: buildEvidenceStatus(
        accepted,
        "Express and Fastify examples passed example and package-boundary regressions without framework dependencies.",
        blockedReason,
      ),
      providerFacade: buildEvidenceStatus(
        accepted,
        "providers.embedding and providers.extraction facade passed runtime-resolution, provider, type, and CI regressions.",
        blockedReason,
      ),
      regressionChain: buildEvidenceStatus(
        accepted,
        "Phase 38 targeted regressions, test:ci, and the Phase 37.1 hermetic preflight gate passed.",
        blockedReason,
      ),
      revision: buildEvidenceStatus(
        accepted,
        "targeted reviseMemory passed governed correction, policy, idempotency, lineage, and CI regressions.",
        blockedReason,
      ),
      runtimeFacade: buildEvidenceStatus(
        accepted,
        "memory.runtime facade passed runtime lifecycle, archive-boundary, and CI regressions.",
        blockedReason,
      ),
      traceSink: buildEvidenceStatus(
        accepted,
        "traceSink contract passed redaction, fail-open, scope digest, receipt, and CI regressions.",
        blockedReason,
      ),
    },
    generatedAt: input.now(),
    generatedBy: GENERATED_BY,
    phase: "phase-38",
    runDirectory: input.runDirectory,
    runId: input.runId,
    scope: {
      inScope: [...PHASE38_IN_SCOPE],
      outOfScope: [...PHASE38_OUT_OF_SCOPE],
    },
  };

  await input.ensureDir(input.runDirectory, { recursive: true });
  await input.writeTextFile(input.outputPath, `${JSON.stringify(report, null, 2)}\n`);

  return report;
}

export function parsePhase38GateCliOptions(
  argv: readonly string[],
): Phase38GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function resolvePhase38GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-38");
}

export function buildPhase38GateRunId(now: string): string {
  return `run-${toTimestampRunId(now)}`;
}

export function buildPhase38GateCommands(root: string): Phase38GateCommand[] {
  return [
    {
      args: [
        "bun",
        "test",
        "tests/integration/observability.trace-sink.test.ts",
        "tests/integration/revise-memory.api.test.ts",
        "tests/integration/runtime-facade.api.test.ts",
        "tests/integration/background-jobs.api.test.ts",
        "tests/integration/provider-facade.api.test.ts",
        "tests/examples/examples.test.ts",
        "tests/types/public-config.types.ts",
        "tests/types/public-runtime.types.ts",
        "tests/unit/runtime-resolution.test.ts",
        "tests/unit/runtime.context-service.test.ts",
        "tests/unit/runtime.public.test.ts",
        "tests/unit/run-phase-38.gate.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "phase-38-targeted-regressions",
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
        "gate:phase-37-1",
        "--",
        "--output-dir",
        join(root, ".tmp-goodmemory-phase38/quality-gates/phase-37-1"),
        "--run-id",
        "run-phase38-preflight-37-1",
          "--dogfood-report-path",
          join(
            root,
            "reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json",
          ),
          "--skip-dependency-gates",
        ],
      cwd: root,
      label: "phase-37-1-hermetic-preflight-gate",
    },
  ];
}

export async function runPhase38QualityGate(
  options: Phase38GateOptions = {},
  dependencies: Phase38GateDependencies = {},
): Promise<Phase38GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const runId = options.runId ?? DEFAULT_RUN_ID;
  const outputDir = options.outputDir ?? resolvePhase38GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const ensureDir =
    dependencies.ensureDir ??
    (async (path: string, options?: { recursive?: boolean }) => {
      await mkdir(path, options);
    });
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const commands: Phase38GateExecutionResult[] = [];

  for (const command of buildPhase38GateCommands(root)) {
    const result = await runCommand(command);
    const execution = toExecutionResult(command, result);
    commands.push(execution);

    if (execution.status === "failed") {
      return await writeReport({
        commands,
        ensureDir,
        now,
        outputPath: join(runDirectory, "phase-38-quality-gate.json"),
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
    outputPath: join(runDirectory, "phase-38-quality-gate.json"),
    runDirectory,
    runId,
    writeTextFile,
  });
}

export async function runPhase38GateCli(
  dependencies: Phase38GateCliDependencies = {},
): Promise<Phase38GateReport> {
  const argv = dependencies.argv ?? process.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runGate = dependencies.runGate ?? runPhase38QualityGate;
  const report = await runGate(parsePhase38GateCliOptions(argv));

  if (report.acceptance.decision === "accepted") {
    log(`Phase 38 quality gate accepted: ${report.runId}`);
  } else {
    log(`Phase 38 quality gate blocked: ${report.acceptance.reason}`);
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase38GateCli();
}
