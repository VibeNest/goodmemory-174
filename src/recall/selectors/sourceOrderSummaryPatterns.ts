import {
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "./sourceOrderSummarySignals";

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

export const SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_QUERY_PATTERN =
  /\bwriting\b[\s\S]{0,160}\bprogress(?:ed|ion)?\b[\s\S]{0,160}\bstrategies\b|\bstrategies\b[\s\S]{0,120}\bimprov(?:e|ed|ement|ing)\b[\s\S]{0,80}\bover\s+time\b/iu;

export const SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_QUERY_ZH_PATTERN =
  /(写作|剧本|草稿|编辑|修改)[\s\S]{0,160}(提升|改善|进步|进展|策略|方法|一路|随着时间)/u;

export const SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_MILESTONE_PATTERN =
  /\b(?:Amy[\s\S]{0,80}peer\s+reviews?|peer\s+reviews?[\s\S]{0,80}Amy|Carla's\s+checklist|Grammarly\s+reports?|Jasper\s+AI|ProWritingAid\s+desktop|grammar\s+accuracy[\s\S]{0,60}\d+%|passive\s+voice[\s\S]{0,100}(?:\d+%|active\s+voice|reduc(?:e|ed|ing))|\d+%[\s\S]{0,80}passive\s+voice|tone\s+consistency[\s\S]{0,80}\d+%)/iu;

export const SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_MILESTONE_ZH_PATTERN =
  /(主动语态|被动语态|同行评审|反馈循环|对话清晰度|语气一致|语法准确|写作目标)/u;

export const SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_DISTRACTOR_PATTERN =
  /\b(?:book\s+launch|budget|deadline|literary\s+festival|manual\s+backups?|subscription|version\s+history|word\s+count)\b/iu;

export const SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_DISTRACTOR_ZH_PATTERN =
  /(预算|订阅|截止日期|发布会|手动备份|版本历史|字数|文学节)/u;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_QUERY_PATTERN =
  /\b(?:career|professional|job)\b[\s\S]{0,160}\b(?:philosoph(?:y|ical)|free\s+will|reflection|ethical|determinism|libertarianism|compatibilism)\b|\b(?:philosoph(?:y|ical)|free\s+will|reflection|ethical|determinism|libertarianism|compatibilism)\b[\s\S]{0,160}\b(?:career|professional|job)\b/iu;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_QUERY_ZH_PATTERN =
  /(职业|工作|事业|职业决定|职业选择)[\s\S]{0,160}(哲学|自由意志|决定论|伦理|反思|相容论|自由意志主义)/u;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_MILESTONE_PATTERN =
  /\b(?:professional\s+life[\s\S]{0,80}free\s+will|career\s+choices?[\s\S]{0,80}personal\s+values?|(?:storytelling|emerging\s+talent|documentary\s+filmmaking)[\s\S]{0,140}(?:volunteering|consulting|portfolio|career\s+opportunit(?:y|ies)|passions?)|current\s+(?:\$?85,?000\s+job|job[\s\S]{0,30}\$?85,?000)|\$?95,?000\s+(?:streaming\s+)?startup|startup\s+transition|moving\s+to\s+the\s+startup|transition\s+smoother|lean(?:ing)?\s+towards?\s+the\s+startup|six[-\s]?month\s+probation|probation\s+period|new\s+startup\s+job|new\s+job(?:'s)?\s+onboarding|\$?5,?000\s+freelance|freelance\s+project[\s\S]{0,100}(?:onboarding|new\s+job|opportunity\s+cost)|\$?12,?000\s+bonus|ethical\s+concerns?[\s\S]{0,120}(?:hard\s+determinis(?:m|t)|libertarianism|libertarian\s+perspective|free\s+will)|(?:hard\s+determinis(?:m|t)|libertarianism|libertarian\s+perspective|compatibilism)[\s\S]{0,140}(?:bonus|ethical|ethics|upbringing|environment|free\s+choice|real\s+choice))\b/iu;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_MILESTONE_ZH_PATTERN =
  /(职业选择|职业机会|讲故事|新兴人才|纪录片|创业公司|入职|试用期|自由职业|奖金|伦理|自由意志|决定论|相容论|自由意志主义)/u;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_MILESTONE_PATTERN =
  /\b(?:I\s+(?:decided|lean(?:ed)?|accepted|worried|wonder(?:ed)?|struggl(?:ed|ing)|declin(?:e|ed|ing)|said)|I(?:'ll| will)\s+lean|I'm[\s\S]{0,40}worried|decision\s+to\s+decline|declining[\s\S]{0,40}(?:freelance|bonus|offer)|libertarian\s+perspective[\s\S]{0,120}hard\s+determinist)\b[\s\S]{0,180}\b(?:startup|job|offer|probation|freelance|bonus|ethical|ethics|hard\s+determinis(?:m|t)|libertarianism|upbringing|environment|real\s+choice)\b/iu;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_MILESTONE_ZH_PATTERN =
  /我[\s\S]{0,80}(接受|拒绝|担心|决定|选择)[\s\S]{0,120}(工作|创业公司|奖金|伦理|自由职业|试用期|自由意志|决定论|相容论)/u;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_ANCHOR_PATTERN =
  /\b(?:balance\s+my\s+professional\s+life[\s\S]{0,80}free\s+will|explor(?:ing|e)\s+new\s+opportunities[\s\S]{0,120}(?:passions?|align(?:ed)?|drives?\s+me)|passionate\s+about[\s\S]{0,120}(?:storytelling|emerging\s+talent|volunteering|consulting)|deciding\s+between[\s\S]{0,100}(?:startup|current\s+\$?85,?000\s+job|\$?95,?000\s+offer))\b/iu;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_ANCHOR_ZH_PATTERN =
  /我[\s\S]{0,120}(职业|工作|事业|机会|热情|激情|创业公司|自由意志|讲故事|新兴人才|自由职业|奖金)/u;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_DISTRACTOR_PATTERN =
  /\b(?:bond\s+over\s+our\s+philosophical\s+views|collaboration\s+at\s+work|daily\s+reflection[\s\S]{0,80}gratitude|divine\s+gift|guidance\s+through\s+prayer|decision\s+fatigue|daily\s+choices|30-day\s+experiment)\b/iu;

export const SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_DISTRACTOR_ZH_PATTERN =
  /(祈祷|神圣礼物|感恩|决策疲劳|每日选择|协作基础)/u;

export const SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_QUERY_PATTERN =
  /\b(?:security|auth(?:entication|orization)?|password|csrf|rate\s+limit(?:ing)?|lockout|database|db|sqlite|sqlalchemy|postgres(?:ql)?|transactions?)\b[\s\S]{0,160}\b(?:challeng(?:e|es)|issues?|errors?|problems?|handled|resolved|debug(?:ged|ging)?|fix(?:ed|ing)?)\b|\b(?:challeng(?:e|es)|issues?|errors?|problems?|handled|resolved|debug(?:ged|ging)?|fix(?:ed|ing)?)\b[\s\S]{0,160}\b(?:security|auth(?:entication|orization)?|password|csrf|rate\s+limit(?:ing)?|lockout|database|db|sqlite|sqlalchemy|postgres(?:ql)?|transactions?)\b/iu;

export const SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_QUERY_ZH_PATTERN =
  /(安全|认证|授权|密码|CSRF|限流|锁定|数据库|事务|SQLite|PostgreSQL)[\s\S]{0,160}(挑战|问题|错误|报错|故障|修复|调试|处理)/iu;

export const SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_MILESTONE_PATTERN =
  /\b(?:werkzeug\.security|generate_password_hash|check_password_hash|password\s+hashing|csrf(?:\s+token)?|integrityerror|unique\s+constraint|operationalerror|account\s+lockout|failed\s+login\s+attempts|redis[\s\S]{0,80}rate\s+limit(?:ing)?|rate\s+limit(?:ing)?[\s\S]{0,80}redis)\b/iu;

export const SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_MILESTONE_ZH_PATTERN =
  /(密码哈希|CSRF|唯一约束|数据库错误|操作错误|账号锁定|登录失败|Redis|限流)/iu;

export const SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_DISTRACTOR_PATTERN =
  /\b(?:database\s+schema|flask-login|rest\s+api|pull\s+request|code\s+review|caching\s+tweaks?|dashboard\s+api\s+response\s+time|minimal\s+dependencies|syntax\s+highlighting)\b/iu;

export const SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_DISTRACTOR_ZH_PATTERN =
  /(数据库表结构|代码评审|缓存优化|响应时间|最小依赖|语法高亮)/u;

export const SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_PROJECT_PATTERN =
  /\b(?:app|application|platform|product|project|tracker|website)\b/iu;

export const SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_PROJECT_ZH_PATTERN =
  /(应用|平台|产品|项目|网站|工具|系统)/u;

export const SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_QUERY_FACETS = [
  /\b(?:core\s+functionalit(?:y|ies)|features?|functionality|implemented|implementation|mvp)\b/iu,
  /\b(?:deadline|development\s+timeline|milestones?|sprints?|timeline)\b/iu,
  /\b(?:account\s+lockout|auth(?:entication|orization)?|csrf|hardening|https|rate\s+limit(?:ing)?|security)\b/iu,
  /\b(?:api\s+endpoints?|architecture\s+decisions?|confluence|docs?|document(?:ation|ed|ing)?)\b/iu,
] as const;

export const SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_QUERY_ZH_FACETS = [
  /(核心功能|功能|实现|MVP)/u,
  /(截止|时间线|里程碑|冲刺|阶段)/u,
  /(安全|认证|授权|账号锁定|限流|CSRF|HTTPS|加固)/iu,
  /(文档|记录|接口|API|架构决策|协作)/iu,
] as const;

export const SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_MILESTONE_PATTERN =
  /\b(?:account\s+lockout|api\s+endpoints?|architecture\s+decisions?|basic\s+analytics|confluence|core\s+functionalit(?:y|ies)|data\s+visuali[sz]ation|development\s+timeline|document(?:ation|ed|ing)?|expense\s+tracking|failed\s+login\s+attempts|income\s+(?:and\s+expense\s+)?tracking|mvp\s+(?:deadline|scope)|public\s+launch|rate\s+limit(?:ing)?|redis[\s\S]{0,80}(?:lockout|rate\s+limit(?:ing)?)|security\s+hardening|user\s+(?:authentication|login))\b/iu;

export const SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_MILESTONE_ZH_PATTERN =
  /(核心功能|用户登录|认证|收入支出|数据可视化|基础分析|MVP|截止|时间线|安全加固|账号锁定|登录失败|Redis|限流|接口文档|API|架构决策|Confluence|文档)/iu;

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

export function isSourceOrderedWritingProgressSummaryQuery(query: string): boolean {
  return SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_QUERY_ZH_PATTERN.test(query);
}

export function isSourceOrderedCareerPhilosophySummaryQuery(query: string): boolean {
  return SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_QUERY_ZH_PATTERN.test(query);
}

export function isSourceOrderedTechnicalChallengeSummaryQuery(
  query: string,
): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    (
      SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_QUERY_PATTERN.test(query) ||
      SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_QUERY_ZH_PATTERN.test(query)
    );
}

function countSourceOrderedProjectLifecycleQueryFacets(query: string): number {
  let count = 0;
  for (const pattern of SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_QUERY_FACETS) {
    if (pattern.test(query)) {
      count += 1;
    }
  }
  for (const pattern of SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_QUERY_ZH_FACETS) {
    if (pattern.test(query)) {
      count += 1;
    }
  }
  return count;
}

export function isSourceOrderedProjectLifecycleSummaryQuery(
  query: string,
): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    (
      SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_PROJECT_PATTERN.test(query) ||
      SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_PROJECT_ZH_PATTERN.test(query)
    ) &&
    countSourceOrderedProjectLifecycleQueryFacets(query) >= 3;
}

export function hasSourceOrderedSummaryProjectLifecycleMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_PROJECT_LIFECYCLE_MILESTONE_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryPerformanceGoalMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_PERFORMANCE_GOAL_MILESTONE_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryWritingProgressMilestone(
  content: string,
): boolean {
  if (
    SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_DISTRACTOR_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_DISTRACTOR_ZH_PATTERN.test(content)
  ) {
    return false;
  }

  return SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_WRITING_PROGRESS_MILESTONE_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryCareerPhilosophyMilestone(
  content: string,
): boolean {
  if (
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_DISTRACTOR_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_DISTRACTOR_ZH_PATTERN.test(content)
  ) {
    return false;
  }

  return SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_MILESTONE_ZH_PATTERN.test(content);
}

export function isSourceOrderedSummaryCareerPhilosophyUserMilestone(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_MILESTONE_PATTERN.test(
    content,
  ) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_MILESTONE_ZH_PATTERN.test(
      content,
    );
}

export function isSourceOrderedSummaryCareerPhilosophyUserAnchor(
  content: string,
): boolean {
  if (
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_DISTRACTOR_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_DISTRACTOR_ZH_PATTERN.test(content)
  ) {
    return false;
  }

  return isSourceOrderedSummaryCareerPhilosophyUserMilestone(content) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_ANCHOR_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_CAREER_PHILOSOPHY_USER_ANCHOR_ZH_PATTERN.test(content);
}

export function hasSourceOrderedSummaryTechnicalChallengeMilestone(
  content: string,
): boolean {
  if (
    SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_DISTRACTOR_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_DISTRACTOR_ZH_PATTERN.test(content)
  ) {
    return false;
  }

  return SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_MILESTONE_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_TECHNICAL_CHALLENGE_MILESTONE_ZH_PATTERN.test(content);
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
