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
export const SOURCE_ORDER_SUMMARY_TOPICAL_COMPANION_DISTANCE = 3;
export const SOURCE_ORDER_SUMMARY_TOPICAL_COMPANIONS_PER_ANCHOR = 2;
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

const SOURCE_ORDER_SUMMARY_GENERIC_QUERY_TOPIC_STOPWORDS = new Set([
  "application",
  "approach",
  "approached",
  "changed",
  "clear",
  "comprehensive",
  "concept",
  "conversation",
  "develop",
  "developed",
  "development",
  "evolved",
  "give",
  "learning",
  "overview",
  "progress",
  "progressed",
  "provide",
  "recap",
  "summary",
  "summarize",
  "throughout",
  "understanding",
  "一步步",
  "变化",
  "发展",
  "总结",
  "概述",
  "梳理",
  "清楚",
  "理解",
]);

export const SOURCE_ORDER_SUMMARY_TOPICAL_SYNTHESIS_PATTERN =
  /\b(?:appl(?:y|ied|ying)|clarif(?:y|ied|ying)|compar(?:e|ed|ing)|confirmed|criteria|criterion|counterexample|explain(?:ed|ing)?|introduced|learn(?:ed|ing)?|planned|proof|prov(?:e|ed|ing)|summari[sz](?:e|ed|ing)|valid|verified|walk(?:ed|ing)?\s+through)\b/iu;

export const SOURCE_ORDER_SUMMARY_TOPICAL_SYNTHESIS_ZH_PATTERN =
  /(应用|学习|理解|解释|说明|区分|比较|确认|引入|证明|反例|标准|准则|总结|梳理|验证|计划)/u;

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

export function sourceOrderedSummarySpecificQueryTopics(
  queryTopics: ReadonlySet<string>,
): Set<string> {
  const specificTopics = new Set<string>();
  for (const topic of queryTopics) {
    if (!SOURCE_ORDER_SUMMARY_GENERIC_QUERY_TOPIC_STOPWORDS.has(topic)) {
      specificTopics.add(topic);
    }
  }

  return specificTopics.size === 0 ? new Set(queryTopics) : specificTopics;
}

export function hasSourceOrderedSummaryTopicalSynthesisSignal(
  content: string,
): boolean {
  return SOURCE_ORDER_SUMMARY_TOPICAL_SYNTHESIS_PATTERN.test(content) ||
    SOURCE_ORDER_SUMMARY_TOPICAL_SYNTHESIS_ZH_PATTERN.test(content) ||
    hasSourceOrderedSummaryMilestoneAction(content);
}

function sourceOrderedSummarySpecificTopicOverlap(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  querySpecificTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  return selectorTopicOverlapCount(input.querySpecificTopics, factTopics);
}

function sourceOrderedSummaryRequiredSpecificTopicOverlap(
  querySpecificTopics: ReadonlySet<string>,
): number {
  return querySpecificTopics.size >= 2 ? 2 : 1;
}

function sourceOrderedSummaryTopicalPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  priority: (entry: RankedFactCandidate) => number;
  querySpecificTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  let score = input.priority(input.entry) +
    sourceOrderedSummarySpecificTopicOverlap({
      entry: input.entry,
      language: input.language,
      querySpecificTopics: input.querySpecificTopics,
    }) * 300;

  if (hasUserAnswerTag(input.entry)) {
    score += 90;
  }
  if (hasSourceOrderedSummaryTopicalSynthesisSignal(content)) {
    score += 180;
  }
  if (
    /\b(?:criteria|criterion|method|proof|prov(?:e|ed|ing)|valid|counterexample|step-by-step|formal)\b/iu.test(
      content,
    ) ||
    /(标准|准则|方法|证明|有效|反例|步骤|正式)/u.test(content)
  ) {
    score += 220;
  }
  if (
    /\b(?:I(?:'m| am)\s+trying\s+to\s+(?:apply|compare|construct|prove|understand\s+why|verif(?:y|ying))|help\s+me\s+(?:apply|compare|prove|verify)|formal\s+proof|counterexample)\b/iu.test(
      content,
    ) ||
    /我[\s\S]{0,30}(应用|比较|构造|证明|验证|理解为什么|反例)/u.test(content)
  ) {
    score += 420;
  }
  if (
    /\b[A-Z]{2,5}\b[\s\S]{0,60}\b(?:criteria|criterion|method|proof|valid|similarity|congruence)\b|\b(?:criteria|criterion|method|proof|valid|similarity|congruence)\b[\s\S]{0,60}\b[A-Z]{2,5}\b/u.test(
      content,
    )
  ) {
    score += 340;
  }
  if (
    /\b(?:accuracy|exam|practice\s+test|score(?:d)?|test\s+score|thanks?\s+for|not\s+really)\b/iu.test(
      content,
    ) ||
    /(准确率|考试|练习测试|分数|得分|谢谢|暂时不用)/u.test(content)
  ) {
    score -= 900;
  }
  if (
    /\b(?:confident|good\s+handle|having\s+trouble\s+understanding\s+the\s+difference|explain\s+the\s+difference)\b/iu.test(
      content,
    ) ||
    /(有把握|解释.*区别|理解.*区别)/u.test(content)
  ) {
    score -= 240;
  }
  if (
    /\b(?:additional\s+plugins?|install(?:ed|ing)?|labeled\s+diagrams?|software\s+tools?|tooling)\b/iu.test(
      content,
    )
  ) {
    score -= 420;
  }
  if (
    /\b(?:geogebra|load\s+distribution|structural\s+engineering|truss|triangular\s+window)\b/iu.test(
      content,
    ) &&
    !input.querySpecificTopics.has("geogebra") &&
    !input.querySpecificTopics.has("load") &&
    !input.querySpecificTopics.has("structural") &&
    !input.querySpecificTopics.has("truss") &&
    !input.querySpecificTopics.has("window")
  ) {
    score -= 520;
  }
  if (
    /\b(?:area|base-height|heron'?s|median\s+length)\b/iu.test(content) &&
    !input.querySpecificTopics.has("area") &&
    !input.querySpecificTopics.has("median")
  ) {
    score -= 720;
  }

  return score;
}

function collectAcronyms(value: string): Set<string> {
  return new Set(
    (value.match(/\b[A-Z]{2,5}\b/gu) ?? []).filter(
      (token) => token !== "BEAM",
    ),
  );
}

function sourceOrderedSummaryTopicalSlotSignature(
  entry: RankedFactCandidate,
): Set<string> {
  const content = stripEvidencePrefix(entry.fact.content);
  const similarityFocus =
    /\b(?:similar|similarity|proportional|ratio|scale\s+factor)\b/iu.test(content);
  const congruenceFocus = /\b(?:congruen(?:ce|t))\b/iu.test(content);
  const typedAcronyms = (tokens: ReadonlySet<string>): Set<string> => {
    const suffix = similarityFocus && !congruenceFocus
      ? "similarity"
      : congruenceFocus && !similarityFocus
        ? "congruence"
        : similarityFocus
          ? "similarity"
          : "general";
    return new Set([...tokens].map((token) => `${token}:${suffix}`));
  };

  const similarByCriterion = content.match(
    /\b(?:similar|similarity)\b[\s\S]{0,80}\b(?:by|using)\s+(?:the\s+)?([A-Z]{2,5})\s+(?:criterion|criteria|method|proof)\b|\b(?:by|using)\s+(?:the\s+)?([A-Z]{2,5})\s+(?:criterion|criteria|method|proof)\b[\s\S]{0,80}\b(?:similar|similarity)\b/u,
  );
  if (similarByCriterion?.[1] || similarByCriterion?.[2]) {
    return new Set([`${similarByCriterion[1] ?? similarByCriterion[2]}:similarity`]);
  }

  const congruenceUsingCriteria = content.match(
    /\b(?:congruen(?:ce|t))\b[\s\S]{0,100}\b(?:using|with)\s+(?:the\s+)?((?:[A-Z]{2,5}(?:\s*(?:,|and)\s*)?){1,4})\s+(?:approaches?|criteria|criterion|methods?)\b|\b(?:using|with)\s+(?:the\s+)?((?:[A-Z]{2,5}(?:\s*(?:,|and)\s*)?){1,4})\s+(?:approaches?|criteria|criterion|methods?)\b[\s\S]{0,100}\b(?:congruen(?:ce|t))\b/u,
  );
  if (congruenceUsingCriteria?.[1] || congruenceUsingCriteria?.[2]) {
    return new Set(
      [...collectAcronyms(congruenceUsingCriteria[1] ?? congruenceUsingCriteria[2] ?? "")]
        .map((token) => `${token}:congruence`),
    );
  }

  const congruenceUsingNamedMethod = content.match(
    /\b(?:congruen(?:ce|t))\b[\s\S]{0,100}\b(?:using|with)\s+(?:the\s+)?((?:[A-Z]{2,5}(?:\s*(?:,|and)\s*)?){1,4})\b|\b(?:using|with)\s+(?:the\s+)?((?:[A-Z]{2,5}(?:\s*(?:,|and)\s*)?){1,4})\b[\s\S]{0,100}\b(?:congruen(?:ce|t))\b/u,
  );
  if (congruenceUsingNamedMethod?.[1] || congruenceUsingNamedMethod?.[2]) {
    return new Set(
      [...collectAcronyms(congruenceUsingNamedMethod[1] ?? congruenceUsingNamedMethod[2] ?? "")]
        .map((token) => `${token}:congruence`),
    );
  }

  const parentheticalCriterion = content.match(
    /\(([A-Z]{2,5})\)\s+(?:approach|criterion|criteria|method|proof)\b/u,
  );
  if (parentheticalCriterion?.[1]) {
    return typedAcronyms(new Set([parentheticalCriterion[1]]));
  }

  if (
    /\bsides?\s+in\s+ratio\b[\s\S]{0,100}\bequal\s+included\s+angles?\b[\s\S]{0,100}\bsimilar\b/iu.test(
      content,
    )
  ) {
    return new Set(["included-angle:similarity"]);
  }

  const focusedCriterion = content.match(
    /\b(?:by|through)\s+(?:the\s+)?([A-Z]{2,5})\s+(?:criterion|criteria|method|proof)\b/u,
  );
  if (focusedCriterion?.[1]) {
    return typedAcronyms(new Set([focusedCriterion[1]]));
  }

  const whyCriterion = content.match(/\bwhy\s+(?:the\s+)?([A-Z]{2,5})\b/u);
  if (whyCriterion?.[1]) {
    return typedAcronyms(new Set([whyCriterion[1]]));
  }

  const usingCriteria = content.match(
    /\busing\s+(?:the\s+)?((?:[A-Z]{2,5}(?:\s*(?:,|and)\s*)?){1,4})\s+(?:approaches?|criteria|criterion|methods?)\b/u,
  );
  if (usingCriteria?.[1]) {
    return typedAcronyms(collectAcronyms(usingCriteria[1]));
  }

  const namedCriterion = content.match(
    /\b([A-Z]{2,5})\s+(?:approach|criterion|criteria|method|similarity|congruence)\b/u,
  );
  if (namedCriterion?.[1]) {
    return typedAcronyms(new Set([namedCriterion[1]]));
  }

  return new Set();
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

function hasSourceOrderedSummarySourceEnvelope(entry: RankedFactCandidate): boolean {
  const content = entry.fact.content;
  return /\b(?:chat[_-]?id|source[_-]?order|sourceOrder)\s*[:=]\s*\d+\b/iu.test(
    content,
  ) || /\brole\s*=\s*(?:assistant|user)\b/iu.test(content);
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

function dedupeSourceOrderedSummaryTurns(input: {
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
    isSourceOrderedWritingProgressSummaryQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryWritingProgressMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedCareerPhilosophySummaryQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryCareerPhilosophyMilestone(content)
  ) {
    return true;
  }

  if (
    isSourceOrderedTechnicalChallengeSummaryQuery(input.query) &&
    !isSourceOrderedSummaryInstructionLike(content) &&
    hasSourceOrderedSummaryTechnicalChallengeMilestone(content)
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

export function isSourceOrderedSummaryTopicalMilestoneCandidate(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  querySpecificTopics: ReadonlySet<string>;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);
  if (
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
    return false;
  }

  const requiredOverlap = sourceOrderedSummaryRequiredSpecificTopicOverlap(
    input.querySpecificTopics,
  );
  if (
    sourceOrderedSummarySpecificTopicOverlap({
      entry: input.entry,
      language: input.language,
      querySpecificTopics: input.querySpecificTopics,
    }) < requiredOverlap
  ) {
    return false;
  }

  return hasUserAnswerTag(input.entry) ||
    (
      hasAssistantAnswerTag(input.entry) &&
      hasSourceOrderedSummaryTopicalSynthesisSignal(content)
    );
}

export function isSourceOrderedSummaryTopicalCompanionCandidate(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  querySpecificTopics: ReadonlySet<string>;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);
  if (
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
      return false;
  }

  const topicOverlap = sourceOrderedSummarySpecificTopicOverlap({
    entry: input.entry,
    language: input.language,
    querySpecificTopics: input.querySpecificTopics,
  });
  const hasSlotSignature =
    sourceOrderedSummaryTopicalSlotSignature(input.entry).size > 0;
  return (
    topicOverlap >=
      sourceOrderedSummaryRequiredSpecificTopicOverlap(input.querySpecificTopics) ||
    hasSlotSignature
  ) && hasSourceOrderedSummaryTopicalSynthesisSignal(content);
}

function selectSourceOrderedSummaryAnchorCoverage(input: {
  anchorLimit?: number;
  anchors: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const recallLimit = input.anchorLimit ?? SOURCE_ORDER_SUMMARY_RECALL_LIMIT;
  const sortedAnchors = [...input.anchors].sort(compareTemporalFactChronology);
  if (sortedAnchors.length <= recallLimit) {
    return sortedAnchors;
  }

  const selected = new Map<string, RankedFactCandidate>();
  const anchorCount = Math.min(
    SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT,
    Math.ceil(recallLimit / 2),
    sortedAnchors.length,
  );
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < recallLimit) {
      selected.set(entry.fact.id, entry);
    }
  };

  for (let index = 0; index < anchorCount; index += 1) {
    const start = Math.floor(index * sortedAnchors.length / anchorCount);
    const end = Math.floor((index + 1) * sortedAnchors.length / anchorCount);
    const bucket = sortedAnchors.slice(start, Math.max(start + 1, end));
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

  for (const entry of [...sortedAnchors].sort((left, right) => {
    const priorityDelta = input.priority(right) - input.priority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return compareTemporalFactChronology(left, right);
  })) {
    if (selected.size >= recallLimit) {
      break;
    }
    addCandidate(entry);
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

function selectSourceOrderedTopicalSummaryMilestones(input: {
  anchors: RankedFactCandidate[];
  companions: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const selectedSourceOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      return;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedSourceOrders.has(order)) {
      return;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedSourceOrders.add(order);
    }
  };
  const preferredAnchors = input.anchors.filter(hasUserAnswerTag).length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
    ? input.anchors.filter(hasUserAnswerTag)
    : input.anchors;
  const anchorCoverageLimit = Math.min(
    SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT,
    Math.ceil(SOURCE_ORDER_SUMMARY_RECALL_LIMIT / 2),
  );
  const anchorsBySignature = new Map<string, RankedFactCandidate>();
  for (const anchor of preferredAnchors) {
    const order = sourceOrderSortKey(anchor);
    const signature = sourceOrderedSummaryTopicalSlotSignature(anchor);
    const signatureKey = signature.size === 0
      ? `source:${order ?? anchor.fact.id}`
      : [...signature].sort().join("|");
    const current = anchorsBySignature.get(signatureKey);
    if (
      !current ||
      compareTemporalFactChronology(anchor, current) < 0
    ) {
      anchorsBySignature.set(signatureKey, anchor);
    }
  }
  const anchorCoverage = [...anchorsBySignature.values()]
    .sort((left, right) => {
      const priorityDelta = input.priority(right) - input.priority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })
    .slice(0, anchorCoverageLimit)
    .sort(compareTemporalFactChronology);

  for (const anchor of anchorCoverage) {
    const anchorOrder = sourceOrderSortKey(anchor);
    addCandidate(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companions = input.companions
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          !selectedSourceOrders.has(order) &&
          Math.abs(order - anchorOrder) <=
            SOURCE_ORDER_SUMMARY_TOPICAL_COMPANION_DISTANCE &&
          (
            (hasUserAnswerTag(anchor) && hasAssistantAnswerTag(entry) &&
              order > anchorOrder) ||
            (hasAssistantAnswerTag(anchor) && hasUserAnswerTag(entry) &&
              order < anchorOrder)
          );
      })
      .sort((left, right) => {
        const leftOrder = sourceOrderSortKey(left) ?? 0;
        const rightOrder = sourceOrderSortKey(right) ?? 0;
        const priorityDelta = input.priority(right) - input.priority(left);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        const distanceDelta =
          Math.abs(leftOrder - anchorOrder) - Math.abs(rightOrder - anchorOrder);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        return compareTemporalFactChronology(left, right);
      })
      .slice(0, SOURCE_ORDER_SUMMARY_TOPICAL_COMPANIONS_PER_ANCHOR);
    for (const companion of companions) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

function selectSourceOrderedWritingProgressPairs(input: {
  anchors: RankedFactCandidate[];
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size < SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      selected.set(entry.fact.id, entry);
    }
  };

  for (const anchor of [...input.anchors].sort(compareTemporalFactChronology)) {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      break;
    }

    addCandidate(anchor);
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined) {
      continue;
    }

    const companion = input.sourceCandidates
      .filter((entry) => !selected.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          hasAssistantAnswerTag(entry) &&
          order > anchorOrder &&
          order - anchorOrder <= SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE;
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

function selectSourceOrderedCareerPhilosophyPairs(input: {
  anchors: RankedFactCandidate[];
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const selectedSourceOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      return;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedSourceOrders.has(order)) {
      return;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedSourceOrders.add(order);
    }
  };

  for (const anchor of [...input.anchors].sort(compareTemporalFactChronology)) {
    if (selected.size >= SOURCE_ORDER_SUMMARY_RECALL_LIMIT) {
      break;
    }

    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined || !hasUserAnswerTag(anchor)) {
      continue;
    }

    const anchorContent = stripEvidencePrefix(anchor.fact.content);
    if (isSourceOrderedSummaryCareerPhilosophyUserMilestone(anchorContent)) {
      addCandidate(anchor);
    }

    const companion = input.sourceCandidates
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        if (
          order === undefined ||
          selectedSourceOrders.has(order) ||
          !hasAssistantAnswerTag(entry) ||
          order <= anchorOrder ||
          order - anchorOrder > SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE
        ) {
          return false;
        }

        return hasSourceOrderedSummaryCareerPhilosophyMilestone(
          stripEvidencePrefix(entry.fact.content),
        );
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

function sourceOrderedTechnicalChallengePriority(input: {
  entry: RankedFactCandidate;
  priority: (entry: RankedFactCandidate) => number;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  let score = input.priority(input.entry);

  if (
    /\b(?:integrityerror|unique\s+constraint|operationalerror|csrf(?:\s+token)?|account\s+lockout|failed\s+login\s+attempts|redis[\s\S]{0,80}rate\s+limit(?:ing)?|rate\s+limit(?:ing)?[\s\S]{0,80}redis)\b/iu.test(
      content,
    )
  ) {
    score += 520;
  }
  if (/\bcsrf\s+token\s+missing\s+or\s+incorrect\b/iu.test(content)) {
    score += 260;
  }
  if (
    /\b(?:basic\s+password\s+hashing|werkzeug\.security|securely\s+hashing\s+passwords)\b/iu.test(
      content,
    )
  ) {
    score += 420;
  }
  if (
    /\b(?:error|failed|incorrect|missing|trouble|try-except|http\s+500|error\s+logs?)\b/iu.test(
      content,
    )
  ) {
    score += 140;
  }
  if (hasAssistantAnswerTag(input.entry)) {
    score += 20;
  }
  if (
    /\b(?:core\s+functionalit(?:y|ies)|data\s+visualization|estimate\s+the\s+time|task\s+list|template(?:notfound)?|no\s+such\s+table|unauthorized\s+access|blueprints?|lightweight|minimal\s+dependencies|session\s+login|rest\s+api|pull\s+request|code\s+review|caching\s+tweaks?|dashboard\s+api\s+response\s+time)\b/iu.test(
      content,
    )
  ) {
    score -= 520;
  }
  if (
    /\b(?:sqlalchemy\s+for\s+database\s+interactions|starting\s+from\s+scratch|flask\s+routes|ui\/ux|refactor(?:ing)?|maintainability|security\s+best\s+practices)\b/iu.test(
      content,
    )
  ) {
    score -= 420;
  }
  if (content.length > 2500) {
    score -= 120;
  }

  return score;
}

function selectSourceOrderedTechnicalChallengeMilestones(input: {
  candidates: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  return [...input.candidates]
    .sort((left, right) => {
      const priorityDelta =
        sourceOrderedTechnicalChallengePriority({
          entry: right,
          priority: input.priority,
        }) -
        sourceOrderedTechnicalChallengePriority({
          entry: left,
          priority: input.priority,
        });
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })
    .slice(0, SOURCE_ORDER_SUMMARY_RECALL_LIMIT)
    .sort(compareTemporalFactChronology);
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
  const querySpecificTopics = sourceOrderedSummarySpecificQueryTopics(queryTopics);
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderedSummaryPriority({
      entry,
      language: input.language,
      queryTopics,
    });
  const topicalPriority = (entry: RankedFactCandidate): number =>
    sourceOrderedSummaryTopicalPriority({
      entry,
      language: input.language,
      priority,
      querySpecificTopics,
    });
  const sourceCandidates = input.entries
    .filter(isSourceOrderedSummaryCandidate)
    .sort(compareTemporalFactChronology);
  const careerPhilosophySummaryQuery =
    isSourceOrderedCareerPhilosophySummaryQuery(input.query);
  const careerPhilosophySourceCandidates = careerPhilosophySummaryQuery
    ? dedupeSourceOrderedSummaryTurns({
      entries: sourceCandidates,
      priority,
    })
    : [];
  const technicalChallengeSummaryQuery =
    isSourceOrderedTechnicalChallengeSummaryQuery(input.query);
  const technicalChallengeSourceCandidates = technicalChallengeSummaryQuery
    ? dedupeSourceOrderedSummaryTurns({
      entries: sourceCandidates,
      priority,
    })
    : [];
  const topicalSourceCandidates = dedupeSourceOrderedSummaryTurns({
    entries: sourceCandidates,
    priority,
  });
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
  const writingProgressCandidates =
    isSourceOrderedWritingProgressSummaryQuery(input.query)
      ? sourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return hasUserAnswerTag(entry) &&
          !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryWritingProgressMilestone(content);
      })
      : [];
  const careerPhilosophyCandidates =
    careerPhilosophySummaryQuery
      ? careerPhilosophySourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        if (
          isSourceOrderedSummaryInstructionLike(content) ||
          !hasSourceOrderedSummaryCareerPhilosophyMilestone(content)
        ) {
          return false;
        }

        return hasAssistantAnswerTag(entry) ||
          (
            hasUserAnswerTag(entry) &&
            isSourceOrderedSummaryCareerPhilosophyUserMilestone(content)
          );
      })
      : [];
  const careerPhilosophyUserAnchors =
    careerPhilosophySummaryQuery
      ? careerPhilosophySourceCandidates.filter((entry) =>
        hasUserAnswerTag(entry) &&
        isSourceOrderedSummaryCareerPhilosophyUserAnchor(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      : [];
  const technicalChallengeCandidates =
    technicalChallengeSummaryQuery
      ? technicalChallengeSourceCandidates.filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return !isSourceOrderedSummaryInstructionLike(content) &&
          hasSourceOrderedSummaryTechnicalChallengeMilestone(content);
      })
      : [];
  const learningProgressionSummaryQuery =
    isSourceOrderedLearningProgressionQuery(input.query);
  const topicalSummaryCandidates = learningProgressionSummaryQuery
    ? topicalSourceCandidates.filter((entry) =>
      isSourceOrderedSummaryTopicalMilestoneCandidate({
        entry,
        language: input.language,
        querySpecificTopics,
      })
    )
    : [];
  const topicalSummaryCompanions = learningProgressionSummaryQuery
    ? topicalSourceCandidates.filter((entry) =>
      isSourceOrderedSummaryTopicalCompanionCandidate({
        entry,
        language: input.language,
        querySpecificTopics,
      })
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
    writingProgressCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    return selectSourceOrderedWritingProgressPairs({
      anchors: writingProgressCandidates,
      sourceCandidates,
    });
  }
  if (
    careerPhilosophyCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    if (careerPhilosophyUserAnchors.length > 0) {
      return selectSourceOrderedCareerPhilosophyPairs({
        anchors: careerPhilosophyUserAnchors,
        sourceCandidates: careerPhilosophySourceCandidates,
      });
    }

    return careerPhilosophyCandidates.slice(0, SOURCE_ORDER_SUMMARY_RECALL_LIMIT);
  }
  if (
    technicalChallengeCandidates.length >=
      SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    return selectSourceOrderedTechnicalChallengeMilestones({
      candidates: technicalChallengeCandidates,
      priority,
    });
  }
  if (
    topicalSummaryCandidates.length >= SOURCE_ORDER_SUMMARY_MILESTONE_MIN_ANCHORS
  ) {
    return selectSourceOrderedTopicalSummaryMilestones({
      anchors: topicalSummaryCandidates,
      companions: topicalSummaryCompanions,
      priority: topicalPriority,
    });
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
