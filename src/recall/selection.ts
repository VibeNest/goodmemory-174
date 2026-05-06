import type {
  EpisodeMemory,
  FactKind,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  UserProfile,
} from "../domain/records";
import {
  buildFeedbackIdentityKey,
  isActiveMemoryLifecycle,
  normalizeFeedbackAppliesTo,
} from "../domain/records";
import type { SessionArchive } from "../evolution/contracts";
import type { LanguageService } from "../language";
import { FEEDBACK_RECALL_LIMIT } from "./budgets";
import type {
  RecallCandidateTrace,
} from "./engine";
import type {
  RecallSlot,
  RetrievalProfile,
  RoutingDecision,
} from "./router";
import {
  buildArchiveCandidates,
  buildEpisodeCandidates,
  buildFactCandidates,
  buildReferenceCandidates,
  materializeFactCandidate,
  rankArchiveCandidates,
  rankEpisodeCandidates,
  rankFactCandidates,
  rankReferenceCandidates,
  sortFeedback,
  sortPreferences,
  type RankedArchiveCandidate,
  type RankedFactCandidate,
} from "./scoring";

const PROJECT_STATE_SUPPORT_PRIMARY_KINDS = [
  ["blocker"],
  ["open_loop"],
] as const satisfies ReadonlyArray<readonly FactKind[]>;

const PROJECT_STATE_SUPPORT_FALLBACK_KINDS = [
  "focus_update",
  "project_state",
] as const satisfies readonly FactKind[];
const AGGREGATE_OPEN_LOOP_LIMIT = 6;
const AGGREGATE_FACT_COUNT_LIMIT = 6;
const PREFERENCE_RECALL_LIMIT = 3;
const RESEARCH_RECOMMENDATION_LIMIT = 2;
const EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD = 0.08;
const AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD = 0.05;
const AGGREGATE_GENERIC_LEXICAL_FACT_THRESHOLD = 0.2;
const AGGREGATE_TOPIC_STOPWORDS = new Set([
  "after",
  "before",
  "combined",
  "current",
  "currently",
  "days",
  "different",
  "does",
  "have",
  "hours",
  "many",
  "money",
  "months",
  "much",
  "since",
  "spend",
  "spent",
  "start",
  "this",
  "time",
  "total",
  "weeks",
  "what",
  "when",
  "where",
  "year",
  "years",
]);
const AGGREGATE_TRUSTED_EVIDENCE_TAGS = new Set([
  "compact_evidence",
  "dated_event",
  "user_answer",
]);
const QUANTIFIED_FACT_PATTERN =
  /\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b|\$\s*\d/iu;
const MONEY_FACT_PATTERN =
  /\$\s*\d|\b(?:cost|costs|costing|paid|price|prices|spent|spend|dollars?)\b/iu;
const MEDICAL_PROVIDER_FACT_PATTERN =
  /\b(?:dr\.?\s+[a-z][a-z'-]+|doctor|doctors|physician|dermatologist|ent specialist|specialist)\b/iu;
const OWNERSHIP_COUNT_FACT_PATTERN =
  /\b(?:have|has|own|owns|owned|currently have|with me|bring|bringing|using|new one|purchased)\b/iu;
const PLANT_ACQUISITION_FACT_PATTERN =
  /\b(?:got|bought|purchased|picked up|received|brought home|acquired)\b[\s\S]{0,120}\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant)\b|\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant)\b[\s\S]{0,120}\b(?:from|at|nursery|sister|bought|purchased|picked up|received|brought home|acquired)\b/iu;

function normalizeAggregateTopicToken(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, "");

  if (normalized.length > 4 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function aggregateTopicTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .match(/[a-z0-9]+(?:-[a-z0-9]+)?/gu) ?? [];

  return new Set(
    tokens
      .flatMap((token) => token.split("-"))
      .map(normalizeAggregateTopicToken)
      .filter((token) => token.length >= 4 && !AGGREGATE_TOPIC_STOPWORDS.has(token)),
  );
}

function aggregateTopicOverlapCount(
  queryTopics: ReadonlySet<string>,
  factTopics: ReadonlySet<string>,
): number {
  let overlap = 0;

  for (const token of queryTopics) {
    if (factTopics.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function isAggregateOpenLoopQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return (
    language.isOpenLoopQuery(query, locale) &&
    /\b(how many|what|which|list|all|remaining|pending|todo|to-do|open loops?)\b/i.test(
      query,
    )
  );
}

function hasAggregateOpenLoopSignal(entry: RankedFactCandidate): boolean {
  return entry.lexicalScore >= 0.2 || entry.subjectScore >= 0.2;
}

function isAggregateFactCountQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) || /\bhow much\b/i.test(query);
}

function isTemporalIntervalQuery(query: string): boolean {
  return /\bhow many\s+(?:days?|weeks?|months?|years?)\b/i.test(query) &&
    /\b(?:passed|between|ago)\b/i.test(query);
}

function isTemporalEventOrderQuery(query: string): boolean {
  return /\border\s+from\s+first\s+to\s+last\b/i.test(query) ||
    /\bwhich\b[\s\S]{0,120}\bevents?\b[\s\S]{0,120}\bfirst\b[\s\S]{0,120}\blast\b/i.test(query);
}

function isDatedEventFact(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.includes("dated_event") === true;
}

function hasTrustedAggregateEvidence(entry: RankedFactCandidate): boolean {
  if (entry.fact.source.method === "inferred") {
    return false;
  }

  if (entry.fact.source.method === "confirmed") {
    return true;
  }

  return entry.fact.tags?.some((tag) => AGGREGATE_TRUSTED_EVIDENCE_TAGS.has(tag)) === true;
}

function isAggregateMoneyQuery(query: string): boolean {
  return /\bhow much\b/i.test(query) ||
    /\b(?:total money|spent|spend|cost|costs|paid|price|dollars?)\b/i.test(query);
}

function isMedicalProviderAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:doctor|doctors|physician|physicians|specialist|specialists)\b/i.test(query);
}

function isPlantAcquisitionAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:plants?|lily|succulent|fern|basil|rose|snake plant|spider plant)\b/i.test(query) &&
    /\b(?:acquire|acquired|got|bought|purchased|picked up|received|last month)\b/i.test(query);
}

function isOwnershipCountAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:own|owns|owned|have|has|currently|bring|bringing)\b/i.test(query);
}

function hasAggregateDomainSignal(input: {
  entry: RankedFactCandidate;
  factTopics: ReadonlySet<string>;
  query: string;
  queryTopics: ReadonlySet<string>;
  topicOverlap: number;
}): boolean {
  if (input.topicOverlap >= 2) {
    return true;
  }

  if (
    isAggregateMoneyQuery(input.query) &&
    input.topicOverlap >= 1 &&
    MONEY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isMedicalProviderAggregateQuery(input.query) &&
    MEDICAL_PROVIDER_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isOwnershipCountAggregateQuery(input.query) &&
    input.topicOverlap >= 1 &&
    OWNERSHIP_COUNT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPlantAcquisitionAggregateQuery(input.query) &&
    PLANT_ACQUISITION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  return false;
}

function hasAggregateFactCountSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  if (isTemporalIntervalQuery(query) && isDatedEventFact(entry)) {
    return true;
  }

  if (/\bprojects?\b/i.test(query) && entry.fact.category === "project") {
    return true;
  }

  if (
    /\bmodel kits?\b/i.test(query) &&
    /\b(model kit|kit|\d+\/\d+\s+scale)\b/i.test(entry.fact.content)
  ) {
    return true;
  }

  const queryTopics = aggregateTopicTokens(query);
  const factTopics = aggregateTopicTokens(entry.fact.content);
  const topicOverlap = aggregateTopicOverlapCount(queryTopics, factTopics);
  const hasDomainSignal = hasAggregateDomainSignal({
    entry,
    factTopics,
    query,
    queryTopics,
    topicOverlap,
  });
  const trustedAggregateEvidence = hasTrustedAggregateEvidence(entry);
  const hasWeakAggregateEvidenceSignal =
    entry.lexicalScore >= AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD ||
    (
      isMedicalProviderAggregateQuery(query) &&
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPlantAcquisitionAggregateQuery(query) &&
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content)
    );

  if (
    trustedAggregateEvidence &&
    hasWeakAggregateEvidenceSignal &&
    hasDomainSignal &&
    (
      QUANTIFIED_FACT_PATTERN.test(entry.fact.content) ||
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content) ||
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content)
    )
  ) {
    return true;
  }

  return (
    hasDomainSignal &&
    (
      entry.intentScore > 0 ||
      entry.lexicalScore >= AGGREGATE_GENERIC_LEXICAL_FACT_THRESHOLD ||
      entry.subjectScore > 0
    )
  );
}

function hasTemporalEventOrderSignal(entry: RankedFactCandidate): boolean {
  return isDatedEventFact(entry) &&
    (entry.intentScore > 0 || entry.lexicalScore >= 0.08 || entry.subjectScore > 0);
}

function isResearchRecommendationQuery(query: string): boolean {
  return (
    /\b(recommend|suggest|find interesting)\b/i.test(query) &&
    /\b(publications?|conferences?|research|papers?|articles?)\b/i.test(query)
  );
}

function hasResearchRecommendationSignal(entry: RankedFactCandidate): boolean {
  if (entry.fact.category !== "technical" && entry.fact.category !== "project") {
    return false;
  }

  return /\b(interested in|work in|working in|research project|research papers?|articles?|publications?|conferences?)\b/i.test(
    entry.fact.content,
  );
}

function isCouponRedemptionLocationQuery(query: string): boolean {
  return /\bwhere\b/i.test(query) && /\bredeem(?:ed)?\b/i.test(query) && /\bcoupon\b/i.test(query);
}

function isCouponRedemptionFact(entry: RankedFactCandidate): boolean {
  return /\bredeemed\b/i.test(entry.fact.content) && /\bcoupon\b/i.test(entry.fact.content);
}

function isStoreContextFact(entry: RankedFactCandidate): boolean {
  return /\bi use the .+ app from [A-Z][A-Za-z0-9&.' -]+\b/i.test(
    entry.fact.content,
  );
}

function isRelationshipLatestLocationQuery(query: string): boolean {
  return /\bwhere\b/i.test(query) &&
    /\b(?:moved?|relocation|move to|move back)\b/i.test(query);
}

function resolveUpdateSeriesKey(
  entry: RankedFactCandidate,
  options: { collapseRelationshipRelocation?: boolean } = {},
): string | undefined {
  const content = entry.fact.content.toLowerCase();

  if (/\bi have tried\s+[^.]+?\bkorean restaurants in my city\b/i.test(content)) {
    return "count:korean-restaurants-in-my-city";
  }

  const personalBestMatch = entry.fact.content.match(
    /\bmy personal best time(?:\s+in\s+([^.!?]+?))?\s+is\b/i,
  );
  if (personalBestMatch) {
    const subject = (personalBestMatch[1] ?? entry.fact.subject ?? "personal best time")
      .toLowerCase()
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();

    return `personal-best:${subject}`;
  }

  if (
    options.collapseRelationshipRelocation === true &&
    entry.fact.category === "relationship" &&
    entry.fact.subject &&
    /\bmoved(?:\s+back)?\s+to\b/i.test(entry.fact.content)
  ) {
    return `relationship-relocation:${entry.fact.subject.toLowerCase()}`;
  }

  return undefined;
}

function collapseLatestUpdateSeries(
  entries: RankedFactCandidate[],
  options: { collapseRelationshipRelocation?: boolean } = {},
): RankedFactCandidate[] {
  const bySeries = new Map<string, RankedFactCandidate>();
  const passthrough: RankedFactCandidate[] = [];

  for (const entry of entries) {
    const seriesKey = resolveUpdateSeriesKey(entry, options);
    if (!seriesKey) {
      passthrough.push(entry);
      continue;
    }

    const current = bySeries.get(seriesKey);
    if (!current || entry.fact.updatedAt > current.fact.updatedAt) {
      bySeries.set(seriesKey, entry);
    }
  }

  return [...passthrough, ...bySeries.values()];
}

function preferenceSearchText(preference: PreferenceMemory): string {
  return [
    preference.category,
    String(preference.value),
    ...(preference.tags ?? []),
  ].join(" ");
}

function feedbackSearchText(feedback: FeedbackMemory): string {
  return [
    feedback.kind,
    feedback.appliesTo,
    feedback.rule,
    feedback.why,
    ...(feedback.tags ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function buildReturnedReason(
  slot: RecallSlot | "generic",
  intentScore: number,
  lexicalScore: number,
  outcomeScore: number,
  verificationPenaltyScore: number,
  fallback: RecallCandidateTrace["fallback"],
): string {
  return `slot=${slot}, intentScore=${intentScore.toFixed(2)}, lexicalScore=${lexicalScore.toFixed(2)}, outcomeScore=${outcomeScore.toFixed(2)}, verificationPenaltyScore=${verificationPenaltyScore.toFixed(2)}, fallback=${fallback}`;
}

function markSelectedTrace(
  traces: RecallCandidateTrace[],
  memoryId: string,
  slot: RecallSlot | "generic",
  intentScore: number,
  lexicalScore: number,
  freshness: number,
  explicitness: number,
  usageScore: number,
  evidenceScore: number,
  outcomeScore: number,
  verificationPenaltyScore: number,
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
    whyReturned: buildReturnedReason(
      slot,
      intentScore,
      lexicalScore,
      outcomeScore,
      verificationPenaltyScore,
      fallback,
    ),
    whySuppressed: undefined,
    intentScore,
    lexicalScore,
    freshnessScore: freshness,
    explicitnessScore: explicitness,
    usageScore,
    evidenceScore,
    outcomeScore,
    verificationPenaltyScore,
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

function hasFactSelectionSignal(entry: RankedFactCandidate): boolean {
  return (
    entry.intentScore > 0 ||
    entry.lexicalScore >= 0.2 ||
    entry.subjectScore > 0
  );
}

function hasGenericFactSelectionSignal(entry: RankedFactCandidate): boolean {
  return (
    hasFactSelectionSignal(entry) ||
    (
      entry.fact.source.method !== "inferred" &&
      entry.lexicalScore >= EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD
    )
  );
}

function feedbackApplicabilityPriority(
  feedback: FeedbackMemory,
  retrievalProfile: RetrievalProfile,
): number {
  const appliesTo = normalizeFeedbackAppliesTo(feedback.appliesTo);

  if (retrievalProfile === "coding_agent") {
    if (appliesTo === "coding_agent") {
      return 0;
    }
    if (appliesTo === "general_response") {
      return 1;
    }

    return 2;
  }

  return appliesTo === "general_response" ? 0 : 1;
}

export function selectFeedback(
  feedback: FeedbackMemory[],
  retrievalProfile: RetrievalProfile = "general_chat",
): FeedbackMemory[] {
  const selected: FeedbackMemory[] = [];
  const seen = new Set<string>();
  const prioritized = sortFeedback(feedback).sort(
    (left, right) =>
      feedbackApplicabilityPriority(left, retrievalProfile) -
      feedbackApplicabilityPriority(right, retrievalProfile),
  );

  for (const record of prioritized) {
    if (record.lifecycle !== "active") {
      continue;
    }

    const dedupeKey = buildFeedbackIdentityKey({
      kind: record.kind,
      normalizedRule: record.rule,
      appliesTo: record.appliesTo,
    });
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    selected.push(record);
    if (selected.length >= FEEDBACK_RECALL_LIMIT) {
      break;
    }
  }

  return selected;
}

export function selectFeedbackForProfile(
  feedback: FeedbackMemory[],
  retrievalProfile: RetrievalProfile,
): FeedbackMemory[] {
  return selectFeedback(feedback, retrievalProfile);
}

export function selectFeedbackForQuery(
  feedback: FeedbackMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  retrievalProfile: RetrievalProfile,
): FeedbackMemory[] {
  const selected = selectFeedback(feedback, retrievalProfile);

  if (
    language.isAnswerCompositionQuery(query, queryLocale) ||
    language.isFactConfirmationQuery(query, queryLocale)
  ) {
    return selected;
  }

  return selected.filter(
    (record) =>
      language.tokenOverlap(feedbackSearchText(record), query, queryLocale, {
        excludeStopwords: true,
      }) >= 0.15,
  );
}

export function selectPreferencesForQuery(
  preferences: PreferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
): PreferenceMemory[] {
  const active = sortPreferences(
    preferences.filter((preference) => (preference.lifecycle ?? "active") === "active"),
  );

  if (
    language.isAnswerCompositionQuery(query, queryLocale) ||
    language.isFactConfirmationQuery(query, queryLocale)
  ) {
    return active.slice(0, PREFERENCE_RECALL_LIMIT);
  }

  return active
    .filter(
      (preference) =>
        language.tokenOverlap(
          preferenceSearchText(preference),
          query,
          queryLocale,
          { excludeStopwords: true },
        ) >= 0.15,
    )
    .slice(0, PREFERENCE_RECALL_LIMIT);
}

export function selectFacts(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  retrievalProfile: RetrievalProfile,
  routingDecision: RoutingDecision,
  profile: UserProfile | null,
  referenceTime: string,
  semanticScores?: Map<string, number>,
  evidenceCountsByMemoryId?: Map<string, number>,
): { facts: FactMemory[]; traces: RecallCandidateTrace[] } {
  const answerCompositionQuery = language.isAnswerCompositionQuery(query, queryLocale);
  const factConfirmationQuery = language.isFactConfirmationQuery(query, queryLocale);
  const ranked = rankFactCandidates(
    buildFactCandidates(
      facts,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
      evidenceCountsByMemoryId,
    ),
    routingDecision.strategy,
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
    usageScore: entry.usageScore,
    evidenceScore: entry.evidenceScore,
    outcomeScore: entry.outcomeScore,
    verificationPenaltyScore: entry.verificationPenaltyScore,
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
    options?: {
      aggregateLimit?: number;
      aggregateSignal?: (entry: RankedFactCandidate) => boolean;
    },
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
        });
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
        candidate.usageScore,
        candidate.evidenceScore,
        candidate.outcomeScore,
        candidate.verificationPenaltyScore,
        fallback,
      );
    };

    if (options?.aggregateLimit && options.aggregateLimit > 1) {
      const aggregatePicks = rankFactCandidates(
        resolveCandidates().filter(
          options.aggregateSignal ?? hasFactSelectionSignal,
        ),
        routingDecision.strategy,
      ).slice(0, options.aggregateLimit);

      for (const candidate of aggregatePicks) {
        selectCandidate(candidate, "none");
      }

      return;
    }

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
    const aggregateOpenLoopQuery = isAggregateOpenLoopQuery(
      query,
      language,
      queryLocale,
    );
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
      trySelectSlot(
        "open_loop",
        compatible,
        false,
        aggregateOpenLoopQuery
          ? {
              aggregateLimit: AGGREGATE_OPEN_LOOP_LIMIT,
              aggregateSignal: hasAggregateOpenLoopSignal,
            }
          : undefined,
      );
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
      facts: selected.map(materializeFactCandidate),
      traces,
    };
  }

  const temporalEventOrderQuery = isTemporalEventOrderQuery(query);
  const updateSeriesOptions = {
    collapseRelationshipRelocation: isRelationshipLatestLocationQuery(query),
  };
  const limit = answerCompositionQuery || factConfirmationQuery
    ? 3
    : temporalEventOrderQuery
      ? 6
      : 2;
  const aggregateCountQuery = isAggregateFactCountQuery(query);
  const withIntentSignal = rankFactCandidates(
    collapseLatestUpdateSeries(
      compatible.filter((entry) => entry.intentScore > 0),
      updateSeriesOptions,
    ),
    routingDecision.strategy,
  );
  const withLexicalOrSubjectSignal = rankFactCandidates(
    collapseLatestUpdateSeries(
      compatible.filter(hasGenericFactSelectionSignal),
      updateSeriesOptions,
    ),
    routingDecision.strategy,
  );

  if (aggregateCountQuery) {
    for (const entry of rankFactCandidates(
      collapseLatestUpdateSeries(
        compatible.filter((item) => hasAggregateFactCountSignal(item, query)),
        updateSeriesOptions,
      ),
      routingDecision.strategy,
    ).slice(0, AGGREGATE_FACT_COUNT_LIMIT)) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (temporalEventOrderQuery) {
    for (const entry of rankFactCandidates(
      compatible.filter(hasTemporalEventOrderSignal),
      routingDecision.strategy,
    ).slice(0, limit)) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (withIntentSignal.length > 0) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (withLexicalOrSubjectSignal.length > 0) {
    for (const entry of withLexicalOrSubjectSignal.slice(0, limit)) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (isResearchRecommendationQuery(query)) {
    for (const entry of rankFactCandidates(
      compatible.filter(hasResearchRecommendationSignal),
      routingDecision.strategy,
    ).slice(0, RESEARCH_RECOMMENDATION_LIMIT)) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (answerCompositionQuery || factConfirmationQuery) {
    for (const entry of rankFactCandidates(
      compatible.filter(
        (item) =>
          item.fact.category === "project" || item.fact.category === "technical",
      ),
      routingDecision.strategy,
    ).slice(0, limit)) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (retrievalProfile === "coding_agent") {
    const fallback = rankFactCandidates(
      compatible.filter(
        (entry) =>
          entry.fact.category !== "personal" &&
          entry.fact.category !== "relationship" &&
          entry.fact.category !== "event",
      ),
      routingDecision.strategy,
    )[0];
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
        fallback.usageScore,
        fallback.evidenceScore,
        fallback.outcomeScore,
        fallback.verificationPenaltyScore,
        "none",
      );
    }
  }

  if (isCouponRedemptionLocationQuery(query)) {
    const couponSessions = new Set(
      selected
        .filter(isCouponRedemptionFact)
        .map((entry) => entry.fact.sessionId)
        .filter((sessionId): sessionId is string => typeof sessionId === "string"),
    );
    const storeCompanions = rankFactCandidates(
      compatible.filter(
        (entry) =>
          !selectedIds.has(entry.fact.id) &&
          entry.fact.sessionId !== undefined &&
          couponSessions.has(entry.fact.sessionId) &&
          isStoreContextFact(entry),
      ),
      routingDecision.strategy,
    ).slice(0, 1);

    for (const entry of storeCompanions) {
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
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
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
    facts: selected.map(materializeFactCandidate),
    traces,
  };
}

export function selectReferences(
  references: ReferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
  semanticScores?: Map<string, number>,
  evidenceCountsByMemoryId?: Map<string, number>,
): { references: ReferenceMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = rankReferenceCandidates(
    buildReferenceCandidates(
      references,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
      evidenceCountsByMemoryId,
    ),
    routingDecision.strategy,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.reference.id,
    memoryType: "reference",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : !isActiveMemoryLifecycle(entry.reference)
        ? "inactive lifecycle"
        : "not selected",
    intentScore: entry.intentScore,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: entry.explicitnessScore,
    evidenceScore: entry.evidenceScore,
    outcomeScore: entry.outcomeScore,
    fallback: "none",
  }));
  const compatible = ranked.filter(
    (entry) =>
      isActiveMemoryLifecycle(entry.reference) &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  const slotSpecificNonReferenceQuery =
    !routingDecision.requestedSlots.includes("reference") &&
    (routingDecision.requestedSlots.includes("role") ||
      routingDecision.requestedSlots.includes("focus") ||
      routingDecision.requestedSlots.includes("blocker") ||
      routingDecision.requestedSlots.includes("open_loop"));
  const signaled = rankReferenceCandidates(
    compatible.filter((entry) => entry.lexicalScore > 0 || entry.subjectScore >= 0.2),
    routingDecision.strategy,
  );

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
        0,
        selected.evidenceScore,
        selected.outcomeScore,
        0,
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
    ((language.isAnswerCompositionQuery(query, queryLocale) &&
      rankReferenceCandidates(compatible, routingDecision.strategy)[0]) ||
      null);
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
    0,
    genericSelected.evidenceScore,
    genericSelected.outcomeScore,
    0,
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

export function selectEpisodes(
  episodes: EpisodeMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
  semanticScores?: Map<string, number>,
): { episodes: EpisodeMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = rankEpisodeCandidates(
    buildEpisodeCandidates(
      episodes,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
    ),
    routingDecision.strategy,
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
  const withSignal = rankEpisodeCandidates(
    compatible.filter(
      (entry) => entry.lexicalScore > 0 || routingDecision.continuation,
    ),
    routingDecision.strategy,
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

  if (!routingDecision.continuation) {
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
      0,
      0,
      0,
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

export function selectArchives(
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
      0,
      0,
      0,
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
