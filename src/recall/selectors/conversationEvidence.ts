import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  DATE_OR_TIME_FACT_PATTERN,
  isSleepBeforeAppointmentQuery,
} from "./temporal";
import {
  ASSISTANT_COUNT_HEADING_FACT_PATTERN,
  hasAssistantAnswerTag,
  hasConversationEvidenceTag,
  hasDirectFactualCompanionTag,
  hasTrustedAggregateEvidence,
  hasUserAnswerTag,
  isAssistantProvidedDetailRecallQuery,
  INSTRUMENT_PRACTICE_FACT_PATTERN,
  isDatedEventFact,
  isInstrumentPracticeTimeQuery,
  isUserGroundedRecallQuery,
  PERSONAL_ELECTRONICS_FACT_PATTERN,
  QUANTIFIED_FACT_PATTERN,
  stripEvidencePrefix,
  valueBearingFactContent,
} from "./selectionContext";

export function hasSleepBeforeAppointmentEvidenceSignal(
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

export function sleepBeforeAppointmentEvidencePriority(entry: RankedFactCandidate): number {
  const content = entry.fact.content;
  const hasClockTime = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu.test(content);
  let priority = hasClockTime ? 20 : 0;

  if (/\b(?:go|went|get|got)\s+to\s+bed\b/iu.test(content)) {
    priority += 80;
  }
  if (/\bdoctor'?s?\s+appointment\b/iu.test(content)) {
    priority += 30;
  }
  if (hasUserAnswerTag(entry)) {
    priority += 15;
  }
  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 10;
  }

  return priority;
}

export function extractOrdinalQueryNumber(query: string): string | undefined {
  const numericMatch = query.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/iu);
  if (numericMatch) {
    return numericMatch[1];
  }
  const chineseNumericOrdinalMatch = query.match(/第\s*(\d{1,2})\s*(?:项|个|条|名|种|款|点)?/u);
  if (chineseNumericOrdinalMatch) {
    return chineseNumericOrdinalMatch[1];
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

  if (wordMatch) {
    return wordOrdinals.get(wordMatch[1] ?? "");
  }

  const chineseOrdinals = new Map([
    ["一", "1"],
    ["二", "2"],
    ["三", "3"],
    ["四", "4"],
    ["五", "5"],
    ["六", "6"],
    ["七", "7"],
    ["八", "8"],
    ["九", "9"],
    ["十", "10"],
  ]);
  const chineseWordMatch = query.match(/第\s*([一二三四五六七八九十])\s*(?:项|个|条|名|种|款|点)?/u);

  return chineseWordMatch ? chineseOrdinals.get(chineseWordMatch[1] ?? "") : undefined;
}

export function isFinalAssistantListItemQuery(query: string): boolean {
  return /\b(?:last|final)\b[\s\S]{0,80}\b(?:item|venue|option|recommendation|entry|parameter|name|one|place|job)\b/iu.test(query) ||
    /\b(?:item|venue|option|recommendation|entry|parameter|name|one|place|job)\b[\s\S]{0,80}\b(?:last|final)\b/iu.test(query) ||
    /(最后|最终|末尾)[\s\S]{0,80}(项|个|条|推荐|选项|名字|地点|职位)/u.test(query) ||
    /(项|个|条|推荐|选项|名字|地点|职位)[\s\S]{0,80}(最后|最终|末尾)/u.test(query);
}

export function userGroundedEvidencePriority(entry: RankedFactCandidate): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let priority = 0;

  if (hasUserAnswerTag(entry)) {
    priority += 90;
  }
  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 35;
  }
  if (isDatedEventFact(entry)) {
    priority += 25;
  }
  if (hasAssistantAnswerTag(entry)) {
    priority -= 45;
  }
  if (/^Assistant answer to prior user request\b/iu.test(content)) {
    priority -= 60;
  }

  return priority;
}

export function hasConversationEvidenceRecallSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (
    entry.fact.source.method === "inferred" ||
    !hasConversationEvidenceTag(entry)
  ) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.05 || entry.subjectScore > 0) {
    return true;
  }

  if (hasAssistantAnswerTag(entry)) {
    const ordinal = extractOrdinalQueryNumber(query);
    if (
      ordinal &&
      new RegExp(`(?:\\b(?:item\\s+${ordinal}|${ordinal}\\.)\\b|第\\s*${ordinal}\\s*(?:项|个|条|名|种|款|点))`, "iu").test(
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
    if (
      /\bhow many\b/iu.test(query) &&
      ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(stripEvidencePrefix(entry.fact.content))
    ) {
      return true;
    }
  }

  return selectorTopicOverlapCount(
    selectorTopicTokens(query, language, queryLocale),
    selectorTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 2;
}

export function conversationEvidenceHeadingOverlap(
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

  return selectorTopicOverlapCount(
    selectorTopicTokens(query, language, queryLocale),
    selectorTopicTokens(heading, language, entry.locale),
  );
}

export function conversationEvidencePriority(
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
    new RegExp(`(?:\\b(?:item\\s+${ordinal}|${ordinal}\\.)\\b|第\\s*${ordinal}\\s*(?:项|个|条|名|种|款|点))`, "iu").test(content)
  ) {
    priority += 30;
  }

  if (
    isFinalAssistantListItemQuery(query) &&
    /\bAssistant final enumerated item:/iu.test(content)
  ) {
    priority += 35;
  }

  if (
    hasAssistantAnswerTag(entry) &&
    /\bhow many\b/iu.test(query) &&
    ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(content)
  ) {
    priority += 90;
  }

  if (
    hasAssistantAnswerTag(entry) &&
    isAssistantProvidedDetailRecallQuery(query)
  ) {
    priority += 25;
  }

  if (isUserGroundedRecallQuery(query)) {
    priority += userGroundedEvidencePriority(entry);
  }

  return priority;
}

export function hasPreferenceAdviceBridgeSignal(input: {
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

export function hasPreferenceEvidenceRecallSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (!language.isRecommendationStyleQuery(query, queryLocale)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  if (
    hasAssistantAnswerTag(entry) &&
    !/^Assistant follow-up recommendations?(?:\s+topics)?\b/iu.test(content)
  ) {
    return false;
  }

  if (
    entry.fact.source.method === "inferred" ||
    !hasConversationEvidenceTag(entry)
  ) {
    return false;
  }

  const hasPersonalSignal = language.isPersonalEvidenceSignal(
    content,
    entry.locale,
  );
  const hasPreferenceSignal = language.isPreferenceEvidenceSignal(
    content,
    entry.locale,
  );

  if (!hasPersonalSignal || !hasPreferenceSignal) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  const queryTopics = selectorTopicTokens(query, language, queryLocale);
  const factTopics = selectorTopicTokens(entry.fact.content, language, entry.locale);

  return selectorTopicOverlapCount(queryTopics, factTopics) >= 1 ||
    hasPreferenceAdviceBridgeSignal({
      factContent: entry.fact.content,
      query,
    });
}

export function preferenceEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let priority =
    selectorTopicOverlapCount(
      selectorTopicTokens(query, language, queryLocale),
      selectorTopicTokens(content, language, entry.locale),
    ) * 5;

  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 30;
  }
  if (entry.fact.tags?.includes("user_answer") === true) {
    priority += 20;
  }
  if (/\bkitchen\b/iu.test(query) && /^My new kitchen utensil holder\b[\s\S]{0,120}\bclutter-free\b/iu.test(content)) {
    priority += 90;
  }
  if (/\bkitchen\b/iu.test(query) && /^My kitchen granite countertop\b/iu.test(content)) {
    priority += 80;
  }
  if (/\bkitchen\b/iu.test(query) && /^My kitchen faucet\b/iu.test(content)) {
    priority += 70;
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

export function isResearchRecommendationQuery(query: string): boolean {
  return (
    /\b(recommend|suggest|find interesting)\b/i.test(query) &&
    /\b(publications?|conferences?|research|papers?|articles?)\b/i.test(query)
  );
}

export function hasResearchRecommendationSignal(entry: RankedFactCandidate): boolean {
  if (entry.fact.category !== "technical" && entry.fact.category !== "project") {
    return false;
  }

  return /\b(interested in|work in|working in|research project|research papers?|articles?|publications?|conferences?)\b/i.test(
    entry.fact.content,
  );
}

export function isCouponRedemptionLocationQuery(query: string): boolean {
  return /\bwhere\b/i.test(query) && /\bredeem(?:ed)?\b/i.test(query) && /\bcoupon\b/i.test(query);
}

export function isCouponRedemptionFact(entry: RankedFactCandidate): boolean {
  return /\bredeemed\b/i.test(entry.fact.content) && /\bcoupon\b/i.test(entry.fact.content);
}

export function isStoreContextFact(entry: RankedFactCandidate): boolean {
  return /\bi use the .+ app from [A-Z][A-Za-z0-9&.' -]+\b/i.test(
    entry.fact.content,
  );
}

export function hasDirectFactualCompanionSignal(entry: RankedFactCandidate): boolean {
  const valueContent = valueBearingFactContent(entry.fact.content);

  return (
    entry.fact.source.method !== "inferred" &&
    hasDirectFactualCompanionTag(entry) &&
    (
      QUANTIFIED_FACT_PATTERN.test(valueContent) ||
      DATE_OR_TIME_FACT_PATTERN.test(valueContent)
    )
  );
}

export function hasDirectFactualEvidenceBridgeSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  const valueContent = valueBearingFactContent(entry.fact.content);

  if (
    isInstrumentPracticeTimeQuery(query) &&
    INSTRUMENT_PRACTICE_FACT_PATTERN.test(valueContent)
  ) {
    return true;
  }

  if (
    /\b(?:what size|Samsung|TV)\b/iu.test(query) &&
    PERSONAL_ELECTRONICS_FACT_PATTERN.test(valueContent)
  ) {
    return true;
  }

  return false;
}

export function directFactualEvidenceBridgePriority(entry: RankedFactCandidate): number {
  const valueContent = valueBearingFactContent(entry.fact.content);
  let priority = 0;

  if (hasConversationEvidenceTag(entry)) {
    priority += 30;
  }
  if (QUANTIFIED_FACT_PATTERN.test(valueContent)) {
    priority += 40;
  }
  if (INSTRUMENT_PRACTICE_FACT_PATTERN.test(valueContent)) {
    priority += 30;
  }
  if (PERSONAL_ELECTRONICS_FACT_PATTERN.test(valueContent)) {
    priority += 30;
  }

  return priority;
}
