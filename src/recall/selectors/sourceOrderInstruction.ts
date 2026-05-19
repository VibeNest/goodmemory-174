import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";
import { hasPreferenceAdviceBridgeSignal } from "./conversationEvidence";

export const SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT = 2;
export const SOURCE_ORDER_INSTRUCTION_PRIORITY_THRESHOLD = 160;
export const SOURCE_ORDER_PREFERENCE_RECALL_LIMIT = 2;
export const SOURCE_ORDER_PREFERENCE_PRIORITY_THRESHOLD = 130;

export const BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS = new Set([
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
export const SOURCE_INSTRUCTION_ALIAS_TOKENS = new Set([
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

export const SOURCE_PREFERENCE_DECLARATION_PATTERN =
  /\b(?:prefer|preference|i['’]d\s+like|i\s+would\s+like|looking\s+for|interested\s+in|enjoy|love|rather\s+than|over\s+(?:heavy|manual|generic|external|third-party)|without\s+compromising|avoid(?:ing)?)\b|(?:偏好|更喜欢|喜欢|想要|希望|不想|不希望|尽量不要|避免|轻量|无外部依赖|不用很重|不要很重)/iu;
export const SIMPLE_SOLUTION_QUERY_PATTERN =
  /\b(?:simple|straightforward|minimal|lightweight|built-?in|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party))\b|(?:简单|直接|轻量|内置|无依赖|无外部依赖|不要外部依赖|不想用外部依赖|尽量不要外部依赖)/iu;
export const LIGHTWEIGHT_PREFERENCE_PATTERN =
  /\b(?:lightweight|dependency-?free|without\s+(?:external|third-party)|no\s+(?:external|third-party)|minimal|simple|straightforward|built-?in|avoid(?:ing)?\s+(?:heavy|external|third-party)|under\s+\d+(?:\.\d+)?\s*(?:mb|kb))\b|(?:轻量|无依赖|无外部依赖|不要外部依赖|不想用外部依赖|避免.*(?:重|外部|第三方)|简单|直接|内置|(?:低于|小于|保持在)\s*\d+(?:\.\d+)?\s*(?:MB|KB|mb|kb)\s*(?:以下)?)/iu;

export function isSourceOrderedUserInstruction(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return (
    hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    (
      /\b(?:always|please\s+(?:always\s+)?(?:include|use|format|provide|confirm|maintain|highlight)|make\s+sure\s+to|remember\s+to|whenever|when\s+I\s+ask|if\s+I\s+ask)\b/iu.test(
        content,
      ) ||
      /(?:请|总是|务必|记得|以后|每次|当我|如果我).*(?:使用|包含|提供|确认|保持|突出|展示|回答|格式|代码块)/u.test(content)
    ) &&
    (
      /\b(?:when|whenever|if)\s+I\s+(?:ask|am\s+asking|request|need)\b/iu.test(
        content,
      ) ||
      /(?:当我|如果我|我.*(?:问|需要|请求)|以后我问|每次我问)/u.test(content)
    )
  );
}

export function addInstructionTopicAliases(tokens: Set<string>, text: string): void {
  const normalized = text.toLowerCase();
  const hasAny = (pattern: RegExp): boolean => pattern.test(normalized);
  const hasApiSurface = hasAny(/\b(?:api|rest|responses?|status\s+codes?)\b/iu);
  const hasApiErrorHandling = hasAny(/\b(?:errors?|handling|handle|status\s+codes?)\b/iu);

  if (hasAny(/\b(?:implement(?:ation|ed|ing)?|code|snippets?|syntax|feature|login|software)\b/iu)) {
    tokens.add("software_implementation");
  }
  if (hasAny(/(?:实现|代码|代码块|语法|功能|登录|软件)/u)) {
    tokens.add("software_implementation");
  }
  if (hasAny(/\b(?:dependenc(?:y|ies)|librar(?:y|ies)|versions?)\b/iu)) {
    tokens.add("software_dependency");
  }
  if (hasAny(/(?:依赖|库|版本|外部依赖|第三方)/u)) {
    tokens.add("software_dependency");
  }
  if (hasApiSurface && hasApiErrorHandling) {
    tokens.add("api_error");
  }
  if (hasAny(/(?:API|接口|响应|状态码)/iu) && hasAny(/(?:错误处理|报错|异常处理|错误|异常)/u)) {
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
  if (hasAny(/(?:要点|列表|多点|条目|组织|格式选项)/u)) {
    tokens.add("list_format");
  }
  if (hasAny(/\b(?:apa|citations?|references?|sources?|paper)\b/iu)) {
    tokens.add("reference_format");
  }
  if (hasAny(/(?:APA|引用|参考文献|来源|论文|文献格式)/iu)) {
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
  if (hasAny(/(?:简短|简洁|当前状态|进展|更新|总结|摘要|概述)/u)) {
    tokens.add("progress_summary");
  }
}

export function sourceInstructionTopicTokens(input: {
  language: LanguageService;
  locale: string;
  text: string;
}): Set<string> {
  const tokens = selectorTopicTokens(input.text, input.language, input.locale);
  addInstructionTopicAliases(tokens, input.text);
  return tokens;
}

export function countInstructionAliasOverlap(
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

export function sourceInstructionConditionText(content: string): string | undefined {
  const match =
    content.match(
    /\b(?:when|whenever|if)\s+I\s+(?:ask|am\s+asking|request|need)\s+(?:about|for|to)?\s*([^.!?\n]+)/iu,
    ) ??
    content.match(
      /(?:当我|如果我|以后我|每次我)(?:问|需要|请求|询问)\s*([^。！？\n]+)/u,
    );
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].replace(/\s*->->.*$/u, "").trim();
}

export function isBroadInstructionConditionToken(token: string): boolean {
  return BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS.has(token);
}

export function hasApplicableSourceInstructionTopic(input: {
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

export function sourceInstructionPriority(input: {
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
  const overlap = selectorTopicOverlapCount(input.queryTopics, instructionTopics);
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

export function selectSourceOrderedInstructionEvidence(input: {
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

export function isPreferenceGuidanceQuery(
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  return language.isRecommendationStyleQuery(query, queryLocale) ||
    language.isGuidanceSeekingQuery(query, queryLocale) ||
    /\b(?:can\s+you\s+help|help\s+me|how\s+should|how\s+can|walk\s+me\s+through|show\s+me|explain|i['’]d\s+like|i\s+would\s+like|i\s+want)\b/iu.test(
      query,
    ) ||
    /(?:帮我|怎么|如何|请展示|请说明|解释|我想|我希望|我需要|能不能|可以帮)/u.test(query);
}

export function isSourceOrderedUserPreferenceEvidence(input: {
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

export function sourcePreferenceTopicTokens(input: {
  language: LanguageService;
  locale: string;
  text: string;
}): Set<string> {
  return sourceInstructionTopicTokens(input);
}

export function hasApplicableSourcePreferenceTopic(input: {
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
  if (selectorTopicOverlapCount(input.queryTopics, preferenceTopics) > 0) {
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

export function sourcePreferencePriority(input: {
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
  const overlap = selectorTopicOverlapCount(input.queryTopics, preferenceTopics);
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

export function selectSourceOrderedPreferenceEvidence(input: {
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
