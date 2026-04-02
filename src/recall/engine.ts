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
import type { SessionStore } from "../storage/contracts";
import type { MemoryRepositories } from "../storage/repositories";
import {
  buildMemoryPacket,
  type MemoryPacket,
} from "./contextBuilder";
import {
  planRecall,
  resolveRetrievalProfile,
  type RetrievalProfile,
  type RoutingDecision,
} from "./router";
import {
  evaluateVerificationHints,
  type VerificationHint,
} from "../verify/policy";
import type { MemorySourceMethod } from "../domain/provenance";

export interface RecallInput {
  scope: MemoryScope;
  query: string;
  retrievalProfile?: RetrievalProfile;
}

export interface RecallHit {
  id: string;
  type:
    | "profile"
    | "preference"
    | "reference"
    | "fact"
    | "feedback"
    | "episode"
    | "working_memory"
    | "session_journal";
  score?: number;
  reason?: string;
  sourceMethod?: MemorySourceMethod;
}

export interface RecallResult {
  profile: UserProfile | null;
  preferences: PreferenceMemory[];
  references: ReferenceMemory[];
  facts: FactMemory[];
  feedback: FeedbackMemory[];
  episodes: EpisodeMemory[];
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
  packet: MemoryPacket;
  metadata: {
    routingDecision: RoutingDecision;
    tokenCount: number;
    latencyMs: number;
    hits: RecallHit[];
    verificationHints: VerificationHint[];
  };
}

export interface RecallEngineConfig {
  repositories: MemoryRepositories;
  sessionStore: SessionStore;
  now?: () => number;
  referenceTime?: () => string;
}

const TOKEN_STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "should",
  "answer",
  "reply",
  "respond",
  "user",
  "using",
  "current",
  "please",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !TOKEN_STOPWORDS.has(token));
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function isAnswerCompositionQuery(query: string): boolean {
  return /\b(answer|respond|reply|user)\b/i.test(query);
}

function isReferenceSeekingQuery(query: string): boolean {
  return /\b(runbook|guide|doc|docs|reference|source of truth|workflow)\b/i.test(query);
}

function isContinuationQuery(query: string): boolean {
  return /\b(continue|resume|last time|from last time|carry on|pick up)\b/i.test(query);
}

function categoryPriority(category: FactMemory["category"], query: string): number {
  if (isAnswerCompositionQuery(query)) {
    if (category === "project" || category === "technical") {
      return 0.4;
    }
    if (category === "personal") {
      return 0.1;
    }
  }

  return 0;
}

function selectFacts(facts: FactMemory[], query: string): FactMemory[] {
  const ranked = sortFacts(facts)
    .map((fact) => ({
      fact,
      score: tokenOverlap(fact.content, query) + categoryPriority(fact.category, query),
    }))
    .sort((left, right) => right.score - left.score);

  const withSignal = ranked.filter((entry) => entry.score >= 0.2);
  if (withSignal.length > 0) {
    return withSignal.slice(0, 2).map((entry) => entry.fact);
  }

  return ranked.slice(0, 1).map((entry) => entry.fact);
}

function selectReferences(references: ReferenceMemory[], query: string): ReferenceMemory[] {
  const ranked = sortReferences(references)
    .map((reference) => ({
      reference,
      score:
        tokenOverlap(reference.title, query) +
        tokenOverlap(reference.pointer, query) +
        tokenOverlap(reference.description ?? "", query),
    }))
    .sort((left, right) => right.score - left.score);

  const withSignal = ranked.filter((entry) => entry.score > 0);
  if (withSignal.length > 0) {
    return withSignal.slice(0, 1).map((entry) => entry.reference);
  }

  if (isAnswerCompositionQuery(query) || isReferenceSeekingQuery(query)) {
    return ranked.slice(0, 1).map((entry) => entry.reference);
  }

  return [];
}

function selectEpisodes(episodes: EpisodeMemory[], query: string): EpisodeMemory[] {
  const ranked = sortEpisodes(episodes)
    .map((episode) => ({
      episode,
      lexicalSignal:
        tokenOverlap(episode.summary, query) +
        tokenOverlap(episode.topics.join(" "), query),
      score:
        tokenOverlap(episode.summary, query) +
        tokenOverlap(episode.topics.join(" "), query) +
        episode.importance * 0.1,
    }))
    .sort((left, right) => right.score - left.score);

  const withSignal = ranked.filter(
    (entry) => entry.lexicalSignal > 0 || isContinuationQuery(query),
  );
  if (withSignal.length > 0) {
    return withSignal.slice(0, 2).map((entry) => entry.episode);
  }

  return [];
}

function sortFacts(facts: FactMemory[]): FactMemory[] {
  return [...facts].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "active" ? -1 : 1;
    }
    if (left.source.method !== right.source.method) {
      return left.source.method === "explicit" ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function sortFeedback(feedback: FeedbackMemory[]): FeedbackMemory[] {
  return [...feedback].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "active" ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function sortPreferences(preferences: PreferenceMemory[]): PreferenceMemory[] {
  return [...preferences].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function sortReferences(references: ReferenceMemory[]): ReferenceMemory[] {
  return [...references].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) {
      return left.lifecycle === "active" ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function sortEpisodes(episodes: EpisodeMemory[]): EpisodeMemory[] {
  return [...episodes].sort((left, right) => {
    if (right.importance !== left.importance) {
      return right.importance - left.importance;
    }
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function buildHits(input: {
  profile: UserProfile | null;
  preferences: PreferenceMemory[];
  references: ReferenceMemory[];
  facts: FactMemory[];
  feedback: FeedbackMemory[];
  episodes: EpisodeMemory[];
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
  routingDecision: RoutingDecision;
}): RecallHit[] {
  const hits: RecallHit[] = [];

  for (const source of input.routingDecision.sourcePriorities) {
    if (source === "profile") {
      if (input.profile) {
        hits.push({
          id: input.profile.userId,
          type: "profile",
          reason: "profile_available",
        });
      }

      for (const preference of input.preferences.slice(0, 3)) {
        hits.push({
          id: preference.id,
          type: "preference",
          reason: "semantic_preference",
          sourceMethod: preference.source.method,
        });
      }

      for (const reference of input.references.slice(0, 3)) {
        hits.push({
          id: reference.id,
          type: "reference",
          reason: "semantic_reference",
          sourceMethod: reference.source.method,
        });
      }
    }

    if (source === "fact") {
      for (const fact of input.facts.slice(0, 3)) {
        hits.push({
          id: fact.id,
          type: "fact",
          reason: "scope_match",
          sourceMethod: fact.source.method,
        });
      }
    }

    if (source === "feedback") {
      for (const feedback of input.feedback.slice(0, 3)) {
        hits.push({
          id: feedback.id,
          type: "feedback",
          reason: "scope_match",
          sourceMethod: feedback.source.method,
        });
      }
    }

    if (source === "episode") {
      for (const episode of input.episodes.slice(0, 2)) {
        hits.push({
          id: episode.id,
          type: "episode",
          reason: "continuation_context",
        });
      }
    }

    if (source === "working_memory" && input.workingMemory) {
      hits.push({
        id: input.workingMemory.sessionId,
        type: "working_memory",
        reason: "runtime_continuity",
      });
    }

    if (source === "session_journal" && input.journal) {
      hits.push({
        id: input.journal.sessionId,
        type: "session_journal",
        reason: "runtime_continuity",
      });
    }
  }

  return hits;
}

export function createRecallEngine(config: RecallEngineConfig) {
  const now = config.now ?? Date.now;
  const referenceTime = config.referenceTime ?? (() => new Date(now()).toISOString());

  return {
    async recall(input: RecallInput): Promise<RecallResult> {
      const startedAt = now();
      const retrievalProfile = resolveRetrievalProfile(input.retrievalProfile);

      const [
        profile,
        preferencesRaw,
        referencesRaw,
        factsRaw,
        feedbackRaw,
        episodesRaw,
        workingMemoryRaw,
        journalRaw,
      ] =
        await Promise.all([
          config.repositories.profiles.get(input.scope.userId),
          config.repositories.preferences.listByScope(input.scope),
          config.repositories.references.listByScope(input.scope),
          config.repositories.facts.listByScope(input.scope),
          config.repositories.feedback.listByScope(input.scope),
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
        query: input.query,
        runtime: {
          hasWorkingMemory: Boolean(workingMemoryRaw),
          hasJournal: Boolean(journalRaw),
        },
      });

      const preferences = sortPreferences(preferencesRaw);
      const facts = selectFacts(factsRaw, input.query);
      const feedback = sortFeedback(feedbackRaw);
      const episodes = selectEpisodes(episodesRaw, input.query);
      const references = selectReferences(referencesRaw, input.query);
      const workingMemory =
        retrievalProfile === "coding_agent" ? workingMemoryRaw : null;
      const journal = retrievalProfile === "coding_agent" ? journalRaw : null;
      const packet = buildMemoryPacket({
        profile,
        preferences,
        references,
        facts,
        feedback,
        episodes,
        workingMemory,
        journal,
      });

      return {
        profile,
        preferences,
        references,
        facts,
        feedback,
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
            referenceTime: referenceTime(),
            facts,
            references,
            episodes,
          }),
          hits: buildHits({
            profile,
            preferences,
            references,
            facts,
            feedback,
            episodes,
            workingMemory,
            journal,
            routingDecision,
          }),
        },
      };
    },
  };
}
