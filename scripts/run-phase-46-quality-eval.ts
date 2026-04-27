#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createGoodMemory,
} from "../src";
import {
  createFactMemory,
} from "../src/domain/records";
import {
  createEvidenceRecord,
} from "../src/evidence/contracts";
import type {
  MemoryQualityFailureLabel,
} from "../src/maintenance/qualityRepairSignals";
import {
  buildMemoryQualityRepairAttributes,
} from "../src/maintenance/qualityRepairSignals";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../src/storage/memory";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase46QualityEvalOptions {
  outputDir?: string;
  phase45ReportPath?: string;
  runId?: string;
}

export interface Phase46QualityEvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase46QualityEvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (
    options?: Phase46QualityEvalOptions,
  ) => Promise<Phase46QualityEvalReport>;
}

export interface Phase46FailureSample {
  baselineObservedFailure: boolean;
  goodMemoryObservedFailure: boolean;
  label: MemoryQualityFailureLabel;
  productImpact: string;
  redactedEvidence: {
    matchedSignals: string[];
    phase45CaseId: string;
    phase45RunId: string;
  };
  sampleId: string;
  sourceScenario: string;
}

export interface Phase46Diagnosis {
  causesBySampleId: Record<
    string,
    | "no_memory_baseline"
    | "writeback_candidate_review"
  >;
  providerBackedUpliftCandidates: string[];
  providerBackedPromotionSeparated: boolean;
  rulesOnlyFailureSampleIds: string[];
}

export interface Phase46RepairResult {
  afterState: string;
  beforeState: string;
  evidenceId: string;
  evidenceKind: "failure_sample" | "maintenance_guardrail";
  family: MemoryQualityFailureLabel;
  repair: string;
  status: "passed" | "failed";
}

export interface Phase46GuardedRepairScenario {
  family: "stale_recall";
  observedPhase45Failure: false;
  productRisk: string;
  redactedEvidence: {
    matchedSignals: string[];
    phase45CaseId: string;
    phase45RunId: string;
  };
  scenarioId: string;
  sourceScenario: string;
}

export interface Phase46QualityEvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  diagnosis: Phase46Diagnosis;
  failureSamples: Phase46FailureSample[];
  generatedAt: string;
  generatedBy: "scripts/run-phase-46-quality-eval.ts";
  inputs: {
    phase45AdoptionReport: {
      reportPath: string;
      runId: string;
      status: "accepted" | "blocked";
    };
  };
  guardedRepairScenarios: Phase46GuardedRepairScenario[];
  metrics: {
    failureSampleCount: number;
    identityContinuityPreserved: boolean;
    maintenanceGuardrailCount: number;
    missedRecallBaselineClosedCount: number;
    observedFailureSampleCount: number;
    overRememberingDemotedCount: number;
    providerBackedPromotionSeparated: boolean;
    repairPassCount: number;
    staleRepairDemotedCount: number;
  };
  mode: "memory-quality-and-maintenance-2-0";
  outputDir: string;
  phase: "phase-46";
  rawTranscriptPersistence: {
    evidenceSource: "phase45_redacted_scenario_evidence_and_deterministic_repairs";
    persistedRawTranscripts: false;
  };
  repairs: Phase46RepairResult[];
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

interface Phase45VariantSnapshot {
  missedRecall?: unknown;
  observed?: unknown;
  status?: unknown;
  usefulRecall?: unknown;
  wrongRecall?: unknown;
}

interface Phase45ScenarioSnapshot {
  caseId?: unknown;
  family?: unknown;
  noMemory?: Phase45VariantSnapshot;
  passed?: unknown;
  providerBacked?: Phase45VariantSnapshot;
  rawTranscriptPersisted?: unknown;
  redactedEvidence?: {
    matchedSignals?: unknown;
    rejectedCandidateCount?: unknown;
    reviewDecisionReasonCodes?: unknown;
  };
  rulesOnlyGoodMemory?: Phase45VariantSnapshot;
}

interface Phase45ReportSnapshot {
  acceptance?: {
    decision?: unknown;
  };
  generatedBy?: unknown;
  metrics?: {
    missedRecallRate?: unknown;
    noMemoryLeakRate?: unknown;
    observeToSelectiveConversionReadiness?: {
      observedCandidatesRejectedAsUnsafeOrNoisy?: unknown;
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
  variants?: {
    providerBackedGoodMemory?: {
      status?: unknown;
    };
    rulesOnlyGoodMemory?: {
      storage?: unknown;
    };
  };
}

interface ParsedPhase45Report {
  acceptance: {
    decision: "accepted" | "blocked";
  };
  runId: string;
  scenarios: Phase45Scenario[];
  variants: {
    providerBackedGoodMemory: {
      status: "accepted" | "skipped";
    };
  };
}

type Phase45ObservedFlag = boolean | null;
type Phase45ProviderBackedStatus = "accepted" | "passed" | "skipped" | null;

interface Phase45Scenario {
  caseId: string;
  family: string;
  noMemory: {
    missedRecall: boolean;
    observed: Phase45ObservedFlag;
    usefulRecall: boolean;
    wrongRecall: boolean;
  };
  passed: boolean;
  providerBacked: {
    observed: Phase45ObservedFlag;
    status: Phase45ProviderBackedStatus;
    usefulRecall: boolean;
  };
  rawTranscriptPersisted: boolean;
  redactedEvidence: {
    matchedSignals: string[];
    rejectedCandidateCount: number;
    reviewDecisionReasonCodes: string[];
  };
  rulesOnlyGoodMemory: {
    observed: Phase45ObservedFlag;
    usefulRecall: boolean;
    wrongRecall: boolean;
  };
}

const GENERATED_BY = "scripts/run-phase-46-quality-eval.ts";
const CANONICAL_PHASE45_RUN_ID = "run-20260427104530-adoption-eval";
const PHASE46_IN_SCOPE = [
  "Phase 45 redacted reference-product failure samples",
  "rules-only missed-recall baseline diagnosis",
  "stale recall quality repair through real verification pressure",
  "over-remembering repair through quality failure-sample signals",
  "provider-backed promotion separation for Phase 47",
] as const;
const PHASE46_OUT_OF_SCOPE = [
  "provider-backed retrieval default promotion",
  "hosted dashboard, cloud sync, account, or team workspace",
  "viewer mutation routes",
  "raw transcript persistence",
  "root public API widening",
] as const;

export function resolvePhase46QualityEvalOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-46");
}

export function resolvePhase46CanonicalPhase45ReportPath(root: string): string {
  return join(
    root,
    "reports/eval/adoption/phase-45",
    CANONICAL_PHASE45_RUN_ID,
    "report.json",
  );
}

export function buildPhase46QualityEvalRunId(timestamp: string): string {
  const value = timestamp.replace(/\D/gu, "").slice(0, 14) || "phase46quality";
  return `run-${value}-quality-eval`;
}

export function parsePhase46QualityEvalCliOptions(
  argv: readonly string[],
): Phase46QualityEvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    phase45ReportPath: resolveCliFlagValue(argv, "--phase45-report-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function readObservedFlag(value: unknown): Phase45ObservedFlag {
  return typeof value === "boolean" ? value : null;
}

function readProviderBackedStatus(value: unknown): Phase45ProviderBackedStatus {
  return value === "accepted" || value === "passed" || value === "skipped"
    ? value
    : null;
}

function readScenario(value: unknown): Phase45Scenario | null {
  if (!isObject(value)) {
    return null;
  }
  const scenario = value as Phase45ScenarioSnapshot;
  if (
    typeof scenario.caseId !== "string" ||
    typeof scenario.family !== "string" ||
    scenario.passed !== true ||
    scenario.rawTranscriptPersisted !== false
  ) {
    return null;
  }

  return {
    caseId: scenario.caseId,
    family: scenario.family,
    noMemory: {
      missedRecall: scenario.noMemory?.missedRecall === true,
      observed: readObservedFlag(scenario.noMemory?.observed),
      usefulRecall: scenario.noMemory?.usefulRecall === true,
      wrongRecall: scenario.noMemory?.wrongRecall === true,
    },
    passed: true,
    providerBacked: {
      observed: readObservedFlag(scenario.providerBacked?.observed),
      status: readProviderBackedStatus(scenario.providerBacked?.status),
      usefulRecall: scenario.providerBacked?.usefulRecall === true,
    },
    rawTranscriptPersisted: false,
    redactedEvidence: {
      matchedSignals: readStringArray(
        scenario.redactedEvidence?.matchedSignals,
      ),
      rejectedCandidateCount:
        typeof scenario.redactedEvidence?.rejectedCandidateCount === "number"
          ? scenario.redactedEvidence.rejectedCandidateCount
          : 0,
      reviewDecisionReasonCodes: readStringArray(
        scenario.redactedEvidence?.reviewDecisionReasonCodes,
      ),
    },
    rulesOnlyGoodMemory: {
      observed: readObservedFlag(scenario.rulesOnlyGoodMemory?.observed),
      usefulRecall: scenario.rulesOnlyGoodMemory?.usefulRecall === true,
      wrongRecall: scenario.rulesOnlyGoodMemory?.wrongRecall === true,
    },
  };
}

function parsePhase45Report(raw: string): ParsedPhase45Report {
  const parsed = JSON.parse(raw) as Phase45ReportSnapshot;
  const scenarios = Array.isArray(parsed.scenarios)
    ? parsed.scenarios.map(readScenario).filter((scenario): scenario is Phase45Scenario =>
        scenario !== null
      )
    : [];
  if (
    parsed.generatedBy !== "scripts/run-phase-45-adoption-eval.ts" ||
    parsed.mode !== "reference-product-adoption-eval" ||
    parsed.phase !== "phase-45" ||
    typeof parsed.runId !== "string" ||
    parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    parsed.variants?.rulesOnlyGoodMemory?.storage !== "memory" ||
    (
      parsed.variants.providerBackedGoodMemory?.status !== "accepted" &&
      parsed.variants.providerBackedGoodMemory?.status !== "skipped"
    ) ||
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    scenarios.length === 0
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }

  return {
    acceptance: {
      decision: parsed.acceptance.decision,
    },
    runId: parsed.runId,
    scenarios,
    variants: {
      providerBackedGoodMemory: {
        status: parsed.variants.providerBackedGoodMemory.status,
      },
    },
  };
}

function requireScenario(
  report: ParsedPhase45Report,
  family: string,
): Phase45Scenario {
  const scenario = report.scenarios.find((item) => item.family === family);
  if (!scenario) {
    throw new Error(`Phase 45 adoption report is missing ${family}.`);
  }
  return scenario;
}

function matchedSignalsForSample(scenario: Phase45Scenario): string[] {
  return scenario.redactedEvidence.matchedSignals.length > 0
    ? scenario.redactedEvidence.matchedSignals
    : [scenario.family];
}

function buildFailureSamples(report: ParsedPhase45Report): Phase46FailureSample[] {
  const historical = requireScenario(report, "historical_task_continuation");
  const observe = requireScenario(report, "observe_writeback_candidate_visibility");
  const historicalGoodMemoryFailure =
    historical.rulesOnlyGoodMemory.observed !== true ||
    !historical.rulesOnlyGoodMemory.usefulRecall ||
    historical.rulesOnlyGoodMemory.wrongRecall;
  const observeGoodMemoryFailure =
    observe.rulesOnlyGoodMemory.observed !== true ||
    !observe.rulesOnlyGoodMemory.usefulRecall ||
    observe.rulesOnlyGoodMemory.wrongRecall;

  return [
    {
      baselineObservedFailure:
        historical.noMemory.observed === true && historical.noMemory.missedRecall,
      goodMemoryObservedFailure: historicalGoodMemoryFailure,
      label: "missed_recall",
      productImpact:
        "The Phase 45 no-memory product path missed historical task-continuation context that rules-only GoodMemory recalled.",
      redactedEvidence: {
        matchedSignals: matchedSignalsForSample(historical),
        phase45CaseId: historical.caseId,
        phase45RunId: report.runId,
      },
      sampleId: "phase46-missed-recall-historical-task-continuation",
      sourceScenario: historical.caseId,
    },
    {
      baselineObservedFailure:
        observe.rulesOnlyGoodMemory.observed === true &&
        observe.redactedEvidence.rejectedCandidateCount > 0,
      goodMemoryObservedFailure: observeGoodMemoryFailure,
      label: "over_remembering",
      productImpact:
        "The Phase 45 observe path found a rejected unsafe/noisy candidate that must remain repairable without raw transcript persistence.",
      redactedEvidence: {
        matchedSignals: [
          ...matchedSignalsForSample(observe),
          ...observe.redactedEvidence.reviewDecisionReasonCodes,
        ],
        phase45CaseId: observe.caseId,
        phase45RunId: report.runId,
      },
      sampleId: "phase46-over-remembering-observe-rejected-candidate",
      sourceScenario: observe.caseId,
    },
  ];
}

function buildGuardedRepairScenarios(
  report: ParsedPhase45Report,
): Phase46GuardedRepairScenario[] {
  const historical = requireScenario(report, "historical_task_continuation");
  return [
    {
      family: "stale_recall",
      observedPhase45Failure: false,
      productRisk:
        "The Phase 45 continuation family passed rules-only recall but supplies a redacted product path for guarding stale inferred action-fact repair.",
      redactedEvidence: {
        matchedSignals: matchedSignalsForSample(historical),
        phase45CaseId: historical.caseId,
        phase45RunId: report.runId,
      },
      scenarioId: "phase46-stale-recall-historical-task-continuation-guardrail",
      sourceScenario: historical.caseId,
    },
  ];
}

function buildDiagnosis(
  report: ParsedPhase45Report,
  samples: Phase46FailureSample[],
): Phase46Diagnosis {
  const providerBackedUpliftCandidates = report.scenarios
    .filter(
      (scenario) =>
        scenario.family === "optional_provider_backed_retrieval_uplift" &&
        scenario.providerBacked.status === "skipped" &&
        !scenario.providerBacked.observed,
    )
    .map((scenario) => scenario.caseId);
  const causesBySampleId = Object.fromEntries(
    samples.map((sample) => [
      sample.sampleId,
      sample.label === "missed_recall"
        ? "no_memory_baseline"
        : "writeback_candidate_review",
    ] as const),
  );

  return {
    causesBySampleId,
    providerBackedUpliftCandidates,
    providerBackedPromotionSeparated:
      report.variants.providerBackedGoodMemory.status === "skipped" &&
      providerBackedUpliftCandidates.length > 0,
    rulesOnlyFailureSampleIds: samples
      .filter((sample) => sample.goodMemoryObservedFailure)
      .map((sample) => sample.sampleId),
  };
}

async function runRepairScenarios(
  input: {
    guardedRepairScenarios: Phase46GuardedRepairScenario[];
    samples: Phase46FailureSample[];
  },
): Promise<{
  identityContinuityPreserved: boolean;
  overRememberingDemotedCount: number;
  repairs: Phase46RepairResult[];
  staleRepairDemotedCount: number;
}> {
  const scope = {
    userId: "phase46-quality-user",
    workspaceId: "phase46-quality-workspace",
  } as const;
  let now = new Date("2026-04-27T12:00:00.000Z");
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
    testing: {
      now: () => now,
    },
  });
  const staleGuardrail = input.guardedRepairScenarios.find((scenario) =>
    scenario.family === "stale_recall"
  )!;
  const overRememberingSample = input.samples.find((sample) =>
    sample.label === "over_remembering"
  )!;
  const missedSample = input.samples.find((sample) =>
    sample.label === "missed_recall"
  )!;

  await documentStore.set(
    "facts",
    "phase46-stale-blocker",
    createFactMemory({
      id: "phase46-stale-blocker",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      category: "project",
      content: "Reference product launch is blocked by old security review.",
      attributes: buildMemoryQualityRepairAttributes({
        failureLabel: "stale_recall",
        phase: "phase-46",
        replacementMemoryId: "phase46-current-blocker",
        runId: "deterministic-phase46-quality-repair",
        sampleId: staleGuardrail.scenarioId,
        source: "quality_repair_guardrail",
        sourceScenario: staleGuardrail.sourceScenario,
      }),
      confidence: 0.58,
      importance: 0.35,
      source: { method: "inferred", extractedAt: "2025-12-01T00:00:00.000Z" },
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2025-12-01T00:00:00.000Z",
    }),
  );
  await documentStore.set(
    "facts",
    "phase46-identity-continuity",
    createFactMemory({
      id: "phase46-identity-continuity",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      category: "personal",
      content: "The user prefers precise architecture reviews.",
      confidence: 0.95,
      importance: 0.9,
      source: { method: "explicit", extractedAt: "2025-12-01T00:00:00.000Z" },
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2025-12-01T00:00:00.000Z",
    }),
  );
  if (overRememberingSample.baselineObservedFailure) {
    await documentStore.set(
      "facts",
      "phase46-over-remembered-secret",
      createFactMemory({
        id: "phase46-over-remembered-secret",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "technical",
        content: "Redacted private credential should not be recalled.",
        attributes: buildMemoryQualityRepairAttributes({
          failureLabel: "over_remembering",
          phase: "phase-46",
          reviewOutcome: "false_write",
          runId: "deterministic-phase46-quality-repair",
          sampleId: overRememberingSample.sampleId,
          source: "quality_failure_sample",
          sourceScenario: overRememberingSample.sourceScenario,
        }),
        source: { method: "explicit", extractedAt: "2026-04-27T12:00:00.000Z" },
        createdAt: "2026-04-27T12:00:00.000Z",
        updatedAt: "2026-04-27T12:00:00.000Z",
      }),
    );
  }
  await documentStore.set(
    "evidence",
    "phase46-stale-blocker-evidence",
    createEvidenceRecord({
      id: "phase46-stale-blocker-evidence",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      kind: "conversation_excerpt",
      excerpt: "Older redacted launch evidence mentioned the security review blocker.",
      source: { method: "inferred", extractedAt: "2025-12-01T00:00:00.000Z" },
      linkedMemoryIds: ["phase46-stale-blocker"],
    }),
  );

  await memory.recall({
    scope,
    query: "Is the old security review still the reference product launch blocker?",
    retrievalProfile: "coding_agent",
  });
  now = new Date("2026-04-27T12:10:00.000Z");
  await memory.recall({
    scope,
    query: "Is the old security review still the reference product launch blocker?",
    retrievalProfile: "coding_agent",
  });
  await documentStore.set(
    "facts",
    "phase46-current-blocker",
    createFactMemory({
      id: "phase46-current-blocker",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      category: "project",
      content: "Reference product launch is blocked by package evidence refresh.",
      confidence: 0.92,
      importance: 0.8,
      source: { method: "explicit", extractedAt: "2026-04-20T00:00:00.000Z" },
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    }),
  );

  const maintenance = await memory.runMaintenance({
    scope,
    jobs: ["qualityRepair"],
  });
  const exported = await memory.exportMemory({ scope });
  const staleFact = exported.durable.facts.find((fact) =>
    fact.id === "phase46-stale-blocker"
  );
  const overRememberedFact = exported.durable.facts.find((fact) =>
    fact.id === "phase46-over-remembered-secret"
  );
  const identityFact = exported.durable.facts.find((fact) =>
    fact.id === "phase46-identity-continuity"
  );
  const afterRepairRecall = await memory.recall({
    scope,
    query: "What is blocked by package evidence refresh?",
    retrievalProfile: "coding_agent",
  });
  const staleDemoted = staleFact?.lifecycle === "inactive";
  const overRememberingDemoted = overRememberedFact?.lifecycle === "inactive";
  const identityContinuityPreserved = identityFact?.lifecycle === "active";
  const currentReplacementRecalled = afterRepairRecall.facts.some((fact) =>
    fact.id === "phase46-current-blocker"
  );

  return {
    identityContinuityPreserved,
    overRememberingDemotedCount: overRememberingDemoted ? 1 : 0,
    repairs: [
      {
        afterState: "rules-only GoodMemory recalled the Phase 45 continuation signal",
        beforeState: "no-memory baseline missed the historical continuation signal",
        evidenceId: missedSample.sampleId,
        evidenceKind: "failure_sample",
        family: "missed_recall",
        repair:
          "rules-only GoodMemory closes Phase 45 no-memory missed-recall baseline",
        status:
          missedSample.baselineObservedFailure &&
          !missedSample.goodMemoryObservedFailure
            ? "passed"
            : "failed",
      },
      {
        afterState: staleDemoted
          ? "stale inferred action fact inactive and current replacement recallable after qualityRepair"
          : "stale inferred action fact remained active",
        beforeState:
          "stale inferred action fact accumulated two verification pressure signals with an explicit current replacement",
        evidenceId: staleGuardrail.scenarioId,
        evidenceKind: "maintenance_guardrail",
        family: "stale_recall",
        repair:
          "qualityRepair demotes repeatedly hinted stale inferred action facts only when a current replacement is linked",
        status: staleDemoted &&
          currentReplacementRecalled &&
          staleGuardrail.observedPhase45Failure === false
          ? "passed"
          : "failed",
      },
      {
        afterState: overRememberingDemoted
          ? "quality-sample-marked unsafe writeback fact inactive after qualityRepair"
          : "quality-sample-marked unsafe writeback fact remained active",
        beforeState:
          "Phase 45 observe evidence produced a rejected unsafe/noisy candidate family",
        evidenceId: overRememberingSample.sampleId,
        evidenceKind: "failure_sample",
        family: "over_remembering",
        repair:
          "qualityRepair demotes quality failure-sample-marked unsafe writeback facts",
        status:
          overRememberingSample.baselineObservedFailure &&
          overRememberingDemoted &&
          !overRememberingSample.goodMemoryObservedFailure
            ? "passed"
            : "failed",
      },
    ],
    staleRepairDemotedCount:
      maintenance.maintenance?.jobs.find((job) => job.name === "qualityRepair")
        ?.applied === 2 && staleDemoted
        ? 1
        : 0,
  };
}

async function readText(
  path: string,
  dependencies: Phase46QualityEvalDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

export async function runPhase46QualityEval(
  options: Phase46QualityEvalOptions = {},
  dependencies: Phase46QualityEvalDependencies = {},
): Promise<Phase46QualityEvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase46QualityEvalOutputDir(root);
  const phase45ReportPath =
    options.phase45ReportPath ?? resolvePhase46CanonicalPhase45ReportPath(root);
  const phase45Report = parsePhase45Report(
    await readText(phase45ReportPath, dependencies),
  );
  const runId = options.runId ?? buildPhase46QualityEvalRunId(now);
  const runDirectory = join(outputDir, runId);
  const failureSamples = buildFailureSamples(phase45Report);
  const guardedRepairScenarios = buildGuardedRepairScenarios(phase45Report);
  const diagnosis = buildDiagnosis(phase45Report, failureSamples);
  const repairResults = await runRepairScenarios({
    guardedRepairScenarios,
    samples: failureSamples,
  });
  const repairPassCount = repairResults.repairs.filter((repair) =>
    repair.status === "passed"
  ).length;
  const metrics = {
    failureSampleCount: failureSamples.length,
    identityContinuityPreserved: repairResults.identityContinuityPreserved,
    maintenanceGuardrailCount: guardedRepairScenarios.length,
    missedRecallBaselineClosedCount:
      repairResults.repairs.some(
        (repair) => repair.family === "missed_recall" && repair.status === "passed",
      )
        ? 1
        : 0,
    observedFailureSampleCount: failureSamples.filter((sample) =>
      sample.baselineObservedFailure
    ).length,
    overRememberingDemotedCount: repairResults.overRememberingDemotedCount,
    providerBackedPromotionSeparated:
      diagnosis.providerBackedPromotionSeparated,
    repairPassCount,
    staleRepairDemotedCount: repairResults.staleRepairDemotedCount,
  };
  const accepted =
    phase45Report.acceptance.decision === "accepted" &&
    metrics.failureSampleCount >= 2 &&
    metrics.observedFailureSampleCount === metrics.failureSampleCount &&
    metrics.maintenanceGuardrailCount >= 1 &&
    metrics.repairPassCount === repairResults.repairs.length &&
    metrics.identityContinuityPreserved &&
    metrics.providerBackedPromotionSeparated &&
    diagnosis.rulesOnlyFailureSampleIds.length === 0;
  const report: Phase46QualityEvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 46 quality eval accepted Phase 45 redacted samples, deterministic stale/over-remembering repairs, identity continuity preservation, and provider-backed separation."
        : "Phase 46 quality eval blocked because Phase 45 input, repairs, continuity, or provider separation failed.",
    },
    diagnosis,
    failureSamples,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    guardedRepairScenarios,
    inputs: {
      phase45AdoptionReport: {
        reportPath: phase45ReportPath,
        runId: phase45Report.runId,
        status: phase45Report.acceptance.decision,
      },
    },
    metrics,
    mode: "memory-quality-and-maintenance-2-0",
    outputDir,
    phase: "phase-46",
    rawTranscriptPersistence: {
      evidenceSource:
        "phase45_redacted_scenario_evidence_and_deterministic_repairs",
      persistedRawTranscripts: false,
    },
    repairs: repairResults.repairs,
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE46_IN_SCOPE],
      outOfScope: [...PHASE46_OUT_OF_SCOPE],
    },
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export async function runPhase46QualityEvalCli(
  dependencies: Phase46QualityEvalCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? Bun.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runEval = dependencies.runEval ?? runPhase46QualityEval;
  const report = await runEval(parsePhase46QualityEvalCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }
}

if (import.meta.main) {
  await runPhase46QualityEvalCli();
}
