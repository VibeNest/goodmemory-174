import type { LanguageService } from "../../../language";
import type { RankedFactCandidate } from "../../scoring";
import { selectorTopicTokens } from "../topic";

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

export function addInstructionTopicAliases(tokens: Set<string>, text: string): void {
  const normalized = text.toLowerCase();
  const hasAny = (pattern: RegExp): boolean => pattern.test(normalized);
  const hasApiSurface = hasAny(/\b(?:api|rest|responses?|status\s+codes?)\b/iu);
  const hasApiErrorHandling = hasAny(/\b(?:errors?|handling|handle|status\s+codes?|something\s+goes\s+wrong|goes\s+wrong|fail(?:s|ed|ure)?)\b/iu);

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
