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
import { resolvePhase30FixtureDir } from "./run-phase-30-eval";
import {
  PHASE30_CANONICAL_LIVE_RUN_ID,
  PHASE30_LIVE_MEMORY_GENERATED_BY,
  resolvePhase30LiveMemoryOutputDir,
} from "./run-phase-30-live-memory";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase30GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase30GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase30GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase30LiveReportEvidence {
  blockingCases: number;
  canonicalLiveReportPath: string;
  firstAttemptPolicyAdherence: number;
  liveReportPath: string;
  passedBlockingCases: number;
  reason: string;
  status: "accepted" | "blocked";
  traceBackedBlockingCases: number;
}

export interface Phase30GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase30GateExecutionResult[];
  evidence: {
    liveMemoryReport: Phase30LiveReportEvidence;
  };
  generatedAt: string;
  generatedBy: string;
  phase: "phase-30";
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase30GateOptions {
  liveReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase30LiveReportContract {
  canonicalLiveReportPath: string;
  expectedFixtureDir: string;
  expectedGeneratedBy: typeof PHASE30_LIVE_MEMORY_GENERATED_BY;
  expectedOutputDir: string;
  expectedRunDirectory: string;
  expectedRunId: typeof PHASE30_CANONICAL_LIVE_RUN_ID;
}

export interface Phase30GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase30GateCommand) => Promise<Phase30GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase30GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase30GateOptions) => Promise<Phase30GateReport>;
}

const GENERATED_BY = "scripts/run-phase-30-gate.ts";
const REQUIRED_PHASE30_PROFILE_COVERAGE = {
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
const REQUIRED_PHASE30_SUMMARY_TOTAL_CASES = 16;
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

function parsePhase30LiveReport(
  parsed: unknown,
): BehavioralAdaptationReport | string {
  if (!isRecord(parsed)) {
    return "Phase 30 live-memory behavioral report must be a JSON object.";
  }

  if (parsed.mode !== "live-memory") {
    return "Phase 30 live-memory behavioral report has wrong mode.";
  }

  if (typeof parsed.generatedBy !== "string") {
    return "Phase 30 live-memory behavioral report is missing generatedBy.";
  }

  if (typeof parsed.outputDir !== "string") {
    return "Phase 30 live-memory behavioral report is missing outputDir.";
  }

  if (typeof parsed.runDirectory !== "string") {
    return "Phase 30 live-memory behavioral report is missing runDirectory.";
  }

  if (typeof parsed.runId !== "string") {
    return "Phase 30 live-memory behavioral report is missing runId.";
  }

  if (!isRecord(parsed.summary)) {
    return "Phase 30 live-memory behavioral report is missing summary.";
  }

  if (typeof parsed.summary.executionFailures !== "number") {
    return "Phase 30 live-memory behavioral report summary is missing executionFailures.";
  }

  if (typeof parsed.summary.totalCases !== "number") {
    return "Phase 30 live-memory behavioral report summary is missing totalCases.";
  }

  if (!layerDHasAllMetrics(parsed.summary.layer_d)) {
    return "Phase 30 live-memory behavioral report is missing canonical layer_d metrics.";
  }

  if (!isRecord(parsed.profiles)) {
    return "Phase 30 live-memory behavioral report is missing profiles.";
  }

  for (const profile of Object.keys(
    REQUIRED_PHASE30_PROFILE_COVERAGE,
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

function validatePhase30ReportContract(input: {
  contract: Phase30LiveReportContract;
  liveReportPath: string;
  report: BehavioralAdaptationReport;
  root: string;
}): string | undefined {
  if (!pathsMatch(input.root, input.liveReportPath, input.contract.canonicalLiveReportPath)) {
    return [
      "Phase 30 live-memory behavioral report path is not canonical.",
      `Expected ${input.contract.canonicalLiveReportPath}.`,
    ].join(" ");
  }

  if (input.report.generatedBy !== input.contract.expectedGeneratedBy) {
    return [
      "Phase 30 live-memory behavioral report was not generated by the canonical live runner.",
      `Expected ${input.contract.expectedGeneratedBy}.`,
    ].join(" ");
  }

  if (input.report.runId !== input.contract.expectedRunId) {
    return [
      "Phase 30 live-memory behavioral report does not use the canonical accepted run id.",
      `Expected ${input.contract.expectedRunId}.`,
    ].join(" ");
  }

  if (!pathsMatch(input.root, input.report.outputDir, input.contract.expectedOutputDir)) {
    return "Phase 30 live-memory behavioral report outputDir is not canonical.";
  }

  if (!pathsMatch(input.root, input.report.runDirectory, input.contract.expectedRunDirectory)) {
    return "Phase 30 live-memory behavioral report runDirectory is not canonical.";
  }

  const evidenceContract = (input.report as { evidenceContract?: unknown })
    .evidenceContract;
  if (!isRecord(evidenceContract) || !isRecord(evidenceContract.phase30)) {
    return "Phase 30 live-memory behavioral report is missing the Phase 30 evidence contract.";
  }

  const phase30 = evidenceContract.phase30;
  if (phase30.runner !== input.contract.expectedGeneratedBy) {
    return "Phase 30 live-memory behavioral report evidence contract has the wrong runner.";
  }

  if (
    typeof phase30.fixtureDir !== "string" ||
    !pathsMatch(input.root, phase30.fixtureDir, input.contract.expectedFixtureDir)
  ) {
    return "Phase 30 live-memory behavioral report evidence contract has the wrong fixture directory.";
  }

  if (phase30.requireTraceForStructuredCases !== true) {
    return "Phase 30 live-memory behavioral report did not require trace-backed structured scoring.";
  }

  if (phase30.scopePrefix !== "phase30-live") {
    return "Phase 30 live-memory behavioral report did not use the Phase 30 live scope prefix.";
  }

  if (!isRecord(phase30.providerBackedStorage)) {
    return "Phase 30 live-memory behavioral report is missing provider-backed storage evidence.";
  }

  if (!isRecord(phase30.hostRuntime)) {
    return "Phase 30 live-memory behavioral report is missing Codex host runtime evidence.";
  }

  const hostRuntime = phase30.hostRuntime;
  if (
    hostRuntime.modelTransport !== "codex-exec-json" ||
    hostRuntime.structuredFirstAction !== "disabled"
  ) {
    return "Phase 30 live-memory behavioral report does not prove native Codex host-event transport.";
  }

  const storage = phase30.providerBackedStorage;
  if (
    storage.provider !== "postgres" ||
    storage.envVar !== "GOODMEMORY_TEST_POSTGRES_URL" ||
    storage.storageBootstrap !== "passed" ||
    storage.memoryStackPreflight !== "passed"
  ) {
    return "Phase 30 live-memory behavioral report does not prove provider-backed Postgres preflight evidence.";
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

function validatePhase30ProfileCoverage(
  report: BehavioralAdaptationReport,
): string | undefined {
  if (report.summary.totalCases !== REQUIRED_PHASE30_SUMMARY_TOTAL_CASES) {
    return [
      "Phase 30 live-memory behavioral report does not cover the full Phase 30 fixture/profile matrix.",
      `Expected ${REQUIRED_PHASE30_SUMMARY_TOTAL_CASES} total cases.`,
    ].join(" ");
  }

  for (const profile of Object.keys(
    REQUIRED_PHASE30_PROFILE_COVERAGE,
  ) as BehavioralAdaptationProfile[]) {
    const expected = REQUIRED_PHASE30_PROFILE_COVERAGE[profile];
    const summary = report.profiles[profile];
    const blockingCases = summary.cases.filter((caseResult) => caseResult.blocking);
    const conditioningCases = blockingCases.filter(
      (caseResult) => caseResult.paradigm === "conditioning",
    );
    const proceduralCases = blockingCases.filter(
      (caseResult) => caseResult.paradigm === "procedural",
    );

    if (summary.executionFailures !== 0) {
      return `Phase 30 live-memory behavioral report has execution failures in ${profile}.`;
    }

    if (summary.totalCases !== expected.totalCases) {
      return `Phase 30 live-memory behavioral report has incomplete ${profile} coverage.`;
    }

    if (blockingCases.length !== expected.blockingCases) {
      return `Phase 30 live-memory behavioral report has incomplete ${profile} blocking coverage.`;
    }

    if (conditioningCases.length !== expected.conditioningCases) {
      return `Phase 30 live-memory behavioral report has incomplete ${profile} conditioning coverage.`;
    }

    if (proceduralCases.length !== expected.proceduralCases) {
      return `Phase 30 live-memory behavioral report has incomplete ${profile} procedural coverage.`;
    }

    const occurrences = countCaseOccurrences(summary.cases);
    for (const [caseId, expectedCount] of Object.entries(expected.caseOccurrences)) {
      if ((occurrences[caseId] ?? 0) !== expectedCount) {
        return `Phase 30 live-memory behavioral report has incomplete ${profile} fixture coverage for ${caseId}.`;
      }
    }

    for (const caseId of Object.keys(occurrences)) {
      if (!(caseId in expected.caseOccurrences)) {
        return `Phase 30 live-memory behavioral report contains non-Phase-30 ${profile} fixture coverage for ${caseId}.`;
      }
    }
  }

  return undefined;
}

function buildBlockedLiveEvidence(
  canonicalLiveReportPath: string,
  liveReportPath: string,
  reason: string,
): Phase30LiveReportEvidence {
  return {
    blockingCases: 0,
    canonicalLiveReportPath,
    firstAttemptPolicyAdherence: 0,
    liveReportPath,
    passedBlockingCases: 0,
    reason,
    status: "blocked",
    traceBackedBlockingCases: 0,
  };
}

export function resolvePhase30GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-30");
}

export function resolvePhase30CanonicalLiveReportPath(root: string): string {
  return join(
    root,
    "reports/eval/live-memory/phase-30",
    PHASE30_CANONICAL_LIVE_RUN_ID,
    "report.json",
  );
}

export function buildPhase30LiveReportContract(
  root: string,
): Phase30LiveReportContract {
  const expectedOutputDir = resolvePhase30LiveMemoryOutputDir(root);
  const expectedRunDirectory = join(
    expectedOutputDir,
    PHASE30_CANONICAL_LIVE_RUN_ID,
  );

  return {
    canonicalLiveReportPath: resolvePhase30CanonicalLiveReportPath(root),
    expectedFixtureDir: resolvePhase30FixtureDir(root),
    expectedGeneratedBy: PHASE30_LIVE_MEMORY_GENERATED_BY,
    expectedOutputDir,
    expectedRunDirectory,
    expectedRunId: PHASE30_CANONICAL_LIVE_RUN_ID,
  };
}

export function resolvePhase30LiveReportPath(
  root: string,
  liveReportPath?: string,
): string {
  return liveReportPath
    ? resolveMaybeRelativePath(root, liveReportPath)
    : resolvePhase30CanonicalLiveReportPath(root);
}

export function buildPhase30GateCommands(root: string): Phase30GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-30-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/host.behavioral-trace.test.ts",
        "tests/unit/host.behavioral-trace-recorder.test.ts",
        "tests/unit/host.behavioral-trace-bridge.test.ts",
        "tests/unit/host.adapter.test.ts",
        "tests/unit/eval.behavioral-adaptation.test.ts",
        "tests/unit/run-phase-30.script.test.ts",
        "tests/unit/run-phase-30.gate.test.ts",
        "tests/integration/evolution.outcome-telemetry.test.ts",
      ],
    },
    {
      label: "phase-30-fallback-eval",
      cwd: root,
      args: ["bun", "run", "eval:phase-30"],
    },
  ];
}

export async function defaultRunPhase30GateCommand(
  command: Phase30GateCommand,
): Promise<Phase30GateCommandResult> {
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

export function buildPhase30GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase30"}`;
}

export async function validatePhase30LiveBehavioralReport(input: {
  contract: Phase30LiveReportContract;
  liveReportPath: string;
  readTextFile: (path: string) => Promise<string>;
}): Promise<Phase30LiveReportEvidence> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  let reportText: string;

  try {
    reportText = await input.readTextFile(input.liveReportPath);
  } catch {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 30 live-memory behavioral report is missing or unreadable: ${input.liveReportPath}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(reportText) as unknown;
  } catch {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 30 live-memory behavioral report is not valid JSON: ${input.liveReportPath}`,
    );
  }

  const parsedReport = parsePhase30LiveReport(parsed);
  if (typeof parsedReport === "string") {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `${parsedReport} ${input.liveReportPath}`,
    );
  }

  const report = parsedReport;
  const contractFailure = validatePhase30ReportContract({
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
      `Phase 30 live-memory behavioral report has execution failures: ${input.liveReportPath}`,
    );
  }

  const coverageFailure = validatePhase30ProfileCoverage(report);
  if (coverageFailure) {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `${coverageFailure} ${input.liveReportPath}`,
    );
  }

  const blockingCases = collectBlockingCases(report);
  const traceBackedBlockingCases = blockingCases.filter(isTraceBackedBlockingCase);
  const passedBlockingCases = blockingCases.filter((caseResult) => caseResult.passed);

  if (blockingCases.length === 0) {
    return buildBlockedLiveEvidence(
      input.contract.canonicalLiveReportPath,
      input.liveReportPath,
      `Phase 30 live-memory behavioral report has no blocking behavioral cases: ${input.liveReportPath}`,
    );
  }

  if (traceBackedBlockingCases.length !== blockingCases.length) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      liveReportPath: input.liveReportPath,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 30 live-memory behavioral report contains blocking cases that are not trace-backed.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  if (passedBlockingCases.length / blockingCases.length <= 0.5) {
    return {
      blockingCases: blockingCases.length,
      canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
      firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
      liveReportPath: input.liveReportPath,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 30 live-memory behavioral report does not show a strict majority of GoodMemory first-action wins.",
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
      liveReportPath: input.liveReportPath,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 30 live-memory behavioral report does not prove a strict majority of procedural generalization wins.",
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
      liveReportPath: input.liveReportPath,
      passedBlockingCases: passedBlockingCases.length,
      reason:
        "Phase 30 live-memory behavioral report has no outcome-telemetry lineage evidence.",
      status: "blocked",
      traceBackedBlockingCases: traceBackedBlockingCases.length,
    };
  }

  return {
    blockingCases: blockingCases.length,
    canonicalLiveReportPath: input.contract.canonicalLiveReportPath,
    firstAttemptPolicyAdherence: report.summary.layer_d.first_attempt_policy_adherence,
    liveReportPath: input.liveReportPath,
    passedBlockingCases: passedBlockingCases.length,
    reason: "Phase 30 live-memory behavioral report is trace-backed and accepted.",
    status: "accepted",
    traceBackedBlockingCases: traceBackedBlockingCases.length,
  };
}

function buildPhase30GateScope(): Phase30GateReport["scope"] {
  return {
    inScope: [
      "trace-backed first-action scoring",
      "native Codex host runtime trace capture",
      "phase-30 deterministic behavioral eval",
      "phase-30 provider-backed live-memory behavioral report validation",
    ],
    outOfScope: [
      "public GoodMemory API or public config widening",
      "making Claude a gate-blocking host path",
      "Phase 28 local backend contract changes",
      "Phase 29 release packaging changes",
    ],
  };
}

export async function runPhase30QualityGate(
  input?: Phase30GateOptions,
  dependencies?: Phase30GateDependencies,
): Promise<Phase30GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    (async (path: string) => readFile(path, "utf8"));
  const runCommand = dependencies?.runCommand ?? defaultRunPhase30GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase30GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase30GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commandResults: Phase30GateExecutionResult[] = [];
  const liveReportContract = buildPhase30LiveReportContract(root);
  const liveReportPath = resolvePhase30LiveReportPath(root, input?.liveReportPath);

  for (const command of buildPhase30GateCommands(root)) {
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
    : await validatePhase30LiveBehavioralReport({
        contract: liveReportContract,
        liveReportPath,
        readTextFile,
      });
  const report: Phase30GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : liveMemoryReport.status === "accepted"
        ? {
            decision: "accepted",
            reason:
              "Phase 30 deterministic regressions and a native Codex host trace-backed provider live-memory behavioral report are accepted.",
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
    phase: "phase-30",
    runDirectory: toRepoRelativePath(root, runDirectory),
    runId,
    scope: buildPhase30GateScope(),
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
    join(runDirectory, "phase-30-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export function parsePhase30GateCliOptions(
  argv: readonly string[],
): Phase30GateOptions {
  return {
    liveReportPath: resolveCliFlagValue(argv, "--live-report"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase30GateCli(
  dependencies?: Phase30GateCliDependencies,
): Promise<Phase30GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate =
    dependencies?.runGate ?? ((options) => runPhase30QualityGate(options));
  const report = await runGate(parsePhase30GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase30GateCli();
}
