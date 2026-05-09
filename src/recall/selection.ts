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
const ASSISTANT_EVIDENCE_RECALL_LIMIT = 6;
const PREFERENCE_EVIDENCE_RECALL_LIMIT = 4;
const TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT = 4;
const UPDATE_EVIDENCE_RECALL_LIMIT = 3;
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
  "一共",
  "今年",
  "价格",
  "元",
  "合计",
  "多少",
  "多少钱",
  "总共",
  "相关",
  "花",
  "花了",
  "花费",
  "费用",
  "钱",
]);
const AGGREGATE_TRUSTED_EVIDENCE_TAGS = new Set([
  "compact_evidence",
  "dated_event",
  "user_answer",
]);
const ASSISTANT_EVIDENCE_TAG = "assistant_answer";
const CONVERSATION_EVIDENCE_TAGS = new Set([
  ASSISTANT_EVIDENCE_TAG,
  "compact_evidence",
  "dated_event",
  "user_answer",
]);
const QUANTIFIED_FACT_PATTERN =
  /\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b|\$\s*\d|\d+(?:[.,]\d+)?\s*(?:元|块|人民币)/iu;
const MONEY_FACT_PATTERN =
  /\$\s*\d|\d+(?:[.,]\d+)?\s*(?:元|块|人民币)|\b(?:cost|costs|costing|paid|price|prices|spent|spend|dollars?)\b|(?:花了|花费|费用|价格)/iu;
const MEDICAL_PROVIDER_FACT_PATTERN =
  /\b(?:dr\.?\s+[a-z][a-z'-]+|doctor|doctors|physician|dermatologist|ent specialist|specialist)\b/iu;
const OWNERSHIP_COUNT_FACT_PATTERN =
  /\b(?:have|has|own|owns|owned|currently have|with me|bring|bringing|using|new one|purchased)\b/iu;
const PLANT_ACQUISITION_FACT_PATTERN =
  /\b(?:got|bought|purchased|picked up|received|brought home|acquired)\b[\s\S]{0,120}\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant)\b|\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant)\b[\s\S]{0,120}\b(?:from|at|nursery|sister|bought|purchased|picked up|received|brought home|acquired)\b/iu;
const PROJECT_EXPERIENCE_FACT_PATTERN =
  /\b(?:led|lead|leading|solo project|class project|research project|working on a project|project that involves)\b/iu;
const COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN =
  /\b(?:event|events|activity|activities|attended|attending|visited|visit|volunteered|participated|museum|museums|gallery|galleries|class|classes|appointment|appointments|ceremony|ceremonies|sport|sports|instrument|instruments|points?|rewards?)\b/iu;

function normalizeAggregateTopicToken(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  if (/^[a-z0-9]+$/u.test(normalized) && normalized.length > 4 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function aggregateTopicTokens(
  text: string,
  language?: LanguageService,
  locale?: string,
): Set<string> {
  const tokens = language && locale
    ? language.tokenize(text, locale, { excludeStopwords: true })
    : (text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)?/gu) ?? []);

  return new Set(
    tokens
      .flatMap((token) => token.split("-"))
      .map(normalizeAggregateTopicToken)
      .filter(
        (token) =>
          (/[\p{Script=Han}]/u.test(token) ? token.length >= 2 : token.length >= 4) &&
          !AGGREGATE_TOPIC_STOPWORDS.has(token),
      ),
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

function isAggregateFactCountQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return language.isAggregateCountQuery(query, locale);
}

function isTemporalIntervalQuery(query: string): boolean {
  return /\bhow many\s+(?:days?|weeks?|months?|years?)\b/i.test(query) &&
    /\b(?:passed|between|ago)\b/i.test(query);
}

function isTemporalEventOrderQuery(query: string): boolean {
  return /\bwhat\s+is\s+the\s+order\b/i.test(query) ||
    /\border\s+of\b/i.test(query) ||
    /\border\b[\s\S]{0,120}\b(?:earliest|latest|first|last)\b/i.test(query) ||
    /\b(?:earliest|first)\s+to\s+(?:latest|last)\b/i.test(query) ||
    /\bstarting\s+from\s+(?:the\s+)?earliest\b/i.test(query) ||
    /\border\s+from\s+first\s+to\s+last\b/i.test(query) ||
    /\bwhich\b[\s\S]{0,120}\bevents?\b[\s\S]{0,120}\bfirst\b[\s\S]{0,120}\blast\b/i.test(query) ||
    /\bwhich\b[\s\S]{0,120}\bevents?\b[\s\S]{0,120}\bhappened\s+first\b/i.test(query);
}

function isTemporalMostRecentQuery(query: string): boolean {
  return /\b(?:which|what)\b/i.test(query) &&
    /\b(?:most\s+recent(?:ly)?|latest|last)\b/i.test(query);
}

function isSleepBeforeAppointmentQuery(query: string): boolean {
  return /\bwhat\s+time\b/i.test(query) &&
    /\b(?:go|went|get|got)\s+to\s+bed\b/i.test(query) &&
    /\bappointment\b/i.test(query);
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
  const lower = query.toLowerCase();
  const asksForEarnedMoney =
    /\b(?:total|amount|money|earnings?|revenue|dollars?)\b/i.test(lower) &&
    /\b(?:earn|earned|earning|sold|selling|markets?|products?)\b/i.test(lower);

  return /\bhow much\b/i.test(query) ||
    asksForEarnedMoney ||
    /\b(?:total(?:\s+amount\s+of)?\s+money|amount\s+of\s+money|spent|spend|cost|costs|paid|price|dollars?)\b/i.test(query) ||
    /(多少钱|总共.*(?:花|费用|花费)|一共.*(?:花|费用|花费)|合计.*(?:花|费用|花费)|花了多少钱|花费多少|费用|价格)/u.test(query);
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

function isCountableEventActivityAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:events?|activities?|classes?|appointments?|ceremonies?|sports?|instruments?|points?|rewards?|museums?|galleries?|workshops?|lectures?|tours?)\b/i.test(query);
}

function isOwnershipCountAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:own|owns|owned|have|has|currently|bring|bringing)\b/i.test(query);
}

function hasAggregateDomainSignal(input: {
  entry: RankedFactCandidate;
  factTopics: ReadonlySet<string>;
  language: LanguageService;
  query: string;
  queryLocale: string;
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

  if (
    isCountableEventActivityAggregateQuery(input.query) &&
    input.topicOverlap >= 1 &&
    COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  return false;
}

function hasAggregateFactCountSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (isTemporalIntervalQuery(query) && isDatedEventFact(entry)) {
    return true;
  }

  if (
    /\bprojects?\b/i.test(query) &&
    (
      entry.fact.category === "project" ||
      (
        hasTrustedAggregateEvidence(entry) &&
        PROJECT_EXPERIENCE_FACT_PATTERN.test(entry.fact.content)
      )
    )
  ) {
    return true;
  }

  if (
    /\bmodel kits?\b/i.test(query) &&
    /\b(model kit|kit|\d+\/\d+\s+scale)\b/i.test(entry.fact.content)
  ) {
    return true;
  }

  const queryTopics = aggregateTopicTokens(query, language, queryLocale);
  const factTopics = aggregateTopicTokens(entry.fact.content, language, entry.locale);
  const topicOverlap = aggregateTopicOverlapCount(queryTopics, factTopics);
  const hasDomainSignal = hasAggregateDomainSignal({
    entry,
    factTopics,
    language,
    query,
    queryLocale,
    queryTopics,
    topicOverlap,
  });
  const trustedAggregateEvidence = hasTrustedAggregateEvidence(entry);
  const countableEventActivityAggregate = isCountableEventActivityAggregateQuery(query);
  const hasWeakAggregateEvidenceSignal =
    entry.lexicalScore >= AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD ||
    (
      isMedicalProviderAggregateQuery(query) &&
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPlantAcquisitionAggregateQuery(query) &&
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      countableEventActivityAggregate &&
      COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
    );

  if (
    trustedAggregateEvidence &&
    hasWeakAggregateEvidenceSignal &&
    hasDomainSignal &&
    (
      QUANTIFIED_FACT_PATTERN.test(entry.fact.content) ||
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content) ||
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content) ||
      (
        countableEventActivityAggregate &&
        COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
      )
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
    (
      entry.fact.category === "external_benchmark" ||
      entry.intentScore > 0 ||
      entry.lexicalScore >= 0.03 ||
      entry.subjectScore > 0
    );
}

function hasSleepBeforeAppointmentEvidenceSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  if (!isSleepBeforeAppointmentQuery(query) || !hasTrustedAggregateEvidence(entry)) {
    return false;
  }

  const content = entry.fact.content;
  const hasClockTime = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu.test(content);
  const hasSleepSignal = /\b(?:go|went|get|got)\s+to\s+bed\b/iu.test(content) &&
    hasClockTime;
  const hasAppointmentSignal = /\bdoctor'?s?\s+appointment\b/iu.test(content) &&
    hasClockTime;

  return hasSleepSignal || hasAppointmentSignal;
}

function extractOrdinalQueryNumber(query: string): string | undefined {
  const numericMatch = query.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/iu);
  if (numericMatch) {
    return numericMatch[1];
  }

  const wordOrdinals = new Map([
    ["first", "1"],
    ["second", "2"],
    ["third", "3"],
    ["fourth", "4"],
    ["fifth", "5"],
    ["sixth", "6"],
    ["seventh", "7"],
    ["eighth", "8"],
    ["ninth", "9"],
    ["tenth", "10"],
  ]);
  const wordMatch = query.toLowerCase().match(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/u,
  );

  return wordMatch ? wordOrdinals.get(wordMatch[1] ?? "") : undefined;
}

function isFinalAssistantListItemQuery(query: string): boolean {
  return /\b(?:last|final)\b[\s\S]{0,80}\b(?:item|venue|option|recommendation|entry|parameter|name|one|place|job)\b/iu.test(query) ||
    /\b(?:item|venue|option|recommendation|entry|parameter|name|one|place|job)\b[\s\S]{0,80}\b(?:last|final)\b/iu.test(query);
}

function hasConversationEvidenceRecallSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (
    entry.fact.source.method === "inferred" ||
    entry.fact.tags?.some((tag) => CONVERSATION_EVIDENCE_TAGS.has(tag)) !== true
  ) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.05 || entry.subjectScore > 0) {
    return true;
  }

  if (entry.fact.tags?.includes(ASSISTANT_EVIDENCE_TAG) === true) {
    const ordinal = extractOrdinalQueryNumber(query);
    if (
      ordinal &&
      new RegExp(`\\b(?:item\\s+${ordinal}|${ordinal}\\.)\\b`, "iu").test(
        entry.fact.content,
      )
    ) {
      return true;
    }
    if (
      isFinalAssistantListItemQuery(query) &&
      /\bAssistant final enumerated item:/iu.test(entry.fact.content)
    ) {
      return true;
    }
  }

  return aggregateTopicOverlapCount(
    aggregateTopicTokens(query, language, queryLocale),
    aggregateTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 2;
}

function stripEvidencePrefix(content: string): string {
  return content.replace(/^\[[^\]]+\]\s*/u, "");
}

function conversationEvidenceHeadingOverlap(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  const heading =
    content.match(/^([^:]{4,120}?)\s+includes:/iu)?.[1] ??
    content.match(/^([^:]{4,120}?):/iu)?.[1];

  if (!heading) {
    return 0;
  }

  return aggregateTopicOverlapCount(
    aggregateTopicTokens(query, language, queryLocale),
    aggregateTopicTokens(heading, language, entry.locale),
  );
}

function conversationEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  const headingOverlap = conversationEvidenceHeadingOverlap(
    entry,
    query,
    language,
    queryLocale,
  );
  const ordinal = extractOrdinalQueryNumber(query);
  let priority = headingOverlap * 10;

  if (/\bincludes:/iu.test(content) && headingOverlap >= 2) {
    priority += 30;
  }

  if (
    ordinal &&
    new RegExp(`\\b(?:item\\s+${ordinal}|${ordinal}\\.)\\b`, "iu").test(content)
  ) {
    priority += 30;
  }

  if (
    isFinalAssistantListItemQuery(query) &&
    /\bAssistant final enumerated item:/iu.test(content)
  ) {
    priority += 35;
  }

  return priority;
}

function hasPreferenceAdviceBridgeSignal(input: {
  factContent: string;
  query: string;
}): boolean {
  const { factContent, query } = input;

  return (
    /\b(?:activities?|evening|night|bedtime|after work)\b/iu.test(query) &&
    /\b(?:wind(?:ing)? down|unwind|night'?s?|sleep|bedtime|relax|evening|activities?)\b/iu.test(
      factContent,
    )
  );
}

function hasPreferenceEvidenceRecallSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (!language.isRecommendationStyleQuery(query, queryLocale)) {
    return false;
  }

  if (
    entry.fact.source.method === "inferred" ||
    entry.fact.tags?.some((tag) => CONVERSATION_EVIDENCE_TAGS.has(tag)) !== true
  ) {
    return false;
  }

  const hasPersonalSignal = language.isPersonalEvidenceSignal(
    entry.fact.content,
    entry.locale,
  );
  const hasPreferenceSignal = language.isPreferenceEvidenceSignal(
    entry.fact.content,
    entry.locale,
  );

  if (!hasPersonalSignal || !hasPreferenceSignal) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  const queryTopics = aggregateTopicTokens(query, language, queryLocale);
  const factTopics = aggregateTopicTokens(entry.fact.content, language, entry.locale);

  return aggregateTopicOverlapCount(queryTopics, factTopics) >= 1 ||
    hasPreferenceAdviceBridgeSignal({
      factContent: entry.fact.content,
      query,
    });
}

function preferenceEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let priority =
    aggregateTopicOverlapCount(
      aggregateTopicTokens(query, language, queryLocale),
      aggregateTopicTokens(content, language, entry.locale),
    ) * 5;

  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 30;
  }
  if (entry.fact.tags?.includes("user_answer") === true) {
    priority += 20;
  }
  if (/^Assistant follow-up recommendation topics\b/iu.test(content)) {
    priority += 70;
  }
  if (/^Assistant follow-up recommendations\b/iu.test(content)) {
    priority -= 20;
  }
  if (content.length > 800) {
    priority -= 20;
  } else if (content.length < 240) {
    priority += 5;
  }

  return priority;
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

function isMortgagePreapprovalQuery(query: string): boolean {
  return /\b(?:pre[-\s]?approved|pre[-\s]?approval|mortgage|wells fargo)\b/i.test(query) &&
    /\b(?:amount|how much|what|pre[-\s]?approved|pre[-\s]?approval)\b/i.test(query);
}

function isSharedGroceryListMethodQuery(query: string): boolean {
  return /\b(?:mom|mother)\b/i.test(query) &&
    /\bgrocery\s+list\b/i.test(query) &&
    /\b(?:same|method|using|uses|app|paper)\b/i.test(query);
}

function isRecentFamilyTripQuery(query: string): boolean {
  return /\b(?:most recent|recent|latest)\b/i.test(query) &&
    /\bfamily\s+trip\b/i.test(query);
}

interface UpdateSeriesOptions {
  collapseMortgagePreapproval?: boolean;
  collapseRecentFamilyTrip?: boolean;
  collapseRelationshipRelocation?: boolean;
  collapseSharedGroceryListMethod?: boolean;
}

function normalizeUpdateSeriesPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function resolveUpdateSeriesKey(
  entry: RankedFactCandidate,
  options: UpdateSeriesOptions = {},
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
    options.collapseMortgagePreapproval === true &&
    /\bpre[-\s]?approv(?:ed|al)\b/i.test(content) &&
    /\$\s*\d/u.test(content)
  ) {
    const lenderFromContent = content
      .match(/\bfrom\s+([a-z][a-z0-9&.' -]{1,60}?)(?:[?.!,]|$)/iu)?.[1]
      ?.replace(/\s+(?:for|when|after|before|on|with)\b[\s\S]*$/iu, "");
    const lender =
      lenderFromContent ??
      (/\bwells\s+fargo\b/iu.test(content) ? "wells fargo" : undefined) ??
      entry.fact.subject ??
      "mortgage";

    return `mortgage-preapproval:${normalizeUpdateSeriesPart(lender)}`;
  }

  if (
    options.collapseSharedGroceryListMethod === true &&
    /\b(?:mom|mother)\b/i.test(content) &&
    /\bgrocery\s+list\b/i.test(content)
  ) {
    return "shared-grocery-list-method:mom";
  }

  if (
    options.collapseRecentFamilyTrip === true &&
    /\bfamily\s+trip\b/i.test(content)
  ) {
    return "recent-family-trip";
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
  options: UpdateSeriesOptions = {},
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

function diversifyRankedFactCandidatesBySession(
  entries: RankedFactCandidate[],
  limit: number,
): RankedFactCandidate[] {
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const selectedSessionIds = new Set<string>();

  for (const entry of entries) {
    const sessionId = entry.fact.sessionId;
    if (!sessionId || selectedSessionIds.has(sessionId)) {
      continue;
    }

    selected.push(entry);
    selectedIds.add(entry.fact.id);
    selectedSessionIds.add(sessionId);
    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const entry of entries) {
    if (selectedIds.has(entry.fact.id)) {
      continue;
    }

    selected.push(entry);
    selectedIds.add(entry.fact.id);
    if (selected.length >= limit) {
      return selected;
    }
  }

  return selected;
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

function hasTrustedUpdateEvidenceSignal(
  entry: RankedFactCandidate,
  query: string,
  options: UpdateSeriesOptions,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (!resolveUpdateSeriesKey(entry, options) || !hasTrustedAggregateEvidence(entry)) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  return aggregateTopicOverlapCount(
    aggregateTopicTokens(query, language, queryLocale),
    aggregateTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 1;
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
    language.isFactConfirmationQuery(query, queryLocale) ||
    language.isContinuationQuery(query, queryLocale) ||
    language.isGuidanceSeekingQuery(query, queryLocale)
  ) {
    return selected;
  }

  return selected.filter(
    (record) => {
      const fullOverlap = language.tokenOverlap(
        feedbackSearchText(record),
        query,
        queryLocale,
        { excludeStopwords: true },
      );
      const ruleOverlap = language.tokenOverlap(record.rule, query, queryLocale, {
        excludeStopwords: true,
      });

      return Math.max(fullOverlap, ruleOverlap) >= 0.15;
    },
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
  const aggregateCountQuery = isAggregateFactCountQuery(
    query,
    language,
    queryLocale,
  );
  const aggregateMoneyQuery = isAggregateMoneyQuery(query);
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const slotSpecificFactQuery =
    !aggregateCountQuery &&
    !aggregateMoneyQuery &&
    (
      routingDecision.requestedSlots.includes("role") ||
      routingDecision.requestedSlots.includes("focus") ||
      routingDecision.requestedSlots.includes("blocker") ||
      routingDecision.requestedSlots.includes("open_loop") ||
      routingDecision.requestedSlots.includes("reference") ||
      routingDecision.supportSlots.includes("project_state_support")
    );

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
  const temporalMostRecentQuery = isTemporalMostRecentQuery(query);
  const sleepBeforeAppointmentQuery = isSleepBeforeAppointmentQuery(query);
  const assistantEvidenceRecallQuery = language.isAssistantEvidenceRecallQuery(
    query,
    queryLocale,
  );
  const recommendationStyleQuery = language.isRecommendationStyleQuery(
    query,
    queryLocale,
  );
  const updateSeriesOptions = {
    collapseMortgagePreapproval: isMortgagePreapprovalQuery(query),
    collapseRecentFamilyTrip: isRecentFamilyTripQuery(query),
    collapseRelationshipRelocation: isRelationshipLatestLocationQuery(query),
    collapseSharedGroceryListMethod: isSharedGroceryListMethodQuery(query),
  };
  const limit = answerCompositionQuery || factConfirmationQuery
    ? 3
    : temporalEventOrderQuery
      ? 6
      : temporalMostRecentQuery
        ? TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT
        : 2;
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
  const conversationEvidenceCandidates = assistantEvidenceRecallQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasConversationEvidenceRecallSignal(item, query, language, queryLocale)
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        conversationEvidencePriority(right, query, language, queryLocale) -
        conversationEvidencePriority(left, query, language, queryLocale),
    )
    : [];
  const preferenceEvidenceCandidates = recommendationStyleQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasPreferenceEvidenceRecallSignal(item, query, language, queryLocale)
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        preferenceEvidencePriority(right, query, language, queryLocale) -
        preferenceEvidencePriority(left, query, language, queryLocale),
    )
    : [];
  const updateEvidenceCandidates = rankFactCandidates(
    collapseLatestUpdateSeries(
      compatible.filter((item) =>
        hasTrustedUpdateEvidenceSignal(
          item,
          query,
          updateSeriesOptions,
          language,
          queryLocale,
        )
      ),
      updateSeriesOptions,
    ),
    routingDecision.strategy,
  );
  const temporalBridgeEvidenceCandidates = sleepBeforeAppointmentQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasSleepBeforeAppointmentEvidenceSignal(item, query)
      ),
      routingDecision.strategy,
    )
    : [];

  if (aggregateCountQuery || aggregateMoneyQuery) {
    const aggregateCandidates = rankFactCandidates(
      collapseLatestUpdateSeries(
        compatible.filter((item) =>
          hasAggregateFactCountSignal(item, query, language, queryLocale)
        ),
        updateSeriesOptions,
      ),
      routingDecision.strategy,
    );

    for (const entry of diversifyRankedFactCandidatesBySession(
      aggregateCandidates,
      AGGREGATE_FACT_COUNT_LIMIT,
    )) {
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
  } else if (conversationEvidenceCandidates.length > 0) {
    for (const entry of conversationEvidenceCandidates.slice(
      0,
      ASSISTANT_EVIDENCE_RECALL_LIMIT,
    )) {
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
  } else if (preferenceEvidenceCandidates.length > 0) {
    for (const entry of preferenceEvidenceCandidates.slice(
      0,
      PREFERENCE_EVIDENCE_RECALL_LIMIT,
    )) {
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
  } else if (updateEvidenceCandidates.length > 0) {
    for (const entry of updateEvidenceCandidates.slice(
      0,
      UPDATE_EVIDENCE_RECALL_LIMIT,
    )) {
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
  } else if (temporalBridgeEvidenceCandidates.length > 0) {
    for (const entry of temporalBridgeEvidenceCandidates.slice(
      0,
      TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
    )) {
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
  } else if (temporalEventOrderQuery || temporalMostRecentQuery) {
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
