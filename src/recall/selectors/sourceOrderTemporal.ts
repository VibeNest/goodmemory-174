import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
  valueBearingFactContent,
} from "./selectionContext";
import { requestedSourceOrderItemCount } from "./sourceOrderCount";
import { isSourceOrderedSummaryCandidate } from "./sourceOrderSummary";
import {
  compareTemporalFactChronology,
  hasPersonalWorkChallengeEventSignal,
  hasTemporalEventOrderSignal,
  isPersonalWorkChallengeEventOrderQuery,
  isSourceOrderedFact,
  isUserBroughtUpEventOrderQuery,
  PERSONAL_LIFE_CONTEXT_PATTERN,
  PERSONAL_WORK_CHALLENGE_RESPONSE_PATTERN,
  PERSONAL_WORK_CHALLENGE_STATE_PATTERN,
  PERSONAL_WORK_CONTEXT_PATTERN,
  sourceOrderSortKey,
  temporalOrderEvidencePriority,
} from "./temporal";
import {
  CHINESE_SOURCE_ORDER_ASPECT_ALIASES,
  hasCollaborativeMilestoneSignal,
  hasNegatedAbsenceSignal,
  isSourceOrderedBroadAspectEventOrderQuery,
  professionalProfileAspectPriorityBonus,
  SOURCE_ORDER_ASPECT_CUE_PATTERN,
  SOURCE_ORDER_ASPECT_TOPIC_TOKENS,
  SOURCE_ORDER_EVENT_MILESTONE_ACTION_PATTERN,
  SOURCE_ORDER_EVENT_MILESTONE_ACTION_ZH_PATTERN,
  SOURCE_ORDER_FRAMEWORK_ASPECT_ALIASES,
} from "./sourceOrderTemporalSignals";
import {
  dedupeSourceOrderedEvidenceByOrder,
  selectSourceOrderedEvidencePlan,
} from "./sourceOrderPlan";
import {
  isAssistantInclusiveSourceOrderedEventOrderPlanQuery,
  isPackedSourceOrderedEventOrderPlanQuery,
  selectCompleteSourceOrderedEventOrderAnchors,
} from "./sourceOrderEventPlans";
import {
  isSourceOrderFrameworkCustomizationQuery,
  sourceOrderFrameworkCustomizationPriorityBonus,
} from "./sourceOrderFrameworkCustomization";

export const SOURCE_ORDER_EVENT_RECALL_LIMIT = 10;
export const SOURCE_ORDER_GAP_FILL_LIMIT = 5;
export const SOURCE_ORDER_COMPANION_LIMIT = 6;
export const SOURCE_ORDER_COMPANION_MAX_DISTANCE = 2;
export const SOURCE_ORDER_MILESTONE_FILL_LIMIT = 6;
export const SOURCE_ORDER_BROAD_ASPECT_DEFAULT_LIMIT = 10;
export const SOURCE_ORDER_BROAD_ASPECT_PRIORITY_THRESHOLD = 180;
export const SOURCE_ORDER_EVENT_PLAN_PRIORITY_THRESHOLD = 150;

export const SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_RECALL_LIMIT = 14;
export const SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_ANCHOR_LIMIT = 8;
export const SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_COMPANION_DISTANCE = 2;

export function sourceOrderedBroadAspectPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const queryTopics = selectorTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let priority =
    selectorTopicOverlapCount(queryTopics, factTopics) * 25 +
    input.entry.lexicalScore * 30 +
    temporalOrderEvidencePriority(input.entry, input.query);

  if (SOURCE_ORDER_ASPECT_CUE_PATTERN.test(content)) {
    priority += 80;
  }
  if (hasCollaborativeMilestoneSignal(content)) {
    priority += 150;
  }
  if (/^(?:\[[^\]]+\]\s*)?I(?:'m| am| have| had| was| will| just)?\b/iu.test(content)) {
    priority += 25;
  }
  if (hasNegatedAbsenceSignal(content)) {
    priority -= 120;
  }
  priority += professionalProfileAspectPriorityBonus(content);
  if (hasAssistantAnswerTag(input.entry)) {
    priority -= 200;
  }

  return priority;
}

export function sourceOrderGapCandidatePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  const queryTopics = selectorTopicTokens(query, language, queryLocale);
  const factTopics = selectorTopicTokens(content, language, entry.locale);
  let priority =
    selectorTopicOverlapCount(queryTopics, factTopics) * 12 +
    entry.lexicalScore * 100 +
    temporalOrderEvidencePriority(entry, query);

  if (SOURCE_ORDER_ASPECT_CUE_PATTERN.test(content)) {
    priority += 45;
  }
  if (hasUserAnswerTag(entry)) {
    priority += 20;
  }
  if (hasAssistantAnswerTag(entry)) {
    priority -= 30;
  }

  return priority;
}

export function sourceOrderAspectTopics(
  entry: RankedFactCandidate,
  language: LanguageService,
): Set<string> {
  const content = stripEvidencePrefix(entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    language,
    entry.locale,
  );
  const topics = new Set(
    [...factTopics].filter((topic) => SOURCE_ORDER_ASPECT_TOPIC_TOKENS.has(topic)),
  );

  if (/\bsql\s+injection\b/iu.test(content)) {
    topics.add("sql_injection");
  }
  if (/\b(?:GET|POST|PUT|DELETE)\s+\/[\w/{}/-]+\b/u.test(content)) {
    topics.add("http_endpoint");
  }
  if (/\bxss\b/iu.test(content)) {
    topics.add("xss");
  }
  for (const alias of CHINESE_SOURCE_ORDER_ASPECT_ALIASES) {
    if (alias.pattern.test(content)) {
      for (const topic of alias.topics) {
        topics.add(topic);
      }
    }
  }
  for (const alias of SOURCE_ORDER_FRAMEWORK_ASPECT_ALIASES) {
    if (alias.pattern.test(content)) {
      for (const topic of alias.topics) {
        topics.add(topic);
      }
    }
  }

  return topics;
}

function hasSourceOrderedEventMilestoneAction(content: string): boolean {
  return SOURCE_ORDER_EVENT_MILESTONE_ACTION_PATTERN.test(content) ||
    SOURCE_ORDER_EVENT_MILESTONE_ACTION_ZH_PATTERN.test(content);
}

function sourceOrderQueryAspectTopics(
  query: string,
  language: LanguageService,
  queryLocale: string,
): Set<string> {
  const topics = selectorTopicTokens(query, language, queryLocale);
  for (const alias of CHINESE_SOURCE_ORDER_ASPECT_ALIASES) {
    if (alias.pattern.test(query)) {
      for (const topic of alias.topics) {
        topics.add(topic);
      }
    }
  }
  for (const alias of SOURCE_ORDER_FRAMEWORK_ASPECT_ALIASES) {
    if (alias.pattern.test(query)) {
      for (const topic of alias.topics) {
        topics.add(topic);
      }
    }
  }
  if (/\bcustomi[sz](?:e|ed|ing|ation)\b/iu.test(query)) {
    topics.add("styling");
  }
  if (/\bintegrat(?:e|ed|ing|ion)\b/iu.test(query)) {
    topics.add("integration");
  }
  for (const topic of SOURCE_ORDER_ASPECT_TOPIC_TOKENS) {
    if (new RegExp(`\\b${topic.replace(/_/gu, "[\\s_-]?")}\\b`, "iu").test(query)) {
      topics.add(topic);
    }
  }

  return topics;
}

function sourceOrderEventNamedTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b/gu)) {
    const token = match[0].toLowerCase();
    if (
      token.length > 2 &&
      ![
        "assistant",
        "beam",
        "can",
        "here",
        "how",
        "items",
        "mention",
        "only",
        "the",
        "user",
        "what",
        "when",
      ].includes(token)
    ) {
      tokens.add(token);
    }
  }

  return tokens;
}

export function isSourceOrderedNamedEntityEventOrderQuery(query: string): boolean {
  return isUserBroughtUpEventOrderQuery(query) &&
    sourceOrderEventNamedTokens(query).size > 0;
}

function sourceOrderEventSlotSignature(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryNamedTokens: ReadonlySet<string>;
  queryTopics: ReadonlySet<string>;
}): Set<string> {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const signature = sourceOrderAspectTopics(input.entry, input.language);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  for (const topic of factTopics) {
    if (input.queryTopics.has(topic)) {
      signature.add(topic);
    }
  }
  for (const token of sourceOrderEventNamedTokens(content)) {
    if (input.queryNamedTokens.has(token)) {
      signature.add(`name:${token}`);
    }
  }
  const namedSignatureCount = [...signature].filter((topic) =>
    topic.startsWith("name:")
  ).length;
  const nonNameSignatureTopics = [...signature].filter(
    (topic) => !topic.startsWith("name:"),
  );
  if (
    namedSignatureCount > 0 &&
    (
      namedSignatureCount === signature.size ||
      nonNameSignatureTopics.every((topic) => input.queryNamedTokens.has(topic))
    )
  ) {
    const order = sourceOrderSortKey(input.entry);
    if (order !== undefined) {
      signature.add(`source:${order}`);
    }
  }

  return signature;
}

function sourceOrderEventPlanPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryNamedTokens: ReadonlySet<string>;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);
  const aspectOverlap = [...sourceOrderAspectTopics(input.entry, input.language)]
    .filter((topic) => input.queryTopics.has(topic)).length;
  const namedOverlap = [...sourceOrderEventNamedTokens(content)]
    .filter((token) => input.queryNamedTokens.has(token)).length;
  let priority =
    topicOverlap * 90 +
    aspectOverlap * 170 +
    namedOverlap * 180 +
    input.entry.lexicalScore * 80 +
    input.entry.subjectScore * 70 +
    input.entry.intentScore * 50 +
    temporalOrderEvidencePriority(input.entry, input.query);

  if (hasTemporalEventOrderSignal(input.entry, input.query)) {
    priority += 140;
  }
  if (isSourceOrderFrameworkCustomizationQuery(input.query)) {
    priority += sourceOrderFrameworkCustomizationPriorityBonus(content);
  }
  if (hasSourceOrderedEventMilestoneAction(content)) {
    priority += 80;
  }
  if (hasUserAnswerTag(input.entry)) {
    priority += 70;
  }
  if (hasAssistantAnswerTag(input.entry)) {
    priority -= 70;
  }
  if (
    namedOverlap > 0 &&
    /\b(?:collaborat(?:e|ed|ing|ion)?|joint|prioriti[sz]ed|reveal(?:ed|ing)?|review(?:ed|ing)?|with)\b/iu.test(
      content,
    ) &&
    /\b(?:\d+%|\d+\s+(?:attendees|key\s+scenes|pages|writers)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2})\b/iu.test(
      content,
    )
  ) {
    priority += 320;
  }
  if (
    namedOverlap > 0 &&
    /\b(?:Q&A\s+session|exclusive\s+content|guide\s+to\s+editing\s+techniques|giveaway)\b/iu.test(
      content,
    )
  ) {
    priority += 360;
  }
  if (/^(?:\[[^\]]+\]\s*)?(?:thanks?|sounds good|great|okay|ok)\b/iu.test(content)) {
    priority -= 220;
  }
  if (
    content.length > 1800 ||
    /\b(?:generic checklist|general overview|best practices)\b/iu.test(content)
  ) {
    priority -= 120;
  }
  if (
    /\b(?:already\s+(?:finali[sz]ed|hosted)|attended\s+by\s+\d+|feedback\s+score|upcoming\s+peer\s+review)\b/iu.test(
      content,
    )
  ) {
    priority -= 620;
  }
  if (
    namedOverlap > 0 &&
    /\b(?:ready\s+to\s+start\s+the\s+revision\s+process|tracked\s+\d+%\s+completion|query\s+letter\s+submissions?|final\s+draft|weekly\s+\d[\d,]*-word\s+targets|template)\b/iu.test(
      content,
    )
  ) {
    priority -= 340;
  }

  return priority;
}

export function selectSourceOrderedEventOrderEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isUserBroughtUpEventOrderQuery(input.query)) {
    return [];
  }

  const requestedCount = requestedSourceOrderItemCount(input.query);
  if (requestedCount === undefined) {
    return [];
  }

  const queryTopics = sourceOrderQueryAspectTopics(
    input.query,
    input.language,
    input.queryLocale,
  );
  const queryNamedTokens = sourceOrderEventNamedTokens(input.query);
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderEventPlanPriority({
      entry,
      language: input.language,
      query: input.query,
      queryLocale: input.queryLocale,
      queryNamedTokens,
      queryTopics,
    });
  const anchorLimit = Math.min(requestedCount, SOURCE_ORDER_EVENT_RECALL_LIMIT);
  const sourceUserEntries = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .filter(hasUserAnswerTag);
  const sourceEventPlanEntries = isAssistantInclusiveSourceOrderedEventOrderPlanQuery(
    input.query,
  )
    ? input.entries.filter(isSourceOrderedSummaryCandidate)
    : sourceUserEntries;
  const completeEventOrderAnchors = selectCompleteSourceOrderedEventOrderAnchors({
    count: anchorLimit,
    entries: sourceEventPlanEntries,
    priority,
    query: input.query,
  });
  if (
    completeEventOrderAnchors.length >= anchorLimit ||
    (
      isPackedSourceOrderedEventOrderPlanQuery(input.query) &&
      completeEventOrderAnchors.length > 0
    )
  ) {
    return completeEventOrderAnchors;
  }

  const eligibleSourceEntries = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .filter((entry) => priority(entry) >= SOURCE_ORDER_EVENT_PLAN_PRIORITY_THRESHOLD);
  const broadSourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: eligibleSourceEntries,
    priority,
  });
  const namedSourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: input.entries.filter(isSourceOrderedSummaryCandidate).filter((entry) =>
      [...sourceOrderEventNamedTokens(stripEvidencePrefix(entry.fact.content))]
        .some((token) => queryNamedTokens.has(token))
    ),
    priority,
  });
  const namedUserSourceCandidates = namedSourceCandidates.filter(hasUserAnswerTag);
  const sourceCandidates =
    queryNamedTokens.size > 0 &&
      namedUserSourceCandidates.length >=
        Math.min(requestedCount, SOURCE_ORDER_EVENT_RECALL_LIMIT)
      ? namedUserSourceCandidates
      : queryNamedTokens.size > 0 &&
          namedSourceCandidates.length >=
            Math.min(requestedCount, SOURCE_ORDER_EVENT_RECALL_LIMIT)
        ? namedSourceCandidates
      : broadSourceCandidates;
  const anchors = sourceCandidates.filter((entry) => {
    const signature = sourceOrderEventSlotSignature({
      entry,
      language: input.language,
      queryNamedTokens,
      queryTopics,
    });
    return signature.size > 0 || hasTemporalEventOrderSignal(entry, input.query);
  });
  if (anchors.length === 0) {
    return [];
  }

  const plannedAnchors = queryNamedTokens.size > 0
    ? [...anchors].sort((left, right) => {
      const priorityDelta = priority(right) - priority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    }).slice(0, anchorLimit).sort(compareTemporalFactChronology)
    : selectSourceOrderedEventCoverage({
      count: anchorLimit,
      entries: anchors,
      priority,
    });

  return selectSourceOrderedEvidencePlan({
    anchorLimit,
    anchors: plannedAnchors,
    companionsPerAnchor: 0,
    limit: anchorLimit,
    priority,
    slotSignature: (entry) =>
      sourceOrderEventSlotSignature({
        entry,
        language: input.language,
        queryNamedTokens,
        queryTopics,
      }),
  });
}

function selectSourceOrderedEventCoverage(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const sortedEntries = [...input.entries].sort(compareTemporalFactChronology);
  if (sortedEntries.length <= input.count) {
    return sortedEntries;
  }

  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < input.count) {
      selected.set(entry.fact.id, entry);
    }
  };

  for (let index = 0; index < input.count; index += 1) {
    const start = Math.floor(index * sortedEntries.length / input.count);
    const end = Math.floor((index + 1) * sortedEntries.length / input.count);
    const bucket = sortedEntries.slice(start, Math.max(start + 1, end));
    const best = [...bucket].sort((left, right) => {
      const priorityDelta = input.priority(right) - input.priority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })[0];
    if (best) {
      addCandidate(best);
    }
  }

  for (const entry of [...sortedEntries].sort((left, right) => {
    const priorityDelta = input.priority(right) - input.priority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return compareTemporalFactChronology(left, right);
  })) {
    if (selected.size >= input.count) {
      break;
    }
    addCandidate(entry);
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedBroadAspectEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedBroadAspectEventOrderQuery(input.query)) {
    return [];
  }

  const queryTopics = selectorTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const candidates = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .filter(hasUserAnswerTag)
    .map((entry) => {
      const order = sourceOrderSortKey(entry);
      if (order === undefined) {
        return null;
      }

      const content = stripEvidencePrefix(entry.fact.content);
      const factTopics = selectorTopicTokens(content, input.language, entry.locale);
      const topicOverlap = selectorTopicOverlapCount(queryTopics, factTopics);
      const collaborative = hasCollaborativeMilestoneSignal(content);
      const profilePriority = professionalProfileAspectPriorityBonus(content);
      const priority = sourceOrderedBroadAspectPriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
      });
      if (
        topicOverlap === 0 &&
        !SOURCE_ORDER_ASPECT_CUE_PATTERN.test(content) &&
        !collaborative
      ) {
        return null;
      }

      return {
        collaborative,
        entry,
        order,
        profilePriority,
        priority,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        collaborative: boolean;
        entry: RankedFactCandidate;
        order: number;
        profilePriority: number;
        priority: number;
      } => candidate !== null,
    )
    .sort((left, right) => left.order - right.order);
  if (candidates.length === 0) {
    return [];
  }

  const requestedCount = requestedSourceOrderItemCount(input.query) ??
    SOURCE_ORDER_BROAD_ASPECT_DEFAULT_LIMIT;
  const requiredCount = Math.min(requestedCount, candidates.length);
  const collaborativePool = candidates.filter((candidate) => candidate.collaborative);
  const professionalProfilePool = candidates.filter(
    (candidate) => candidate.profilePriority > 0,
  );
  const highPriorityPool = candidates.filter(
    (candidate) =>
      candidate.priority >= SOURCE_ORDER_BROAD_ASPECT_PRIORITY_THRESHOLD,
  );
  if (professionalProfilePool.length >= requiredCount) {
    return professionalProfilePool
      .sort((left, right) => {
        const priorityDelta = right.priority - left.priority;
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return left.order - right.order;
      })
      .slice(0, requestedCount)
      .map((candidate) => candidate.entry)
      .sort(compareTemporalFactChronology);
  }

  const candidatePool = collaborativePool.length >= requiredCount
    ? collaborativePool
    : highPriorityPool.length >= requiredCount
      ? highPriorityPool
      : candidates;
  const selectionCount = Math.min(requestedCount, candidatePool.length);
  const selected = new Map<number, RankedFactCandidate>();

  for (let index = 0; index < selectionCount; index += 1) {
    const start = Math.floor(index * candidatePool.length / selectionCount);
    const end = Math.floor((index + 1) * candidatePool.length / selectionCount);
    const bucket = candidatePool.slice(start, Math.max(start + 1, end));
    const best = [...bucket].sort((left, right) => {
      const priorityDelta = right.priority - left.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.order - right.order;
    })[0];
    if (best) {
      selected.set(best.order, best.entry);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

export function fillSourceOrderedTemporalGaps(input: {
  language: LanguageService;
  pool: RankedFactCandidate[];
  query: string;
  queryLocale: string;
  selected: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selectedIds = new Set(input.selected.map((entry) => entry.fact.id));
  const selectedWithOrder = input.selected
    .filter(isSourceOrderedFact)
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .sort(compareTemporalFactChronology);
  const gapCandidates = new Map<string, RankedFactCandidate>();
  const selectedAspectTopics = new Set(
    input.selected.flatMap((entry) => [
      ...sourceOrderAspectTopics(entry, input.language),
    ]),
  );
  const earliestAspectSourceOrder = new Map<string, number>();
  for (const entry of input.pool) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }
    for (const topic of sourceOrderAspectTopics(entry, input.language)) {
      const current = earliestAspectSourceOrder.get(topic);
      if (current === undefined || order < current) {
        earliestAspectSourceOrder.set(topic, order);
      }
    }
  }

  for (let index = 0; index < selectedWithOrder.length - 1; index += 1) {
    const leftOrder = sourceOrderSortKey(selectedWithOrder[index]!);
    const rightOrder = sourceOrderSortKey(selectedWithOrder[index + 1]!);
    if (leftOrder === undefined || rightOrder === undefined) {
      continue;
    }

    const candidatesInGap = input.pool
      .filter((entry) => !selectedIds.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined && order > leftOrder && order < rightOrder;
      })
      .sort((left, right) => {
        const priorityDelta =
          sourceOrderGapCandidatePriority(
            right,
            input.query,
            input.language,
            input.queryLocale,
          ) -
          sourceOrderGapCandidatePriority(
            left,
            input.query,
            input.language,
            input.queryLocale,
          );
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    for (const candidate of candidatesInGap) {
      gapCandidates.set(candidate.fact.id, candidate);
    }
  }

  const candidatePool = [...gapCandidates.values()];
  const additions: RankedFactCandidate[] = [];
  while (
    additions.length < SOURCE_ORDER_GAP_FILL_LIMIT &&
    candidatePool.length > 0
  ) {
    candidatePool.sort((left, right) => {
      const leftNovelAspectCount = [...sourceOrderAspectTopics(left, input.language)]
        .filter((topic) => !selectedAspectTopics.has(topic)).length;
      const rightNovelAspectCount = [...sourceOrderAspectTopics(right, input.language)]
        .filter((topic) => !selectedAspectTopics.has(topic)).length;
      const leftOrder = sourceOrderSortKey(left);
      const rightOrder = sourceOrderSortKey(right);
      const leftAspectIntroductionCount = [
        ...sourceOrderAspectTopics(left, input.language),
      ].filter(
        (topic) =>
          leftOrder !== undefined &&
          earliestAspectSourceOrder.get(topic) === leftOrder,
      ).length;
      const rightAspectIntroductionCount = [
        ...sourceOrderAspectTopics(right, input.language),
      ].filter(
        (topic) =>
          rightOrder !== undefined &&
          earliestAspectSourceOrder.get(topic) === rightOrder,
      ).length;
      const priorityDelta =
        (
          sourceOrderGapCandidatePriority(
            right,
            input.query,
            input.language,
            input.queryLocale,
          ) +
          rightNovelAspectCount * 60 +
          rightAspectIntroductionCount * 160
        ) -
        (
          sourceOrderGapCandidatePriority(
            left,
            input.query,
            input.language,
            input.queryLocale,
          ) +
          leftNovelAspectCount * 60 +
          leftAspectIntroductionCount * 160
        );
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    });

    const next = candidatePool.shift();
    if (!next) {
      break;
    }
    additions.push(next);
    for (const topic of sourceOrderAspectTopics(next, input.language)) {
      selectedAspectTopics.add(topic);
    }
  }

  if (additions.length === 0) {
    return input.selected;
  }

  return [...input.selected, ...additions].sort(compareTemporalFactChronology);
}

export function fillSourceOrderedTemporalCompanions(input: {
  pool: RankedFactCandidate[];
  query: string;
  selected: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selectedIds = new Set(input.selected.map((entry) => entry.fact.id));
  const selectedOrders = input.selected
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  if (selectedOrders.length === 0) {
    return input.selected;
  }

  const additions = input.pool
    .filter((entry) => !selectedIds.has(entry.fact.id))
    .filter(hasUserAnswerTag)
    .map((entry) => {
      const order = sourceOrderSortKey(entry);
      if (order === undefined) {
        return null;
      }
      const nearestDistance = Math.min(
        ...selectedOrders.map((selectedOrder) => Math.abs(selectedOrder - order)),
      );
      if (nearestDistance > SOURCE_ORDER_COMPANION_MAX_DISTANCE) {
        return null;
      }
      const previousSelectedOrder = selectedOrders
        .filter((selectedOrder) => selectedOrder < order)
        .sort((left, right) => right - left)[0];
      const nextSelectedOrder = selectedOrders
        .filter((selectedOrder) => selectedOrder > order)
        .sort((left, right) => left - right)[0];
      const surroundingGap =
        previousSelectedOrder !== undefined && nextSelectedOrder !== undefined
          ? nextSelectedOrder - previousSelectedOrder
          : SOURCE_ORDER_COMPANION_MAX_DISTANCE;
      const priority =
        (SOURCE_ORDER_COMPANION_MAX_DISTANCE - nearestDistance + 1) * 100 +
        surroundingGap * 10 +
        temporalOrderEvidencePriority(entry, input.query) +
        (SOURCE_ORDER_ASPECT_CUE_PATTERN.test(stripEvidencePrefix(entry.fact.content))
          ? 100
          : 0);
      return {
        entry,
        nearestDistance,
        priority,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        nearestDistance: number;
        priority: number;
      } => candidate !== null,
    )
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      if (left.nearestDistance !== right.nearestDistance) {
        return left.nearestDistance - right.nearestDistance;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    })
    .slice(0, SOURCE_ORDER_COMPANION_LIMIT)
    .map((candidate) => candidate.entry);

  if (additions.length === 0) {
    return input.selected;
  }

  return [...input.selected, ...additions].sort(compareTemporalFactChronology);
}

export function fillSourceOrderedTemporalMilestones(input: {
  language: LanguageService;
  pool: RankedFactCandidate[];
  query: string;
  queryLocale: string;
  selected: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selectedIds = new Set(input.selected.map((entry) => entry.fact.id));
  const selectedOrders = input.selected
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  if (selectedOrders.length === 0) {
    return input.selected;
  }

  const maxSelectedOrder = Math.max(...selectedOrders);
  const selectedAspectTopics = new Set(
    input.selected.flatMap((entry) => [
      ...sourceOrderAspectTopics(entry, input.language),
    ]),
  );
  const earliestAspectSourceOrder = new Map<string, number>();
  for (const entry of input.pool) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }
    for (const topic of sourceOrderAspectTopics(entry, input.language)) {
      const current = earliestAspectSourceOrder.get(topic);
      if (current === undefined || order < current) {
        earliestAspectSourceOrder.set(topic, order);
      }
    }
  }

  const candidatePool = input.pool
    .filter((entry) => !selectedIds.has(entry.fact.id))
    .filter(hasUserAnswerTag)
    .map((entry) => {
      const order = sourceOrderSortKey(entry);
      if (order === undefined) {
        return null;
      }
      const content = stripEvidencePrefix(entry.fact.content);
      const aspectTopics = sourceOrderAspectTopics(entry, input.language);
      const querySpecificMilestone =
        isPersonalWorkChallengeEventOrderQuery(input.query) &&
        hasPersonalWorkChallengeEventSignal(entry);
      if (
        aspectTopics.size === 0 &&
        !SOURCE_ORDER_ASPECT_CUE_PATTERN.test(content) &&
        !querySpecificMilestone
      ) {
        return null;
      }
      const novelAspectCount = [...aspectTopics].filter(
        (topic) => !selectedAspectTopics.has(topic),
      ).length;
      const aspectIntroductionCount = [...aspectTopics].filter(
        (topic) => earliestAspectSourceOrder.get(topic) === order,
      ).length;
      const nearestDistance = Math.min(
        ...selectedOrders.map((selectedOrder) => Math.abs(selectedOrder - order)),
      );
      const tailMilestoneBonus = order > maxSelectedOrder ? 120 : 0;
      const isolatedMilestoneBonus =
        nearestDistance > SOURCE_ORDER_COMPANION_MAX_DISTANCE ? 45 : 0;
      const priority =
        sourceOrderGapCandidatePriority(
          entry,
          input.query,
          input.language,
          input.queryLocale,
        ) +
        novelAspectCount * 140 +
        aspectIntroductionCount * 90 +
        (querySpecificMilestone ? 220 : 0) +
        tailMilestoneBonus +
        isolatedMilestoneBonus;

      return {
        aspectTopics,
        entry,
        novelAspectCount,
        order,
        priority,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        aspectTopics: Set<string>;
        entry: RankedFactCandidate;
        novelAspectCount: number;
        order: number;
        priority: number;
      } => candidate !== null,
    );

  const additions: RankedFactCandidate[] = [];
  while (
    additions.length < SOURCE_ORDER_MILESTONE_FILL_LIMIT &&
    candidatePool.length > 0
  ) {
    candidatePool.sort((left, right) => {
      const priorityDelta = right.priority - left.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.order - right.order;
    });

    const next = candidatePool.shift();
    if (!next) {
      break;
    }
    const stillNovelAspectCount = [...next.aspectTopics].filter(
      (topic) => !selectedAspectTopics.has(topic),
    ).length;
    if (
      stillNovelAspectCount === 0 &&
      next.order <= maxSelectedOrder &&
      additions.length > 0
    ) {
      continue;
    }

    additions.push(next.entry);
    for (const topic of next.aspectTopics) {
      selectedAspectTopics.add(topic);
    }
  }

  if (additions.length === 0) {
    return input.selected;
  }

  return [...input.selected, ...additions].sort(compareTemporalFactChronology);
}

export function sourceOrderedPersonalWorkChallengePriority(input: {
  entry: RankedFactCandidate;
  query: string;
}): number {
  const content = valueBearingFactContent(input.entry.fact.content);
  let priority = temporalOrderEvidencePriority(input.entry, input.query);

  if (PERSONAL_WORK_CHALLENGE_STATE_PATTERN.test(content)) {
    priority += 120;
  }
  if (
    PERSONAL_WORK_CONTEXT_PATTERN.test(content) &&
    PERSONAL_LIFE_CONTEXT_PATTERN.test(content)
  ) {
    priority += 80;
  }
  if (
    PERSONAL_LIFE_CONTEXT_PATTERN.test(content) &&
    PERSONAL_WORK_CHALLENGE_RESPONSE_PATTERN.test(content)
  ) {
    priority += 140;
  }
  if (
    /\b(?:anniversary|partner|picnic|return\s+the\s+favor|surprise)\b/iu.test(
      content,
    )
  ) {
    priority += 120;
  }
  if (
    /^(?:\[[^\]]+\]\s*)?(?:I(?:'m| am| feel| have| had| was)|My partner|My family|My friend)\b/iu.test(
      content,
    )
  ) {
    priority += 90;
  }
  if (
    /^(?:\[[^\]]+\]\s*)?(?:Thanks|Sounds good|These strategies|That plan)\b/iu.test(
      content,
    )
  ) {
    priority -= 90;
  }

  return priority;
}

export function dedupeSourceOrderedCandidatesByOrder(
  entries: RankedFactCandidate[],
  query: string,
): RankedFactCandidate[] {
  const bestByOrder = new Map<number, RankedFactCandidate>();
  for (const entry of entries) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }
    const current = bestByOrder.get(order);
    if (
      !current ||
      sourceOrderedPersonalWorkChallengePriority({ entry, query }) >
        sourceOrderedPersonalWorkChallengePriority({ entry: current, query })
    ) {
      bestByOrder.set(order, entry);
    }
  }

  return [...bestByOrder.values()].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedPersonalWorkChallengeEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isPersonalWorkChallengeEventOrderQuery(input.query)) {
    return [];
  }

  const sourceCandidates = dedupeSourceOrderedCandidatesByOrder(
    input.entries
      .filter(isSourceOrderedSummaryCandidate)
      .filter(hasUserAnswerTag)
      .filter(hasPersonalWorkChallengeEventSignal),
    input.query,
  );
  if (sourceCandidates.length === 0) {
    return [];
  }

  const selected = new Map<number, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    const order = sourceOrderSortKey(entry);
    if (
      order === undefined ||
      selected.has(order) ||
      selected.size >= SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_RECALL_LIMIT
    ) {
      return;
    }
    selected.set(order, entry);
  };
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderedPersonalWorkChallengePriority({
      entry,
      query: input.query,
    });
  const anchorCount = Math.min(
    SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_ANCHOR_LIMIT,
    sourceCandidates.length,
  );

  for (let index = 0; index < anchorCount; index += 1) {
    const start = Math.floor(index * sourceCandidates.length / anchorCount);
    const end = Math.floor((index + 1) * sourceCandidates.length / anchorCount);
    const bucket = sourceCandidates.slice(start, Math.max(start + 1, end));
    const best = [...bucket].sort((left, right) => {
      const priorityDelta = priority(right) - priority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })[0];
    if (best) {
      addCandidate(best);
    }
  }

  const anchors = [...selected.values()].sort(compareTemporalFactChronology);
  for (const anchor of anchors) {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companions = sourceCandidates
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          !selected.has(order) &&
          Math.abs(order - anchorOrder) <=
            SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_COMPANION_DISTANCE;
      })
      .sort((left, right) => {
        const leftOrder = sourceOrderSortKey(left) ?? 0;
        const rightOrder = sourceOrderSortKey(right) ?? 0;
        const distanceDelta =
          Math.abs(leftOrder - anchorOrder) - Math.abs(rightOrder - anchorOrder);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        const priorityDelta = priority(right) - priority(left);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    for (const companion of companions) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
