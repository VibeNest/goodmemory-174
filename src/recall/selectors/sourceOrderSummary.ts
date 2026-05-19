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
    /(总结|回顾|概述|梳理|汇总).*(随着时间|整个过程|一路|逐步|一步步|怎么|如何|变化|推进|解决)/u.test(query) ||
    isSourceOrderedEvolutionSummaryQuery(query);
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

export const SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_QUERY_PATTERN =
  /\b(?:creative|documentary|episode|film|filming|pilot|post[-\s]?production|screenplay|script|shoot)\b/iu;

export const SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_QUERY_ZH_PATTERN =
  /(创作|纪录片|剧本|拍摄|试播集|后期制作|剪辑|影视|短片|影片)/u;

export const SOURCE_ORDER_SUMMARY_TIMELINE_TASK_QUERY_PATTERN =
  /\b(?:chang(?:e|ed|ing)|develop(?:ed|ing)?|progress(?:ed|ion)?|summary|tasks?|timeline)\b/iu;

export const SOURCE_ORDER_SUMMARY_TIMELINE_TASK_QUERY_ZH_PATTERN =
  /(变化|发展|推进|进展|总结|任务|时间线|一路)/u;

export const SOURCE_ORDER_SUMMARY_EVOLUTION_QUERY_PATTERN =
  /\bhow\s+ha(?:ve|s)\b[\s\S]{0,120}\b(?:chang(?:e|ed|ing)|develop(?:ed|ing)?|evolv(?:e|ed|ing))\b[\s\S]{0,160}\b(?:from|to|over\s+time)\b/iu;

export const SOURCE_ORDER_SUMMARY_EVOLUTION_QUERY_ZH_PATTERN =
  /(怎么|如何|怎样)[\s\S]{0,120}(变化|发展|演进|推进|进展)[\s\S]{0,160}(从|到|一路|逐步|随着)/u;

export const SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_QUERY_PATTERN =
  /\b(?:essay|paper)\b[\s\S]{0,120}\b(?:feedback|goals?|grades?|grading|improvements?|publication|targets?)\b[\s\S]{0,160}\b(?:evolv(?:e|ed|ing)|from|to)\b/iu;

export const SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_QUERY_ZH_PATTERN =
  /(论文|文章)[\s\S]{0,120}(反馈|目标|成绩|评分|发表|投稿|提升)[\s\S]{0,160}(变化|发展|演进|从|到|一路)/u;

export const SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_MILESTONE_PATTERN =
  /\b(?:B-\s+to\s+A|accepted\s+for\s+publication|outline\s+(?:got|only\s+got|rating)|rebuttal\s+techniques[\s\S]{0,120}conference\s+paper\s+editing|workshop\s+feedback[\s\S]{0,80}(?:40%|rebuttal)|82%[\s\S]{0,80}90%[\s\S]{0,80}rubric)\b/iu;

export const SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_MILESTONE_ZH_PATTERN =
  /(B-\s*提升到\s*A|大纲.{0,40}82%|82%.{0,80}90%.{0,80}评分标准|接受发表|被接受发表|研讨会反馈.{0,80}(40%|反驳)|反驳技巧.{0,120}会议论文编辑)/u;

export const SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_QUERY_PATTERN =
  /\b(?:bugs?|debug(?:ged|ging)?|errors?|fix(?:ed|ing)?|issues?|problems?|resolved?|troubleshoot(?:ed|ing)?)\b/iu;

export const SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_QUERY_ZH_PATTERN =
  /(报错|错误|故障|调试|排查|修复|解决|处理|问题|挑战)/u;

export const SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_MILESTONE_PATTERN =
  /\b(?:404|500|bug|classlist|null|debug(?:ged|ging)?|error|exception|fail(?:ed|ing)?|file\s+structure|fix(?:ed|ing)?|layout\s+issue|not\s+loading|path\s+mismatch|referenceerror|retry\s+logic|script\s+(?:path|src)|server\s+logs?|static\s+file|troubleshoot(?:ed|ing)?|typeerror|validateform)\b/iu;

export const SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_MILESTONE_ZH_PATTERN =
  /(404|500|ReferenceError|TypeError|classList|null|报错|错误|故障|无法加载|调试|排查|修复|服务端日志|文件结构|脚本路径|静态文件|路径不匹配|重试|指数退避|链接)/iu;

export const SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_MILESTONE_PATTERN =
  /\b(?:casting|color\s+grading|creative\s+control|deliver(?:y|ed)|editing|episode|filmed|filming|final\s+sound\s+mix|launch\s+week|location\s+scouting|marketing\s+prep|pilot|post[-\s]?production|scene|script\s+finali[sz]ation|sound\s+mix)\b/iu;

export const SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_MILESTONE_ZH_PATTERN =
  /(试播集|剧本定稿|外景勘景|选角|交付日期|场景|拍完|拍摄|后期制作|剪辑|调色|最终混音|混音|上线周|营销准备|创作控制)/u;

export const SOURCE_ORDER_SUMMARY_LEARNING_PROGRESS_QUERY_PATTERN =
  /\b(?:concepts?|grasp|learn(?:ed|ing)?|understanding)\b.*\b(?:chang(?:e|ed|ing)|develop(?:ed|ing)?|evolv(?:e|ed|ing)|progress(?:ed|ion)?|through(?:out)?|over\s+time)\b/iu;

export const SOURCE_ORDER_SUMMARY_LEARNING_PROGRESS_QUERY_ZH_PATTERN =
  /(理解|学习|概念|掌握).*(变化|发展|演进|推进|进展|一步步|逐步|一路)/u;

export const SOURCE_ORDER_SUMMARY_LEARNING_MILESTONE_PATTERN =
  /\b(?:calculate|calculation|clarif(?:y|ied)|coin\s+toss(?:es)?|concepts?|conditional|dice|explain(?:ed|ing)?|favo(?:u)?rable\s+outcomes?|formula|independent|learn(?:ed|ing)?|mutually\s+exclusive|probability|ratio|total\s+outcomes?|understand(?:ing)?)\b|P\(A\|B\)/iu;

export const SOURCE_ORDER_SUMMARY_LEARNING_MILESTONE_ZH_PATTERN =
  /(学习|理解|概念|解释|计算|公式|概率|比率|有利结果|总结果|抛硬币|掷骰子|独立事件|互斥事件|条件概率)/u;

export const SOURCE_ORDER_SUMMARY_INSTRUCTION_LIKE_PATTERN =
  /^(?:always|never|please\s+always)\b/iu;

export const SOURCE_ORDER_SUMMARY_INSTRUCTION_LIKE_ZH_PATTERN =
  /^(?:总是|每次|以后|请总是)/u;

export function isSourceOrderedCreativeProjectTimelineQuery(
  query: string,
): boolean {
  return (
    SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_QUERY_PATTERN.test(query) &&
    SOURCE_ORDER_SUMMARY_TIMELINE_TASK_QUERY_PATTERN.test(query)
  ) ||
    (
      SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_QUERY_ZH_PATTERN.test(query) &&
      SOURCE_ORDER_SUMMARY_TIMELINE_TASK_QUERY_ZH_PATTERN.test(query)
    );
}

export function isSourceOrderedEvolutionSummaryQuery(query: string): boolean {
  return SOURCE_ORDER_SUMMARY_EVOLUTION_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_SUMMARY_EVOLUTION_QUERY_ZH_PATTERN.test(query);
}

export function isSourceOrderedPerformanceGoalEvolutionQuery(
  query: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_QUERY_ZH_PATTERN.test(query);
}

export function hasSourceOrderedSummaryPerformanceGoalMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_MILESTONE_ZH_PATTERN.test(content);
}

export function isSourceOrderedIssueResolutionSummaryQuery(
  query: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_QUERY_ZH_PATTERN.test(query);
}

export function hasSourceOrderedSummaryIssueResolutionMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_ISSUE_RESOLUTION_MILESTONE_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryCreativeProjectMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_CREATIVE_PROJECT_MILESTONE_ZH_PATTERN.test(content);
}

export function isSourceOrderedLearningProgressionQuery(query: string): boolean {
  return SOURCE_ORDER_SUMMARY_LEARNING_PROGRESS_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_SUMMARY_LEARNING_PROGRESS_QUERY_ZH_PATTERN.test(query);
}

export function hasSourceOrderedSummaryLearningMilestone(content: string): boolean {
  return SOURCE_ORDER_SUMMARY_LEARNING_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_LEARNING_MILESTONE_ZH_PATTERN.test(content);
}

export function isSourceOrderedSummaryInstructionLike(content: string): boolean {
  const normalized = content.trim();
  return SOURCE_ORDER_SUMMARY_INSTRUCTION_LIKE_PATTERN.test(normalized) ||
    SOURCE_ORDER_SUMMARY_INSTRUCTION_LIKE_ZH_PATTERN.test(normalized);
}

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
    isSourceOrderedCreativeProjectTimelineQuery(input.query) &&
    hasSourceOrderedSummaryCreativeProjectMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedLearningProgressionQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryLearningMilestone(content)
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
  const creativeProjectTimelineCandidates =
    isSourceOrderedCreativeProjectTimelineQuery(input.query)
      ? sourceCandidates.filter((entry) =>
        hasSourceOrderedSummaryCreativeProjectMilestone(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      : [];
  const learningProgressionCandidates =
    isSourceOrderedLearningProgressionQuery(input.query)
      ? sourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryLearningMilestone(content);
      })
      : [];
  const performanceGoalEvolutionCandidates =
    isSourceOrderedPerformanceGoalEvolutionQuery(input.query)
      ? sourceCandidates.filter((entry) =>
        hasUserAnswerTag(entry) &&
        hasSourceOrderedSummaryPerformanceGoalMilestone(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      : [];
  const issueResolutionCandidates =
    isSourceOrderedIssueResolutionSummaryQuery(input.query)
      ? sourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryIssueResolutionMilestone(content);
      })
      : [];
  let primaryCandidates = signaledCandidates;
  let preferEarliestPrimaryCandidates = false;
  let skipCompanionSelection = false;
  if (milestoneCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS) {
    primaryCandidates = milestoneCandidates;
  }
  if (
    coreMilestoneCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = coreMilestoneCandidates;
  }
  if (
    creativeProjectTimelineCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = creativeProjectTimelineCandidates;
  }
  if (
    learningProgressionCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = learningProgressionCandidates;
    preferEarliestPrimaryCandidates = true;
  }
  if (
    performanceGoalEvolutionCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = performanceGoalEvolutionCandidates;
    preferEarliestPrimaryCandidates = true;
    skipCompanionSelection = true;
  }
  if (
    issueResolutionCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    primaryCandidates = issueResolutionCandidates;
    preferEarliestPrimaryCandidates = true;
    skipCompanionSelection = false;
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

  if (preferEarliestPrimaryCandidates) {
    for (const entry of primaryCandidates.slice(
      0,
      SOURCE_ORDER_SUMMARY_RECALL_LIMIT,
    )) {
      addCandidate(entry);
    }
  } else {
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
  }

  if (!preferEarliestPrimaryCandidates) {
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
  }

  const anchors = [...selected.values()].sort(compareTemporalFactChronology);
  if (skipCompanionSelection) {
    return anchors;
  }

  for (const anchor of anchors) {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const alreadyHasDirectionalCompanion = [...selected.values()].some(
      (entry) => {
        if (entry.fact.id === anchor.fact.id) {
          return false;
        }
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          (
            (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(entry) &&
              order > anchorOrder) ||
            (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(entry) &&
              order < anchorOrder)
          );
      },
    );
    if (alreadyHasDirectionalCompanion) {
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
        const leftDirectional =
          (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(left) &&
            leftOrder > anchorOrder) ||
          (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(left) &&
            leftOrder < anchorOrder);
        const rightDirectional =
          (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(right) &&
            rightOrder > anchorOrder) ||
          (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(right) &&
            rightOrder < anchorOrder);
        if (leftDirectional !== rightDirectional) {
          return leftDirectional ? -1 : 1;
        }
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
