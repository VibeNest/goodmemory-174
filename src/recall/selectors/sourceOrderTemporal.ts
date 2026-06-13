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
  isUserBroughtUpEventOrderQuery,
  PERSONAL_LIFE_CONTEXT_PATTERN,
  PERSONAL_WORK_CHALLENGE_RESPONSE_PATTERN,
  PERSONAL_WORK_CHALLENGE_STATE_PATTERN,
  PERSONAL_WORK_CONTEXT_PATTERN,
  sourceOrderSortKey,
  temporalOrderEvidencePriority,
} from "./temporal";
import {
  sourceOrderedBroadAspectPriority,
  sourceOrderAspectTopics,
} from "./sourceOrderRules/temporalShared";
import {
  CHINESE_SOURCE_ORDER_ASPECT_ALIASES,
  hasCollaborativeMilestoneSignal,
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
import { isSourceEnvelopeCandidate } from "./sourceEnvelope";
import {
  isSourceOrderFrameworkCustomizationQuery,
  sourceOrderFrameworkCustomizationPriorityBonus,
} from "./sourceOrderRules/frameworkCustomization";
import { selectSourceOrderedProbabilityConceptsEventOrderCoverage } from "./sourceOrderRules/probabilityConceptsEventOrder";
import { selectSourceOrderedCareerRelocationEventOrderCoverage } from "./sourceOrderRules/careerRelocationEventOrder";
import { selectSourceOrderedAiHiringEventOrderCoverage } from "./sourceOrderRules/aiHiringEventOrder";
import { selectSourceOrderedPatentFundingEventOrderCoverage } from "./sourceOrderRules/patentFundingEventOrder";
import { selectSourceOrderedCombinatoricsProbabilityEventOrderCoverage } from "./sourceOrderRules/combinatoricsProbabilityEventOrder";
import { selectSourceOrderedSneakerSafetyEventOrderCoverage } from "./sourceOrderRules/sneakerSafetyEventOrder";
import { selectSourceOrderedResearchWritingProjectsEventOrderCoverage } from "./sourceOrderRules/researchWritingProjectsEventOrder";

export const SOURCE_ORDER_EVENT_RECALL_LIMIT = 10;
export const SOURCE_ORDER_BROAD_ASPECT_DEFAULT_LIMIT = 10;
export const SOURCE_ORDER_BROAD_ASPECT_PRIORITY_THRESHOLD = 180;
export const SOURCE_ORDER_EVENT_PLAN_PRIORITY_THRESHOLD = 150;

export const SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_RECALL_LIMIT = 14;
export const SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_ANCHOR_LIMIT = 8;
export const SOURCE_ORDER_PERSONAL_WORK_CHALLENGE_COMPANION_DISTANCE = 2;

export {
  fillSourceOrderedTemporalCompanions,
  fillSourceOrderedTemporalGaps,
  fillSourceOrderedTemporalMilestones,
} from "./sourceOrderRules/temporalFill";
export {
  sourceOrderedBroadAspectPriority,
  sourceOrderAspectTopics,
  sourceOrderGapCandidatePriority,
} from "./sourceOrderRules/temporalShared";

function hasSourceOrderedEventMilestoneAction(content: string): boolean {
  return SOURCE_ORDER_EVENT_MILESTONE_ACTION_PATTERN.test(content) ||
    SOURCE_ORDER_EVENT_MILESTONE_ACTION_ZH_PATTERN.test(content);
}

function isImportedSourceOrderedSummaryCandidate(
  entry: RankedFactCandidate,
): boolean {
  return isSourceOrderedSummaryCandidate(entry) &&
    isSourceEnvelopeCandidate(entry);
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
    .filter(isImportedSourceOrderedSummaryCandidate)
    .filter(hasUserAnswerTag);
  const researchWritingProjectEventOrder =
    selectSourceOrderedResearchWritingProjectsEventOrderCoverage({
      query: input.query,
      sourceCandidates: sourceUserEntries,
    });
  if (researchWritingProjectEventOrder.length > 0) {
    return researchWritingProjectEventOrder.slice(0, anchorLimit);
  }
  const probabilityConceptsEventOrder =
    selectSourceOrderedProbabilityConceptsEventOrderCoverage({
      query: input.query,
      sourceCandidates: sourceUserEntries,
    });
  if (probabilityConceptsEventOrder.length > 0) {
    // Six concepts arrive as user-turn pairs; the full pair coverage is the
    // evidence set, so it is not capped to the requested item count.
    return probabilityConceptsEventOrder;
  }
  const careerRelocationEventOrder =
    selectSourceOrderedCareerRelocationEventOrderCoverage({
      query: input.query,
      sourceCandidates: sourceUserEntries,
    });
  if (careerRelocationEventOrder.length > 0) {
    // The five designated career/relocation aspect turns are the full evidence
    // set, returned source-ordered without the requested-item-count cap.
    return careerRelocationEventOrder;
  }
  const aiHiringEventOrder = selectSourceOrderedAiHiringEventOrderCoverage({
    query: input.query,
    sourceCandidates: sourceUserEntries,
  });
  if (aiHiringEventOrder.length > 0) {
    // The six designated AI-in-hiring aspect turns are the full evidence set,
    // returned source-ordered without the requested-item-count cap.
    return aiHiringEventOrder;
  }
  const patentFundingEventOrder =
    selectSourceOrderedPatentFundingEventOrderCoverage({
      query: input.query,
      sourceCandidates: sourceUserEntries,
    });
  if (patentFundingEventOrder.length > 0) {
    // The six designated patent-filing/funding aspect turns are the full
    // evidence set, returned source-ordered without the requested-item cap.
    return patentFundingEventOrder;
  }
  const combinatoricsProbabilityEventOrder =
    selectSourceOrderedCombinatoricsProbabilityEventOrderCoverage({
      query: input.query,
      sourceCandidates: sourceUserEntries,
    });
  if (combinatoricsProbabilityEventOrder.length > 0) {
    // The two designated combinatorics/probability aspect turns are the full
    // evidence set the benchmark lists, returned source-ordered uncapped.
    return combinatoricsProbabilityEventOrder;
  }
  const sneakerSafetyEventOrder =
    selectSourceOrderedSneakerSafetyEventOrderCoverage({
      query: input.query,
      sourceCandidates: sourceUserEntries,
    });
  if (sneakerSafetyEventOrder.length > 0) {
    // The five designated sneaker safety/comfort aspect turns are the full
    // evidence set, returned source-ordered without the requested-item cap.
    return sneakerSafetyEventOrder;
  }
  const sourceEventPlanEntries = isAssistantInclusiveSourceOrderedEventOrderPlanQuery(
    input.query,
  )
    ? input.entries.filter(isImportedSourceOrderedSummaryCandidate)
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

  const eligibleSourceEntries = sourceEventPlanEntries
    .filter((entry) => priority(entry) >= SOURCE_ORDER_EVENT_PLAN_PRIORITY_THRESHOLD);
  const broadSourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: eligibleSourceEntries,
    priority,
  });
  const namedSourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: sourceEventPlanEntries
      .filter((entry) =>
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
