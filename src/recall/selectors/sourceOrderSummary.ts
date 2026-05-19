import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD,
  hasAssistantAnswerTag,
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";
import { contradictionTopicTokens } from "./contradiction";

export const SOURCE_ORDER_SUMMARY_RECALL_LIMIT = 16;
export const SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT = 8;
export const SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE = 1;
export const SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS = 4;

export function isSourceOrderedConversationSummaryQuery(query: string): boolean {
  return (
    /\b(?:summari[sz]e|summary|recap|overview)\b/iu.test(query) &&
    /\b(?:across|approached|changed|developed|evolved|navigated|over\s+time|progress(?:ed)?|resolved|throughout|various)\b/iu.test(
      query,
    )
  ) ||
    /(总结|回顾|概述|梳理|汇总).*(随着时间|整个过程|一路|逐步|一步步|怎么|如何|变化|推进|解决)/u.test(query);
}

export const SOURCE_ORDER_SUMMARY_LOW_INFORMATION_FOLLOWUP_PATTERN =
  /^(?:hmm|hm|okay|ok|also|and\s+what|what\s+about|which\s+one|can\s+i\s+use|could\s+i\s+use|should\s+i\s+use|do\s+i\s+need)\b/iu;

export const SOURCE_ORDER_SUMMARY_LOW_INFORMATION_FOLLOWUP_ZH_PATTERN =
  /^(?:嗯|呃|那|还有|另外|顺便|哪个|哪一个|我能不能|可以用|能用|该不该|要不要|需要不需要)/u;

export const SOURCE_ORDER_SUMMARY_MILESTONE_ACTION_PATTERN =
  /\b(?:add(?:ed|ing)?|build(?:ing)?|built|configur(?:e|ed|ing)|creat(?:e|ed|ing)|debug(?:ged|ging)?|develop(?:ed|ing)?|fix(?:ed|ing)?|implement(?:ed|ing)?|improv(?:e|ed|ing)|integrat(?:e|ed|ing)|launch(?:ed|ing)?|migrat(?:e|ed|ing)|optimi[sz](?:e|ed|ing)|plan(?:ned|ning)?|prepar(?:e|ed|ing)|refactor(?:ed|ing)?|resolv(?:e|ed|ing)|set\s+up|setting\s+up|switch(?:ed|ing)?|test(?:ed|ing)?|troubleshoot(?:ed|ing)?|updat(?:e|ed|ing)|work(?:ed|ing)\s+on)\b/iu;

export const SOURCE_ORDER_SUMMARY_MILESTONE_ACTION_ZH_PATTERN =
  /(添加|新增|构建|搭建|创建|调试|开发|修复|实现|改进|改善|集成|上线|迁移|优化|计划|准备|重构|解决|设置|切换|测试|排查|更新|推进|处理|完成|设计)/u;

export const SOURCE_ORDER_SUMMARY_MILESTONE_SCOPE_PATTERN =
  /\b(?:api|app|application|backend|budget|challenge|component|contact\s+form|dashboard|database|deadline|feature|form|gallery|issue|layout|milestone|mvp|performance|preparation|project|section|seo|sprint|strategy|validation|website|workflow)\b/iu;

export const SOURCE_ORDER_SUMMARY_MILESTONE_SCOPE_ZH_PATTERN =
  /(项目|应用|网站|功能|组件|表单|画廊|图库|布局|问题|挑战|数据库|后端|前端|性能|准备|策略|验证|工作流|流程|冲刺|阶段|截止|预算|API|接口|安全|部署|上线)/u;

export const SOURCE_ORDER_SUMMARY_CORE_FEATURE_PATTERN =
  /\b(?:backend\s+integration|color\s+palette|contact\s+form|feature|gallery|mvp|sections?|sprint|validation)\b/iu;

export const SOURCE_ORDER_SUMMARY_CORE_FEATURE_ZH_PATTERN =
  /(核心功能|联系表单|表单验证|画廊|图库|布局|功能|后端集成|前端|后端|阶段|冲刺|栏目|章节|预算|数据库|部署|安全)/u;

export function hasSourceOrderedSummaryMilestoneAction(content: string): boolean {
  return SOURCE_ORDER_SUMMARY_MILESTONE_ACTION_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_MILESTONE_ACTION_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryMilestoneScope(content: string): boolean {
  return SOURCE_ORDER_SUMMARY_MILESTONE_SCOPE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_MILESTONE_SCOPE_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryCoreFeature(content: string): boolean {
  return SOURCE_ORDER_SUMMARY_CORE_FEATURE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_CORE_FEATURE_ZH_PATTERN.test(content);
}

export function isLowInformationSourceSummaryFollowUp(content: string): boolean {
  return SOURCE_ORDER_SUMMARY_LOW_INFORMATION_FOLLOWUP_PATTERN.test(
    content.trim(),
  ) || SOURCE_ORDER_SUMMARY_LOW_INFORMATION_FOLLOWUP_ZH_PATTERN.test(
    content.trim(),
  );
}

export function isSourceOrderedSummaryCandidate(entry: RankedFactCandidate): boolean {
  return hasSourceMessageTag(entry) && sourceOrderSortKey(entry) !== undefined;
}

export function sourceOrderedSummaryPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let priority =
    selectorTopicOverlapCount(input.queryTopics, factTopics) * 120 +
    input.entry.lexicalScore * 100 +
    input.entry.subjectScore * 70 +
    input.entry.intentScore * 50;

  if (hasUserAnswerTag(input.entry) || hasAssistantAnswerTag(input.entry)) {
    priority += 40;
  }
  if (
    /\b(?:challenge|debug(?:ged|ging)?|decision|error|fix(?:ed|ing)?|issue|problem|progress|reflect(?:ed|ion|ions)?|resolv(?:e|ed|ing)|solution)\b/iu.test(
      content,
    )
  ) {
    priority += 35;
  }
  if (/(问题|挑战|错误|报错|修复|解决|推进|进展|决策|调试|实现|处理)/u.test(content)) {
    priority += 35;
  }
  if (
    hasUserAnswerTag(input.entry) &&
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryMilestoneScope(content)
  ) {
    priority += 90;
  }
  if (
    hasUserAnswerTag(input.entry) &&
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) {
    priority += 45;
  }
  if (isLowInformationSourceSummaryFollowUp(content)) {
    priority -= 180;
  }

  return priority;
}

export function hasSourceOrderedSummarySignal(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);

  if (
    input.entry.intentScore > 0 ||
    input.entry.subjectScore > 0 ||
    input.entry.lexicalScore >= EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD ||
    topicOverlap > 0
  ) {
    return true;
  }

  if (
    /\b(?:issue|problem|challenge|resolved|approached)\b/iu.test(input.query) &&
    /\b(?:debug(?:ged|ging)?|error|fix(?:ed|ing)?|issue|problem|resolv(?:e|ed|ing)|solution)\b/iu.test(
      content,
    )
  ) {
    return true;
  }

  if (
    /(问题|挑战|解决|处理|推进|一步步|怎么|如何)/u.test(input.query) &&
    /(问题|挑战|错误|报错|修复|解决|方案|调试|实现|处理|设计|数据库|schema|部署|上线|加固)/iu.test(content)
  ) {
    return true;
  }

  return false;
}

export function isSourceOrderedSummaryMilestoneCandidate(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (!hasUserAnswerTag(input.entry)) {
    return false;
  }

  const content = stripEvidencePrefix(input.entry.fact.content);
  if (isLowInformationSourceSummaryFollowUp(content)) {
    return false;
  }

  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);
  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) {
    return true;
  }
  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryMilestoneScope(content) &&
    topicOverlap >= 1
  ) {
    return true;
  }
  if (
    topicOverlap === 0 &&
    input.entry.intentScore === 0 &&
    input.entry.subjectScore === 0 &&
    input.entry.lexicalScore < EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD
  ) {
    return false;
  }

  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    (
      hasSourceOrderedSummaryMilestoneScope(content) ||
      topicOverlap >= 2
    )
  ) {
    return true;
  }

  return /(开始|实现|搭建|集成|修复|调试|解决|推进|计划|准备|更新|优化|重构|迁移).*(项目|功能|问题|挑战|表单|画廊|网站|应用|策略|计划|截止)/u.test(
    content,
  );
}

export function isSourceOrderedSummaryCoreMilestoneCandidate(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (!hasUserAnswerTag(input.entry)) {
    return false;
  }

  const content = stripEvidencePrefix(input.entry.fact.content);
  if (isLowInformationSourceSummaryFollowUp(content)) {
    return false;
  }

  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);
  if (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) {
    return true;
  }
  if (
    topicOverlap === 0 &&
    input.entry.intentScore === 0 &&
    input.entry.subjectScore === 0 &&
    input.entry.lexicalScore < EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD
  ) {
    return false;
  }

  return (
    hasSourceOrderedSummaryMilestoneAction(content) &&
    hasSourceOrderedSummaryCoreFeature(content)
  ) ||
    /(实现|搭建|集成|修复|调试|解决|推进|计划|准备|更新|优化|部署|完成).*(功能|表单|画廊|图库|布局|后端|前端|数据库|冲刺|阶段|部署|安全)/u.test(
      content,
    );
}

export function selectSourceOrderedSummaryCoverage(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedConversationSummaryQuery(input.query)) {
    return [];
  }

  const queryTopics = contradictionTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const sourceCandidates = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .sort(compareTemporalFactChronology);
  const signaledCandidates = sourceCandidates.filter((entry) =>
    hasSourceOrderedSummarySignal({
      entry,
      language: input.language,
      query: input.query,
      queryLocale: input.queryLocale,
      queryTopics,
    })
  );
  if (signaledCandidates.length === 0) {
    return [];
  }

  const milestoneCandidates = sourceCandidates.filter((entry) =>
    isSourceOrderedSummaryMilestoneCandidate({
      entry,
      language: input.language,
      queryTopics,
    })
  );
  const coreMilestoneCandidates = milestoneCandidates.filter((entry) =>
    isSourceOrderedSummaryCoreMilestoneCandidate({
      entry,
      language: input.language,
      queryTopics,
    })
  );
  let primaryCandidates = signaledCandidates;
  if (milestoneCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS) {
    primaryCandidates = milestoneCandidates;
  }
  if (
    coreMilestoneCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = coreMilestoneCandidates;
  }
  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      selected.set(entry.fact.id, entry);
    }
  };
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderedSummaryPriority({
      entry,
      language: input.language,
      queryTopics,
    });
  const anchorCount = Math.min(
    SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT,
    Math.ceil(SOURCE_ORDER_SUMMARY_RECALL_LIMIT / 2),
    primaryCandidates.length,
  );

  for (let index = 0; index < anchorCount; index += 1) {
    const start = Math.floor(index * primaryCandidates.length / anchorCount);
    const end = Math.floor((index + 1) * primaryCandidates.length / anchorCount);
    const bucket = primaryCandidates.slice(start, Math.max(start + 1, end));
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

  for (const entry of [...primaryCandidates].sort((left, right) => {
    const priorityDelta = priority(right) - priority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return compareTemporalFactChronology(left, right);
  })) {
    if (selected.size >= anchorCount) {
      break;
    }
    addCandidate(entry);
  }

  const anchors = [...selected.values()].sort(compareTemporalFactChronology);
  for (const anchor of anchors) {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companions = sourceCandidates
      .filter((entry) => !selected.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          Math.abs(order - anchorOrder) <= SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE &&
          (
            (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(entry)) ||
            (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(entry))
          );
      })
      .sort((left, right) => {
        const leftOrder = sourceOrderSortKey(left) ?? 0;
        const rightOrder = sourceOrderSortKey(right) ?? 0;
        const distanceDelta =
          Math.abs(leftOrder - anchorOrder) - Math.abs(rightOrder - anchorOrder);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    const companion = companions[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
