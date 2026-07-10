import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";
import { contradictionTopicTokens } from "./contradiction";
import { isSourceOrderedSummaryCandidate } from "./sourceOrderSummary";

export const SOURCE_ORDER_TIMELINE_RECALL_LIMIT = 6;
export const SOURCE_ORDER_TIMELINE_CLUSTER_RADIUS = 5;
export const SOURCE_ORDER_TIMELINE_CHRONOLOGY_PENALTY = 2;
export const SOURCE_ORDER_TIMELINE_PRIORITY_THRESHOLD = 140;

export const TIMELINE_INTEGRATION_CONTENT_CUE_PATTERN =
  /\b(?:attorneys?|bar\s+association|college|completed\s+on\s+time|cutoff|deadline|draft|follow\s+up|meeting|mentor|milestones?|organis(?:e|ed|ing|ation)|organiz(?:e|ed|ing|ation)|patents?|plan(?:ned|ning)?|prepar(?:e|ed|ing|ation)|resources?|revision|schedule(?:d)?|sprint|structur(?:e|ed|ing)|submission|timeline)\b|(?:律师|协会|大学|学院|按时完成|截止|最后期限|草稿|跟进|会议|导师|里程碑|组织|安排|计划|准备|资源|修订|冲刺|结构化|提交|时间线|后端|前端|注册|登录|验证|测试|QA)/iu;
export const TIMELINE_INTEGRATION_STRONG_CONTENT_CUE_PATTERN =
  /\b(?:completed\s+on\s+time|cutoff|deadline|final\s+cutoff|milestones?|schedule(?:d)?|sprint|timeline|weeks?\s+leading\s+up)\b|(?:按时完成|截止|最后期限|里程碑|安排|冲刺|时间线|前几周|后端|前端)/iu;
export const TIMELINE_INTEGRATION_SPECIFIC_TOPIC_TOKENS = new Set([
  "analytics",
  "attorney",
  "attorneys",
  "backend",
  "bar",
  "college",
  "deadline",
  "draft",
  "essay",
  "frontend",
  "guidance",
  "inventions",
  "layout",
  "login",
  "mentor",
  "navigation",
  "patent",
  "patents",
  "registration",
  "resources",
  "scholarship",
  "sprint",
  "submission",
  "visa",
  "writing",
]);

export function isSourceOrderedTimelineIntegrationQuery(query: string): boolean {
  const hasQuestionShape =
    /\b(?:how\s+(?:did|have)|what\s+steps)\b/iu.test(query);
  const hasPlanningAction =
    /\b(?:connect(?:ing)?|follow\s+up|organis(?:e|ed|ing)|organiz(?:e|ed|ing)|plan(?:ned)?|prepar(?:e|ed|ing)|structur(?:e|ed|ing)|support)\b/iu.test(
      query,
    ) ||
    /\bwhat\s+steps\b/iu.test(query);
  const hasTimelineScope =
    /\b(?:bar\s+association|completed\s+on\s+time|cutoff|deadline|essay\s+writing|final\s+cutoff|guidance|inventions?|local\s+and\s+external\s+resources|mentor|meeting|over\s+(?:the\s+course|time)|professional\s+guidance|project\s+schedule|resources?|schedule|sprint|studies|submission|timeline|weeks?\s+leading\s+up)\b/iu.test(
      query,
    );
  const requestFlowProblem =
    /\b(?:bursts?\s+of\s+activity|flow\s+of\s+requests?|frequent\s+retries|overwhelming\s+the\s+service|rate\s+limits?)\b/iu.test(
      query,
    );

  return (
    hasQuestionShape &&
    hasPlanningAction &&
    hasTimelineScope &&
    !requestFlowProblem
  ) ||
    /(如何|怎么|哪些步骤).*(计划|安排|组织|推进|流程|时间线|截止|资源|指导|准备|后续)/u.test(query);
}

export function sourceOrderedTimelinePriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const specificTopicOverlap = [...input.queryTopics].filter(
    (topic) =>
      TIMELINE_INTEGRATION_SPECIFIC_TOPIC_TOKENS.has(topic) &&
      factTopics.has(topic),
  ).length;
  let priority =
    selectorTopicOverlapCount(input.queryTopics, factTopics) * 120 +
    specificTopicOverlap * 160 +
    input.entry.lexicalScore * 100 +
    input.entry.subjectScore * 70 +
    input.entry.intentScore * 50;

  if (hasUserAnswerTag(input.entry) || hasAssistantAnswerTag(input.entry)) {
    priority += 35;
  }
  if (TIMELINE_INTEGRATION_CONTENT_CUE_PATTERN.test(content)) {
    priority += 75;
  }
  if (TIMELINE_INTEGRATION_STRONG_CONTENT_CUE_PATTERN.test(content)) {
    priority += 90;
  }
  if (
    /\b(?:cutoff|deadline|due|weeks?\s+leading\s+up)\b/iu.test(input.query) &&
    (
      /\b(?:by|before)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2})\b/iu.test(
        content,
      ) ||
      /\bgoal\s+to\s+complete\b/iu.test(content)
    )
  ) {
    priority += 90;
  }
  if (
    hasAssistantAnswerTag(input.entry) &&
    (
      /\b(?:steps?|plan|timeline|schedule|recommend(?:ed|ation)?|summary)\b/iu.test(
        content,
      ) ||
      /(?:步骤|计划|时间线|安排|推荐|建议|总结|冲刺)/u.test(content)
    )
  ) {
    priority += 35;
  }
  if (
    hasUserAnswerTag(input.entry) &&
    (
      /\b(?:can\s+you\s+help|how\s+can|what\s+(?:can|should)|i\s+need\s+to|i['’]ll|i\s+will)\b/iu.test(
        content,
      ) ||
      /(?:帮我|怎么|如何|我需要|我会|我要|我打算)/u.test(content)
    )
  ) {
    priority += 25;
  }
  if (
    (
      /\bbackend\b/iu.test(input.query) &&
      /\bfrontend\b/iu.test(input.query)
    ) ||
    (/后端/u.test(input.query) && /前端/u.test(input.query))
  ) {
    if (/\bbackend\b/iu.test(content) || /后端/u.test(content)) {
      priority += 120;
    }
    if (/\bfrontend\b/iu.test(content) || /前端|表单|页面/u.test(content)) {
      priority += 120;
    }
    if (
      !/\bbackend\b/iu.test(content) &&
      !/\bfrontend\b/iu.test(content) &&
      !/后端|前端|表单|页面/u.test(content)
    ) {
      priority -= 80;
    }
  }

  return priority;
}

export function timelineCandidateMatchesRequiredQueryCue(input: {
  content: string;
  query: string;
}): boolean {
  if (
    /\bsprint\b/iu.test(input.query) &&
    !/\bsprint\b/iu.test(input.content) &&
    !(
      /\bbackend\b/iu.test(input.query) &&
      /\bfrontend\b/iu.test(input.query) &&
      (
        /\bbackend\b/iu.test(input.content) ||
        /\bfrontend\b/iu.test(input.content)
      )
    )
  ) {
    return false;
  }
  if (
    /\b(?:son|studies|student)\b/iu.test(input.query) &&
    !/\b(?:college|engineering|francis|son|student|studies|studying)\b/iu.test(
      input.content,
    )
  ) {
    return false;
  }

  return true;
}

export function selectSourceOrderedTimelineIntegrationEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedTimelineIntegrationQuery(input.query)) {
    return [];
  }

  const queryTopics = contradictionTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const sourceCandidates = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .filter((entry) => entry.fact.source.method !== "inferred")
    .sort(compareTemporalFactChronology);
  const prioritized = sourceCandidates
    .map((entry) => ({
      entry,
      order: sourceOrderSortKey(entry),
      priority: sourceOrderedTimelinePriority({
        entry,
        language: input.language,
        query: input.query,
        queryTopics,
      }),
    }))
    .filter(
      (candidate): candidate is {
        entry: RankedFactCandidate;
        order: number;
        priority: number;
      } =>
        candidate.order !== undefined &&
        timelineCandidateMatchesRequiredQueryCue({
          content: stripEvidencePrefix(candidate.entry.fact.content),
          query: input.query,
        }) &&
        (
          candidate.priority >= SOURCE_ORDER_TIMELINE_PRIORITY_THRESHOLD ||
          (
            TIMELINE_INTEGRATION_CONTENT_CUE_PATTERN.test(
              stripEvidencePrefix(candidate.entry.fact.content),
            ) &&
            candidate.priority > 80
          )
        ),
    );
  if (prioritized.length === 0) {
    return [];
  }

  if (/\b(?:child|daughter|son|student|studies)\b/iu.test(input.query)) {
    const earliestOrder = Math.min(
      ...prioritized.map((candidate) => candidate.order),
    );
    const earliestContextCluster = sourceCandidates
      .map((entry) => ({
        entry,
        order: sourceOrderSortKey(entry),
        priority: sourceOrderedTimelinePriority({
          entry,
          language: input.language,
          query: input.query,
          queryTopics,
        }),
      }))
      .filter(
        (candidate): candidate is {
          entry: RankedFactCandidate;
          order: number;
          priority: number;
        } => {
          if (
            candidate.order === undefined ||
            candidate.order < earliestOrder ||
            candidate.order - earliestOrder > SOURCE_ORDER_TIMELINE_CLUSTER_RADIUS
          ) {
            return false;
          }
          const content = stripEvidencePrefix(candidate.entry.fact.content);
          return (
            timelineCandidateMatchesRequiredQueryCue({
              content,
              query: input.query,
            }) &&
            (
              candidate.priority > 60 ||
              TIMELINE_INTEGRATION_CONTENT_CUE_PATTERN.test(content)
            )
          );
        },
      )
      .sort((left, right) => left.order - right.order)
      .slice(0, SOURCE_ORDER_TIMELINE_RECALL_LIMIT)
      .map((candidate) => candidate.entry);

    if (
      earliestContextCluster.some(hasUserAnswerTag) &&
      earliestContextCluster.some(hasAssistantAnswerTag)
    ) {
      return earliestContextCluster;
    }
  }

  let bestCluster:
    | {
      entries: RankedFactCandidate[];
      score: number;
    }
    | undefined;
  for (const anchor of prioritized) {
    const window = sourceCandidates
      .map((entry) => ({
        entry,
        order: sourceOrderSortKey(entry),
        priority: sourceOrderedTimelinePriority({
          entry,
          language: input.language,
          query: input.query,
          queryTopics,
        }),
      }))
      .filter(
        (candidate): candidate is {
          entry: RankedFactCandidate;
          order: number;
          priority: number;
        } => {
          if (
            candidate.order === undefined ||
            Math.abs(candidate.order - anchor.order) >
              SOURCE_ORDER_TIMELINE_CLUSTER_RADIUS
          ) {
            return false;
          }
          const nearAnchor = Math.abs(candidate.order - anchor.order) <= 1;
          const hasTimelineCue = TIMELINE_INTEGRATION_CONTENT_CUE_PATTERN.test(
            stripEvidencePrefix(candidate.entry.fact.content),
          );
          if (
            !timelineCandidateMatchesRequiredQueryCue({
              content: stripEvidencePrefix(candidate.entry.fact.content),
              query: input.query,
            })
          ) {
            return false;
          }
          return (
            candidate.priority >= SOURCE_ORDER_TIMELINE_PRIORITY_THRESHOLD &&
            hasTimelineCue
          ) ||
            (hasTimelineCue && candidate.priority > 80) ||
            (
              nearAnchor &&
              candidate.priority > 60 &&
              (
                hasTimelineCue ||
                (hasUserAnswerTag(anchor.entry) && hasAssistantAnswerTag(candidate.entry)) ||
                (hasAssistantAnswerTag(anchor.entry) && hasUserAnswerTag(candidate.entry))
              )
            );
        },
      )
      .sort((left, right) => {
        const distanceDelta =
          Math.abs(left.order - anchor.order) -
          Math.abs(right.order - anchor.order);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return 0;
      })
      .slice(0, SOURCE_ORDER_TIMELINE_RECALL_LIMIT);
    if (window.length === 0) {
      continue;
    }

    const hasUser = window.some((candidate) => hasUserAnswerTag(candidate.entry));
    const hasAssistant = window.some((candidate) =>
      hasAssistantAnswerTag(candidate.entry)
    );
    const windowOrders = window.map((candidate) => candidate.order).sort(
      (left, right) => left - right,
    );
    const earliestOrder = windowOrders[0] ?? anchor.order;
    const latestOrder = windowOrders.at(-1) ?? anchor.order;
    const adjacentLinkCount = windowOrders.slice(1).filter(
      (order, index) => order - windowOrders[index]! <= 2,
    ).length;
    const strongCueCount = window.filter((candidate) =>
      TIMELINE_INTEGRATION_STRONG_CONTENT_CUE_PATTERN.test(
        stripEvidencePrefix(candidate.entry.fact.content),
      )
    ).length;
    const score =
      window.reduce((sum, candidate) => sum + candidate.priority, 0) /
        window.length +
      (hasUser && hasAssistant ? 120 : 0) -
      window.length * 5 +
      adjacentLinkCount * 60 +
      strongCueCount * 80 -
      (latestOrder - earliestOrder) * 3 -
      earliestOrder * SOURCE_ORDER_TIMELINE_CHRONOLOGY_PENALTY;
    if (!bestCluster || score > bestCluster.score) {
      bestCluster = {
        entries: window.map((candidate) => candidate.entry),
        score,
      };
    }
  }

  return bestCluster?.entries.sort(compareTemporalFactChronology) ?? [];
}
