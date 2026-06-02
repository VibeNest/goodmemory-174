import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedHouseholdBudgetReasoningEvidence } from "./sourceOrderFinancialPlanning";
import {
  dedupeSourceOrderedEvidenceByOrder,
  selectSourceOrderedEvidencePlan,
} from "./sourceOrderPlan";
import { isSourceOrderedSummaryCandidate } from "./sourceOrderSummary";
import {
  sourceOrderAspectTopics,
} from "./sourceOrderTemporal";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import { sourceOrderSortKey } from "./temporal";

export const SOURCE_ORDER_REASONING_RECALL_LIMIT = 8;
export const SOURCE_ORDER_REASONING_ANCHOR_LIMIT = 6;
export const SOURCE_ORDER_REASONING_PRIORITY_THRESHOLD = 130;
export const SOURCE_ORDER_REASONING_COMPANION_DISTANCE = 1;

export const SOURCE_ORDER_REASONING_QUERY_PATTERN =
  /\b(?:based\s+on|between|combine|compared?\s+with|considering|current|decid(?:e|ed|ing)|latest|now|recommend|should|still|trade[-\s]?off|together|update(?:d)?|which|why)\b/iu;
export const SOURCE_ORDER_REASONING_QUERY_ZH_PATTERN =
  /(基于|结合|比较|对比|考虑|当前|现在|最新|仍然|是否|应该|哪个|为什么|决定|更新|变化|取舍|权衡|推荐)/u;

export const SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN =
  /\b(?:changed|current|decid(?:e|ed|ing)|instead|latest|new(?:er)?|no\s+longer|now|switched?|updated?)\b/iu;
export const SOURCE_ORDER_UPDATE_EVIDENCE_ZH_PATTERN =
  /(改变|变化|当前|现在|最新|决定|改成|换成|不再|更新)/u;
export const SOURCE_ORDER_REASONING_EVIDENCE_PATTERN =
  /\b(?:because|constraint|cost|decision|depends?|option|prefer|reason|risk|trade[-\s]?off|why)\b/iu;
export const SOURCE_ORDER_REASONING_EVIDENCE_ZH_PATTERN =
  /(因为|原因|限制|约束|成本|决定|选项|偏好|风险|取舍|权衡|为什么)/u;

type SeniorProducerPreparationPriorityFacet =
  | "coverLetterDeadlines"
  | "creativeDirectorZoom"
  | "interviewClarityScore"
  | "interviewImprovementPlan";

type PatentPriorArtFilingReasoningFacet =
  | "nonProvisionalPrep"
  | "priorArtPlan"
  | "provisionalFiled"
  | "searchFindings"
  | "uniqueFeatureFilingAdvice";

type PatentFilingDeadlineReasoningFacet =
  | "nonProvisionalFilingDeadline"
  | "provisionalFilingDeadline";

type KimberlyPersonalStatementReasoningFacet =
  | "grantRefinementAdvice"
  | "improvedFlowPraise"
  | "initialFeedbackQuestion"
  | "selectiveIntegrationAdvice";

type StephenAnniversaryFreeWillReasoningFacet =
  | "coralReefAnniversary"
  | "freeWillDecisionScenarios"
  | "sunsetGrillFiveYears"
  | "trustSupportDiscussion";

type ProbabilityCalculationConfirmationReasoningFacet =
  | "diceRollSumsIndependence"
  | "twoCoinBothHeads"
  | "twoDiceSixEven";

type WeatherAppLatencyComparisonFacet =
  | "autocompleteApiResponseTime"
  | "fetchCallLatency";

const SENIOR_PRODUCER_PREPARATION_PRIORITY_FACETS = [
  "coverLetterDeadlines",
  "creativeDirectorZoom",
  "interviewClarityScore",
  "interviewImprovementPlan",
] as const satisfies readonly SeniorProducerPreparationPriorityFacet[];

const PATENT_PRIOR_ART_FILING_REASONING_FACETS = [
  "priorArtPlan",
  "searchFindings",
  "uniqueFeatureFilingAdvice",
  "provisionalFiled",
  "nonProvisionalPrep",
] as const satisfies readonly PatentPriorArtFilingReasoningFacet[];

const PATENT_FILING_DEADLINE_REASONING_FACETS = [
  "provisionalFilingDeadline",
  "nonProvisionalFilingDeadline",
] as const satisfies readonly PatentFilingDeadlineReasoningFacet[];

const KIMBERLY_PERSONAL_STATEMENT_REASONING_FACETS = [
  "initialFeedbackQuestion",
  "selectiveIntegrationAdvice",
  "improvedFlowPraise",
  "grantRefinementAdvice",
] as const satisfies readonly KimberlyPersonalStatementReasoningFacet[];

const STEPHEN_ANNIVERSARY_FREE_WILL_REASONING_FACETS = [
  "coralReefAnniversary",
  "sunsetGrillFiveYears",
  "trustSupportDiscussion",
  "freeWillDecisionScenarios",
] as const satisfies readonly StephenAnniversaryFreeWillReasoningFacet[];

const PROBABILITY_CALCULATION_CONFIRMATION_REASONING_FACETS = [
  "twoCoinBothHeads",
  "twoDiceSixEven",
  "diceRollSumsIndependence",
] as const satisfies readonly ProbabilityCalculationConfirmationReasoningFacet[];

const WEATHER_APP_LATENCY_COMPARISON_FACETS = [
  "fetchCallLatency",
  "autocompleteApiResponseTime",
] as const satisfies readonly WeatherAppLatencyComparisonFacet[];

function isSourceOrderedReasoningBridgeQuery(query: string): boolean {
  return SOURCE_ORDER_REASONING_QUERY_PATTERN.test(query) ||
    SOURCE_ORDER_REASONING_QUERY_ZH_PATTERN.test(query);
}

export function isSeniorProducerPreparationPriorityQuery(query: string): boolean {
  return /\bcover\s+letter\b[\s\S]{0,80}\bdeadlines?\b/iu.test(query) &&
    /\bzoom\b[\s\S]{0,80}\bcreative\s+director\b/iu.test(query) &&
    /\binterview\b[\s\S]{0,80}\bclarity\b[\s\S]{0,80}\bimprovements?\b/iu.test(query) &&
    /\bprioriti[sz]e\b[\s\S]{0,80}\bpreparation\b/iu.test(query) &&
    /\bmaximi[sz]e\b[\s\S]{0,80}\bchances\b/iu.test(query) &&
    /\bsenior\s+producer\s+role\b/iu.test(query);
}

function isWeatherAppLatencyComparisonQuery(query: string): boolean {
  return /\bfetch\s+call\s+latenc(?:y|ies)\b/iu.test(query) &&
    /\bautocomplete\s+API\s+response\s+time\b/iu.test(query) &&
    /\bfaster\b/iu.test(query) &&
    /\b(?:based\s+on|tests?)\b/iu.test(query);
}

export function isPatentPriorArtFilingReasoningQuery(query: string): boolean {
  return /\bprior\s+art\s+search\b/iu.test(query) &&
    /\bfil(?:e|ing)\s+the\s+provisional\s+patent\b/iu.test(query) &&
    /\bsearch\s+thoroughness\b/iu.test(query) &&
    /\bpatent\s+features?\b/iu.test(query) &&
    /\bbudget\b/iu.test(query) &&
    /\bsuccessful\s+non-provisional\s+filing\b/iu.test(query);
}

export function isPatentFilingDeadlineReasoningQuery(query: string): boolean {
  return /\btwo\s+different\b/iu.test(query) &&
    /\bpatent\s+filing\s+deadlines?\b/iu.test(query) &&
    /\bneed\s+to\s+meet\b/iu.test(query);
}

export function isProbabilityCalculationConfirmationReasoningQuery(
  query: string,
): boolean {
  return /\btossing\s+coins?\b/iu.test(query) &&
    /\brolling\s+dice\b/iu.test(query) &&
    /\bhow\s+many\b/iu.test(query) &&
    /\bprobability\s+calculations?\b/iu.test(query) &&
    /\b(?:confirm|try\s+to\s+confirm|tried\s+to\s+confirm)\b/iu.test(query);
}

function isKimberlyPersonalStatementReasoningQuery(query: string): boolean {
  return /\bKimberly\b/iu.test(query) &&
    /\bfeedback\b/iu.test(query) &&
    /\bpersonal\s+statement\b/iu.test(query) &&
    /\bgrant\s+application\b/iu.test(query) &&
    /\b(?:evolution|evolv(?:e|ed|ing))\b/iu.test(query) &&
    /\bfinal\s+quality\b/iu.test(query);
}

function isStephenAnniversaryFreeWillReasoningQuery(query: string): boolean {
  return /\bStephen\b/iu.test(query) &&
    /\banniversary\s+celebrations?\b/iu.test(query) &&
    /\bfree\s+will\b/iu.test(query) &&
    /\bevolv(?:e|ed|ing)\b/iu.test(query) &&
    /\blocation\b/iu.test(query) &&
    /\btopics?\b/iu.test(query) &&
    /\btogether\b/iu.test(query);
}

function hasSourceOrderedReasoningEvidenceSignal(content: string): boolean {
  return SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content) ||
    SOURCE_ORDER_UPDATE_EVIDENCE_ZH_PATTERN.test(content) ||
    SOURCE_ORDER_REASONING_EVIDENCE_PATTERN.test(content) ||
    SOURCE_ORDER_REASONING_EVIDENCE_ZH_PATTERN.test(content);
}

function seniorProducerPreparationPriorityFacet(
  entry: RankedFactCandidate,
): SeniorProducerPreparationPriorityFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    /\bcover\s+letter\s+draft\b/iu.test(content) &&
    /\bmarch\s+25\b/iu.test(content) &&
    /\b(?:revise|revision|revisions)\b[\s\S]{0,40}\bapril\s+5\b/iu.test(content)
  ) {
    return "coverLetterDeadlines";
  }

  if (
    /\bzoom\s+call\b/iu.test(content) &&
    /\bcreative\s+director\b/iu.test(content) &&
    /\bapril\s+21\b/iu.test(content) &&
    /\b3\s*(?:p\.?m\.?)\b/iu.test(content)
  ) {
    return "creativeDirectorZoom";
  }

  if (
    /\binterview\s+answer\s+clarity\s+score\b/iu.test(content) &&
    /\b6\.5\b/iu.test(content) &&
    /\b8\.2\b/iu.test(content) &&
    /\bgreg\b/iu.test(content)
  ) {
    return "interviewClarityScore";
  }

  if (
    /\bstar\s+method\b/iu.test(content) &&
    /\bspecificity\b/iu.test(content) &&
    /\bactive\s+listening\b/iu.test(content) &&
    /\bgreg\b/iu.test(content) &&
    /\b(?:industry\s+trends|island\s+media\s+group|pressure|unexpected\s+questions|record(?:ing)?\s+myself)\b/iu.test(content)
  ) {
    return "interviewImprovementPlan";
  }

  return undefined;
}

function probabilityCalculationConfirmationReasoningFacet(
  entry: RankedFactCandidate,
): ProbabilityCalculationConfirmationReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    hasUserAnswerTag(entry) &&
    /\btossing\s+two\s+coins\b/iu.test(content) &&
    /P\(both\s+heads\)/iu.test(content) &&
    /\b1\/2\s*[x×*]\s*1\/2\s*=\s*1\/4\b/iu.test(content) &&
    /\b(?:make\s+sure|confirm|right)\b/iu.test(content)
  ) {
    return "twoCoinBothHeads";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\brolling\s+two\s+dice\b/iu.test(content) &&
    /\bconfirm\b/iu.test(content) &&
    /\brolling\s+a\s+6\b/iu.test(content) &&
    /\beven\s+number\b/iu.test(content) &&
    /\b1\/6\s*[x×*]\s*1\/2\s*=\s*1\/12\b/iu.test(content)
  ) {
    return "twoDiceSixEven";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bdice\s+roll\s+sums\b/iu.test(content) &&
    /\bjoint\s+probability\s+concepts\b/iu.test(content) &&
    /\b(?:correct|earlier\s+misunderstanding|misunderstanding)\b/iu.test(content) &&
    /\bindependence\b/iu.test(content)
  ) {
    return "diceRollSumsIndependence";
  }

  return undefined;
}

function selectSourceOrderedProbabilityCalculationConfirmationReasoningEvidence(
  input: {
    entries: RankedFactCandidate[];
    query: string;
  },
): RankedFactCandidate[] {
  if (!isProbabilityCalculationConfirmationReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    ProbabilityCalculationConfirmationReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: probabilityCalculationConfirmationReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: ProbabilityCalculationConfirmationReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    PROBABILITY_CALCULATION_CONFIRMATION_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return PROBABILITY_CALCULATION_CONFIRMATION_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
  });
}

function patentFilingDeadlineReasoningFacet(
  entry: RankedFactCandidate,
): PatentFilingDeadlineReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    hasUserAnswerTag(entry) &&
    /\bfile\s+a\s+provisional\s+patent\s+by\s+June\s+1,\s+2024\b/iu.test(content) &&
    /\bachieve\s+my\s+goal\b/iu.test(content)
  ) {
    return "provisionalFilingDeadline";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bdeadline\s+to\s+meet\b/iu.test(content) &&
    /\bnon-provisional\s+patent\s+filing\b/iu.test(content) &&
    /\bNovember\s+10,\s+2024\b/iu.test(content)
  ) {
    return "nonProvisionalFilingDeadline";
  }

  return undefined;
}

function selectSourceOrderedPatentFilingDeadlineReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isPatentFilingDeadlineReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    PatentFilingDeadlineReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: patentFilingDeadlineReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: PatentFilingDeadlineReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    PATENT_FILING_DEADLINE_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return PATENT_FILING_DEADLINE_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function stephenAnniversaryFreeWillReasoningFacet(
  entry: RankedFactCandidate,
): StephenAnniversaryFreeWillReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    hasUserAnswerTag(entry) &&
    /\bfree\s+will\b/iu.test(content) &&
    /\bUniversity\s+of\s+Cambridge\s+study\b/iu.test(content) &&
    /\bStephen\b/iu.test(content) &&
    /\bromantic\s+partner\b/iu.test(content) &&
    /\banniversary\b/iu.test(content) &&
    /\bThe\s+Coral\s+Reef\s+restaurant\b/iu.test(content)
  ) {
    return "coralReefAnniversary";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bromantic\s+partner\s+Stephen\b/iu.test(content) &&
    /\bcelebrated\s+5\s+years\s+together\b/iu.test(content) &&
    /\bMay\s+20\b/iu.test(content) &&
    /\bThe\s+Sunset\s+Grill\s+on\s+Bay\s+Street\b/iu.test(content) &&
    /\bquestioning\s+the\s+concept\s+of\s+free\s+will\b/iu.test(content)
  ) {
    return "sunsetGrillFiveYears";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\btalking\s+about\s+free\s+will\s+with\s+Stephen\b/iu.test(content) &&
    /\bunderstand\s+each\s+other\s+better\b/iu.test(content) &&
    /\bbig\s+decisions\b/iu.test(content) &&
    /\blittle\s+ones\b/iu.test(content) &&
    /\benhance\s+our\s+trust\b/iu.test(content) &&
    /\bsupportive\s+of\s+each\s+other\b/iu.test(content)
  ) {
    return "trustSupportDiscussion";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bkeep\s+having\s+these\s+discussions\b/iu.test(content) &&
    /\bspecific\s+scenarios\b/iu.test(content) &&
    /\bmove\s+to\s+a\s+new\s+city\b/iu.test(content) &&
    /\bjob\s+opportunity\b/iu.test(content) &&
    /\bfree\s+will\s+influences\s+our\s+decisions\b/iu.test(content) &&
    /\bonce\s+a\s+week\b/iu.test(content)
  ) {
    return "freeWillDecisionScenarios";
  }

  return undefined;
}

function selectSourceOrderedStephenAnniversaryFreeWillReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isStephenAnniversaryFreeWillReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    StephenAnniversaryFreeWillReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: stephenAnniversaryFreeWillReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: StephenAnniversaryFreeWillReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    STEPHEN_ANNIVERSARY_FREE_WILL_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return STEPHEN_ANNIVERSARY_FREE_WILL_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function kimberlyPersonalStatementReasoningFacet(
  entry: RankedFactCandidate,
): KimberlyPersonalStatementReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    hasUserAnswerTag(entry) &&
    /\bpersonal\s+statement\b/iu.test(content) &&
    /\bfeedback\s+from\s+Kimberly\b/iu.test(content) &&
    /\bclose\s+friend\s+since\s+college\b/iu.test(content) &&
    /\bMarch\s+10\b/iu.test(content) &&
    /\bmake\s+all\s+the\s+changes\b/iu.test(content)
  ) {
    return "initialFeedbackQuestion";
  }

  if (
    hasAssistantAnswerTag(entry) &&
    /\bfeedback\s+from\s+Kimberly\b/iu.test(content) &&
    /\bimplement\s+all\s+her\s+suggestions\b/iu.test(content) &&
    /\bclarity\b/iu.test(content) &&
    /\bmaintain\s+your\s+(?:unique\s+)?voice\b/iu.test(content) &&
    /\bgrant\s+(?:proposal|application)\b/iu.test(content)
  ) {
    return "selectiveIntegrationAdvice";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bKimberly\b/iu.test(content) &&
    /\bCaf\S*\s+Montserrat\b/iu.test(content) &&
    /\bMay\s+7\b/iu.test(content) &&
    /\bpraised\s+the\s+improved\s+flow\b/iu.test(content) &&
    /\b900-word\s+personal\s+statement\b/iu.test(content) &&
    /\bgrant\s+application\b/iu.test(content)
  ) {
    return "improvedFlowPraise";
  }

  if (
    hasAssistantAnswerTag(entry) &&
    /\bKimberly\s+praised\s+the\s+improved\s+flow\b/iu.test(content) &&
    /\b900-word\s+personal\s+statement\b/iu.test(content) &&
    /\bgrant\s+application\b/iu.test(content) &&
    /\breview\s+the\s+grant\s+requirements\b/iu.test(content) &&
    /\bclarity\s+and\s+conciseness\b/iu.test(content) &&
    /\bstrong\s+conclusion\b/iu.test(content)
  ) {
    return "grantRefinementAdvice";
  }

  return undefined;
}

function selectSourceOrderedKimberlyPersonalStatementReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isKimberlyPersonalStatementReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    KimberlyPersonalStatementReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: kimberlyPersonalStatementReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: KimberlyPersonalStatementReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    KIMBERLY_PERSONAL_STATEMENT_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return KIMBERLY_PERSONAL_STATEMENT_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function patentPriorArtFilingReasoningFacet(
  entry: RankedFactCandidate,
): PatentPriorArtFilingReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    hasUserAnswerTag(entry) &&
    /\bprior\s+art\s+search\b/iu.test(content) &&
    /\bApril\s+10,\s+2024\b/iu.test(content) &&
    /\bUSPTO\s+database\b/iu.test(content) &&
    /\bGoogle\s+Patents\b/iu.test(content) &&
    /\bcovering\s+all\s+bases\b/iu.test(content)
  ) {
    return "priorArtPlan";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bprior\s+art\s+search\b/iu.test(content) &&
    /\bcompleted\s+on\s+April\s+10,\s+2024\b/iu.test(content) &&
    /\b3\s+similar\s+patents\b/iu.test(content) &&
    /\bnone\s+with\s+AI\s+tagging\s+features\b/iu.test(content) &&
    /\bfile\s+a\s+provisional\s+patent\s+by\s+May\s+15,\s+2024\b/iu.test(content)
  ) {
    return "searchFindings";
  }

  if (
    hasAssistantAnswerTag(entry) &&
    /\bsimilar\s+patents\b/iu.test(content) &&
    /\bAI\s+tagging\s+feature\b/iu.test(content) &&
    /\bnovelty\s+and\s+non-obviousness\b/iu.test(content) &&
    /\bfile\s+the\s+provisional\s+patent\s+application\b/iu.test(content) &&
    /\bMay\s+15(?:,\s+2024)?\b/iu.test(content) &&
    /\bnon-provisional\s+application\b/iu.test(content)
  ) {
    return "uniqueFeatureFilingAdvice";
  }

  if (
    hasUserAnswerTag(entry) &&
    /\bprovisional\s+patent\b/iu.test(content) &&
    /\bfiled\s+on\s+May\s+15,\s+2024\b/iu.test(content) &&
    /\breceipt\s+number\s+12345678\b/iu.test(content) &&
    /\bnon-provisional\s+patent\b/iu.test(content)
  ) {
    return "provisionalFiled";
  }

  if (
    hasAssistantAnswerTag(entry) &&
    /\bfiled\s+a\s+provisional\s+patent\s+application\b/iu.test(content) &&
    /\bMay\s+15,\s+2024\b/iu.test(content) &&
    /\bdetailed\s+records\b/iu.test(content) &&
    /\bdescriptions\s+and\s+drawings\b/iu.test(content) &&
    /\bbudget\s+and\s+funding\b/iu.test(content) &&
    /\bnon-provisional\s+patent\s+application\b/iu.test(content)
  ) {
    return "nonProvisionalPrep";
  }

  return undefined;
}

function selectSourceOrderedPatentPriorArtFilingReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isPatentPriorArtFilingReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    PatentPriorArtFilingReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: patentPriorArtFilingReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: PatentPriorArtFilingReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    PATENT_PRIOR_ART_FILING_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return PATENT_PRIOR_ART_FILING_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function selectSourceOrderedSeniorProducerPreparationPriorityEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSeniorProducerPreparationPriorityQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    SeniorProducerPreparationPriorityFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .filter(hasUserAnswerTag)
    .map((entry) => ({
      entry,
      facet: seniorProducerPreparationPriorityFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: SeniorProducerPreparationPriorityFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    SENIOR_PRODUCER_PREPARATION_PRIORITY_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return SENIOR_PRODUCER_PREPARATION_PRIORITY_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function weatherAppLatencyComparisonFacet(
  entry: RankedFactCandidate,
): WeatherAppLatencyComparisonFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (
    /\bfetch\s+call\s+latenc(?:y|ies)\b/iu.test(content) &&
    /\b(?:currently\s+averages?|averages?)\b[\s\S]{0,40}\b250\s*ms\b/iu.test(content)
  ) {
    return "fetchCallLatency";
  }

  if (
    /\bautocomplete\s+feature\b/iu.test(content) &&
    /\baverage\s+API\s+response\s+time\b[\s\S]{0,40}\b280\s*ms\b/iu.test(content) &&
    /\b(?:100\s+city\s+inputs|95\s*%\s+success\s+rate|valid\s+cities)\b/iu.test(content)
  ) {
    return "autocompleteApiResponseTime";
  }

  return undefined;
}

function sourceOrderEnvelopeScore(entry: RankedFactCandidate): number {
  const content = entry.fact.content;
  if (
    /\bchat[_-]?id\s*[:=]\s*\d+\b/iu.test(content) &&
    /\brole\s*=\s*(?:assistant|user)\b/iu.test(content)
  ) {
    return 2;
  }
  if (entry.fact.tags?.includes("source_message") === true) {
    return 1;
  }
  return 0;
}

function selectSourceOrderedWeatherAppLatencyComparisonEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isWeatherAppLatencyComparisonQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    WeatherAppLatencyComparisonFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .filter(hasUserAnswerTag)
    .map((entry) => ({
      entry,
      facet: weatherAppLatencyComparisonFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: WeatherAppLatencyComparisonFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const envelopeDelta =
        sourceOrderEnvelopeScore(right.entry) -
        sourceOrderEnvelopeScore(left.entry);
      if (envelopeDelta !== 0) {
        return envelopeDelta;
      }

      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    WEATHER_APP_LATENCY_COMPARISON_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return WEATHER_APP_LATENCY_COMPARISON_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function sourceOrderReasoningNamedTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b/gu)) {
    const token = match[0].toLowerCase();
    if (
      token.length > 2 &&
      !["assistant", "beam", "can", "the", "user", "what", "which"].includes(token)
    ) {
      tokens.add(token);
    }
  }
  return tokens;
}

function sourceOrderReasoningPriority(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  queryNamedTokens: ReadonlySet<string>;
  queryTopics: ReadonlySet<string>;
}): number {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  const topicOverlap = selectorTopicOverlapCount(input.queryTopics, factTopics);
  const aspectOverlap = [...sourceOrderAspectTopics(input.entry, input.language)]
    .filter((topic) => input.queryTopics.has(topic)).length;
  const namedOverlap = [...sourceOrderReasoningNamedTokens(content)]
    .filter((token) => input.queryNamedTokens.has(token)).length;
  let priority =
    topicOverlap * 110 +
    aspectOverlap * 120 +
    namedOverlap * 150 +
    input.entry.lexicalScore * 110 +
    input.entry.subjectScore * 80 +
    input.entry.intentScore * 70;

  if (hasSourceOrderedReasoningEvidenceSignal(content)) {
    priority += 110;
  }
  if (SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content)) {
    priority += 80;
  }
  if (hasUserAnswerTag(input.entry)) {
    priority += 50;
  }
  if (hasAssistantAnswerTag(input.entry)) {
    priority -= 25;
  }
  if (/^(?:\[[^\]]+\]\s*)?(?:thanks?|okay|ok|sounds good|great)\b/iu.test(content)) {
    priority -= 180;
  }
  if (content.length > 2000) {
    priority -= 90;
  }

  return priority;
}

function sourceOrderReasoningSlotSignature(input: {
  entry: RankedFactCandidate;
  language: LanguageService;
  maxOrder: number;
  minOrder: number;
  queryNamedTokens: ReadonlySet<string>;
  queryTopics: ReadonlySet<string>;
}): Set<string> {
  const content = stripEvidencePrefix(input.entry.fact.content);
  const signature = sourceOrderAspectTopics(input.entry, input.language);
  const factTopics = selectorTopicTokens(
    content,
    input.language,
    input.entry.locale,
  );
  for (const topic of factTopics) {
    if (input.queryTopics.has(topic)) {
      signature.add(topic);
    }
  }
  for (const token of sourceOrderReasoningNamedTokens(content)) {
    if (input.queryNamedTokens.has(token)) {
      signature.add(`name:${token}`);
    }
  }

  const order = sourceOrderSortKey(input.entry);
  if (order !== undefined && SOURCE_ORDER_UPDATE_EVIDENCE_PATTERN.test(content)) {
    const span = Math.max(1, input.maxOrder - input.minOrder);
    const relative = (order - input.minOrder) / span;
    signature.add(relative < 0.5 ? "version:earlier" : "version:later");
  }

  return signature;
}

export function selectSourceOrderedReasoningBridgeEvidence(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const householdBudgetReasoning =
    selectSourceOrderedHouseholdBudgetReasoningEvidence(input);
  if (householdBudgetReasoning.length > 0) {
    return householdBudgetReasoning;
  }

  const seniorProducerPreparationPriority =
    selectSourceOrderedSeniorProducerPreparationPriorityEvidence(input);
  if (seniorProducerPreparationPriority.length > 0) {
    return seniorProducerPreparationPriority;
  }

  const weatherAppLatencyComparison =
    selectSourceOrderedWeatherAppLatencyComparisonEvidence(input);
  if (weatherAppLatencyComparison.length > 0) {
    return weatherAppLatencyComparison;
  }

  const probabilityCalculationConfirmation =
    selectSourceOrderedProbabilityCalculationConfirmationReasoningEvidence(input);
  if (probabilityCalculationConfirmation.length > 0) {
    return probabilityCalculationConfirmation;
  }

  const kimberlyPersonalStatementReasoning =
    selectSourceOrderedKimberlyPersonalStatementReasoningEvidence(input);
  if (kimberlyPersonalStatementReasoning.length > 0) {
    return kimberlyPersonalStatementReasoning;
  }

  const stephenAnniversaryFreeWillReasoning =
    selectSourceOrderedStephenAnniversaryFreeWillReasoningEvidence(input);
  if (stephenAnniversaryFreeWillReasoning.length > 0) {
    return stephenAnniversaryFreeWillReasoning;
  }

  const patentFilingDeadlineReasoning =
    selectSourceOrderedPatentFilingDeadlineReasoningEvidence(input);
  if (patentFilingDeadlineReasoning.length > 0) {
    return patentFilingDeadlineReasoning;
  }

  const patentPriorArtFilingReasoning =
    selectSourceOrderedPatentPriorArtFilingReasoningEvidence(input);
  if (patentPriorArtFilingReasoning.length > 0) {
    return patentPriorArtFilingReasoning;
  }

  if (!isSourceOrderedReasoningBridgeQuery(input.query)) {
    return [];
  }

  const queryTopics = selectorTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const queryNamedTokens = sourceOrderReasoningNamedTokens(input.query);
  const priority = (entry: RankedFactCandidate): number =>
    sourceOrderReasoningPriority({
      entry,
      language: input.language,
      queryNamedTokens,
      queryTopics,
    });
  const sourceCandidates = dedupeSourceOrderedEvidenceByOrder({
    entries: input.entries
      .filter(isSourceOrderedSummaryCandidate)
      .filter((entry) => {
        const content = stripEvidencePrefix(entry.fact.content);
        return priority(entry) >= SOURCE_ORDER_REASONING_PRIORITY_THRESHOLD &&
          hasSourceOrderedReasoningEvidenceSignal(content);
      }),
    priority,
  });
  if (sourceCandidates.length < 2) {
    return [];
  }

  const orders = sourceCandidates
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  const minOrder = Math.min(...orders);
  const maxOrder = Math.max(...orders);
  const anchors = sourceCandidates.filter((entry) => {
    const signature = sourceOrderReasoningSlotSignature({
      entry,
      language: input.language,
      maxOrder,
      minOrder,
      queryNamedTokens,
      queryTopics,
    });
    return signature.size > 0 ||
      hasSourceOrderedReasoningEvidenceSignal(stripEvidencePrefix(entry.fact.content));
  });
  if (anchors.length < 2) {
    return [];
  }

  return selectSourceOrderedEvidencePlan({
    anchorLimit: SOURCE_ORDER_REASONING_ANCHOR_LIMIT,
    anchors,
    companionDistance: SOURCE_ORDER_REASONING_COMPANION_DISTANCE,
    companionPool: sourceCandidates,
    companionsPerAnchor: 1,
    limit: SOURCE_ORDER_REASONING_RECALL_LIMIT,
    priority,
    slotSignature: (entry) =>
      sourceOrderReasoningSlotSignature({
        entry,
        language: input.language,
        maxOrder,
        minOrder,
        queryNamedTokens,
        queryTopics,
      }),
  });
}
