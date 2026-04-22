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
import type { SessionArchive } from "../evolution/contracts";
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
  resolveRetrievalProfile,
  type RecallSlot,
  type RetrievalProfile,
  type RoutingDecision,
} from "./router";
import {
  searchSemanticScores,
  sortPreferences,
} from "./scoring";
import {
  selectArchives,
  selectEpisodes,
  selectFeedbackForProfile,
  selectFacts,
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
  fallback: "none" | "same_slot_unique_candidate";
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

export interface RecallEngineConfig {
  assistedRouter?: RecallRouterAssistant;
  embedding?: EmbeddingAdapter;
  language?: LanguageService;
  repositories: RecallRepositoryPort & { vectorIndex?: RecallVectorSearchPort | null };
  runtime: RecallRuntimePort;
  vectorIndex?: RecallVectorSearchPort | null;
  now?: () => number;
  policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
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
        semanticSearch: Boolean(config.embedding && vectorIndex),
        llmRouting: Boolean(config.assistedRouter),
      };

      if (input.ignoreMemory) {
        const routingDecision = planRecall({
          retrievalProfile,
          strategy: input.strategy,
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
      const semanticScores =
        routingDecision.strategy === "hybrid" &&
        config.embedding &&
        vectorIndex
          ? await searchSemanticScores({
              embedding: config.embedding,
              query: input.query,
              scope: input.scope,
              vectorIndex,
            })
          : undefined;

      const filteredProfile = await applyRecallPolicyToProfile(profile, {
        scope: input.scope,
        query: input.query,
        retrievalProfile,
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
        policy: config.policy,
        policyApplied,
      });
      const preferences = await applyRecallPolicyToRecords(
        sortPreferences(preferencesRaw),
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
      );
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
      const visibleFeedback = await applyRecallPolicyToRecords(
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
      );
      const feedback = selectFeedbackForProfile(visibleFeedback, retrievalProfile);
      const selectedArchives = selectArchives(
        archivesRaw,
        input.query,
        language,
        resolvedLanguage.locale,
        routingDecision,
        currentReferenceTime,
      );
      let archives = await applyRecallPolicyToRecords(
        selectedArchives.archives,
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
      let episodes = await applyRecallPolicyToRecords(
        selectedEpisodes.episodes,
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
      let references = await applyRecallPolicyToRecords(
        selectedReferences.references,
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
          }),
        },
      };
    },
  };
}
