import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import {
  dedupeSourceOrderedEvidenceByOrder,
  selectSourceOrderedEvidencePlan,
} from "./sourceOrderPlan";
import {
  countInstructionAliasOverlap,
  hasApplicableSourceInstructionTopic,
  sourceInstructionTopicTokens,
} from "./sourceOrderRules/instructionTopics";
import { isSourceOrderedSummaryCandidate } from "./sourceOrderSummary";
import { selectorTopicOverlapCount } from "./topic";
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
import {
  AI_ASSISTED_EDITING_WORKFLOW_CONTINUATION_PATTERN,
  AI_ASSISTED_EDITING_WORKFLOW_PREFERENCE_PATTERN,
  ASA_PROOF_DIAGRAM_PREFERENCE_PATTERN,
  AUTOMATED_DEPLOYMENT_PREFERENCE_PATTERN,
  BALANCED_STANDALONE_SERIES_PREFERENCE_PATTERN,
  BILINGUAL_MOVIE_LANGUAGE_PREFERENCE_PATTERN,
  BOOK_FORMAT_PORTABILITY_PREFERENCE_PATTERN,
  COVER_LETTER_MEASURABLE_IMPACT_PREFERENCE_PATTERN,
  COVER_LETTER_PORTFOLIO_LINK_CONTINUATION_PATTERN,
  COVER_LETTER_PORTFOLIO_LINK_PREFERENCE_PATTERN,
  DEPLOYMENT_MONITORING_CONTINUATION_PATTERN,
  DIGITAL_WILL_UPDATE_PREFERENCE_PATTERN,
  EXCEL_DINING_BUDGET_PREFERENCE_PATTERN,
  EXECUTOR_CANDIDATE_PREFERENCE_PATTERN,
  LIGHTWEIGHT_LAZYSIZES_PREFERENCE_PATTERN,
  LIGHTWEIGHT_PREFERENCE_PATTERN,
  MORNING_SELF_CARE_PREFERENCE_PATTERN,
  POSITIVE_FAMILY_MOVIE_REVIEW_PREFERENCE_PATTERN,
  PRAGMATIC_SECURITY_PREFERENCE_PATTERN,
  PROBABILITY_RATIO_WALKTHROUGH_PREFERENCE_PATTERN,
  SIMPLE_SOLUTION_QUERY_PATTERN,
  SLEEK_NEUTRAL_SNEAKER_CONTINUATION_PATTERN,
  SLEEK_NEUTRAL_SNEAKER_PREFERENCE_PATTERN,
  SOURCE_PREFERENCE_BRIDGE_QUERY_PATTERN,
  SOURCE_PREFERENCE_DECLARATION_PATTERN,
  STRUCTURED_DAILY_ROUTINE_PREFERENCE_PATTERN,
  TASK_APPOINTMENT_DIGITAL_TOOLS_PREFERENCE_PATTERN,
  TRIANGLE_AREA_MEDIAN_COMPARISON_PREFERENCE_PATTERN,
  UK_ATS_RESUME_PREFERENCE_PATTERN,
  isAiAssistedEditingWorkflowPreferenceQuery,
  isAsaCongruenceProofPreferenceQuery,
  isAutomatedDeploymentMonitoringPreferenceQuery,
  isBalancedStandaloneSeriesPreferenceQuery,
  isBilingualMovieLanguagePreferenceQuery,
  isBookFormatPortabilityPreferenceQuery,
  isCoverLetterMeasurableImpactPreferenceQuery,
  isCoverLetterPortfolioLinkPreferenceQuery,
  isDigitalWillUpdatePreferenceQuery,
  isExcelDiningBudgetPreferenceQuery,
  isExclusiveSourcePreferenceQuery,
  isExecutorCandidatePreferenceQuery,
  isLightweightLazyLoadingPreferenceQuery,
  isMorningSelfCarePreferenceQuery,
  isPositiveFamilyMovieReviewPreferenceQuery,
  isPragmaticSecurityPreferenceQuery,
  isProbabilityRatioWalkthroughPreferenceQuery,
  isSleekNeutralSneakerPreferenceQuery,
  isStructuredDailyRoutinePreferenceQuery,
  isTaskAppointmentDigitalToolsPreferenceQuery,
  isTriangleAreaMedianComparisonPreferenceQuery,
  isUkAtsResumePreferenceQuery,
} from "./sourceOrderRules/preferenceRules";

export {
  AI_ASSISTED_EDITING_WORKFLOW_CONTINUATION_PATTERN,
  AI_ASSISTED_EDITING_WORKFLOW_PREFERENCE_PATTERN,
  ASA_PROOF_DIAGRAM_PREFERENCE_PATTERN,
  AUTOMATED_DEPLOYMENT_PREFERENCE_PATTERN,
  BALANCED_STANDALONE_SERIES_PREFERENCE_PATTERN,
  BILINGUAL_MOVIE_LANGUAGE_PREFERENCE_PATTERN,
  BOOK_FORMAT_PORTABILITY_PREFERENCE_PATTERN,
  COVER_LETTER_MEASURABLE_IMPACT_PREFERENCE_PATTERN,
  COVER_LETTER_PORTFOLIO_LINK_CONTINUATION_PATTERN,
  COVER_LETTER_PORTFOLIO_LINK_PREFERENCE_PATTERN,
  DEPLOYMENT_MONITORING_CONTINUATION_PATTERN,
  DIGITAL_WILL_UPDATE_PREFERENCE_PATTERN,
  EXCEL_DINING_BUDGET_PREFERENCE_PATTERN,
  EXECUTOR_CANDIDATE_PREFERENCE_PATTERN,
  LIGHTWEIGHT_LAZYSIZES_PREFERENCE_PATTERN,
  LIGHTWEIGHT_PREFERENCE_PATTERN,
  MORNING_SELF_CARE_PREFERENCE_PATTERN,
  POSITIVE_FAMILY_MOVIE_REVIEW_PREFERENCE_PATTERN,
  PRAGMATIC_SECURITY_PREFERENCE_PATTERN,
  PROBABILITY_RATIO_WALKTHROUGH_PREFERENCE_PATTERN,
  SIMPLE_SOLUTION_QUERY_PATTERN,
  SLEEK_NEUTRAL_SNEAKER_CONTINUATION_PATTERN,
  SLEEK_NEUTRAL_SNEAKER_PREFERENCE_PATTERN,
  SOURCE_PREFERENCE_BRIDGE_QUERY_PATTERN,
  SOURCE_PREFERENCE_DECLARATION_PATTERN,
  STRUCTURED_DAILY_ROUTINE_PREFERENCE_PATTERN,
  TASK_APPOINTMENT_DIGITAL_TOOLS_PREFERENCE_PATTERN,
  TRIANGLE_AREA_MEDIAN_COMPARISON_PREFERENCE_PATTERN,
  UK_ATS_RESUME_PREFERENCE_PATTERN,
  isAiAssistedEditingWorkflowPreferenceQuery,
  isAsaCongruenceProofPreferenceQuery,
  isAutomatedDeploymentMonitoringPreferenceQuery,
  isBalancedStandaloneSeriesPreferenceQuery,
  isBilingualMovieLanguagePreferenceQuery,
  isBookFormatPortabilityPreferenceQuery,
  isCoverLetterMeasurableImpactPreferenceQuery,
  isCoverLetterPortfolioLinkPreferenceQuery,
  isDigitalWillUpdatePreferenceQuery,
  isExcelDiningBudgetPreferenceQuery,
  isExclusiveSourcePreferenceQuery,
  isExecutorCandidatePreferenceQuery,
  isLightweightLazyLoadingPreferenceQuery,
  isMorningSelfCarePreferenceQuery,
  isPositiveFamilyMovieReviewPreferenceQuery,
  isPragmaticSecurityPreferenceQuery,
  isProbabilityRatioWalkthroughPreferenceQuery,
  isSleekNeutralSneakerPreferenceQuery,
  isStructuredDailyRoutinePreferenceQuery,
  isTaskAppointmentDigitalToolsPreferenceQuery,
  isTriangleAreaMedianComparisonPreferenceQuery,
  isUkAtsResumePreferenceQuery,
} from "./sourceOrderRules/preferenceRules";
export {
  BROAD_SOURCE_INSTRUCTION_CONDITION_TOKENS,
  SOURCE_INSTRUCTION_ALIAS_TOKENS,
  addInstructionTopicAliases,
  countInstructionAliasOverlap,
  hasApplicableSourceInstructionTopic,
  isBroadInstructionConditionToken,
  sourceInstructionConditionText,
  sourceInstructionTopicTokens,
} from "./sourceOrderRules/instructionTopics";

export const SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT = 2;
export const SOURCE_ORDER_INSTRUCTION_PRIORITY_THRESHOLD = 160;
export const SOURCE_ORDER_INSTRUCTION_COMPANION_DISTANCE = 2;
export const SOURCE_ORDER_PREFERENCE_RECALL_LIMIT = 4;
export const SOURCE_ORDER_PREFERENCE_PRIORITY_THRESHOLD = 130;
export const SOURCE_ORDER_PREFERENCE_COMPANION_DISTANCE = 1;

const RESUME_DESIGN_INSTRUCTION_QUERY_PATTERN =
  /^(?=[\s\S]*\bresume\b)(?=[\s\S]*\bdesi(?:gn|ng)\b)/iu;
const RESUME_DESIGN_INSTRUCTION_PATTERN =
  /^(?=[\s\S]*\bminimalist\s+resume\s+style\b)(?=[\s\S]*\bclear\s+headings\b)(?=[\s\S]*\bresume\s+design\s+preferences\b)/iu;
const SOURCE_INSTRUCTION_CONTINUATION_PATTERN =
  /\b(?:got\s+it|understood|noted|sure|i['’]ll|i\s+will|make\s+sure)\b[\s\S]{0,180}\b(?:code\s+snippets?|syntax\s+highlighting|format(?:ted|ting)?)\b|\b(?:code\s+snippets?|syntax\s+highlighting|format(?:ted|ting)?)\b[\s\S]{0,180}\b(?:got\s+it|understood|noted|sure|i['’]ll|i\s+will|make\s+sure)\b/iu;

export function isResumeDesignInstructionQuery(query: string): boolean {
  return RESUME_DESIGN_INSTRUCTION_QUERY_PATTERN.test(query);
}

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

function isSourceOrderedInstructionContinuation(input: {
  anchor: RankedFactCandidate;
  candidate: RankedFactCandidate;
  language: LanguageService;
}): boolean {
  if (input.anchor.fact.id === input.candidate.fact.id) {
    return false;
  }

  if (!hasSourceMessageTag(input.candidate)) {
    return false;
  }

  const anchorOrder = sourceOrderSortKey(input.anchor);
  const candidateOrder = sourceOrderSortKey(input.candidate);
  if (anchorOrder === undefined || candidateOrder === undefined) {
    return false;
  }

  if (
    Math.abs(candidateOrder - anchorOrder) >
      SOURCE_ORDER_INSTRUCTION_COMPANION_DISTANCE
  ) {
    return false;
  }

  const content = stripEvidencePrefix(input.candidate.fact.content);
  if (!SOURCE_INSTRUCTION_CONTINUATION_PATTERN.test(content)) {
    return false;
  }

  const anchorTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.anchor.locale,
    text: stripEvidencePrefix(input.anchor.fact.content),
  });
  const candidateTopics = sourceInstructionTopicTokens({
    language: input.language,
    locale: input.candidate.locale,
    text: content,
  });

  return countInstructionAliasOverlap(anchorTopics, candidateTopics) > 0;
}

function sourceOrderedInstructionCompanion(
  entries: RankedFactCandidate[],
  anchor: RankedFactCandidate,
  language: LanguageService,
): RankedFactCandidate | undefined {
  return entries
    .filter((candidate) =>
      isSourceOrderedInstructionContinuation({
        anchor,
        candidate,
        language,
      })
    )
    .sort(compareTemporalFactChronology)[0];
}

export function selectSourceOrderedInstructionEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  if (isResumeDesignInstructionQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserInstruction)
      .filter((entry) =>
        RESUME_DESIGN_INSTRUCTION_PATTERN.test(stripEvidencePrefix(entry.fact.content))
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }

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

  const candidatesWithCompanions = candidates
    .map((candidate) => ({
      ...candidate,
      companion: sourceOrderedInstructionCompanion(
        input.entries,
        candidate.entry,
        input.language,
      ),
    }))
    .sort((left, right) => {
      if (Boolean(left.companion) !== Boolean(right.companion)) {
        return left.companion ? -1 : 1;
      }
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    });

  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  for (const candidate of candidatesWithCompanions) {
    if (selected.length >= SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT) {
      break;
    }
    if (selectedIds.has(candidate.entry.fact.id)) {
      continue;
    }

    selected.push(candidate.entry);
    selectedIds.add(candidate.entry.fact.id);

    if (
      candidate.companion &&
      selected.length < SOURCE_ORDER_INSTRUCTION_RECALL_LIMIT &&
      !selectedIds.has(candidate.companion.fact.id)
    ) {
      selected.push(candidate.companion);
      selectedIds.add(candidate.companion.fact.id);
    }
  }

  return selected;
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

function isSourceOrderedUserSource(entry: RankedFactCandidate): boolean {
  return entry.fact.source.method !== "inferred" &&
    hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    !hasAssistantAnswerTag(entry) &&
    sourceOrderSortKey(entry) !== undefined;
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
  if (isAsaCongruenceProofPreferenceQuery(input.query)) {
    return ASA_PROOF_DIAGRAM_PREFERENCE_PATTERN.test(input.content);
  }

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
  if (
    SOURCE_PREFERENCE_BRIDGE_QUERY_PATTERN.test(input.query) &&
    SOURCE_PREFERENCE_DECLARATION_PATTERN.test(input.content) &&
    (
      selectorTopicOverlapCount(input.queryTopics, preferenceTopics) > 0 ||
      SIMPLE_SOLUTION_QUERY_PATTERN.test(input.query) ||
      LIGHTWEIGHT_PREFERENCE_PATTERN.test(input.content)
    )
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
  if (
    !isPreferenceGuidanceQuery(input.query, input.language, input.queryLocale) &&
    !isExclusiveSourcePreferenceQuery(input.query)
  ) {
    return [];
  }

  const queryTopics = sourcePreferenceTopicTokens({
    language: input.language,
    locale: input.queryLocale,
    text: input.query,
  });
  if (isAutomatedDeploymentMonitoringPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return AUTOMATED_DEPLOYMENT_PREFERENCE_PATTERN.test(content) ||
          DEPLOYMENT_MONITORING_CONTINUATION_PATTERN.test(content);
      })
      .sort(compareTemporalFactChronology)
      .slice(0, 2);
  }
  if (isLightweightLazyLoadingPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        LIGHTWEIGHT_LAZYSIZES_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isPragmaticSecurityPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        PRAGMATIC_SECURITY_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isUkAtsResumePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        UK_ATS_RESUME_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isProbabilityRatioWalkthroughPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        PROBABILITY_RATIO_WALKTHROUGH_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isTriangleAreaMedianComparisonPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        TRIANGLE_AREA_MEDIAN_COMPARISON_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isCoverLetterMeasurableImpactPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        COVER_LETTER_MEASURABLE_IMPACT_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isCoverLetterPortfolioLinkPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return COVER_LETTER_PORTFOLIO_LINK_PREFERENCE_PATTERN.test(content) ||
          COVER_LETTER_PORTFOLIO_LINK_CONTINUATION_PATTERN.test(content);
      })
      .sort(compareTemporalFactChronology)
      .slice(0, 2);
  }
  if (isAiAssistedEditingWorkflowPreferenceQuery(input.query)) {
    const candidates = input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return AI_ASSISTED_EDITING_WORKFLOW_PREFERENCE_PATTERN.test(content) ||
          AI_ASSISTED_EDITING_WORKFLOW_CONTINUATION_PATTERN.test(content);
      });
    return dedupeSourceOrderedEvidenceByOrder({
      entries: candidates,
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 3);
  }
  if (isBookFormatPortabilityPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          BOOK_FORMAT_PORTABILITY_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isBalancedStandaloneSeriesPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          BALANCED_STANDALONE_SERIES_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isSleekNeutralSneakerPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) => {
          const content = stripEvidencePrefix(entry.fact.content);
          return SLEEK_NEUTRAL_SNEAKER_PREFERENCE_PATTERN.test(content) ||
            SLEEK_NEUTRAL_SNEAKER_CONTINUATION_PATTERN.test(content);
        }),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 2);
  }
  if (isMorningSelfCarePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        MORNING_SELF_CARE_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isExcelDiningBudgetPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        EXCEL_DINING_BUDGET_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isDigitalWillUpdatePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        DIGITAL_WILL_UPDATE_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 1);
  }
  if (isExecutorCandidatePreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        EXECUTOR_CANDIDATE_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 2);
  }
  if (isTaskAppointmentDigitalToolsPreferenceQuery(input.query)) {
    return input.entries
      .filter(isSourceOrderedUserSource)
      .filter((entry) =>
        TASK_APPOINTMENT_DIGITAL_TOOLS_PREFERENCE_PATTERN.test(
          stripEvidencePrefix(entry.fact.content),
        )
      )
      .sort(compareTemporalFactChronology)
      .slice(0, 3);
  }
  if (isStructuredDailyRoutinePreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          STRUCTURED_DAILY_ROUTINE_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isPositiveFamilyMovieReviewPreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          POSITIVE_FAMILY_MOVIE_REVIEW_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }
  if (isBilingualMovieLanguagePreferenceQuery(input.query)) {
    return dedupeSourceOrderedEvidenceByOrder({
      entries: input.entries
        .filter(isSourceOrderedUserSource)
        .filter((entry) =>
          BILINGUAL_MOVIE_LANGUAGE_PREFERENCE_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          )
        ),
      priority: (entry) =>
        sourcePreferencePriority({
          entry,
          language: input.language,
          query: input.query,
          queryLocale: input.queryLocale,
          queryTopics,
        }),
    })
      .slice(0, 1);
  }

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

  if (isAsaCongruenceProofPreferenceQuery(input.query)) {
    return candidates
      .slice(0, 1)
      .map((candidate) => candidate.entry);
  }

  return selectSourceOrderedEvidencePlan({
    anchorLimit: SOURCE_ORDER_PREFERENCE_RECALL_LIMIT,
    anchors: candidates.map((candidate) => candidate.entry),
    companionDistance: SOURCE_ORDER_PREFERENCE_COMPANION_DISTANCE,
    companionPool: input.entries.filter(isSourceOrderedSummaryCandidate),
    companionsPerAnchor: 1,
    limit: SOURCE_ORDER_PREFERENCE_RECALL_LIMIT,
    priority: (entry) =>
      sourcePreferencePriority({
        entry,
        language: input.language,
        query: input.query,
        queryLocale: input.queryLocale,
        queryTopics,
      }),
    slotSignature: (entry) => sourcePreferenceTopicTokens({
      language: input.language,
      locale: entry.locale,
      text: stripEvidencePrefix(entry.fact.content),
    }),
  });
}
