import type { LanguageService } from "../../../language";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import {
  hasSourceOrderedSummaryMilestoneAction,
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "../sourceOrderSummarySignals";
import { selectorTopicOverlapCount, selectorTopicTokens } from "../topic";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_STOPWORDS = new Set([
  "ai",
  "beam",
  "can",
  "clear",
  "complete",
  "comprehensive",
  "give",
  "how",
  "i",
  "only",
  "quick",
  "summary",
  "the",
  "what",
  "when",
  "where",
  "why",
]);
const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_PATTERN =
  /\b(?:agree(?:d|ing)?\s+to|commit(?:ted|ting)?\s+to|decid(?:e|ed|ing)\s+(?:to|whether)|declin(?:e|ed|ing)|limit(?:ed|ing)?|negotiat(?:e|ed|ing)|prioriti[sz](?:e|ed|ing)|reduc(?:e|ed|ing)|reschedul(?:e|ed|ing)|resolv(?:e|ed|ing)|schedul(?:e|ed|ing)|set\s+(?:a\s+)?boundar(?:y|ies)|started?|switch(?:ed|ing)|will\s+(?:host|limit|prioriti[sz]e|reduce|reschedule|schedule|support|talk))\b/iu;
const SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_ZH_PATTERN =
  /(同意|承诺|决定|拒绝|减少|限制|重新安排|安排|协商|优先|解决|设定边界|开始|切换)/u;

function hasSourceOrderedSummarySourceEnvelope(entry: RankedFactCandidate): boolean {
  const content = entry.fact.content;
  return /\b(?:chat[_-]?id|source[_-]?order|sourceOrder)\s*[:=]\s*\d+\b/iu.test(
    content,
  ) || /\brole\s*=\s*(?:assistant|user)\b/iu.test(content);
}

export function sourceOrderedSummaryNamedEntityTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b/gu)) {
    const token = match[0].toLowerCase();
    if (
      token.length > 2 &&
      !SOURCE_ORDER_SUMMARY_NAMED_ENTITY_STOPWORDS.has(token)
    ) {
      tokens.add(token);
    }
  }

  return tokens;
}

export function sourceOrderedSummaryNamedEntityOverlap(
  value: string,
  queryNamedTokens: ReadonlySet<string>,
): number {
  const contentNamedTokens = sourceOrderedSummaryNamedEntityTokens(value);
  let overlap = 0;
  for (const token of queryNamedTokens) {
    if (contentNamedTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function hasSourceOrderedNamedEntitySummaryDecisionMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_PATTERN.test(
    content,
  ) || SOURCE_ORDER_SUMMARY_NAMED_ENTITY_DECISION_MILESTONE_ZH_PATTERN.test(
    content,
  ) || hasSourceOrderedSummaryMilestoneAction(content);
}

function sourceOrderedSummaryRepresentativeScore(input: {
  entry: RankedFactCandidate;
  priority: (entry: RankedFactCandidate) => number;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  let score = input.priority(input.entry);
  if (hasSourceOrderedSummarySourceEnvelope(input.entry)) {
    score += 1000;
  }
  score += Math.min(content.length, 2000) / 100;
  return score;
}

export function dedupeSourceOrderedSummaryTurns(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bySourceOrder = new Map<number, RankedFactCandidate>();
  for (const entry of input.entries) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }

    const current = bySourceOrder.get(order);
    if (!current) {
      bySourceOrder.set(order, entry);
      continue;
    }

    const scoreDelta =
      sourceOrderedSummaryRepresentativeScore({
        entry,
        priority: input.priority,
      }) -
      sourceOrderedSummaryRepresentativeScore({
        entry: current,
        priority: input.priority,
      });
    if (
      scoreDelta > 0 ||
      (
        scoreDelta === 0 &&
        compareTemporalFactChronology(entry, current) < 0
      )
    ) {
      bySourceOrder.set(order, entry);
    }
  }

  return [...bySourceOrder.values()].sort(compareTemporalFactChronology);
}

function sourceOrderedNamedEntitySummaryPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  priority: (entry: RankedFactCandidate) => number;
  queryNamedTokens: ReadonlySet<string>;
  querySpecificTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const decisionMilestone =
    hasSourceOrderedNamedEntitySummaryDecisionMilestone(content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let score = input.priority(input.entry) +
    sourceOrderedSummaryNamedEntityOverlap(content, input.queryNamedTokens) * 500 +
    selectorTopicOverlapCount(input.querySpecificTopics, factTopics) * 140;

  if (hasUserAnswerTag(input.entry)) {
    score += 120;
  }
  if (decisionMilestone) {
    score += 540;
  }
  if (isLowInformationSourceSummaryFollowUp(content)) {
    score -= 300;
  }
  if (isSourceOrderedSummaryInstructionLike(content)) {
    score -= 500;
  }

  return score;
}

export function selectSourceOrderedNamedEntitySummaryMilestones(input: {
  anchorLimit: number;
  candidates: RankedFactCandidate[];
  companionDistance: number;
  language: LanguageService;
  priority: (entry: RankedFactCandidate) => number;
  queryNamedTokens: ReadonlySet<string>;
  querySpecificTopics: ReadonlySet<string>;
  recallLimit: number;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const sortedCandidates = [...input.candidates].sort(compareTemporalFactChronology);
  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < input.recallLimit) {
      selected.set(entry.fact.id, entry);
    }
  };
  const bucketCount = Math.min(input.anchorLimit, sortedCandidates.length);
  const namedPriority = (entry: RankedFactCandidate): number =>
    sourceOrderedNamedEntitySummaryPriority({
      entry,
      language: input.language,
      priority: input.priority,
      queryNamedTokens: input.queryNamedTokens,
      querySpecificTopics: input.querySpecificTopics,
    });

  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor(index * sortedCandidates.length / bucketCount);
    const end = Math.floor((index + 1) * sortedCandidates.length / bucketCount);
    const bucket = sortedCandidates.slice(start, Math.max(start + 1, end));
    const best = [...bucket].sort((left, right) => {
      const priorityDelta = namedPriority(right) - namedPriority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })[0];
    if (best) {
      addCandidate(best);
    }
  }

  for (const entry of [...sortedCandidates].sort((left, right) => {
    const priorityDelta = namedPriority(right) - namedPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return compareTemporalFactChronology(left, right);
  })) {
    if (selected.size >= input.anchorLimit) {
      break;
    }
    addCandidate(entry);
  }

  for (const anchor of [...selected.values()].sort(compareTemporalFactChronology)) {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companion = input.sourceCandidates
      .filter((entry) => !selected.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        if (
          order === undefined ||
          !hasAssistantAnswerTag(entry) ||
          order <= anchorOrder ||
          order - anchorOrder > input.companionDistance
        ) {
          return false;
        }

        return sourceOrderedSummaryNamedEntityOverlap(
          stripEvidencePrefix(entry.fact.content),
          input.queryNamedTokens,
        ) > 0;
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
