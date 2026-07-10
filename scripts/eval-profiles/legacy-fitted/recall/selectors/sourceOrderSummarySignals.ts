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

export const SOURCE_ORDER_SUMMARY_INSTRUCTION_LIKE_PATTERN =
  /^(?:always|never|please\s+always)\b/iu;

export const SOURCE_ORDER_SUMMARY_INSTRUCTION_LIKE_ZH_PATTERN =
  /^(?:总是|每次|以后|请总是)/u;

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
