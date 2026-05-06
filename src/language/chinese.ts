import type {
  MemoryCandidate,
  MemoryCandidateMetadata,
  ProfileField,
} from "../remember/candidates";
import type {
  LanguageAdapter,
  LanguageCandidateExtractionInput,
} from "./contracts";
import type {
  FactKind,
  MemoryScopeKind,
  ReferenceKind,
} from "../domain/records";
import {
  splitClausesGeneric,
  normalizeUnicodeForEquality,
  tokenizeUnicodeText,
} from "./generic";

const CHINESE_STOPWORDS = new Set([
  "这个",
  "那个",
  "请",
  "一下",
  "现在",
  "目前",
  "仍然",
  "已经",
  "以后",
]);
const CHINESE_REFERENCE_SUBJECT_NOISE_PATTERN =
  /^(?:现在|目前|当前|以后|以后都|今后|之后|后续|之后都|暂时|先|继续|仍然|都|统一|默认|请|请以后|以后请)$/u;
const CHINESE_REFERENCE_SUBJECT_HINT_PATTERN =
  /(项目|流程|迁移|发布|上线|系统|服务|模块|计划|工作|工作流|平台|接口|看板|质量|程序|任务|手册|剧本|审批|验收|签收|交接|可靠性|支付|订单|运行时)/u;

const DURABLE_INFERENCE_PATTERNS = [
  /(目前|现在|仍然|已经)/u,
  /(阻塞|卡住|失败|报错|迁移|上线|发布|审批|项目|流程|工作流|运行时|接口|构建)/u,
];
const EDUCATION_DEGREE_PATTERN =
  /我(?:毕业于|获得|拿到|有|拥有)\s*([^，。！？；]+?(?:专业|学位))(?=，|。|！|？|；|$)/u;
const DAILY_COMMUTE_DURATION_PATTERN =
  /我的?(?:日常)?通勤(?:需要|要|花|花费|耗时)\s*([^，。！？；]+)(?=，|。|！|？|；|$)/u;
const STORE_APP_PATTERN =
  /我(?:一直|最近|正在)?(?:在)?用\s*([^，。！？；]+?)\s*(?:app|App|应用|小程序)(?:从|来自|是)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const STORE_APP_POSSESSIVE_PATTERN =
  /我(?:一直|最近|正在)?(?:在)?用\s*([^，。！？；]+?)的\s*([^，。！？；]+?)\s*(?:app|App|应用|小程序)(?=，|。|！|？|；|$)/u;
const COUPON_REDEMPTION_PATTERN =
  /我(?:实际上|今天|昨天|上周|最近)?(?:兑换了|兑换|用了|使用了)\s*([^，。！？；]*?(?:优惠券|券)[^，。！？；]*?)(?=，|。|！|？|；|$)/u;
const PENDING_PICKUP_OR_RETURN_PATTERN =
  /我(?:仍然|还)?(?:需要|要|得)\s*(取|拿|领取|退回|退|归还)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const DIRECT_PICKUP_TASK_PATTERN =
  /我(?:会|要去|准备去)\s*(?:休息一下再)?(?:取|拿|领取)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const RECENT_PERSONAL_EVENT_PATTERN =
  /我(?:刚刚|刚|今天|最近)\s*(帮|订了|买了|点了|预订了)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const PERSONAL_BEST_TIME_PATTERN =
  /(?:我(?:这次|在)?\s*)?([^，。！？；]*?(?:5K|5k|马拉松|比赛|跑步)[^，。！？；]*?)?的?个人最好成绩(?:是|为|达到)?\s*([0-9]{1,2}:[0-9]{2}|[0-9]+分(?:钟)?(?:[0-9]+秒)?)(?=，|。|！|？|；|$)/u;
const TOOL_LEARNING_INTEREST_PATTERN =
  /我(?:正在|想|想要|试着)?学习\s*([^，。！？；]+?)(?:，|,)?(?:用|使用)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const MODEL_KIT_PATTERN =
  /(?:我(?:最近|刚|也)?(?:完成了|做好了|做完了|入手了|买了|正在做|开始做)\s*)([^，。！？；]*?(?:模型|套件|[0-9]+\/[0-9]+比例)[^，。！？；]*?)(?=，|。|！|？|；|$)/u;
const KOREAN_RESTAURANT_COUNT_PATTERN =
  /我(?:在本地|在城里|在这个城市)?(?:已经)?(?:试过|吃过|去过)\s*([^，。！？；]+?)家?韩餐/u;
const CURRENT_PROJECT_INVOLVEMENT_PATTERN =
  /我(?:正在|最近|一直|已经)?(?:做|负责|推进|参与)\s*([^。！？；]*(?:项目|project)[^。！？；]*?)(?=。|！|？|；|$)/u;
const PROJECT_LEADERSHIP_PATTERN =
  /我(?:主导了|主导|带领了|带领|领导了|领导|负责了|负责)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const CASE_COMPETITION_ACTIVITY_PATTERN =
  /我(?:最近|刚)?参加了\s*([^，。！？；]*案例竞赛[^，。！？；]*?)(?=，|。|！|？|；|$)/u;
const RESEARCH_PROJECT_PATTERN =
  /我(?:最近|刚)?(?:展示|汇报|发表|介绍)了\s*(?:关于|有关)?\s*([^，。！？；]+?)(?:的)?(?:研究海报|研究|课题|海报|poster)(?=，|。|！|？|；|$)/iu;
const RELATION_RELOCATION_PATTERN =
  /我的(?:朋友|表亲|堂亲|阿姨|叔叔|姐妹|兄弟|伴侣|同事)\s*([^，。！？；]+?)\s*(?:最近|刚刚|刚)?搬(?:回|到|去)?了?\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const PHOTOGRAPHY_EQUIPMENT_PATTERN =
  /我的?(?:当前)?(?:摄影|相机)(?:设备|器材|配置)?(?:包括|有|是)\s*([^，。！？；]+?)(?=，|。|！|？|；|$)/u;
const SONY_CAMERA_USER_PATTERN = /作为\s*(?:Sony|索尼)\s*相机用户/u;
const RESEARCH_ARTICLE_INTEREST_PATTERN =
  /我(?:想|想要|希望)(?:继续)?(?:探索|了解|阅读)\s*(?:关于|有关)?\s*([^，。！？；]+?)\s*的?(?:研究论文|论文|文章)(?=，|。|！|？|；|$)/u;
const ORGANIZATION_SUFFIX_PATTERN =
  /(公司|集团|大学|学院|学校|医院|实验室|研究院|研究所|工作室|事务所|委员会|基金会|机构|平台|团队|部门|银行|媒体|出版社|中心)$/u;
const LOCATION_SUFFIX_PATTERN =
  /(省|市|区|县|镇|乡|村|路|街|道|湾|岛|州|国)$/u;
const COMMON_LOCATION_NAMES = new Set([
  "中国",
  "美国",
  "英国",
  "日本",
  "新加坡",
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "南京",
  "成都",
  "武汉",
  "西安",
  "重庆",
  "天津",
  "苏州",
  "宁波",
  "厦门",
  "青岛",
  "长沙",
  "郑州",
  "福州",
  "香港",
  "台北",
]);

function cleanValue(value: string): string {
  return value.trim().replace(/[，。！？；,.!?;]+$/u, "").trim();
}

function createProfileCandidate(
  index: number,
  nextId: () => string,
  profileField: ProfileField,
  content: string,
): MemoryCandidate {
  return {
    id: nextId(),
    kindHint: "profile",
    explicitness: "explicit",
    content,
    sourceMessageIndex: index,
    sourceRole: "user",
    metadata: {
      profileField,
    },
  };
}

function createFactCandidate(
  index: number,
  nextId: () => string,
  content: string,
  categoryOverride?: "project" | "technical" | "personal" | "relationship" | "event",
  metadata?: MemoryCandidateMetadata,
): MemoryCandidate {
  return {
    id: nextId(),
    kindHint: "fact",
    explicitness: "explicit",
    content,
    sourceMessageIndex: index,
    sourceRole: "user",
    metadata: {
      ...buildFactMetadata(content, categoryOverride),
      ...metadata,
    },
  };
}

function deriveFactCategory(
  content: string,
): "project" | "technical" | "personal" | "relationship" | "event" {
  if (
    /(工作流|项目|流程|手册|剧本|迁移|上线|发布|审批|待办|阻塞|卡点|交接)/u.test(content)
  ) {
    return "project";
  }

  if (/(接口|运行时|错误|报错|构建|模式|schema|数据库|服务)/iu.test(content)) {
    return "technical";
  }

  if (/(家人|伴侣|朋友)/u.test(content)) {
    return "relationship";
  }

  if (/(旅行|活动|会议)/u.test(content)) {
    return "event";
  }

  return "personal";
}

function deriveFeedbackKind(content: string): "do" | "dont" | "prefer" {
  if (/(不要|别|禁止)/u.test(content)) {
    return "dont";
  }

  if (/(偏好|更喜欢|优先)/u.test(content)) {
    return "prefer";
  }

  return "do";
}

function extractStableSubject(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = cleanValue(value)
    .replace(/^(当前|目前|现在|这个|该)/u, "")
    .replace(/\s+/gu, " ")
    .trim();

  return cleaned.length >= 2 ? cleaned : undefined;
}

function extractFactSubject(content: string): string | undefined {
  const matches = [
    content.match(/(?:为了|关于|针对)\s*([^，。！？；]+)/u),
    content.match(/(?:在|于)\s*([^，。！？；]+)(?:上|中)/u),
    content.match(/是\s*([^，。！？；]+?)\s*的[^，。！？；]+/u),
  ];

  for (const match of matches) {
    if (match?.[1]) {
      return extractStableSubject(match[1]);
    }
  }

  return undefined;
}

function extractReferenceSubject(content: string): string | undefined {
  const matches = [
    content.match(/(?:关于|针对)\s*([^，。！？；]+)/u),
    content.match(/([^，。！？；]+?)\s*(?:现在)?以\s*[A-Za-z0-9_./-]+\.[A-Za-z0-9]+\s*(?:为准|作为事实来源)/u),
  ];

  for (const match of matches) {
    if (match?.[1]) {
      const subject = extractStableSubject(match[1]);
      if (
        subject &&
        !CHINESE_REFERENCE_SUBJECT_NOISE_PATTERN.test(subject) &&
        (CHINESE_REFERENCE_SUBJECT_HINT_PATTERN.test(subject) ||
          /[A-Za-z0-9][A-Za-z0-9 _-]{1,}/u.test(subject))
      ) {
        return subject;
      }
    }
  }

  return undefined;
}

function deriveFactKind(content: string): FactKind | undefined {
  if (/(我当前角色是|我的角色是)/u.test(content)) {
    return "role_update";
  }

  if (/(我当前重点是|当前重点是|当前关注是|当前关注点是)/u.test(content)) {
    return "focus_update";
  }

  if (/(阻塞|卡住|审批)/u.test(content)) {
    return "blocker";
  }

  if (/(开环|待办|未完成|签收|验收|验证)/u.test(content)) {
    return "open_loop";
  }

  if (/(待确认|待处理|待跟进|待完成|待评审|仍需|还需|剩余|尚待|待 review)/u.test(content)) {
    return "project_state";
  }

  if (deriveFactCategory(content) === "project" || deriveFactCategory(content) === "technical") {
    return "generic_project";
  }

  return undefined;
}

function deriveFactScopeKind(
  category: ReturnType<typeof deriveFactCategory>,
  factKind: FactKind | undefined,
): MemoryScopeKind | undefined {
  if (factKind === "role_update") {
    return "identity";
  }

  if (
    factKind === "focus_update" ||
    factKind === "blocker" ||
    factKind === "open_loop" ||
    factKind === "project_state" ||
    factKind === "generic_project"
  ) {
    return "project";
  }

  if (category === "personal" || category === "relationship" || category === "event") {
    return "identity";
  }

  if (category === "project" || category === "technical") {
    return "project";
  }

  return undefined;
}

function buildFactMetadata(
  content: string,
  categoryOverride?: "project" | "technical" | "personal" | "relationship" | "event",
): MemoryCandidateMetadata {
  const category = categoryOverride ?? deriveFactCategory(content);
  const factKind = deriveFactKind(content);

  return {
    category,
    factKind,
    scopeKind: deriveFactScopeKind(category, factKind),
    subject: extractFactSubject(content) ?? "unknown",
  };
}

function cleanActivityTarget(value: string): string {
  return cleanValue(value)
    .replace(/^(一些|一个|一份|这个|那个|新的?)/u, "")
    .trim();
}

function cleanModelKitTarget(value: string): string {
  return cleanValue(value)
    .replace(/^(一个|一套|新的?)/u, "")
    .trim();
}

function cleanProjectTarget(value: string): string {
  return cleanValue(value)
    .replace(/^(一个|一项|这个|该)/u, "")
    .trim();
}

function createOpenLoopFactCandidate(
  index: number,
  nextId: () => string,
  content: string,
  subject: string,
): MemoryCandidate {
  return createFactCandidate(index, nextId, content, "personal", {
    category: "personal",
    factKind: "open_loop",
    scopeKind: "identity",
    subject: extractStableSubject(subject) ?? "unknown",
  });
}

function createGenericProjectFactCandidate(
  index: number,
  nextId: () => string,
  content: string,
  subject: string,
): MemoryCandidate {
  return createFactCandidate(index, nextId, content, "project", {
    category: "project",
    factKind: "generic_project",
    scopeKind: "project",
    subject: extractStableSubject(subject) ?? "project",
  });
}

function deriveReferenceKind(content: string, pointer: string): ReferenceKind {
  if (/(为准|事实来源)/u.test(content)) {
    return "source_of_truth";
  }

  const basename = pointer.split("/").at(-1)?.toLowerCase() ?? pointer.toLowerCase();
  if (basename.includes("runbook")) {
    return "runbook";
  }
  if (basename.includes("dashboard")) {
    return "dashboard";
  }
  if (basename.includes("tracker")) {
    return "tracker";
  }

  return "doc";
}

function looksLikeDurableInferredFact(content: string): boolean {
  return DURABLE_INFERENCE_PATTERNS.some((pattern) => pattern.test(content));
}

function classifyWorkContextSubject(
  value: string,
): "organization" | "location" | "unknown" {
  const cleaned = cleanValue(value);
  if (!cleaned) {
    return "unknown";
  }

  if (
    COMMON_LOCATION_NAMES.has(cleaned) ||
    LOCATION_SUFFIX_PATTERN.test(cleaned)
  ) {
    return "location";
  }

  if (
    ORGANIZATION_SUFFIX_PATTERN.test(cleaned) ||
    /[A-Za-z]/u.test(cleaned) ||
    /\d/u.test(cleaned)
  ) {
    return "organization";
  }

  // Work-subject-only phrasing is semantically ambiguous in Chinese.
  // Prefer abstaining to avoid corrupting canonical profile memory.
  return "unknown";
}

function createWorkContextCandidate(
  index: number,
  nextId: () => string,
  value: string,
): MemoryCandidate | null {
  const cleaned = cleanValue(value);
  const classification = classifyWorkContextSubject(cleaned);

  if (classification === "organization") {
    return createProfileCandidate(index, nextId, "organization", cleaned);
  }

  if (classification === "location") {
    return createProfileCandidate(index, nextId, "location", cleaned);
  }

  return null;
}

function dedupeCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  return candidates.filter((candidate, candidateIndex, all) => {
    return (
      all.findIndex((other) => {
        return (
          other.kindHint === candidate.kindHint &&
          other.content === candidate.content &&
          other.metadata?.profileField === candidate.metadata?.profileField &&
          other.metadata?.preferenceCategory === candidate.metadata?.preferenceCategory &&
          other.metadata?.referencePointer === candidate.metadata?.referencePointer &&
          other.metadata?.supersedesPointer === candidate.metadata?.supersedesPointer
        );
      }) === candidateIndex
    );
  });
}

function shouldSkipExplicitFactForProfileLikeClause(
  factContent: string,
  candidates: MemoryCandidate[],
): boolean {
  if (!candidates.some((candidate) => candidate.kindHint === "profile")) {
    return false;
  }

  return !/(阻塞|卡住|事实来源|为准|工作流|项目|流程|迁移|审批|待办|上线)/u.test(
    factContent,
  );
}

function maybeExtractCandidatesFromClause(
  content: string,
  index: number,
  nextId: () => string,
): MemoryCandidate[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const candidates: MemoryCandidate[] = [];

  const nameMatch = trimmed.match(/(?:请记住)?我叫\s*([^\s，。！？；]+)/u);
  if (nameMatch?.[1]) {
    candidates.push(createProfileCandidate(index, nextId, "name", cleanValue(nameMatch[1])));
  }

  const timezoneMatch = trimmed.match(/我的?时区是\s*([A-Za-z0-9_./+-]+)/u);
  if (timezoneMatch?.[1]) {
    candidates.push(
      createProfileCandidate(index, nextId, "timezone", cleanValue(timezoneMatch[1])),
    );
  }

  const languageMatch = trimmed.match(/(?:我的?常用语言是|我的?语言是)\s*([^，。！？；]+)/u);
  if (languageMatch?.[1]) {
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "languagePreference",
        cleanValue(languageMatch[1]),
      ),
    );
  }

  const orgAndRoleMatch = trimmed.match(/我在\s*([^，。！？；]+?)\s*(?:工作|上班|任职)[，,]?\s*我是\s*([^，。！？；]+)/u);
  if (orgAndRoleMatch?.[1] && orgAndRoleMatch?.[2]) {
    const workContextCandidate = createWorkContextCandidate(
      index,
      nextId,
      orgAndRoleMatch[1],
    );
    if (workContextCandidate) {
      candidates.push(workContextCandidate);
    }
    candidates.push(
      createProfileCandidate(index, nextId, "role", cleanValue(orgAndRoleMatch[2])),
    );
  } else {
    const organizationMatch = trimmed.match(/我在\s*([^，。！？；]+?)\s*(?:工作|上班|任职)/u);
    if (organizationMatch?.[1]) {
      const workContextCandidate = createWorkContextCandidate(
        index,
        nextId,
        organizationMatch[1],
      );
      if (workContextCandidate) {
        candidates.push(workContextCandidate);
      }
    }

    const roleMatch = trimmed.match(/(?:请记住)?我是\s*([^，。！？；]+)/u);
    if (roleMatch?.[1]) {
      candidates.push(createProfileCandidate(index, nextId, "role", cleanValue(roleMatch[1])));
    }
  }

  const currentProjectMatch = trimmed.match(/我(?:现在|目前|正在)?(?:在做|负责|推进)\s*([^，。！？；]+)/u);
  if (currentProjectMatch?.[1]) {
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "currentProject",
        cleanValue(currentProjectMatch[1]),
      ),
    );
  }

  const locationMatch = trimmed.match(/我在\s*([^，。！？；]+?)\s*(?:生活|居住|办公)/u);
  if (locationMatch?.[1]) {
    candidates.push(
      createProfileCandidate(index, nextId, "location", cleanValue(locationMatch[1])),
    );
  }

  const educationDegreeMatch = trimmed.match(EDUCATION_DEGREE_PATTERN);
  if (educationDegreeMatch?.[1]) {
    const degree = cleanValue(educationDegreeMatch[1]);
    candidates.push(
      createFactCandidate(index, nextId, `我毕业于${degree}。`, "personal"),
    );
  }

  const commuteDurationMatch = trimmed.match(DAILY_COMMUTE_DURATION_PATTERN);
  if (commuteDurationMatch?.[1]) {
    const duration = cleanValue(commuteDurationMatch[1]);
    candidates.push(
      createFactCandidate(index, nextId, `我的日常通勤需要${duration}。`, "personal"),
    );
  }

  const storeAppMatch =
    trimmed.match(STORE_APP_PATTERN) ??
    trimmed.match(STORE_APP_POSSESSIVE_PATTERN);
  if (storeAppMatch?.[1] && storeAppMatch?.[2]) {
    const first = cleanValue(storeAppMatch[1]);
    const second = cleanValue(storeAppMatch[2]);
    const appName = trimmed.match(STORE_APP_POSSESSIVE_PATTERN) ? second : first;
    const storeName = trimmed.match(STORE_APP_POSSESSIVE_PATTERN) ? first : second;
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我使用${storeName}的${appName}应用。`,
        "personal",
      ),
    );
  }

  const couponRedemptionMatch = trimmed.match(COUPON_REDEMPTION_PATTERN);
  if (couponRedemptionMatch?.[1]) {
    const coupon = cleanValue(couponRedemptionMatch[1]);
    candidates.push(
      createFactCandidate(index, nextId, `我兑换了${coupon}。`, "event"),
    );
  }

  const pendingPickupOrReturnMatch = trimmed.match(PENDING_PICKUP_OR_RETURN_PATTERN);
  if (pendingPickupOrReturnMatch?.[1] && pendingPickupOrReturnMatch?.[2]) {
    const action = pendingPickupOrReturnMatch[1];
    const target = cleanActivityTarget(pendingPickupOrReturnMatch[2]);
    if (/^(退回|退|归还)$/u.test(action)) {
      candidates.push(
        createOpenLoopFactCandidate(
          index,
          nextId,
          `我需要退回${target}。`,
          target,
        ),
      );
    } else {
      candidates.push(
        createOpenLoopFactCandidate(
          index,
          nextId,
          `我仍需取${target}。`,
          target,
        ),
      );
    }
  }

  const directPickupTaskMatch = trimmed.match(DIRECT_PICKUP_TASK_PATTERN);
  if (directPickupTaskMatch?.[1]) {
    const target = cleanActivityTarget(directPickupTaskMatch[1]);
    candidates.push(
      createOpenLoopFactCandidate(
        index,
        nextId,
        `我仍需取${target}。`,
        target,
      ),
    );
  }

  const recentPersonalEventMatch = trimmed.match(RECENT_PERSONAL_EVENT_PATTERN);
  if (recentPersonalEventMatch?.[1] && recentPersonalEventMatch?.[2]) {
    const action = recentPersonalEventMatch[1];
    const target = cleanActivityTarget(recentPersonalEventMatch[2]);
    candidates.push(
      createFactCandidate(index, nextId, `我${action}${target}。`, "event"),
    );
  }

  const personalBestTimeMatch = trimmed.match(PERSONAL_BEST_TIME_PATTERN);
  if (personalBestTimeMatch?.[2]) {
    const event = personalBestTimeMatch[1]
      ? cleanValue(personalBestTimeMatch[1])
      : "";
    const time = cleanValue(personalBestTimeMatch[2]);
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我${event ? `在${event}` : ""}的个人最好成绩是${time}。`,
        "personal",
        {
          category: "personal",
          scopeKind: "identity",
          subject: event || "个人最好成绩",
        },
      ),
    );
  }

  const toolLearningInterestMatch = trimmed.match(TOOL_LEARNING_INTEREST_PATTERN);
  if (toolLearningInterestMatch?.[1] && toolLearningInterestMatch?.[2]) {
    const topic = cleanActivityTarget(toolLearningInterestMatch[1]);
    const tool = cleanValue(toolLearningInterestMatch[2]);
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我用${tool}学习${topic}。`,
        "personal",
      ),
    );
  }

  const modelKitMatch = trimmed.match(MODEL_KIT_PATTERN);
  if (modelKitMatch?.[1]) {
    const target = cleanModelKitTarget(modelKitMatch[1]);
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我做过或买过模型套件：${target}。`,
        "personal",
        {
          category: "personal",
          scopeKind: "identity",
          subject: extractStableSubject(target) ?? "模型套件",
        },
      ),
    );
  }

  const koreanRestaurantCountMatch = trimmed.match(KOREAN_RESTAURANT_COUNT_PATTERN);
  if (koreanRestaurantCountMatch?.[1]) {
    const count = cleanValue(koreanRestaurantCountMatch[1]);
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我在本地试过${count}家韩餐。`,
        "personal",
        {
          category: "personal",
          scopeKind: "identity",
          subject: "本地韩餐",
        },
      ),
    );
  }

  const photographyEquipmentMatch = trimmed.match(PHOTOGRAPHY_EQUIPMENT_PATTERN);
  if (photographyEquipmentMatch?.[1]) {
    const equipment = cleanValue(photographyEquipmentMatch[1]);
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我的当前摄影配置包括${equipment}。`,
        "personal",
        {
          category: "personal",
          scopeKind: "identity",
          subject: "摄影配置",
        },
      ),
    );
  } else if (SONY_CAMERA_USER_PATTERN.test(trimmed)) {
    candidates.push(
      createFactCandidate(index, nextId, "我使用索尼相机。", "personal", {
        category: "personal",
        scopeKind: "identity",
        subject: "摄影配置",
      }),
    );
  }

  const researchArticleInterestMatch = trimmed.match(RESEARCH_ARTICLE_INTEREST_PATTERN);
  if (researchArticleInterestMatch?.[1]) {
    const topic = cleanValue(researchArticleInterestMatch[1]);
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `我对${topic}研究论文和文章感兴趣。`,
        "technical",
        {
          category: "technical",
          scopeKind: "project",
          subject: extractStableSubject(topic) ?? topic,
        },
      ),
    );
  }

  const currentProjectInvolvementMatch = trimmed.match(
    CURRENT_PROJECT_INVOLVEMENT_PATTERN,
  );
  if (currentProjectInvolvementMatch?.[1]) {
    const project = cleanProjectTarget(currentProjectInvolvementMatch[1]);
    candidates.push(
      createGenericProjectFactCandidate(
        index,
        nextId,
        `我正在做${project}。`,
        project,
      ),
    );
  }

  const projectLeadershipMatch = trimmed.match(PROJECT_LEADERSHIP_PATTERN);
  if (projectLeadershipMatch?.[1]) {
    const leadership = cleanProjectTarget(projectLeadershipMatch[1]);
    candidates.push(
      createGenericProjectFactCandidate(
        index,
        nextId,
        `我主导了${leadership}。`,
        leadership,
      ),
    );
  }

  const caseCompetitionActivityMatch = trimmed.match(
    CASE_COMPETITION_ACTIVITY_PATTERN,
  );
  if (caseCompetitionActivityMatch?.[1]) {
    const activity = cleanProjectTarget(caseCompetitionActivityMatch[1]);
    candidates.push(
      createGenericProjectFactCandidate(
        index,
        nextId,
        `我参加了${activity}。`,
        activity,
      ),
    );
  }

  const researchProjectMatch = trimmed.match(RESEARCH_PROJECT_PATTERN);
  if (researchProjectMatch?.[1]) {
    const topic = cleanProjectTarget(researchProjectMatch[1]);
    candidates.push(
      createGenericProjectFactCandidate(
        index,
        nextId,
        `我做过关于${topic}的研究项目。`,
        topic,
      ),
    );
  }

  const relationRelocationMatch = trimmed.match(RELATION_RELOCATION_PATTERN);
  if (relationRelocationMatch?.[1] && relationRelocationMatch?.[2]) {
    const name = cleanValue(relationRelocationMatch[1]);
    const location = cleanValue(relationRelocationMatch[2]);
    candidates.push(
      createFactCandidate(index, nextId, `${name}搬到了${location}。`, "relationship", {
        category: "relationship",
        scopeKind: "identity",
        subject: name,
      }),
    );
  }

  const explicitFactMatch = trimmed.match(/(?:请记住|记住|有个事实(?:是)?)(.+)/u);
  if (explicitFactMatch?.[1]) {
    const factContent = cleanValue(explicitFactMatch[1]);
    if (!shouldSkipExplicitFactForProfileLikeClause(factContent, candidates)) {
      candidates.push({
        id: nextId(),
        kindHint: "fact",
        explicitness: "explicit",
        content: factContent,
        sourceMessageIndex: index,
        sourceRole: "user",
        metadata: {
          ...buildFactMetadata(factContent),
        },
      });
    }
  }

  const preferenceMatch = trimmed.match(/我(?:更)?(?:喜欢|偏好)\s*([^，。！？；]+)/u);
  if (preferenceMatch?.[1]) {
    const preferenceValue = cleanValue(preferenceMatch[1]);
    candidates.push({
      id: nextId(),
      kindHint: "preference",
      explicitness: "explicit",
      content: preferenceValue,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        preferenceCategory: "response_style",
        preferenceValue,
      },
    });
  }

  const correctedReferenceMatch = trimmed.match(/现在以\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s*为准[，,]?\s*(?:不要|不再)以\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s*为准/u);
  if (correctedReferenceMatch?.[1] && correctedReferenceMatch?.[2]) {
    const pointer = cleanValue(correctedReferenceMatch[1]);
    const previousPointer = cleanValue(correctedReferenceMatch[2]);
    const title = pointer.split("/").at(-1) ?? pointer;
    candidates.push({
      id: nextId(),
      kindHint: "reference",
      explicitness: "explicit",
      content: pointer,
      sourceMessageIndex: index,
      sourceRole: "user",
        metadata: {
          referenceKind: deriveReferenceKind(trimmed, pointer),
          referenceTitle: title,
          referencePointer: pointer,
          supersedesPointer: previousPointer,
          subject: extractReferenceSubject(trimmed) ?? "unknown",
        },
      });
  } else {
    const referenceMatch = trimmed.match(/以\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s*(?:为准|作为事实来源)/u);
    if (referenceMatch?.[1]) {
      const pointer = cleanValue(referenceMatch[1]);
      const title = pointer.split("/").at(-1) ?? pointer;
      candidates.push({
        id: nextId(),
        kindHint: "reference",
        explicitness: "explicit",
        content: pointer,
        sourceMessageIndex: index,
        sourceRole: "user",
        metadata: {
          referenceKind: deriveReferenceKind(trimmed, pointer),
          referenceTitle: title,
          referencePointer: pointer,
          subject: extractReferenceSubject(trimmed) ?? "unknown",
        },
      });
    }
  }

  if (
    trimmed.length >= 4 &&
    /^(请(?!记住)|不要|以后|始终|优先)/u.test(trimmed)
  ) {
    candidates.push({
      id: nextId(),
      kindHint: "feedback",
      explicitness: "explicit",
      content: trimmed,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        feedbackKind: deriveFeedbackKind(trimmed),
        appliesTo: "general_response",
      },
    });
  }

  if (candidates.length === 0 && trimmed.length >= 8 && looksLikeDurableInferredFact(trimmed)) {
    candidates.push({
      id: nextId(),
      kindHint: "fact",
      explicitness: "inferred",
      content: trimmed,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        ...buildFactMetadata(trimmed),
      },
    });
  }

  return dedupeCandidates(candidates);
}

export function createChineseLanguageAdapter(): LanguageAdapter {
  return {
    id: "zh",
    supportsLocale(locale: string): boolean {
      return locale.toLowerCase().startsWith("zh");
    },
    splitClauses(text: string): string[] {
      return splitClausesGeneric(text);
    },
    normalizeForEquality(text: string): string {
      return normalizeUnicodeForEquality(text);
    },
    tokenize(text: string, options?: { excludeStopwords?: boolean }): string[] {
      const tokens = tokenizeUnicodeText(text, "zh-CN");
      if (options?.excludeStopwords) {
        return tokens.filter((token) => !CHINESE_STOPWORDS.has(token));
      }
      return tokens;
    },
    extractCandidates(input: LanguageCandidateExtractionInput): MemoryCandidate[] {
      const candidates: MemoryCandidate[] = [];

      input.messages.forEach((message, index) => {
        if (message.role !== "user") {
          return;
        }

        const sourceMessageIndex = message.sourceMessageIndex ?? index;

        const clauses = splitClausesGeneric(message.content);
        for (const clause of clauses) {
          candidates.push(
            ...maybeExtractCandidatesFromClause(
              clause,
              sourceMessageIndex,
              input.nextId,
            ),
          );
        }
      });

      return candidates;
    },
  };
}
