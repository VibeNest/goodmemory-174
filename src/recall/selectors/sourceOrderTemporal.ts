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
  dedupeSourceOrderedEvidenceByOrder,
  selectSourceOrderedEvidencePlan,
} from "./sourceOrderPlan";

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

export const SOURCE_ORDER_ASPECT_CUE_PATTERN =
  /\b(?:analytics?|authorization|authentication|blueprints?|completed|configur(?:e|ed|ing|ation)|CRUD|database|deployment|error\s+handling|finalizing|hardening|implement(?:ed|ing)?|integration\s+tests?|local\s+dev|models?|port\s+\d+|response\s+handling|route|schema|security|SQL\s+injection|testing|transaction|validation|worker|XSS)\b/iu;
export const SOURCE_ORDER_ASPECT_TOPIC_TOKENS = new Set([
  "analytics",
  "authentication",
  "authorization",
  "blueprint",
  "completed",
  "configuration",
  "crud",
  "database",
  "deployment",
  "error",
  "gunicorn",
  "handling",
  "hardening",
  "http_endpoint",
  "implementation",
  "integration",
  "local",
  "model",
  "port",
  "render",
  "response",
  "route",
  "schema",
  "security",
  "sql_injection",
  "test",
  "testing",
  "transaction",
  "validation",
  "worker",
  "xss",
]);

export const SOURCE_ORDER_EVENT_MILESTONE_ACTION_PATTERN =
  /\b(?:add(?:ed|ing)?|build(?:ing)?|built|chang(?:e|ed|ing)|cho(?:o|ose|sen|osing)|configur(?:e|ed|ing)|creat(?:e|ed|ing)|debug(?:ged|ging)?|decid(?:e|ed|ing)|deploy(?:ed|ing)?|develop(?:ed|ing)?|fix(?:ed|ing)?|implement(?:ed|ing)?|integrat(?:e|ed|ing)|launch(?:ed|ing)?|migrat(?:e|ed|ing)|optimi[sz](?:e|ed|ing)|plan(?:ned|ning)?|prepar(?:e|ed|ing)|refactor(?:ed|ing)?|resolv(?:e|ed|ing)|set\s+up|switch(?:ed|ing)?|test(?:ed|ing)?|troubleshoot(?:ed|ing)?|updat(?:e|ed|ing)|work(?:ed|ing)\s+on)\b/iu;
export const SOURCE_ORDER_EVENT_MILESTONE_ACTION_ZH_PATTERN =
  /(新增|添加|构建|搭建|改变|选择|配置|创建|调试|决定|部署|开发|修复|实现|集成|上线|迁移|优化|计划|准备|重构|解决|设置|切换|测试|排查|更新|推进|处理|完成)/u;
export const CHINESE_SOURCE_ORDER_ASPECT_ALIASES = [
  {
    pattern: /(用户认证|身份认证|登录|注册|鉴权|授权)/u,
    topics: ["authentication", "authorization"],
  },
  {
    pattern: /(数据库|数据表|schema|模型|表结构)/iu,
    topics: ["database", "schema", "model"],
  },
  {
    pattern: /(部署|上线|发布|生产环境|端口)/u,
    topics: ["deployment"],
  },
  {
    pattern: /(错误处理|异常处理|报错|错误|失败)/u,
    topics: ["error", "handling"],
  },
  {
    pattern: /(接口|路由|端点|请求|响应|HTTP|API)/iu,
    topics: ["route", "http_endpoint", "response"],
  },
  {
    pattern: /(安全|加固|SQL\s*注入|XSS)/iu,
    topics: ["security"],
  },
  {
    pattern: /(测试|回归|集成测试|验证|校验)/u,
    topics: ["test", "testing", "validation"],
  },
  {
    pattern: /(交易|事务|收入|支出|预算)/u,
    topics: ["transaction"],
  },
] as const satisfies ReadonlyArray<{
  pattern: RegExp;
  topics: readonly string[];
}>;

export function isSourceOrderedBroadAspectEventOrderQuery(query: string): boolean {
  if (/\b(?:app|application|code|coding|deploy(?:ment)?|develop(?:ing|ment)?|implementation|project|software)\b/iu.test(query)) {
    return false;
  }
  if (
    !/\b(?:applicant\s+tracking|ATS|linkedin|professional\s+profile|profile|resume|resumes?)\b/iu.test(query) &&
    !/(简历|履历|求职|职业资料|职业档案|领英|个人资料)/u.test(query)
  ) {
    return false;
  }

  return isUserBroughtUpEventOrderQuery(query) &&
    (
      /\b(?:different|various|several)?\s*aspects?\b/iu.test(query) ||
      /\b(?:topics?|items?|parts?)\b[\s\S]{0,120}\bthroughout\b/iu.test(query) ||
      /(不同|多个|几个|各个).{0,20}(方面|主题|事项|内容)/u.test(query)
    );
}

function hasCollaborativeMilestoneSignal(content: string): boolean {
  return /\b(?:collaborat(?:ed|ing)?|conversation\s+with|discuss(?:ed|ing)?\s+with|recommended|shared|suggested|advised)\b[\s\S]{0,120}\b[A-Z][\p{L}'-]+\b/u.test(content) ||
    /\b[A-Z][\p{L}'-]+\b[\s\S]{0,50}\b(?:recommended|shared|suggested|advised)\b/u.test(content) ||
    /\b(?:with|from|by)\s+[A-Z][\p{L}'-]+\b[\s\S]{0,120}\b(?:advice|feedback|insights?|recommend(?:ed|ation)?|suggest(?:ed|ion)?|strategy|update)\b/u.test(content) ||
    /\b(?:feedback|insights?|job descriptions?|keywords?|sections?|strategy)\b[\s\S]{0,120}\bwith\s+[A-Z][\p{L}'-]+\b/u.test(content) ||
    /\bwith\s+[A-Z][\p{L}'-]+\b[\s\S]{0,120}\b(?:add|feedback|keywords?|refin(?:e|ing)|share|sections?)\b/u.test(content) ||
    /(?:建议|推荐|反馈|合作|讨论|分享).{0,80}[\p{Script=Han}A-Z][\p{Script=Han}\p{L}'-]+/u.test(content);
}

function hasNegatedAbsenceSignal(content: string): boolean {
  return /\b(?:never|not|no|without)\b[\s\S]{0,80}\b(?:attended|completed|done|enrolled|finished|had|obtained|used)\b/iu.test(content) ||
    /(从未|没有|没).{0,80}(参加|完成|注册|使用|获得)/u.test(content);
}

function professionalProfileAspectPriorityBonus(content: string): number {
  let priority = 0;

  if (
    /\b(?:applicant\s+tracking|ATS)\b/iu.test(content) &&
    /\b(?:advis(?:e|ed|es|ing)|budget(?:ing)?|network(?:ing)?|partner|strategy)\b/iu.test(content)
  ) {
    priority += 300;
  }
  if (
    /\bjob descriptions?\b/iu.test(content) &&
    /\b(?:feedback|keywords?|refin(?:e|ed|ing)|sections?)\b/iu.test(content)
  ) {
    priority += 220;
  }
  if (
    /\blinkedin\b/iu.test(content) &&
    /\b(?:profile|update|views?|visibility)\b/iu.test(content)
  ) {
    priority += 210;
  }
  if (/\btransferable\s+skills?\b/iu.test(content)) {
    priority += 210;
  }
  if (/\b(?:raise|salary\s+negotiation|salary\s+outcomes?)\b/iu.test(content)) {
    priority += 210;
  }
  if (
    /\b(?:European|international|UK|Canadian)\s+markets?\b/iu.test(content) &&
    /\bresumes?\b/iu.test(content)
  ) {
    priority += 210;
  }
  if (/\baction\s+verb\s+library\b/iu.test(content)) {
    priority -= 90;
  }
  if (
    content.length > 600 ||
    (content.match(/\band\s+I(?:'ve| have)\b/giu)?.length ?? 0) >= 3
  ) {
    priority -= 240;
  }

  return priority;
}

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
  if (hasSourceOrderedEventMilestoneAction(content)) {
    priority += 80;
  }
  if (hasUserAnswerTag(input.entry)) {
    priority += 70;
  }
  if (hasAssistantAnswerTag(input.entry)) {
    priority -= 70;
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
  const sourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: input.entries
      .filter(isSourceOrderedSummaryCandidate)
      .filter((entry) => priority(entry) >= SOURCE_ORDER_EVENT_PLAN_PRIORITY_THRESHOLD),
    priority,
  });
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

  return selectSourceOrderedEvidencePlan({
    anchorLimit: Math.min(requestedCount, SOURCE_ORDER_EVENT_RECALL_LIMIT),
    anchors: selectSourceOrderedEventCoverage({
      count: Math.min(requestedCount, SOURCE_ORDER_EVENT_RECALL_LIMIT),
      entries: anchors,
      priority,
    }),
    companionsPerAnchor: 0,
    limit: Math.min(requestedCount, SOURCE_ORDER_EVENT_RECALL_LIMIT),
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
