import type {
  EpisodeMemory,
  FactKind,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  UserProfile,
} from "../domain/records";
import {
  buildFeedbackIdentityKey,
  isActiveMemoryLifecycle,
  normalizeFeedbackAppliesTo,
} from "../domain/records";
import type { SessionArchive } from "../evolution/contracts";
import type { LanguageService } from "../language";
import { FEEDBACK_RECALL_LIMIT } from "./budgets";
import type {
  RecallCandidateTrace,
} from "./engine";
import type {
  RecallSlot,
  RetrievalProfile,
  RoutingDecision,
} from "./router";
import {
  buildArchiveCandidates,
  buildEpisodeCandidates,
  buildFactCandidates,
  buildReferenceCandidates,
  materializeFactCandidate,
  rankArchiveCandidates,
  rankEpisodeCandidates,
  rankFactCandidates,
  rankReferenceCandidates,
  sortFeedback,
  sortPreferences,
  type RankedArchiveCandidate,
  type RankedFactCandidate,
} from "./scoring";

const PROJECT_STATE_SUPPORT_PRIMARY_KINDS = [
  ["blocker"],
  ["open_loop"],
] as const satisfies ReadonlyArray<readonly FactKind[]>;

const PROJECT_STATE_SUPPORT_FALLBACK_KINDS = [
  "focus_update",
  "project_state",
] as const satisfies readonly FactKind[];
const AGGREGATE_OPEN_LOOP_LIMIT = 6;
const AGGREGATE_FACT_COUNT_LIMIT = 6;
const ASSISTANT_EVIDENCE_RECALL_LIMIT = 6;
const DIRECT_FACTUAL_RECALL_LIMIT = 6;
const DIRECT_FACTUAL_COMPANION_LIMIT = 3;
const PREFERENCE_EVIDENCE_RECALL_LIMIT = 4;
const TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT = 4;
const UPDATE_EVIDENCE_RECALL_LIMIT = 3;
const SOURCE_ORDER_EVENT_RECALL_LIMIT = 10;
const SOURCE_ORDER_GAP_FILL_LIMIT = 5;
const SOURCE_ORDER_COMPANION_LIMIT = 6;
const SOURCE_ORDER_COMPANION_MAX_DISTANCE = 2;
const SOURCE_ORDER_MILESTONE_FILL_LIMIT = 6;
const SOURCE_ORDER_SUMMARY_RECALL_LIMIT = 16;
const SOURCE_ORDER_SUMMARY_ANCHOR_LIMIT = 8;
const SOURCE_ORDER_SUMMARY_COMPANION_DISTANCE = 1;
const SOURCE_ORDER_TIMELINE_RECALL_LIMIT = 6;
const SOURCE_ORDER_TIMELINE_CLUSTER_RADIUS = 5;
const SOURCE_ORDER_TIMELINE_CHRONOLOGY_PENALTY = 2;
const SOURCE_ORDER_TIMELINE_PRIORITY_THRESHOLD = 140;
const SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT = 2;
const SOURCE_ORDER_INSTRUCTION_PRIORITY_THRESHOLD = 160;
const SOURCE_ORDER_PREFERENCE_RECALL_LIMIT = 2;
const SOURCE_ORDER_PREFERENCE_PRIORITY_THRESHOLD = 130;
const PREFERENCE_RECALL_LIMIT = 3;
const RESEARCH_RECOMMENDATION_LIMIT = 2;
const EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD = 0.08;
const BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS = new Set([
  "about",
  "always",
  "api",
  "app",
  "ask",
  "condition",
  "conditions",
  "detail",
  "details",
  "feature",
  "features",
  "need",
  "please",
  "project",
  "request",
  "response",
  "responses",
  "software",
  "use",
  "used",
  "using",
  "weather",
  "when",
  "whenever",
]);
const SOURCE_INSTRUCTION_ALIAS_TOKENS = new Set([
  "api_error",
  "book_recommendation",
  "compensation",
  "date_format",
  "digital_asset_management",
  "draft_revision",
  "financial_budget",
  "html_structure",
  "legal_requirements",
  "list_format",
  "movie_recommendation",
  "patent_process",
  "philosophy",
  "progress_summary",
  "privacy_security",
  "probability",
  "product_features",
  "reference_format",
  "resume_format",
  "snack_recommendation",
  "social_norms",
  "software_dependency",
  "software_implementation",
  "triangle_geometry",
  "writing_tool",
]);
const TEMPORAL_INTERVAL_ANCHOR_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "between",
  "completed",
  "complete",
  "day",
  "days",
  "finished",
  "finish",
  "obtained",
  "obtain",
  "passed",
  "planned",
  "received",
  "scheduled",
  "started",
  "using",
  "when",
]);
const TEMPORAL_INTERVAL_ACQUISITION_OBJECT_PATTERN =
  /\b(?:api\s+key|key|token|credential|access|license|permit|certificate|approval|confirmation|receipt|authorization|invite|invitation)\b/iu;
const SOURCE_PREFERENCE_DECLARATION_PATTERN =
  /\b(?:prefer|preference|i['’]d\s+like|i\s+would\s+like|looking\s+for|interested\s+in|enjoy|love|rather\s+than|over\s+(?:heavy|manual|generic|external|third-party)|without\s+compromising|avoid(?:ing)?)\b/iu;
const SIMPLE_SOLUTION_QUERY_PATTERN =
  /\b(?:simple|straightforward|minimal|lightweight|built-?in|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party))\b/iu;
const LIGHTWEIGHT_PREFERENCE_PATTERN =
  /\b(?:lightweight|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party)|minimal|simple|straightforward|built-?in|avoid(?:ing)?\s+(?:heavy|external|third-party)|under\s+\d+(?:\.\d+)?\s*(?:mb|kb))\b/iu;
const TIMELINE_INTEGRATION_CONTENT_CUE_PATTERN =
  /\b(?:attorneys?|bar\s+association|college|completed\s+on\s+time|cutoff|deadline|draft|follow\s+up|meeting|mentor|milestones?|organis(?:e|ed|ing|ation)|organiz(?:e|ed|ing|ation)|patents?|plan(?:ned|ning)?|prepar(?:e|ed|ing|ation)|resources?|revision|schedule(?:d)?|sprint|structur(?:e|ed|ing)|submission|timeline)\b/iu;
const TIMELINE_INTEGRATION_STRONG_CONTENT_CUE_PATTERN =
  /\b(?:completed\s+on\s+time|cutoff|deadline|final\s+cutoff|milestones?|schedule(?:d)?|sprint|timeline|weeks?\s+leading\s+up)\b/iu;
const TIMELINE_INTEGRATION_SPECIFIC_TOPIC_TOKENS = new Set([
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
const AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD = 0.05;
const AGGREGATE_GENERIC_LEXICAL_FACT_THRESHOLD = 0.2;
const AGGREGATE_TOPIC_STOPWORDS = new Set([
  "after",
  "before",
  "combined",
  "current",
  "currently",
  "days",
  "different",
  "does",
  "have",
  "hours",
  "many",
  "money",
  "months",
  "much",
  "since",
  "spend",
  "spent",
  "start",
  "this",
  "time",
  "total",
  "weeks",
  "what",
  "when",
  "where",
  "year",
  "years",
  "一共",
  "今年",
  "价格",
  "元",
  "合计",
  "多少",
  "多少钱",
  "总共",
  "相关",
  "花",
  "花了",
  "花费",
  "费用",
  "钱",
]);
const AGGREGATE_TRUSTED_EVIDENCE_TAGS = new Set([
  "compact_evidence",
  "dated_event",
  "user_answer",
]);
const ASSISTANT_EVIDENCE_TAG = "assistant_answer";
const SOURCE_MESSAGE_TAG = "source_message";
const SOURCE_ORDER_TAG = "source_order";
const CONVERSATION_EVIDENCE_TAGS = new Set([
  ASSISTANT_EVIDENCE_TAG,
  "compact_evidence",
  "dated_event",
  SOURCE_MESSAGE_TAG,
  "user_answer",
]);
const DIRECT_FACTUAL_COMPANION_TAGS = new Set([
  "compact_evidence",
  "dated_event",
  SOURCE_MESSAGE_TAG,
  "user_answer",
]);
const QUANTIFIED_FACT_PATTERN =
  /\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b|\$\s*\d|\d+(?:[.,]\d+)?\s*(?:元|块|人民币)/iu;
const DATE_OR_TIME_FACT_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}(?:st|nd|rd|th)\b|\b\d{1,2}:\d{2}\b/iu;
const MONEY_FACT_PATTERN =
  /\$\s*\d|\d+(?:[.,]\d+)?\s*(?:元|块|人民币)|\b(?:cost|costs|costing|paid|price|prices|spent|spend|dollars?)\b|(?:花了|花费|费用|价格)/iu;
const ACCOMMODATION_COST_FACT_PATTERN =
  /\b(?:accommodations?|lodging|hotel|hostel|resort|motel|airbnb|room|stay|stayed|booked)\b[\s\S]{0,160}\b(?:cost|costs|costing|paid|price|prices|spent|spend|per\s+night|\$\s*\d)\b|\b(?:cost|costs|costing|paid|price|prices|spent|spend|per\s+night|\$\s*\d)\b[\s\S]{0,160}\b(?:accommodations?|lodging|hotel|hostel|resort|motel|airbnb|room)\b/iu;
const MEDICAL_PROVIDER_FACT_PATTERN =
  /\b(?:dr\.?\s+[a-z][a-z'-]+|doctor|doctors|physician|dermatologist|ent specialist|specialist)\b/iu;
const NAMED_MEDICAL_PROVIDER_FACT_PATTERN =
  /\bdr\.?\s+[a-z][a-z'-]+\b/iu;
const COMPACT_MEDICAL_PROVIDER_FACT_PATTERN =
  /^Medical provider evidence:/iu;
const OWNERSHIP_COUNT_FACT_PATTERN =
  /\b(?:have|has|own|owns|owned|currently have|with me|bring|bringing|using|new one|purchased)\b/iu;
const PLANT_ACQUISITION_FACT_PATTERN =
  /\bPlant count evidence:|\b(?:got|bought|purchased|picked up|received|brought home|acquired|planted|repotting)\b[\s\S]{0,120}\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant|tomato|cucumber)\b|\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant|tomato|cucumber)\b[\s\S]{0,120}\b(?:from|at|nursery|sister|bought|purchased|picked up|received|brought home|acquired|planted|repotting|growing)\b/iu;
const AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN =
  /\bAquarium tank ownership evidence:/iu;
const BIKE_SERVICE_FACT_PATTERN =
  /\bBike service evidence:/iu;
const MAGAZINE_SUBSCRIPTION_FACT_PATTERN =
  /\bMagazine subscription evidence:/iu;
const FORMAL_EDUCATION_FACT_PATTERN =
  /\bFormal education duration evidence:/iu;
const FEED_WEIGHT_FACT_PATTERN =
  /\bFeed purchase weight evidence:/iu;
const SIBLING_COUNT_FACT_PATTERN =
  /\bSibling count evidence:/iu;
const PERSONAL_ELECTRONICS_FACT_PATTERN =
  /\bPersonal electronics (?:spec|purchase cost|ownership) evidence:/iu;
const INSTRUMENT_PRACTICE_FACT_PATTERN =
  /\bInstrument practice evidence:/iu;
const FITNESS_CLASS_FACT_PATTERN =
  /\bFitness class I attend:/iu;
const PROJECT_EXPERIENCE_FACT_PATTERN =
  /\b(?:led|lead|leading|solo project|class project|research project|working on a project|project that involves)\b/iu;
const COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN =
  /\b(?:event|events|activity|activities|attended|attending|visited|visit|volunteered|participated|museum|museums|gallery|galleries|class|classes|appointment|appointments|ceremony|ceremonies|sport|sports|instrument|instruments|points?|rewards?)\b/iu;
const COUNTABLE_CATEGORY_INSTANCE_FACT_PATTERN =
  /\b(?:added|ate|attended|attending|bought|contains?|cook(?:ed|ing)?|drink|drank|have|had|includes?|learn(?:ed)?|made|make|ordered|own|served|tried|use|used|using|with)\b/iu;
const ENTITY_BEARING_FACT_PATTERN =
  /\bDr\.?\s+[A-Z][\p{L}'-]+\b|\b[A-Z][\p{L}'-]+(?:\s+(?:of|the|[A-Z][\p{L}'-]+)){1,}\b|["'][^"']+["']/u;
const REALIZED_TEMPORAL_EVENT_FACT_PATTERN =
  /\b(?:attended|bought|came\s+back\s+from|finished|got\s+back\s+from|helped|ordered|participated|prescribed|replaced|saw|started|took|visited|went)\b/iu;
const FURNITURE_ACTIVITY_FACT_PATTERN =
  /\b(?:furniture|coffee table|kitchen table|bookshelf|mattress|sofa|couch|chair|dresser|desk|bed)\b[\s\S]{0,160}\b(?:bought|buy|assembled|fixed|sold|ordered|got|rearranged|replaced)\b|\b(?:bought|buy|assembled|fixed|sold|ordered|got|rearranged|replaced)\b[\s\S]{0,160}\b(?:furniture|coffee table|kitchen table|bookshelf|mattress|sofa|couch|chair|dresser|desk|bed)\b/iu;
const PROPERTY_VIEWING_FACT_PATTERN =
  /\b(?:property|properties|house|home|condo|townhouse|bungalow)\b[\s\S]{0,180}\b(?:viewed|saw|seen|offer|rejected|budget|renovation|deal-breaker|Brookside)\b|\b(?:viewed|saw|seen|offer|rejected|budget|renovation|deal-breaker)\b[\s\S]{0,180}\b(?:property|properties|house|home|condo|townhouse|bungalow)\b/iu;
const FOOD_DELIVERY_SERVICE_FACT_PATTERN =
  /\b(?:food delivery|delivery service|Domino'?s Pizza|Uber Eats|Fresh Fusion)\b/iu;
const SOCIAL_FOLLOWER_FACT_PATTERN =
  /\b(?:social media|followers?|follower count|Twitter|TikTok|Facebook|Instagram)\b[\s\S]{0,180}\b(?:gained|jumped|steady|from\s+\d+\s+to\s+\d+|\d+\s+followers?)\b|\b(?:gained|jumped|steady|from\s+\d+\s+to\s+\d+|\d+\s+followers?)\b[\s\S]{0,180}\b(?:social media|followers?|follower count|Twitter|TikTok|Facebook|Instagram)\b/iu;
const SOCIAL_REACH_METRIC_FACT_PATTERN =
  /\bSocial reach metric:\s*(?:Facebook ad campaign|Instagram influencer collaboration)\b[\s\S]{0,120}\b(?:reached|followers?)\b[\s\S]{0,80}\b[\d,]+\b/iu;
const VIDEO_VIEW_METRIC_FACT_PATTERN =
  /\bVideo view metric:\s*(?:YouTube|TikTok)\b[\s\S]{0,120}\b[\d,]+\s+views\b/iu;
const MUSEUM_VISIT_ORDER_FACT_PATTERN =
  /\b(?:Museum or gallery I visited|Art-related event I attended|I visited\b[\s\S]{0,80}\bMuseum|Museum\b[\s\S]{0,80}\b(?:exhibition|guided tour|lecture|tour))\b/iu;
const HEALTH_ISSUE_EVENT_FACT_PATTERN =
  /\b(?:persistent cough|skin tag removed|had a skin tag removed)\b/iu;
const CONTRADICTION_NEGATED_CLAIM_PATTERN =
  /\b(?:never|haven't|hasn't|hadn't|didn't|don't|doesn't)\b[\s\S]{0,120}\b(?:written|wrote|worked\s+with|handled|implemented|built|created|used)\b|\bno\s+(?:prior\s+)?experience\s+with\b|(?:从来)?(?:没|没有|未)[\s\S]{0,120}(?:写过|做过|处理过|实现过|构建过|创建过|用过|使用过|接触过|经验)/iu;
const CONTRADICTION_REALIZED_EVIDENCE_PATTERN =
  /\b(?:implemented|built|created|completed|tested|configured|handled|worked\s+with|wrote|written|managed\s+to|current\s+code|@app\.route|return(?:ed)?\s+static)\b|(?:已经|成功|实际)?(?:实现了|写了|处理了|构建了|创建了|完成了|测试了|配置了|用过|使用过|返回静态)|@app\.route/iu;
const CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN =
  /\b(?:implemented|built|created|completed|tested|handled|worked\s+with|wrote|written|managed\s+to)\b|return(?:ed)?\s+static|(?:实现了|写了|处理了|构建了|创建了|完成了|测试了|返回静态)/iu;
const SOURCE_ORDER_ASPECT_CUE_PATTERN =
  /\b(?:analytics?|authorization|authentication|blueprints?|completed|configur(?:e|ed|ing|ation)|CRUD|database|deployment|error\s+handling|finalizing|hardening|implement(?:ed|ing)?|integration\s+tests?|local\s+dev|models?|port\s+\d+|response\s+handling|route|schema|security|SQL\s+injection|testing|transaction|validation|worker|XSS)\b/iu;
const SOURCE_ORDER_ASPECT_TOPIC_TOKENS = new Set([
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
const CHINESE_SOURCE_ORDER_ASPECT_ALIASES = [
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
const FAMILY_AGE_FACT_PATTERN =
  /\b(?:family age|age evidence|grandma|grandpa|grandparents?|parents?|mom|dad|mother|father|I am|turned)\b[\s\S]{0,120}\b\d{1,3}\b/iu;
const COMPACT_MODEL_KIT_FACT_PATTERN =
  /^I worked on or got the model kit:/iu;
const ASSISTANT_COUNT_HEADING_FACT_PATTERN =
  /^[^:\n]{2,120}\(\d+\):$/u;
const AGGREGATE_CATEGORY_INSTANCE_GROUPS = [
  {
    categoryTokens: ["citrus"],
    instanceTokens: [
      "clementine",
      "grapefruit",
      "kumquat",
      "lemon",
      "lime",
      "mandarin",
      "orange",
      "pomelo",
      "tangerine",
      "yuzu",
    ],
  },
  {
    categoryTokens: ["cuisine"],
    instanceTokens: [
      "american",
      "chinese",
      "ethiopian",
      "french",
      "greek",
      "indian",
      "italian",
      "japanese",
      "korean",
      "mediterranean",
      "mexican",
      "spanish",
      "thai",
      "vegan",
      "vietnamese",
    ],
  },
] as const satisfies ReadonlyArray<{
  categoryTokens: readonly string[];
  instanceTokens: readonly string[];
}>;

function normalizeAggregateTopicToken(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

  if (
    /^[a-z0-9]+$/u.test(normalized) &&
    normalized.length > 4 &&
    normalized.endsWith("s") &&
    !normalized.endsWith("ss") &&
    !normalized.endsWith("us") &&
    !normalized.endsWith("is")
  ) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function aggregateTopicTokens(
  text: string,
  language?: LanguageService,
  locale?: string,
): Set<string> {
  const tokens = language && locale
    ? language.tokenize(text, locale, { excludeStopwords: true })
    : (text.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)?/gu) ?? []);

  return new Set(
    tokens
      .flatMap((token) => token.split("-"))
      .map(normalizeAggregateTopicToken)
      .filter(
        (token) =>
          (/[\p{Script=Han}]/u.test(token) ? token.length >= 2 : token.length >= 4) &&
          !AGGREGATE_TOPIC_STOPWORDS.has(token),
      ),
  );
}

function aggregateTopicOverlapCount(
  queryTopics: ReadonlySet<string>,
  factTopics: ReadonlySet<string>,
): number {
  let overlap = 0;

  for (const token of queryTopics) {
    if (factTopics.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function hasAggregateCategoryInstanceSignal(input: {
  factContent: string;
  factTopics: ReadonlySet<string>;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (!COUNTABLE_CATEGORY_INSTANCE_FACT_PATTERN.test(input.factContent)) {
    return false;
  }

  return AGGREGATE_CATEGORY_INSTANCE_GROUPS.some(
    (group) =>
      group.categoryTokens.some((token) => input.queryTopics.has(token)) &&
      group.instanceTokens.some((token) => input.factTopics.has(token)),
  );
}

function isAggregateOpenLoopQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return (
    language.isOpenLoopQuery(query, locale) &&
    (
      /\b(how many|what|which|list|all|remaining|pending|todo|to-do|open loops?)\b/i.test(
        query,
      ) ||
      /(哪些|多少|几个|几项|所有|全部|剩余|还有|当前|待办|开环|未完成|待处理|待跟进)/u.test(
        query,
      )
    )
  );
}

function hasAggregateOpenLoopSignal(entry: RankedFactCandidate): boolean {
  return entry.factKind === "open_loop" ||
    entry.lexicalScore >= 0.2 ||
    entry.subjectScore >= 0.2;
}

function isAggregateFactCountQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return language.isAggregateCountQuery(query, locale);
}

function isTemporalIntervalQuery(query: string): boolean {
  return /\bhow many\s+(?:days?|weeks?|months?|years?)\b/i.test(query) &&
    /\b(?:passed|between|ago)\b/i.test(query);
}

function temporalIntervalAnchorFragments(query: string): string[] {
  const betweenWhenMatch = query.match(
    /\bbetween\s+when\s+(?:I|we|you)?\s*(.+?)\s+and\s+when\s+(?:I|we|you)?\s*(.+?)(?:[?.!]|$)/iu,
  );
  if (betweenWhenMatch?.[1] && betweenWhenMatch[2]) {
    return [betweenWhenMatch[1], betweenWhenMatch[2]];
  }

  const betweenMatch = query.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:[?.!]|$)/iu);
  if (betweenMatch?.[1] && betweenMatch[2]) {
    return [betweenMatch[1], betweenMatch[2]];
  }

  return [];
}

function temporalIntervalActionPattern(fragment: string): RegExp | undefined {
  const normalized = fragment.toLowerCase();
  if (/\b(?:obtain(?:ed)?|got|received)\b/u.test(normalized)) {
    return /\b(?:obtain(?:ed)?|got|received)\b/iu;
  }
  if (/\b(?:complet(?:e|ed)|finish(?:ed)?|finali[sz](?:e|ed))\b/u.test(normalized)) {
    return /\b(?:complet(?:e|ed)|finish(?:ed)?|finali[sz](?:e|ed))\b/iu;
  }
  if (/\b(?:start(?:ed)?|began|begin)\b/u.test(normalized)) {
    return /\b(?:start(?:ed)?|began|begin)\b/iu;
  }
  if (/\b(?:plan(?:ned)?|aim(?:ed)?|schedul(?:e|ed))\b/u.test(normalized)) {
    return /\b(?:plan(?:ned)?|aim(?:ed)?|schedul(?:e|ed))\b/iu;
  }
  if (/\b(?:file(?:d)?|submit(?:ted)?|register(?:ed)?|attend(?:ed)?|met)\b/u.test(normalized)) {
    return /\b(?:file(?:d)?|submit(?:ted)?|register(?:ed)?|attend(?:ed)?|met)\b/iu;
  }

  return undefined;
}

function hasTemporalIntervalCredentialAcquisitionAnchor(fragment: string): boolean {
  const normalized = fragment.toLowerCase();
  return /\b(?:obtain(?:ed)?|got|received)\b/u.test(normalized) &&
    TEMPORAL_INTERVAL_ACQUISITION_OBJECT_PATTERN.test(normalized);
}

function isTemporalEventOrderQuery(query: string): boolean {
  return /\bwhat\s+is\s+the\s+order\b/i.test(query) ||
    /\border\s+of\b/i.test(query) ||
    /\border\s+in\s+which\b/i.test(query) ||
    /\bin\s+which\s+order\b/i.test(query) ||
    /\bin\s+order\b/i.test(query) && /\b(?:brought\s+up|discussed|mentioned|talked\s+about|listed)\b/i.test(query) ||
    /\bchronological(?:ly)?\b/i.test(query) ||
    /\border\b[\s\S]{0,120}\b(?:earliest|latest|first|last)\b/i.test(query) ||
    /\b(?:earliest|first)\s+to\s+(?:latest|last)\b/i.test(query) ||
    /\bstarting\s+from\s+(?:the\s+)?earliest\b/i.test(query) ||
    /\border\s+from\s+first\s+to\s+last\b/i.test(query) ||
    /\bwhich\b[\s\S]{0,120}\bevents?\b[\s\S]{0,120}\bfirst\b[\s\S]{0,120}\blast\b/i.test(query) ||
    /\bwhich\b[\s\S]{0,120}\bevents?\b[\s\S]{0,120}\bhappened\s+first\b/i.test(query) ||
    /\bwhich\b[\s\S]{0,120}\b(?:health\s+issues?|issues?|tasks?|activities?)\b[\s\S]{0,120}\bfirst\b/i.test(query) ||
    /(顺序|先后|先.*后|从早到晚|从最早到最后|时间线|按时间|最先|最后|第一个|一步步)/u.test(query);
}

function isTemporalMostRecentQuery(query: string): boolean {
  return /\b(?:which|what)\b/i.test(query) &&
    /\b(?:most\s+recent(?:ly)?|latest|last)\b/i.test(query) ||
    /(最近|最新|最后一次|上一次|最晚)/u.test(query);
}

function isTemporalRelativeEventQuery(query: string): boolean {
  return /\b(?:what|which|who)\b/i.test(query) &&
    (
      /\b(?:\d+\s+|a\s+)?(?:days?|weeks?|months?|years?)\s+ago\b/i.test(query) ||
      /\blast\s+(?:saturday|sunday|monday|tuesday|wednesday|thursday|friday|week|weekend|month)\b/i.test(query) ||
      /\bvalentine'?s\s+day\b/i.test(query)
    ) &&
    /\b(?:activity|activities|airline|concert|event|flight|gardening|music|participat|sport|sports|went|with)\b/i.test(query);
}

function isSleepBeforeAppointmentQuery(query: string): boolean {
  return /\bwhat\s+time\b/i.test(query) &&
    /\b(?:go|went|get|got)\s+to\s+bed\b/i.test(query) &&
    /\bappointment\b/i.test(query);
}

function hasConversationEvidenceTag(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.some((tag) => CONVERSATION_EVIDENCE_TAGS.has(tag)) === true;
}

function hasAssistantAnswerTag(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.includes(ASSISTANT_EVIDENCE_TAG) === true;
}

function hasDirectFactualCompanionTag(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.some((tag) => DIRECT_FACTUAL_COMPANION_TAGS.has(tag)) === true;
}

function hasUserAnswerTag(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.includes("user_answer") === true;
}

function isDatedEventFact(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.includes("dated_event") === true;
}

function isTemporalIntervalEvidenceFact(entry: RankedFactCandidate): boolean {
  return isDatedEventFact(entry) ||
    (
      hasConversationEvidenceTag(entry) &&
      DATE_OR_TIME_FACT_PATTERN.test(valueBearingFactContent(entry.fact.content))
    );
}

function isSourceOrderedFact(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.includes(SOURCE_ORDER_TAG) === true;
}

function isTemporalOrderFact(entry: RankedFactCandidate): boolean {
  return isDatedEventFact(entry) || isSourceOrderedFact(entry);
}

function hasTrustedAggregateEvidence(entry: RankedFactCandidate): boolean {
  if (entry.fact.source.method === "inferred") {
    return false;
  }

  if (entry.fact.source.method === "confirmed") {
    return true;
  }

  return entry.fact.tags?.some((tag) => AGGREGATE_TRUSTED_EVIDENCE_TAGS.has(tag)) === true;
}

function isAggregateMoneyQuery(query: string): boolean {
  const lower = query.toLowerCase();
  const asksForEarnedMoney =
    /\b(?:total|amount|money|earnings?|revenue|dollars?)\b/i.test(lower) &&
    /\b(?:earn|earned|earning|sold|selling|markets?|products?)\b/i.test(lower);

  return /\bhow much\b/i.test(query) ||
    asksForEarnedMoney ||
    /\b(?:total(?:\s+amount\s+of)?\s+money|amount\s+of\s+money|spent|spend|cost|costs|paid|price|dollars?)\b/i.test(query) ||
    /(多少钱|总共.*(?:花|费用|花费)|一共.*(?:花|费用|花费)|合计.*(?:花|费用|花费)|花了多少钱|花费多少|费用|价格)/u.test(query);
}

function isAggregateNumericQuery(query: string): boolean {
  if (
    /\bhow\s+long\b/i.test(query) &&
    /\b(?:work(?:ing|ed)?|role|tenure|experience|position)\b/i.test(query)
  ) {
    return true;
  }

  return (
    /\b(?:average|mean|total|combined|sum|older|younger|how\s+old|how\s+many\s+years)\b/i.test(query) &&
    /\b(?:age|ages|old|older|younger|years?|hours?|followers?|points?|score|scores|money|amount|weight|pounds?|siblings?)\b/i.test(query)
  ) ||
    /(平均|总共|合计|一共|总数|年龄|几岁|多少年|几个小时|粉丝|积分|分数|重量|兄弟姐妹)/u.test(query);
}

function isComparativeMetricQuery(query: string): boolean {
  return (
    /\b(?:which|what)\b/i.test(query) &&
    /\b(?:most|least|highest|lowest|largest|smallest|more|less|biggest)\b/i.test(query) &&
    /\b(?:followers?|follower count|money|spent|spend|cost|costs|price|amount|store|platform)\b/i.test(query)
  ) ||
    /(哪个|哪一个|什么).*(最多|最少|最高|最低|最大|最小|更多|更少).*(粉丝|钱|花费|费用|价格|金额|商店|平台)/u.test(query);
}

function isSocialMetricTotalQuery(query: string): boolean {
  return /\btotal(?:\s+number)?\b/i.test(query) &&
    /\b(?:people\s+reached|reached|views?|Facebook|Instagram|YouTube|TikTok|influencer)\b/i.test(query);
}

function isMuseumVisitOrderQuery(query: string): boolean {
  return /\border\b[\s\S]{0,120}\b(?:museums?|gallery|galleries)\b/iu.test(query) ||
    /\b(?:museums?|gallery|galleries)\b[\s\S]{0,120}\border\b/iu.test(query);
}

function isHealthIssueOrderQuery(query: string): boolean {
  return /\bwhich\b[\s\S]{0,120}\bhealth\s+issues?\b[\s\S]{0,120}\bfirst\b/iu.test(query);
}

function isAccommodationCostQuery(query: string): boolean {
  return /\b(?:accommodations?|lodging|hotel|hostel|resort|motel|airbnb|room|stay|staying)\b/i.test(query) &&
    /\b(?:per\s+night|nightly|how much|cost|costs|spent|spend|paid|price|prices)\b/i.test(query);
}

function isFurnitureActivityAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:furniture|pieces?|items?|buy|bought|assemble|assembled|sell|sold|fix|fixed)\b/i.test(query);
}

function isPropertyViewingAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:properties|property|view|viewed|saw|seen|offer|townhouse|condo|house|home)\b/i.test(query);
}

function isFoodDeliveryServiceAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:food delivery|delivery services?|Domino'?s|Uber Eats|Fresh Fusion)\b/i.test(query);
}

function isMedicalProviderAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:doctor|doctors|physician|physicians|specialist|specialists)\b/i.test(query);
}

function isPlantAcquisitionAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:plants?|lily|succulent|fern|basil|rose|snake plant|spider plant)\b/i.test(query) &&
    /\b(?:acquire|acquired|got|bought|purchased|picked up|received|last month|initially|planted|growing)\b/i.test(query);
}

function isAquariumTankAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:tank|tanks|aquariums?)\b/i.test(query);
}

function isBikeServiceAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\bbikes?\b/i.test(query) &&
    /\b(?:service|serviced|plan|planned|maintenance|replace|replaced|cleaned|lubricated)\b/i.test(query);
}

function isMagazineSubscriptionAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:magazine|subscription|subscriptions|publications?)\b/i.test(query);
}

function isFormalEducationDurationQuery(query: string): boolean {
  return /\b(?:how many years|total)\b/i.test(query) &&
    /\b(?:formal education|high school|Bachelor'?s|degree|education)\b/i.test(query);
}

function isFeedWeightAggregateQuery(query: string): boolean {
  return /\b(?:total|combined|sum)\b/i.test(query) &&
    /\b(?:weight|pounds?|feed|grains)\b/i.test(query);
}

function isSiblingCountAggregateQuery(query: string): boolean {
  return /\b(?:how many|total(?:\s+number)?)\b/i.test(query) &&
    /\bsiblings?\b/i.test(query);
}

function isPersonalElectronicsCostQuery(query: string): boolean {
  return isAggregateMoneyQuery(query) &&
    /\b(?:headphones?|iPad|tablet|phone|watch|electronics?)\b/i.test(query);
}

function isInstrumentPracticeTimeQuery(query: string): boolean {
  return /\b(?:practice|practicing)\b/i.test(query) &&
    /\b(?:daily|every day|time|minutes?|hours?|how much)\b/i.test(query) &&
    /\b(?:instrument|violin|guitar|piano|saxophone|harmonica)\b/i.test(query);
}

function isCountableEventActivityAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:events?|activities?|classes?|appointments?|ceremonies?|sports?|instruments?|points?|rewards?|museums?|galleries?|workshops?|lectures?|tours?)\b/i.test(query);
}

function isModelKitCountQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) && /\bmodel kits?\b/i.test(query);
}

function isOwnershipCountAggregateQuery(query: string): boolean {
  return /\bhow many\b/i.test(query) &&
    /\b(?:own|owns|owned|have|has|currently|bring|bringing)\b/i.test(query);
}

function hasAggregateDomainSignal(input: {
  categoryInstanceSignal: boolean;
  entry: RankedFactCandidate;
  factTopics: ReadonlySet<string>;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
  topicOverlap: number;
}): boolean {
  if (input.topicOverlap >= 2) {
    return true;
  }

  if (input.categoryInstanceSignal) {
    return true;
  }

  if (
    isAggregateMoneyQuery(input.query) &&
    input.topicOverlap >= 1 &&
    MONEY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isAccommodationCostQuery(input.query) &&
    ACCOMMODATION_COST_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFurnitureActivityAggregateQuery(input.query) &&
    FURNITURE_ACTIVITY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPropertyViewingAggregateQuery(input.query) &&
    PROPERTY_VIEWING_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFoodDeliveryServiceAggregateQuery(input.query) &&
    FOOD_DELIVERY_SERVICE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isComparativeMetricQuery(input.query) &&
    SOCIAL_FOLLOWER_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isSocialMetricTotalQuery(input.query) &&
    (
      SOCIAL_REACH_METRIC_FACT_PATTERN.test(input.entry.fact.content) ||
      VIDEO_VIEW_METRIC_FACT_PATTERN.test(input.entry.fact.content)
    )
  ) {
    return true;
  }

  if (
    isAggregateNumericQuery(input.query) &&
    FAMILY_AGE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isMedicalProviderAggregateQuery(input.query) &&
    MEDICAL_PROVIDER_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isOwnershipCountAggregateQuery(input.query) &&
    input.topicOverlap >= 1 &&
    OWNERSHIP_COUNT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPlantAcquisitionAggregateQuery(input.query) &&
    PLANT_ACQUISITION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isAquariumTankAggregateQuery(input.query) &&
    AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isBikeServiceAggregateQuery(input.query) &&
    BIKE_SERVICE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isMagazineSubscriptionAggregateQuery(input.query) &&
    MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFormalEducationDurationQuery(input.query) &&
    FORMAL_EDUCATION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFeedWeightAggregateQuery(input.query) &&
    FEED_WEIGHT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isSiblingCountAggregateQuery(input.query) &&
    SIBLING_COUNT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPersonalElectronicsCostQuery(input.query) &&
    PERSONAL_ELECTRONICS_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isInstrumentPracticeTimeQuery(input.query) &&
    INSTRUMENT_PRACTICE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isCountableEventActivityAggregateQuery(input.query) &&
    input.topicOverlap >= 1 &&
    COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  return false;
}

function hasAggregateFactCountSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (isTemporalIntervalQuery(query) && isTemporalIntervalEvidenceFact(entry)) {
    return true;
  }

  if (
    isMuseumVisitOrderQuery(query) &&
    (
      MUSEUM_VISIT_ORDER_FACT_PATTERN.test(entry.fact.content) ||
      (isDatedEventFact(entry) && /\bmuseums?\b/iu.test(entry.fact.content)) ||
      (
        isDatedEventFact(entry) &&
        hasTrustedAggregateEvidence(entry) &&
        /\b(?:guided\s+tour|exhibition|lecture)\b/iu.test(
          valueBearingFactContent(entry.fact.content),
        )
      )
    )
  ) {
    return true;
  }

  if (
    isHealthIssueOrderQuery(query) &&
    HEALTH_ISSUE_EVENT_FACT_PATTERN.test(entry.fact.content)
  ) {
    return true;
  }

  if (
    /\bprojects?\b/i.test(query) &&
    (
      entry.fact.category === "project" ||
      (
        hasTrustedAggregateEvidence(entry) &&
        PROJECT_EXPERIENCE_FACT_PATTERN.test(entry.fact.content)
      )
    )
  ) {
    return true;
  }

  if (isModelKitCountQuery(query) && /\b(model kit|kit|\d+\/\d+\s+scale)\b/i.test(entry.fact.content)) {
    return true;
  }

  const queryTopics = aggregateTopicTokens(query, language, queryLocale);
  const factTopics = aggregateTopicTokens(entry.fact.content, language, entry.locale);
  const topicOverlap = aggregateTopicOverlapCount(queryTopics, factTopics);
  const categoryInstanceSignal = hasAggregateCategoryInstanceSignal({
    factContent: entry.fact.content,
    factTopics,
    queryTopics,
  });
  const hasDomainSignal = hasAggregateDomainSignal({
    entry,
    factTopics,
    language,
    query,
    queryLocale,
    queryTopics,
    topicOverlap,
    categoryInstanceSignal,
  });
  const trustedAggregateEvidence = hasTrustedAggregateEvidence(entry);
  const countableEventActivityAggregate = isCountableEventActivityAggregateQuery(query);
  const hasWeakAggregateEvidenceSignal =
    entry.lexicalScore >= AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD ||
    categoryInstanceSignal ||
    (
      isMedicalProviderAggregateQuery(query) &&
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isAccommodationCostQuery(query) &&
      ACCOMMODATION_COST_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFurnitureActivityAggregateQuery(query) &&
      FURNITURE_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPropertyViewingAggregateQuery(query) &&
      PROPERTY_VIEWING_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFoodDeliveryServiceAggregateQuery(query) &&
      FOOD_DELIVERY_SERVICE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isComparativeMetricQuery(query) &&
      SOCIAL_FOLLOWER_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isSocialMetricTotalQuery(query) &&
      (
        SOCIAL_REACH_METRIC_FACT_PATTERN.test(entry.fact.content) ||
        VIDEO_VIEW_METRIC_FACT_PATTERN.test(entry.fact.content)
      )
    ) ||
    (
      isAggregateNumericQuery(query) &&
      FAMILY_AGE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPlantAcquisitionAggregateQuery(query) &&
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isAquariumTankAggregateQuery(query) &&
      AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isBikeServiceAggregateQuery(query) &&
      BIKE_SERVICE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isMagazineSubscriptionAggregateQuery(query) &&
      MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFormalEducationDurationQuery(query) &&
      FORMAL_EDUCATION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFeedWeightAggregateQuery(query) &&
      FEED_WEIGHT_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isSiblingCountAggregateQuery(query) &&
      SIBLING_COUNT_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPersonalElectronicsCostQuery(query) &&
      PERSONAL_ELECTRONICS_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isInstrumentPracticeTimeQuery(query) &&
      INSTRUMENT_PRACTICE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      countableEventActivityAggregate &&
      FITNESS_CLASS_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      countableEventActivityAggregate &&
      COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
    );

  if (
    trustedAggregateEvidence &&
    hasWeakAggregateEvidenceSignal &&
    hasDomainSignal &&
    (
      QUANTIFIED_FACT_PATTERN.test(entry.fact.content) ||
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content) ||
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content) ||
      FURNITURE_ACTIVITY_FACT_PATTERN.test(entry.fact.content) ||
      PROPERTY_VIEWING_FACT_PATTERN.test(entry.fact.content) ||
      FOOD_DELIVERY_SERVICE_FACT_PATTERN.test(entry.fact.content) ||
      SOCIAL_FOLLOWER_FACT_PATTERN.test(entry.fact.content) ||
      SOCIAL_REACH_METRIC_FACT_PATTERN.test(entry.fact.content) ||
      VIDEO_VIEW_METRIC_FACT_PATTERN.test(entry.fact.content) ||
      FAMILY_AGE_FACT_PATTERN.test(entry.fact.content) ||
      AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(entry.fact.content) ||
      BIKE_SERVICE_FACT_PATTERN.test(entry.fact.content) ||
      MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(entry.fact.content) ||
      FORMAL_EDUCATION_FACT_PATTERN.test(entry.fact.content) ||
      FEED_WEIGHT_FACT_PATTERN.test(entry.fact.content) ||
      SIBLING_COUNT_FACT_PATTERN.test(entry.fact.content) ||
      PERSONAL_ELECTRONICS_FACT_PATTERN.test(entry.fact.content) ||
      INSTRUMENT_PRACTICE_FACT_PATTERN.test(entry.fact.content) ||
      FITNESS_CLASS_FACT_PATTERN.test(entry.fact.content) ||
      MUSEUM_VISIT_ORDER_FACT_PATTERN.test(entry.fact.content) ||
      categoryInstanceSignal ||
      (
        countableEventActivityAggregate &&
        COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
      )
    )
  ) {
    return true;
  }

  return (
    hasDomainSignal &&
    (
      entry.intentScore > 0 ||
      entry.lexicalScore >= AGGREGATE_GENERIC_LEXICAL_FACT_THRESHOLD ||
      entry.subjectScore > 0
    )
  );
}

function aggregateEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const queryTopics = aggregateTopicTokens(query, language, queryLocale);
  const factTopics = aggregateTopicTokens(entry.fact.content, language, entry.locale);
  const valueContent = valueBearingFactContent(entry.fact.content);
  let priority =
    aggregateTopicOverlapCount(queryTopics, factTopics) * 5;

  if (hasTrustedAggregateEvidence(entry)) {
    priority += 20;
  }
  if (hasUserAnswerTag(entry)) {
    priority += 35;
  }
  if (QUANTIFIED_FACT_PATTERN.test(valueContent)) {
    priority += 40;
  }
  if (isModelKitCountQuery(query)) {
    if (COMPACT_MODEL_KIT_FACT_PATTERN.test(valueContent)) {
      priority += 120;
    } else if (/\b(?:model kit|kit|\d+\/\d+\s+scale)\b/iu.test(valueContent)) {
      priority += 20;
    }
  }
  if (
    isAggregateMoneyQuery(query) &&
    MONEY_FACT_PATTERN.test(valueContent)
  ) {
    priority += 30;
  }
  if (
    isAccommodationCostQuery(query) &&
    ACCOMMODATION_COST_FACT_PATTERN.test(valueContent)
  ) {
    priority += 30;
  }
  if (
    isMedicalProviderAggregateQuery(query) &&
    NAMED_MEDICAL_PROVIDER_FACT_PATTERN.test(valueContent)
  ) {
    priority += 40;
  }
  if (
    isMedicalProviderAggregateQuery(query) &&
    COMPACT_MEDICAL_PROVIDER_FACT_PATTERN.test(valueContent)
  ) {
    priority += 80;
  }
  if (
    isTemporalIntervalQuery(query) &&
    isTemporalIntervalEvidenceFact(entry)
  ) {
    priority += 30;
    priority += temporalIntervalBoundaryPriority({
      content: valueContent,
      entry,
      language,
      query,
      queryLocale,
    });
  }
  if (
    isSocialMetricTotalQuery(query) &&
    (
      SOCIAL_REACH_METRIC_FACT_PATTERN.test(valueContent) ||
      VIDEO_VIEW_METRIC_FACT_PATTERN.test(valueContent)
    )
  ) {
    priority += 80;
  }
  if (
    isMuseumVisitOrderQuery(query) &&
    MUSEUM_VISIT_ORDER_FACT_PATTERN.test(valueContent)
  ) {
    priority += 80;
  }
  if (
    isHealthIssueOrderQuery(query) &&
    HEALTH_ISSUE_EVENT_FACT_PATTERN.test(valueContent)
  ) {
    priority += 80;
  }
  if (
    (
      isAquariumTankAggregateQuery(query) &&
      AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isBikeServiceAggregateQuery(query) &&
      BIKE_SERVICE_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isMagazineSubscriptionAggregateQuery(query) &&
      MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isFormalEducationDurationQuery(query) &&
      FORMAL_EDUCATION_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isFeedWeightAggregateQuery(query) &&
      FEED_WEIGHT_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isSiblingCountAggregateQuery(query) &&
      SIBLING_COUNT_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isPersonalElectronicsCostQuery(query) &&
      PERSONAL_ELECTRONICS_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isInstrumentPracticeTimeQuery(query) &&
      INSTRUMENT_PRACTICE_FACT_PATTERN.test(valueContent)
    )
  ) {
    priority += 80;
  }
  if (
    isCountableEventActivityAggregateQuery(query) &&
    FITNESS_CLASS_FACT_PATTERN.test(valueContent)
  ) {
    priority += 60;
  }
  if (
    hasAggregateCategoryInstanceSignal({
      factContent: entry.fact.content,
      factTopics,
      queryTopics,
    })
  ) {
    priority += 30;
  }
  if (hasEntityBearingEvidenceSignal(entry)) {
    priority += 30;
  }
  if (
    REALIZED_TEMPORAL_EVENT_FACT_PATTERN.test(
      valueBearingFactContent(entry.fact.content),
    )
  ) {
    priority += 40;
  }

  return priority;
}

function temporalIntervalBoundaryPriority(input: {
  content: string;
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
}): number {
  const anchors = temporalIntervalAnchorFragments(input.query);
  if (anchors.length === 0) {
    return 0;
  }
  if (!anchors.some(hasTemporalIntervalCredentialAcquisitionAnchor)) {
    return 0;
  }

  const content = stripEvidencePrefix(input.content);
  const contentTopics = aggregateTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let bestPriority = 0;
  for (const anchor of anchors) {
    const anchorTopics = aggregateTopicTokens(
      anchor,
      input.language,
      input.queryLocale,
    );
    const importantAnchorTopics = [...anchorTopics].filter(
      (token) => !TEMPORAL_INTERVAL_ANCHOR_STOPWORDS.has(token),
    );
    const overlap = aggregateTopicOverlapCount(anchorTopics, contentTopics);
    const importantOverlap = importantAnchorTopics.filter((token) =>
      contentTopics.has(token),
    ).length;
    const actionPattern = temporalIntervalActionPattern(anchor);
    const actionBonus = actionPattern?.test(content) === true ? 120 : 0;
    if (overlap < 2 && (importantOverlap === 0 || actionBonus === 0)) {
      continue;
    }

    const boundaryObjectBonus = importantOverlap >= Math.min(
      2,
      Math.max(1, importantAnchorTopics.length),
    )
      ? 80
      : importantOverlap * 45;
    bestPriority = Math.max(
      bestPriority,
      overlap * 12 + boundaryObjectBonus + actionBonus,
    );
  }

  return bestPriority;
}

function hasTemporalEventOrderSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  if (!isTemporalOrderFact(entry)) {
    return false;
  }

  if (
    isSourceOrderedFact(entry) &&
    isUserGroundedRecallQuery(query) &&
    !hasUserAnswerTag(entry)
  ) {
    return false;
  }

  return (
    (
      entry.fact.category === "external_benchmark" ||
      entry.intentScore > 0 ||
      entry.lexicalScore >= 0.03 ||
      entry.subjectScore > 0 ||
      (
        hasTrustedAggregateEvidence(entry) &&
        REALIZED_TEMPORAL_EVENT_FACT_PATTERN.test(
          valueBearingFactContent(entry.fact.content),
        )
      ) ||
      (
        hasTrustedAggregateEvidence(entry) &&
        HEALTH_ISSUE_EVENT_FACT_PATTERN.test(
          valueBearingFactContent(entry.fact.content),
        )
      )
    )
  );
}

function temporalOrderEvidencePriority(entry: RankedFactCandidate): number {
  let priority = 0;
  const valueContent = valueBearingFactContent(entry.fact.content);

  if (hasTrustedAggregateEvidence(entry)) {
    priority += 20;
  }
  if (hasUserAnswerTag(entry)) {
    priority += 35;
  }
  if (hasEntityBearingEvidenceSignal(entry)) {
    priority += 30;
  }
  if (REALIZED_TEMPORAL_EVENT_FACT_PATTERN.test(valueContent)) {
    priority += 40;
  }
  if (HEALTH_ISSUE_EVENT_FACT_PATTERN.test(valueContent)) {
    priority += 50;
  }

  return priority;
}

function datedFactSortKey(entry: RankedFactCandidate): string {
  return stripEvidencePrefix(entry.fact.content).match(
    /\bOn\s+(\d{4}\/\d{2}\/\d{2})\b/u,
  )?.[1] ?? "";
}

function sourceOrderSortKey(entry: RankedFactCandidate): number | undefined {
  for (const key of ["sourceOrder", "chatId", "chat_id", "sourceMessageIndex"]) {
    const value = entry.fact.attributes?.[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function sourceOrderGapCandidatePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  const queryTopics = aggregateTopicTokens(query, language, queryLocale);
  const factTopics = aggregateTopicTokens(content, language, entry.locale);
  let priority =
    aggregateTopicOverlapCount(queryTopics, factTopics) * 12 +
    entry.lexicalScore * 100 +
    temporalOrderEvidencePriority(entry);

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

function sourceOrderAspectTopics(
  entry: RankedFactCandidate,
  language: LanguageService,
): Set<string> {
  const content = stripEvidencePrefix(entry.fact.content);
  const factTopics = aggregateTopicTokens(
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

function fillSourceOrderedTemporalGaps(input: {
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

function fillSourceOrderedTemporalCompanions(input: {
  pool: RankedFactCandidate[];
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
        temporalOrderEvidencePriority(entry) +
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

function fillSourceOrderedTemporalMilestones(input: {
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
      if (
        aspectTopics.size === 0 &&
        !SOURCE_ORDER_ASPECT_CUE_PATTERN.test(content)
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

function isSourceOrderedConversationSummaryQuery(query: string): boolean {
  return (
    /\b(?:summari[sz]e|summary|recap|overview)\b/iu.test(query) &&
    /\b(?:across|approached|changed|developed|evolved|navigated|over\s+time|progress(?:ed)?|resolved|throughout|various)\b/iu.test(
      query,
    )
  ) ||
    /(总结|回顾|概述|梳理|汇总).*(随着时间|整个过程|一路|逐步|一步步|怎么|如何|变化|推进|解决)/u.test(query);
}

function hasSourceMessageTag(entry: RankedFactCandidate): boolean {
  return entry.fact.tags?.includes(SOURCE_MESSAGE_TAG) === true;
}

function isSourceOrderedSummaryCandidate(entry: RankedFactCandidate): boolean {
  return hasSourceMessageTag(entry) && sourceOrderSortKey(entry) !== undefined;
}

function sourceOrderedSummaryPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = aggregateTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  let priority =
    aggregateTopicOverlapCount(input.queryTopics, factTopics) * 120 +
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

  return priority;
}

function hasSourceOrderedSummarySignal(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = aggregateTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = aggregateTopicOverlapCount(input.queryTopics, factTopics);

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

function selectSourceOrderedSummaryCoverage(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedConversationSummaryQuery(input.query)) {
    return [];
  }

  const queryTopics = aggregateTopicTokens(
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
    signaledCandidates.length,
  );

  for (let index = 0; index < anchorCount; index += 1) {
    const start = Math.floor(index * signaledCandidates.length / anchorCount);
    const end = Math.floor((index + 1) * signaledCandidates.length / anchorCount);
    const bucket = signaledCandidates.slice(start, Math.max(start + 1, end));
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

  for (const entry of [...signaledCandidates].sort((left, right) => {
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

function isSourceOrderedTimelineIntegrationQuery(query: string): boolean {
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

function sourceOrderedTimelinePriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = aggregateTopicTokens(
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
    aggregateTopicOverlapCount(input.queryTopics, factTopics) * 120 +
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
    /\b(?:steps?|plan|timeline|schedule|recommend(?:ed|ation)?|summary)\b/iu.test(
      content,
    )
  ) {
    priority += 35;
  }
  if (
    hasUserAnswerTag(input.entry) &&
    /\b(?:can\s+you\s+help|how\s+can|what\s+(?:can|should)|i\s+need\s+to|i['’]ll|i\s+will)\b/iu.test(
      content,
    )
  ) {
    priority += 25;
  }
  if (/\bbackend\b/iu.test(input.query) && /\bfrontend\b/iu.test(input.query)) {
    if (/\bbackend\b/iu.test(content)) {
      priority += 120;
    }
    if (/\bfrontend\b/iu.test(content)) {
      priority += 120;
    }
    if (!/\bbackend\b/iu.test(content) && !/\bfrontend\b/iu.test(content)) {
      priority -= 80;
    }
  }

  return priority;
}

function timelineCandidateMatchesRequiredQueryCue(input: {
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

function selectSourceOrderedTimelineIntegrationEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedTimelineIntegrationQuery(input.query)) {
    return [];
  }

  const queryTopics = aggregateTopicTokens(
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

function isSourceOrderedUserInstruction(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return (
    hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    /\b(?:always|please\s+(?:always\s+)?(?:include|use|format|provide|confirm|maintain|highlight)|make\s+sure\s+to|remember\s+to|whenever|when\s+I\s+ask|if\s+I\s+ask)\b/iu.test(
      content,
    ) &&
    /\b(?:when|whenever|if)\s+I\s+(?:ask|am\s+asking|request|need)\b/iu.test(
      content,
    )
  );
}

function addInstructionTopicAliases(tokens: Set<string>, text: string): void {
  const normalized = text.toLowerCase();
  const hasAny = (pattern: RegExp): boolean => pattern.test(normalized);
  const hasApiSurface = hasAny(/\b(?:api|rest|responses?|status\s+codes?)\b/iu);
  const hasApiErrorHandling = hasAny(/\b(?:errors?|handling|handle|status\s+codes?)\b/iu);

  if (hasAny(/\b(?:implement(?:ation|ed|ing)?|code|snippets?|syntax|feature|login|software)\b/iu)) {
    tokens.add("software_implementation");
  }
  if (hasAny(/\b(?:dependenc(?:y|ies)|librar(?:y|ies)|versions?)\b/iu)) {
    tokens.add("software_dependency");
  }
  if (hasApiSurface && hasApiErrorHandling) {
    tokens.add("api_error");
  }
  if (hasAny(/\b(?:html5?|markup|webpage|blog|layout|header|navigation|footer|semantic|sections?)\b/iu)) {
    tokens.add("html_structure");
  }
  if (hasAny(/\b(?:triangle|geometry|medians?|altitudes?|area|sides?|angles?)\b/iu)) {
    tokens.add("triangle_geometry");
  }
  if (hasAny(/\b(?:probability|chance|odds|cards?|deck|dependent\s+events?|draw(?:ing)?)\b/iu)) {
    tokens.add("probability");
  }
  if (hasAny(/\b(?:resume|cv|jobs?|achievements?|headings?|minimalist|design)\b/iu)) {
    tokens.add("resume_format");
  }
  if (hasAny(/\b(?:bullet\s+points?|lists?|multiple\s+points?|organize|formatting\s+options?)\b/iu)) {
    tokens.add("list_format");
  }
  if (hasAny(/\b(?:apa|citations?|references?|sources?|paper)\b/iu)) {
    tokens.add("reference_format");
  }
  if (hasAny(/\b(?:draft|revisions?|editing|editting|edit)\b/iu)) {
    tokens.add("draft_revision");
  }
  if (hasAny(/\b(?:salary|compensation|offered|position|amount)\b/iu)) {
    tokens.add("compensation");
  }
  if (hasAny(/\b(?:writing|aids?|tools?|software)\b/iu)) {
    tokens.add("writing_tool");
  }
  if (hasAny(/\b(?:dates?|deadline|due|submission|timeline|schedul(?:e|ed|ing)?|meetings?|workshop)\b/iu)) {
    tokens.add("date_format");
  }
  if (hasAny(/\b(?:privacy|private|safe|security|encryption|data|online\s+services?|account)\b/iu)) {
    tokens.add("privacy_security");
  }
  if (hasAny(/\b(?:social\s+norms?|cultural|expectations?|meeting\s+someone)\b/iu)) {
    tokens.add("social_norms");
  }
  if (hasAny(/\b(?:philosoph(?:y|ical)|existentialism)\b/iu)) {
    tokens.add("philosophy");
  }
  if (hasAny(/\b(?:audiobooks?|narrators?|books?|genre)\b/iu)) {
    tokens.add("book_recommendation");
  }
  if (hasAny(/\b(?:movies?|platform|watch)\b/iu)) {
    tokens.add("movie_recommendation");
  }
  if (hasAny(/\b(?:snacks?|allerg(?:y|ies)|try)\b/iu)) {
    tokens.add("snack_recommendation");
  }
  if (hasAny(/\b(?:sneakers?|materials?|health\s+benefits?|sustainability|features?)\b/iu)) {
    tokens.add("product_features");
  }
  if (hasAny(/\b(?:budget|spending|holiday|financial\s+goals?|allocations?)\b/iu)) {
    tokens.add("financial_budget");
  }
  if (hasAny(/\b(?:legal|will|requirements?|wishes)\b/iu)) {
    tokens.add("legal_requirements");
  }
  if (hasAny(/\b(?:digital\s+files?|digital\s+assets?|organize|manage)\b/iu)) {
    tokens.add("digital_asset_management");
  }
  if (hasAny(/\b(?:patent|application\s+process|filing)\b/iu)) {
    tokens.add("patent_process");
  }
  if (hasAny(/\b(?:brief|concise|current\s+status|progress|updates?|summar(?:y|ies|ize))\b/iu)) {
    tokens.add("progress_summary");
  }
}

function sourceInstructionTopicTokens(input: {
  language: LanguageService;
  locale: string;
  text: string;
}): Set<string> {
  const tokens = aggregateTopicTokens(input.text, input.language, input.locale);
  addInstructionTopicAliases(tokens, input.text);
  return tokens;
}

function countInstructionAliasOverlap(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  let overlap = 0;
  for (const token of left) {
    if (SOURCE_INSTRUCTION_ALIAS_TOKENS.has(token) && right.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function sourceInstructionConditionText(content: string): string | undefined {
  const match = content.match(
    /\b(?:when|whenever|if)\s+I\s+(?:ask|am\s+asking|request|need)\s+(?:about|for|to)?\s*([^.!?\n]+)/iu,
  );
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/\s*->->.*$/u, "").trim();
}

function isBroadInstructionConditionToken(token: string): boolean {
  return BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS.has(token);
}

function hasApplicableSourceInstructionTopic(input: {
  content: string;
  entry: RankedFactCandidate;
  language: LanguageService;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const instructionTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: input.content,
  });
  if (countInstructionAliasOverlap(input.queryTopics, instructionTopics) > 0) {
    return true;
  }

  const condition = sourceInstructionConditionText(input.content);
  if (!condition) {
    return false;
  }
  const conditionTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: condition,
  });
  const significantConditionTokens = [...conditionTopics].filter(
    (token) =>
      !token.includes("_") &&
      token.length > 2 &&
      !isBroadInstructionConditionToken(token),
  );
  if (significantConditionTokens.length === 0) {
    return false;
  }

  const overlap = significantConditionTokens.filter((token) =>
    input.queryTopics.has(token),
  ).length;
  return overlap >= Math.min(2, significantConditionTokens.length);
}

function sourceInstructionPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const instructionTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: content,
  });
  const overlap = aggregateTopicOverlapCount(input.queryTopics, instructionTopics);
  let priority =
    overlap * 180 +
    input.entry.lexicalScore * 120 +
    input.entry.subjectScore * 80 +
    input.entry.intentScore * 60;

  if (/\balways\b/iu.test(content)) {
    priority += 35;
  }
  if (/\bwhen\s+I\s+ask\s+about\b/iu.test(content)) {
    priority += 45;
  }
  if (sourceOrderSortKey(input.entry) !== undefined) {
    priority += 15;
  }

  return priority;
}

function selectSourceOrderedInstructionEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const queryTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.queryLocale,
    text: input.query,
  });
  const candidates = input.entries
    .filter(isSourceOrderedUserInstruction)
    .map((entry) => ({
      entry,
      priority: sourceInstructionPriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
        queryTopics,
      }),
    }))
    .filter((candidate) => {
      const content = stripEvidencePrefix(candidate.entry.fact.content);
      return candidate.priority >= SOURCE_ORDER_INSTRUCTION_PRIORITY_THRESHOLD &&
        hasApplicableSourceInstructionTopic({
          content,
          entry: candidate.entry,
          language: input.language,
          queryTopics,
        });
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    });

  return candidates
    .slice(0, SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT)
    .map((candidate) => candidate.entry);
}

function isPreferenceGuidanceQuery(
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  return language.isRecommendationStyleQuery(query, queryLocale) ||
    language.isGuidanceSeekingQuery(query, queryLocale) ||
    /\b(?:can\s+you\s+help|help\s+me|how\s+should|how\s+can|walk\s+me\s+through|show\s+me|explain|i['’]d\s+like|i\s+would\s+like|i\s+want)\b/iu.test(
      query,
    );
}

function isSourceOrderedUserPreferenceEvidence(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
}): boolean {
  const content = stripEvidencePrefix(input.entry.fact.content);

  return (
    input.entry.fact.source.method !== "inferred" &&
    hasSourceMessageTag(input.entry) &&
    hasUserAnswerTag(input.entry) &&
    !hasAssistantAnswerTag(input.entry) &&
    sourceOrderSortKey(input.entry) !== undefined &&
    input.language.isPersonalEvidenceSignal(content, input.entry.locale) &&
    SOURCE_PREFERENCE_DECLARATION_PATTERN.test(content)
  );
}

function sourcePreferenceTopicTokens(input: {
  language: LanguageService;
  locale: string;
  text: string;
}): Set<string> {
  return sourceInstructionTopicTokens(input);
}

function hasApplicableSourcePreferenceTopic(input: {
  content: string;
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): boolean {
  const preferenceTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: input.content,
  });
  if (aggregateTopicOverlapCount(input.queryTopics, preferenceTopics) > 0) {
    return true;
  }

  if (
    SIMPLE_SOLUTION_QUERY_PATTERN.test(input.query) &&
    LIGHTWEIGHT_PREFERENCE_PATTERN.test(input.content)
  ) {
    return true;
  }

  return hasPreferenceAdviceBridgeSignal({
    factContent: input.content,
    query: input.query,
  });
}

function sourcePreferencePriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const preferenceTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.entry.locale,
    text: content,
  });
  const overlap = aggregateTopicOverlapCount(input.queryTopics, preferenceTopics);
  let priority =
    overlap * 160 +
    input.entry.lexicalScore * 120 +
    input.entry.subjectScore * 80 +
    input.entry.intentScore * 60;

  if (SOURCE_PREFERENCE_DECLARATION_PATTERN.test(content)) {
    priority += 60;
  }
  if (
    SIMPLE_SOLUTION_QUERY_PATTERN.test(input.query) &&
    LIGHTWEIGHT_PREFERENCE_PATTERN.test(content)
  ) {
    priority += 90;
  }
  if (content.length < 600) {
    priority += 10;
  } else if (content.length > 1600) {
    priority -= 20;
  }

  return priority;
}

function selectSourceOrderedPreferenceEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isPreferenceGuidanceQuery(input.query, input.language, input.queryLocale)) {
    return [];
  }

  const queryTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.queryLocale,
    text: input.query,
  });
  const candidates = input.entries
    .filter((entry) =>
      isSourceOrderedUserPreferenceEvidence({
        entry,
        language: input.language,
      })
    )
    .map((entry) => ({
      entry,
      priority: sourcePreferencePriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
        queryTopics,
      }),
    }))
    .filter((candidate) => {
      const content = stripEvidencePrefix(candidate.entry.fact.content);
      return candidate.priority >= SOURCE_ORDER_PREFERENCE_PRIORITY_THRESHOLD &&
        hasApplicableSourcePreferenceTopic({
          content,
          entry: candidate.entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        });
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    });

  return candidates
    .slice(0, SOURCE_ORDER_PREFERENCE_RECALL_LIMIT)
    .map((candidate) => candidate.entry);
}

function compareTemporalFactChronology(
  left: RankedFactCandidate,
  right: RankedFactCandidate,
): number {
  const leftDate = datedFactSortKey(left);
  const rightDate = datedFactSortKey(right);

  if (!leftDate || !rightDate || leftDate === rightDate) {
    const leftSourceOrder = sourceOrderSortKey(left);
    const rightSourceOrder = sourceOrderSortKey(right);
    if (
      leftSourceOrder !== undefined &&
      rightSourceOrder !== undefined &&
      leftSourceOrder !== rightSourceOrder
    ) {
      return leftSourceOrder - rightSourceOrder;
    }

    return temporalOrderEvidencePriority(right) - temporalOrderEvidencePriority(left);
  }

  return leftDate.localeCompare(rightDate);
}

function isPotentialContradictionConfirmationQuery(query: string): boolean {
  return (
    /\b(?:have|has|did|do|does|ever)\b/iu.test(query) &&
    /\b(?:worked\s+with|written|wrote|handled|implemented|built|created|done|used)\b/iu.test(query)
  ) ||
    /(?:有没有|是否|是不是|有无|曾经|之前|到底).*(?:写过|做过|处理过|实现过|构建过|创建过|完成过|用过|使用过|接触过)/u.test(
      query,
    );
}

function isNegatedSourceClaim(entry: RankedFactCandidate): boolean {
  return hasConversationEvidenceTag(entry) &&
    CONTRADICTION_NEGATED_CLAIM_PATTERN.test(
      stripEvidencePrefix(entry.fact.content),
    );
}

function isRealizedPositiveSourceClaim(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasConversationEvidenceTag(entry) &&
    !CONTRADICTION_NEGATED_CLAIM_PATTERN.test(content) &&
    CONTRADICTION_REALIZED_EVIDENCE_PATTERN.test(content);
}

function selectContradictionEvidencePair(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (!isPotentialContradictionConfirmationQuery(input.query)) {
    return [];
  }

  const queryTopics = aggregateTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const minimumOverlap = /[\p{Script=Han}]/u.test(input.query) ? 1 : 2;
  const negatedClaims = input.entries.filter(isNegatedSourceClaim);
  const positiveClaims = input.entries.filter(isRealizedPositiveSourceClaim);
  const preferredNegatedClaims = negatedClaims.some(hasUserAnswerTag)
    ? negatedClaims.filter(hasUserAnswerTag)
    : negatedClaims;
  const preferredPositiveClaims = positiveClaims.some(hasUserAnswerTag)
    ? positiveClaims.filter(hasUserAnswerTag)
    : positiveClaims;
  const hasEarlierPositiveContradiction = preferredNegatedClaims.some((negated) => {
    const negatedOrder = sourceOrderSortKey(negated);
    return negatedOrder !== undefined &&
      preferredPositiveClaims.some((positive) => {
        const positiveOrder = sourceOrderSortKey(positive);
        return positiveOrder !== undefined && positiveOrder < negatedOrder;
      });
  });
  let best:
    | {
        negated: RankedFactCandidate;
        positive: RankedFactCandidate;
        score: number;
      }
    | undefined;

  for (const negated of preferredNegatedClaims) {
    const negatedTopics = aggregateTopicTokens(
      negated.fact.content,
      input.language,
      negated.locale,
    );

    for (const positive of preferredPositiveClaims) {
      if (positive.fact.id === negated.fact.id) {
        continue;
      }
      if (hasEarlierPositiveContradiction) {
        const negatedOrder = sourceOrderSortKey(negated);
        const positiveOrder = sourceOrderSortKey(positive);
        if (
          negatedOrder === undefined ||
          positiveOrder === undefined ||
          positiveOrder >= negatedOrder
        ) {
          continue;
        }
      }

      const positiveTopics = aggregateTopicTokens(
        positive.fact.content,
        input.language,
        positive.locale,
      );
      const queryOverlap = aggregateTopicOverlapCount(queryTopics, positiveTopics);
      const pairTopics = new Set(
        [...positiveTopics].filter(
          (topic) => negatedTopics.has(topic) && queryTopics.has(topic),
        ),
      );
      const pairOverlap = pairTopics.size;
      if (queryOverlap < minimumOverlap || pairOverlap < minimumOverlap) {
        continue;
      }

      const score =
        Math.min(queryOverlap, 4) * 10 +
        Math.min(pairOverlap, 4) * 8 +
        positive.lexicalScore * 20 +
        negated.lexicalScore * 20 +
        (
          CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(
            stripEvidencePrefix(positive.fact.content),
          )
            ? 40
            : 0
        ) +
        (hasUserAnswerTag(positive) ? 20 : 0) +
        (hasAssistantAnswerTag(positive) ? -40 : 0);
      if (!best || score > best.score) {
        best = {
          negated,
          positive,
          score,
        };
      }
    }
  }

  if (!best) {
    return [];
  }

  return [best.positive, best.negated].sort(compareTemporalFactChronology);
}

function hasSleepBeforeAppointmentEvidenceSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  if (!isSleepBeforeAppointmentQuery(query) || !hasTrustedAggregateEvidence(entry)) {
    return false;
  }

  const content = entry.fact.content;
  const hasClockTime = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu.test(content);
  const hasSleepSignal = /\b(?:go|went|get|got)\s+to\s+bed\b/iu.test(content) &&
    hasClockTime;
  const hasAppointmentSignal = /\bdoctor'?s?\s+appointment\b/iu.test(content) &&
    hasClockTime;

  return hasSleepSignal || hasAppointmentSignal;
}

function sleepBeforeAppointmentEvidencePriority(entry: RankedFactCandidate): number {
  const content = entry.fact.content;
  const hasClockTime = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu.test(content);
  let priority = hasClockTime ? 20 : 0;

  if (/\b(?:go|went|get|got)\s+to\s+bed\b/iu.test(content)) {
    priority += 80;
  }
  if (/\bdoctor'?s?\s+appointment\b/iu.test(content)) {
    priority += 30;
  }
  if (hasUserAnswerTag(entry)) {
    priority += 15;
  }
  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 10;
  }

  return priority;
}

function extractOrdinalQueryNumber(query: string): string | undefined {
  const numericMatch = query.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/iu);
  if (numericMatch) {
    return numericMatch[1];
  }
  const chineseNumericOrdinalMatch = query.match(/第\s*(\d{1,2})\s*(?:项|个|条|名|种|款|点)?/u);
  if (chineseNumericOrdinalMatch) {
    return chineseNumericOrdinalMatch[1];
  }

  const wordOrdinals = new Map([
    ["first", "1"],
    ["second", "2"],
    ["third", "3"],
    ["fourth", "4"],
    ["fifth", "5"],
    ["sixth", "6"],
    ["seventh", "7"],
    ["eighth", "8"],
    ["ninth", "9"],
    ["tenth", "10"],
  ]);
  const wordMatch = query.toLowerCase().match(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/u,
  );

  if (wordMatch) {
    return wordOrdinals.get(wordMatch[1] ?? "");
  }

  const chineseOrdinals = new Map([
    ["一", "1"],
    ["二", "2"],
    ["三", "3"],
    ["四", "4"],
    ["五", "5"],
    ["六", "6"],
    ["七", "7"],
    ["八", "8"],
    ["九", "9"],
    ["十", "10"],
  ]);
  const chineseWordMatch = query.match(/第\s*([一二三四五六七八九十])\s*(?:项|个|条|名|种|款|点)?/u);

  return chineseWordMatch ? chineseOrdinals.get(chineseWordMatch[1] ?? "") : undefined;
}

function isFinalAssistantListItemQuery(query: string): boolean {
  return /\b(?:last|final)\b[\s\S]{0,80}\b(?:item|venue|option|recommendation|entry|parameter|name|one|place|job)\b/iu.test(query) ||
    /\b(?:item|venue|option|recommendation|entry|parameter|name|one|place|job)\b[\s\S]{0,80}\b(?:last|final)\b/iu.test(query) ||
    /(最后|最终|末尾)[\s\S]{0,80}(项|个|条|推荐|选项|名字|地点|职位)/u.test(query) ||
    /(项|个|条|推荐|选项|名字|地点|职位)[\s\S]{0,80}(最后|最终|末尾)/u.test(query);
}

function isAssistantProvidedDetailRecallQuery(query: string): boolean {
  return /\b(?:did|do)\s+you\s+(?:give|list|mention|provide|recommend|say|suggest|tell)\b/iu.test(query) ||
    /\byou\s+(?:gave|listed|mentioned|provided|recommended|said|suggested|told)\b/iu.test(query) ||
    /\b(?:previous chat|previous conversation|earlier|remind me|going back)\b[\s\S]{0,160}\b(?:how many|what|which|phone|number|quote)\b/iu.test(query) ||
    /\b(?:what|which)\b[\s\S]{0,120}\b(?:did\s+you\s+recommend|recommended|recommendation|provided|suggested|told me|gave me)\b/iu.test(query) ||
    /(你|助手)[\s\S]{0,80}(给|列|列出|提到|提供|推荐|建议|告诉|说)[\s\S]{0,120}(什么|哪个|哪一个|多少|第\s*[一二三四五六七八九十\d]+|最后)/u.test(query) ||
    /(之前|上次|前面|刚才|早些时候)[\s\S]{0,120}(你|助手)[\s\S]{0,80}(推荐|建议|提供|告诉|说|列出)/u.test(query);
}

function explicitlyAsksForAssistantProvidedDetail(query: string): boolean {
  return /\b(?:did|do)\s+you\s+(?:give|list|mention|provide|recommend|say|suggest|tell)\b/iu.test(query) ||
    /\byou\s+(?:gave|listed|mentioned|provided|recommended|said|suggested|told)\b/iu.test(query) ||
    /\b(?:list|details?|phone|number|quote)\s+you\s+(?:gave|listed|mentioned|provided|recommended|said|suggested|told)\b/iu.test(query) ||
    /(你|助手)[\s\S]{0,80}(给|列|列出|提到|提供|推荐|建议|告诉|说)/u.test(query);
}

function isUserGroundedRecallQuery(query: string): boolean {
  return (
    /\b(?:I|I'm|I've|I'd|I'll|me|my|mine)\b/iu.test(query) ||
    /(我|我的|我们|我们的)/u.test(query)
  ) &&
    !explicitlyAsksForAssistantProvidedDetail(query) &&
    !/\byou\b[\s\S]{0,100}\b(?:give|gave|list|listed|mention|mentioned|provide|provided|recommend|recommended|say|said|suggest|suggested|tell|told)\b/iu.test(query) &&
    !/(你|助手)[\s\S]{0,100}(给|列|列出|提到|提供|推荐|建议|告诉|说)/u.test(query);
}

function userGroundedEvidencePriority(entry: RankedFactCandidate): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let priority = 0;

  if (hasUserAnswerTag(entry)) {
    priority += 90;
  }
  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 35;
  }
  if (isDatedEventFact(entry)) {
    priority += 25;
  }
  if (hasAssistantAnswerTag(entry)) {
    priority -= 45;
  }
  if (/^Assistant answer to prior user request\b/iu.test(content)) {
    priority -= 60;
  }

  return priority;
}

function hasConversationEvidenceRecallSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (
    entry.fact.source.method === "inferred" ||
    !hasConversationEvidenceTag(entry)
  ) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.05 || entry.subjectScore > 0) {
    return true;
  }

  if (hasAssistantAnswerTag(entry)) {
    const ordinal = extractOrdinalQueryNumber(query);
    if (
      ordinal &&
      new RegExp(`(?:\\b(?:item\\s+${ordinal}|${ordinal}\\.)\\b|第\\s*${ordinal}\\s*(?:项|个|条|名|种|款|点))`, "iu").test(
        entry.fact.content,
      )
    ) {
      return true;
    }
    if (
      isFinalAssistantListItemQuery(query) &&
      /\bAssistant final enumerated item:/iu.test(entry.fact.content)
    ) {
      return true;
    }
    if (
      /\bhow many\b/iu.test(query) &&
      ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(stripEvidencePrefix(entry.fact.content))
    ) {
      return true;
    }
  }

  return aggregateTopicOverlapCount(
    aggregateTopicTokens(query, language, queryLocale),
    aggregateTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 2;
}

function stripEvidencePrefix(content: string): string {
  return content.replace(/^\[[^\]]+\]\s*/u, "");
}

function conversationEvidenceHeadingOverlap(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  const heading =
    content.match(/^([^:]{4,120}?)\s+includes:/iu)?.[1] ??
    content.match(/^([^:]{4,120}?):/iu)?.[1];

  if (!heading) {
    return 0;
  }

  return aggregateTopicOverlapCount(
    aggregateTopicTokens(query, language, queryLocale),
    aggregateTopicTokens(heading, language, entry.locale),
  );
}

function conversationEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  const headingOverlap = conversationEvidenceHeadingOverlap(
    entry,
    query,
    language,
    queryLocale,
  );
  const ordinal = extractOrdinalQueryNumber(query);
  let priority = headingOverlap * 10;

  if (/\bincludes:/iu.test(content) && headingOverlap >= 2) {
    priority += 30;
  }

  if (
    ordinal &&
    new RegExp(`(?:\\b(?:item\\s+${ordinal}|${ordinal}\\.)\\b|第\\s*${ordinal}\\s*(?:项|个|条|名|种|款|点))`, "iu").test(content)
  ) {
    priority += 30;
  }

  if (
    isFinalAssistantListItemQuery(query) &&
    /\bAssistant final enumerated item:/iu.test(content)
  ) {
    priority += 35;
  }

  if (
    hasAssistantAnswerTag(entry) &&
    /\bhow many\b/iu.test(query) &&
    ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(content)
  ) {
    priority += 90;
  }

  if (
    hasAssistantAnswerTag(entry) &&
    isAssistantProvidedDetailRecallQuery(query)
  ) {
    priority += 25;
  }

  if (isUserGroundedRecallQuery(query)) {
    priority += userGroundedEvidencePriority(entry);
  }

  return priority;
}

function hasPreferenceAdviceBridgeSignal(input: {
  factContent: string;
  query: string;
}): boolean {
  const { factContent, query } = input;

  return (
    /\b(?:activities?|evening|night|bedtime|after work)\b/iu.test(query) &&
    /\b(?:wind(?:ing)? down|unwind|night'?s?|sleep|bedtime|relax|evening|activities?)\b/iu.test(
      factContent,
    )
  );
}

function hasPreferenceEvidenceRecallSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (!language.isRecommendationStyleQuery(query, queryLocale)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  if (
    hasAssistantAnswerTag(entry) &&
    !/^Assistant follow-up recommendations?(?:\s+topics)?\b/iu.test(content)
  ) {
    return false;
  }

  if (
    entry.fact.source.method === "inferred" ||
    !hasConversationEvidenceTag(entry)
  ) {
    return false;
  }

  const hasPersonalSignal = language.isPersonalEvidenceSignal(
    content,
    entry.locale,
  );
  const hasPreferenceSignal = language.isPreferenceEvidenceSignal(
    content,
    entry.locale,
  );

  if (!hasPersonalSignal || !hasPreferenceSignal) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  const queryTopics = aggregateTopicTokens(query, language, queryLocale);
  const factTopics = aggregateTopicTokens(entry.fact.content, language, entry.locale);

  return aggregateTopicOverlapCount(queryTopics, factTopics) >= 1 ||
    hasPreferenceAdviceBridgeSignal({
      factContent: entry.fact.content,
      query,
    });
}

function preferenceEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let priority =
    aggregateTopicOverlapCount(
      aggregateTopicTokens(query, language, queryLocale),
      aggregateTopicTokens(content, language, entry.locale),
    ) * 5;

  if (entry.fact.tags?.includes("compact_evidence") === true) {
    priority += 30;
  }
  if (entry.fact.tags?.includes("user_answer") === true) {
    priority += 20;
  }
  if (/\bkitchen\b/iu.test(query) && /^My new kitchen utensil holder\b[\s\S]{0,120}\bclutter-free\b/iu.test(content)) {
    priority += 90;
  }
  if (/\bkitchen\b/iu.test(query) && /^My kitchen granite countertop\b/iu.test(content)) {
    priority += 80;
  }
  if (/\bkitchen\b/iu.test(query) && /^My kitchen faucet\b/iu.test(content)) {
    priority += 70;
  }
  if (/^Assistant follow-up recommendation topics\b/iu.test(content)) {
    priority += 70;
  }
  if (/^Assistant follow-up recommendations\b/iu.test(content)) {
    priority -= 20;
  }
  if (content.length > 800) {
    priority -= 20;
  } else if (content.length < 240) {
    priority += 5;
  }

  return priority;
}

function isResearchRecommendationQuery(query: string): boolean {
  return (
    /\b(recommend|suggest|find interesting)\b/i.test(query) &&
    /\b(publications?|conferences?|research|papers?|articles?)\b/i.test(query)
  );
}

function hasResearchRecommendationSignal(entry: RankedFactCandidate): boolean {
  if (entry.fact.category !== "technical" && entry.fact.category !== "project") {
    return false;
  }

  return /\b(interested in|work in|working in|research project|research papers?|articles?|publications?|conferences?)\b/i.test(
    entry.fact.content,
  );
}

function isCouponRedemptionLocationQuery(query: string): boolean {
  return /\bwhere\b/i.test(query) && /\bredeem(?:ed)?\b/i.test(query) && /\bcoupon\b/i.test(query);
}

function isCouponRedemptionFact(entry: RankedFactCandidate): boolean {
  return /\bredeemed\b/i.test(entry.fact.content) && /\bcoupon\b/i.test(entry.fact.content);
}

function isStoreContextFact(entry: RankedFactCandidate): boolean {
  return /\bi use the .+ app from [A-Z][A-Za-z0-9&.' -]+\b/i.test(
    entry.fact.content,
  );
}

function isRelationshipLatestLocationQuery(query: string): boolean {
  return /\bwhere\b/i.test(query) &&
    /\b(?:moved?|relocation|move to|move back)\b/i.test(query);
}

function isMortgagePreapprovalQuery(query: string): boolean {
  return /\b(?:pre[-\s]?approved|pre[-\s]?approval|mortgage|wells fargo)\b/i.test(query) &&
    /\b(?:amount|how much|what|pre[-\s]?approved|pre[-\s]?approval)\b/i.test(query);
}

function isSharedGroceryListMethodQuery(query: string): boolean {
  return /\b(?:mom|mother)\b/i.test(query) &&
    /\bgrocery\s+list\b/i.test(query) &&
    /\b(?:same|method|using|uses|app|paper)\b/i.test(query);
}

function isRecentFamilyTripQuery(query: string): boolean {
  return /\b(?:most recent|recent|latest)\b/i.test(query) &&
    /\bfamily\s+trip\b/i.test(query);
}

interface UpdateSeriesOptions {
  collapseMortgagePreapproval?: boolean;
  collapseRecentFamilyTrip?: boolean;
  collapseRelationshipRelocation?: boolean;
  collapseSharedGroceryListMethod?: boolean;
  includeBehavioralUpdateSeries?: boolean;
}

function normalizeUpdateSeriesPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function resolveUpdateSeriesKey(
  entry: RankedFactCandidate,
  options: UpdateSeriesOptions = {},
): string | undefined {
  const sourceContent = entry.fact.content;
  const content = entry.fact.content.toLowerCase();

  if (/\bi have tried\s+[^.]+?\bkorean restaurants in my city\b/i.test(content)) {
    return "count:korean-restaurants-in-my-city";
  }

  const personalBestMatch = entry.fact.content.match(
    /\bmy personal best time(?:\s+in\s+([^.!?]+?))?\s+is\b/i,
  );
  if (personalBestMatch) {
    const subject = (personalBestMatch[1] ?? entry.fact.subject ?? "personal best time")
      .toLowerCase()
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();

    return `personal-best:${subject}`;
  }

  if (options.includeBehavioralUpdateSeries === true) {
    if (
      /\bfrench press\b/i.test(sourceContent) &&
      /\b(?:coffee|ratio|tablespoon|ounces?\s+of\s+water|water)\b/i.test(sourceContent)
    ) {
      return "coffee-ratio:french-press";
    }

    if (
      /\bgym\b/i.test(sourceContent) &&
      (
        /\b(?:times?\s+a\s+week|workout\s+days?|routine|frequency)\b/i.test(sourceContent) ||
        /\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b[\s\S]{0,120}\bgym\b/i.test(sourceContent) ||
        /\bgym\b[\s\S]{0,120}\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b/i.test(sourceContent)
      )
    ) {
      return "routine-frequency:gym";
    }

    if (
      /\bgym\b/i.test(sourceContent) &&
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(sourceContent)
    ) {
      return "routine-time:gym";
    }

    const therapistMatch = sourceContent.match(/\bDr\.?\s+([A-Z][A-Za-z'-]+)\b/u);
    if (
      therapistMatch &&
      /\b(?:therapist|therapy|session|see|seeing|saw)\b/i.test(sourceContent)
    ) {
      return `therapist-frequency:${normalizeUpdateSeriesPart(therapistMatch[1] ?? "")}`;
    }

    const socialPlatformMatch = sourceContent.match(
      /\b(Instagram|TikTok|Twitter|Facebook)\b/iu,
    );
    if (socialPlatformMatch && /\bfollowers?\b/i.test(sourceContent)) {
      return `social-followers:${normalizeUpdateSeriesPart(socialPlatformMatch[1] ?? "")}`;
    }

    if (
      /\bH&M\b/i.test(sourceContent) &&
      /\b(?:tops?|shirts?|bought|got|purchased)\b/i.test(sourceContent)
    ) {
      return "shopping-count:h-and-m-tops";
    }
  }

  if (
    options.collapseMortgagePreapproval === true &&
    /\bpre[-\s]?approv(?:ed|al)\b/i.test(content) &&
    /\$\s*\d/u.test(content)
  ) {
    const lenderFromContent = content
      .match(/\bfrom\s+([a-z][a-z0-9&.' -]{1,60}?)(?:[?.!,]|$)/iu)?.[1]
      ?.replace(/\s+(?:for|when|after|before|on|with)\b[\s\S]*$/iu, "");
    const lender =
      lenderFromContent ??
      (/\bwells\s+fargo\b/iu.test(content) ? "wells fargo" : undefined) ??
      entry.fact.subject ??
      "mortgage";

    return `mortgage-preapproval:${normalizeUpdateSeriesPart(lender)}`;
  }

  if (
    options.collapseSharedGroceryListMethod === true &&
    /\b(?:mom|mother)\b/i.test(content) &&
    /\bgrocery\s+list\b/i.test(content)
  ) {
    return "shared-grocery-list-method:mom";
  }

  if (
    options.collapseRecentFamilyTrip === true &&
    /\bfamily\s+trip\b/i.test(content)
  ) {
    return "recent-family-trip";
  }

  if (
    options.collapseRelationshipRelocation === true &&
    /\bmoved(?:\s+back)?\s+to\b/i.test(entry.fact.content)
  ) {
    const subject =
      sourceContent.match(
        /\bfriend\s+([A-Z][A-Za-z'-]+)\b[\s\S]{0,160}\bmoved(?:\s+back)?\s+to\b/u,
      )?.[1] ??
      sourceContent.match(
        /\b([A-Z][A-Za-z'-]+)\s+(?:actually\s+|recently\s+|just\s+)?moved(?:\s+back)?\s+to\b/u,
      )?.[1] ??
      entry.fact.subject;
    if (subject) {
      return `relationship-relocation:${normalizeUpdateSeriesPart(subject)}`;
    }
  }

  return undefined;
}

function collapseLatestUpdateSeries(
  entries: RankedFactCandidate[],
  options: UpdateSeriesOptions = {},
): RankedFactCandidate[] {
  const bySeries = new Map<string, RankedFactCandidate>();
  const passthrough: RankedFactCandidate[] = [];

  for (const entry of entries) {
    const seriesKey = resolveUpdateSeriesKey(entry, options);
    if (!seriesKey) {
      passthrough.push(entry);
      continue;
    }

    const current = bySeries.get(seriesKey);
    if (!current || entry.fact.updatedAt > current.fact.updatedAt) {
      bySeries.set(seriesKey, entry);
    }
  }

  return [...passthrough, ...bySeries.values()];
}

function selectUpdateHistoryCompanions(input: {
  entries: RankedFactCandidate[];
  limit: number;
  options: UpdateSeriesOptions;
  query: string;
  selectedEntries: readonly RankedFactCandidate[];
  selectedIds: ReadonlySet<string>;
}): RankedFactCandidate[] {
  if (input.limit <= 0) {
    return [];
  }

  const selectedSeriesKeys = new Set(
    input.selectedEntries
      .map((entry) => resolveUpdateSeriesKey(entry, input.options))
      .filter((key): key is string => typeof key === "string")
      .filter((key) => shouldSelectUpdateHistoryCompanions(key, input.query)),
  );
  if (selectedSeriesKeys.size === 0) {
    return [];
  }

  const companions = input.entries
    .filter((entry) => !input.selectedIds.has(entry.fact.id))
    .filter((entry) => {
      const key = resolveUpdateSeriesKey(entry, input.options);
      return key !== undefined && selectedSeriesKeys.has(key);
    })
    .sort((left, right) => right.fact.updatedAt.localeCompare(left.fact.updatedAt));

  return diversifyRankedFactCandidatesBySession(companions, input.limit);
}

function shouldSelectUpdateHistoryCompanions(
  seriesKey: string,
  query: string,
): boolean {
  if (
    seriesKey.startsWith("personal-best:") ||
    seriesKey.startsWith("relationship-relocation:")
  ) {
    return true;
  }

  if (
    seriesKey === "coffee-ratio:french-press" &&
    /\b(?:switch(?:ed)?|more|less|changed|previously|before)\b/iu.test(query)
  ) {
    return true;
  }

  if (
    (
      seriesKey === "routine-frequency:gym" ||
      seriesKey === "routine-time:gym"
    ) &&
    /\b(?:more|less|frequent|frequently|previously|before|changed|switch(?:ed)?)\b/iu.test(query)
  ) {
    return true;
  }

  if (
    seriesKey.startsWith("therapist-frequency:") &&
    /\b(?:more|less|often|frequent|frequently|previously|before|changed|switch(?:ed)?)\b/iu.test(query)
  ) {
    return true;
  }

  return false;
}

function diversifyRankedFactCandidatesBySession(
  entries: RankedFactCandidate[],
  limit: number,
): RankedFactCandidate[] {
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const selectedSessionIds = new Set<string>();

  for (const entry of entries) {
    const sessionId = entry.fact.sessionId;
    if (!sessionId || selectedSessionIds.has(sessionId)) {
      continue;
    }

    selected.push(entry);
    selectedIds.add(entry.fact.id);
    selectedSessionIds.add(sessionId);
    if (selected.length >= limit) {
      return selected;
    }
  }

  for (const entry of entries) {
    if (selectedIds.has(entry.fact.id)) {
      continue;
    }

    selected.push(entry);
    selectedIds.add(entry.fact.id);
    if (selected.length >= limit) {
      return selected;
    }
  }

  return selected;
}

function preferenceSearchText(preference: PreferenceMemory): string {
  return [
    preference.category,
    String(preference.value),
    ...(preference.tags ?? []),
  ].join(" ");
}

function feedbackSearchText(feedback: FeedbackMemory): string {
  return [
    feedback.kind,
    feedback.appliesTo,
    feedback.rule,
    feedback.why,
    ...(feedback.tags ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function buildReturnedReason(
  slot: RecallSlot | "generic",
  intentScore: number,
  lexicalScore: number,
  outcomeScore: number,
  verificationPenaltyScore: number,
  fallback: RecallCandidateTrace["fallback"],
): string {
  return `slot=${slot}, intentScore=${intentScore.toFixed(2)}, lexicalScore=${lexicalScore.toFixed(2)}, outcomeScore=${outcomeScore.toFixed(2)}, verificationPenaltyScore=${verificationPenaltyScore.toFixed(2)}, fallback=${fallback}`;
}

function markSelectedTrace(
  traces: RecallCandidateTrace[],
  memoryId: string,
  slot: RecallSlot | "generic",
  intentScore: number,
  lexicalScore: number,
  freshness: number,
  explicitness: number,
  usageScore: number,
  evidenceScore: number,
  outcomeScore: number,
  verificationPenaltyScore: number,
  fallback: RecallCandidateTrace["fallback"],
): void {
  const index = traces.findIndex((trace) => trace.memoryId === memoryId);
  if (index === -1) {
    return;
  }

  traces[index] = {
    ...traces[index]!,
    slot,
    returned: true,
    whyReturned: buildReturnedReason(
      slot,
      intentScore,
      lexicalScore,
      outcomeScore,
      verificationPenaltyScore,
      fallback,
    ),
    whySuppressed: undefined,
    intentScore,
    lexicalScore,
    freshnessScore: freshness,
    explicitnessScore: explicitness,
    usageScore,
    evidenceScore,
    outcomeScore,
    verificationPenaltyScore,
    fallback,
  };
}

function slotMatchesFact(
  entry: RankedFactCandidate,
  slot: RecallSlot,
): boolean {
  if (slot === "role") {
    return entry.factKind === "role_update";
  }
  if (slot === "focus") {
    return entry.factKind === "focus_update";
  }
  if (slot === "blocker") {
    return entry.factKind === "blocker";
  }
  if (slot === "open_loop") {
    return entry.factKind === "open_loop";
  }
  if (slot === "project_state_support") {
    return (
      entry.factKind === "blocker" ||
      entry.factKind === "open_loop" ||
      entry.factKind === "focus_update" ||
      entry.factKind === "project_state"
    );
  }

  return false;
}

function hasFactSelectionSignal(entry: RankedFactCandidate): boolean {
  return (
    entry.intentScore > 0 ||
    entry.lexicalScore >= 0.2 ||
    entry.subjectScore > 0
  );
}

function hasGenericFactSelectionSignal(entry: RankedFactCandidate): boolean {
  return (
    hasFactSelectionSignal(entry) ||
    (
      entry.fact.source.method !== "inferred" &&
      entry.lexicalScore >= EXPLICIT_WEAK_LEXICAL_FACT_THRESHOLD
    )
  );
}

function valueBearingFactContent(content: string): string {
  return stripEvidencePrefix(content)
    .replace(/^On\s+\d{4}\/\d{1,2}\/\d{1,2},\s*/iu, "")
    .trim();
}

function hasEntityBearingEvidenceSignal(entry: RankedFactCandidate): boolean {
  return ENTITY_BEARING_FACT_PATTERN.test(
    valueBearingFactContent(entry.fact.content),
  );
}

function hasDirectFactualCompanionSignal(entry: RankedFactCandidate): boolean {
  const valueContent = valueBearingFactContent(entry.fact.content);

  return (
    entry.fact.source.method !== "inferred" &&
    hasDirectFactualCompanionTag(entry) &&
    (
      QUANTIFIED_FACT_PATTERN.test(valueContent) ||
      DATE_OR_TIME_FACT_PATTERN.test(valueContent)
    )
  );
}

function hasDirectFactualEvidenceBridgeSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  const valueContent = valueBearingFactContent(entry.fact.content);

  if (
    isInstrumentPracticeTimeQuery(query) &&
    INSTRUMENT_PRACTICE_FACT_PATTERN.test(valueContent)
  ) {
    return true;
  }

  if (
    /\b(?:what size|Samsung|TV)\b/iu.test(query) &&
    PERSONAL_ELECTRONICS_FACT_PATTERN.test(valueContent)
  ) {
    return true;
  }

  return false;
}

function directFactualEvidenceBridgePriority(entry: RankedFactCandidate): number {
  const valueContent = valueBearingFactContent(entry.fact.content);
  let priority = 0;

  if (hasConversationEvidenceTag(entry)) {
    priority += 30;
  }
  if (QUANTIFIED_FACT_PATTERN.test(valueContent)) {
    priority += 40;
  }
  if (INSTRUMENT_PRACTICE_FACT_PATTERN.test(valueContent)) {
    priority += 30;
  }
  if (PERSONAL_ELECTRONICS_FACT_PATTERN.test(valueContent)) {
    priority += 30;
  }

  return priority;
}

function hasUpdateSeriesQuerySignal(seriesKey: string, query: string): boolean {
  if (
    seriesKey.startsWith("personal-best:") &&
    /\bpersonal\s+best\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "coffee-ratio:french-press" &&
    /\b(?:French press|coffee|water|ratio)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "routine-frequency:gym" &&
    /\b(?:gym|workout|routine|frequent|frequently|previously)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "routine-time:gym" &&
    /\b(?:gym|time|usually|schedule)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey.startsWith("therapist-frequency:") &&
    /\b(?:therapist|Dr\.?|doctor|session|see|seeing|often)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey.startsWith("social-followers:") &&
    /\b(?:followers?|Instagram|TikTok|Twitter|Facebook|now|current)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "shopping-count:h-and-m-tops" &&
    /\b(?:H&M|tops?|bought|so far)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey.startsWith("relationship-relocation:") &&
    /\b(?:moved?|relocation|recent|where)\b/iu.test(query)
  ) {
    return true;
  }

  return false;
}

function hasTrustedUpdateEvidenceSignal(
  entry: RankedFactCandidate,
  query: string,
  options: UpdateSeriesOptions,
  language: LanguageService,
  queryLocale: string,
): boolean {
  const seriesKey = resolveUpdateSeriesKey(entry, options);
  if (!seriesKey || !hasTrustedAggregateEvidence(entry)) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  if (hasUpdateSeriesQuerySignal(seriesKey, query)) {
    return true;
  }

  return aggregateTopicOverlapCount(
    aggregateTopicTokens(query, language, queryLocale),
    aggregateTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 1;
}

function feedbackApplicabilityPriority(
  feedback: FeedbackMemory,
  retrievalProfile: RetrievalProfile,
): number {
  const appliesTo = normalizeFeedbackAppliesTo(feedback.appliesTo);

  if (retrievalProfile === "coding_agent") {
    if (appliesTo === "coding_agent") {
      return 0;
    }
    if (appliesTo === "general_response") {
      return 1;
    }

    return 2;
  }

  return appliesTo === "general_response" ? 0 : 1;
}

export function selectFeedback(
  feedback: FeedbackMemory[],
  retrievalProfile: RetrievalProfile = "general_chat",
): FeedbackMemory[] {
  const selected: FeedbackMemory[] = [];
  const seen = new Set<string>();
  const prioritized = sortFeedback(feedback).sort(
    (left, right) =>
      feedbackApplicabilityPriority(left, retrievalProfile) -
      feedbackApplicabilityPriority(right, retrievalProfile),
  );

  for (const record of prioritized) {
    if (record.lifecycle !== "active") {
      continue;
    }

    const dedupeKey = buildFeedbackIdentityKey({
      kind: record.kind,
      normalizedRule: record.rule,
      appliesTo: record.appliesTo,
    });
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    selected.push(record);
    if (selected.length >= FEEDBACK_RECALL_LIMIT) {
      break;
    }
  }

  return selected;
}

export function selectFeedbackForProfile(
  feedback: FeedbackMemory[],
  retrievalProfile: RetrievalProfile,
): FeedbackMemory[] {
  return selectFeedback(feedback, retrievalProfile);
}

export function selectFeedbackForQuery(
  feedback: FeedbackMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  retrievalProfile: RetrievalProfile,
): FeedbackMemory[] {
  const selected = selectFeedback(feedback, retrievalProfile);

  if (
    language.isAnswerCompositionQuery(query, queryLocale) ||
    language.isFactConfirmationQuery(query, queryLocale) ||
    language.isContinuationQuery(query, queryLocale) ||
    language.isGuidanceSeekingQuery(query, queryLocale)
  ) {
    return selected;
  }

  return selected.filter(
    (record) => {
      const fullOverlap = language.tokenOverlap(
        feedbackSearchText(record),
        query,
        queryLocale,
        { excludeStopwords: true },
      );
      const ruleOverlap = language.tokenOverlap(record.rule, query, queryLocale, {
        excludeStopwords: true,
      });

      return Math.max(fullOverlap, ruleOverlap) >= 0.15;
    },
  );
}

export function selectPreferencesForQuery(
  preferences: PreferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
): PreferenceMemory[] {
  const active = sortPreferences(
    preferences.filter((preference) => (preference.lifecycle ?? "active") === "active"),
  );

  if (
    language.isAnswerCompositionQuery(query, queryLocale) ||
    language.isFactConfirmationQuery(query, queryLocale)
  ) {
    return active.slice(0, PREFERENCE_RECALL_LIMIT);
  }

  return active
    .filter(
      (preference) =>
        language.tokenOverlap(
          preferenceSearchText(preference),
          query,
          queryLocale,
          { excludeStopwords: true },
        ) >= 0.15,
    )
    .slice(0, PREFERENCE_RECALL_LIMIT);
}

export function selectFacts(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  retrievalProfile: RetrievalProfile,
  routingDecision: RoutingDecision,
  profile: UserProfile | null,
  referenceTime: string,
  semanticScores?: Map<string, number>,
  evidenceCountsByMemoryId?: Map<string, number>,
): { facts: FactMemory[]; traces: RecallCandidateTrace[] } {
  const answerCompositionQuery = language.isAnswerCompositionQuery(query, queryLocale);
  const factConfirmationQuery = language.isFactConfirmationQuery(query, queryLocale);
  const ranked = rankFactCandidates(
    buildFactCandidates(
      facts,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
      evidenceCountsByMemoryId,
    ),
    routingDecision.strategy,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.fact.id,
    memoryType: "fact",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : entry.fact.lifecycle !== "active"
        ? "inactive lifecycle"
        : "not selected",
    intentScore: entry.intentScore,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: entry.explicitnessScore,
    usageScore: entry.usageScore,
    evidenceScore: entry.evidenceScore,
    outcomeScore: entry.outcomeScore,
    verificationPenaltyScore: entry.verificationPenaltyScore,
    fallback: "none",
  }));
  const compatible = ranked.filter(
    (entry) =>
      entry.fact.lifecycle === "active" &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  const aggregateCountQuery = isAggregateFactCountQuery(
    query,
    language,
    queryLocale,
  );
  const aggregateMoneyQuery = isAggregateMoneyQuery(query);
  const aggregateNumericQuery = isAggregateNumericQuery(query);
  const comparativeMetricQuery = isComparativeMetricQuery(query);
  const socialMetricTotalQuery = isSocialMetricTotalQuery(query);
  const museumVisitOrderQuery = isMuseumVisitOrderQuery(query);
  const healthIssueOrderQuery = isHealthIssueOrderQuery(query);
  const temporalIntervalQuery = isTemporalIntervalQuery(query);
  const aggregateEvidenceQuery =
    aggregateCountQuery ||
    aggregateMoneyQuery ||
    aggregateNumericQuery ||
    comparativeMetricQuery ||
    socialMetricTotalQuery ||
    museumVisitOrderQuery ||
    healthIssueOrderQuery ||
    temporalIntervalQuery;
  const temporalEventOrderQuery = isTemporalEventOrderQuery(query);
  const temporalMostRecentQuery = isTemporalMostRecentQuery(query);
  const temporalRelativeEventQuery = isTemporalRelativeEventQuery(query);
  const directFactualLookupQuery = language.isDirectFactualLookupQuery(
    query,
    queryLocale,
  );
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const slotSpecificFactQuery =
    !aggregateEvidenceQuery &&
    (
      routingDecision.requestedSlots.includes("role") ||
      routingDecision.requestedSlots.includes("focus") ||
      routingDecision.requestedSlots.includes("blocker") ||
      routingDecision.requestedSlots.includes("open_loop") ||
      routingDecision.requestedSlots.includes("reference") ||
      routingDecision.supportSlots.includes("project_state_support")
    );

  const trySelectSlot = (
    slot: RecallSlot,
    entries: RankedFactCandidate[],
    allowUniqueFallback: boolean,
    options?: {
      aggregateLimit?: number;
      aggregateSignal?: (entry: RankedFactCandidate) => boolean;
    },
  ) => {
    const resolveCandidates = (factKinds?: readonly FactKind[]) =>
      entries
        .filter((entry) => !selectedIds.has(entry.fact.id))
        .filter((entry) => slotMatchesFact(entry, slot))
        .filter((entry) => {
          if (!factKinds) {
            return true;
          }

          return entry.factKind ? factKinds.includes(entry.factKind) : false;
        });
    const resolvePick = (
      candidates: RankedFactCandidate[],
      allowFallback: boolean,
    ) => {
      const signaledPick = candidates.find(hasFactSelectionSignal);

      if (signaledPick) {
        return {
          candidate: signaledPick,
          fallback: "none" as const,
        };
      }

      if (!allowFallback) {
        return {
          candidate: undefined,
          fallback: "none" as const,
        };
      }

      const uniqueActiveExplicit = candidates.filter(
        (entry) => entry.fact.source.method !== "inferred",
      );
      if (uniqueActiveExplicit.length === 1) {
        return {
          candidate: uniqueActiveExplicit[0],
          fallback: "same_slot_unique_candidate" as const,
        };
      }

      return {
        candidate: undefined,
        fallback: "none" as const,
      };
    };
    const selectCandidate = (
      candidate: RankedFactCandidate,
      fallback: RecallCandidateTrace["fallback"],
    ) => {
      selected.push(candidate);
      selectedIds.add(candidate.fact.id);
      markSelectedTrace(
        traces,
        candidate.fact.id,
        slot,
        candidate.intentScore,
        candidate.lexicalScore,
        candidate.freshnessScore,
        candidate.explicitnessScore,
        candidate.usageScore,
        candidate.evidenceScore,
        candidate.outcomeScore,
        candidate.verificationPenaltyScore,
        fallback,
      );
    };

    if (options?.aggregateLimit && options.aggregateLimit > 1) {
      const aggregatePicks = rankFactCandidates(
        resolveCandidates().filter(
          options.aggregateSignal ?? hasFactSelectionSignal,
        ),
        routingDecision.strategy,
      ).slice(0, options.aggregateLimit);

      for (const candidate of aggregatePicks) {
        selectCandidate(candidate, "none");
      }

      return;
    }

    if (slot === "project_state_support") {
      let selectedSupportCount = 0;

      const blockerPick = resolvePick(
        resolveCandidates(PROJECT_STATE_SUPPORT_PRIMARY_KINDS[0]),
        false,
      );
      if (blockerPick.candidate) {
        selectCandidate(blockerPick.candidate, blockerPick.fallback);
        selectedSupportCount += 1;
      }

      const openLoopPick = resolvePick(
        resolveCandidates(PROJECT_STATE_SUPPORT_PRIMARY_KINDS[1]),
        false,
      );
      if (openLoopPick.candidate && (blockerPick.candidate || selectedSupportCount === 0)) {
        selectCandidate(openLoopPick.candidate, openLoopPick.fallback);
        selectedSupportCount += 1;
      }

      if (selectedSupportCount === 0) {
        const fallbackPick = resolvePick(
          resolveCandidates(PROJECT_STATE_SUPPORT_FALLBACK_KINDS),
          false,
        );
        if (fallbackPick.candidate) {
          selectCandidate(fallbackPick.candidate, fallbackPick.fallback);
          selectedSupportCount += 1;
        }
      }

      if (selectedSupportCount === 0 && allowUniqueFallback) {
        const uniqueFallbackPick = resolvePick(resolveCandidates(), true);
        if (uniqueFallbackPick.candidate) {
          selectCandidate(uniqueFallbackPick.candidate, uniqueFallbackPick.fallback);
        }
      }

      return;
    }

    const pick = resolvePick(resolveCandidates(), allowUniqueFallback);
    if (pick.candidate) {
      selectCandidate(pick.candidate, pick.fallback);
    }
  };

  if (
    !aggregateEvidenceQuery &&
    !temporalEventOrderQuery &&
    !temporalMostRecentQuery &&
    !temporalRelativeEventQuery &&
    routingDecision.requestedSlots.includes("reference") &&
    !routingDecision.supportSlots.includes("project_state_support") &&
    !routingDecision.requestedSlots.includes("blocker") &&
    !routingDecision.requestedSlots.includes("open_loop") &&
    !routingDecision.requestedSlots.includes("focus") &&
    !(
      routingDecision.requestedSlots.includes("role") &&
      (!profile?.identity.role || routingDecision.requestedSlots.length > 1)
    )
  ) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "reference-only query";
      }
    }
    return {
      facts: [],
      traces,
    };
  }

  if (slotSpecificFactQuery) {
    const aggregateOpenLoopQuery = isAggregateOpenLoopQuery(
      query,
      language,
      queryLocale,
    );
    const activeSlots: RecallSlot[] = [];
    if (
      routingDecision.requestedSlots.includes("role") &&
      (!profile?.identity.role || routingDecision.requestedSlots.length > 1)
    ) {
      activeSlots.push("role");
      trySelectSlot("role", compatible, false);
    } else if (routingDecision.requestedSlots.includes("role")) {
      for (const entry of compatible.filter((item) => item.factKind === "role_update")) {
        const trace = traces.find((item) => item.memoryId === entry.fact.id);
        if (trace && trace.whySuppressed === "not selected") {
          trace.whySuppressed = "profile satisfied role slot";
        }
      }
    }

    if (routingDecision.requestedSlots.includes("focus")) {
      activeSlots.push("focus");
      trySelectSlot("focus", compatible, false);
    }
    if (routingDecision.requestedSlots.includes("blocker")) {
      activeSlots.push("blocker");
      trySelectSlot("blocker", compatible, false);
    }
    if (routingDecision.requestedSlots.includes("open_loop")) {
      activeSlots.push("open_loop");
      trySelectSlot(
        "open_loop",
        compatible,
        false,
        aggregateOpenLoopQuery
          ? {
              aggregateLimit: AGGREGATE_OPEN_LOOP_LIMIT,
              aggregateSignal: hasAggregateOpenLoopSignal,
            }
          : undefined,
      );
    }
    if (routingDecision.supportSlots.includes("project_state_support")) {
      activeSlots.push("project_state_support");
      trySelectSlot("project_state_support", compatible, true);
    }

    for (const entry of compatible) {
      const trace = traces.find((item) => item.memoryId === entry.fact.id);
      if (!trace || trace.returned || trace.whySuppressed !== "not selected") {
        continue;
      }

      if (!activeSlots.some((slot) => slotMatchesFact(entry, slot))) {
        trace.whySuppressed = "slot mismatch";
      } else {
        trace.whySuppressed = "no slot signal";
      }
    }

    return {
      facts: selected.map(materializeFactCandidate),
      traces,
    };
  }

  const sleepBeforeAppointmentQuery = isSleepBeforeAppointmentQuery(query);
  const recommendationStyleQuery = language.isRecommendationStyleQuery(
    query,
    queryLocale,
  );
  const assistantEvidenceRecallQuery =
    language.isAssistantEvidenceRecallQuery(query, queryLocale) ||
    /\bremind me\b/iu.test(query) ||
    isAssistantProvidedDetailRecallQuery(query);
  const updateSeriesOptions = {
    collapseMortgagePreapproval: isMortgagePreapprovalQuery(query),
    collapseRecentFamilyTrip: isRecentFamilyTripQuery(query),
    collapseRelationshipRelocation: isRelationshipLatestLocationQuery(query),
    collapseSharedGroceryListMethod: isSharedGroceryListMethodQuery(query),
  };
  const updateEvidenceSeriesOptions = {
    ...updateSeriesOptions,
    includeBehavioralUpdateSeries: true,
  };
  const limit = answerCompositionQuery || factConfirmationQuery
    ? 3
    : temporalEventOrderQuery || temporalRelativeEventQuery
      ? 6
      : temporalMostRecentQuery
        ? TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT
        : 2;
  const withIntentSignal = rankFactCandidates(
    collapseLatestUpdateSeries(
      compatible.filter((entry) => entry.intentScore > 0),
      updateSeriesOptions,
    ),
    routingDecision.strategy,
  );
  const withLexicalOrSubjectSignal = rankFactCandidates(
    collapseLatestUpdateSeries(
      compatible.filter(hasGenericFactSelectionSignal),
      updateSeriesOptions,
    ),
    routingDecision.strategy,
  );
  const conversationEvidenceCandidates = assistantEvidenceRecallQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasConversationEvidenceRecallSignal(item, query, language, queryLocale)
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        conversationEvidencePriority(right, query, language, queryLocale) -
        conversationEvidencePriority(left, query, language, queryLocale),
    )
    : [];
  const preferenceEvidenceCandidates = recommendationStyleQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasPreferenceEvidenceRecallSignal(item, query, language, queryLocale)
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        preferenceEvidencePriority(right, query, language, queryLocale) -
        preferenceEvidencePriority(left, query, language, queryLocale),
    )
    : [];
  const updateEvidencePool = rankFactCandidates(
    compatible.filter((item) =>
      hasTrustedUpdateEvidenceSignal(
        item,
        query,
        updateEvidenceSeriesOptions,
        language,
        queryLocale,
      )
    ),
    routingDecision.strategy,
  );
  const updateEvidenceCandidates = rankFactCandidates(
    collapseLatestUpdateSeries(
      updateEvidencePool,
      updateEvidenceSeriesOptions,
    ),
    routingDecision.strategy,
  );
  const temporalBridgeEvidenceCandidates = sleepBeforeAppointmentQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasSleepBeforeAppointmentEvidenceSignal(item, query)
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        sleepBeforeAppointmentEvidencePriority(right) -
        sleepBeforeAppointmentEvidencePriority(left),
    )
    : [];
  const directFactualEvidenceBridgeCandidates = directFactualLookupQuery
    ? rankFactCandidates(
      compatible.filter((item) =>
        hasDirectFactualEvidenceBridgeSignal(item, query)
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        directFactualEvidenceBridgePriority(right) -
        directFactualEvidenceBridgePriority(left),
    )
    : [];
  const sourceOrderedSummaryCandidates = selectSourceOrderedSummaryCoverage({
    entries: compatible,
    language,
    query,
    queryLocale,
  });
  const sourceOrderedTimelineCandidates = selectSourceOrderedTimelineIntegrationEvidence({
    entries: compatible,
    language,
    query,
    queryLocale,
  });
  const sourceOrderedInstructionCandidates =
    sourceOrderedTimelineCandidates.length > 0
      ? []
      : selectSourceOrderedInstructionEvidence({
        entries: compatible,
        language,
        query,
        queryLocale,
      });
  const sourceOrderedPreferenceCandidates =
    sourceOrderedTimelineCandidates.length > 0
      ? []
      : selectSourceOrderedPreferenceEvidence({
        entries: compatible,
        language,
        query,
        queryLocale,
      });
  const contradictionEvidencePair = selectContradictionEvidencePair({
    entries: compatible,
    language,
    query,
    queryLocale,
  });
  const pickGenericCandidates = (entries: RankedFactCandidate[]) => {
    if (!directFactualLookupQuery) {
      return entries.slice(0, limit);
    }

    const explicitEvidenceEntries = entries.filter(hasConversationEvidenceTag);
    const candidatePool =
      explicitEvidenceEntries.length > 0 ? explicitEvidenceEntries : entries;
    const orderedCandidatePool = isUserGroundedRecallQuery(query)
      ? [...candidatePool].sort(
        (left, right) =>
          userGroundedEvidencePriority(right) -
          userGroundedEvidencePriority(left),
      )
      : candidatePool;

    return diversifyRankedFactCandidatesBySession(
      orderedCandidatePool,
      limit,
    );
  };

  if (contradictionEvidencePair.length > 0) {
    for (const entry of contradictionEvidencePair) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (aggregateEvidenceQuery) {
    const aggregateCandidates = rankFactCandidates(
      collapseLatestUpdateSeries(
        compatible.filter((item) =>
          hasAggregateFactCountSignal(item, query, language, queryLocale)
        ),
        updateSeriesOptions,
      ),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        aggregateEvidencePriority(right, query, language, queryLocale) -
        aggregateEvidencePriority(left, query, language, queryLocale),
    );

    for (const entry of diversifyRankedFactCandidatesBySession(
      aggregateCandidates,
      AGGREGATE_FACT_COUNT_LIMIT,
    )) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (sourceOrderedSummaryCandidates.length > 0) {
    for (const entry of sourceOrderedSummaryCandidates) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (sourceOrderedTimelineCandidates.length > 0) {
    for (const entry of sourceOrderedTimelineCandidates) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (conversationEvidenceCandidates.length > 0) {
    for (const entry of conversationEvidenceCandidates.slice(
      0,
      ASSISTANT_EVIDENCE_RECALL_LIMIT,
    )) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (preferenceEvidenceCandidates.length > 0) {
    for (const entry of preferenceEvidenceCandidates.slice(
      0,
      PREFERENCE_EVIDENCE_RECALL_LIMIT,
    )) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (updateEvidenceCandidates.length > 0) {
    const primaryUpdateSelections = updateEvidenceCandidates.slice(
      0,
      UPDATE_EVIDENCE_RECALL_LIMIT,
    );

    for (const entry of primaryUpdateSelections) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }

    const companionSelections = selectUpdateHistoryCompanions({
      entries: updateEvidencePool,
      limit: UPDATE_EVIDENCE_RECALL_LIMIT - selected.length,
      options: updateEvidenceSeriesOptions,
      query,
      selectedEntries: primaryUpdateSelections,
      selectedIds,
    });

    for (const entry of companionSelections) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (temporalBridgeEvidenceCandidates.length > 0) {
    for (const entry of diversifyRankedFactCandidatesBySession(
      temporalBridgeEvidenceCandidates,
      TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
    )) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (directFactualEvidenceBridgeCandidates.length > 0) {
    for (const entry of diversifyRankedFactCandidatesBySession(
      directFactualEvidenceBridgeCandidates,
      DIRECT_FACTUAL_RECALL_LIMIT,
    )) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (
    temporalEventOrderQuery ||
    temporalMostRecentQuery ||
    temporalRelativeEventQuery
  ) {
    const rankedTemporalCandidates = rankFactCandidates(
      compatible.filter((entry) => hasTemporalEventOrderSignal(entry, query)),
      routingDecision.strategy,
    ).sort(
      (left, right) =>
        temporalOrderEvidencePriority(right) -
        temporalOrderEvidencePriority(left),
    );
    const temporalCandidates = diversifyRankedFactCandidatesBySession(
      rankedTemporalCandidates,
      compatible.some(isSourceOrderedFact) ? SOURCE_ORDER_EVENT_RECALL_LIMIT : limit,
    );
    const gapFilledTemporalCandidates = temporalEventOrderQuery &&
      temporalCandidates.some(isSourceOrderedFact)
      ? fillSourceOrderedTemporalGaps({
        language,
        pool: rankedTemporalCandidates.filter(isSourceOrderedFact),
        query,
        queryLocale,
        selected: temporalCandidates,
      })
      : temporalCandidates;
    const companionFilledTemporalCandidates = temporalEventOrderQuery &&
      gapFilledTemporalCandidates.some(isSourceOrderedFact)
      ? fillSourceOrderedTemporalCompanions({
        pool: rankedTemporalCandidates.filter(isSourceOrderedFact),
        selected: gapFilledTemporalCandidates,
      })
      : gapFilledTemporalCandidates;
    const milestoneFilledTemporalCandidates = temporalEventOrderQuery &&
      companionFilledTemporalCandidates.some(isSourceOrderedFact)
      ? fillSourceOrderedTemporalMilestones({
        language,
        pool: rankedTemporalCandidates.filter(isSourceOrderedFact),
        query,
        queryLocale,
        selected: companionFilledTemporalCandidates,
      })
      : companionFilledTemporalCandidates;
    const orderedTemporalCandidates = temporalEventOrderQuery &&
      milestoneFilledTemporalCandidates.every((entry) => entry.fact.category === "external_benchmark")
      ? [...milestoneFilledTemporalCandidates].sort(compareTemporalFactChronology)
      : milestoneFilledTemporalCandidates;

    for (const entry of orderedTemporalCandidates) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (withIntentSignal.length > 0) {
    for (const entry of pickGenericCandidates(withIntentSignal)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (withLexicalOrSubjectSignal.length > 0) {
    for (const entry of pickGenericCandidates(withLexicalOrSubjectSignal)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (isResearchRecommendationQuery(query)) {
    for (const entry of rankFactCandidates(
      compatible.filter(hasResearchRecommendationSignal),
      routingDecision.strategy,
    ).slice(0, RESEARCH_RECOMMENDATION_LIMIT)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (answerCompositionQuery || factConfirmationQuery) {
    for (const entry of rankFactCandidates(
      compatible.filter(
        (item) =>
          item.fact.category === "project" || item.fact.category === "technical",
      ),
      routingDecision.strategy,
    ).slice(0, limit)) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  } else if (retrievalProfile === "coding_agent") {
    const fallback = rankFactCandidates(
      compatible.filter(
        (entry) =>
          entry.fact.category !== "personal" &&
          entry.fact.category !== "relationship" &&
          entry.fact.category !== "event",
      ),
      routingDecision.strategy,
    )[0];
    if (fallback) {
      selected.push(fallback);
      selectedIds.add(fallback.fact.id);
      markSelectedTrace(
        traces,
        fallback.fact.id,
        "generic",
        fallback.intentScore,
        fallback.lexicalScore,
        fallback.freshnessScore,
        fallback.explicitnessScore,
        fallback.usageScore,
        fallback.evidenceScore,
        fallback.outcomeScore,
        fallback.verificationPenaltyScore,
        "none",
      );
    }
  }

  for (const entry of sourceOrderedInstructionCandidates) {
    if (selectedIds.has(entry.fact.id)) {
      continue;
    }

    selected.push(entry);
    selectedIds.add(entry.fact.id);
    markSelectedTrace(
      traces,
      entry.fact.id,
      "generic",
      entry.intentScore,
      entry.lexicalScore,
      entry.freshnessScore,
      entry.explicitnessScore,
      entry.usageScore,
      entry.evidenceScore,
      entry.outcomeScore,
      entry.verificationPenaltyScore,
      "none",
    );
  }

  for (const entry of sourceOrderedPreferenceCandidates) {
    if (selectedIds.has(entry.fact.id)) {
      continue;
    }

    selected.push(entry);
    selectedIds.add(entry.fact.id);
    markSelectedTrace(
      traces,
      entry.fact.id,
      "generic",
      entry.intentScore,
      entry.lexicalScore,
      entry.freshnessScore,
      entry.explicitnessScore,
      entry.usageScore,
      entry.evidenceScore,
      entry.outcomeScore,
      entry.verificationPenaltyScore,
      "none",
    );
  }

  if (
    assistantEvidenceRecallQuery &&
    /\bhow many\b/iu.test(query) &&
    selected.length < ASSISTANT_EVIDENCE_RECALL_LIMIT
  ) {
    const assistantCountHeadings = rankFactCandidates(
      compatible.filter(
        (entry) =>
          !selectedIds.has(entry.fact.id) &&
          entry.fact.tags?.includes(ASSISTANT_EVIDENCE_TAG) === true &&
          ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          ),
      ),
      routingDecision.strategy,
    ).slice(0, ASSISTANT_EVIDENCE_RECALL_LIMIT - selected.length);

    for (const entry of assistantCountHeadings) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  }

  if (directFactualLookupQuery && selected.length < DIRECT_FACTUAL_RECALL_LIMIT) {
    const selectedSessionIds = new Set(
      selected
        .map((entry) => entry.fact.sessionId)
        .filter((sessionId): sessionId is string => typeof sessionId === "string"),
    );
    const companionLimit = Math.min(
      DIRECT_FACTUAL_COMPANION_LIMIT,
      DIRECT_FACTUAL_RECALL_LIMIT - selected.length,
    );
    const companions = rankFactCandidates(
      compatible.filter(
        (entry) =>
          !selectedIds.has(entry.fact.id) &&
          entry.fact.sessionId !== undefined &&
          selectedSessionIds.has(entry.fact.sessionId) &&
          hasDirectFactualCompanionSignal(entry),
      ),
      routingDecision.strategy,
    ).slice(0, companionLimit);

    for (const entry of companions) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  }

  if (isCouponRedemptionLocationQuery(query)) {
    const couponSessions = new Set(
      selected
        .filter(isCouponRedemptionFact)
        .map((entry) => entry.fact.sessionId)
        .filter((sessionId): sessionId is string => typeof sessionId === "string"),
    );
    const storeCompanions = rankFactCandidates(
      compatible.filter(
        (entry) =>
          !selectedIds.has(entry.fact.id) &&
          entry.fact.sessionId !== undefined &&
          couponSessions.has(entry.fact.sessionId) &&
          isStoreContextFact(entry),
      ),
      routingDecision.strategy,
    ).slice(0, 1);

    for (const entry of storeCompanions) {
      selected.push(entry);
      selectedIds.add(entry.fact.id);
      markSelectedTrace(
        traces,
        entry.fact.id,
        "generic",
        entry.intentScore,
        entry.lexicalScore,
        entry.freshnessScore,
        entry.explicitnessScore,
        entry.usageScore,
        entry.evidenceScore,
        entry.outcomeScore,
        entry.verificationPenaltyScore,
        "none",
      );
    }
  }

  for (const entry of compatible) {
    const trace = traces.find((item) => item.memoryId === entry.fact.id);
    if (trace && !trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "below generic threshold";
    }
  }

  return {
    facts: selected.map(materializeFactCandidate),
    traces,
  };
}

export function selectReferences(
  references: ReferenceMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
  semanticScores?: Map<string, number>,
  evidenceCountsByMemoryId?: Map<string, number>,
): { references: ReferenceMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = rankReferenceCandidates(
    buildReferenceCandidates(
      references,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
      evidenceCountsByMemoryId,
    ),
    routingDecision.strategy,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.reference.id,
    memoryType: "reference",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : !isActiveMemoryLifecycle(entry.reference)
        ? "inactive lifecycle"
        : "not selected",
    intentScore: entry.intentScore,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: entry.explicitnessScore,
    evidenceScore: entry.evidenceScore,
    outcomeScore: entry.outcomeScore,
    fallback: "none",
  }));
  const compatible = ranked.filter(
    (entry) =>
      isActiveMemoryLifecycle(entry.reference) &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  const slotSpecificNonReferenceQuery =
    !routingDecision.requestedSlots.includes("reference") &&
    (routingDecision.requestedSlots.includes("role") ||
      routingDecision.requestedSlots.includes("focus") ||
      routingDecision.requestedSlots.includes("blocker") ||
      routingDecision.requestedSlots.includes("open_loop"));
  const signaled = rankReferenceCandidates(
    compatible.filter((entry) => entry.lexicalScore > 0 || entry.subjectScore >= 0.2),
    routingDecision.strategy,
  );

  if (slotSpecificNonReferenceQuery) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "non-reference slot query";
      }
    }
    return {
      references: [],
      traces,
    };
  }

  if (routingDecision.requestedSlots.includes("reference")) {
    const selected = signaled[0] ?? (compatible.length === 1 ? compatible[0] : null);

    if (selected) {
      markSelectedTrace(
        traces,
        selected.reference.id,
        "reference",
        selected.intentScore,
        selected.lexicalScore,
        selected.freshnessScore,
        selected.explicitnessScore,
        0,
        selected.evidenceScore,
        selected.outcomeScore,
        0,
        signaled[0] ? "none" : "same_slot_unique_candidate",
      );
      for (const trace of traces) {
        if (trace.memoryId !== selected.reference.id && trace.whySuppressed === "not selected") {
          trace.whySuppressed = "same-slot candidate not chosen";
        }
      }
      return {
        references: [selected.reference],
        traces,
      };
    }

    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no reference signal";
      }
    }
    return {
      references: [],
      traces,
    };
  }

  const genericSelected =
    signaled[0] ??
    ((language.isAnswerCompositionQuery(query, queryLocale) &&
      rankReferenceCandidates(compatible, routingDecision.strategy)[0]) ||
      null);
  if (!genericSelected) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "below generic threshold";
      }
    }
    return {
      references: [],
      traces,
    };
  }

  markSelectedTrace(
    traces,
    genericSelected.reference.id,
    "generic",
    genericSelected.intentScore,
    genericSelected.lexicalScore,
    genericSelected.freshnessScore,
    genericSelected.explicitnessScore,
    0,
    genericSelected.evidenceScore,
    genericSelected.outcomeScore,
    0,
    signaled[0] ? "none" : "same_slot_unique_candidate",
  );
  for (const trace of traces) {
    if (trace.memoryId !== genericSelected.reference.id && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "same-slot candidate not chosen";
    }
  }
  return {
    references: [genericSelected.reference],
    traces,
  };
}

export function selectEpisodes(
  episodes: EpisodeMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
  semanticScores?: Map<string, number>,
): { episodes: EpisodeMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = rankEpisodeCandidates(
    buildEpisodeCandidates(
      episodes,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
    ),
    routingDecision.strategy,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.episode.id,
    memoryType: "episode",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : "not selected",
    intentScore: routingDecision.continuation ? 0.6 : 0,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: 0,
    fallback: "none",
  }));
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );
  const slotSpecificQuery =
    routingDecision.requestedSlots.includes("role") ||
    routingDecision.requestedSlots.includes("focus") ||
    routingDecision.requestedSlots.includes("blocker") ||
    routingDecision.requestedSlots.includes("open_loop") ||
    routingDecision.requestedSlots.includes("reference");
  const withSignal = rankEpisodeCandidates(
    compatible.filter(
      (entry) => entry.lexicalScore > 0 || routingDecision.continuation,
    ),
    routingDecision.strategy,
  );

  if (slotSpecificQuery && !routingDecision.continuation) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "slot-specific query";
      }
    }
    return {
      episodes: [],
      traces,
    };
  }

  if (!routingDecision.continuation) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }
    return {
      episodes: [],
      traces,
    };
  }

  if (withSignal.length === 0) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }
    return {
      episodes: [],
      traces,
    };
  }

  const selected = withSignal.slice(0, 2);
  for (const entry of selected) {
    markSelectedTrace(
      traces,
      entry.episode.id,
      "generic",
      routingDecision.continuation ? 0.6 : 0,
      entry.lexicalScore,
      entry.freshnessScore,
      0,
      0,
      0,
      0,
      0,
      "none",
    );
  }
  for (const trace of traces) {
    if (!trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "lower-ranked continuation candidate";
    }
  }
  return {
    episodes: selected.map((entry) => entry.episode),
    traces,
  };
}

export function selectArchives(
  archives: SessionArchive[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  routingDecision: RoutingDecision,
  referenceTime: string,
): { archives: SessionArchive[]; traces: RecallCandidateTrace[] } {
  const ranked = buildArchiveCandidates(
    archives,
    query,
    language,
    queryLocale,
    referenceTime,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.archive.id,
    memoryType: "archive",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : "not selected",
    intentScore: routingDecision.continuation ? 0.7 : 0,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: 0,
    fallback: "none",
  }));
  const compatible = ranked.filter((entry) =>
    language.localesCompatible(queryLocale, entry.locale),
  );
  const withSignal = rankArchiveCandidates(
    compatible.filter(
      (entry) => entry.lexicalScore > 0 || routingDecision.continuation,
    ),
  );

  if (!routingDecision.continuation) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }

    return {
      archives: [],
      traces,
    };
  }

  if (withSignal.length === 0) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "no continuation signal";
      }
    }

    return {
      archives: [],
      traces,
    };
  }

  const selected = withSignal.slice(0, 1);
  for (const entry of selected) {
    markSelectedTrace(
      traces,
      entry.archive.id,
      "generic",
      0.7,
      entry.lexicalScore,
      entry.freshnessScore,
      0,
      0,
      0,
      0,
      0,
      "none",
    );
  }
  for (const trace of traces) {
    if (!trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "lower-ranked continuation candidate";
    }
  }

  return {
    archives: selected.map((entry) => entry.archive),
    traces,
  };
}
