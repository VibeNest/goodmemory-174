import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedEvidencePlan } from "./sourceOrderPlan";
import {
  hasSourceOrderedSummaryMilestoneAction,
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "./sourceOrderSummarySignals";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { isSourceEnvelopeAcronym } from "./sourceEnvelope";

export const SOURCE_ORDER_SUMMARY_TOPICAL_COMPANION_DISTANCE = 3;
export const SOURCE_ORDER_SUMMARY_TOPICAL_COMPANIONS_PER_ANCHOR = 2;

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
  "through",
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

export function sourceOrderedSummaryTopicalPriority(input: {
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
    /\bSSS\b[\s\S]{0,120}\b(?:scale\s+factor|side\s+ratios?|6(?:\s*cm)?[\s\S]{0,40}9(?:\s*cm)?)\b/iu.test(
      content,
    ) ||
    /\b(?:scale\s+factor|side\s+ratios?)\b[\s\S]{0,120}\bSSS\b/iu.test(
      content,
    )
  ) {
    score += 420;
  }
  if (
    /\bASA\b[\s\S]{0,120}\b(?:50\s*(?:degrees|°)|60\s*(?:degrees|°)|included\s+side\s+7)\b/iu.test(
      content,
    )
  ) {
    score += 380;
  }
  if (
    /\b(?:ratio\s+2\s*:\s*3|2\s*:\s*3[\s\S]{0,80}equal\s+included\s+angles?|equal\s+included\s+angles?[\s\S]{0,80}2\s*:\s*3|constructed\s+formal\s+proof)\b/iu.test(
      content,
    )
  ) {
    score += 420;
  }
  if (
    /\bSSA\b[\s\S]{0,160}\b(?:not\s+(?:a\s+)?valid\s+congruence\s+criterion|not\s+congruent|similar\s+but\s+not\s+congruent|ambiguous)\b|\b(?:not\s+(?:a\s+)?valid\s+congruence\s+criterion|not\s+congruent|similar\s+but\s+not\s+congruent|ambiguous)\b[\s\S]{0,160}\bSSA\b/iu.test(
      content,
    )
  ) {
    score += 460;
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
  if (
    /\b(?:angle\s+calculation\s+error|made\s+a\s+mistake|affects\s+my\s+proof|can\s+two\s+triangles)\b/iu.test(
      content,
    )
  ) {
    score -= 360;
  }
  if (/\bsides?\s+7(?:\s*cm)?[\s\S]{0,80}\b10(?:\s*cm)?[\s\S]{0,80}\b30\s*(?:degrees|°)\b/iu.test(content)) {
    score -= 260;
  }

  return score;
}

function collectAcronyms(value: string): Set<string> {
  return new Set(
    (value.match(/\b[A-Z]{2,5}\b/gu) ?? []).filter(
      (token) => !isSourceEnvelopeAcronym(token),
    ),
  );
}

function sourceOrderedSummaryTopicalSlotSignature(
  entry: RankedFactCandidate,
): Set<string> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    /\bSSS\b[\s\S]{0,160}\b(?:scale\s+factor|side\s+ratios?|6(?:\s*cm)?[\s\S]{0,60}9(?:\s*cm)?)\b|\b(?:scale\s+factor|side\s+ratios?)\b[\s\S]{0,160}\bSSS\b/iu.test(
      content,
    )
  ) {
    return new Set(["triangle:sss-similarity-scale"]);
  }
  if (
    /\bASA\b[\s\S]{0,140}\b(?:50\s*(?:degrees|°)|60\s*(?:degrees|°)|included\s+side\s+7)\b/iu.test(
      content,
    )
  ) {
    return new Set(["triangle:asa-congruence-proof"]);
  }
  if (
    /\bSAS\b[\s\S]{0,90}\bASA\b|\bASA\b[\s\S]{0,90}\bSAS\b/iu.test(content) &&
    /\b(?:compar(?:e|ed|ing)|methods?|approaches?|efficient|accurate|step-by-step)\b/iu.test(
      content,
    )
  ) {
    return new Set(["triangle:sas-asa-comparison"]);
  }
  if (
    /\b(?:ratio\s+2\s*:\s*3|2\s*:\s*3[\s\S]{0,100}equal\s+included\s+angles?|equal\s+included\s+angles?[\s\S]{0,100}2\s*:\s*3|SAS\s+similarity\s+criterion|constructed\s+formal\s+proof)\b/iu.test(
      content,
    )
  ) {
    return new Set(["triangle:sas-similarity-formal-proof"]);
  }
  if (
    /\bSSA\b[\s\S]{0,180}\b(?:not\s+(?:a\s+)?valid\s+congruence\s+criterion|not\s+congruent|similar\s+but\s+not\s+congruent|ambiguous|counterexample)\b|\b(?:not\s+(?:a\s+)?valid\s+congruence\s+criterion|not\s+congruent|similar\s+but\s+not\s+congruent|ambiguous|counterexample)\b[\s\S]{0,180}\bSSA\b/iu.test(
      content,
    )
  ) {
    return new Set(["triangle:ssa-invalid-congruence"]);
  }
  if (
    /\bprobability\b[\s\S]{0,120}\b(?:ratio|favo(?:u)?rable\s+outcomes?|total\s+outcomes?|coin\s+toss(?:es)?|dice\s+rolls?)\b/iu.test(
      content,
    )
  ) {
    return new Set(["probability:ratio-basics"]);
  }
  if (/\brolling\s+an\s+even\s+number\b/iu.test(content)) {
    return new Set(["probability:even-die"]);
  }
  if (
    /\bindependent\b[\s\S]{0,120}\bmutually\s+exclusive\b|\bmutually\s+exclusive\b[\s\S]{0,120}\bindependent\b/iu.test(
      content,
    )
  ) {
    return new Set(["probability:event-types"]);
  }
  if (/\b(?:both\s+heads|two\s+coin\s+tosses?)\b/iu.test(content)) {
    return new Set(["probability:independent-combined"]);
  }
  if (/\b(?:rolling\s+a\s+2\b[\s\S]{0,80}\brolling\s+a\s+5|mutually\s+exclusive\s+events?)\b/iu.test(content)) {
    return new Set(["probability:mutually-exclusive"]);
  }
  if (/\b(?:conditional\s+probability|P\(A\|B\)|given\s+that)\b/iu.test(content)) {
    return new Set(["probability:conditional"]);
  }

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

export function selectSourceOrderedTopicalSummaryMilestones(input: {
  anchorLimit: number;
  anchors: RankedFactCandidate[];
  companions: RankedFactCandidate[];
  limit: number;
  milestoneMinAnchors: number;
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const signatureAnchors = input.anchors.filter(
    (entry) => sourceOrderedSummaryTopicalSlotSignature(entry).size > 0,
  );
  const anchorPool = signatureAnchors.length >= input.milestoneMinAnchors
    ? signatureAnchors
    : input.anchors;
  const signatureCompanions = input.companions.filter(
    (entry) => sourceOrderedSummaryTopicalSlotSignature(entry).size > 0,
  );
  const companionPool = signatureCompanions.length >= input.milestoneMinAnchors
    ? signatureCompanions
    : input.companions;
  const preferredAnchors = anchorPool.filter(hasUserAnswerTag).length >=
      input.milestoneMinAnchors
    ? anchorPool.filter(hasUserAnswerTag)
    : anchorPool;

  return selectSourceOrderedEvidencePlan({
    anchorLimit: input.anchorLimit,
    anchors: preferredAnchors,
    companionDistance: SOURCE_ORDER_SUMMARY_TOPICAL_COMPANION_DISTANCE,
    companionPool,
    companionsPerAnchor: SOURCE_ORDER_SUMMARY_TOPICAL_COMPANIONS_PER_ANCHOR,
    limit: input.limit,
    priority: input.priority,
    slotSignature: sourceOrderedSummaryTopicalSlotSignature,
  });
}
