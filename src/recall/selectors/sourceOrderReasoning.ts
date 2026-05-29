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

function isSourceOrderedReasoningBridgeQuery(query: string): boolean {
  return SOURCE_ORDER_REASONING_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_REASONING_QUERY_ZH_PATTERN.test(query);
}

function hasSourceOrderedReasoningEvidenceSignal(content: string): boolean {
  return SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content) ||
    SOURCE_ORDER_UPDATE_EVIDENCE_ZH_PATTERN.test(content) ||
    SOURCE_ORDER_REASONING_EVIDENCE_PATTERN.test(content) ||
    SOURCE_ORDER_REASONING_EVIDENCE_ZH_PATTERN.test(content);
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
