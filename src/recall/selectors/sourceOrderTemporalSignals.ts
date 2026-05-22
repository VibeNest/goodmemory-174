import { isUserBroughtUpEventOrderQuery } from "./temporal";

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

export function hasCollaborativeMilestoneSignal(content: string): boolean {
  return /\b(?:collaborat(?:ed|ing)?|conversation\s+with|discuss(?:ed|ing)?\s+with|recommended|shared|suggested|advised)\b[\s\S]{0,120}\b[A-Z][\p{L}'-]+\b/u.test(content) ||
    /\b[A-Z][\p{L}'-]+\b[\s\S]{0,50}\b(?:recommended|shared|suggested|advised)\b/u.test(content) ||
    /\b(?:with|from|by)\s+[A-Z][\p{L}'-]+\b[\s\S]{0,120}\b(?:advice|feedback|insights?|recommend(?:ed|ation)?|suggest(?:ed|ion)?|strategy|update)\b/u.test(content) ||
    /\b(?:feedback|insights?|job descriptions?|keywords?|sections?|strategy)\b[\s\S]{0,120}\bwith\s+[A-Z][\p{L}'-]+\b/u.test(content) ||
    /\bwith\s+[A-Z][\p{L}'-]+\b[\s\S]{0,120}\b(?:add|feedback|keywords?|refin(?:e|ing)|share|sections?)\b/u.test(content) ||
    /(?:建议|推荐|反馈|合作|讨论|分享).{0,80}[\p{Script=Han}A-Z][\p{Script=Han}\p{L}'-]+/u.test(content);
}

export function hasNegatedAbsenceSignal(content: string): boolean {
  return /\b(?:never|not|no|without)\b[\s\S]{0,80}\b(?:attended|completed|done|enrolled|finished|had|obtained|used)\b/iu.test(content) ||
    /(从未|没有|没).{0,80}(参加|完成|注册|使用|获得)/u.test(content);
}

export function professionalProfileAspectPriorityBonus(content: string): number {
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
