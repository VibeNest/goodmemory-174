#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "../src";
import type { FactMemory } from "../src/domain/records";
import { createFactMemory } from "../src/domain/records";
import { createGoodMemoryHttpMemoryBridge } from "../src/http";
import type { RecallRouterStrategy } from "../src/recall/router";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../src/storage/memory";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase47ProviderRolloutEvalOptions {
  outputDir?: string;
  phase45ReportPath?: string;
  phase46ReportPath?: string;
  runId?: string;
}

export interface Phase47ProviderRolloutEvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase47ProviderRolloutEvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (
    options?: Phase47ProviderRolloutEvalOptions,
  ) => Promise<Phase47ProviderRolloutEvalReport>;
}

export interface Phase47RecallVariantResult {
  fallbackReason?: "semantic_search_unavailable" | "llm_routing_unavailable";
  recalledMemoryIds: string[];
  requestedStrategy: RecallRouterStrategy;
  resolvedStrategy: RecallRouterStrategy;
  setupFragility: boolean;
  staleRecall: boolean;
  usefulRecall: boolean;
  wrongRecall: boolean;
}

export interface Phase47ProviderScenarioResult {
  caseId: string;
  family: "provider_backed_semantic_tie_break";
  providerBacked: Phase47RecallVariantResult;
  qualityDelta: {
    setupFragility: number;
    staleRecall: number;
    usefulRecall: number;
    wrongRecall: number;
  };
  rulesOnly: Phase47RecallVariantResult;
}

export interface Phase47DefaultScenarioResult {
  autoBodyResolvedStrategy: RecallRouterStrategy;
  noStrategyResolvedStrategy: RecallRouterStrategy;
  providerRuntimeAvailable: boolean;
  requestedStrategy: RecallRouterStrategy;
  resolvedStrategy: RecallRouterStrategy;
  rulesOnlyDefaultPreserved: boolean;
}

export interface Phase47FallbackScenarioResult {
  fallbackReason?:
    | "semantic_search_unavailable"
    | "llm_routing_unavailable"
    | "provider_error";
  requestedStrategy: "hybrid";
  resolvedStrategy: RecallRouterStrategy;
  rulesOnlyContextRecovered: boolean;
  silentProviderFailure: boolean;
}

export interface Phase47ProviderRolloutEvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  defaultScenario: Phase47DefaultScenarioResult;
  fallbackScenario: Phase47FallbackScenarioResult;
  generatedAt: string;
  generatedBy: "scripts/run-phase-47-provider-rollout-eval.ts";
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
  metrics: {
    fallbackVisibleCount: number;
    providerBackedObservedCount: number;
    rulesOnlyDefaultPreserved: boolean;
    scenarioCount: number;
    setupFragilityDelta: number;
    staleRecallDelta: number;
    usefulRecallDelta: number;
    wrongRecallDelta: number;
  };
  mode: "provider-backed-retrieval-rollout";
  outputDir: string;
  phase: "phase-47";
  promotionCriteria: {
    maxSetupFragilityDelta: 0;
    maxStaleRecallDelta: 0;
    maxWrongRecallDelta: 0;
    minUsefulRecallDelta: 1;
    requireFallbackVisible: true;
    requireNoDefaultPromotion: true;
  };
  rawTranscriptPersistence: {
    evidenceSource: "deterministic_provider_backed_recall_paths_and_phase45_46_redacted_reports";
    persistedRawTranscripts: false;
  };
  runDirectory: string;
  runId: string;
  scenarios: Phase47ProviderScenarioResult[];
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

interface Phase45ReportSnapshot {
  acceptance?: { decision?: unknown };
  generatedBy?: unknown;
  mode?: unknown;
  phase?: unknown;
  rawTranscriptPersistence?: { persistedRawTranscripts?: unknown };
  runId?: unknown;
  scenarios?: unknown;
  variants?: {
    providerBackedGoodMemory?: {
      status?: unknown;
    };
  };
}

interface ParsedPhase45Report {
  providerBackedStatus: "skipped" | "accepted";
  runId: string;
  status: "accepted" | "blocked";
}

interface Phase46ReportSnapshot {
  acceptance?: { decision?: unknown };
  diagnosis?: {
    providerBackedPromotionSeparated?: unknown;
    rulesOnlyFailureSampleIds?: unknown;
  };
  generatedBy?: unknown;
  metrics?: {
    providerBackedPromotionSeparated?: unknown;
  };
  mode?: unknown;
  phase?: unknown;
  rawTranscriptPersistence?: { persistedRawTranscripts?: unknown };
  runId?: unknown;
  scope?: { outOfScope?: unknown };
}

interface ParsedPhase46Report {
  providerBackedPromotionSeparated: boolean;
  rulesOnlyFailureSampleCount: number;
  runId: string;
  status: "accepted" | "blocked";
}

const GENERATED_BY = "scripts/run-phase-47-provider-rollout-eval.ts";
const CANONICAL_PHASE45_RUN_ID = "run-20260427104530-adoption-eval";
const CANONICAL_PHASE46_RUN_ID = "run-20260427123000-quality-eval";
const PHASE47_IN_SCOPE = [
  "explicit provider-backed retrieval request through existing strategy controls",
  "quality promotion criteria against rules-only evidence",
  "fail-visible provider unavailable fallback",
  "rules-only/default promotion boundary preservation",
] as const;
const PHASE47_OUT_OF_SCOPE = [
  "provider-backed retrieval default-on rollout",
  "hosted dashboard, cloud sync, account, or team workspace",
  "viewer mutation routes",
  "raw transcript persistence",
  "root public API widening",
] as const;
const PROMOTION_CRITERIA = {
  maxSetupFragilityDelta: 0,
  maxStaleRecallDelta: 0,
  maxWrongRecallDelta: 0,
  minUsefulRecallDelta: 1,
  requireFallbackVisible: true,
  requireNoDefaultPromotion: true,
} as const;

export function resolvePhase47ProviderRolloutEvalOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-47");
}

export function resolvePhase47CanonicalPhase45ReportPath(root: string): string {
  return join(
    root,
    "reports/eval/adoption/phase-45",
    CANONICAL_PHASE45_RUN_ID,
    "report.json",
  );
}

export function resolvePhase47CanonicalPhase46ReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-46",
    CANONICAL_PHASE46_RUN_ID,
    "report.json",
  );
}

export function buildPhase47ProviderRolloutEvalRunId(timestamp: string): string {
  const value =
    timestamp.replace(/\D/gu, "").slice(0, 14) || "phase47provider";
  return `run-${value}-provider-rollout-eval`;
}

export function parsePhase47ProviderRolloutEvalCliOptions(
  argv: readonly string[],
): Phase47ProviderRolloutEvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    phase45ReportPath: resolveCliFlagValue(argv, "--phase45-report-path"),
    phase46ReportPath: resolveCliFlagValue(argv, "--phase46-report-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPhase45ProviderBackedStatus(
  value: unknown,
): ParsedPhase45Report["providerBackedStatus"] {
  if (value === "accepted" || value === "skipped") {
    return value;
  }

  throw new Error("Phase 45 adoption report does not match the expected schema.");
}

function parsePhase45Report(raw: string): ParsedPhase45Report {
  const parsed = JSON.parse(raw) as Phase45ReportSnapshot;
  const scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
  const hasProviderBackedCandidate = scenarios.some((scenario) =>
    isObject(scenario) &&
    scenario.family === "optional_provider_backed_retrieval_uplift"
  );

  if (
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    parsed.generatedBy !== "scripts/run-phase-45-adoption-eval.ts" ||
    parsed.mode !== "reference-product-adoption-eval" ||
    parsed.phase !== "phase-45" ||
    typeof parsed.runId !== "string" ||
    parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    !hasProviderBackedCandidate
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }

  return {
    providerBackedStatus: readPhase45ProviderBackedStatus(
      parsed.variants?.providerBackedGoodMemory?.status,
    ),
    runId: parsed.runId,
    status: parsed.acceptance.decision,
  };
}

function parsePhase46Report(raw: string): ParsedPhase46Report {
  const parsed = JSON.parse(raw) as Phase46ReportSnapshot;
  const outOfScope = parsed.scope?.outOfScope;
  const rulesOnlyFailureSampleIds =
    parsed.diagnosis?.rulesOnlyFailureSampleIds;

  if (
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    parsed.generatedBy !== "scripts/run-phase-46-quality-eval.ts" ||
    parsed.mode !== "memory-quality-and-maintenance-2-0" ||
    parsed.phase !== "phase-46" ||
    typeof parsed.runId !== "string" ||
    parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    !Array.isArray(outOfScope) ||
    !outOfScope.includes("provider-backed retrieval default promotion") ||
    !outOfScope.includes("root public API widening") ||
    !Array.isArray(rulesOnlyFailureSampleIds) ||
    !rulesOnlyFailureSampleIds.every((id): id is string => typeof id === "string")
  ) {
    throw new Error("Phase 46 quality report does not match the expected schema.");
  }

  return {
    providerBackedPromotionSeparated:
      parsed.diagnosis?.providerBackedPromotionSeparated === true &&
      parsed.metrics?.providerBackedPromotionSeparated === true,
    rulesOnlyFailureSampleCount: rulesOnlyFailureSampleIds.length,
    runId: parsed.runId,
    status: parsed.acceptance.decision,
  };
}

function buildVariantResult(input: {
  expectedUsefulMemoryId: string;
  expectedWrongMemoryId: string;
  recall: Awaited<ReturnType<ReturnType<typeof createGoodMemory>["recall"]>>;
}): Phase47RecallVariantResult {
  const explanation = input.recall.metadata.routingDecision.strategyExplanation;
  const recalledMemoryIds = input.recall.facts.map((fact) => fact.id);
  const usefulRecall = recalledMemoryIds.includes(input.expectedUsefulMemoryId);
  const wrongRecall = recalledMemoryIds.includes(input.expectedWrongMemoryId);
  const setupFragility =
    explanation.requestedStrategy !== "rules-only" &&
    (
      Boolean(explanation.fallbackReason) ||
      explanation.resolvedStrategy !== explanation.requestedStrategy
    );
  const staleRecall = input.recall.facts.some(isStaleRecallRegressionFact);

  return {
    fallbackReason: explanation.fallbackReason,
    recalledMemoryIds,
    requestedStrategy: explanation.requestedStrategy,
    resolvedStrategy: explanation.resolvedStrategy,
    setupFragility,
    staleRecall,
    usefulRecall,
    wrongRecall,
  };
}

function isStaleRecallRegressionFact(fact: FactMemory): boolean {
  return Boolean(
    fact.supersededBy ||
      ((fact.verificationPressureCount ?? 0) > 0 &&
        fact.source.method === "inferred"),
  );
}

function resolveBridgeRoutingStrategy(
  value: unknown,
  fallback: RecallRouterStrategy,
): RecallRouterStrategy {
  return (
    value === "auto" ||
    value === "hybrid" ||
    value === "llm-assisted" ||
    value === "rules-only"
  )
    ? value
    : fallback;
}

async function runProviderBackedScenario(): Promise<{
  defaultScenario: Phase47DefaultScenarioResult;
  scenario: Phase47ProviderScenarioResult;
}> {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const vectorStore = createInMemoryVectorStore();
  const query = "Which provider rollout blocker is active?";
  const scope = {
    userId: "phase47-provider-user",
    workspaceId: "phase47-provider-workspace",
  };
  const memory = createGoodMemory({
    adapters: {
      documentStore,
      embeddingAdapter: {
        async embed(texts: string[]) {
          return texts.map((text) =>
            text === query || text.includes("embedding bridge token validation")
              ? [1, 0, 0]
              : [0, 1, 0]
          );
        },
      },
      sessionStore,
      vectorStore,
    },
    storage: { provider: "memory" },
  });
  const wrongFact = createFactMemory({
    id: "phase47-a-stale-blocker",
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    category: "project",
    content: "Provider rollout blocker is vendor approval.",
    source: { method: "explicit", extractedAt: "2026-04-28T00:00:00.000Z" },
    supersededBy: "phase47-z-current-blocker",
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
  });
  const rightFact = createFactMemory({
    id: "phase47-z-current-blocker",
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    category: "project",
    content: "Provider rollout blocker is embedding bridge token validation.",
    source: { method: "explicit", extractedAt: "2026-04-28T00:00:00.000Z" },
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
  });

  await documentStore.set("facts", wrongFact.id, wrongFact);
  await documentStore.set("facts", rightFact.id, rightFact);
  await vectorStore.upsert("facts", [
    {
      id: wrongFact.id,
      embedding: [0, 1, 0],
      metadata: scope,
      content: wrongFact.content,
    },
    {
      id: rightFact.id,
      embedding: [1, 0, 0],
      metadata: scope,
      content: rightFact.content,
    },
  ]);

  const [rulesOnlyRecall, providerBackedRecall] = await Promise.all([
    memory.recall({
      scope,
      query,
      retrievalProfile: "general_chat",
      strategy: "rules-only",
    }),
    memory.recall({
      scope,
      query,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    }),
  ]);
  const bridge = createGoodMemoryHttpMemoryBridge({ memory });
  const defaultQuery =
    "What should I do next about the provider rollout blocker?";
  const [noStrategyDefault, autoBodyDefault] = await Promise.all([
    bridge.handle(new Request("http://localhost/memory/recall-context", {
      body: JSON.stringify({
        scope,
        query: defaultQuery,
      }),
      headers: {
        "content-type": "application/json",
        "x-goodmemory-operations": "recall-context",
        "x-goodmemory-user-id": scope.userId,
        "x-goodmemory-workspace-id": scope.workspaceId,
      },
      method: "POST",
    })),
    bridge.handle(new Request("http://localhost/memory/recall-context", {
      body: JSON.stringify({
        scope,
        query: defaultQuery,
        strategy: "auto",
      }),
      headers: {
        "content-type": "application/json",
        "x-goodmemory-operations": "recall-context",
        "x-goodmemory-user-id": scope.userId,
        "x-goodmemory-workspace-id": scope.workspaceId,
      },
      method: "POST",
    })),
  ]);
  const rulesOnly = buildVariantResult({
    expectedUsefulMemoryId: rightFact.id,
    expectedWrongMemoryId: wrongFact.id,
    recall: rulesOnlyRecall,
  });
  const providerBacked = buildVariantResult({
    expectedUsefulMemoryId: rightFact.id,
    expectedWrongMemoryId: wrongFact.id,
    recall: providerBackedRecall,
  });
  const noStrategyRouting = noStrategyDefault.body.routing;
  const autoBodyRouting = autoBodyDefault.body.routing;
  const noStrategyResolvedStrategy = resolveBridgeRoutingStrategy(
    noStrategyRouting?.resolvedStrategy,
    "auto",
  );
  const autoBodyResolvedStrategy = resolveBridgeRoutingStrategy(
    autoBodyRouting?.resolvedStrategy,
    "auto",
  );
  const requestedStrategy = resolveBridgeRoutingStrategy(
    noStrategyRouting?.requestedStrategy,
    "auto",
  );

  return {
    defaultScenario: {
      autoBodyResolvedStrategy,
      noStrategyResolvedStrategy,
      providerRuntimeAvailable: true,
      requestedStrategy,
      resolvedStrategy: noStrategyResolvedStrategy,
      rulesOnlyDefaultPreserved:
        noStrategyDefault.statusCode === 200 &&
        autoBodyDefault.statusCode === 200 &&
        requestedStrategy === "auto" &&
        noStrategyResolvedStrategy === "rules-only" &&
        autoBodyResolvedStrategy === "rules-only",
    },
    scenario: {
      caseId: "phase47-provider-backed-semantic-tie-break",
      family: "provider_backed_semantic_tie_break",
      providerBacked,
      qualityDelta: {
        setupFragility:
          Number(providerBacked.setupFragility) - Number(rulesOnly.setupFragility),
        staleRecall:
          Number(providerBacked.staleRecall) - Number(rulesOnly.staleRecall),
        usefulRecall:
          Number(providerBacked.usefulRecall) - Number(rulesOnly.usefulRecall),
        wrongRecall:
          Number(providerBacked.wrongRecall) - Number(rulesOnly.wrongRecall),
      },
      rulesOnly,
    },
  };
}

async function runFallbackScenario(): Promise<Phase47FallbackScenarioResult> {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const vectorStore = createInMemoryVectorStore();
  const scope = {
    userId: "phase47-fallback-user",
    workspaceId: "phase47-fallback-workspace",
  };
  const memory = createGoodMemory({
    adapters: {
      documentStore,
      embeddingAdapter: {
        async embed() {
          throw new Error("synthetic Phase 47 provider failure");
        },
      },
      sessionStore,
      vectorStore,
    },
    storage: { provider: "memory" },
  });
  await documentStore.set(
    "facts",
    "phase47-provider-fallback-rules-only",
    createFactMemory({
      id: "phase47-provider-fallback-rules-only",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      category: "project",
      content: "Provider failure fallback blocker is rules-only recovery.",
      source: { method: "explicit", extractedAt: "2026-04-28T00:00:00.000Z" },
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
    }),
  );
  const bridge = createGoodMemoryHttpMemoryBridge({ memory });
  const result = await bridge.handle(new Request("http://localhost/memory/recall-context", {
    body: JSON.stringify({
      scope,
      query: "Which provider failure fallback blocker is active?",
      strategy: "hybrid",
    }),
    headers: {
      "content-type": "application/json",
      "x-goodmemory-operations": "recall-context",
      "x-goodmemory-user-id": scope.userId,
      "x-goodmemory-workspace-id": scope.workspaceId,
    },
    method: "POST",
  }));
  const routing = result.body.routing;
  const fallbackReason =
    routing?.fallbackReason === "semantic_search_unavailable" ||
    routing?.fallbackReason === "llm_routing_unavailable" ||
    routing?.fallbackReason === "provider_error"
      ? routing.fallbackReason
      : undefined;
  const resolvedStrategy =
    routing?.resolvedStrategy === "auto" ||
    routing?.resolvedStrategy === "hybrid" ||
    routing?.resolvedStrategy === "llm-assisted" ||
    routing?.resolvedStrategy === "rules-only"
      ? routing.resolvedStrategy
      : "auto";

  return {
    fallbackReason,
    requestedStrategy: "hybrid",
    resolvedStrategy,
    rulesOnlyContextRecovered:
      result.statusCode === 200 &&
      typeof result.body.contextText === "string" &&
      result.body.contextText.includes("rules-only recovery"),
    silentProviderFailure:
      result.statusCode !== 200 ||
      (
        routing?.requestedStrategy === "hybrid" &&
        routing.resolvedStrategy !== "hybrid" &&
        !fallbackReason
      ),
  };
}

function sumQualityDelta(
  scenarios: Phase47ProviderScenarioResult[],
  key: keyof Phase47ProviderScenarioResult["qualityDelta"],
): number {
  return scenarios.reduce((total, scenario) => total + scenario.qualityDelta[key], 0);
}

async function readText(
  path: string,
  dependencies: Phase47ProviderRolloutEvalDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

export async function runPhase47ProviderRolloutEval(
  options: Phase47ProviderRolloutEvalOptions = {},
  dependencies: Phase47ProviderRolloutEvalDependencies = {},
): Promise<Phase47ProviderRolloutEvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir =
    options.outputDir ?? resolvePhase47ProviderRolloutEvalOutputDir(root);
  const phase45ReportPath =
    options.phase45ReportPath ?? resolvePhase47CanonicalPhase45ReportPath(root);
  const phase46ReportPath =
    options.phase46ReportPath ?? resolvePhase47CanonicalPhase46ReportPath(root);
  const phase45 = parsePhase45Report(await readText(phase45ReportPath, dependencies));
  const phase46 = parsePhase46Report(await readText(phase46ReportPath, dependencies));
  const runId = options.runId ?? buildPhase47ProviderRolloutEvalRunId(now);
  const runDirectory = join(outputDir, runId);
  const providerScenario = await runProviderBackedScenario();
  const fallbackScenario = await runFallbackScenario();
  const scenarios = [providerScenario.scenario];
  const metrics = {
    fallbackVisibleCount:
      fallbackScenario.fallbackReason && !fallbackScenario.silentProviderFailure
        ? 1
        : 0,
    providerBackedObservedCount: scenarios.filter((scenario) =>
      scenario.providerBacked.resolvedStrategy === "hybrid" &&
      scenario.providerBacked.fallbackReason === undefined
    ).length,
    rulesOnlyDefaultPreserved:
      providerScenario.defaultScenario.rulesOnlyDefaultPreserved,
    scenarioCount: scenarios.length,
    setupFragilityDelta: sumQualityDelta(scenarios, "setupFragility"),
    staleRecallDelta: sumQualityDelta(scenarios, "staleRecall"),
    usefulRecallDelta: sumQualityDelta(scenarios, "usefulRecall"),
    wrongRecallDelta: sumQualityDelta(scenarios, "wrongRecall"),
  };
  const accepted =
    phase45.status === "accepted" &&
    phase45.providerBackedStatus === "skipped" &&
    phase46.status === "accepted" &&
    phase46.providerBackedPromotionSeparated &&
    phase46.rulesOnlyFailureSampleCount === 0 &&
    metrics.providerBackedObservedCount > 0 &&
    metrics.usefulRecallDelta >= PROMOTION_CRITERIA.minUsefulRecallDelta &&
    metrics.wrongRecallDelta <= PROMOTION_CRITERIA.maxWrongRecallDelta &&
    metrics.staleRecallDelta <= PROMOTION_CRITERIA.maxStaleRecallDelta &&
    metrics.setupFragilityDelta <= PROMOTION_CRITERIA.maxSetupFragilityDelta &&
    metrics.fallbackVisibleCount > 0 &&
    metrics.rulesOnlyDefaultPreserved &&
    fallbackScenario.rulesOnlyContextRecovered;
  const report: Phase47ProviderRolloutEvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 47 provider-backed retrieval rollout eval accepted explicit hybrid execution, positive useful recall delta, no wrong/stale/setup-fragility increase, visible fallback, and no default promotion."
        : "Phase 47 provider-backed retrieval rollout eval blocked because prerequisite evidence, quality deltas, fallback visibility, or default-promotion boundaries failed.",
    },
    defaultScenario: providerScenario.defaultScenario,
    fallbackScenario,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    inputs: {
      phase45AdoptionReport: {
        providerBackedStatus: phase45.providerBackedStatus,
        reportPath: phase45ReportPath,
        runId: phase45.runId,
        status: phase45.status,
      },
      phase46QualityReport: {
        providerBackedPromotionSeparated: phase46.providerBackedPromotionSeparated,
        reportPath: phase46ReportPath,
        runId: phase46.runId,
        status: phase46.status,
      },
    },
    metrics,
    mode: "provider-backed-retrieval-rollout",
    outputDir,
    phase: "phase-47",
    promotionCriteria: PROMOTION_CRITERIA,
    rawTranscriptPersistence: {
      evidenceSource:
        "deterministic_provider_backed_recall_paths_and_phase45_46_redacted_reports",
      persistedRawTranscripts: false,
    },
    runDirectory,
    runId,
    scenarios,
    scope: {
      inScope: [...PHASE47_IN_SCOPE],
      outOfScope: [...PHASE47_OUT_OF_SCOPE],
    },
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export async function runPhase47ProviderRolloutEvalCli(
  dependencies: Phase47ProviderRolloutEvalCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? Bun.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runEval = dependencies.runEval ?? runPhase47ProviderRolloutEval;
  const report = await runEval(parsePhase47ProviderRolloutEvalCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }
}

if (import.meta.main) {
  await runPhase47ProviderRolloutEvalCli();
}
