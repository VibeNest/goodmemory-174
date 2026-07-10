import type { LanguageService } from "../../../language";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import {
  CHINESE_SOURCE_ORDER_ASPECT_ALIASES,
  hasCollaborativeMilestoneSignal,
  hasNegatedAbsenceSignal,
  professionalProfileAspectPriorityBonus,
  SOURCE_ORDER_ASPECT_CUE_PATTERN,
  SOURCE_ORDER_ASPECT_TOPIC_TOKENS,
  SOURCE_ORDER_FRAMEWORK_ASPECT_ALIASES,
} from "../sourceOrderTemporalSignals";
import {
  temporalOrderEvidencePriority,
} from "../temporal";
import { selectorTopicOverlapCount, selectorTopicTokens } from "../topic";

export const SOURCE_ORDER_GAP_FILL_LIMIT = 5;
export const SOURCE_ORDER_COMPANION_LIMIT = 6;
export const SOURCE_ORDER_COMPANION_MAX_DISTANCE = 2;
export const SOURCE_ORDER_MILESTONE_FILL_LIMIT = 6;

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
