import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase27GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase27GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase27GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase27IgnoredGeneratedReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  regenerateCommand: string;
}

export interface Phase27GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase27GateExecutionResult[];
  evidence: {
    deterministicReport: Phase27IgnoredGeneratedReportEvidence;
  };
  generatedAt: string;
  generatedBy: string;
  phase: "phase-27";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase27GateOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase27GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase27GateCommand) => Promise<Phase27GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase27GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase27GateOptions) => Promise<Phase27GateReport>;
}

const GENERATED_BY = "scripts/run-phase-27-gate.ts";
const PHASE27_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260421165000";
const PHASE27_CANONICAL_LIVE_RUN_ID = "run-20260421170500";
const PHASE27_DETERMINISTIC_TEST_ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "",
  GOODMEMORY_EMBEDDING_API_KEY: "",
  GOODMEMORY_EMBEDDING_BASE_URL: "",
  GOODMEMORY_EMBEDDING_MODEL: "",
  GOODMEMORY_EMBEDDING_PROVIDER: "",
  GOODMEMORY_JUDGE_API_KEY: "",
  GOODMEMORY_JUDGE_BASE_URL: "",
  GOODMEMORY_JUDGE_MODEL: "",
  GOODMEMORY_JUDGE_PROVIDER: "",
  GOODMEMORY_RECALL_ROUTER_API_KEY: "",
  GOODMEMORY_RECALL_ROUTER_BASE_URL: "",
  GOODMEMORY_RECALL_ROUTER_MODEL: "",
  GOODMEMORY_RECALL_ROUTER_PROVIDER: "",
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_MODE: "",
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: "",
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
  GOODMEMORY_TEST_POSTGRES_URL: "",
} as const;
const PHASE27_IN_SCOPE = [
  "public reference hardening over createGoodMemory({}) and public-only imports",
  "package-boundary consumer smoke for goodmemory, goodmemory/ai-sdk, and goodmemory/host",
  "deterministic adoption evidence for identity/background, continuation/open-loop, repeated correction, and Codex handoff",
  "canonical provider-backed live adoption evidence for continuation/open-loop and repeated correction",
  "Codex-only host gate and phase-27 closure command",
] as const;
const PHASE27_OUT_OF_SCOPE = [
  "installer CLI or package publishing automation",
  "src/core or facade-first refactors",
  "new memory capabilities beyond the accepted local-first runtime",
  "making Claude a second gate-blocking host path",
] as const;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

export function resolvePhase27GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-27");
}

export function resolvePhase27RunOutputDir(
  root: string,
  outputDir?: string,
): string {
  if (!outputDir) {
    return resolvePhase27GateOutputDir(root);
  }

  return isAbsolute(outputDir) ? outputDir : resolve(root, outputDir);
}

export function resolvePhase27CanonicalDeterministicReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-27",
    PHASE27_CANONICAL_DETERMINISTIC_RUN_ID,
    "report.json",
  );
}

export function resolvePhase27CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-27",
    PHASE27_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase27GateScope(): Phase27GateReport["scope"] {
  return {
    inScope: [...PHASE27_IN_SCOPE],
    outOfScope: [...PHASE27_OUT_OF_SCOPE],
  };
}

function buildPhase27DeterministicRegenerateCommand(runId: string): string {
  return `bun run eval:phase-27 --run-id ${runId}`;
}

function buildPhase27IgnoredFallbackEvidence(): Phase27IgnoredGeneratedReportEvidence {
  return {
    artifactKind: "ignored_generated",
    ignoredReportPath: `reports/eval/fallback/phase-27/${PHASE27_CANONICAL_DETERMINISTIC_RUN_ID}/report.json`,
    regenerateCommand: buildPhase27DeterministicRegenerateCommand(
      PHASE27_CANONICAL_DETERMINISTIC_RUN_ID,
    ),
  };
}

export function buildPhase27GateCommands(
  root: string,
  deterministicRunId?: string,
): Phase27GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-27-targeted-regressions",
      cwd: root,
      env: { ...PHASE27_DETERMINISTIC_TEST_ENV },
      args: [
        "bun",
        "test",
        "tests/unit/run-phase-27.script.test.ts",
        "tests/unit/run-phase-27.gate.test.ts",
        "tests/examples/examples.test.ts",
        "tests/release/release.test.ts",
      ],
    },
    {
      label: "phase-27-fallback-eval",
      cwd: root,
      env: { ...PHASE27_DETERMINISTIC_TEST_ENV },
      args: deterministicRunId
        ? [
            "bun",
            "run",
            "eval:phase-27",
            "--run-id",
            deterministicRunId,
          ]
        : ["bun", "run", "eval:phase-27"],
    },
  ];
}

export async function defaultRunPhase27GateCommand(
  command: Phase27GateCommand,
): Promise<Phase27GateCommandResult> {
  const startedAtMs = Date.now();
  const spawnedProcess = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: command.env ? { ...process.env, ...command.env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(spawnedProcess.stdout).text();
  const stderrPromise = new Response(spawnedProcess.stderr).text();
  const [exitCode, stdout, stderr] = await Promise.all([
    spawnedProcess.exited,
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

export function buildPhase27GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase27"}`;
}

async function validateCanonicalPhase27EvalReport(input: {
  expectedMode: "fallback" | "live-memory";
  expectedRunId: string;
  expectedTotalCases: number;
  path: string;
  readTextFile: (path: string) => Promise<string>;
}): Promise<string | undefined> {
  let reportText: string;

  try {
    reportText = await input.readTextFile(input.path);
  } catch {
    return `Canonical Phase 27 ${input.expectedMode} report is missing or unreadable: ${input.path}`;
  }

  let report: {
    metrics?: {
      publicSurfacePurity?: {
        passed?: boolean;
      };
      referenceSetup?: {
        passed?: boolean;
      };
    };
    mode?: string;
    runId?: string;
    summary?: {
      accepted?: boolean;
      totalScenarioCases?: number;
    };
  };
  try {
    report = JSON.parse(reportText) as typeof report;
  } catch {
    return `Canonical Phase 27 ${input.expectedMode} report is not valid JSON: ${input.path}`;
  }

  if (report.mode !== input.expectedMode) {
    return `Canonical Phase 27 ${input.expectedMode} report has the wrong mode: ${input.path}`;
  }

  if (report.runId !== input.expectedRunId) {
    return `Canonical Phase 27 ${input.expectedMode} report has the wrong run id: ${input.path}`;
  }

  if (report.summary?.accepted !== true) {
    return `Canonical Phase 27 ${input.expectedMode} report is not accepted: ${input.path}`;
  }

  if (report.summary?.totalScenarioCases !== input.expectedTotalCases) {
    return `Canonical Phase 27 ${input.expectedMode} report has the wrong case count: ${input.path}`;
  }

  if (input.expectedMode === "fallback") {
    if (report.metrics?.referenceSetup?.passed !== true) {
      return `Canonical Phase 27 fallback report is missing a passing referenceSetup metric: ${input.path}`;
    }
    if (report.metrics?.publicSurfacePurity?.passed !== true) {
      return `Canonical Phase 27 fallback report is missing a passing publicSurfacePurity metric: ${input.path}`;
    }
  }

  return undefined;
}

export async function runPhase27QualityGate(
  input?: Phase27GateOptions,
  dependencies?: Phase27GateDependencies,
): Promise<Phase27GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    (async (path: string) => readFile(path, "utf8"));
  const runCommand = dependencies?.runCommand ?? defaultRunPhase27GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase27GateRunId(generatedAt);
  const outputDir = resolvePhase27RunOutputDir(root, input?.outputDir);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase27GateExecutionResult[] = [];

  const liveArtifactFailure = await validateCanonicalPhase27EvalReport({
    expectedMode: "live-memory",
    expectedRunId: PHASE27_CANONICAL_LIVE_RUN_ID,
    expectedTotalCases: 4,
    path: resolvePhase27CanonicalLiveReportPath(root),
    readTextFile,
  });
  if (liveArtifactFailure) {
    return {
      acceptance: {
        decision: "blocked",
        reason: liveArtifactFailure,
      },
      commands: [],
      evidence: {
        deterministicReport: buildPhase27IgnoredFallbackEvidence(),
      },
      generatedAt,
      generatedBy: GENERATED_BY,
      phase: "phase-27",
      runDirectory,
      runId,
      scope: buildPhase27GateScope(),
    };
  }

  for (const command of buildPhase27GateCommands(
    root,
    PHASE27_CANONICAL_DETERMINISTIC_RUN_ID,
  )) {
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
  const deterministicArtifactFailure = failedCommand
    ? undefined
    : await validateCanonicalPhase27EvalReport({
        expectedMode: "fallback",
        expectedRunId: PHASE27_CANONICAL_DETERMINISTIC_RUN_ID,
        expectedTotalCases: 13,
        path: resolvePhase27CanonicalDeterministicReportPath(root),
        readTextFile,
      });
  const acceptance: Phase27GateReport["acceptance"] = failedCommand
    ? {
        decision: "blocked",
        reason: `Required regression command failed: ${failedCommand.label}`,
      }
    : deterministicArtifactFailure
      ? {
          decision: "blocked",
          reason: deterministicArtifactFailure,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 27 public reference hardening, deterministic adoption evidence, canonical live adoption evidence, and Codex-only host gating are regression-covered and closure-ready.",
        };
  const report: Phase27GateReport = {
    acceptance,
    commands: commandResults,
    evidence: {
      deterministicReport: buildPhase27IgnoredFallbackEvidence(),
    },
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-27",
    runDirectory,
    runId,
    scope: buildPhase27GateScope(),
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-27-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export function parsePhase27GateCliOptions(
  argv: readonly string[],
): Phase27GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase27GateCli(
  dependencies?: Phase27GateCliDependencies,
): Promise<Phase27GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase27QualityGate(options));
  const report = await runGate(parsePhase27GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase27GateCli();
}
