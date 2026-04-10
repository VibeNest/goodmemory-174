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
