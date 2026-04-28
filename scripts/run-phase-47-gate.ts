#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase47GateOptions {
  outputDir?: string;
  providerReportPath?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase47GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase47GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase47GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase47GateCommand) => Promise<Phase47GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase47GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase47GateOptions) => Promise<Phase47GateReport>;
}

export interface Phase47ProviderReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase47GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase47GateCommandResult & { label: string }>;
  evidence: {
    docsAligned: boolean;
    httpBridgeDiagnostics: boolean;
    noRootApiWidening: boolean;
    packageScriptsRegistered: boolean;
    providerReport: Phase47ProviderReportEvidence;
    providerReportMetrics: {
      fallbackVisibleCount: number;
      providerBackedObservedCount: number;
      rulesOnlyDefaultPreserved: boolean;
      scenarioCount: number;
      setupFragilityDelta: number;
      staleRecallDelta: number;
      usefulRecallDelta: number;
      wrongRecallDelta: number;
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-47-gate.ts";
  outputDir: string;
  phase: "phase-47";
  runDirectory: string;
  runId: string;
}

interface Phase47ProviderReportSnapshot {
  acceptance?: {
    decision?: unknown;
  };
  defaultScenario?: {
    autoBodyResolvedStrategy?: unknown;
    noStrategyResolvedStrategy?: unknown;
    providerRuntimeAvailable?: unknown;
    requestedStrategy?: unknown;
    resolvedStrategy?: unknown;
    rulesOnlyDefaultPreserved?: unknown;
  };
  fallbackScenario?: {
    fallbackReason?: unknown;
    requestedStrategy?: unknown;
    resolvedStrategy?: unknown;
    rulesOnlyContextRecovered?: unknown;
    silentProviderFailure?: unknown;
  };
  generatedBy?: unknown;
  inputs?: {
    phase45AdoptionReport?: {
      providerBackedStatus?: unknown;
      reportPath?: unknown;
      runId?: unknown;
      status?: unknown;
    };
    phase46QualityReport?: {
      providerBackedPromotionSeparated?: unknown;
      reportPath?: unknown;
      runId?: unknown;
      status?: unknown;
    };
  };
  metrics?: {
    fallbackVisibleCount?: unknown;
    providerBackedObservedCount?: unknown;
    rulesOnlyDefaultPreserved?: unknown;
    scenarioCount?: unknown;
    setupFragilityDelta?: unknown;
    staleRecallDelta?: unknown;
    usefulRecallDelta?: unknown;
    wrongRecallDelta?: unknown;
  };
  mode?: unknown;
  phase?: unknown;
  promotionCriteria?: {
    maxSetupFragilityDelta?: unknown;
    maxStaleRecallDelta?: unknown;
    maxWrongRecallDelta?: unknown;
    minUsefulRecallDelta?: unknown;
    requireFallbackVisible?: unknown;
    requireNoDefaultPromotion?: unknown;
  };
  rawTranscriptPersistence?: {
    persistedRawTranscripts?: unknown;
  };
  runId?: unknown;
  scenarios?: unknown;
  scope?: {
    outOfScope?: unknown;
  };
}

interface ParsedPhase47ProviderReport {
  acceptance: { decision: "accepted" | "blocked" };
  defaultScenario: {
    autoBodyResolvedStrategy?: string;
    noStrategyResolvedStrategy?: string;
    providerRuntimeAvailable?: boolean;
    requestedStrategy?: string;
    resolvedStrategy?: string;
    rulesOnlyDefaultPreserved?: boolean;
  };
  fallbackScenario: {
    fallbackReason?: string;
    requestedStrategy?: string;
    resolvedStrategy?: string;
    rulesOnlyContextRecovered?: boolean;
    silentProviderFailure?: boolean;
  };
  inputs: {
    phase45AdoptionReport: {
      providerBackedStatus: "skipped" | "accepted";
      reportPath: string;
      runId: string;
      status: "accepted" | "blocked";
    };
    phase46QualityReport: {
      providerBackedPromotionSeparated: boolean;
      reportPath: string;
      runId: string;
      status: "accepted" | "blocked";
    };
  };
  metrics: Phase47GateReport["evidence"]["providerReportMetrics"];
  runId: typeof CANONICAL_PHASE47_PROVIDER_RUN_ID;
  scenarios: Array<{
    providerBacked?: {
      fallbackReason?: unknown;
      resolvedStrategy?: unknown;
      staleRecall?: unknown;
      usefulRecall?: unknown;
      wrongRecall?: unknown;
    };
    qualityDelta?: {
      setupFragility?: unknown;
      staleRecall?: unknown;
      usefulRecall?: unknown;
      wrongRecall?: unknown;
    };
    rulesOnly?: {
      resolvedStrategy?: unknown;
    };
  }>;
}

const GENERATED_BY = "scripts/run-phase-47-gate.ts";
const CANONICAL_PHASE45_ADOPTION_RUN_ID = "run-20260427104530-adoption-eval";
const CANONICAL_PHASE46_QUALITY_RUN_ID = "run-20260427123000-quality-eval";
const CANONICAL_PHASE47_PROVIDER_RUN_ID =
  "run-20260428120000-provider-rollout-eval";
const CANONICAL_PHASE45_ADOPTION_REPORT_RELATIVE_PATH = join(
  "reports/eval/adoption/phase-45",
  CANONICAL_PHASE45_ADOPTION_RUN_ID,
  "report.json",
);
const CANONICAL_PHASE46_QUALITY_REPORT_RELATIVE_PATH = join(
  "reports/eval/fallback/phase-46",
  CANONICAL_PHASE46_QUALITY_RUN_ID,
  "report.json",
);

export function resolvePhase47GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-47");
}

export function resolvePhase47CanonicalProviderReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-47",
    CANONICAL_PHASE47_PROVIDER_RUN_ID,
    "report.json",
  );
}

export function buildPhase47GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase47GateCliOptions(
  argv: readonly string[],
): Phase47GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    providerReportPath: resolveCliFlagValue(argv, "--provider-report-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase47GateCommands(root: string): Phase47GateCommand[] {
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
        "tests/unit/run-phase-47.provider-rollout-eval.test.ts",
        "tests/unit/run-phase-47-gate.test.ts",
        "tests/unit/phase-45-reference-product-runtime.test.ts",
        "tests/integration/python-http-bridge.test.ts",
        "--test-name-pattern",
        "run-phase-47|provider-backed|provider failure|auto and omitted|llm-assisted recall|recall strategy",
      ],
      cwd: root,
      label: "phase-47-provider-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-46",
        "--run-id",
        CANONICAL_PHASE46_QUALITY_RUN_ID,
      ],
      cwd: root,
      label: "phase-46-quality-eval-prerequisite",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-47",
        "--run-id",
        CANONICAL_PHASE47_PROVIDER_RUN_ID,
      ],
      cwd: root,
      label: "phase-47-provider-rollout-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-47|package metadata exposes bin|current status doc points|task-board current note|root exports stay aligned|models fallback eval evidence",
      ],
      cwd: root,
      env: {
        PHASE47_GATE_IN_PROGRESS: "1",
      },
      label: "phase-47-release-regressions",
    },
  ];
}

function normalizeRepoRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? relative(root, path) : path;
}

function isAcceptedStatus(value: unknown): value is "accepted" | "blocked" {
  return value === "accepted" || value === "blocked";
}

function parseProviderReport(raw: string): ParsedPhase47ProviderReport {
  const parsed = JSON.parse(raw) as Phase47ProviderReportSnapshot;
  const metrics = parsed.metrics;
  const defaultScenario = parsed.defaultScenario;
  const phase45Input = parsed.inputs?.phase45AdoptionReport;
  const phase46Input = parsed.inputs?.phase46QualityReport;
  const scenarios = Array.isArray(parsed.scenarios)
    ? parsed.scenarios as ParsedPhase47ProviderReport["scenarios"]
    : [];
  const outOfScope = parsed.scope?.outOfScope;

  if (
    !isAcceptedStatus(parsed.acceptance?.decision) ||
    parsed.generatedBy !== "scripts/run-phase-47-provider-rollout-eval.ts" ||
    parsed.mode !== "provider-backed-retrieval-rollout" ||
    parsed.phase !== "phase-47" ||
    parsed.runId !== CANONICAL_PHASE47_PROVIDER_RUN_ID ||
    parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    !isAcceptedStatus(phase45Input?.status) ||
    phase45Input.runId !== CANONICAL_PHASE45_ADOPTION_RUN_ID ||
    phase45Input.providerBackedStatus !== "skipped" ||
    typeof phase45Input.reportPath !== "string" ||
    !isAcceptedStatus(phase46Input?.status) ||
    phase46Input.runId !== CANONICAL_PHASE46_QUALITY_RUN_ID ||
    phase46Input.providerBackedPromotionSeparated !== true ||
    typeof phase46Input.reportPath !== "string" ||
    typeof defaultScenario?.autoBodyResolvedStrategy !== "string" ||
    typeof defaultScenario.noStrategyResolvedStrategy !== "string" ||
    typeof defaultScenario.providerRuntimeAvailable !== "boolean" ||
    typeof defaultScenario?.requestedStrategy !== "string" ||
    typeof defaultScenario.resolvedStrategy !== "string" ||
    typeof defaultScenario.rulesOnlyDefaultPreserved !== "boolean" ||
    parsed.promotionCriteria?.minUsefulRecallDelta !== 1 ||
    parsed.promotionCriteria.maxWrongRecallDelta !== 0 ||
    parsed.promotionCriteria.maxStaleRecallDelta !== 0 ||
    parsed.promotionCriteria.maxSetupFragilityDelta !== 0 ||
    parsed.promotionCriteria.requireFallbackVisible !== true ||
    parsed.promotionCriteria.requireNoDefaultPromotion !== true ||
    typeof metrics?.fallbackVisibleCount !== "number" ||
    typeof metrics.providerBackedObservedCount !== "number" ||
    typeof metrics.rulesOnlyDefaultPreserved !== "boolean" ||
    typeof metrics.scenarioCount !== "number" ||
    typeof metrics.setupFragilityDelta !== "number" ||
    typeof metrics.staleRecallDelta !== "number" ||
    typeof metrics.usefulRecallDelta !== "number" ||
    typeof metrics.wrongRecallDelta !== "number" ||
    scenarios.length === 0 ||
    !Array.isArray(outOfScope) ||
    !outOfScope.includes("provider-backed retrieval default-on rollout") ||
    !outOfScope.includes("root public API widening")
  ) {
    throw new Error("Phase 47 provider rollout report does not match the expected schema.");
  }

  return {
    acceptance: { decision: parsed.acceptance.decision },
    defaultScenario: {
      autoBodyResolvedStrategy: defaultScenario.autoBodyResolvedStrategy,
      noStrategyResolvedStrategy: defaultScenario.noStrategyResolvedStrategy,
      providerRuntimeAvailable: defaultScenario.providerRuntimeAvailable,
      requestedStrategy: defaultScenario.requestedStrategy,
      resolvedStrategy: defaultScenario.resolvedStrategy,
      rulesOnlyDefaultPreserved:
        defaultScenario.rulesOnlyDefaultPreserved,
    },
    fallbackScenario: {
      fallbackReason:
        typeof parsed.fallbackScenario?.fallbackReason === "string"
          ? parsed.fallbackScenario.fallbackReason
          : undefined,
      requestedStrategy:
        typeof parsed.fallbackScenario?.requestedStrategy === "string"
          ? parsed.fallbackScenario.requestedStrategy
          : undefined,
      resolvedStrategy:
        typeof parsed.fallbackScenario?.resolvedStrategy === "string"
          ? parsed.fallbackScenario.resolvedStrategy
          : undefined,
      rulesOnlyContextRecovered:
        typeof parsed.fallbackScenario?.rulesOnlyContextRecovered === "boolean"
          ? parsed.fallbackScenario.rulesOnlyContextRecovered
          : undefined,
      silentProviderFailure:
        typeof parsed.fallbackScenario?.silentProviderFailure === "boolean"
          ? parsed.fallbackScenario.silentProviderFailure
          : undefined,
    },
    inputs: {
      phase45AdoptionReport: {
        providerBackedStatus: phase45Input.providerBackedStatus,
        reportPath: phase45Input.reportPath,
        runId: phase45Input.runId,
        status: phase45Input.status,
      },
      phase46QualityReport: {
        providerBackedPromotionSeparated:
          phase46Input.providerBackedPromotionSeparated,
        reportPath: phase46Input.reportPath,
        runId: phase46Input.runId,
        status: phase46Input.status,
      },
    },
    metrics: {
      fallbackVisibleCount: metrics.fallbackVisibleCount,
      providerBackedObservedCount: metrics.providerBackedObservedCount,
      rulesOnlyDefaultPreserved: metrics.rulesOnlyDefaultPreserved,
      scenarioCount: metrics.scenarioCount,
      setupFragilityDelta: metrics.setupFragilityDelta,
      staleRecallDelta: metrics.staleRecallDelta,
      usefulRecallDelta: metrics.usefulRecallDelta,
      wrongRecallDelta: metrics.wrongRecallDelta,
    },
    runId: CANONICAL_PHASE47_PROVIDER_RUN_ID,
    scenarios,
  };
}

type Phase47ProviderReportMetrics =
  Phase47GateReport["evidence"]["providerReportMetrics"];

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function computeProviderReportMetrics(
  report: ParsedPhase47ProviderReport,
): Phase47ProviderReportMetrics | null {
  let setupFragilityDelta = 0;
  let staleRecallDelta = 0;
  let usefulRecallDelta = 0;
  let wrongRecallDelta = 0;

  for (const scenario of report.scenarios) {
    const setupFragility = optionalNumber(scenario.qualityDelta?.setupFragility);
    const staleRecall = optionalNumber(scenario.qualityDelta?.staleRecall);
    const usefulRecall = optionalNumber(scenario.qualityDelta?.usefulRecall);
    const wrongRecall = optionalNumber(scenario.qualityDelta?.wrongRecall);

    if (
      setupFragility === null ||
      staleRecall === null ||
      usefulRecall === null ||
      wrongRecall === null
    ) {
      return null;
    }

    setupFragilityDelta += setupFragility;
    staleRecallDelta += staleRecall;
    usefulRecallDelta += usefulRecall;
    wrongRecallDelta += wrongRecall;
  }

  return {
    fallbackVisibleCount:
      report.fallbackScenario.fallbackReason === "provider_error" &&
      report.fallbackScenario.requestedStrategy === "hybrid" &&
      report.fallbackScenario.resolvedStrategy === "rules-only" &&
      report.fallbackScenario.rulesOnlyContextRecovered === true &&
      report.fallbackScenario.silentProviderFailure === false
        ? 1
        : 0,
    providerBackedObservedCount: report.scenarios.filter((scenario) =>
      scenario.providerBacked?.resolvedStrategy === "hybrid" &&
      scenario.providerBacked.fallbackReason === undefined &&
      scenario.providerBacked.usefulRecall === true &&
      scenario.providerBacked.wrongRecall !== true
    ).length,
    rulesOnlyDefaultPreserved:
      report.defaultScenario.requestedStrategy === "auto" &&
      report.defaultScenario.resolvedStrategy === "rules-only" &&
      report.defaultScenario.noStrategyResolvedStrategy === "rules-only" &&
      report.defaultScenario.autoBodyResolvedStrategy === "rules-only" &&
      report.defaultScenario.providerRuntimeAvailable === true &&
      report.defaultScenario.rulesOnlyDefaultPreserved === true,
    scenarioCount: report.scenarios.length,
    setupFragilityDelta,
    staleRecallDelta,
    usefulRecallDelta,
    wrongRecallDelta,
  };
}

function providerReportMetricsMatch(
  reported: Phase47ProviderReportMetrics,
  computed: Phase47ProviderReportMetrics,
): boolean {
  return (
    reported.fallbackVisibleCount === computed.fallbackVisibleCount &&
    reported.providerBackedObservedCount === computed.providerBackedObservedCount &&
    reported.rulesOnlyDefaultPreserved === computed.rulesOnlyDefaultPreserved &&
    reported.scenarioCount === computed.scenarioCount &&
    reported.setupFragilityDelta === computed.setupFragilityDelta &&
    reported.staleRecallDelta === computed.staleRecallDelta &&
    reported.usefulRecallDelta === computed.usefulRecallDelta &&
    reported.wrongRecallDelta === computed.wrongRecallDelta
  );
}

function validateProviderReport(input: {
  computedMetrics: Phase47ProviderReportMetrics | null;
  report: ParsedPhase47ProviderReport;
  reportPath: string;
  root: string;
}): Phase47ProviderReportEvidence {
  const accepted =
    input.report.acceptance.decision === "accepted" &&
    input.report.inputs.phase45AdoptionReport.status === "accepted" &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase45AdoptionReport.reportPath,
    ) === CANONICAL_PHASE45_ADOPTION_REPORT_RELATIVE_PATH &&
    input.report.inputs.phase46QualityReport.status === "accepted" &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase46QualityReport.reportPath,
    ) === CANONICAL_PHASE46_QUALITY_REPORT_RELATIVE_PATH &&
    input.report.fallbackScenario.requestedStrategy === "hybrid" &&
    input.report.fallbackScenario.resolvedStrategy === "rules-only" &&
    input.report.fallbackScenario.fallbackReason === "provider_error" &&
    input.report.fallbackScenario.rulesOnlyContextRecovered === true &&
    input.report.fallbackScenario.silentProviderFailure === false &&
    input.computedMetrics !== null &&
    providerReportMetricsMatch(input.report.metrics, input.computedMetrics) &&
    input.computedMetrics.providerBackedObservedCount > 0 &&
    input.computedMetrics.usefulRecallDelta >= 1 &&
    input.computedMetrics.wrongRecallDelta <= 0 &&
    input.computedMetrics.staleRecallDelta <= 0 &&
    input.computedMetrics.setupFragilityDelta <= 0 &&
    input.computedMetrics.fallbackVisibleCount > 0 &&
    input.computedMetrics.rulesOnlyDefaultPreserved &&
    input.report.scenarios.every((scenario) =>
      scenario.providerBacked?.resolvedStrategy === "hybrid" &&
      scenario.providerBacked.usefulRecall === true &&
      scenario.providerBacked.wrongRecall !== true &&
      scenario.providerBacked.staleRecall !== true &&
      scenario.rulesOnly?.resolvedStrategy === "rules-only" &&
      typeof scenario.qualityDelta?.usefulRecall === "number" &&
      scenario.qualityDelta.usefulRecall >= 1 &&
      typeof scenario.qualityDelta.wrongRecall === "number" &&
      scenario.qualityDelta.wrongRecall <= 0 &&
      typeof scenario.qualityDelta.staleRecall === "number" &&
      scenario.qualityDelta.staleRecall <= 0 &&
      typeof scenario.qualityDelta.setupFragility === "number" &&
      scenario.qualityDelta.setupFragility <= 0
    );

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath: relative(input.root, input.reportPath),
    reason: accepted
      ? "Phase 47 provider rollout eval evidence is accepted."
      : "Phase 47 provider rollout eval evidence is incomplete.",
    regenerateCommand:
      `bun run eval:phase-46 --run-id ${CANONICAL_PHASE46_QUALITY_RUN_ID} && bun run eval:phase-47 --run-id ${CANONICAL_PHASE47_PROVIDER_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

function docsAreAligned(input: {
  archiveDoc: string;
  archiveIndex: string;
  breakdown: string;
  currentStatus: string;
  taskBoard: string;
}): boolean {
  return (
    input.currentStatus.includes(
      "Phase 47 is now closed as the Provider-Backed Retrieval Rollout and Quality Promotion slice",
    ) &&
    input.currentStatus.includes(
      "reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json",
    ) &&
    input.currentStatus.includes(
      "reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json",
    ) &&
    input.currentStatus.includes(
      "docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md",
    ) &&
    input.archiveDoc.includes("Canonical accepted gate run: `run-20260428123000`") &&
    input.archiveDoc.includes(CANONICAL_PHASE47_PROVIDER_RUN_ID) &&
    input.archiveDoc.includes("provider-backed retrieval") &&
    input.archiveDoc.includes("rules-only fallback") &&
    input.archiveDoc.includes("provider_error") &&
    input.archiveDoc.includes("root public API widening") &&
    input.archiveIndex.includes("GoodMemory-Phase-47-Quality-Gate.md") &&
    input.taskBoard.includes("[DONE] Phase 47 is closed") &&
    input.taskBoard.includes(
      "reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json",
    ) &&
    input.taskBoard.includes(
      "reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json",
    ) &&
    input.breakdown.includes("[DONE] P47.4-T002") &&
    input.breakdown.includes("[DONE] P47.4-T003") &&
    input.breakdown.includes("GoodMemory-Phase-47-Quality-Gate.md")
  );
}

async function readText(
  path: string,
  dependencies: Phase47GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runGateCommands(
  commands: Phase47GateCommand[],
  dependencies: Phase47GateDependencies,
): Promise<Array<Phase47GateCommandResult & { label: string }>> {
  const results: Array<Phase47GateCommandResult & { label: string }> = [];
  for (const command of commands) {
    const result = await (dependencies.runCommand ?? runCommand)(command);
    results.push({
      ...result,
      label: command.label,
    });
    if (result.exitCode !== 0) {
      break;
    }
  }
  return results;
}

async function runCommand(
  command: Phase47GateCommand,
): Promise<Phase47GateCommandResult> {
  const started = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: {
      ...process.env,
      ...(command.env ?? {}),
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    durationMs: Date.now() - started,
    exitCode,
    stderr,
    stdout,
  };
}

export async function runPhase47QualityGate(
  options: Phase47GateOptions = {},
  dependencies: Phase47GateDependencies = {},
): Promise<Phase47GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase47GateOutputDir(root);
  const runId = options.runId ?? buildPhase47GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const expectedCommands = buildPhase47GateCommands(root);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(expectedCommands, dependencies);
  const providerReportPath =
    options.providerReportPath ?? resolvePhase47CanonicalProviderReportPath(root);
  const providerReport = parseProviderReport(
    await readText(providerReportPath, dependencies),
  );
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    scripts?: Record<string, unknown>;
  };
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const httpBridgeSource = await readText(join(root, "src/http/index.ts"), dependencies);
  const currentStatus = await readText(
    join(root, "docs/GoodMemory-Current-Status-and-Evidence.md"),
    dependencies,
  );
  const archiveDoc = await readText(
    join(root, "docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md"),
    dependencies,
  );
  const archiveIndex = await readText(
    join(root, "docs/archive/quality-gates/README.md"),
    dependencies,
  );
  const taskBoard = await readText(
    join(root, "task-board/52-phase-47-provider-backed-retrieval-rollout-and-quality-promotion.txt"),
    dependencies,
  );
  const breakdown = await readText(
    join(root, "task-board/phase-47-provider-backed-retrieval-rollout-and-quality-promotion/04-docs-gate-and-closure.txt"),
    dependencies,
  );
  const computedProviderReportMetrics =
    computeProviderReportMetrics(providerReport);
  const providerReportEvidence = validateProviderReport({
    computedMetrics: computedProviderReportMetrics,
    report: providerReport,
    reportPath: providerReportPath,
    root,
  });
  const evidence = {
    docsAligned: docsAreAligned({
      archiveDoc,
      archiveIndex,
      breakdown,
      currentStatus,
      taskBoard,
    }),
    httpBridgeDiagnostics:
      httpBridgeSource.includes("GoodMemoryHttpRecallRoutingDiagnostics") &&
      httpBridgeSource.includes("providerFallback") &&
      httpBridgeSource.includes("provider_error") &&
      httpBridgeSource.includes("Expected strategy to be auto, rules-only, or hybrid."),
    noRootApiWidening:
      !rootSource.includes("runPhase47") &&
      !rootSource.includes("providerFallback") &&
      !rootSource.includes("ProviderRollout"),
    packageScriptsRegistered:
      packageJson.scripts?.["eval:phase-47"] ===
        "bun run scripts/run-phase-47-provider-rollout-eval.ts" &&
      packageJson.scripts?.["gate:phase-47"] ===
        "bun run scripts/run-phase-47-gate.ts",
    providerReport: providerReportEvidence,
    providerReportMetrics: computedProviderReportMetrics ?? providerReport.metrics,
  };
  const accepted =
    providerReportEvidence.status === "accepted" &&
    evidence.docsAligned &&
    evidence.httpBridgeDiagnostics &&
    evidence.noRootApiWidening &&
    evidence.packageScriptsRegistered &&
    commands.length === expectedCommands.length &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase47GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 47 provider-backed retrieval rollout is accepted with explicit hybrid enablement, fail-visible provider fallback, positive useful recall delta, no wrong/stale/setup fragility increase, docs alignment, and no root API widening."
        : "Phase 47 gate blocked because provider rollout evidence, regressions, docs, diagnostics, or boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-47",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-47-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export async function runPhase47GateCli(
  dependencies: Phase47GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase47GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase47QualityGate)(options);
    dependencies.log?.(
      `Phase 47 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(
      error instanceof Error ? error.message : String(error),
    );
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase47GateCli();
}
