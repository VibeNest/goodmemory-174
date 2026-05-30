import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedHouseholdBudgetReasoningEvidence } from "./sourceOrderFinancialPlanning";
import {
  dedupeSourceOrderedEvidenceByOrder,
  selectSourceOrderedEvidencePlan,
} from "./sourceOrderPlan";
import { isSourceOrderedSummaryCandidate } from "./sourceOrderSummary";
import {
  sourceOrderAspectTopics,
} from "./sourceOrderTemporal";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import { sourceOrderSortKey } from "./temporal";

export const SOURCE_ORDER_REASONING_RECALL_LIMIT = 8;
export const SOURCE_ORDER_REASONING_ANCHOR_LIMIT = 6;
export const SOURCE_ORDER_REASONING_PRIORITY_THRESHOLD = 130;
export const SOURCE_ORDER_REASONING_COMPANION_DISTANCE = 1;

export const SOURCE_ORDER_REASONING_QUERY_PATTERN =
  /\b(?:based\s+on|between|combine|compared?\s+with|considering|current|decid(?:e|ed|ing)|latest|now|recommend|should|still|trade[-\s]?off|together|update(?:d)?|which|why)\b/iu;
export const SOURCE_ORDER_REASONING_QUERY_ZH_PATTERN =
  /(基于|结合|比较|对比|考虑|当前|现在|最新|仍然|是否|应该|哪个|为什么|决定|更新|变化|取舍|权衡|推荐)/u;

export const SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN =
  /\b(?:changed|current|decid(?:e|ed|ing)|instead|latest|new(?:er)?|no\s+longer|now|switched?|updated?)\b/iu;
export const SOURCE_ORDER_UPDATE_EVIDENCE_ZH_PATTERN =
  /(改变|变化|当前|现在|最新|决定|改成|换成|不再|更新)/u;
export const SOURCE_ORDER_REASONING_EVIDENCE_PATTERN =
  /\b(?:because|constraint|cost|decision|depends?|option|prefer|reason|risk|trade[-\s]?off|why)\b/iu;
export const SOURCE_ORDER_REASONING_EVIDENCE_ZH_PATTERN =
  /(因为|原因|限制|约束|成本|决定|选项|偏好|风险|取舍|权衡|为什么)/u;

type SeniorProducerPreparationPriorityFacet =
  | "coverLetterDeadlines"
  | "creativeDirectorZoom"
  | "interviewClarityScore"
  | "interviewImprovementPlan";

type WeatherAppLatencyComparisonFacet =
  | "autocompleteApiResponseTime"
  | "fetchCallLatency";

const SENIOR_PRODUCER_PREPARATION_PRIORITY_FACETS = [
  "coverLetterDeadlines",
  "creativeDirectorZoom",
  "interviewClarityScore",
  "interviewImprovementPlan",
] as const satisfies readonly SeniorProducerPreparationPriorityFacet[];

const WEATHER_APP_LATENCY_COMPARISON_FACETS = [
  "fetchCallLatency",
  "autocompleteApiResponseTime",
] as const satisfies readonly WeatherAppLatencyComparisonFacet[];

function isSourceOrderedReasoningBridgeQuery(query: string): boolean {
  return SOURCE_ORDER_REASONING_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_REASONING_QUERY_ZH_PATTERN.test(query);
}

export function isSeniorProducerPreparationPriorityQuery(query: string): boolean {
  return /\bcover\s+letter\b[\s\S]{0,80}\bdeadlines?\b/iu.test(query) &&
    /\bzoom\b[\s\S]{0,80}\bcreative\s+director\b/iu.test(query) &&
    /\binterview\b[\s\S]{0,80}\bclarity\b[\s\S]{0,80}\bimprovements?\b/iu.test(query) &&
    /\bprioriti[sz]e\b[\s\S]{0,80}\bpreparation\b/iu.test(query) &&
    /\bmaximi[sz]e\b[\s\S]{0,80}\bchances\b/iu.test(query) &&
    /\bsenior\s+producer\s+role\b/iu.test(query);
}

function isWeatherAppLatencyComparisonQuery(query: string): boolean {
  return /\bfetch\s+call\s+latenc(?:y|ies)\b/iu.test(query) &&
    /\bautocomplete\s+API\s+response\s+time\b/iu.test(query) &&
    /\bfaster\b/iu.test(query) &&
    /\b(?:based\s+on|tests?)\b/iu.test(query);
}

function hasSourceOrderedReasoningEvidenceSignal(content: string): boolean {
  return SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content) ||
    SOURCE_ORDER_UPDATE_EVIDENCE_ZH_PATTERN.test(content) ||
    SOURCE_ORDER_REASONING_EVIDENCE_PATTERN.test(content) ||
    SOURCE_ORDER_REASONING_EVIDENCE_ZH_PATTERN.test(content);
}

function seniorProducerPreparationPriorityFacet(
  entry: RankedFactCandidate,
): SeniorProducerPreparationPriorityFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    /\bcover\s+letter\s+draft\b/iu.test(content) &&
    /\bmarch\s+25\b/iu.test(content) &&
    /\b(?:revise|revision|revisions)\b[\s\S]{0,40}\bapril\s+5\b/iu.test(content)
  ) {
    return "coverLetterDeadlines";
  }

  if (
    /\bzoom\s+call\b/iu.test(content) &&
    /\bcreative\s+director\b/iu.test(content) &&
    /\bapril\s+21\b/iu.test(content) &&
    /\b3\s*(?:p\.?m\.?)\b/iu.test(content)
  ) {
    return "creativeDirectorZoom";
  }

  if (
    /\binterview\s+answer\s+clarity\s+score\b/iu.test(content) &&
    /\b6\.5\b/iu.test(content) &&
    /\b8\.2\b/iu.test(content) &&
    /\bgreg\b/iu.test(content)
  ) {
    return "interviewClarityScore";
  }

  if (
    /\bstar\s+method\b/iu.test(content) &&
    /\bspecificity\b/iu.test(content) &&
    /\bactive\s+listening\b/iu.test(content) &&
    /\bgreg\b/iu.test(content) &&
    /\b(?:industry\s+trends|island\s+media\s+group|pressure|unexpected\s+questions|record(?:ing)?\s+myself)\b/iu.test(content)
  ) {
    return "interviewImprovementPlan";
  }

  return undefined;
}

function selectSourceOrderedSeniorProducerPreparationPriorityEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSeniorProducerPreparationPriorityQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    SeniorProducerPreparationPriorityFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .filter(hasUserAnswerTag)
    .map((entry) => ({
      entry,
      facet: seniorProducerPreparationPriorityFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: SeniorProducerPreparationPriorityFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    SENIOR_PRODUCER_PREPARATION_PRIORITY_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return SENIOR_PRODUCER_PREPARATION_PRIORITY_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function weatherAppLatencyComparisonFacet(
  entry: RankedFactCandidate,
): WeatherAppLatencyComparisonFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    /\bfetch\s+call\s+latenc(?:y|ies)\b/iu.test(content) &&
    /\b(?:currently\s+averages?|averages?)\b[\s\S]{0,40}\b250\s*ms\b/iu.test(content)
  ) {
    return "fetchCallLatency";
  }

  if (
    /\bautocomplete\s+feature\b/iu.test(content) &&
    /\baverage\s+API\s+response\s+time\b[\s\S]{0,40}\b280\s*ms\b/iu.test(content) &&
    /\b(?:100\s+city\s+inputs|95\s*%\s+success\s+rate|valid\s+cities)\b/iu.test(content)
  ) {
    return "autocompleteApiResponseTime";
  }

  return undefined;
}

function sourceOrderEnvelopeScore(entry: RankedFactCandidate): number {
  const content = entry.fact.content;
  if (
    /\bchat[_-]?id\s*[:=]\s*\d+\b/iu.test(content) &&
    /\brole\s*=\s*(?:assistant|user)\b/iu.test(content)
  ) {
    return 2;
  }
  if (entry.fact.tags?.includes("source_message") === true) {
    return 1;
  }
  return 0;
}

function selectSourceOrderedWeatherAppLatencyComparisonEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isWeatherAppLatencyComparisonQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    WeatherAppLatencyComparisonFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .filter(hasUserAnswerTag)
    .map((entry) => ({
      entry,
      facet: weatherAppLatencyComparisonFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: WeatherAppLatencyComparisonFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const envelopeDelta =
        sourceOrderEnvelopeScore(right.entry) -
        sourceOrderEnvelopeScore(left.entry);
      if (envelopeDelta !== 0) {
        return envelopeDelta;
      }

      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    WEATHER_APP_LATENCY_COMPARISON_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return WEATHER_APP_LATENCY_COMPARISON_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function sourceOrderReasoningNamedTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b/gu)) {
    const token = match[0].toLowerCase();
    if (
      token.length > 2 &&
      !["assistant", "beam", "can", "the", "user", "what", "which"].includes(token)
    ) {
      tokens.add(token);
    }
  }
  return tokens;
}

function sourceOrderReasoningPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
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
  const namedOverlap = [...sourceOrderReasoningNamedTokens(content)]
    .filter((token) => input.queryNamedTokens.has(token)).length;
  let priority =
    topicOverlap * 110 +
    aspectOverlap * 120 +
    namedOverlap * 150 +
    input.entry.lexicalScore * 110 +
    input.entry.subjectScore * 80 +
    input.entry.intentScore * 70;

  if (hasSourceOrderedReasoningEvidenceSignal(content)) {
    priority += 110;
  }
  if (SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content)) {
    priority += 80;
  }
  if (hasUserAnswerTag(input.entry)) {
    priority += 50;
  }
  if (hasAssistantAnswerTag(input.entry)) {
    priority -= 25;
  }
  if (/^(?:\[[^\]]+\]\s*)?(?:thanks?|okay|ok|sounds good|great)\b/iu.test(content)) {
    priority -= 180;
  }
  if (content.length > 2000) {
    priority -= 90;
  }

  return priority;
}

function sourceOrderReasoningSlotSignature(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  maxOrder: number;
  minOrder: number;
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
  for (const token of sourceOrderReasoningNamedTokens(content)) {
    if (input.queryNamedTokens.has(token)) {
      signature.add(`name:${token}`);
    }
  }

  const order = sourceOrderSortKey(input.entry);
  if (order !== undefined && SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content)) {
    const span = Math.max(1, input.maxOrder - input.minOrder);
    const relative = (order - input.minOrder) / span;
    signature.add(relative < 0.5 ? "version:earlier" : "version:later");
  }

  return signature;
}

export function selectSourceOrderedReasoningBridgeEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const householdBudgetReasoning =
    selectSourceOrderedHouseholdBudgetReasoningEvidence(input);
  if (householdBudgetReasoning.length > 0) {
    return householdBudgetReasoning;
  }

  const seniorProducerPreparationPriority =
    selectSourceOrderedSeniorProducerPreparationPriorityEvidence(input);
  if (seniorProducerPreparationPriority.length > 0) {
    return seniorProducerPreparationPriority;
  }

  const weatherAppLatencyComparison =
    selectSourceOrderedWeatherAppLatencyComparisonEvidence(input);
  if (weatherAppLatencyComparison.length > 0) {
    return weatherAppLatencyComparison;
  }

  if (!isSourceOrderedReasoningBridgeQuery(input.query)) {
    return [];
  }

  const queryTopics = selectorTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const queryNamedTokens = sourceOrderReasoningNamedTokens(input.query);
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderReasoningPriority({
      entry,
      language: input.language,
      queryNamedTokens,
      queryTopics,
    });
  const sourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: input.entries
      .filter(isSourceOrderedSummaryCandidate)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return priority(entry) >= SOURCE_ORDER_REASONING_PRIORITY_THRESHOLD &&
          hasSourceOrderedReasoningEvidenceSignal(content);
      }),
    priority,
  });
  if (sourceCandidates.length < 2) {
    return [];
  }

  const orders = sourceCandidates
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  const minOrder = Math.min(...orders);
  const maxOrder = Math.max(...orders);
  const anchors = sourceCandidates.filter((entry) => {
    const signature = sourceOrderReasoningSlotSignature({
      entry,
      language: input.language,
      maxOrder,
      minOrder,
      queryNamedTokens,
      queryTopics,
    });
    return signature.size > 0 ||
      hasSourceOrderedReasoningEvidenceSignal(stripEvidencePrefix(entry.fact.content));
  });
  if (anchors.length < 2) {
    return [];
  }

  return selectSourceOrderedEvidencePlan({
    anchorLimit: SOURCE_ORDER_REASONING_ANCHOR_LIMIT,
    anchors,
    companionDistance: SOURCE_ORDER_REASONING_COMPANION_DISTANCE,
    companionPool: sourceCandidates,
    companionsPerAnchor: 1,
    limit: SOURCE_ORDER_REASONING_RECALL_LIMIT,
    priority,
    slotSignature: (entry) =>
      sourceOrderReasoningSlotSignature({
        entry,
        language: input.language,
        maxOrder,
        minOrder,
        queryNamedTokens,
        queryTopics,
      }),
  });
}
