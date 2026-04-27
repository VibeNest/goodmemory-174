#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase45GateOptions {
  adoptionReportPath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase45GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase45GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase45GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase45GateCommand) => Promise<Phase45GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase45GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase45GateOptions) => Promise<Phase45GateReport>;
}

export interface Phase45AdoptionReportEvidence {
  artifactKind: "tracked_report";
  reportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase45GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase45GateCommandResult & { label: string }>;
  evidence: {
    adoptionMetrics: {
      noMemoryLeakRate: number;
      observeAcceptedCandidateCount: number;
      observeRejectedCandidateCount: number;
      observeReviewedCandidateCount: number;
      providerBackedStatus: "accepted" | "skipped";
      scenarioCount: number;
      viewerMutationRejected: boolean;
    };
    adoptionReport: Phase45AdoptionReportEvidence;
    docsAligned: boolean;
    noRootApiWidening: boolean;
    packageScriptsRegistered: boolean;
    referenceProductPublicSurface: boolean;
    viewerReadOnlyInspectability: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-45-gate.ts";
  outputDir: string;
  phase: "phase-45";
  runDirectory: string;
  runId: string;
}

interface Phase45AdoptionReportSnapshot {
  acceptance?: {
    decision?: unknown;
  };
  generatedBy?: unknown;
  metrics?: {
    correctionSuccessRate?: unknown;
    missedRecallRate?: unknown;
    noMemoryLeakRate?: unknown;
    observeToSelectiveConversionReadiness?: {
      acceptedReviewedRatio?: unknown;
      observedCandidatesAcceptedAsUseful?: unknown;
      observedCandidatesRejectedAsUnsafeOrNoisy?: unknown;
      observedCandidatesReviewed?: unknown;
      scenariosWhereSelectiveWritebackJustified?: unknown;
    };
    staleMemoryRate?: unknown;
    wrongRecallRate?: unknown;
  };
  mode?: unknown;
  phase?: unknown;
  rawTranscriptPersistence?: {
    persistedRawTranscripts?: unknown;
  };
  runId?: unknown;
  scenarios?: unknown;
  scope?: {
    outOfScope?: unknown;
  };
  variants?: {
    noMemory?: {
      observed?: unknown;
    };
    providerBackedGoodMemory?: {
      status?: unknown;
    };
    rulesOnlyGoodMemory?: {
      storage?: unknown;
    };
  };
}

interface ParsedPhase45AdoptionReport {
  acceptance: { decision: "accepted" | "blocked" };
  metrics: {
    correctionSuccessRate: number;
    missedRecallRate: number;
    noMemoryLeakRate: number;
    observeToSelectiveConversionReadiness: {
      acceptedReviewedRatio: number;
      observedCandidatesAcceptedAsUseful: number;
      observedCandidatesRejectedAsUnsafeOrNoisy: number;
      observedCandidatesReviewed: number;
      scenariosWhereSelectiveWritebackJustified: number;
    };
    staleMemoryRate: number;
    wrongRecallRate: number;
  };
  runId: typeof CANONICAL_PHASE45_ADOPTION_RUN_ID;
  scenarios: Phase45ScenarioSnapshot[];
  variants: {
    providerBackedGoodMemory: {
      status: "skipped";
    };
  };
}

interface Phase45ScenarioSnapshot {
  checks?: unknown;
  family?: unknown;
  noMemory?: {
    missedRecall?: unknown;
    observed?: unknown;
    usefulRecall?: unknown;
    wrongRecall?: unknown;
  };
  passed?: unknown;
  productPath?: unknown;
  providerBacked?: {
    missedRecall?: unknown;
    observed?: unknown;
    status?: unknown;
    usefulRecall?: unknown;
    wrongRecall?: unknown;
  };
  rawTranscriptPersisted?: unknown;
  redactedEvidence?: Record<string, unknown>;
  rulesOnlyGoodMemory?: {
    usefulRecall?: unknown;
    wrongRecall?: unknown;
  };
}

const GENERATED_BY = "scripts/run-phase-45-gate.ts";
const CANONICAL_PHASE45_ADOPTION_RUN_ID = "run-20260427104530-adoption-eval";
const PHASE45_REQUIRED_SCENARIO_FAMILIES = [
  "identity_background_continuity",
  "project_preference_continuity",
  "coding_style_preference_continuity",
  "historical_task_continuation",
  "user_correction_targeted_revise",
  "wrong_memory_forget",
  "procedural_feedback_memory",
  "observe_writeback_candidate_visibility",
  "selective_writeback_next_turn_recall",
  "no_provider_rules_only_fallback",
  "optional_provider_backed_retrieval_uplift",
  "local_viewer_trace_writeback_session_inspection",
] as const;

export function resolvePhase45GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-45");
}

export function resolvePhase45CanonicalAdoptionReportPath(root: string): string {
  return join(
    root,
    "reports/eval/adoption/phase-45",
    CANONICAL_PHASE45_ADOPTION_RUN_ID,
    "report.json",
  );
}

export function buildPhase45GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase45GateCliOptions(
  argv: readonly string[],
): Phase45GateOptions {
  return {
    adoptionReportPath: resolveCliFlagValue(argv, "--adoption-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase45GateCommands(root: string): Phase45GateCommand[] {
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
        "tests/unit/phase-45-reference-product-contract.test.ts",
        "tests/unit/phase-45-reference-product-runtime.test.ts",
        "tests/unit/run-phase-45.adoption-eval.test.ts",
        "tests/unit/run-phase-45-gate.test.ts",
        "tests/unit/runtime-viewer.test.ts",
        "tests/integration/python-http-bridge.test.ts",
        "--test-name-pattern",
        "phase-45|runtime viewer|python http bridge|run-phase-45",
      ],
      cwd: root,
      label: "phase-45-reference-product-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-45",
        "--run-id",
        CANONICAL_PHASE45_ADOPTION_RUN_ID,
      ],
      cwd: root,
      label: "phase-45-adoption-eval",
    },
    {
      args: ["bun", "run", "example:reference-product"],
      cwd: root,
      label: "reference-product-smoke",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-45|reference product|package metadata exposes bin|current status doc points|task-board current note|packs a tarball|root exports stay aligned|models fallback eval evidence",
      ],
      cwd: root,
      env: {
        PHASE45_GATE_IN_PROGRESS: "1",
      },
      label: "phase-45-release-regressions",
    },
  ];
}

export async function runPhase45QualityGate(
  options: Phase45GateOptions = {},
  dependencies: Phase45GateDependencies = {},
): Promise<Phase45GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase45GateOutputDir(root);
  const runId = options.runId ?? buildPhase45GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(buildPhase45GateCommands(root), dependencies);
  const adoptionReportPath =
    options.adoptionReportPath ?? resolvePhase45CanonicalAdoptionReportPath(root);
  const adoptionReport = parseAdoptionReport(
    await readText(adoptionReportPath, dependencies),
  );
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    exports?: Record<string, unknown>;
    scripts?: Record<string, unknown>;
  };
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const viewerSource = await readText(
    join(root, "src/runtime-viewer/public.ts"),
    dependencies,
  );
  const referenceProductBackend = await readText(
    join(root, "examples/reference-chat-product/backend.ts"),
    dependencies,
  );
  const referenceProductFastapi = await readText(
    join(root, "examples/reference-chat-product/fastapi_backend.py"),
    dependencies,
  );
  const referenceProductReadme = await readText(
    join(root, "examples/reference-chat-product/README.md"),
    dependencies,
  );
  const currentStatus = await readText(
    join(root, "docs/GoodMemory-Current-Status-and-Evidence.md"),
    dependencies,
  );
  const archiveDoc = await readText(
    join(root, "docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md"),
    dependencies,
  );
  const taskBoard = await readText(
    join(root, "task-board/50-phase-45-first-reference-product-and-adoption-evidence.txt"),
    dependencies,
  );
  const adoptionReportEvidence = validatePhase45AdoptionReport({
    report: adoptionReport,
    reportPath: adoptionReportPath,
    root,
  });
  const viewerScenario = adoptionReport.scenarios.find((scenario) =>
    scenario.family === "local_viewer_trace_writeback_session_inspection"
  );
  const evidence = {
    adoptionMetrics: {
      noMemoryLeakRate: adoptionReport.metrics.noMemoryLeakRate,
      observeAcceptedCandidateCount:
        adoptionReport.metrics.observeToSelectiveConversionReadiness
          .observedCandidatesAcceptedAsUseful,
      observeRejectedCandidateCount:
        adoptionReport.metrics.observeToSelectiveConversionReadiness
          .observedCandidatesRejectedAsUnsafeOrNoisy,
      observeReviewedCandidateCount:
        adoptionReport.metrics.observeToSelectiveConversionReadiness
          .observedCandidatesReviewed,
      providerBackedStatus:
        adoptionReport.variants.providerBackedGoodMemory.status,
      scenarioCount: adoptionReport.scenarios.length,
      viewerMutationRejected:
        viewerScenario?.redactedEvidence?.viewerMutationRejected === true,
    },
    adoptionReport: adoptionReportEvidence,
    docsAligned: docsAreAligned({
      archiveDoc,
      currentStatus,
      referenceProductReadme,
      taskBoard,
    }),
    noRootApiWidening:
      !rootSource.includes("reference-chat-product") &&
      !rootSource.includes("runPhase45") &&
      !rootSource.includes("createRuntimeViewerApp") &&
      !rootSource.includes("runtime-viewer"),
    packageScriptsRegistered:
      packageJson.scripts?.["eval:phase-45"] ===
        "bun run scripts/run-phase-45-adoption-eval.ts" &&
      packageJson.scripts?.["gate:phase-45"] ===
        "bun run scripts/run-phase-45-gate.ts" &&
      packageJson.scripts?.["example:reference-product"] ===
        "bun run examples/reference-chat-product/backend.ts smoke" &&
      packageJson.exports?.["./reference-product"] === undefined &&
      packageJson.exports?.["./runtime-viewer"] === undefined,
    referenceProductPublicSurface: referenceProductUsesPublicSurface({
      backend: referenceProductBackend,
      fastapi: referenceProductFastapi,
      readme: referenceProductReadme,
    }),
    viewerReadOnlyInspectability:
      viewerScenarioHasInspectability(viewerScenario) &&
      viewerSource.includes("normalizeRuntimeViewerBindHost") &&
      viewerSource.includes("GoodMemory runtime viewer is read-only") &&
      viewerSource.includes("access-control-allow-origin") === false &&
      viewerSource.includes("rawTranscriptPersisted: false"),
  };
  const accepted =
    adoptionReportEvidence.status === "accepted" &&
    adoptionReport.variants.providerBackedGoodMemory.status === "skipped" &&
    adoptionReport.metrics.noMemoryLeakRate === 0 &&
    adoptionReport.metrics.missedRecallRate === 0 &&
    adoptionReport.metrics.wrongRecallRate === 0 &&
    adoptionReport.metrics.correctionSuccessRate === 1 &&
    adoptionReport.metrics.staleMemoryRate === 0 &&
    observeReadinessIsAccepted(
      adoptionReport.metrics.observeToSelectiveConversionReadiness,
    ) &&
    evidence.noRootApiWidening &&
    evidence.packageScriptsRegistered &&
    evidence.referenceProductPublicSurface &&
    evidence.viewerReadOnlyInspectability &&
    evidence.docsAligned &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase45GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 45 reference product adoption is accepted with a public-surface reference product, observed no-memory baseline, rules-only GoodMemory uplift, redacted local-viewer inspectability, backend-only mutation flows, package/docs alignment, and no root API widening."
        : "Phase 45 gate blocked because adoption evidence, regressions, docs, or boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-45",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-45-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function validatePhase45AdoptionReport(input: {
  report: ParsedPhase45AdoptionReport;
  reportPath: string;
  root: string;
}): Phase45AdoptionReportEvidence {
  const accepted =
    input.report.acceptance.decision === "accepted" &&
    input.report.runId === CANONICAL_PHASE45_ADOPTION_RUN_ID &&
    input.report.scenarios.length === PHASE45_REQUIRED_SCENARIO_FAMILIES.length &&
    PHASE45_REQUIRED_SCENARIO_FAMILIES.every((family) =>
      input.report.scenarios.some((scenario) =>
        scenario.family === family && scenario.passed === true
      )
    ) &&
    input.report.scenarios.every((scenario) =>
      scenario.productPath === "reference-product-backend" &&
      scenario.rawTranscriptPersisted === false &&
      scenario.noMemory?.observed === true &&
      scenario.noMemory.usefulRecall === false &&
      scenario.noMemory.wrongRecall === false &&
      scenario.noMemory.missedRecall === true
    ) &&
    viewerScenarioHasInspectability(
      input.report.scenarios.find((scenario) =>
        scenario.family === "local_viewer_trace_writeback_session_inspection"
      ),
    );
  const reportPath = relative(input.root, input.reportPath);

  return {
    artifactKind: "tracked_report",
    reportPath,
    reason: accepted
      ? "Phase 45 reference-product adoption evidence is accepted."
      : "Phase 45 reference-product adoption evidence is incomplete.",
    regenerateCommand:
      `bun run eval:phase-45 --run-id ${CANONICAL_PHASE45_ADOPTION_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

function parseAdoptionReport(raw: string): ParsedPhase45AdoptionReport {
  const parsed = JSON.parse(raw) as Phase45AdoptionReportSnapshot;
  const metrics = parsed.metrics;
  const readiness = metrics?.observeToSelectiveConversionReadiness;
  const rawScenarios = parsed.scenarios;
  const outOfScope = parsed.scope?.outOfScope;
  if (
    parsed.acceptance?.decision !== "accepted" &&
    parsed.acceptance?.decision !== "blocked"
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }
	if (
	  parsed.generatedBy !== "scripts/run-phase-45-adoption-eval.ts" ||
	  parsed.mode !== "reference-product-adoption-eval" ||
	  parsed.phase !== "phase-45" ||
	  parsed.runId !== CANONICAL_PHASE45_ADOPTION_RUN_ID ||
	  parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
	  parsed.variants?.noMemory?.observed !== true ||
	  parsed.variants.rulesOnlyGoodMemory?.storage !== "memory" ||
	  (
	    parsed.variants.providerBackedGoodMemory?.status !== "accepted" &&
	    parsed.variants.providerBackedGoodMemory?.status !== "skipped"
	  ) ||
	  typeof metrics?.correctionSuccessRate !== "number" ||
	  typeof metrics.missedRecallRate !== "number" ||
	  typeof metrics.noMemoryLeakRate !== "number" ||
	  typeof readiness?.acceptedReviewedRatio !== "number" ||
	  typeof readiness.observedCandidatesAcceptedAsUseful !== "number" ||
	  typeof readiness.observedCandidatesRejectedAsUnsafeOrNoisy !== "number" ||
	  typeof readiness.observedCandidatesReviewed !== "number" ||
	  typeof readiness.scenariosWhereSelectiveWritebackJustified !== "number" ||
	  typeof metrics.staleMemoryRate !== "number" ||
	  typeof metrics.wrongRecallRate !== "number" ||
    !Array.isArray(rawScenarios) ||
    !Array.isArray(outOfScope) ||
    !outOfScope.includes("new root public API")
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }
  if (
    !PHASE45_REQUIRED_SCENARIO_FAMILIES.every((family) =>
      rawScenarios.some((scenario) =>
        isPhase45ScenarioSnapshot(scenario) && scenario.family === family
      )
    )
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }

  const parsedReadiness = {
    acceptedReviewedRatio: readiness.acceptedReviewedRatio,
    observedCandidatesAcceptedAsUseful:
      readiness.observedCandidatesAcceptedAsUseful,
    observedCandidatesRejectedAsUnsafeOrNoisy:
      readiness.observedCandidatesRejectedAsUnsafeOrNoisy,
    observedCandidatesReviewed: readiness.observedCandidatesReviewed,
    scenariosWhereSelectiveWritebackJustified:
      readiness.scenariosWhereSelectiveWritebackJustified,
  };
  const scenarios = rawScenarios.filter(isPhase45ScenarioSnapshot);
  const observeScenario = scenarios.find((scenario) =>
    scenario.family === "observe_writeback_candidate_visibility"
  );
  const providerScenario = scenarios.find((scenario) =>
    scenario.family === "optional_provider_backed_retrieval_uplift"
  );
  if (
    scenarios.length !== rawScenarios.length ||
    !viewerScenarioHasInspectability(
      scenarios.find((scenario) =>
        scenario.family === "local_viewer_trace_writeback_session_inspection"
      ),
    )
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }
  if (
    parsed.variants.providerBackedGoodMemory.status !== "skipped" ||
    !providerBackedScenarioIsExplicitSkip(providerScenario)
  ) {
    throw new Error(
      "Phase 45 adoption report provider-backed evidence must remain an explicit skip.",
    );
  }
  if (
    !observeScenarioHasReviewEvidence({
      metrics: parsedReadiness,
      scenario: observeScenario,
    })
  ) {
    throw new Error(
      "Phase 45 adoption report observe-to-selective evidence is incomplete.",
    );
  }

  return {
    acceptance: { decision: parsed.acceptance.decision },
    metrics: {
      correctionSuccessRate: metrics.correctionSuccessRate,
      missedRecallRate: metrics.missedRecallRate,
      noMemoryLeakRate: metrics.noMemoryLeakRate,
      observeToSelectiveConversionReadiness: parsedReadiness,
      staleMemoryRate: metrics.staleMemoryRate,
      wrongRecallRate: metrics.wrongRecallRate,
    },
    runId: CANONICAL_PHASE45_ADOPTION_RUN_ID,
    scenarios,
    variants: {
      providerBackedGoodMemory: {
        status: "skipped",
      },
    },
  };
}

function isPhase45ScenarioSnapshot(value: unknown): value is Phase45ScenarioSnapshot {
  return Boolean(value) && typeof value === "object";
}

function readNumberEvidence(
  evidence: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = evidence?.[key];
  return typeof value === "number" ? value : undefined;
}

function readStringArrayEvidence(
  evidence: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const value = evidence?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function roundGateRatio(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function observeReadinessIsAccepted(
  readiness: ParsedPhase45AdoptionReport["metrics"]["observeToSelectiveConversionReadiness"],
): boolean {
  return (
    readiness.observedCandidatesReviewed > 0 &&
    readiness.observedCandidatesAcceptedAsUseful > 0 &&
    readiness.observedCandidatesRejectedAsUnsafeOrNoisy > 0 &&
    readiness.observedCandidatesReviewed ===
      readiness.observedCandidatesAcceptedAsUseful +
        readiness.observedCandidatesRejectedAsUnsafeOrNoisy &&
    readiness.acceptedReviewedRatio ===
      roundGateRatio(
        readiness.observedCandidatesAcceptedAsUseful /
          readiness.observedCandidatesReviewed,
      ) &&
    readiness.scenariosWhereSelectiveWritebackJustified > 0
  );
}

function observeScenarioHasReviewEvidence(input: {
  metrics: ParsedPhase45AdoptionReport["metrics"]["observeToSelectiveConversionReadiness"];
  scenario: Phase45ScenarioSnapshot | undefined;
}): boolean {
  const evidence = input.scenario?.redactedEvidence;
  const matchedSignals = readStringArrayEvidence(evidence, "matchedSignals");
  const reasonCodes = readStringArrayEvidence(
    evidence,
    "reviewDecisionReasonCodes",
  );
  const acceptedCandidateCount = readNumberEvidence(
    evidence,
    "acceptedCandidateCount",
  );
  const observedCandidateCount = readNumberEvidence(
    evidence,
    "observedCandidateCount",
  );
  const rejectedCandidateCount = readNumberEvidence(
    evidence,
    "rejectedCandidateCount",
  );
  const reviewDecisionCount = readNumberEvidence(
    evidence,
    "reviewDecisionCount",
  );

  return (
    input.scenario?.passed === true &&
    observeReadinessIsAccepted(input.metrics) &&
    acceptedCandidateCount ===
      input.metrics.observedCandidatesAcceptedAsUseful &&
    rejectedCandidateCount ===
      input.metrics.observedCandidatesRejectedAsUnsafeOrNoisy &&
    observedCandidateCount === input.metrics.observedCandidatesReviewed &&
    reviewDecisionCount === input.metrics.observedCandidatesReviewed &&
    matchedSignals.includes("observe-candidates-reviewable") &&
    matchedSignals.includes("observe-useful-candidate-approved") &&
    matchedSignals.includes("observe-private-candidate-rejected") &&
    reasonCodes.includes("useful_launch_note_candidate") &&
    reasonCodes.includes("explicit_private_secret_do_not_store")
  );
}

function providerBackedScenarioIsExplicitSkip(
  scenario: Phase45ScenarioSnapshot | undefined,
): boolean {
  const checks = scenario?.checks;
  return (
    scenario?.passed === true &&
    Array.isArray(checks) &&
    checks.includes("provider-backed-eval-explicitly-skipped") &&
    scenario.providerBacked?.status === "skipped" &&
    scenario.providerBacked.observed === false &&
    scenario.providerBacked.usefulRecall === false &&
    scenario.providerBacked.wrongRecall === false &&
    scenario.providerBacked.missedRecall === false
  );
}

function viewerScenarioHasInspectability(
  scenario: Phase45ScenarioSnapshot | undefined,
): boolean {
  const evidence = scenario?.redactedEvidence;
  const checks = scenario?.checks;
  return (
    scenario?.passed === true &&
    Array.isArray(checks) &&
    [
      "viewer-summary",
      "progressive-record-drilldown",
      "handoff-generated",
      "viewer-mutation-rejected",
      "backend-mutation-flow",
    ].every((check) => checks.includes(check)) &&
    evidence?.backendMutationCount === 2 &&
    evidence.handoffCount === 2 &&
    evidence.recordRefCount === 1 &&
    typeof evidence.traceEventCount === "number" &&
    evidence.traceEventCount > 0 &&
    typeof evidence.observedCandidateCount === "number" &&
    evidence.observedCandidateCount > 0 &&
    evidence.viewerMutationRejected === true &&
    Array.isArray(evidence.matchedSignals) &&
    evidence.matchedSignals.includes("backend-mutations-outside-viewer")
  );
}

function referenceProductUsesPublicSurface(input: {
  backend: string;
  fastapi: string;
  readme: string;
}): boolean {
  return (
    input.backend.includes('from "goodmemory"') &&
    input.backend.includes('from "goodmemory/http"') &&
    input.backend.includes("/memory/recall-context") &&
    input.backend.includes("/memory/remember") &&
    input.backend.includes("/memory/feedback") &&
    input.backend.includes("/memory/export") &&
    input.backend.includes("/memory/forget") &&
    input.backend.includes("/memory/revise") &&
    !input.backend.includes("../src/") &&
    !input.backend.includes("../../src/") &&
    input.fastapi.includes("GOODMEMORY_BRIDGE_URL") &&
    input.fastapi.includes("/memory/recall-context") &&
    input.fastapi.includes("/memory/remember") &&
    input.fastapi.includes("/memory/feedback") &&
    input.fastapi.includes("/memory/export") &&
    input.fastapi.includes("/memory/forget") &&
    input.fastapi.includes("/memory/revise") &&
    input.fastapi.includes("CREATE TABLE IF NOT EXISTS product_idempotency") &&
    !input.fastapi.includes("../src/") &&
    !input.fastapi.includes("../../src/") &&
    input.readme.includes("goodmemory-http-bridge") &&
    input.readme.includes("bun run example:reference-product") &&
    input.readme.includes("bun run eval:phase-45") &&
    input.readme.includes("bun run gate:phase-45") &&
    input.readme.includes("viewer remains read-only") &&
    input.readme.includes("CLI/API handoff")
  );
}

function docsAreAligned(input: {
  archiveDoc: string;
  currentStatus: string;
  referenceProductReadme: string;
  taskBoard: string;
}): boolean {
  return (
    input.currentStatus.includes(
      "Phase 45 is now closed as the First Reference Product and Adoption Evidence slice",
    ) &&
    input.currentStatus.includes(
      "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
    ) &&
    input.currentStatus.includes(
      "reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json",
    ) &&
    input.currentStatus.includes(
      "docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md",
    ) &&
    input.archiveDoc.includes("Canonical accepted gate run: `run-20260427110000`") &&
    input.archiveDoc.includes(CANONICAL_PHASE45_ADOPTION_RUN_ID) &&
    input.archiveDoc.includes("reference product") &&
    input.archiveDoc.includes("viewer remains read-only") &&
    input.archiveDoc.includes("not a hosted dashboard") &&
    input.referenceProductReadme.includes("bun run gate:phase-45") &&
    input.taskBoard.includes("[DONE] Phase 45 is closed") &&
    input.taskBoard.includes(
      "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
    ) &&
    input.taskBoard.includes(
      "reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json",
    )
  );
}

async function runGateCommands(
  commands: Phase45GateCommand[],
  dependencies: Phase45GateDependencies,
): Promise<Array<Phase45GateCommandResult & { label: string }>> {
  const results: Array<Phase45GateCommandResult & { label: string }> = [];
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

async function readText(
  path: string,
  dependencies: Phase45GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runCommand(
  command: Phase45GateCommand,
): Promise<Phase45GateCommandResult> {
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

export async function runPhase45GateCli(
  dependencies: Phase45GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase45GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase45QualityGate)(options);
    dependencies.log?.(
      `Phase 45 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(error instanceof Error ? error.message : String(error));
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase45GateCli({
    log: console.log,
  });
}
