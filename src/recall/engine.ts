import type {
  EpisodeMemory,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { MemorySourceMethod } from "../domain/provenance";
import type { EmbeddingAdapter } from "../embedding/contracts";
import type { EvidenceRecord } from "../evidence/contracts";
import type { SessionArchive } from "../domain/evolutionRecords";
import {
  createLanguageService,
  type LanguageService,
} from "../language";
import type { GoodMemoryPolicyHooks } from "../policy/hooks";
import type {
  RecallRepositoryPort,
  RecallRuntimePort,
  RecallVectorSearchPort,
} from "../storage/ports";
import {
  evaluateVerificationHints,
  type VerificationHint,
} from "../verify/policy";
import {
  buildMemoryPacket,
  type MemoryPacket,
} from "./contextBuilder";
import {
  applyRecallAssistantPlan,
  applyRecallAssistantRerank,
  buildRecallAssistantCandidates,
  type RecallAssistantFallbackReason,
  type RecallAssistantInfluence,
  type RecallAssistantFallbackStage,
  type RecallAssistantProviderDiagnostic,
  type RecallRouterAssistant,
  resolveRecallRouterInfluenceStatus,
} from "./assistant";
import {
  attachEvidenceIdsToCandidateTraces,
  buildEvidenceLinkIndex,
  buildHits,
  collectSessionScopedEvidence,
  collectTraceMemoryIds,
  filterLinkedEvidence,
  selectEvidence,
} from "./evidence";
import {
  applyRecallPolicyToProfile,
  applyRecallPolicyToRecords,
  reconcileCandidateTraces,
} from "./policy";
import {
  planRecall,
  type RecallRouterStrategy,
  resolveRecallRoutingWarningMessages,
  resolveRetrievalProfile,
  type RecallSlot,
  type RetrievalProfile,
  SEMANTIC_RECALL_INACTIVE_WARNING,
  type RoutingDecision,
} from "./router";
import { ProviderBackedRecallError } from "./errors";
import { computeBm25Scores } from "./bm25";
import { fuseGeneralizedRecallCandidates } from "./generalizedFusion";
import { admitGeneralizedRecords } from "./generalizedAdmissions";
import type { GeneralizedFusionCandidate } from "./generalizedFusion";
import type { GeneralizedFusionSelectionInput } from "./factSelection/generalizedFusionUnion";
import type { RecallProjectionSearchPort } from "./projections/contracts";
import {
  searchSemanticScores,
  type SemanticSearchScores,
} from "./scoring";
import {
  selectArchives,
  selectEpisodes,
  selectFacts,
  selectFeedbackForQuery,
  selectPreferencesForQuery,
  selectReferences,
} from "./selection";

export interface RecallInput {
  scope: MemoryScope;
  query: string;
  retrievalProfile?: RetrievalProfile;
  strategy?: RecallRouterStrategy;
  ignoreMemory?: boolean;
  locale?: string;
}

export interface RecallHit {
  id: string;
  type:
    | "profile"
    | "preference"
    | "reference"
    | "fact"
    | "feedback"
    | "evidence"
    | "session_archive"
    | "episode"
    | "working_memory"
    | "session_journal";
  score?: number;
  reason?: string;
  sourceMethod?: MemorySourceMethod;
  evidenceIds?: string[];
}

export interface RecallCandidateTrace {
  memoryId: string;
  memoryType: "fact" | "reference" | "archive" | "episode";
  slot: RecallSlot | "generic";
  returned: boolean;
  whyReturned?: string;
  whySuppressed?: string;
  intentScore: number;
  lexicalScore: number;
  freshnessScore: number;
  explicitnessScore: number;
  usageScore?: number;
  evidenceScore?: number;
  outcomeScore?: number;
  verificationPenaltyScore?: number;
  // Normalized semantic similarity of this candidate. Emitted ONLY when the
  // semantic-candidates union feature is active for the call, so traces of
  // rules-only / BM25-only / union-off runs serialize byte-identically to the
  // pre-union engine.
  semanticScore?: number;
  fallback:
    | "none"
    | "same_slot_unique_candidate"
    | "zero_retrieval_lexical"
    | "semantic_union"
    | "generalized_fusion";
  evidenceIds?: string[];
}

export interface RecallResult {
  profile: UserProfile | null;
  preferences: PreferenceMemory[];
  references: ReferenceMemory[];
  facts: FactMemory[];
  feedback: FeedbackMemory[];
  archives: SessionArchive[];
  evidence: EvidenceRecord[];
  episodes: EpisodeMemory[];
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
  packet: MemoryPacket;
  metadata: {
    assistantInfluence?: RecallAssistantInfluence;
    routingDecision: RoutingDecision;
    tokenCount: number;
    latencyMs: number;
    hits: RecallHit[];
    candidateTraces: RecallCandidateTrace[];
    verificationHints: VerificationHint[];
    policyApplied: string[];
    locale?: string;
    localeSource?: "explicit" | "detected" | "default";
    adapterId?: string;
    analysisMode?: "rules-only";
  };
}

// Opt-in second candidate SOURCE: the cosine top-K facts from the vector index
// are force-admitted into fact selection regardless of lexical/intent/subject
// signal, under strategy=hybrid with an embedding adapter + vector index only.
// This is the only mechanism that can surface a zero-lexical-overlap fact:
// every admission gate in fact selection keys on lexical/intent/subject
// signals, and the additive semanticScore only re-ranks already-admitted
// candidates. Off by default; when unset, recall behavior is byte-identical.
export interface RecallSemanticCandidatesConfig {
  // Vector-store fetch size for the union source (the additive-ranking fetch
  // becomes max(8, topK)). Default 8.
  topK?: number;
  // RAW vector-store score floor (dot/inner product; equals cosine only for
  // unit-normalized embeddings). Default: no floor.
  minSimilarity?: number;
  // Relative score floor. When set, admit only union candidates whose raw store
  // score is at least bestRawScore * minRelativeScore. This is an opt-in noise
  // control for widened semantic admission budgets. Default: no relative floor.
  minRelativeScore?: number;
  // Noise budget: maximum facts ADMITTED BY THE UNION per recall. Candidates
  // that deduped against route/augmenter/fallback selections or failed the
  // compatible-pool check consume no budget. Default: topK.
  maxAdditions?: number;
}

export interface RecallGeneralizedFusionConfig {
  // Global cap for the fused content-candidate set. This is an additive recall
  // budget, not a cap on records already selected by the baseline selectors.
  maxCandidates?: number;
  // Caps baseline plus generalized facts. Other content lanes keep their own
  // small record limits.
  maxTotalFacts?: number;
  minRelativeStrength?: number;
  rrfK?: number;
}

export interface RecallEngineConfig {
  assistedRouter?: RecallRouterAssistant;
  embedding?: EmbeddingAdapter;
  // Opt-in: when set (and no neural semantic search runs), populate the additive
  // ranking slot with Okapi BM25 over the in-memory candidate pool for
  // non-rules-only strategies. Off by default, so rules-only/hybrid ranking is
  // unchanged unless explicitly enabled.
  bm25Ranking?: boolean;
  generalizedFusion?: RecallGeneralizedFusionConfig;
  // Set by retrieval.preset resolution (never a public per-call knob): biases
  // "auto" routing to hybrid whenever semantic search is available, so the
  // semantic union fires without an explicit per-call strategy.
  autoStrategyBias?: "hybrid";
  // Opt-in semantic candidate-generation union (see the config type above).
  semanticCandidates?: RecallSemanticCandidatesConfig;
  language?: LanguageService;
  repositories: RecallRepositoryPort & { vectorIndex?: RecallVectorSearchPort | null };
  runtime: RecallRuntimePort;
  vectorIndex?: RecallVectorSearchPort | null;
  now?: () => number;
  policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
  projectionIndex?: RecallProjectionSearchPort;
  referenceTime?: () => string;
}

function buildEvidenceCountByMemoryId(
  evidence: EvidenceRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const record of evidence) {
    for (const memoryId of record.linkedMemoryIds) {
      counts.set(memoryId, (counts.get(memoryId) ?? 0) + 1);
    }
  }

  return counts;
}

function buildEmptyAssistantInfluence(): RecallAssistantInfluence {
  return {
    addedRequestedSlots: [],
    addedSupportSlots: [],
    decisions: [],
    planApplied: false,
    rerankApplied: false,
    rerankedCandidateIds: [],
    routerInfluenceStatus: "full_fallback",
    suppressedCandidateIds: [],
  };
}

function resolveAssistantFallbackReason(error: unknown): RecallAssistantFallbackReason {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes("schema validation failed")) {
    return "schema_invalid";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }

  return "provider_error";
}

function summarizeAssistantProviderError(error: unknown): string {
  const rawMessage =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : String(error);

  return rawMessage.replace(/\s+/g, " ").trim().slice(0, 240);
}

function extractValidationIssueSummary(message: string): string | undefined {
  const marker = "schema validation failed:";
  const index = message.toLowerCase().indexOf(marker);
  if (index === -1) {
    return undefined;
  }

  return message.slice(index + marker.length).trim().slice(0, 240);
}

function buildAssistantProviderDiagnostic(input: {
  error: unknown;
  stage: RecallAssistantFallbackStage;
}): RecallAssistantProviderDiagnostic {
  const message = summarizeAssistantProviderError(input.error);
  const reason = resolveAssistantFallbackReason(input.error);

  return {
    message,
    reason,
    stage: input.stage,
    ...(reason === "schema_invalid"
      ? { validationIssueSummary: extractValidationIssueSummary(message) }
      : {}),
  };
}

function withAssistantProviderFallback(input: {
  error: unknown;
  influence: RecallAssistantInfluence | undefined;
  stage: RecallAssistantFallbackStage;
}): RecallAssistantInfluence {
  const current = input.influence ?? buildEmptyAssistantInfluence();
  const diagnostic = buildAssistantProviderDiagnostic({
    error: input.error,
    stage: input.stage,
  });
  const next = {
    ...current,
    fallbackReason: diagnostic.reason,
    fallbackStage: input.stage,
    providerDiagnostics: [
      ...(current.providerDiagnostics ?? []),
      diagnostic,
    ],
  };

  return {
    ...next,
    routerInfluenceStatus: resolveRecallRouterInfluenceStatus(next),
  };
}

function finalizeAssistantInfluence(
  influence: RecallAssistantInfluence | undefined,
): RecallAssistantInfluence | undefined {
  if (!influence) {
    return undefined;
  }

  return {
    ...influence,
    routerInfluenceStatus: resolveRecallRouterInfluenceStatus(influence),
  };
}

function appendAssistantTraceDetails(
  traces: RecallCandidateTrace[],
  influence?: RecallAssistantInfluence,
): RecallCandidateTrace[] {
  if (!influence) {
    return traces;
  }

  const decisionsByCandidateId = new Map(
    influence.decisions.map((decision) => [decision.candidateId, decision]),
  );

  return traces.map((trace) => {
    const decision = decisionsByCandidateId.get(trace.memoryId);
    if (!decision) {
      return trace;
    }

    if (trace.returned) {
      if (decision.decision !== "promote") {
        return trace;
      }

      return {
        ...trace,
        whyReturned: trace.whyReturned
          ? `${trace.whyReturned}, llmDecision=${decision.decision}:${decision.reason}`
          : `llmDecision=${decision.decision}:${decision.reason}`,
      };
    }

    if (decision.decision === "suppress") {
      return {
        ...trace,
        whySuppressed: `llm-assisted suppress: ${decision.reason}`,
      };
    }

    return trace;
  });
}

function collectAssistantProtectedCandidateIds(
  traceGroups: RecallCandidateTrace[][],
): Set<string> {
  const protectedCandidateIds = new Set<string>();

  for (const traces of traceGroups) {
    for (const trace of traces) {
      if (trace.returned && trace.slot !== "generic") {
        protectedCandidateIds.add(trace.memoryId);
      }
    }
  }

  return protectedCandidateIds;
}

function createAssistantSuppressionTraceReason(
  suppressedCandidateIds: readonly string[],
): (trace: RecallCandidateTrace) => string {
  const suppressedIds = new Set(suppressedCandidateIds);

  return (trace) =>
    suppressedIds.has(trace.memoryId)
      ? "llm-assisted suppress"
      : "policy filtered";
}

function shouldSuppressGuidanceLanesForFactQuery(input: {
  language: LanguageService;
  locale: string;
  query: string;
  routingDecision: RoutingDecision;
}): boolean {
  if (
    input.routingDecision.retrievalProfile === "coding_agent" ||
    input.routingDecision.continuation ||
    input.routingDecision.actionDriving ||
    input.routingDecision.referenceSeeking ||
    input.language.isAnswerCompositionQuery(input.query, input.locale) ||
    input.language.isGuidanceSeekingQuery(input.query, input.locale)
  ) {
    return false;
  }

  return input.language.isDirectFactualLookupQuery(input.query, input.locale);
}

function withRoutingWarning(
  routingDecision: RoutingDecision,
  warning: string,
): RoutingDecision {
  const warnings = routingDecision.strategyExplanation.warnings ?? [];
  if (warnings.includes(warning)) {
    return routingDecision;
  }

  const nextWarnings = [...warnings, warning];
  const warningMessages = resolveRecallRoutingWarningMessages({
    existingMessages: routingDecision.strategyExplanation.warningMessages,
    warnings: nextWarnings,
  });

  return {
    ...routingDecision,
    strategyExplanation: {
      ...routingDecision.strategyExplanation,
      ...(warningMessages.length > 0 ? { warningMessages } : {}),
      warnings: nextWarnings,
    },
  };
}

function shouldWarnSemanticUnionInactive(input: {
  embedding: EmbeddingAdapter | undefined;
  routingDecision: RoutingDecision;
  semanticCandidates: RecallSemanticCandidatesConfig | undefined;
  vectorIndex: RecallVectorSearchPort | null;
}): boolean {
  return Boolean(
    input.semanticCandidates &&
      input.embedding &&
      input.vectorIndex &&
      input.routingDecision.strategy !== "hybrid" &&
      input.routingDecision.strategyExplanation.requestedStrategy !== "rules-only",
  );
}

export function createRecallEngine(config: RecallEngineConfig) {
  const language = config.language ?? createLanguageService();
  const now = config.now ?? Date.now;
  const referenceTime = config.referenceTime ?? (() => new Date(now()).toISOString());
  const vectorIndex =
    config.vectorIndex !== undefined
      ? config.vectorIndex ?? null
      : config.repositories.vectorIndex ?? null;

  return {
    async recall(input: RecallInput): Promise<RecallResult> {
      const startedAt = now();
      const resolvedLanguage = language.resolveFromText({
        locale: input.locale,
        text: input.query,
      });
      const retrievalProfile = resolveRetrievalProfile(input.retrievalProfile);
      const policyApplied = new Set<string>();
      const routerAvailability = {
        // BM25 ranking populates the same additive slot as neural semantic
        // search, so it also counts as "semantic search available" for routing:
        // without this, a requested hybrid strategy would fall back to
        // rules-only whenever no embedding endpoint exists, disabling BM25
        // exactly when it is the intended lexical-semantic signal.
        semanticSearch: Boolean(
          (config.embedding && vectorIndex) ||
            config.bm25Ranking ||
            (config.generalizedFusion && config.projectionIndex),
        ),
        llmRouting: Boolean(config.assistedRouter),
      };

      if (input.ignoreMemory) {
        const routingDecision = planRecall({
          retrievalProfile,
          strategy: input.strategy,
          autoStrategyBias: config.autoStrategyBias,
          availability: routerAvailability,
          query: input.query,
          locale: resolvedLanguage.locale,
          language,
          runtime: {
            hasWorkingMemory: false,
            hasJournal: false,
          },
        });
        const packet = buildMemoryPacket({
          profile: null,
          preferences: [],
          references: [],
          facts: [],
          feedback: [],
          archives: [],
          evidence: [],
          episodes: [],
          workingMemory: null,
          journal: null,
          locale: resolvedLanguage.locale,
          routingDecision,
        });
        policyApplied.add("ignore_memory");

        return {
          profile: null,
          preferences: [],
          references: [],
          facts: [],
          feedback: [],
          archives: [],
          evidence: [],
          episodes: [],
          workingMemory: null,
          journal: null,
          packet,
          metadata: {
            routingDecision,
            tokenCount: packet.debug?.estimatedTokens ?? 0,
            latencyMs: now() - startedAt,
            hits: [],
            candidateTraces: [],
            verificationHints: [],
            policyApplied: [...policyApplied],
            locale: resolvedLanguage.locale,
            localeSource: resolvedLanguage.localeSource,
            adapterId: resolvedLanguage.adapterId,
            analysisMode: resolvedLanguage.analysisMode,
          },
        };
      }

      const [
        profile,
        preferencesRaw,
        referencesRaw,
        factsRaw,
        feedbackRaw,
        archivesRaw,
        evidenceRaw,
        episodesRaw,
        workingMemoryRaw,
        journalRaw,
      ] = await Promise.all([
        config.repositories.profiles.get(input.scope.userId),
        config.repositories.preferences.listByScope(input.scope),
        config.repositories.references.listByScope(input.scope),
        config.repositories.facts.listByScope(input.scope),
        config.repositories.feedback.listByScope(input.scope),
        config.repositories.archives.listByScope(input.scope),
        config.repositories.evidence.listByScope(input.scope),
        config.repositories.episodes.listByScope(input.scope),
        input.scope.sessionId
          ? config.runtime.getWorkingMemory(input.scope)
          : Promise.resolve(null),
        input.scope.sessionId
          ? config.runtime.getJournal(input.scope)
          : Promise.resolve(null),
      ]);

      let routingDecision = planRecall({
        retrievalProfile,
        strategy: input.strategy,
        autoStrategyBias: config.autoStrategyBias,
        availability: routerAvailability,
        query: input.query,
        locale: resolvedLanguage.locale,
        language,
        runtime: {
          hasWorkingMemory: Boolean(workingMemoryRaw),
          hasJournal: Boolean(journalRaw),
        },
      });
      let assistantInfluence =
        routingDecision.strategy === "llm-assisted" && config.assistedRouter
          ? buildEmptyAssistantInfluence()
          : undefined;

      if (
        routingDecision.strategy === "llm-assisted" &&
        config.assistedRouter &&
        !assistantInfluence?.fallbackReason
      ) {
        try {
          const assistantPlan = await config.assistedRouter.plan({
            locale: resolvedLanguage.locale,
            query: input.query,
            routingDecision,
            runtime: {
              hasWorkingMemory: Boolean(workingMemoryRaw),
              hasJournal: Boolean(journalRaw),
            },
          });
          const assistedPlan = applyRecallAssistantPlan({
            influence: assistantInfluence ?? buildEmptyAssistantInfluence(),
            plan: assistantPlan,
            routingDecision,
          });
          routingDecision = assistedPlan.routingDecision;
          assistantInfluence = assistedPlan.influence;
        } catch (error) {
          assistantInfluence = withAssistantProviderFallback({
            error,
            influence: assistantInfluence,
            stage: "plan",
          });
        }
      }
      if (
        shouldWarnSemanticUnionInactive({
          embedding: config.embedding,
          routingDecision,
          semanticCandidates: config.semanticCandidates,
          vectorIndex,
        })
      ) {
        routingDecision = withRoutingWarning(
          routingDecision,
          SEMANTIC_RECALL_INACTIVE_WARNING,
        );
      }
      const currentReferenceTime = referenceTime();
      const visibleEvidencePool = await applyRecallPolicyToRecords(
        evidenceRaw,
        "evidence",
        {
          scope: input.scope,
          query: input.query,
          retrievalProfile,
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          policy: config.policy,
          policyApplied,
        },
      );
      const evidenceCountsByMemoryId = buildEvidenceCountByMemoryId(visibleEvidencePool);
      let semanticScores: SemanticSearchScores | undefined;
      let semanticFactCandidates: SemanticSearchScores["semanticFactCandidates"];
      const semanticUnionTopK = Math.max(
        1,
        Math.floor(config.semanticCandidates?.topK ?? 8),
      );
      const computeBm25AdditiveScores = (): SemanticSearchScores => {
        // Okapi BM25 over the in-memory candidate pool populates the same
        // additive ranking slot a neural semantic score would, giving
        // hybrid/llm-assisted ranking IDF + length normalization with no
        // embedding endpoint. rules-only never consumes this slot, so the pure
        // lexical floor is preserved.
        // IMPORTANT: this helper must never populate `semanticFactCandidates` -
        // BM25 scores are lexical, and feeding them to the semantic-candidates
        // union would readmit the lexical floor the union exists to bypass.
        const tokenizeForLocale = (text: string): string[] =>
          language.tokenize(text, resolvedLanguage.locale, {
            excludeStopwords: true,
          });
        return {
          facts: computeBm25Scores(
            input.query,
            factsRaw.map((fact) => ({
              id: fact.id,
              text: `${fact.content} ${fact.subject ?? ""}`,
            })),
            { tokenize: tokenizeForLocale },
          ),
          references: computeBm25Scores(
            input.query,
            referencesRaw.map((reference) => ({
              id: reference.id,
              text: `${reference.title} ${reference.pointer} ${reference.description ?? ""}`,
            })),
            { tokenize: tokenizeForLocale },
          ),
          episodes: computeBm25Scores(
            input.query,
            episodesRaw.map((episode) => ({
              id: episode.id,
              text: `${episode.summary} ${(episode.topics ?? []).join(" ")}`,
            })),
            { tokenize: tokenizeForLocale },
          ),
        };
      };
      if (
        routingDecision.strategy === "hybrid" &&
        config.embedding &&
        vectorIndex &&
        (!config.bm25Ranking || config.semanticCandidates)
      ) {
        try {
          const providerSemanticScores = await searchSemanticScores({
            embedding: config.embedding,
            query: input.query,
            scope: input.scope,
            vectorIndex,
            ...(config.semanticCandidates || config.generalizedFusion
              ? {
                  factCandidates: {
                    topK:
                      config.semanticCandidates?.topK ??
                      config.generalizedFusion?.maxCandidates ??
                      semanticUnionTopK,
                  },
                }
              : {}),
          });
          semanticFactCandidates = providerSemanticScores.semanticFactCandidates;
          semanticScores = config.bm25Ranking
            ? {
                ...computeBm25AdditiveScores(),
                ...(providerSemanticScores.semanticFactCandidates !== undefined
                  ? {
                      semanticFactCandidates:
                        providerSemanticScores.semanticFactCandidates,
                    }
                  : {}),
              }
            : providerSemanticScores;
        } catch (error) {
          throw new ProviderBackedRecallError({
            cause: error,
            stage: "semantic_search",
          });
        }
      } else if (
        config.bm25Ranking &&
        routingDecision.strategy !== "rules-only"
      ) {
        semanticScores = computeBm25AdditiveScores();
      }

      let generalizedFusion: GeneralizedFusionSelectionInput | undefined;
      let generalizedFusionCandidates: GeneralizedFusionCandidate[] = [];
      if (
        config.generalizedFusion &&
        routingDecision.strategy !== "rules-only"
      ) {
        if (!config.projectionIndex) {
          policyApplied.add("generalized_fusion_unavailable");
        } else {
          try {
            const coverage = await config.projectionIndex.ensureScopeIndexed(
              input.scope,
            );
            const [documents, entities] = await Promise.all([
              config.projectionIndex.queryDocuments(input.scope),
              config.projectionIndex.queryEntities(input.scope),
            ]);
            const contentDocuments = documents.filter(
              (document) =>
                document.sourceCollection === "facts" ||
                document.sourceCollection === "references" ||
                document.sourceCollection === "episodes" ||
                document.sourceCollection === "session_archives",
            );
            const contentEntities = entities
              .map((entity) => ({
                ...entity,
                memoryIds: entity.memoryIds.filter(
                  (id) =>
                    id.startsWith("facts:") ||
                    id.startsWith("references:") ||
                    id.startsWith("episodes:") ||
                    id.startsWith("session_archives:"),
                ),
              }))
              .filter((entity) => entity.memoryIds.length > 0);
            const fused = fuseGeneralizedRecallCandidates({
              query: input.query,
              documents: contentDocuments,
              entities: contentEntities,
              denseCandidates: (semanticFactCandidates ?? [])
                .filter((candidate, _index, candidates) => {
                  const bestScore = candidates[0]?.score ?? 0;
                  return (
                    candidate.score > 0 &&
                    (config.semanticCandidates?.minSimilarity === undefined ||
                      candidate.score >=
                        config.semanticCandidates.minSimilarity) &&
                    (config.semanticCandidates?.minRelativeScore === undefined ||
                      candidate.score + Number.EPSILON >=
                        bestScore * config.semanticCandidates.minRelativeScore)
                  );
                })
                .slice(
                  0,
                  Math.max(
                    0,
                    Math.floor(
                      config.semanticCandidates?.maxAdditions ??
                        semanticUnionTopK,
                    ),
                  ),
                )
                .map(({ id: sourceMemoryId, score }) => ({
                  sourceCollection: "facts" as const,
                  sourceMemoryId,
                  score,
                })),
              maxCandidates: config.generalizedFusion.maxCandidates,
              minRelativeStrength:
                config.generalizedFusion.minRelativeStrength,
              referenceTime: currentReferenceTime,
              rrfK: config.generalizedFusion.rrfK,
              tokenize: (text) =>
                language.tokenize(text, resolvedLanguage.locale, {
                  excludeStopwords: true,
                }),
            });
            generalizedFusionCandidates = fused.candidates;
            generalizedFusion = {
              candidates: fused.candidates
                .filter((candidate) => candidate.sourceCollection === "facts")
                .map((candidate) => ({
                  id: candidate.sourceMemoryId,
                  score: candidate.score,
                })),
              maxAdditions: fused.budget,
              maxTotalFacts: config.generalizedFusion.maxTotalFacts,
            };
            policyApplied.add("generalized_fusion");
            if (!coverage.complete) {
              policyApplied.add("generalized_fusion_partial_projection");
            }
          } catch (error) {
            console.error(
              "[goodmemory:generalized-fusion] projection retrieval failed; preserving baseline recall",
              error,
            );
            policyApplied.add("generalized_fusion_unavailable");
          }
        }
      }

      const filteredProfile = await applyRecallPolicyToProfile(profile, {
        scope: input.scope,
        query: input.query,
        retrievalProfile,
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
        policy: config.policy,
        policyApplied,
      });
      const suppressGuidanceLanes = shouldSuppressGuidanceLanesForFactQuery({
        language,
        locale: resolvedLanguage.locale,
        query: input.query,
        routingDecision,
      });
      const includeGuidanceLanes = !suppressGuidanceLanes;
      const preferences = includeGuidanceLanes
        ? await applyRecallPolicyToRecords(
            selectPreferencesForQuery(
              preferencesRaw,
              input.query,
              language,
              resolvedLanguage.locale,
            ),
            "preference",
            {
              scope: input.scope,
              query: input.query,
              retrievalProfile,
              locale: resolvedLanguage.locale,
              localeSource: resolvedLanguage.localeSource,
              policy: config.policy,
              policyApplied,
            },
          )
        : [];
      if (suppressGuidanceLanes) {
        policyApplied.add("guidance_lanes_suppressed_for_fact_query");
      }
      // The union is bound to the embedding branch by construction:
      // semanticFactCandidates only exists when searchSemanticScores ran with
      // factCandidates. BM25 may supply additive scores in the same run, but it
      // never supplies union candidates.
      if (config.semanticCandidates && (!config.embedding || !vectorIndex)) {
        policyApplied.add("semantic_candidates_unavailable");
      }
      const semanticUnion =
        !generalizedFusion &&
        config.semanticCandidates &&
        semanticFactCandidates !== undefined &&
        semanticFactCandidates.length > 0
          ? {
              candidates: semanticFactCandidates,
              maxAdditions: Math.max(
                0,
                Math.floor(
                  config.semanticCandidates.maxAdditions ?? semanticUnionTopK,
                ),
              ),
              ...(config.semanticCandidates.minSimilarity !== undefined
                ? { minSimilarity: config.semanticCandidates.minSimilarity }
                : {}),
              ...(config.semanticCandidates.minRelativeScore !== undefined
                ? {
                    minRelativeScore:
                      config.semanticCandidates.minRelativeScore,
                  }
                : {}),
            }
          : undefined;
      const selectedFacts = selectFacts(
        factsRaw,
        input.query,
        language,
        resolvedLanguage.locale,
        retrievalProfile,
        routingDecision,
        filteredProfile,
        currentReferenceTime,
        semanticScores?.facts,
        evidenceCountsByMemoryId,
        semanticUnion,
        generalizedFusion,
      );
      let facts = await applyRecallPolicyToRecords(
        selectedFacts.facts,
        "fact",
        {
          scope: input.scope,
          query: input.query,
          retrievalProfile,
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          policy: config.policy,
          policyApplied,
        },
      );
      const visibleFeedback = includeGuidanceLanes
        ? await applyRecallPolicyToRecords(
            feedbackRaw,
            "feedback",
            {
              scope: input.scope,
              query: input.query,
              retrievalProfile,
              locale: resolvedLanguage.locale,
              localeSource: resolvedLanguage.localeSource,
              policy: config.policy,
              policyApplied,
            },
          )
        : [];
      const feedback = selectFeedbackForQuery(
        visibleFeedback,
        input.query,
        language,
        resolvedLanguage.locale,
        retrievalProfile,
      );
      const selectedArchives = selectArchives(
        archivesRaw,
        input.query,
        language,
        resolvedLanguage.locale,
        routingDecision,
        currentReferenceTime,
      );
      const generalizedArchives = admitGeneralizedRecords({
        candidates: generalizedFusionCandidates,
        collection: "session_archives",
        getId: (archive) => archive.id,
        maxRecords: 1,
        records: archivesRaw,
        selected: selectedArchives.archives,
        traces: selectedArchives.traces,
      });
      let archives = await applyRecallPolicyToRecords(
        generalizedArchives,
        "archive",
        {
          scope: input.scope,
          query: input.query,
          retrievalProfile,
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          policy: config.policy,
          policyApplied,
        },
      );
      const selectedEpisodes = selectEpisodes(
        episodesRaw,
        input.query,
        language,
        resolvedLanguage.locale,
        routingDecision,
        currentReferenceTime,
        semanticScores?.episodes,
      );
      const generalizedEpisodes = admitGeneralizedRecords({
        candidates: generalizedFusionCandidates,
        collection: "episodes",
        getId: (episode) => episode.id,
        maxRecords: 2,
        records: episodesRaw,
        selected: selectedEpisodes.episodes,
        traces: selectedEpisodes.traces,
      });
      let episodes = await applyRecallPolicyToRecords(
        generalizedEpisodes,
        "episode",
        {
          scope: input.scope,
          query: input.query,
          retrievalProfile,
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          policy: config.policy,
          policyApplied,
        },
      );
      const selectedReferences = selectReferences(
        referencesRaw,
        input.query,
        language,
        resolvedLanguage.locale,
        routingDecision,
        currentReferenceTime,
        semanticScores?.references,
        evidenceCountsByMemoryId,
      );
      const generalizedReferences = admitGeneralizedRecords({
        candidates: generalizedFusionCandidates,
        collection: "references",
        getId: (reference) => reference.id,
        maxRecords: 1,
        records: referencesRaw,
        selected: selectedReferences.references,
        traces: selectedReferences.traces,
      });
      let references = await applyRecallPolicyToRecords(
        generalizedReferences,
        "reference",
        {
          scope: input.scope,
          query: input.query,
          retrievalProfile,
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          policy: config.policy,
          policyApplied,
        },
      );
      if (
        routingDecision.strategy === "llm-assisted" &&
        config.assistedRouter &&
        !assistantInfluence?.fallbackReason
      ) {
        const rerankSelection = {
          facts,
          references,
          archives,
          episodes,
        };
        const protectedCandidateIds = collectAssistantProtectedCandidateIds([
          selectedFacts.traces,
          selectedReferences.traces,
          selectedArchives.traces,
          selectedEpisodes.traces,
        ]);
        const assistantCandidates = buildRecallAssistantCandidates(rerankSelection, {
          protectedCandidateIds,
        });

        if (assistantCandidates.length > 0) {
          try {
            const rerank = await config.assistedRouter.rerank({
              candidates: assistantCandidates,
              locale: resolvedLanguage.locale,
              query: input.query,
              querySummary: assistantInfluence?.querySummary,
              routingDecision,
            });
            const reranked = applyRecallAssistantRerank({
              influence: assistantInfluence ?? buildEmptyAssistantInfluence(),
              protectedCandidateIds,
              rerank,
              selection: rerankSelection,
            });

            assistantInfluence = reranked.influence;
            ({
              facts,
              references,
              archives,
              episodes,
            } = reranked.selection);
          } catch (error) {
            assistantInfluence = withAssistantProviderFallback({
              error,
              influence: assistantInfluence,
              stage: "rerank",
            });
          }
        }
      }
      const factTraceIds = collectTraceMemoryIds(selectedFacts.traces);
      const referenceTraceIds = collectTraceMemoryIds(selectedReferences.traces);
      const archiveTraceIds = collectTraceMemoryIds(selectedArchives.traces);
      const episodeTraceIds = collectTraceMemoryIds(selectedEpisodes.traces);
      const feedbackEvidenceIds = new Set(
        feedback.flatMap((feedbackItem) => feedbackItem.evidence ?? []),
      );
      const visibleLinkedEvidence = filterLinkedEvidence(
        visibleEvidencePool,
        new Set([
          ...facts.map((fact) => fact.id),
          ...references.map((reference) => reference.id),
          ...feedback.map((feedbackItem) => feedbackItem.id),
          ...episodes.map((episode) => episode.id),
        ]),
        new Set(archives.map((archive) => archive.id)),
        feedbackEvidenceIds,
      );
      const explainabilityLinkedEvidence = filterLinkedEvidence(
        visibleEvidencePool,
        new Set([
          ...factTraceIds.memoryIds,
          ...referenceTraceIds.memoryIds,
          ...episodeTraceIds.memoryIds,
          ...feedback.map((feedbackItem) => feedbackItem.id),
        ]),
        new Set([...archiveTraceIds.archiveIds]),
        feedbackEvidenceIds,
      );
      const sessionScopedEvidence =
        retrievalProfile === "coding_agent"
          ? collectSessionScopedEvidence(visibleEvidencePool, input.scope)
          : [];
      const evidence = routingDecision.sourcePriorities.includes("evidence")
        ? selectEvidence([...visibleLinkedEvidence, ...sessionScopedEvidence])
        : [];
      const evidenceIndex = buildEvidenceLinkIndex(explainabilityLinkedEvidence);
      const assistantSuppressionTraceReason = createAssistantSuppressionTraceReason(
        assistantInfluence?.suppressedCandidateIds ?? [],
      );
      const candidateTraces = appendAssistantTraceDetails(
        attachEvidenceIdsToCandidateTraces(
          [
            ...reconcileCandidateTraces(
              selectedFacts.traces,
              new Set(facts.map((fact) => fact.id)),
              assistantSuppressionTraceReason,
            ),
            ...reconcileCandidateTraces(
              selectedReferences.traces,
              new Set(references.map((reference) => reference.id)),
              assistantSuppressionTraceReason,
            ),
            ...reconcileCandidateTraces(
              selectedArchives.traces,
              new Set(archives.map((archive) => archive.id)),
              assistantSuppressionTraceReason,
            ),
            ...reconcileCandidateTraces(
              selectedEpisodes.traces,
              new Set(episodes.map((episode) => episode.id)),
              assistantSuppressionTraceReason,
            ),
          ],
          evidenceIndex,
        ),
        assistantInfluence,
      );
      const workingMemory =
        retrievalProfile === "coding_agent" ? workingMemoryRaw : null;
      const journal = retrievalProfile === "coding_agent" ? journalRaw : null;
      const packet = buildMemoryPacket({
        profile: filteredProfile,
        preferences,
        references,
        facts,
        feedback,
        archives,
        evidence,
        episodes,
        workingMemory,
        journal,
        durableCandidateOrder: assistantInfluence?.rerankApplied
          ? assistantInfluence.rerankedCandidateIds
          : undefined,
        locale: resolvedLanguage.locale,
        routingDecision,
      });

      return {
        profile: filteredProfile,
        preferences,
        references,
        facts,
        feedback,
        archives,
        evidence,
        episodes,
        workingMemory,
        journal,
        packet,
        metadata: {
          ...(assistantInfluence
            ? { assistantInfluence: finalizeAssistantInfluence(assistantInfluence)! }
            : {}),
          routingDecision,
          tokenCount: packet.debug?.estimatedTokens ?? 0,
          latencyMs: now() - startedAt,
          verificationHints: evaluateVerificationHints({
            query: input.query,
            referenceTime: currentReferenceTime,
            evidenceIdsByMemoryId: evidenceIndex.byMemoryId,
            facts,
            references,
            episodes,
            locale: resolvedLanguage.locale,
            language,
          }),
          candidateTraces,
          policyApplied: [...policyApplied],
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          adapterId: resolvedLanguage.adapterId,
          analysisMode: resolvedLanguage.analysisMode,
          hits: buildHits({
            profile: filteredProfile,
            preferences,
            references,
            facts,
            feedback,
            archives,
            evidence,
            episodes,
            workingMemory,
            journal,
            evidenceIndex,
            routingDecision,
            // buildHits iterates the post-policy facts, so a union admit the
            // recall policy removed never becomes a hit even though its
            // selection trace exists.
            semanticUnionFactIds: new Set(
              selectedFacts.traces
                .filter(
                  (trace) =>
                    trace.returned && trace.fallback === "semantic_union",
                )
                .map((trace) => trace.memoryId),
            ),
            generalizedFusionFactIds: new Set(
              selectedFacts.traces
                .filter(
                  (trace) =>
                    trace.returned && trace.fallback === "generalized_fusion",
                )
                .map((trace) => trace.memoryId),
            ),
            generalizedFusionReferenceIds: new Set(
              selectedReferences.traces
                .filter(
                  (trace) =>
                    trace.returned && trace.fallback === "generalized_fusion",
                )
                .map((trace) => trace.memoryId),
            ),
            generalizedFusionArchiveIds: new Set(
              selectedArchives.traces
                .filter(
                  (trace) =>
                    trace.returned && trace.fallback === "generalized_fusion",
                )
                .map((trace) => trace.memoryId),
            ),
            generalizedFusionEpisodeIds: new Set(
              selectedEpisodes.traces
                .filter(
                  (trace) =>
                    trace.returned && trace.fallback === "generalized_fusion",
                )
                .map((trace) => trace.memoryId),
            ),
          }),
        },
      };
    },
  };
}
