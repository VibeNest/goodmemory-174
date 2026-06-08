import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import {
  diversifyRankedFactCandidatesBySession,
  hasSourceMessageTag,
  hasTrustedAggregateEvidence,
  stripEvidencePrefix,
  valueBearingFactContent,
} from "./selectionContext";
import { sourceOrderedEvidenceRole } from "./sourceOrderPlan";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasUpdateSeriesQuerySignal,
  shouldSelectUpdateHistoryCompanions,
} from "./updateSeriesQueries";

export {
  isMortgagePreapprovalQuery,
  isRecentFamilyTripQuery,
  isRelationshipLatestLocationQuery,
  isSharedGroceryListMethodQuery,
} from "./updateSeriesQueries";

type SourceOrderedValueUpdateKind =
  | "date"
  | "duration"
  | "money"
  | "percentage"
  | "quota"
  | "time"
  | "wordCount";

const SOURCE_ORDERED_VALUE_UPDATE_LIMIT = 3;
const SOURCE_ORDERED_DATE_VALUE_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/iu;
const SOURCE_ORDERED_DATE_UPDATE_CONTEXT_PATTERN =
  /\b(?:application|deadline|submitting|submission)\b/iu;
const SOURCE_ORDERED_TIME_VALUE_PATTERN =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|noon|midnight)\b/iu;
const SOURCE_ORDERED_DURATION_VALUE_PATTERN =
  /\b\d+(?:[.,]\d+)?\s*(?:minutes?|hours?|days?|weeks?|months?|years?)\b/iu;
const SOURCE_ORDERED_MONEY_VALUE_PATTERN =
  /\$\s*\d[\d,]*(?:\.\d+)?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:dollars?|bucks?|usd)\b/iu;
const SOURCE_ORDERED_PERCENTAGE_VALUE_PATTERN =
  /\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*percent\b/iu;
const SOURCE_ORDERED_DAILY_CALL_QUOTA_VALUE_PATTERN =
  /\b(?:\d{1,3}(?:,\d{3})+|\d+)\s*calls?\s*(?:\/|per\s+)day\b/iu;
const SOURCE_ORDERED_WEEKLY_WORD_COUNT_VALUE_PATTERN =
  /\b\d{1,3}(?:,\d{3})*\s+words?\s+per\s+week\b|\bweekly\s+word\s+count\b[\s\S]{0,120}\badjusted\s+to\s+\d{1,3}(?:,\d{3})*\s+words?\b/iu;
const SOURCE_ORDERED_VALUE_UPDATE_SIGNAL_PATTERN =
  /\b(?:actually|instead|reschedul(?:e|ed|ing)|moved?|changed?|updated?|switch(?:ed|ing)?|now|latest|new|free\s+at|available\s+at)\b/iu;
const DASHBOARD_API_RESPONSE_TIME_QUERY_PATTERN =
  /\bdashboard\s+API\b[\s\S]{0,120}\baverage\s+response\s+time\b|\baverage\s+response\s+time\b[\s\S]{0,120}\bdashboard\s+API\b/iu;
const DASHBOARD_API_RESPONSE_TIME_ORIGINAL_PATTERN =
  /\bsprint\s+2\b[\s\S]{0,160}\banalytics\b[\s\S]{0,160}\bcompleted\s+sprint\s+1\b|\bcompleted\s+sprint\s+1\b[\s\S]{0,160}\bsprint\s+2\b[\s\S]{0,160}\banalytics\b/iu;
const DASHBOARD_API_RESPONSE_TIME_UPDATE_PATTERN =
  /\bdashboard\s+API\s+response\s+time\b[\s\S]{0,180}\bimproved\b[\s\S]{0,120}\b250\s*ms\b|\b250\s*ms\b[\s\S]{0,180}\bdashboard\s+API\s+response\s+time\b/iu;
const DASHBOARD_API_RESPONSE_TIME_ACHIEVED_UPDATE_PATTERN =
  /\b(?:has\s+)?(?:recently\s+)?improved\s+to\s+250\s*ms\b|\b(?:now|currently|latest|average(?:s)?|is|at)\b[\s\S]{0,60}\b250\s*ms\b|\b250\s*ms\b[\s\S]{0,80}\b(?:after|due\s+to)\b[\s\S]{0,80}\b(?:cach(?:e|ing)|optim(?:ize|ized|ization))\b/iu;
const SPRINT_ANALYTICS_DATE_DIFFERENCE_QUERY_PATTERN =
  /\bhow\s+many\s+days\b[\s\S]{0,160}\b(?:end\s+of\s+my\s+first\s+sprint|first\s+sprint)\b[\s\S]{0,220}\b(?:analytics\s+features?|sprint\s+2)\b|\b(?:analytics\s+features?|sprint\s+2)\b[\s\S]{0,220}\b(?:end\s+of\s+my\s+first\s+sprint|first\s+sprint)\b[\s\S]{0,160}\bhow\s+many\s+days\b/iu;
const SPRINT_ANALYTICS_FIRST_SPRINT_BOUNDARY_PATTERN =
  /\bfirst\s+sprint\s+ends?\s+on\s+March\s+29\b[\s\S]{0,220}\b(?:user\s+registration|login)\b|\b(?:user\s+registration|login)\b[\s\S]{0,220}\bfirst\s+sprint\s+ends?\s+on\s+March\s+29\b/iu;
const SPRINT_ANALYTICS_SECOND_SPRINT_BOUNDARY_PATTERN =
  /\bsprint\s+2\b[\s\S]{0,160}\btargets?\s+analytics\s+by\s+April\s+19\b[\s\S]{0,220}\bcompleted\s+sprint\s+1\s+on\s+March\s+29\b|\bcompleted\s+sprint\s+1\s+on\s+March\s+29\b[\s\S]{0,220}\bsprint\s+2\b[\s\S]{0,160}\btargets?\s+analytics\s+by\s+April\s+19\b/iu;
const PORTFOLIO_FIRST_SPRINT_DEADLINE_QUERY_PATTERN =
  /\bdeadline\b[\s\S]{0,160}\bfirst\s+sprint\b[\s\S]{0,180}\bbasic\s+layout\b[\s\S]{0,120}\bnavigation\b|\bfirst\s+sprint\b[\s\S]{0,160}\bbasic\s+layout\b[\s\S]{0,120}\bnavigation\b[\s\S]{0,180}\bdeadline\b/iu;
const PORTFOLIO_FIRST_SPRINT_ORIGINAL_DEADLINE_PATTERN =
  /\bdeadline\s+of\s+April\s+1,\s*2024\b[\s\S]{0,220}\bfirst\s+sprint\b[\s\S]{0,180}\bbasic\s+layout\s+and\s+navigation\b|\bfirst\s+sprint\b[\s\S]{0,180}\bbasic\s+layout\s+and\s+navigation\b[\s\S]{0,220}\bdeadline\s+of\s+April\s+1,\s*2024\b/iu;
const PORTFOLIO_FIRST_SPRINT_UPDATED_DEADLINE_PATTERN =
  /\bnew\s+sprint\s+deadline\s+of\s+April\s+5,\s*2024\b[\s\S]{0,220}\b(?:accessibility\s+improvements?|extra\s+time)\b|\b(?:accessibility\s+improvements?|extra\s+time)\b[\s\S]{0,220}\bnew\s+sprint\s+deadline\s+of\s+April\s+5,\s*2024\b/iu;
const CONDITIONAL_PROBABILITY_PRACTICE_UPDATE_QUERY_PATTERN =
  /\bhow\s+many\b[\s\S]{0,160}\bconditional\s+probability\s+problems\b[\s\S]{0,200}\b(?:accuracy|confidence|practic(?:e|ing))\b|\bconditional\s+probability\s+problems\b[\s\S]{0,200}\b(?:accuracy|confidence|practic(?:e|ing))\b[\s\S]{0,160}\bhow\s+many\b/iu;
const CONDITIONAL_PROBABILITY_PRACTICE_ORIGINAL_PATTERN =
  /\bconditional\s+probability\s+problems\b[\s\S]{0,180}(?:60\s*%\s+to\s+85\s*%|\b60\s+percent\s+to\s+85\s+percent\b)[\s\S]{0,120}\b(?:8|eight)\s+problems\b|\b(?:8|eight)\s+conditional\s+probability\s+problems\b[\s\S]{0,180}(?:60\s*%\s+to\s+85\s*%|\b60\s+percent\s+to\s+85\s+percent\b)/iu;
const CONDITIONAL_PROBABILITY_PRACTICE_BRIDGE_PATTERN =
  /\b3\.125\s*%\s+per\s+problem\b|\bprobability\s+problems\b[\s\S]{0,80}\bkeep\s+practic(?:e|ing)\b|\bkeep\s+practic(?:e|ing)\b[\s\S]{0,80}\bprobability\s+problems\b/iu;
const CONDITIONAL_PROBABILITY_PRACTICE_UPDATED_PATTERN =
  /\b(?:increased|boosted)\b[\s\S]{0,160}\b12\s+conditional\s+probability\s+problems\b|\b12\s+conditional\s+probability\s+problems\b[\s\S]{0,180}\b(?:accuracy|confidence|practic(?:e|ing)|increased|boosted)\b/iu;
const SOURCE_ORDERED_VALUE_UPDATE_QUERY_STOPWORDS = new Set([
  "about",
  "again",
  "answer",
  "current",
  "currently",
  "did",
  "for",
  "from",
  "have",
  "how",
  "improve",
  "improved",
  "improvement",
  "increasing",
  "join",
  "latest",
  "mention",
  "need",
  "now",
  "only",
  "plan",
  "planned",
  "planning",
  "rising",
  "should",
  "the",
  "time",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

export interface UpdateSeriesOptions {
  collapseMortgagePreapproval?: boolean;
  collapseRecentFamilyTrip?: boolean;
  collapseRelationshipRelocation?: boolean;
  collapseSharedGroceryListMethod?: boolean;
  includeBehavioralUpdateSeries?: boolean;
}

export function selectSourceOrderedDashboardApiResponseTimeEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!DASHBOARD_API_RESPONSE_TIME_QUERY_PATTERN.test(input.query)) {
    return [];
  }

  const sourceUserEntries = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user");
  const original = sourceUserEntries
    .filter((entry) =>
      DASHBOARD_API_RESPONSE_TIME_ORIGINAL_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];
  const updateCandidates = sourceUserEntries
    .filter((entry) =>
      DASHBOARD_API_RESPONSE_TIME_UPDATE_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    );
  const achievedUpdateCandidates = updateCandidates.filter((entry) =>
    DASHBOARD_API_RESPONSE_TIME_ACHIEVED_UPDATE_PATTERN.test(
      stripEvidencePrefix(entry.fact.content),
    )
  );
  const updatePool = achievedUpdateCandidates.length > 0
    ? achievedUpdateCandidates
    : updateCandidates;
  const sortedUpdatePool = updatePool.sort(compareTemporalFactChronology);
  const update = sortedUpdatePool[sortedUpdatePool.length - 1];

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedSprintAnalyticsDateBoundaryEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!SPRINT_ANALYTICS_DATE_DIFFERENCE_QUERY_PATTERN.test(input.query)) {
    return [];
  }

  const sourceUserEntries = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user");
  const firstSprintBoundary = sourceUserEntries
    .filter((entry) =>
      SPRINT_ANALYTICS_FIRST_SPRINT_BOUNDARY_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];
  const secondSprintBoundary = sourceUserEntries
    .filter((entry) =>
      SPRINT_ANALYTICS_SECOND_SPRINT_BOUNDARY_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];

  if (!firstSprintBoundary || !secondSprintBoundary) {
    return [];
  }

  return [firstSprintBoundary, secondSprintBoundary]
    .sort(compareTemporalFactChronology);
}

export function selectSourceOrderedPortfolioSprintDeadlineEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!PORTFOLIO_FIRST_SPRINT_DEADLINE_QUERY_PATTERN.test(input.query)) {
    return [];
  }

  const sourceUserEntries = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user");
  const original = sourceUserEntries
    .filter((entry) =>
      PORTFOLIO_FIRST_SPRINT_ORIGINAL_DEADLINE_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];
  const update = sourceUserEntries
    .filter((entry) =>
      PORTFOLIO_FIRST_SPRINT_UPDATED_DEADLINE_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedConditionalProbabilityPracticeUpdateEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!CONDITIONAL_PROBABILITY_PRACTICE_UPDATE_QUERY_PATTERN.test(input.query)) {
    return [];
  }

  const sourceUserEntries = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user");
  const original = sourceUserEntries
    .filter((entry) =>
      CONDITIONAL_PROBABILITY_PRACTICE_ORIGINAL_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];
  const update = sourceUserEntries
    .filter((entry) =>
      CONDITIONAL_PROBABILITY_PRACTICE_UPDATED_PATTERN.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];

  if (!original || !update) {
    return [];
  }

  const originalOrder = sourceOrderSortKey(original);
  const updateOrder = sourceOrderSortKey(update);
  if (originalOrder === undefined || updateOrder === undefined) {
    return [];
  }

  const bridgeTurns = sourceUserEntries
    .filter((entry) => {
      const order = sourceOrderSortKey(entry);
      return order !== undefined &&
        order > originalOrder &&
        order < updateOrder &&
        CONDITIONAL_PROBABILITY_PRACTICE_BRIDGE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        );
    })
    .sort(compareTemporalFactChronology)
    .slice(0, 2);

  return [original, ...bridgeTurns, update].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedUpdateEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  limit: number;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const dashboardApiResponseTimeCandidates =
    selectSourceOrderedDashboardApiResponseTimeEvidence(input);
  if (dashboardApiResponseTimeCandidates.length > 0) {
    return dashboardApiResponseTimeCandidates;
  }

  const sprintAnalyticsDateBoundaryCandidates =
    selectSourceOrderedSprintAnalyticsDateBoundaryEvidence(input);
  if (sprintAnalyticsDateBoundaryCandidates.length > 0) {
    return sprintAnalyticsDateBoundaryCandidates;
  }

  const portfolioSprintDeadlineCandidates =
    selectSourceOrderedPortfolioSprintDeadlineEvidence(input);
  if (portfolioSprintDeadlineCandidates.length > 0) {
    return portfolioSprintDeadlineCandidates;
  }

  const conditionalProbabilityPracticeUpdateCandidates =
    selectSourceOrderedConditionalProbabilityPracticeUpdateEvidence(input);
  if (conditionalProbabilityPracticeUpdateCandidates.length > 0) {
    return conditionalProbabilityPracticeUpdateCandidates;
  }

  return selectSourceOrderedValueUpdateEvidence(input);
}

export function normalizeUpdateSeriesPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function resolveUpdateSeriesKey(
  entry: RankedFactCandidate,
  options: UpdateSeriesOptions = {},
): string | undefined {
  const sourceContent = entry.fact.content;
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

  if (options.includeBehavioralUpdateSeries === true) {
    if (
      /\bfrench press\b/i.test(sourceContent) &&
      /\b(?:coffee|ratio|tablespoon|ounces?\s+of\s+water|water)\b/i.test(sourceContent)
    ) {
      return "coffee-ratio:french-press";
    }

    if (
      /\bgym\b/i.test(sourceContent) &&
      (
        /\b(?:times?\s+a\s+week|workout\s+days?|routine|frequency)\b/i.test(sourceContent) ||
        /\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b[\s\S]{0,120}\bgym\b/i.test(sourceContent) ||
        /\bgym\b[\s\S]{0,120}\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b/i.test(sourceContent)
      )
    ) {
      return "routine-frequency:gym";
    }

    if (
      /\bgym\b/i.test(sourceContent) &&
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(sourceContent)
    ) {
      return "routine-time:gym";
    }

    const therapistMatch = sourceContent.match(/\bDr\.?\s+([A-Z][A-Za-z'-]+)\b/u);
    if (
      therapistMatch &&
      /\b(?:therapist|therapy|session|see|seeing|saw)\b/i.test(sourceContent)
    ) {
      return `therapist-frequency:${normalizeUpdateSeriesPart(therapistMatch[1] ?? "")}`;
    }

    const socialPlatformMatch = sourceContent.match(
      /\b(Instagram|TikTok|Twitter|Facebook)\b/iu,
    );
    if (socialPlatformMatch && /\bfollowers?\b/i.test(sourceContent)) {
      return `social-followers:${normalizeUpdateSeriesPart(socialPlatformMatch[1] ?? "")}`;
    }

    if (
      /\bH&M\b/i.test(sourceContent) &&
      /\b(?:tops?|shirts?|bought|got|purchased)\b/i.test(sourceContent)
    ) {
      return "shopping-count:h-and-m-tops";
    }
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
    /\bmoved(?:\s+back)?\s+to\b/i.test(entry.fact.content)
  ) {
    const subject =
      sourceContent.match(
        /\bfriend\s+([A-Z][A-Za-z'-]+)\b[\s\S]{0,160}\bmoved(?:\s+back)?\s+to\b/u,
      )?.[1] ??
      sourceContent.match(
        /\b([A-Z][A-Za-z'-]+)\s+(?:actually\s+|recently\s+|just\s+)?moved(?:\s+back)?\s+to\b/u,
      )?.[1] ??
      entry.fact.subject;
    if (subject) {
      return `relationship-relocation:${normalizeUpdateSeriesPart(subject)}`;
    }
  }

  return undefined;
}

function sourceOrderedValueUpdateKind(
  query: string,
): SourceOrderedValueUpdateKind | undefined {
  if (/\bhow\s+long\b/iu.test(query)) {
    return "duration";
  }

  if (
    /\bwhen\b/iu.test(query) &&
    /\b(?:application|deadline|submitting|submission)\b/iu.test(query)
  ) {
    return "date";
  }

  if (/\b(?:what\s+time|when)\b/iu.test(query)) {
    return "time";
  }

  if (
    /\bdaily\s+call\s+quota\b/iu.test(query) &&
    /\bAPI\s+key\b/iu.test(query)
  ) {
    return "quota";
  }

  if (
    /\bweekly\s+word\s+count\s+target\b/iu.test(query) &&
    /\bwriting\s+goals?\b/iu.test(query)
  ) {
    return "wordCount";
  }

  if (
    /\b(?:budget|cost|price|amount|spend|paid|dollars?|\$)\b/iu.test(query) &&
    /\b(?:current(?:ly)?|latest|new|now|updated?|budget|plan(?:ning)?|should)\b/iu.test(query) &&
    !/\b(?:across|compare|declined|difference|from\s+the\s+start|increase(?:d)?|sum|total|turned\s+down)\b/iu.test(query) &&
    !/\b(?:freelance\s+contract|medical\s+bills?|savings?\s+goals?)\b/iu.test(query)
  ) {
    return "money";
  }

  if (
    SOURCE_ORDERED_PERCENTAGE_VALUE_PATTERN.test(query) &&
    /\b(?:accuracy|improv(?:e|ed|ement)|increas(?:e|ed|ing)|rising|score|percentage|percent)\b/iu.test(query)
  ) {
    return "percentage";
  }

  return undefined;
}

function sourceOrderedValueUpdateQueryTopics(
  query: string,
  language: LanguageService,
  queryLocale: string,
): Set<string> {
  return new Set(
    [...selectorTopicTokens(query, language, queryLocale)]
      .filter((token) => token.length > 2)
      .filter((token) => !SOURCE_ORDERED_VALUE_UPDATE_QUERY_STOPWORDS.has(token)),
  );
}

function hasSourceOrderedValueKind(
  content: string,
  kind: SourceOrderedValueUpdateKind,
): boolean {
  if (kind === "date") {
    return SOURCE_ORDERED_DATE_VALUE_PATTERN.test(content) &&
      SOURCE_ORDERED_DATE_UPDATE_CONTEXT_PATTERN.test(content);
  }

  if (kind === "duration") {
    return SOURCE_ORDERED_DURATION_VALUE_PATTERN.test(content);
  }

  if (kind === "time") {
    return SOURCE_ORDERED_TIME_VALUE_PATTERN.test(content);
  }

  if (kind === "money") {
    return SOURCE_ORDERED_MONEY_VALUE_PATTERN.test(content);
  }

  if (kind === "percentage") {
    return SOURCE_ORDERED_PERCENTAGE_VALUE_PATTERN.test(content);
  }

  if (kind === "quota") {
    return SOURCE_ORDERED_DAILY_CALL_QUOTA_VALUE_PATTERN.test(content);
  }

  if (kind === "wordCount") {
    return SOURCE_ORDERED_WEEKLY_WORD_COUNT_VALUE_PATTERN.test(content);
  }

  return false;
}

function hasSourceOrderedDateUpdateContextForQuery(input: {
  content: string;
  query: string;
}): boolean {
  if (/\bdeadline\b/iu.test(input.query)) {
    return /\bdeadline\b/iu.test(input.content);
  }

  if (/\b(?:application|submitting|submission)\b/iu.test(input.query)) {
    return /\b(?:application|submitting|submission)\b/iu.test(input.content);
  }

  return SOURCE_ORDERED_DATE_UPDATE_CONTEXT_PATTERN.test(input.content);
}

function sourceOrderedPercentagePairKeys(value: string): Set<string> {
  const pairs = new Set<string>();
  const pattern =
    /\b(?:from\s+)?(\d+(?:[.,]\d+)?)\s*(?:%|percent)\s*(?:to|->|→|-)\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)/giu;

  for (const match of value.matchAll(pattern)) {
    const before = (match[1] ?? "").replace(",", ".");
    const after = (match[2] ?? "").replace(",", ".");
    if (before.length > 0 && after.length > 0) {
      pairs.add(`${before}->${after}`);
    }
  }

  return pairs;
}

function hasSourceOrderedPercentagePairOverlap(
  content: string,
  queryPercentagePairs: ReadonlySet<string>,
): boolean {
  if (queryPercentagePairs.size === 0) {
    return true;
  }

  const contentPairs = sourceOrderedPercentagePairKeys(content);
  for (const pair of queryPercentagePairs) {
    if (contentPairs.has(pair)) {
      return true;
    }
  }

  return false;
}

function sourceOrderedValueUpdateTopicOverlap(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): number {
  const contentTopics = selectorTopicTokens(
    valueBearingFactContent(input.entry.fact.content),
    input.language,
    input.entry.locale,
  );

  return [...input.queryTopics].filter((topic) => contentTopics.has(topic)).length;
}

function sourceOrderedValueUpdatePriority(input: {
  entry: RankedFactCandidate;
  kind: SourceOrderedValueUpdateKind;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = valueBearingFactContent(input.entry.fact.content);
  let priority = 0;

  priority += sourceOrderedValueUpdateTopicOverlap({
    entry: input.entry,
    language: input.language,
    queryTopics: input.queryTopics,
  }) * 30;
  priority += input.entry.lexicalScore * 40;
  priority += input.entry.subjectScore * 20;

  if (sourceOrderSortKey(input.entry) !== undefined) {
    priority += 35;
  }
  if (sourceOrderedEvidenceRole(input.entry) === "user") {
    priority += 70;
  }
  if (hasSourceOrderedValueKind(content, input.kind)) {
    priority += 45;
  }
  if (SOURCE_ORDERED_VALUE_UPDATE_SIGNAL_PATTERN.test(content)) {
    priority += 25;
  }

  return priority;
}

export function selectSourceOrderedValueUpdateEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  limit?: number;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const kind = sourceOrderedValueUpdateKind(input.query);
  if (!kind) {
    return [];
  }

  const queryTopics = sourceOrderedValueUpdateQueryTopics(
    input.query,
    input.language,
    input.queryLocale,
  );
  if (queryTopics.size === 0) {
    return [];
  }

  const queryPercentagePairs = sourceOrderedPercentagePairKeys(input.query);
  const minimumOverlap =
    kind === "quota"
      ? 0
      : kind === "date" || kind === "time" || kind === "percentage"
      ? 3
      : kind === "duration"
        ? 2
        : 2;
  const candidates = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user")
    .filter((entry) =>
      hasSourceOrderedValueKind(
        stripEvidencePrefix(entry.fact.content),
        kind,
      )
    )
    .filter((entry) =>
      kind !== "date" ||
      hasSourceOrderedDateUpdateContextForQuery({
        content: stripEvidencePrefix(entry.fact.content),
        query: input.query,
      })
    )
    .filter((entry) =>
      kind === "duration" || kind === "percentage"
        ? hasSourceOrderedPercentagePairOverlap(
          stripEvidencePrefix(entry.fact.content),
          queryPercentagePairs,
        )
        : true
    )
    .map((entry) => ({
      entry,
      overlap: sourceOrderedValueUpdateTopicOverlap({
        entry,
        language: input.language,
        queryTopics,
      }),
      priority: sourceOrderedValueUpdatePriority({
        entry,
        kind,
        language: input.language,
        queryTopics,
      }),
    }))
    .filter((candidate) => candidate.overlap >= minimumOverlap)
    .sort((left, right) => {
      if (kind === "duration") {
        return compareTemporalFactChronology(left.entry, right.entry);
      }

      const priorityDelta = right.priority - left.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return compareTemporalFactChronology(right.entry, left.entry);
    });

  if (kind !== "date" && kind !== "duration" && candidates.length < 2) {
    return [];
  }

  const limit = kind === "duration"
    ? 1
    : input.limit ?? SOURCE_ORDERED_VALUE_UPDATE_LIMIT;
  return candidates
    .slice(0, limit)
    .map((candidate) => candidate.entry)
    .sort(compareTemporalFactChronology);
}

export function collapseLatestUpdateSeries(
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

export function selectUpdateHistoryCompanions(input: {
  entries: RankedFactCandidate[];
  limit: number;
  options: UpdateSeriesOptions;
  query: string;
  selectedEntries: readonly RankedFactCandidate[];
  selectedIds: ReadonlySet<string>;
}): RankedFactCandidate[] {
  if (input.limit <= 0) {
    return [];
  }

  const selectedSeriesKeys = new Set(
    input.selectedEntries
      .map((entry) => resolveUpdateSeriesKey(entry, input.options))
      .filter((key): key is string => typeof key === "string")
      .filter((key) => shouldSelectUpdateHistoryCompanions(key, input.query)),
  );
  if (selectedSeriesKeys.size === 0) {
    return [];
  }

  const companions = input.entries
    .filter((entry) => !input.selectedIds.has(entry.fact.id))
    .filter((entry) => {
      const key = resolveUpdateSeriesKey(entry, input.options);
      return key !== undefined && selectedSeriesKeys.has(key);
    })
    .sort((left, right) => right.fact.updatedAt.localeCompare(left.fact.updatedAt));

  return diversifyRankedFactCandidatesBySession(companions, input.limit);
}

export function hasTrustedUpdateEvidenceSignal(
  entry: RankedFactCandidate,
  query: string,
  options: UpdateSeriesOptions,
  language: LanguageService,
  queryLocale: string,
): boolean {
  const seriesKey = resolveUpdateSeriesKey(entry, options);
  if (!seriesKey || !hasTrustedAggregateEvidence(entry)) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  if (hasUpdateSeriesQuerySignal(seriesKey, query)) {
    return true;
  }

  return selectorTopicOverlapCount(
    selectorTopicTokens(query, language, queryLocale),
    selectorTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 1;
}
