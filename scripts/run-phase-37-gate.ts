import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase37GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase37GateCommandOptions {
  deterministicRunId?: string;
  externalRunId?: string;
  liveRunId?: string;
  phase35GateRunId?: string;
  phase36GateRunId?: string;
}

export interface Phase37GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase37GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase37GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase37GateExecutionResult[];
  evidence: {
    deterministicReport: {
      artifactKind: "ignored_generated";
      ignoredReportPath: string;
      reason: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    externalConsumer: {
      reason: string;
      reportPath: string;
      status: "accepted" | "blocked";
    };
    liveMemory: {
      reason: string;
      reportPath: string;
      runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback";
      status: "accepted" | "blocked";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-37-gate.ts";
  phase: "phase-37";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase37GateOptions {
  externalReportPath?: string;
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase37GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase37GateCommand) => Promise<Phase37GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase37GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase37GateOptions) => Promise<Phase37GateReport>;
}

interface ValidatedPhase37DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  generatedBy: "scripts/run-phase-37-eval.ts";
  mode: "fallback";
  phase: "phase-37";
  summary: {
    acceptedCaseCount: number;
    blockedAssistantCount: number;
    dedupePassCount: number;
    durableWriteCount: number;
    nextSessionRecallPassCount: number;
    privacyMaskPassCount: number;
    rawTranscriptRejectedPassCount: number;
    totalCases: number;
  };
}

interface ValidatedPhase37LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  evidence: {
    assistantUnconfirmedWritesBlocked: boolean;
    durableStorageProvider: "sqlite";
    manualSeedUsed: boolean;
    nextSessionRecallHit: boolean;
    providerBackedAssistedExtraction: boolean;
    rawTranscriptPersisted: boolean;
    resolvedExtractionStrategies?: string[];
    wroteDurableMemory: boolean;
    writebackMode: "selective";
  };
  evidenceContract: {
    phase37: {
      runner: "scripts/run-phase-37-live-memory.ts";
      runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback";
    };
  };
  generatedBy: "scripts/run-phase-37-live-memory.ts";
  mode: "live-memory";
  phase: "phase-37";
}

interface ValidatedPhase37ExternalConsumerReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  evidence: {
    installedPackageUsed: boolean;
    manualSeedUsed: boolean;
    nextSessionRecallHit: boolean;
    rawTranscriptPersisted: boolean;
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
  generatedBy: "scripts/run-phase-37-external-consumer.ts";
  mode: "external-consumer";
  phase: "phase-37";
}

const GENERATED_BY = "scripts/run-phase-37-gate.ts";
const PHASE37_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260424101045";
const PHASE37_CANONICAL_LIVE_RUN_ID = "run-phase37-live-current";
const PHASE37_CANONICAL_EXTERNAL_RUN_ID = "run-phase37-external-consumer";
const PHASE37_IN_SCOPE = [
  "installed-host selective writeback for Codex first, with Claude CLI parity",
  "opt-in off, observe, and selective managed writeback config",
  "public remember-surface writes with assistant confirmation or verification policy",
  "no raw transcript persistence, remember-never masking, dedupe, and next-session recall evidence",
  "provider-backed assisted-extraction live-memory and external consumer package smoke evidence",
] as const;
const PHASE37_OUT_OF_SCOPE = [
  "default-on automatic writeback",
  "full transcript archive",
  "dashboard or managed cloud",
  "OneLife built-in preset",
  "recall router reopening",
  "Claude provider-backed live blocker",
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

function resolveMaybeRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

function isTimestampRunId(runId: string): boolean {
  return /^run-\d{14}$/u.test(runId);
}

function buildPhase37DeterministicRegenerateCommand(runId: string): string {
  return `bun run eval:phase-37 --run-id ${runId}`;
}

function isReportPathUnder(root: string, reportPath: string, outputDir: string): boolean {
  const relativePath = relative(
    resolveMaybeRelativePath(root, outputDir),
    resolveMaybeRelativePath(root, reportPath),
  ).replaceAll("\\", "/");

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("../") &&
    relativePath.endsWith("/report.json")
  );
}

function toExecutionResult(
  command: Phase37GateCommand,
  result: Phase37GateCommandResult,
): Phase37GateExecutionResult {
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
  command: Phase37GateCommand,
): Promise<Phase37GateCommandResult> {
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

export function resolvePhase37GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-37");
}

export function resolvePhase37CanonicalDeterministicReportPath(root: string): string {
  return resolvePhase37DeterministicReportPath(
    root,
    PHASE37_CANONICAL_DETERMINISTIC_RUN_ID,
  );
}

function resolvePhase37DeterministicReportPath(
  root: string,
  runId: string,
): string {
  return join(
    root,
    "reports/eval/fallback/phase-37",
    runId,
    "report.json",
  );
}

export function resolvePhase37CanonicalLiveReportPath(root: string): string {
  return resolvePhase37LiveReportPath(root, PHASE37_CANONICAL_LIVE_RUN_ID);
}

function resolvePhase37LiveReportPath(root: string, runId: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-37",
    runId,
    "report.json",
  );
}

export function resolvePhase37CanonicalExternalConsumerReportPath(root: string): string {
  return resolvePhase37ExternalConsumerReportPath(
    root,
    PHASE37_CANONICAL_EXTERNAL_RUN_ID,
  );
}

function resolvePhase37ExternalConsumerReportPath(
  root: string,
  runId: string,
): string {
  return join(
    root,
    "reports/eval/live-memory/phase-37",
    runId,
    "report.json",
  );
}

export function buildPhase37GateRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase37gate"}`;
}

export function parsePhase37GateCliOptions(
  argv: readonly string[],
): Phase37GateOptions {
  return {
    externalReportPath: resolveCliFlagValue(argv, "--external-report-path"),
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function withRunId(args: string[], runId: string | undefined): string[] {
  return runId ? [...args, "--run-id", runId] : args;
}

export function buildPhase37GateCommands(
  root: string,
  options: Phase37GateCommandOptions = {},
): Phase37GateCommand[] {
  const deterministicRunId =
    options.deterministicRunId ?? PHASE37_CANONICAL_DETERMINISTIC_RUN_ID;

  return [
    {
      args: ["bun", "run", "typecheck"],
      cwd: root,
      label: "typecheck",
    },
    {
      args: [
        "bun",
        "test",
        "tests/unit/host-writeback-runtime.test.ts",
        "tests/unit/host-writeback-config.test.ts",
        "tests/unit/host-hook-runtime.test.ts",
        "tests/unit/host-install.test.ts",
        "tests/integration/installed-host-writeback.test.ts",
        "tests/unit/run-phase-37.script.test.ts",
        "tests/unit/run-phase-37.live-memory.test.ts",
        "tests/unit/run-phase-37.external-consumer.test.ts",
        "tests/unit/run-phase-37.gate.test.ts",
        "tests/cli/cli.test.ts",
        "tests/release/release.test.ts",
      ],
      cwd: root,
      label: "phase-37-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-37",
        "--run-id",
        deterministicRunId,
      ],
      cwd: root,
      label: "phase-37-fallback-eval",
    },
    {
      args: withRunId(
        ["bun", "run", "eval:phase-37-live-memory"],
        options.liveRunId,
      ),
      cwd: root,
      label: "phase-37-live-memory",
    },
    {
      args: withRunId(
        ["bun", "run", "eval:phase-37-external-consumer"],
        options.externalRunId,
      ),
      cwd: root,
      label: "phase-37-external-consumer",
    },
    {
      args: withRunId(
        ["bun", "run", "gate:phase-35"],
        options.phase35GateRunId,
      ),
      cwd: root,
      label: "phase-35-regression-gate",
    },
    {
      args: withRunId(
        ["bun", "run", "gate:phase-36"],
        options.phase36GateRunId,
      ),
      cwd: root,
      label: "phase-36-regression-gate",
    },
  ];
}

function validatePhase37DeterministicReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase37DeterministicReport {
  const parsed = JSON.parse(content) as ValidatedPhase37DeterministicReport;
  if (parsed.phase !== "phase-37" || parsed.mode !== "fallback") {
    throw new Error("Phase 37 deterministic report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-37-eval.ts") {
    throw new Error("Phase 37 deterministic report was not generated by the canonical runner.");
  }
  if (!isReportPathUnder(root, reportPath, join(root, "reports/eval/fallback/phase-37"))) {
    throw new Error("Phase 37 deterministic report path is outside the phase output directory.");
  }

  return parsed;
}

function validatePhase37LiveReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase37LiveReport {
  const parsed = JSON.parse(content) as ValidatedPhase37LiveReport;
  if (parsed.phase !== "phase-37" || parsed.mode !== "live-memory") {
    throw new Error("Phase 37 live-memory report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-37-live-memory.ts") {
    throw new Error("Phase 37 live-memory report was not generated by the canonical runner.");
  }
  if (!isReportPathUnder(root, reportPath, join(root, "reports/eval/live-memory/phase-37"))) {
    throw new Error("Phase 37 live-memory report path is outside the phase output directory.");
  }

  return parsed;
}

function validatePhase37ExternalConsumerReport(
  root: string,
  reportPath: string,
  content: string,
): ValidatedPhase37ExternalConsumerReport {
  const parsed = JSON.parse(content) as ValidatedPhase37ExternalConsumerReport;
  if (parsed.phase !== "phase-37" || parsed.mode !== "external-consumer") {
    throw new Error("Phase 37 external consumer report has an unexpected phase or mode.");
  }
  if (parsed.generatedBy !== "scripts/run-phase-37-external-consumer.ts") {
    throw new Error("Phase 37 external consumer report was not generated by the canonical runner.");
  }
  if (!isReportPathUnder(root, reportPath, join(root, "reports/eval/live-memory/phase-37"))) {
    throw new Error("Phase 37 external consumer report path is outside the phase output directory.");
  }

  return parsed;
}

function buildBlockedReport(input: {
  commands: Phase37GateExecutionResult[];
  deterministicReportPath: string;
  deterministicRunId: string;
  externalReportPath: string;
  liveReportPath: string;
  reason: string;
  root: string;
  runDirectory: string;
  runId: string;
  timestamp: string;
}): Phase37GateReport {
  return {
    acceptance: {
      decision: "blocked",
      reason: input.reason,
    },
    commands: input.commands,
    evidence: {
      deterministicReport: {
        artifactKind: "ignored_generated",
        ignoredReportPath: toRepoRelativePath(input.root, input.deterministicReportPath),
        reason: input.reason,
        regenerateCommand: buildPhase37DeterministicRegenerateCommand(input.deterministicRunId),
        status: "blocked",
      },
      externalConsumer: {
        reason: input.reason,
        reportPath: toRepoRelativePath(input.root, input.externalReportPath),
        status: "blocked",
      },
      liveMemory: {
        reason: input.reason,
        reportPath: toRepoRelativePath(input.root, input.liveReportPath),
        runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback",
        status: "blocked",
      },
    },
    generatedAt: input.timestamp,
    generatedBy: GENERATED_BY,
    phase: "phase-37",
    runDirectory: input.runDirectory,
    runId: input.runId,
    scope: {
      inScope: [...PHASE37_IN_SCOPE],
      outOfScope: [...PHASE37_OUT_OF_SCOPE],
    },
  };
}

export async function runPhase37QualityGate(
  options: Phase37GateOptions = {},
  dependencies: Phase37GateDependencies = {},
): Promise<Phase37GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase37GateOutputDir(root);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const freshRunId = buildPhase37GateRunId(timestamp);
  const runId = options.runId ?? freshRunId;
  const usesRunScopedEvidence =
    options.runId === undefined || isTimestampRunId(runId);
  const deterministicRunId = usesRunScopedEvidence
    ? runId
    : PHASE37_CANONICAL_DETERMINISTIC_RUN_ID;
  const liveRunId = usesRunScopedEvidence ? runId : PHASE37_CANONICAL_LIVE_RUN_ID;
  const externalRunId = usesRunScopedEvidence
    ? `${runId}-external-consumer`
    : PHASE37_CANONICAL_EXTERNAL_RUN_ID;
  const phase35GateRunId = usesRunScopedEvidence ? runId : undefined;
  const phase36GateRunId = usesRunScopedEvidence ? runId : undefined;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand = dependencies.runCommand ?? defaultRunCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const commands: Phase37GateExecutionResult[] = [];
  const deterministicReportPath = resolvePhase37DeterministicReportPath(
    root,
    deterministicRunId,
  );
  const liveReportPath = options.liveReportPath
    ? resolveMaybeRelativePath(root, options.liveReportPath)
    : resolvePhase37LiveReportPath(root, liveRunId);
  const externalReportPath = options.externalReportPath
    ? resolveMaybeRelativePath(root, options.externalReportPath)
    : resolvePhase37ExternalConsumerReportPath(root, externalRunId);

  for (const command of buildPhase37GateCommands(root, {
    deterministicRunId,
    externalRunId,
    liveRunId,
    phase35GateRunId,
    phase36GateRunId,
  })) {
    const result = await runCommand(command);
    commands.push(toExecutionResult(command, result));
    if (result.exitCode !== 0) {
      const blocked = buildBlockedReport({
        commands,
        deterministicReportPath,
        deterministicRunId,
        externalReportPath,
        liveReportPath,
        reason: `Required Phase 37 command failed: ${command.label}.`,
        root,
        runDirectory,
        runId,
        timestamp,
      });
      await ensureDir(runDirectory, { recursive: true });
      await writeTextFile(
        join(runDirectory, "phase-37-quality-gate.json"),
        JSON.stringify(blocked, null, 2) + "\n",
      );
      return blocked;
    }
  }

  let deterministic: ValidatedPhase37DeterministicReport;
  let live: ValidatedPhase37LiveReport;
  let external: ValidatedPhase37ExternalConsumerReport;
  try {
    deterministic = validatePhase37DeterministicReport(
      root,
      deterministicReportPath,
      await readTextFile(deterministicReportPath),
    );
    live = validatePhase37LiveReport(
      root,
      liveReportPath,
      await readTextFile(liveReportPath),
    );
    external = validatePhase37ExternalConsumerReport(
      root,
      externalReportPath,
      await readTextFile(externalReportPath),
    );
  } catch (error) {
    const blocked = buildBlockedReport({
      commands,
      deterministicReportPath,
      deterministicRunId,
      externalReportPath,
      liveReportPath,
      reason: error instanceof Error
        ? error.message
        : "Phase 37 canonical evidence could not be validated.",
      root,
      runDirectory,
      runId,
      timestamp,
    });
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "phase-37-quality-gate.json"),
      JSON.stringify(blocked, null, 2) + "\n",
    );
    return blocked;
  }

  const deterministicAccepted =
    deterministic.acceptance.decision === "accepted" &&
    deterministic.summary.acceptedCaseCount === 8 &&
    deterministic.summary.totalCases === 8 &&
    deterministic.summary.durableWriteCount === 5 &&
    deterministic.summary.blockedAssistantCount >= 1 &&
    deterministic.summary.privacyMaskPassCount >= 2 &&
    deterministic.summary.dedupePassCount === 1 &&
    deterministic.summary.nextSessionRecallPassCount === 1 &&
    deterministic.summary.rawTranscriptRejectedPassCount === 1;
  const liveAccepted =
    live.acceptance.decision === "accepted" &&
    live.evidence.providerBackedAssistedExtraction &&
    live.evidence.durableStorageProvider === "sqlite" &&
    live.evidence.resolvedExtractionStrategies?.includes("llm-assisted") === true &&
    live.evidence.manualSeedUsed === false &&
    live.evidence.wroteDurableMemory &&
    live.evidence.nextSessionRecallHit &&
    live.evidence.rawTranscriptPersisted === false &&
    live.evidence.assistantUnconfirmedWritesBlocked &&
    live.evidence.writebackMode === "selective" &&
    live.evidenceContract.phase37.runner === "scripts/run-phase-37-live-memory.ts" &&
    live.evidenceContract.phase37.runtimePath ===
      "provider_backed_assisted_extraction_installed_host_selective_writeback";
  const externalAccepted =
    external.acceptance.decision === "accepted" &&
    external.evidence.installedPackageUsed &&
    external.evidence.manualSeedUsed === false &&
    external.evidence.wroteDurableMemory &&
    external.evidence.nextSessionRecallHit &&
    external.evidence.rawTranscriptPersisted === false &&
    external.evidence.writebackMode === "selective" &&
    external.evidenceContract.phase37.packageBoundary ===
      "external_consumer_installed_package" &&
    external.evidenceContract.phase37.runner ===
      "scripts/run-phase-37-external-consumer.ts";
  const accepted = deterministicAccepted && liveAccepted && externalAccepted;
  const report: Phase37GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 37 deterministic, provider-backed assisted-extraction live-memory, external consumer, and Phase 35/36 regression gates all passed."
        : "Phase 37 deterministic, live-memory, or external consumer evidence did not satisfy the canonical gate.",
    },
    commands,
    evidence: {
      deterministicReport: {
        artifactKind: "ignored_generated",
        ignoredReportPath: toRepoRelativePath(root, deterministicReportPath),
        reason: deterministicAccepted
          ? "Deterministic installed-host selective writeback eval passed every Phase 37 case."
          : "Deterministic installed-host selective writeback eval did not pass every required case.",
        regenerateCommand: buildPhase37DeterministicRegenerateCommand(deterministicRunId),
        status: deterministicAccepted ? "accepted" : "blocked",
      },
      externalConsumer: {
        reason: externalAccepted
          ? "External consumer tarball smoke proved installed package writeback and recall."
          : "External consumer tarball smoke did not prove installed package writeback and recall.",
        reportPath: toRepoRelativePath(root, externalReportPath),
        status: externalAccepted ? "accepted" : "blocked",
      },
      liveMemory: {
        reason: liveAccepted
          ? "Provider-backed assisted-extraction live-memory smoke proved installed Codex selective writeback and next-session recall."
          : "Provider-backed assisted-extraction live-memory smoke did not prove installed Codex selective writeback and next-session recall.",
        reportPath: toRepoRelativePath(root, liveReportPath),
        runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback",
        status: liveAccepted ? "accepted" : "blocked",
      },
    },
    generatedAt: timestamp,
    generatedBy: GENERATED_BY,
    phase: "phase-37",
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE37_IN_SCOPE],
      outOfScope: [...PHASE37_OUT_OF_SCOPE],
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-37-quality-gate.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

export async function runPhase37GateCli(
  dependencies: Phase37GateCliDependencies = {},
): Promise<Phase37GateReport> {
  const argv = dependencies.argv ?? process.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runGate =
    dependencies.runGate ??
    ((options?: Phase37GateOptions) => runPhase37QualityGate(options));
  const report = await runGate(parsePhase37GateCliOptions(argv));

  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);

  return report;
}

if (import.meta.main) {
  await runPhase37GateCli();
}
