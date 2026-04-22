import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  BehavioralAdaptationReport,
  BehavioralAdaptationProfile,
  BehavioralCaseResult,
  BehavioralLayerD,
  BehavioralProfileSummary,
} from "../src/eval/behavioral-adaptation";
import { resolveCliFlagValue } from "./cli-options";
import { resolvePhase31FixtureDir } from "./run-phase-31-eval";
import {
  PHASE31_CANONICAL_LIVE_RUN_ID,
  PHASE31_LIVE_MEMORY_GENERATED_BY,
  resolvePhase31LiveMemoryOutputDir,
} from "./run-phase-31-live-memory";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase31GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase31GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase31GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase31LiveReportEvidence {
  blockingCases: number;
  canonicalLiveReportPath: string;
  firstAttemptPolicyAdherence: number;
  hostLifecycleBlockingCases: number;
  liveReportPath: string;
  nativeCorrectionLineageCases: number;
  passedBlockingCases: number;
  reason: string;
  status: "accepted" | "blocked";
  traceBackedBlockingCases: number;
}

export interface Phase31GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase31GateExecutionResult[];
  evidence: {
    liveMemoryReport: Phase31LiveReportEvidence;
  };
  generatedAt: string;
  generatedBy: string;
  phase: "phase-31";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase31GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase31LiveReportContract {
  canonicalLiveReportPath: string;
  expectedFixtureDir: string;
  expectedGeneratedBy: typeof PHASE31_LIVE_MEMORY_GENERATED_BY;
  expectedOutputDir: string;
  expectedRunDirectory: string;
  expectedRunId: typeof PHASE31_CANONICAL_LIVE_RUN_ID;
}

export interface Phase31GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase31GateCommand) => Promise<Phase31GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase31GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase31GateOptions) => Promise<Phase31GateReport>;
}

const GENERATED_BY = "scripts/run-phase-31-gate.ts";
const REQUIRED_PHASE31_PROFILE_COVERAGE = {
  "raw-experience": {
    blockingCases: 4,
    caseOccurrences: {
      "conditioning-detailed-analysis-timeout-trace": 1,
      "conditioning-prod-deploy-warning-trace": 1,
      "conditioning-safe-delete-user-correction-trace": 1,
      "priming-volcanic-naming-trace-research": 2,
      "procedural-copy-generalization-trace": 1,
    },
    conditioningCases: 3,
    proceduralCases: 1,
    totalCases: 6,
  },
  "outcome-telemetry": {
    blockingCases: 4,
    caseOccurrences: {
      "conditioning-detailed-analysis-timeout-trace": 1,
      "conditioning-prod-deploy-warning-trace": 1,
      "conditioning-safe-delete-user-correction-trace": 1,
      "procedural-copy-generalization-trace": 1,
    },
    conditioningCases: 3,
    proceduralCases: 1,
    totalCases: 4,
  },
  "distilled-feedback": {
    blockingCases: 4,
    caseOccurrences: {
      "conditioning-detailed-analysis-timeout-trace": 1,
      "conditioning-prod-deploy-warning-trace": 1,
      "conditioning-safe-delete-user-correction-trace": 1,
      "priming-volcanic-naming-trace-research": 2,
      "procedural-copy-generalization-trace": 1,
    },
    conditioningCases: 3,
    proceduralCases: 1,
    totalCases: 6,
  },
} as const satisfies Record<
  BehavioralAdaptationProfile,
  {
    blockingCases: number;
    caseOccurrences: Record<string, number>;
    conditioningCases: number;
    proceduralCases: number;
    totalCases: number;
  }
>;
const REQUIRED_PHASE31_SUMMARY_TOTAL_CASES = 16;
const REQUIRED_LAYER_D_KEYS = [
  "constraint_violation_rate",
  "failure_avoidance_rate",
  "first_attempt_policy_adherence",
  "inhibition_success_rate",
  "priming_delta",
  "procedure_generalization_rate",
] as const satisfies readonly (keyof BehavioralLayerD)[];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBehavioralAdaptationProfile(
  value: string,
): value is BehavioralAdaptationProfile {
  return (
    value === "raw-experience" ||
    value === "outcome-telemetry" ||
    value === "distilled-feedback"
  );
}

function layerDHasAllMetrics(layerD: unknown): layerD is BehavioralLayerD {
  if (!isRecord(layerD)) {
    return false;
  }

  return REQUIRED_LAYER_D_KEYS.every((key) => typeof layerD[key] === "number");
}

function collectBlockingCases(report: BehavioralAdaptationReport): BehavioralCaseResult[] {
  return Object.values(report.profiles).flatMap((profile) =>
    profile.cases.filter((caseResult) => caseResult.blocking),
  );
}

function isTraceBackedBlockingCase(caseResult: BehavioralCaseResult): boolean {
  return (
    caseResult.firstActionSource === "trace" &&
    caseResult.firstAction !== undefined &&
    caseResult.baselineTrace?.hostKind === "codex" &&
    caseResult.goodmemoryTrace?.hostKind === "codex" &&
    Array.isArray(caseResult.goodmemoryTrace.events) &&
    caseResult.goodmemoryTrace.events.length > 0
  );
}

function isExecutableBlockingCase(caseResult: BehavioralCaseResult): boolean {
  return (
    caseResult.blocking &&
    caseResult.firstAction?.kind !== "warning" &&
    caseResult.goodmemoryTrace?.events[0] !== undefined
  );
}

function isWarningOnlyBlockingCase(caseResult: BehavioralCaseResult): boolean {
  return (
    caseResult.blocking &&
    caseResult.firstActionSource === "trace" &&
    caseResult.firstAction?.kind === "warning" &&
    caseResult.goodmemoryTrace?.events[0]?.actionKind === "warning"
  );
}

function hasHostLifecycleBlockingOutcome(caseResult: BehavioralCaseResult): boolean {
  return caseResult.goodmemoryTrace?.events[0]?.outcomeSource === "host_lifecycle";
}

function hasWarningMessageBlockingOutcome(caseResult: BehavioralCaseResult): boolean {
  return caseResult.goodmemoryTrace?.events[0]?.outcomeSource === "warning_message";
}

function hasNativeCorrectionLineage(caseResult: BehavioralCaseResult): boolean {
  return Boolean(
    caseResult.goodmemoryTrace?.events.some((event) =>
      typeof event.correctionOfStepIndex === "number"
    ),
  );
}

function isCaseResultShape(value: unknown): value is BehavioralCaseResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.blocking === "boolean" &&
    typeof value.caseId === "string" &&
    typeof value.passed === "boolean" &&
    typeof value.paradigm === "string" &&
    typeof value.profile === "string" &&
    isBehavioralAdaptationProfile(value.profile)
  );
}

function validateProfileSummaryShape(
  value: unknown,
  path: string,
): BehavioralProfileSummary | string {
  if (!isRecord(value)) {
    return `${path} must be an object.`;
  }

  if (!Array.isArray(value.cases) || !value.cases.every(isCaseResultShape)) {
    return `${path}.cases must be an array of behavioral case results.`;
  }

  if (typeof value.executionFailures !== "number") {
    return `${path}.executionFailures must be a number.`;
  }

  if (typeof value.totalCases !== "number") {
    return `${path}.totalCases must be a number.`;
  }

  if (value.totalCases !== value.cases.length + value.executionFailures) {
    return `${path}.totalCases must match cases plus executionFailures.`;
  }

  if (!layerDHasAllMetrics(value.layer_d)) {
    return `${path}.layer_d must include the canonical Layer D metrics.`;
  }

  return value as unknown as BehavioralProfileSummary;
}

function parsePhase31LiveReport(
  parsed: unknown,
): BehavioralAdaptationReport | string {
  if (!isRecord(parsed)) {
    return "Phase 31 live-memory behavioral report must be a JSON object.";
  }

  if (parsed.mode !== "live-memory") {
    return "Phase 31 live-memory behavioral report has wrong mode.";
  }

  if (typeof parsed.generatedBy !== "string") {
    return "Phase 31 live-memory behavioral report is missing generatedBy.";
  }

  if (typeof parsed.outputDir !== "string") {
    return "Phase 31 live-memory behavioral report is missing outputDir.";
  }

  if (typeof parsed.runDirectory !== "string") {
    return "Phase 31 live-memory behavioral report is missing runDirectory.";
  }

  if (typeof parsed.runId !== "string") {
    return "Phase 31 live-memory behavioral report is missing runId.";
  }

  if (!isRecord(parsed.summary)) {
    return "Phase 31 live-memory behavioral report is missing summary.";
  }

  if (typeof parsed.summary.executionFailures !== "number") {
    return "Phase 31 live-memory behavioral report summary is missing executionFailures.";
  }

  if (typeof parsed.summary.totalCases !== "number") {
    return "Phase 31 live-memory behavioral report summary is missing totalCases.";
  }

  if (!layerDHasAllMetrics(parsed.summary.layer_d)) {
    return "Phase 31 live-memory behavioral report is missing canonical layer_d metrics.";
  }

  if (!isRecord(parsed.profiles)) {
    return "Phase 31 live-memory behavioral report is missing profiles.";
  }

  for (const profile of Object.keys(
    REQUIRED_PHASE31_PROFILE_COVERAGE,
  ) as BehavioralAdaptationProfile[]) {
    const profileSummary = validateProfileSummaryShape(
      parsed.profiles[profile],
      `profiles.${profile}`,
    );
    if (typeof profileSummary === "string") {
      return profileSummary;
    }
  }

  return parsed as unknown as BehavioralAdaptationReport;
}

function pathsMatch(root: string, left: string, right: string): boolean {
  return resolveMaybeRelativePath(root, left) === resolveMaybeRelativePath(root, right);
}

function validatePhase31ReportContract(input: {
  contract: Phase31LiveReportContract;
  liveReportPath: string;
  report: BehavioralAdaptationReport;
  root: string;
}): string | undefined {
  if (!pathsMatch(input.root, input.liveReportPath, input.contract.canonicalLiveReportPath)) {
    return [
      "Phase 31 live-memory behavioral report path is not canonical.",
      `Expected ${input.contract.canonicalLiveReportPath}.`,
    ].join(" ");
  }

  if (input.report.generatedBy !== input.contract.expectedGeneratedBy) {
    return [
      "Phase 31 live-memory behavioral report was not generated by the canonical live runner.",
      `Expected ${input.contract.expectedGeneratedBy}.`,
    ].join(" ");
  }

  if (input.report.runId !== input.contract.expectedRunId) {
    return [
      "Phase 31 live-memory behavioral report does not use the canonical accepted run id.",
      `Expected ${input.contract.expectedRunId}.`,
    ].join(" ");
  }

  if (!pathsMatch(input.root, input.report.outputDir, input.contract.expectedOutputDir)) {
    return "Phase 31 live-memory behavioral report outputDir is not canonical.";
  }

  if (!pathsMatch(input.root, input.report.runDirectory, input.contract.expectedRunDirectory)) {
    return "Phase 31 live-memory behavioral report runDirectory is not canonical.";
  }

  const evidenceContract = (input.report as { evidenceContract?: unknown })
    .evidenceContract;
  if (!isRecord(evidenceContract) || !isRecord(evidenceContract.phase31)) {
    return "Phase 31 live-memory behavioral report is missing the Phase 31 evidence contract.";
  }

  const phase31 = evidenceContract.phase31;
  if (phase31.runner !== input.contract.expectedGeneratedBy) {
    return "Phase 31 live-memory behavioral report evidence contract has the wrong runner.";
  }

  if (
    typeof phase31.fixtureDir !== "string" ||
    !pathsMatch(input.root, phase31.fixtureDir, input.contract.expectedFixtureDir)
  ) {
    return "Phase 31 live-memory behavioral report evidence contract has the wrong fixture directory.";
  }

  if (phase31.requireTraceForStructuredCases !== true) {
    return "Phase 31 live-memory behavioral report did not require trace-backed structured scoring.";
  }

  if (phase31.scopePrefix !== "phase31-live") {
    return "Phase 31 live-memory behavioral report did not use the Phase 31 live scope prefix.";
  }

  if (!isRecord(phase31.providerBackedStorage)) {
    return "Phase 31 live-memory behavioral report is missing provider-backed storage evidence.";
  }

  if (!isRecord(phase31.hostRuntime)) {
    return "Phase 31 live-memory behavioral report is missing Codex host runtime evidence.";
  }

  const hostRuntime = phase31.hostRuntime;
  if (
    hostRuntime.blockingExecutableOutcomeSource !== "host_lifecycle" ||
    hostRuntime.correctionLineage !== "native_host_events" ||
    hostRuntime.modelTransport !== "codex-exec-json" ||
    hostRuntime.structuredFirstAction !== "disabled" ||
    hostRuntime.warningOutcomeSource !== "warning_message"
  ) {
    return "Phase 31 live-memory behavioral report does not prove native Codex host-event transport.";
  }

  const storage = phase31.providerBackedStorage;
  if (
    storage.provider !== "postgres" ||
    storage.envVar !== "GOODMEMORY_TEST_POSTGRES_URL" ||
    storage.storageBootstrap !== "passed" ||
    storage.memoryStackPreflight !== "passed"
  ) {
    return "Phase 31 live-memory behavioral report does not prove provider-backed Postgres preflight evidence.";
  }

  return undefined;
}

function countCaseOccurrences(
  cases: readonly BehavioralCaseResult[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const caseResult of cases) {
    counts[caseResult.caseId] = (counts[caseResult.caseId] ?? 0) + 1;
  }

  return counts;
}

function validatePhase31ProfileCoverage(
  report: BehavioralAdaptationReport,
): string | undefined {
  if (report.summary.totalCases !== REQUIRED_PHASE31_SUMMARY_TOTAL_CASES) {
    return [
      "Phase 31 live-memory behavioral report does not cover the full Phase 31 fixture/profile matrix.",
      `Expected ${REQUIRED_PHASE31_SUMMARY_TOTAL_CASES} total cases.`,
    ].join(" ");
  }

  for (const profile of Object.keys(
    REQUIRED_PHASE31_PROFILE_COVERAGE,
  ) as BehavioralAdaptationProfile[]) {
    const expected = REQUIRED_PHASE31_PROFILE_COVERAGE[profile];
    const summary = report.profiles[profile];
    const blockingCases = summary.cases.filter((caseResult) => caseResult.blocking);
    const conditioningCases = blockingCases.filter(
      (caseResult) => caseResult.paradigm === "conditioning",
    );
    const proceduralCases = blockingCases.filter(
      (caseResult) => caseResult.paradigm === "procedural",
    );

    if (summary.executionFailures !== 0) {
      return `Phase 31 live-memory behavioral report has execution failures in ${profile}.`;
    }

    if (summary.totalCases !== expected.totalCases) {
      return `Phase 31 live-memory behavioral report has incomplete ${profile} coverage.`;
    }

    if (blockingCases.length !== expected.blockingCases) {
      return `Phase 31 live-memory behavioral report has incomplete ${profile} blocking coverage.`;
    }

    if (conditioningCases.length !== expected.conditioningCases) {
      return `Phase 31 live-memory behavioral report has incomplete ${profile} conditioning coverage.`;
    }

    if (proceduralCases.length !== expected.proceduralCases) {
      return `Phase 31 live-memory behavioral report has incomplete ${profile} procedural coverage.`;
    }

    const occurrences = countCaseOccurrences(summary.cases);
    for (const [caseId, expectedCount] of Object.entries(expected.caseOccurrences)) {
      if ((occurrences[caseId] ?? 0) !== expectedCount) {
        return `Phase 31 live-memory behavioral report has incomplete ${profile} fixture coverage for ${caseId}.`;
      }
    }

    for (const caseId of Object.keys(occurrences)) {
      if (!(caseId in expected.caseOccurrences)) {
        return `Phase 31 live-memory behavioral report contains non-Phase-31 ${profile} fixture coverage for ${caseId}.`;
      }
    }
  }

  return undefined;
}

function buildBlockedLiveEvidence(
  canonicalLiveReportPath: string,
  liveReportPath: string,
  reason: string,
): Phase31LiveReportEvidence {
  return {
    blockingCases: 0,
    canonicalLiveReportPath,
    firstAttemptPolicyAdherence: 0,
    hostLifecycleBlockingCases: 0,
    liveReportPath,
    nativeCorrectionLineageCases: 0,
    passedBlockingCases: 0,
    reason,
    status: "blocked",
    traceBackedBlockingCases: 0,
  };
}

export function resolvePhase31GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-31");
}

export function resolvePhase31CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-31",
    PHASE31_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase31LiveReportContract(
  root: string,
): Phase31LiveReportContract {
  const expectedOutputDir = resolvePhase31LiveMemoryOutputDir(root);
  const expectedRunDirectory = join(
    expectedOutputDir,
    PHASE31_CANONICAL_LIVE_RUN_ID,
  );

  return {
    canonicalLiveReportPath: resolvePhase31CanonicalLiveReportPath(root),
    expectedFixtureDir: resolvePhase31FixtureDir(root),
    expectedGeneratedBy: PHASE31_LIVE_MEMORY_GENERATED_BY,
    expectedOutputDir,
    expectedRunDirectory,
    expectedRunId: PHASE31_CANONICAL_LIVE_RUN_ID,
  };
}

export function resolvePhase31LiveReportPath(
  root: string,
  liveReportPath?: string,
): string {
  return liveReportPath
    ? resolveMaybeRelativePath(root, liveReportPath)
    : resolvePhase31CanonicalLiveReportPath(root);
}

export function buildPhase31GateCommands(root: string): Phase31GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-31-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/host.behavioral-trace.test.ts",
        "tests/unit/host.codex-exec-behavioral-trace.test.ts",
        "tests/unit/host.behavioral-trace-recorder.test.ts",
        "tests/unit/host.behavioral-trace-bridge.test.ts",
        "tests/unit/host.adapter.test.ts",
        "tests/unit/eval.behavioral-adaptation.test.ts",
        "tests/unit/run-phase-31.script.test.ts",
        "tests/unit/run-phase-31.gate.test.ts",
        "tests/integration/evolution.outcome-telemetry.test.ts",
      ],
    },
    {
      label: "phase-31-fallback-eval",
      cwd: root,
      args: ["bun", "run", "eval:phase-31"],
    },
  ];
}

export async function defaultRunPhase31GateCommand(
  command: Phase31GateCommand,
): Promise<Phase31GateCommandResult> {
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

export function buildPhase31GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase31"}`;
}

export async function validatePhase31LiveBehavioralReport(input: {
  contract: Phase31LiveReportContract;
  liveReportPath: string;
  readTextFile: (path: string) => Promise<string>;
}): Promise<Phase31LiveReportEvidence> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  let reportText: string;

  try {
    reportText = await input.readTextFile(input.liveReportPath);
  } catch {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 31 live-memory behavioral report is missing or unreadable: ${input.liveReportPath}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(reportText) as unknown;
  } catch {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 31 live-memory behavioral report is not valid JSON: ${input.liveReportPath}`,
    );
  }

  const parsedReport = parsePhase31LiveReport(parsed);
  if (typeof parsedReport === "string") {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `${parsedReport} ${input.liveReportPath}`,
    );
  }

  const report = parsedReport;
  const contractFailure = validatePhase31ReportContract({
    contract: input.contract,
    liveReportPath: input.liveReportPath,
    report,
    root,
  });
  if (contractFailure) {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `${contractFailure} ${input.liveReportPath}`,
    );
  }

  if (report.summary.executionFailures !== 0) {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 31 live-memory behavioral report has execution failures: ${input.liveReportPath}`,
    );
  }

  const coverageFailure = validatePhase31ProfileCoverage(report);
  if (coverageFailure) {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `${coverageFailure} ${input.liveReportPath}`,
    );
  }

  const blockingCases = collectBlockingCases(report);
  const traceBackedBlockingCases = blockingCases.filter(isTraceBackedBlockingCase);
  const executableBlockingCases = blockingCases.filter(isExecutableBlockingCase);
  const hostLifecycleBlockingCases = executableBlockingCases.filter(
    hasHostLifecycleBlockingOutcome,
  );
  const warningOnlyBlockingCases = blockingCases.filter(isWarningOnlyBlockingCase);
  const warningMessageBlockingCases = warningOnlyBlockingCases.filter(
    hasWarningMessageBlockingOutcome,
  );
  const nativeCorrectionLineageCases = Object.values(report.profiles).flatMap((profile) =>
    profile.cases.filter(hasNativeCorrectionLineage)
  );
  const passedBlockingCases = blockingCases.filter((caseResult) => caseResult.passed);

  if (blockingCases.length === 0) {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 31 live-memory behavioral report has no blocking behavioral cases: ${input.liveReportPath}`,
    );
  }

  if (traceBackedBlockingCases.length !== blockingCases.length) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report contains blocking cases that are not trace-backed.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  if (
    executableBlockingCases.length > 0 &&
    hostLifecycleBlockingCases.length !== executableBlockingCases.length
  ) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report contains executable blocking cases whose outcomes are not marked as host-lifecycle derived.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  if (
    warningOnlyBlockingCases.length > 0 &&
    warningMessageBlockingCases.length !== warningOnlyBlockingCases.length
  ) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report contains warning-only blocking cases whose outcomes are not marked as warning-message derived.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  if (nativeCorrectionLineageCases.length === 0) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: 0,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report does not contain a native targeted correction lineage.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  if (passedBlockingCases.length / blockingCases.length <= 0.5) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report does not show a strict majority of GoodMemory first-action wins.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  const proceduralBlockingCases = report.summary.blockingSummary.procedural.totalCases;
  const passedProceduralCases = report.summary.blockingSummary.procedural.passedCases;
  if (
    proceduralBlockingCases > 0 &&
    passedProceduralCases / proceduralBlockingCases <= 0.5
  ) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report does not prove a strict majority of procedural generalization wins.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  const telemetryCases = report.profiles["outcome-telemetry"].cases.filter(
    (caseResult) =>
      caseResult.blocking &&
      Array.isArray(caseResult.outcomeTelemetryLineage?.experienceIds) &&
      caseResult.outcomeTelemetryLineage.experienceIds.length > 0,
  );
  if (telemetryCases.length === 0) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
      liveReportPath: input.liveReportPath,
      nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 31 live-memory behavioral report has no outcome-telemetry lineage evidence.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  return {
    blockingCases: blockingCases.length,
    canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
    firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
    hostLifecycleBlockingCases: hostLifecycleBlockingCases.length,
    liveReportPath: input.liveReportPath,
    nativeCorrectionLineageCases: nativeCorrectionLineageCases.length,
    passedBlockingCases: passedBlockingCases.length,
    reason: "Phase 31 live-memory behavioral report is trace-backed and accepted.",
    status: "accepted",
    traceBackedBlockingCases: traceBackedBlockingCases.length,
  };
}

function buildPhase31GateScope(): Phase31GateReport["scope"] {
  return {
    inScope: [
      "trace-backed first-action scoring",
      "native Codex host runtime trace capture",
      "host-lifecycle outcome provenance for executable blocking cases",
      "native targeted correction lineage capture",
      "phase-31 deterministic behavioral eval",
      "phase-31 provider-backed live-memory behavioral report validation",
    ],
    outOfScope: [
      "public GoodMemory API or public config widening",
      "making Claude a gate-blocking host path",
      "Phase 28 local backend contract changes",
      "Phase 29 release packaging changes",
    ],
  };
}

export async function runPhase31QualityGate(
  input?: Phase31GateOptions,
  dependencies?: Phase31GateDependencies,
): Promise<Phase31GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    (async (path: string) => readFile(path, "utf8"));
  const runCommand = dependencies?.runCommand ?? defaultRunPhase31GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase31GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase31GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase31GateExecutionResult[] = [];
  const liveReportContract = buildPhase31LiveReportContract(root);
  const liveReportPath = resolvePhase31LiveReportPath(root, input?.liveReportPath);

  for (const command of buildPhase31GateCommands(root)) {
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
  const liveMemoryReport = failedCommand
    ? buildBlockedLiveEvidence(
        liveReportContract.canonicalLiveReportPath,
        liveReportPath,
        "Live-memory behavioral report validation was skipped because a required command failed.",
      )
    : await validatePhase31LiveBehavioralReport({
        contract: liveReportContract,
        liveReportPath,
        readTextFile,
      });
  const report: Phase31GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : liveMemoryReport.status === "accepted"
        ? {
            decision: "accepted",
            reason:
              "Phase 31 deterministic regressions and a native Codex host trace-backed provider live-memory behavioral report are accepted.",
          }
        : {
            decision: "blocked",
            reason: liveMemoryReport.reason,
          },
    commands: commandResults,
    evidence: {
      liveMemoryReport,
    },
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-31",
    runDirectory: toRepoRelativePath(root, runDirectory),
    runId,
    scope: buildPhase31GateScope(),
  };

  report.evidence.liveMemoryReport = {
    ...report.evidence.liveMemoryReport,
    canonicalLiveReportPath: toRepoRelativePath(
      root,
      report.evidence.liveMemoryReport.canonicalLiveReportPath,
    ),
    liveReportPath: toRepoRelativePath(root, report.evidence.liveMemoryReport.liveReportPath),
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-31-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export function parsePhase31GateCliOptions(
  argv: readonly string[],
): Phase31GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase31GateCli(
  dependencies?: Phase31GateCliDependencies,
): Promise<Phase31GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase31QualityGate(options));
  const report = await runGate(parsePhase31GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase31GateCli();
}
