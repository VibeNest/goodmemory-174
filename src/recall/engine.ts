import type {
  EpisodeMemory,
  FactKind,
  FactMemory,
  FeedbackMemory,
  MemoryScopeKind,
  PreferenceMemory,
  ReferenceKind,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { EvidenceRecord } from "../evidence/contracts";
import type { SessionArchive } from "../evolution/contracts";
import type { SessionStore } from "../storage/contracts";
import type { MemoryRepositories } from "../storage/repositories";
import {
  buildMemoryPacket,
  type MemoryPacket,
} from "./contextBuilder";
import {
  planRecall,
  resolveRetrievalProfile,
  type RecallSlot,
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

interface EvidenceLinkIndex {
  byArchiveId: Record<string, string[]>;
  byMemoryId: Record<string, string[]>;
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
  if (
    language.isAnswerCompositionQuery(query, locale) ||
    language.isFactConfirmationQuery(query, locale) ||
    language.isProjectStateQuery(query, locale)
  ) {
    if (category === "project" || category === "technical") {
      return 0.4;
    }
    if (category === "personal") {
      return -0.25;
    }
  }

  return 0;
}

function factIntentPriority(
  fact: FactMemory,
  query: string,
  factLocale: string,
  queryLocale: string,
  language: LanguageService,
): number {
  let score = 0;

  if (language.isRoleQuery(query, queryLocale) && language.isRoleFact(fact.content, factLocale)) {
    score += 0.7;
  }

  if (
    language.isFocusQuery(query, queryLocale) &&
    language.isFocusFact(fact.content, factLocale)
  ) {
    score += 0.6;
  }

  if (
    language.isOpenLoopQuery(query, queryLocale) &&
    language.isOpenLoopFact(fact.content, factLocale)
  ) {
    score += 0.55;
  }

  if (
    language.isBlockerQuery(query, queryLocale) &&
    language.isBlockerFact(fact.content, factLocale)
  ) {
    score += 0.55;
  }

  return score;
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

function resolveArchiveLocale(
  archive: SessionArchive,
  language: LanguageService,
): string {
  return (
    archive.locale ??
    language.resolveFromText({
      text: [
        archive.summary,
        archive.keyDecisions.join(" "),
        archive.unresolvedItems.join(" "),
        archive.normalizedTranscript ?? "",
        archive.referencedArtifacts.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    }).locale
  );
}

function rankArchiveCandidates(
  entries: RankedArchiveCandidate[],
): RankedArchiveCandidate[] {
  return [...entries].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.lexicalScore !== left.lexicalScore) {
      return right.lexicalScore - left.lexicalScore;
    }
    if (right.freshnessScore !== left.freshnessScore) {
      return right.freshnessScore - left.freshnessScore;
    }

    return right.archive.archivedAt.localeCompare(left.archive.archivedAt);
  });
}

interface RankedFactCandidate {
  fact: FactMemory;
  locale: string;
  factKind?: FactKind;
  scopeKind?: MemoryScopeKind;
  subject: string;
  lexicalScore: number;
  subjectScore: number;
  intentScore: number;
  freshnessScore: number;
  explicitnessScore: number;
  categoryBoost: number;
  score: number;
}

interface RankedReferenceCandidate {
  reference: ReferenceMemory;
  locale: string;
  referenceKind?: ReferenceKind;
  subject: string;
  lexicalScore: number;
  subjectScore: number;
  intentScore: number;
  freshnessScore: number;
  explicitnessScore: number;
  score: number;
}

interface RankedEpisodeCandidate {
  episode: EpisodeMemory;
  locale: string;
  lexicalScore: number;
  freshnessScore: number;
  score: number;
}

interface RankedArchiveCandidate {
  archive: SessionArchive;
  locale: string;
  lexicalScore: number;
  freshnessScore: number;
  score: number;
}

function daysBetween(left: string, right: string): number {
  const ms = Math.abs(new Date(left).getTime() - new Date(right).getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function freshnessScore(timestamp: string, referenceTime: string): number {
  const ageDays = daysBetween(referenceTime, timestamp);
  if (ageDays <= 7) {
    return 0.25;
  }
  if (ageDays <= 30) {
    return 0.15;
  }
  if (ageDays <= 90) {
    return 0.05;
  }

  return 0;
}

function explicitnessScore(method: MemorySourceMethod): number {
  if (method === "explicit" || method === "confirmed") {
    return 0.15;
  }
  if (method === "import") {
    return 0.05;
  }

  return 0;
}

function resolveFactKind(
  fact: FactMemory,
  language: LanguageService,
  locale: string,
): FactKind | undefined {
  if (fact.factKind) {
    return fact.factKind;
  }
  if (language.isRoleFact(fact.content, locale)) {
    return "role_update";
  }
  if (language.isFocusFact(fact.content, locale)) {
    return "focus_update";
  }
  if (language.isBlockerFact(fact.content, locale)) {
    return "blocker";
  }
  if (language.isOpenLoopFact(fact.content, locale)) {
    return "open_loop";
  }
  if (language.isProjectStateFact(fact.content, locale)) {
    return "project_state";
  }
  if (fact.category === "project" || fact.category === "technical") {
    return "generic_project";
  }

  return undefined;
}

function resolveFactScopeKind(
  fact: FactMemory,
  factKind: FactKind | undefined,
): MemoryScopeKind | undefined {
  if (fact.scopeKind) {
    return fact.scopeKind;
  }
  if (factKind === "role_update") {
    return "identity";
  }
  if (
    factKind === "focus_update" ||
    factKind === "blocker" ||
    factKind === "open_loop" ||
    factKind === "project_state" ||
    factKind === "generic_project"
  ) {
    return "project";
  }
  if (
    fact.category === "personal" ||
    fact.category === "relationship" ||
    fact.category === "event"
  ) {
    return "identity";
  }
  if (fact.category === "project" || fact.category === "technical") {
    return "project";
  }

  return undefined;
}

function resolveReferenceKind(reference: ReferenceMemory): ReferenceKind | undefined {
  if (reference.referenceKind) {
    return reference.referenceKind;
  }

  const basename = reference.pointer.split("/").at(-1)?.toLowerCase() ?? "";
  if (basename.includes("runbook")) {
    return "runbook";
  }
  if (basename.includes("dashboard")) {
    return "dashboard";
  }
  if (basename.includes("tracker")) {
    return "tracker";
  }
  if (basename.length > 0) {
    return "doc";
  }

  return undefined;
}

function buildReturnedReason(
  slot: RecallSlot | "generic",
  intentScore: number,
  lexicalScore: number,
  fallback: RecallCandidateTrace["fallback"],
): string {
  return `slot=${slot}, intentScore=${intentScore.toFixed(2)}, lexicalScore=${lexicalScore.toFixed(2)}, fallback=${fallback}`;
}

function buildFactCandidates(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  referenceTime: string,
): RankedFactCandidate[] {
  return sortFacts(facts).map((fact) => {
    const locale = resolveFactLocale(fact, language);
    const factKind = resolveFactKind(fact, language, locale);
    const scopeKind = resolveFactScopeKind(fact, factKind);
    const subject = fact.subject ?? "unknown";
    const lexicalScore = language.tokenOverlap(fact.content, query, queryLocale, {
      excludeStopwords: true,
    });
    const subjectScore =
      subject === "unknown"
        ? 0
        : language.tokenOverlap(subject, query, queryLocale, {
            excludeStopwords: true,
          });
    const intentScore = factIntentPriority(
      fact,
      query,
      locale,
      queryLocale,
      language,
    );
    const freshness = freshnessScore(fact.updatedAt, referenceTime);
    const explicitness = explicitnessScore(fact.source.method);
    const categoryBoost = categoryPriority(fact.category, query, language, queryLocale);

    return {
      fact,
      locale,
      factKind,
      scopeKind,
      subject,
      lexicalScore,
      subjectScore,
      intentScore,
      freshnessScore: freshness,
      explicitnessScore: explicitness,
      categoryBoost,
      score: lexicalScore + subjectScore + intentScore + freshness + explicitness + categoryBoost,
    };
  });
}

function buildReferenceCandidates(
  references: ReferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  referenceTime: string,
): RankedReferenceCandidate[] {
  return sortReferences(references).map((reference) => {
    const locale = resolveReferenceLocale(reference, language);
    const lexicalScore =
      language.tokenOverlap(reference.title, query, queryLocale, {
        excludeStopwords: true,
      }) +
      language.tokenOverlap(reference.pointer, query, queryLocale, {
        excludeStopwords: true,
      }) +
      language.tokenOverlap(reference.description ?? "", query, queryLocale, {
        excludeStopwords: true,
      });
    const subject = reference.subject ?? "unknown";
    const subjectScore =
      subject === "unknown"
        ? 0
        : language.tokenOverlap(subject, query, queryLocale, {
            excludeStopwords: true,
          });
    const freshness = freshnessScore(reference.updatedAt, referenceTime);
    const explicitness = explicitnessScore(reference.source.method);

    return {
      reference,
      locale,
      referenceKind: resolveReferenceKind(reference),
      subject,
      lexicalScore,
      subjectScore,
      intentScore: 0.8,
      freshnessScore: freshness,
      explicitnessScore: explicitness,
      score: lexicalScore + subjectScore + freshness + explicitness + 0.8,
    };
  });
}

function buildEpisodeCandidates(
  episodes: EpisodeMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  referenceTime: string,
): RankedEpisodeCandidate[] {
  return sortEpisodes(episodes).map((episode) => {
    const locale = resolveEpisodeLocale(episode, language);
    const lexicalScore =
      language.tokenOverlap(episode.summary, query, queryLocale, {
        excludeStopwords: true,
      }) +
      language.tokenOverlap(episode.topics.join(" "), query, queryLocale, {
        excludeStopwords: true,
      });
    const freshness = freshnessScore(episode.createdAt, referenceTime);

    return {
      episode,
      locale,
      lexicalScore,
      freshnessScore: freshness,
      score: lexicalScore + freshness + episode.importance * 0.1,
    };
  });
}

function buildArchiveCandidates(
  archives: SessionArchive[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  referenceTime: string,
): RankedArchiveCandidate[] {
  return sortArchives(archives).map((archive) => {
    const locale = resolveArchiveLocale(archive, language);
    const summaryScore = language.tokenOverlap(archive.summary, query, queryLocale, {
      excludeStopwords: true,
    });
    const unresolvedScore = language.tokenOverlap(
      archive.unresolvedItems.join(" "),
      query,
      queryLocale,
      {
        excludeStopwords: true,
      },
    );
    const decisionScore = language.tokenOverlap(
      archive.keyDecisions.join(" "),
      query,
      queryLocale,
      {
        excludeStopwords: true,
      },
    );
    const transcriptScore = language.tokenOverlap(
      archive.normalizedTranscript ?? "",
      query,
      queryLocale,
      {
        excludeStopwords: true,
      },
    );
    const artifactScore = language.tokenOverlap(
      archive.referencedArtifacts.join(" "),
      query,
      queryLocale,
      {
        excludeStopwords: true,
      },
    );
    const lexicalScore =
      unresolvedScore * 1.4 +
      decisionScore * 1.2 +
      summaryScore +
      transcriptScore * 0.6 +
      artifactScore * 0.4;
    const freshness = freshnessScore(archive.archivedAt, referenceTime);

    return {
      archive,
      locale,
      lexicalScore,
      freshnessScore: freshness,
      score: lexicalScore + freshness + 0.2,
    };
  });
}

function markSelectedTrace(
  traces: RecallCandidateTrace[],
  memoryId: string,
  slot: RecallSlot | "generic",
  intentScore: number,
  lexicalScore: number,
  freshness: number,
  explicitness: number,
  fallback: RecallCandidateTrace["fallback"],
): void {
  const index = traces.findIndex((trace) => trace.memoryId === memoryId);
  if (index === -1) {
    return;
  }

  traces[index] = {
    ...traces[index]!,
    slot,
    returned: true,
    whyReturned: buildReturnedReason(slot, intentScore, lexicalScore, fallback),
    whySuppressed: undefined,
    intentScore,
    lexicalScore,
    freshnessScore: freshness,
    explicitnessScore: explicitness,
    fallback,
  };
}

function slotMatchesFact(
  entry: RankedFactCandidate,
  slot: RecallSlot,
): boolean {
  if (slot === "role") {
    return entry.factKind === "role_update";
  }
  if (slot === "focus") {
    return entry.factKind === "focus_update";
  }
  if (slot === "blocker") {
    return entry.factKind === "blocker";
  }
  if (slot === "open_loop") {
    return entry.factKind === "open_loop";
  }
  if (slot === "project_state_support") {
    return (
      entry.factKind === "blocker" ||
      entry.factKind === "open_loop" ||
      entry.factKind === "focus_update" ||
      entry.factKind === "project_state"
    );
  }

  return false;
}

const PROJECT_STATE_SUPPORT_PRIMARY_KINDS = [
  ["blocker"],
  ["open_loop"],
] as const satisfies ReadonlyArray<readonly FactKind[]>;

const PROJECT_STATE_SUPPORT_FALLBACK_KINDS = [
  "focus_update",
  "project_state",
] as const satisfies readonly FactKind[];

function hasFactSelectionSignal(entry: RankedFactCandidate): boolean {
  return (
    entry.intentScore > 0 ||
    entry.lexicalScore >= 0.2 ||
    entry.subjectScore >= 0.2
  );
}

function selectFacts(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  retrievalProfile: RetrievalProfile,
  routingDecision: RoutingDecision,
  profile: UserProfile | null,
  referenceTime: string,
): { facts: FactMemory[]; traces: RecallCandidateTrace[] } {
  const answerCompositionQuery = language.isAnswerCompositionQuery(query, queryLocale);
  const factConfirmationQuery = language.isFactConfirmationQuery(query, queryLocale);
  const ranked = buildFactCandidates(
    facts,
    query,
    language,
    queryLocale,
    referenceTime,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.fact.id,
    memoryType: "fact",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : entry.fact.lifecycle !== "active"
        ? "inactive lifecycle"
        : "not selected",
    intentScore: entry.intentScore,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: entry.explicitnessScore,
    fallback: "none",
  }));
  const compatible = ranked.filter(
    (entry) =>
      entry.fact.lifecycle === "active" &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const slotSpecificFactQuery =
    routingDecision.requestedSlots.includes("role") ||
    routingDecision.requestedSlots.includes("focus") ||
    routingDecision.requestedSlots.includes("blocker") ||
    routingDecision.requestedSlots.includes("open_loop") ||
    routingDecision.requestedSlots.includes("reference") ||
    routingDecision.supportSlots.includes("project_state_support");

  const trySelectSlot = (
    slot: RecallSlot,
    entries: RankedFactCandidate[],
    allowUniqueFallback: boolean,
  ) => {
    const resolveCandidates = (factKinds?: readonly FactKind[]) =>
      entries
        .filter((entry) => !selectedIds.has(entry.fact.id))
        .filter((entry) => slotMatchesFact(entry, slot))
        .filter((entry) => {
          if (!factKinds) {
            return true;
          }

          return entry.factKind ? factKinds.includes(entry.factKind) : false;
        })
        .sort((left, right) => right.score - left.score);
    const resolvePick = (
      candidates: RankedFactCandidate[],
      allowFallback: boolean,
    ) => {
      const signaledPick = candidates.find(hasFactSelectionSignal);

      if (signaledPick) {
        return {
          candidate: signaledPick,
          fallback: "none" as const,
        };
      }

      if (!allowFallback) {
        return {
          candidate: undefined,
          fallback: "none" as const,
        };
      }

      const uniqueActiveExplicit = candidates.filter(
        (entry) => entry.fact.source.method !== "inferred",
      );
      if (uniqueActiveExplicit.length === 1) {
        return {
          candidate: uniqueActiveExplicit[0],
          fallback: "same_slot_unique_candidate" as const,
        };
      }

      return {
        candidate: undefined,
        fallback: "none" as const,
      };
    };
    const selectCandidate = (
      candidate: RankedFactCandidate,
      fallback: RecallCandidateTrace["fallback"],
    ) => {
      selected.push(candidate);
      selectedIds.add(candidate.fact.id);
      markSelectedTrace(
        traces,
        candidate.fact.id,
        slot,
        candidate.intentScore,
        candidate.lexicalScore,
        candidate.freshnessScore,
        candidate.explicitnessScore,
        fallback,
      );
    };

    if (slot === "project_state_support") {
      let selectedSupportCount = 0;

      const blockerPick = resolvePick(
        resolveCandidates(PROJECT_STATE_SUPPORT_PRIMARY_KINDS[0]),
        false,
      );
      if (blockerPick.candidate) {
        selectCandidate(blockerPick.candidate, blockerPick.fallback);
        selectedSupportCount += 1;
      }

      const openLoopPick = resolvePick(
        resolveCandidates(PROJECT_STATE_SUPPORT_PRIMARY_KINDS[1]),
        false,
      );
      if (openLoopPick.candidate && (blockerPick.candidate || selectedSupportCount === 0)) {
        selectCandidate(openLoopPick.candidate, openLoopPick.fallback);
        selectedSupportCount += 1;
      }

      if (selectedSupportCount === 0) {
        const fallbackPick = resolvePick(
          resolveCandidates(PROJECT_STATE_SUPPORT_FALLBACK_KINDS),
          false,
        );
        if (fallbackPick.candidate) {
          selectCandidate(fallbackPick.candidate, fallbackPick.fallback);
          selectedSupportCount += 1;
        }
      }

      if (selectedSupportCount === 0 && allowUniqueFallback) {
        const uniqueFallbackPick = resolvePick(resolveCandidates(), true);
        if (uniqueFallbackPick.candidate) {
          selectCandidate(uniqueFallbackPick.candidate, uniqueFallbackPick.fallback);
        }
      }

      return;
    }

    const pick = resolvePick(resolveCandidates(), allowUniqueFallback);
    if (pick.candidate) {
      selectCandidate(pick.candidate, pick.fallback);
    }
  };

  if (
    routingDecision.requestedSlots.includes("reference") &&
    !routingDecision.supportSlots.includes("project_state_support") &&
    !routingDecision.requestedSlots.includes("blocker") &&
    !routingDecision.requestedSlots.includes("open_loop") &&
    !routingDecision.requestedSlots.includes("focus") &&
    !(
      routingDecision.requestedSlots.includes("role") &&
      (!profile?.identity.role || routingDecision.requestedSlots.length > 1)
    )
  ) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "reference-only query";
      }
    }
    return {
      facts: [],
      traces,
    };
  }

  if (slotSpecificFactQuery) {
    const activeSlots: RecallSlot[] = [];
    if (
      routingDecision.requestedSlots.includes("role") &&
      (!profile?.identity.role || routingDecision.requestedSlots.length > 1)
    ) {
      activeSlots.push("role");
      trySelectSlot("role", compatible, false);
    } else if (routingDecision.requestedSlots.includes("role")) {
      for (const entry of compatible.filter((item) => item.factKind === "role_update")) {
        const trace = traces.find((item) => item.memoryId === entry.fact.id);
        if (trace && trace.whySuppressed === "not selected") {
          trace.whySuppressed = "profile satisfied role slot";
        }
      }
    }

    if (routingDecision.requestedSlots.includes("focus")) {
      activeSlots.push("focus");
      trySelectSlot("focus", compatible, false);
    }
    if (routingDecision.requestedSlots.includes("blocker")) {
      activeSlots.push("blocker");
      trySelectSlot("blocker", compatible, false);
    }
    if (routingDecision.requestedSlots.includes("open_loop")) {
      activeSlots.push("open_loop");
      trySelectSlot("open_loop", compatible, false);
    }
    if (routingDecision.supportSlots.includes("project_state_support")) {
      activeSlots.push("project_state_support");
      trySelectSlot("project_state_support", compatible, true);
    }

    for (const entry of compatible) {
      const trace = traces.find((item) => item.memoryId === entry.fact.id);
      if (!trace || trace.returned || trace.whySuppressed !== "not selected") {
        continue;
      }

      if (!activeSlots.some((slot) => slotMatchesFact(entry, slot))) {
        trace.whySuppressed = "slot mismatch";
      } else {
        trace.whySuppressed = "no slot signal";
      }
    }

    return {
      facts: selected.map((entry) => entry.fact),
      traces,
    };
  }

  const limit = answerCompositionQuery || factConfirmationQuery ? 3 : 2;
  const withIntentSignal = compatible
    .filter((entry) => entry.intentScore > 0)
    .sort((left, right) => right.score - left.score);
  const withLexicalSignal = compatible
    .filter((entry) => entry.lexicalScore >= 0.2)
    .sort((left, right) => right.score - left.score);

  if (withIntentSignal.length > 0) {
    for (const entry of withIntentSignal.slice(0, limit)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        "none",
      );
    }
  } else if (withLexicalSignal.length > 0) {
    for (const entry of withLexicalSignal.slice(0, limit)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        "none",
      );
    }
  } else if (answerCompositionQuery || factConfirmationQuery) {
    for (const entry of compatible
      .filter(
        (item) =>
          item.fact.category === "project" || item.fact.category === "technical",
      )
      .slice(0, limit)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        "none",
      );
    }
  } else if (retrievalProfile === "coding_agent") {
    const fallback = compatible.find(
      (entry) =>
        entry.fact.category !== "personal" &&
        entry.fact.category !== "relationship" &&
        entry.fact.category !== "event",
    );
    if (fallback) {
      selected.push(fallback);
      selectedIds.add(fallback.fact.id);
      markSelectedTrace(
        traces,
        fallback.fact.id,
        "generic",
        fallback.intentScore,
        fallback.lexicalScore,
        fallback.freshnessScore,
        fallback.explicitnessScore,
        "none",
      );
    }
  }

  for (const entry of compatible) {
    const trace = traces.find((item) => item.memoryId === entry.fact.id);
    if (trace && !trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "below generic threshold";
    }
  }

  return {
    facts: selected.map((entry) => entry.fact),
    traces,
  };
}

function selectReferences(
  references: ReferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
): { references: ReferenceMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = buildReferenceCandidates(
    references,
    query,
    language,
    queryLocale,
    referenceTime,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.reference.id,
    memoryType: "reference",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : entry.reference.lifecycle !== "active"
        ? "inactive lifecycle"
        : "not selected",
    intentScore: entry.intentScore,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: entry.explicitnessScore,
    fallback: "none",
  }));
  const compatible = ranked.filter(
    (entry) =>
      entry.reference.lifecycle === "active" &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  const slotSpecificNonReferenceQuery =
    !routingDecision.requestedSlots.includes("reference") &&
    (routingDecision.requestedSlots.includes("role") ||
      routingDecision.requestedSlots.includes("focus") ||
      routingDecision.requestedSlots.includes("blocker") ||
      routingDecision.requestedSlots.includes("open_loop"));
  const signaled = compatible
    .filter((entry) => entry.lexicalScore > 0 || entry.subjectScore >= 0.2)
    .sort((left, right) => right.score - left.score);

  if (slotSpecificNonReferenceQuery) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "non-reference slot query";
      }
    }
    return {
      references: [],
      traces,
    };
  }

  if (routingDecision.requestedSlots.includes("reference")) {
    const selected = signaled[0] ?? (compatible.length === 1 ? compatible[0] : null);

    if (selected) {
      markSelectedTrace(
        traces,
        selected.reference.id,
        "reference",
        selected.intentScore,
        selected.lexicalScore,
        selected.freshnessScore,
        selected.explicitnessScore,
        signaled[0] ? "none" : "same_slot_unique_candidate",
      );
      for (const trace of traces) {
        if (trace.memoryId !== selected.reference.id && trace.whySuppressed === "not selected") {
          trace.whySuppressed = "same-slot candidate not chosen";
        }
      }
      return {
        references: [selected.reference],
        traces,
      };
    }

    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no reference signal";
      }
    }
    return {
      references: [],
      traces,
    };
  }

  const genericSelected =
    signaled[0] ??
    ((language.isAnswerCompositionQuery(query, queryLocale) && compatible[0]) || null);
  if (!genericSelected) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "below generic threshold";
      }
    }
    return {
      references: [],
      traces,
    };
  }

  markSelectedTrace(
    traces,
    genericSelected.reference.id,
    "generic",
    genericSelected.intentScore,
    genericSelected.lexicalScore,
    genericSelected.freshnessScore,
    genericSelected.explicitnessScore,
    signaled[0] ? "none" : "same_slot_unique_candidate",
  );
  for (const trace of traces) {
    if (trace.memoryId !== genericSelected.reference.id && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "same-slot candidate not chosen";
    }
  }
  return {
    references: [genericSelected.reference],
    traces,
  };
}

function selectEpisodes(
  episodes: EpisodeMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
): { episodes: EpisodeMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = buildEpisodeCandidates(
    episodes,
    query,
    language,
    queryLocale,
    referenceTime,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.episode.id,
    memoryType: "episode",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : "not selected",
    intentScore: routingDecision.continuation ? 0.6 : 0,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: 0,
    fallback: "none",
  }));
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );
  const slotSpecificQuery =
    routingDecision.requestedSlots.includes("role") ||
    routingDecision.requestedSlots.includes("focus") ||
    routingDecision.requestedSlots.includes("blocker") ||
    routingDecision.requestedSlots.includes("open_loop") ||
    routingDecision.requestedSlots.includes("reference");
  const withSignal = compatible.filter(
    (entry) => entry.lexicalScore > 0 || routingDecision.continuation,
  );

  if (slotSpecificQuery && !routingDecision.continuation) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "slot-specific query";
      }
    }
    return {
      episodes: [],
      traces,
    };
  }

  if (withSignal.length === 0) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }
    return {
      episodes: [],
      traces,
    };
  }

  const selected = withSignal.slice(0, 2);
  for (const entry of selected) {
    markSelectedTrace(
      traces,
      entry.episode.id,
      "generic",
      routingDecision.continuation ? 0.6 : 0,
      entry.lexicalScore,
      entry.freshnessScore,
      0,
      "none",
    );
  }
  for (const trace of traces) {
    if (!trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "lower-ranked continuation candidate";
    }
  }
  return {
    episodes: selected.map((entry) => entry.episode),
    traces,
  };
}

function selectArchives(
  archives: SessionArchive[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
): { archives: SessionArchive[]; traces: RecallCandidateTrace[] } {
  const ranked = buildArchiveCandidates(
    archives,
    query,
    language,
    queryLocale,
    referenceTime,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.archive.id,
    memoryType: "archive",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : "not selected",
    intentScore: routingDecision.continuation ? 0.7 : 0,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: 0,
    fallback: "none",
  }));
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );
  const withSignal = rankArchiveCandidates(
    compatible.filter(
      (entry) => entry.lexicalScore > 0 || routingDecision.continuation,
    ),
  );

  if (!routingDecision.continuation) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }

    return {
      archives: [],
      traces,
    };
  }

  if (withSignal.length === 0) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }

    return {
      archives: [],
      traces,
    };
  }

  const selected = withSignal.slice(0, 1);
  for (const entry of selected) {
    markSelectedTrace(
      traces,
      entry.archive.id,
      "generic",
      0.7,
      entry.lexicalScore,
      entry.freshnessScore,
      0,
      "none",
    );
  }
  for (const trace of traces) {
    if (!trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "lower-ranked continuation candidate";
    }
  }

  return {
    archives: selected.map((entry) => entry.archive),
    traces,
  };
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

function sortArchives(archives: SessionArchive[]): SessionArchive[] {
  return [...archives].sort((left, right) =>
    right.archivedAt.localeCompare(left.archivedAt),
  );
}

function sortEvidence(evidence: EvidenceRecord[]): EvidenceRecord[] {
  return [...evidence].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function filterLinkedEvidence(
  evidence: EvidenceRecord[],
  linkedMemoryIds: Set<string>,
  linkedArchiveIds: Set<string>,
): EvidenceRecord[] {
  return sortEvidence(evidence)
    .filter((record) => {
      const matchesMemory = record.linkedMemoryIds.some((id) => linkedMemoryIds.has(id));
      const matchesArchive = record.linkedArchiveIds.some((id) => linkedArchiveIds.has(id));

      return matchesMemory || matchesArchive;
    });
}

function selectEvidence(evidence: EvidenceRecord[]): EvidenceRecord[] {
  return evidence.slice(0, 3);
}

function collectTraceMemoryIds(
  traces: RecallCandidateTrace[],
): { archiveIds: Set<string>; memoryIds: Set<string> } {
  const archiveIds = new Set<string>();
  const memoryIds = new Set<string>();

  for (const trace of traces) {
    if (trace.memoryType === "archive") {
      archiveIds.add(trace.memoryId);
      continue;
    }

    memoryIds.add(trace.memoryId);
  }

  return {
    archiveIds,
    memoryIds,
  };
}

function addEvidenceLinks(
  index: Record<string, string[]>,
  linkedIds: string[],
  evidenceId: string,
): void {
  for (const linkedId of linkedIds) {
    const existing = index[linkedId];
    if (!existing) {
      index[linkedId] = [evidenceId];
      continue;
    }

    if (!existing.includes(evidenceId)) {
      existing.push(evidenceId);
    }
  }
}

function buildEvidenceLinkIndex(evidence: EvidenceRecord[]): EvidenceLinkIndex {
  const index: EvidenceLinkIndex = {
    byArchiveId: {},
    byMemoryId: {},
  };

  for (const record of evidence) {
    addEvidenceLinks(index.byMemoryId, record.linkedMemoryIds, record.id);
    addEvidenceLinks(index.byArchiveId, record.linkedArchiveIds, record.id);
  }

  return index;
}

function evidenceIdsForMemory(
  evidenceIndex: EvidenceLinkIndex,
  memoryId: string,
): string[] | undefined {
  return evidenceIndex.byMemoryId[memoryId];
}

function evidenceIdsForArchive(
  evidenceIndex: EvidenceLinkIndex,
  archiveId: string,
): string[] | undefined {
  return evidenceIndex.byArchiveId[archiveId];
}

function attachEvidenceIdsToCandidateTraces(
  traces: RecallCandidateTrace[],
  evidenceIndex: EvidenceLinkIndex,
): RecallCandidateTrace[] {
  return traces.map((trace) => {
    const evidenceIds =
      trace.memoryType === "archive"
        ? evidenceIdsForArchive(evidenceIndex, trace.memoryId)
        : evidenceIdsForMemory(evidenceIndex, trace.memoryId);

    return evidenceIds ? { ...trace, evidenceIds } : trace;
  });
}

function buildHits(input: {
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
  evidenceIndex: EvidenceLinkIndex;
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
          evidenceIds: evidenceIdsForMemory(input.evidenceIndex, reference.id),
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
          evidenceIds: evidenceIdsForMemory(input.evidenceIndex, fact.id),
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
          evidenceIds: evidenceIdsForMemory(input.evidenceIndex, feedback.id),
        });
      }
    }

    if (source === "session_archive") {
      for (const archive of input.archives.slice(0, 1)) {
        hits.push({
          id: archive.id,
          type: "session_archive",
          reason: "continuation_context",
          evidenceIds: evidenceIdsForArchive(input.evidenceIndex, archive.id),
        });
      }
    }

    if (source === "episode") {
      for (const episode of input.episodes.slice(0, 2)) {
        hits.push({
          id: episode.id,
          type: "episode",
          reason: "continuation_context",
          evidenceIds: evidenceIdsForMemory(input.evidenceIndex, episode.id),
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

    if (source === "evidence") {
      for (const evidenceRecord of input.evidence.slice(0, 3)) {
        hits.push({
          id: evidenceRecord.id,
          type: "evidence",
          reason: "linked_evidence",
          sourceMethod: evidenceRecord.source.method,
          evidenceIds: [evidenceRecord.id],
        });
      }
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
    | "evidence"
    | "archive"
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

function reconcileCandidateTraces(
  traces: RecallCandidateTrace[],
  finalSelectedIds: Set<string>,
  reason = "policy filtered",
): RecallCandidateTrace[] {
  return traces.map((trace) => {
    if (!trace.returned) {
      return trace;
    }
    if (finalSelectedIds.has(trace.memoryId)) {
      return trace;
    }

    return {
      ...trace,
      returned: false,
      whyReturned: undefined,
      whySuppressed: reason,
      fallback: "none",
    };
  });
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
      ] =
        await Promise.all([
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
        query: input.query,
        locale: resolvedLanguage.locale,
        language,
        runtime: {
          hasWorkingMemory: Boolean(workingMemoryRaw),
          hasJournal: Boolean(journalRaw),
        },
      });
      const currentReferenceTime = referenceTime();

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
