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
import type { SessionStore } from "../storage/contracts";
import type { MemoryRepositories } from "../storage/repositories";
import {
  evaluateVerificationHints,
  type VerificationHint,
} from "../verify/policy";
import {
  buildMemoryPacket,
  type MemoryPacket,
} from "./contextBuilder";
import {
  attachEvidenceIdsToCandidateTraces,
  buildEvidenceLinkIndex,
  buildHits,
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
  sortFeedback,
  sortPreferences,
} from "./scoring";
import {
  selectArchives,
  selectEpisodes,
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
  repositories: MemoryRepositories;
  sessionStore: SessionStore;
  embedding?: EmbeddingAdapter;
  now?: () => number;
  referenceTime?: () => string;
  language?: LanguageService;
  policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
}

export function createRecallEngine(config: RecallEngineConfig) {
  const language = config.language ?? createLanguageService();
  const now = config.now ?? Date.now;
  const referenceTime = config.referenceTime ?? (() => new Date(now()).toISOString());

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
        semanticSearch: Boolean(config.embedding && config.repositories.vectorIndex),
        llmRouting: false,
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
          ? config.sessionStore.getWorkingMemory(input.scope)
          : Promise.resolve(null),
        input.scope.sessionId
          ? config.sessionStore.getJournal(input.scope)
          : Promise.resolve(null),
      ]);

      const routingDecision = planRecall({
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
      const currentReferenceTime = referenceTime();
      const semanticScores =
        routingDecision.strategy === "hybrid" &&
        config.embedding &&
        config.repositories.vectorIndex
          ? await searchSemanticScores({
              embedding: config.embedding,
              query: input.query,
              scope: input.scope,
              vectorIndex: config.repositories.vectorIndex,
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
      );
      const facts = await applyRecallPolicyToRecords(
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
      const feedback = await applyRecallPolicyToRecords(
        sortFeedback(feedbackRaw),
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
      const selectedArchives = selectArchives(
        archivesRaw,
        input.query,
        language,
        resolvedLanguage.locale,
        routingDecision,
        currentReferenceTime,
      );
      const archives = await applyRecallPolicyToRecords(
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
      const episodes = await applyRecallPolicyToRecords(
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
      );
      const references = await applyRecallPolicyToRecords(
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
      const factTraceIds = collectTraceMemoryIds(selectedFacts.traces);
      const referenceTraceIds = collectTraceMemoryIds(selectedReferences.traces);
      const archiveTraceIds = collectTraceMemoryIds(selectedArchives.traces);
      const episodeTraceIds = collectTraceMemoryIds(selectedEpisodes.traces);
      const visibleLinkedEvidence = await applyRecallPolicyToRecords(
        filterLinkedEvidence(
          evidenceRaw,
          new Set([
            ...facts.map((fact) => fact.id),
            ...references.map((reference) => reference.id),
            ...feedback.map((feedbackItem) => feedbackItem.id),
            ...episodes.map((episode) => episode.id),
          ]),
          new Set(archives.map((archive) => archive.id)),
        ),
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
      const explainabilityLinkedEvidence = await applyRecallPolicyToRecords(
        filterLinkedEvidence(
          evidenceRaw,
          new Set([
            ...factTraceIds.memoryIds,
            ...referenceTraceIds.memoryIds,
            ...episodeTraceIds.memoryIds,
            ...feedback.map((feedbackItem) => feedbackItem.id),
          ]),
          new Set([...archiveTraceIds.archiveIds]),
        ),
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
      const evidence = routingDecision.sourcePriorities.includes("evidence")
        ? selectEvidence(visibleLinkedEvidence)
        : [];
      const evidenceIndex = buildEvidenceLinkIndex(explainabilityLinkedEvidence);
      const candidateTraces = attachEvidenceIdsToCandidateTraces([
        ...reconcileCandidateTraces(
          selectedFacts.traces,
          new Set(facts.map((fact) => fact.id)),
        ),
        ...reconcileCandidateTraces(
          selectedReferences.traces,
          new Set(references.map((reference) => reference.id)),
        ),
        ...reconcileCandidateTraces(
          selectedArchives.traces,
          new Set(archives.map((archive) => archive.id)),
        ),
        ...reconcileCandidateTraces(
          selectedEpisodes.traces,
          new Set(episodes.map((episode) => episode.id)),
        ),
      ], evidenceIndex);
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
