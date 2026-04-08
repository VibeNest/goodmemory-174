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
import type {
  GoodMemoryPolicyHooks,
  PolicyContext,
} from "../policy/hooks";
import {
  passesDefaultScopeGuard,
  toPolicyMemoryRecord,
} from "../policy/hooks";
import {
  createLanguageService,
  type LanguageService,
} from "../language";

export interface RecallInput {
  scope: MemoryScope;
  query: string;
  retrievalProfile?: RetrievalProfile;
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
  now?: () => number;
  referenceTime?: () => string;
  language?: LanguageService;
  policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
}

function categoryPriority(
  category: FactMemory["category"],
  query: string,
  language: LanguageService,
  locale: string,
): number {
  if (language.isAnswerCompositionQuery(query, locale)) {
    if (category === "project" || category === "technical") {
      return 0.4;
    }
    if (category === "personal") {
      return 0.1;
    }
  }

  return 0;
}

function resolveFactLocale(
  fact: FactMemory,
  language: LanguageService,
): string {
  return (
    fact.source.locale ??
    language.resolveFromText({
      text: fact.content,
    }).locale
  );
}

function resolveReferenceLocale(
  reference: ReferenceMemory,
  language: LanguageService,
): string {
  return (
    reference.source.locale ??
    language.resolveFromText({
      text: [reference.title, reference.pointer, reference.description ?? ""]
        .filter(Boolean)
        .join(" "),
    }).locale
  );
}

function resolveEpisodeLocale(
  episode: EpisodeMemory,
  language: LanguageService,
): string {
  return (
    episode.locale ??
    language.resolveFromText({
      text: [episode.summary, episode.topics.join(" ")]
        .filter(Boolean)
        .join(" "),
    }).locale
  );
}

function selectFacts(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
): FactMemory[] {
  const ranked = sortFacts(facts)
    .map((fact) => ({
      fact,
      locale: resolveFactLocale(fact, language),
      score:
        language.tokenOverlap(fact.content, query, queryLocale, {
          excludeStopwords: true,
        }) + categoryPriority(fact.category, query, language, queryLocale),
    }))
    .sort((left, right) => right.score - left.score);
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );

  const withSignal = compatible.filter((entry) => entry.score >= 0.2);
  if (withSignal.length > 0) {
    return withSignal.slice(0, 2).map((entry) => entry.fact);
  }

  return compatible.slice(0, 1).map((entry) => entry.fact);
}

function selectReferences(
  references: ReferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
): ReferenceMemory[] {
  const ranked = sortReferences(references)
    .map((reference) => ({
      reference,
      locale: resolveReferenceLocale(reference, language),
      score:
        language.tokenOverlap(reference.title, query, queryLocale, {
          excludeStopwords: true,
        }) +
        language.tokenOverlap(reference.pointer, query, queryLocale, {
          excludeStopwords: true,
        }) +
        language.tokenOverlap(reference.description ?? "", query, queryLocale, {
          excludeStopwords: true,
        }),
    }))
    .sort((left, right) => right.score - left.score);
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );

  const withSignal = compatible.filter((entry) => entry.score > 0);
  if (withSignal.length > 0) {
    return withSignal.slice(0, 1).map((entry) => entry.reference);
  }

  if (
    language.isAnswerCompositionQuery(query, queryLocale) ||
    language.isReferenceSeekingQuery(query, queryLocale)
  ) {
    return compatible.slice(0, 1).map((entry) => entry.reference);
  }

  return [];
}

function selectEpisodes(
  episodes: EpisodeMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
): EpisodeMemory[] {
  const ranked = sortEpisodes(episodes)
    .map((episode) => ({
      episode,
      locale: resolveEpisodeLocale(episode, language),
      lexicalSignal:
        language.tokenOverlap(episode.summary, query, queryLocale, {
          excludeStopwords: true,
        }) +
        language.tokenOverlap(episode.topics.join(" "), query, queryLocale, {
          excludeStopwords: true,
        }),
      score:
        language.tokenOverlap(episode.summary, query, queryLocale, {
          excludeStopwords: true,
        }) +
        language.tokenOverlap(episode.topics.join(" "), query, queryLocale, {
          excludeStopwords: true,
        }) +
        episode.importance * 0.1,
    }))
    .sort((left, right) => right.score - left.score);
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );

  const withSignal = compatible.filter(
    (entry) =>
      entry.lexicalSignal > 0 || language.isContinuationQuery(query, queryLocale),
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

async function applyRecallPolicyToRecords<TRecord extends {
  workspaceId?: string;
  agentId?: string;
}>(
  records: TRecord[],
  memoryType:
    | "profile"
    | "preference"
    | "reference"
    | "fact"
    | "feedback"
    | "episode",
  input: {
    scope: MemoryScope;
    query: string;
    retrievalProfile: RetrievalProfile;
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
    policyApplied: Set<string>;
  },
): Promise<TRecord[]> {
  const policyContext: PolicyContext = {
    scope: input.scope,
    query: input.query,
    retrievalProfile: input.retrievalProfile,
    phase: "recall",
    locale: input.locale,
    localeSource: input.localeSource,
  };

  const visible: TRecord[] = [];

  for (const record of records) {
    if (!passesDefaultScopeGuard(input.scope, record)) {
      input.policyApplied.add("default_scope_guard");
      continue;
    }

    if (
      input.policy?.shouldRecall &&
      !(await input.policy.shouldRecall(
        toPolicyMemoryRecord(record as never, memoryType),
        policyContext,
      ))
    ) {
      input.policyApplied.add("custom_shouldRecall");
      continue;
    }

    visible.push(record);
  }

  return visible;
}

async function applyRecallPolicyToProfile(
  profile: UserProfile | null,
  input: {
    scope: MemoryScope;
    query: string;
    retrievalProfile: RetrievalProfile;
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
    policyApplied: Set<string>;
  },
): Promise<UserProfile | null> {
  if (!profile) {
    return null;
  }

  if (!input.policy?.shouldRecall) {
    return profile;
  }

  const allowed = await input.policy.shouldRecall(
    toPolicyMemoryRecord(profile, "profile"),
    {
      scope: input.scope,
      query: input.query,
      retrievalProfile: input.retrievalProfile,
      phase: "recall",
      locale: input.locale,
      localeSource: input.localeSource,
    },
  );

  if (!allowed) {
    input.policyApplied.add("custom_shouldRecall");
    return null;
  }

  return profile;
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

      if (input.ignoreMemory) {
        const routingDecision = planRecall({
          retrievalProfile,
          query: input.query,
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
          episodes: [],
          workingMemory: null,
          journal: null,
        });
        policyApplied.add("ignore_memory");

        return {
          profile: null,
          preferences: [],
          references: [],
          facts: [],
          feedback: [],
          episodes: [],
          workingMemory: null,
          journal: null,
          packet,
          metadata: {
            routingDecision,
            tokenCount: packet.debug?.estimatedTokens ?? 0,
            latencyMs: now() - startedAt,
            hits: [],
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
      const facts = await applyRecallPolicyToRecords(
        selectFacts(factsRaw, input.query, language, resolvedLanguage.locale),
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
      const episodes = await applyRecallPolicyToRecords(
        selectEpisodes(episodesRaw, input.query, language, resolvedLanguage.locale),
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
      const references = await applyRecallPolicyToRecords(
        selectReferences(
          referencesRaw,
          input.query,
          language,
          resolvedLanguage.locale,
        ),
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
      const workingMemory =
        retrievalProfile === "coding_agent" ? workingMemoryRaw : null;
      const journal = retrievalProfile === "coding_agent" ? journalRaw : null;
      const packet = buildMemoryPacket({
        profile: filteredProfile,
        preferences,
        references,
        facts,
        feedback,
        episodes,
        workingMemory,
        journal,
      });

      return {
        profile: filteredProfile,
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
