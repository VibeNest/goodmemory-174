import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase32GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase32GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase32GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase32DeterministicReportEvidence {
  reason: string;
  reportPath: string;
  status: "accepted" | "blocked";
}

export interface Phase32LiveExternalHostEvidence {
  hostKind: "codex";
  liveReportPath: string;
  reason: string;
  status: "accepted" | "blocked";
  traceBacked: boolean;
}

export interface Phase32GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase32GateExecutionResult[];
  evidence: {
    deterministicReport: Phase32DeterministicReportEvidence;
    liveExternalHost: Phase32LiveExternalHostEvidence;
  };
  generatedAt: string;
  generatedBy: string;
  phase: "phase-32";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase32GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase32LiveReportContract {
  canonicalLiveReportPath: string;
  expectedGeneratedBy: string;
  expectedOutputDir: string;
  expectedRunDirectory: string;
  expectedRunId: string;
}

export interface Phase32GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase32GateCommand) => Promise<Phase32GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase32GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase32GateOptions) => Promise<Phase32GateReport>;
}

interface ValidatedPhase32DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  cases: Array<{
    eventBacked: {
      score: number;
    };
    noMemory: {
      score: number;
    };
    textOnly: {
      score: number;
    };
  }>;
  generatedBy: "scripts/run-phase-32-eval.ts";
  mode: "fallback";
  phase: "phase-32";
  runId: string;
  summary: {
    eventBackedAverageScore: number;
    eventBackedClearWinCount: number;
    eventBackedNonRegressionPassCount: number;
    noMemoryAverageScore: number;
    textOnlyAverageScore: number;
    totalCases: number;
  };
}

interface ValidatedPhase32LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  comparison: {
    baselines: {
      noMemory: "no-memory";
      textOnly: "frozen-pre-phase31-public-text-only";
    };
    cases: Array<{
      caseId: string;
      eventBacked: ValidatedPhase32MeasuredLiveVariant;
      nonRegressionAgainstTextOnly: boolean;
      noMemory: ValidatedPhase32MeasuredLiveVariant;
      textOnly: ValidatedPhase32MeasuredLiveVariant;
      winOverNoMemory: boolean;
    }>;
  };
  evidence: {
    host: {
      exportedArtifactPaths: string[];
      installedPackageBootstrap: boolean;
      kind: "codex";
      manifestPath: string;
      traceBacked: boolean;
    };
  };
  evidenceContract: {
    phase32: {
      hostEventTransport: "native_host_events";
      packageBoundary: "installed_package_public_imports";
      runner: string;
    };
  };
  generatedBy: string;
  mode: "live-external-host";
  outputDir: string;
  phase: "phase-32";
  runDirectory: string;
  runId: string;
}

interface ValidatedPhase32MeasuredLiveVariant {
  artifactReadCommands: string[];
  hostExitCode: number;
  matchedExpectedFieldCount: number;
  observedResponse: Record<string, string>;
  traceBacked: boolean;
  traceEventCount: number;
}

const GENERATED_BY = "scripts/run-phase-32-gate.ts";
const PHASE32_CANONICAL_DETERMINISTIC_RUN_ID = "run-20260422173045";
const PHASE32_CANONICAL_LIVE_RUN_ID = "run-phase32-live-current";
const PHASE32_LIVE_EXTERNAL_HOST_GENERATED_BY =
  "scripts/run-phase-32-live-memory.ts";
const PHASE32_REQUIRED_LIVE_CASE_IDS = [
  "continuity-open-loop",
  "repeated-correction",
  "procedure-adherence",
] as const;
const PHASE32_EXPECTED_RESPONSE = {
  currentGoal: "Finish the bootstrap smoke path",
  openLoop: "Verify exported session handoff",
} as const;
const PHASE32_SUMMARY_RULE =
  "Keep coding summaries short and list explicit next steps.";
const PHASE32_BOOTSTRAP_RULE = "Use packaged CLI bootstrap only.";
const PHASE32_BLOCKER = "the deploy is blocked on smoke verification.";
const PHASE32_MEMORY_ARTIFACT_PATH = ".goodmemory/hosts/codex/MEMORY.md";
const PHASE32_SESSION_MEMORY_ARTIFACT_PATH =
  ".goodmemory/hosts/codex/session-memory/current.md";
const PHASE32_LIVE_CASE_EXPECTATIONS = {
  "continuity-open-loop": { ...PHASE32_EXPECTED_RESPONSE },
  "procedure-adherence": {
    blocker: PHASE32_BLOCKER,
    bootstrapRule: PHASE32_BOOTSTRAP_RULE,
  },
  "repeated-correction": {
    summaryRule: PHASE32_SUMMARY_RULE,
  },
} as const satisfies Record<
  (typeof PHASE32_REQUIRED_LIVE_CASE_IDS)[number],
  Record<string, string>
>;
const PHASE32_LIVE_CASE_REQUIRED_ARTIFACT_PATHS = {
  "continuity-open-loop": [PHASE32_SESSION_MEMORY_ARTIFACT_PATH],
  "procedure-adherence": [
    PHASE32_MEMORY_ARTIFACT_PATH,
    PHASE32_SESSION_MEMORY_ARTIFACT_PATH,
  ],
  "repeated-correction": [PHASE32_MEMORY_ARTIFACT_PATH],
} as const satisfies Record<
  (typeof PHASE32_REQUIRED_LIVE_CASE_IDS)[number],
  readonly string[]
>;
const PHASE32_IN_SCOPE = [
  "phase-32 deterministic coding-agent eval against the frozen text-only and no-memory baselines",
  "installed-package bootstrap and package-boundary regression coverage for Codex and Claude Code",
  "one canonical trace-backed Codex external-host evidence chain on the installed-package path",
  "phase-32 quality-gate report generation and fail-closed closure validation",
] as const;
const PHASE32_OUT_OF_SCOPE = [
  "reopening the root public API boundary",
  "making Claude a second live gate blocker",
  "claiming phase-32 is accepted without one canonical Codex external-host report",
  "new memory capability work beyond the accepted external coding-agent line",
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

function resolveMaybeRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

function pathsMatch(root: string, left: string, right: string): boolean {
  return resolveMaybeRelativePath(root, left) === resolveMaybeRelativePath(root, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function countMatchedExpectedFields(
  observed: Record<string, string>,
  expected: Record<string, string>,
): number {
  return Object.entries(expected).reduce(
    (count, [key, value]) => count + (observed[key] === value ? 1 : 0),
    0,
  );
}

function provesRequiredArtifactReads(
  artifactReadCommands: readonly string[],
  requiredArtifactPaths: readonly string[],
): boolean {
  return requiredArtifactPaths.every((artifactPath) =>
    artifactReadCommands.some((command) => command.includes(artifactPath))
  );
}

function assertMeasuredLiveVariant(
  value: unknown,
  label: string,
): ValidatedPhase32MeasuredLiveVariant {
  if (!isRecord(value)) {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing measured ${label} evidence.`,
    );
  }
  if (!isStringArray(value.artifactReadCommands)) {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing measured ${label} artifact reads.`,
    );
  }
  if (typeof value.hostExitCode !== "number") {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing the measured ${label} host exit code.`,
    );
  }
  if (
    typeof value.matchedExpectedFieldCount !== "number" ||
    value.matchedExpectedFieldCount < 0
  ) {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing the measured ${label} field-match count.`,
    );
  }
  if (!isStringRecord(value.observedResponse)) {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing the measured ${label} observed response.`,
    );
  }
  if (typeof value.traceBacked !== "boolean") {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing the measured ${label} trace-backed flag.`,
    );
  }
  if (typeof value.traceEventCount !== "number") {
    throw new Error(
      `Canonical Phase 32 live external-host report is missing the measured ${label} trace event count.`,
    );
  }

  return {
    artifactReadCommands: value.artifactReadCommands,
    hostExitCode: value.hostExitCode,
    matchedExpectedFieldCount: value.matchedExpectedFieldCount,
    observedResponse: value.observedResponse,
    traceBacked: value.traceBacked,
    traceEventCount: value.traceEventCount,
  };
}

function assertPhase32DeterministicReport(
  value: string,
): ValidatedPhase32DeterministicReport {
  const report = JSON.parse(value) as Partial<ValidatedPhase32DeterministicReport>;

  if (report.phase !== "phase-32") {
    throw new Error("Canonical Phase 32 deterministic report has the wrong phase.");
  }
  if (report.generatedBy !== "scripts/run-phase-32-eval.ts") {
    throw new Error(
      "Canonical Phase 32 deterministic report has the wrong generatedBy field.",
    );
  }
  if (report.mode !== "fallback") {
    throw new Error("Canonical Phase 32 deterministic report has the wrong mode.");
  }
  if (report.runId !== PHASE32_CANONICAL_DETERMINISTIC_RUN_ID) {
    throw new Error("Canonical Phase 32 deterministic report has the wrong run id.");
  }
  if (report.acceptance?.decision !== "accepted") {
    throw new Error("Canonical Phase 32 deterministic report is not accepted.");
  }
  if (!Array.isArray(report.cases) || report.cases.length !== 3) {
    throw new Error("Canonical Phase 32 deterministic report must contain three cases.");
  }
  if (!report.summary) {
    throw new Error("Canonical Phase 32 deterministic report is missing its summary.");
  }
  if (report.summary.totalCases !== 3) {
    throw new Error("Canonical Phase 32 deterministic report has the wrong totalCases.");
  }
  if (report.summary.eventBackedNonRegressionPassCount !== 3) {
    throw new Error(
      "Canonical Phase 32 deterministic report does not prove non-regression versus text-only.",
    );
  }
  if (report.summary.eventBackedClearWinCount < 2) {
    throw new Error(
      "Canonical Phase 32 deterministic report does not show a clear win count over no-memory.",
    );
  }
  if (
    report.summary.eventBackedAverageScore <= report.summary.textOnlyAverageScore ||
    report.summary.eventBackedAverageScore <= report.summary.noMemoryAverageScore
  ) {
    throw new Error(
      "Canonical Phase 32 deterministic report does not prove the required dual-baseline ordering.",
    );
  }
  for (const caseResult of report.cases) {
    if (
      caseResult.eventBacked.score <= caseResult.textOnly.score ||
      caseResult.eventBacked.score <= caseResult.noMemory.score
    ) {
      throw new Error(
        "Canonical Phase 32 deterministic report contains a case that does not beat the frozen text-only and no-memory baselines.",
      );
    }
  }

  return report as ValidatedPhase32DeterministicReport;
}

function assertPhase32LiveReport(
  value: string,
): ValidatedPhase32LiveReport {
  const report = JSON.parse(value) as Partial<ValidatedPhase32LiveReport>;

  if (report.mode !== "live-external-host") {
    throw new Error("Canonical Phase 32 live external-host report has the wrong mode.");
  }
  if (report.phase !== "phase-32") {
    throw new Error("Canonical Phase 32 live external-host report has the wrong phase.");
  }
  if (typeof report.generatedBy !== "string") {
    throw new Error("Canonical Phase 32 live external-host report is missing generatedBy.");
  }
  if (typeof report.outputDir !== "string") {
    throw new Error("Canonical Phase 32 live external-host report is missing outputDir.");
  }
  if (typeof report.runDirectory !== "string") {
    throw new Error("Canonical Phase 32 live external-host report is missing runDirectory.");
  }
  if (report.runId !== PHASE32_CANONICAL_LIVE_RUN_ID) {
    throw new Error("Canonical Phase 32 live external-host report has the wrong run id.");
  }
  if (report.acceptance?.decision !== "accepted") {
    throw new Error("Canonical Phase 32 live external-host report is not accepted.");
  }
  if (!isRecord(report.evidence) || !isRecord(report.evidence.host)) {
    throw new Error("Canonical Phase 32 live external-host report is missing host evidence.");
  }
  if (report.evidence.host.kind !== "codex") {
    throw new Error("Canonical Phase 32 live external-host report must target Codex.");
  }
  if (report.evidence.host.installedPackageBootstrap !== true) {
    throw new Error(
      "Canonical Phase 32 live external-host report does not prove installed-package bootstrap.",
    );
  }
  if (report.evidence.host.traceBacked !== true) {
    throw new Error(
      "Canonical Phase 32 live external-host report does not prove trace-backed host evidence.",
    );
  }
  if (
    !Array.isArray(report.evidence.host.exportedArtifactPaths) ||
    !report.evidence.host.exportedArtifactPaths.includes(
      ".goodmemory/hosts/codex/MEMORY.md",
    ) ||
    !report.evidence.host.exportedArtifactPaths.includes(
      ".goodmemory/hosts/codex/session-memory/current.md",
    )
  ) {
    throw new Error(
      "Canonical Phase 32 live external-host report does not include the manifest-declared Codex host artifacts.",
    );
  }
  if (report.evidence.host.manifestPath !== ".goodmemory/hosts/codex/export-manifest.json") {
    throw new Error(
      "Canonical Phase 32 live external-host report does not include the canonical Codex export-manifest path.",
    );
  }
  if (!isRecord(report.evidenceContract) || !isRecord(report.evidenceContract.phase32)) {
    throw new Error(
      "Canonical Phase 32 live external-host report is missing the Phase 32 evidence contract.",
    );
  }
  if (report.evidenceContract.phase32.hostEventTransport !== "native_host_events") {
    throw new Error(
      "Canonical Phase 32 live external-host report does not prove native host event transport.",
    );
  }
  if (
    report.evidenceContract.phase32.packageBoundary !==
    "installed_package_public_imports"
  ) {
    throw new Error(
      "Canonical Phase 32 live external-host report does not prove the installed-package public boundary.",
    );
  }
  if (typeof report.evidenceContract.phase32.runner !== "string") {
    throw new Error(
      "Canonical Phase 32 live external-host report evidence contract is missing the runner.",
    );
  }
  if (!isRecord(report.comparison) || !isRecord(report.comparison.baselines)) {
    throw new Error(
      "Canonical Phase 32 live external-host report is missing live comparison evidence.",
    );
  }
  if (
    report.comparison.baselines.textOnly !== "frozen-pre-phase31-public-text-only" ||
    report.comparison.baselines.noMemory !== "no-memory"
  ) {
    throw new Error(
      "Canonical Phase 32 live external-host report does not use the required frozen dual baselines.",
    );
  }
  if (!Array.isArray(report.comparison.cases)) {
    throw new Error(
      "Canonical Phase 32 live external-host report is missing live comparison cases.",
    );
  }
  const remainingCaseIds = new Set<string>(PHASE32_REQUIRED_LIVE_CASE_IDS);
  for (const caseResult of report.comparison.cases) {
    if (!isRecord(caseResult) || typeof caseResult.caseId !== "string") {
      throw new Error(
        "Canonical Phase 32 live external-host report contains an invalid comparison case.",
      );
    }
    if (!PHASE32_REQUIRED_LIVE_CASE_IDS.includes(caseResult.caseId as never)) {
      throw new Error(
        "Canonical Phase 32 live external-host report contains an unexpected comparison case.",
      );
    }
    remainingCaseIds.delete(caseResult.caseId);
    const expected = PHASE32_LIVE_CASE_EXPECTATIONS[
      caseResult.caseId as keyof typeof PHASE32_LIVE_CASE_EXPECTATIONS
    ];
    const requiredArtifactPaths = PHASE32_LIVE_CASE_REQUIRED_ARTIFACT_PATHS[
      caseResult.caseId as keyof typeof PHASE32_LIVE_CASE_REQUIRED_ARTIFACT_PATHS
    ];
    const eventBacked = assertMeasuredLiveVariant(
      caseResult.eventBacked,
      `${caseResult.caseId} event-backed`,
    );
    const textOnly = assertMeasuredLiveVariant(
      caseResult.textOnly,
      `${caseResult.caseId} text-only`,
    );
    const noMemory = assertMeasuredLiveVariant(
      caseResult.noMemory,
      `${caseResult.caseId} no-memory`,
    );
    const eventBackedMatchedCount = countMatchedExpectedFields(
      eventBacked.observedResponse,
      expected,
    );
    const textOnlyMatchedCount = countMatchedExpectedFields(
      textOnly.observedResponse,
      expected,
    );
    const noMemoryMatchedCount = countMatchedExpectedFields(
      noMemory.observedResponse,
      expected,
    );
    if (
      eventBacked.matchedExpectedFieldCount !== eventBackedMatchedCount ||
      textOnly.matchedExpectedFieldCount !== textOnlyMatchedCount ||
      noMemory.matchedExpectedFieldCount !== noMemoryMatchedCount
    ) {
      throw new Error(
        "Canonical Phase 32 live external-host report contains measured field-match counts that do not match the observed responses.",
      );
    }
    const eventBackedTraceBacked =
      eventBacked.traceBacked &&
      provesRequiredArtifactReads(
        eventBacked.artifactReadCommands,
        requiredArtifactPaths,
      );
    const textOnlyTraceBacked =
      textOnly.traceBacked &&
      provesRequiredArtifactReads(
        textOnly.artifactReadCommands,
        requiredArtifactPaths,
      );
    const noMemoryTraceBacked =
      noMemory.traceBacked &&
      provesRequiredArtifactReads(
        noMemory.artifactReadCommands,
        requiredArtifactPaths,
      );
    const preservesNonRegression =
      eventBacked.hostExitCode === 0 &&
      textOnly.hostExitCode === 0 &&
      eventBackedTraceBacked &&
      textOnlyTraceBacked &&
      eventBackedMatchedCount >= textOnlyMatchedCount;
    const preservesWinOverNoMemory =
      eventBacked.hostExitCode === 0 &&
      noMemory.hostExitCode === 0 &&
      eventBackedTraceBacked &&
      noMemoryTraceBacked &&
      eventBackedMatchedCount > noMemoryMatchedCount;
    if (
      caseResult.nonRegressionAgainstTextOnly !== preservesNonRegression ||
      caseResult.winOverNoMemory !== preservesWinOverNoMemory ||
      !preservesNonRegression ||
      !preservesWinOverNoMemory
    ) {
      throw new Error(
        "Canonical Phase 32 live external-host report does not preserve the required dual-baseline comparison semantics.",
      );
    }
  }
  if (remainingCaseIds.size > 0) {
    throw new Error(
      "Canonical Phase 32 live external-host report does not preserve the required dual-baseline comparison semantics.",
    );
  }

  return report as ValidatedPhase32LiveReport;
}

export function resolvePhase32GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-32");
}

export function resolvePhase32CanonicalDeterministicReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-32",
    PHASE32_CANONICAL_DETERMINISTIC_RUN_ID,
    "report.json",
  );
}

export function resolvePhase32CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-32",
    PHASE32_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase32GateRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase32"}`;
}

export function buildPhase32LiveReportContract(
  root: string,
): Phase32LiveReportContract {
  const expectedOutputDir = join(root, "reports/eval/live-memory/phase-32");
  const expectedRunDirectory = join(expectedOutputDir, PHASE32_CANONICAL_LIVE_RUN_ID);

  return {
    canonicalLiveReportPath: join(expectedRunDirectory, "report.json"),
    expectedGeneratedBy: PHASE32_LIVE_EXTERNAL_HOST_GENERATED_BY,
    expectedOutputDir,
    expectedRunDirectory,
    expectedRunId: PHASE32_CANONICAL_LIVE_RUN_ID,
  };
}

export function buildPhase32GateScope(): Phase32GateReport["scope"] {
  return {
    inScope: [...PHASE32_IN_SCOPE],
    outOfScope: [...PHASE32_OUT_OF_SCOPE],
  };
}

export function buildPhase32GateCommands(root: string): Phase32GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-32-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/context-builder.outputs.test.ts",
        "tests/unit/recall.evidence.test.ts",
        "tests/unit/run-phase-32.script.test.ts",
        "tests/unit/run-phase-32.gate.test.ts",
        "tests/unit/run-phase-32.live-memory.test.ts",
        "tests/integration/agent-events.ingestion.test.ts",
        "tests/eval/phase32.external-coding-agent.test.ts",
        "tests/cli/cli.test.ts",
        "tests/release/release.test.ts",
      ],
    },
    {
      label: "phase-32-fallback-eval",
      cwd: root,
      args: ["bun", "run", "eval:phase-32"],
    },
  ];
}

export function parsePhase32GateCliOptions(
  argv: readonly string[],
): Phase32GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function defaultRunPhase32GateCommand(
  command: Phase32GateCommand,
): Promise<Phase32GateCommandResult> {
  const startedAtMs = Date.now();
  const spawnedProcess = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
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

function buildBlockedDeterministicEvidence(
  reportPath: string,
  reason: string,
): Phase32DeterministicReportEvidence {
  return {
    reason,
    reportPath,
    status: "blocked",
  };
}

function buildBlockedLiveEvidence(
  liveReportPath: string,
  reason: string,
): Phase32LiveExternalHostEvidence {
  return {
    hostKind: "codex",
    liveReportPath,
    reason,
    status: "blocked",
    traceBacked: false,
  };
}

export async function runPhase32QualityGate(
  input?: Phase32GateOptions,
  dependencies?: Phase32GateDependencies,
): Promise<Phase32GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const liveReportContract = buildPhase32LiveReportContract(root);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand = dependencies?.runCommand ?? defaultRunPhase32GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase32GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase32GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase32GateExecutionResult[] = [];

  for (const command of buildPhase32GateCommands(root)) {
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
  const deterministicReportPath = resolvePhase32CanonicalDeterministicReportPath(root);
  const liveReportPath = resolveMaybeRelativePath(
    root,
    input?.liveReportPath ?? liveReportContract.canonicalLiveReportPath,
  );
  const deterministicReport = failedCommand
    ? buildBlockedDeterministicEvidence(
        deterministicReportPath,
        "Deterministic report validation was skipped because a required command failed.",
      )
    : await (async () => {
        try {
          assertPhase32DeterministicReport(await readTextFile(deterministicReportPath));
          return {
            reason: "Phase 32 deterministic dual-baseline report is accepted.",
            reportPath: deterministicReportPath,
            status: "accepted" as const,
          };
        } catch (error) {
          return buildBlockedDeterministicEvidence(
            deterministicReportPath,
            error instanceof Error
              ? `Canonical Phase 32 deterministic report is missing or invalid: ${error.message}`
              : "Canonical Phase 32 deterministic report is missing or invalid.",
          );
        }
      })();
  const liveExternalHost = failedCommand
    ? buildBlockedLiveEvidence(
        liveReportPath,
        "Live external-host evidence validation was skipped because a required command failed.",
      )
    : await (async () => {
        try {
          const report = assertPhase32LiveReport(await readTextFile(liveReportPath));
          if (
            !pathsMatch(
              root,
              liveReportPath,
              liveReportContract.canonicalLiveReportPath,
            )
          ) {
            return buildBlockedLiveEvidence(
              liveReportPath,
              [
                "Phase 32 live external-host report path is not canonical.",
                `Expected ${liveReportContract.canonicalLiveReportPath}.`,
              ].join(" "),
            );
          }
          if (report.generatedBy !== liveReportContract.expectedGeneratedBy) {
            return buildBlockedLiveEvidence(
              liveReportPath,
              [
                "Phase 32 live external-host report was not generated by the canonical live runner.",
                `Expected ${liveReportContract.expectedGeneratedBy}.`,
              ].join(" "),
            );
          }
          if (report.evidenceContract.phase32.runner !== liveReportContract.expectedGeneratedBy) {
            return buildBlockedLiveEvidence(
              liveReportPath,
              "Phase 32 live external-host report evidence contract does not reference the canonical live runner.",
            );
          }
          if (report.runId !== liveReportContract.expectedRunId) {
            return buildBlockedLiveEvidence(
              liveReportPath,
              "Phase 32 live external-host report does not use the canonical accepted run id.",
            );
          }
          if (
            !pathsMatch(
              root,
              report.outputDir,
              liveReportContract.expectedOutputDir,
            )
          ) {
            return buildBlockedLiveEvidence(
              liveReportPath,
              "Phase 32 live external-host report outputDir is not canonical.",
            );
          }
          if (
            !pathsMatch(
              root,
              report.runDirectory,
              liveReportContract.expectedRunDirectory,
            )
          ) {
            return buildBlockedLiveEvidence(
              liveReportPath,
              "Phase 32 live external-host report runDirectory is not canonical.",
            );
          }
          return {
            hostKind: report.evidence.host.kind,
            liveReportPath,
            reason:
              "Phase 32 installed-package Codex external-host evidence is trace-backed and accepted.",
            status: "accepted" as const,
            traceBacked: report.evidence.host.traceBacked,
          };
        } catch (error) {
          return buildBlockedLiveEvidence(
            liveReportPath,
            error instanceof Error
              ? `Canonical Phase 32 live external-host report is missing or unreadable: ${error.message}`
              : "Canonical Phase 32 live external-host report is missing or unreadable.",
          );
        }
      })();

  const report: Phase32GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : deterministicReport.status === "accepted" &&
          liveExternalHost.status === "accepted"
        ? {
            decision: "accepted",
            reason:
              "Phase 32 deterministic regressions, deterministic dual-baseline evidence, and one canonical Codex external-host evidence chain are accepted.",
          }
        : {
            decision: "blocked",
            reason:
              deterministicReport.status !== "accepted"
                ? deterministicReport.reason
                : liveExternalHost.reason,
          },
    commands: commandResults,
    evidence: {
      deterministicReport,
      liveExternalHost,
    },
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-32",
    runDirectory: toRepoRelativePath(root, runDirectory),
    runId,
    scope: buildPhase32GateScope(),
  };

  report.evidence.deterministicReport = {
    ...report.evidence.deterministicReport,
    reportPath: toRepoRelativePath(root, report.evidence.deterministicReport.reportPath),
  };
  report.evidence.liveExternalHost = {
    ...report.evidence.liveExternalHost,
    liveReportPath: toRepoRelativePath(root, report.evidence.liveExternalHost.liveReportPath),
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-32-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase32GateCli(
  dependencies?: Phase32GateCliDependencies,
): Promise<Phase32GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase32QualityGate(options));
  const report = await runGate(parsePhase32GateCliOptions(argv));

  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase32GateCli();
}
