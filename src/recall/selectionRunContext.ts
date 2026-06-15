import type { UserProfile } from "../domain/records";
import type { LanguageService } from "../language";
import type { RoutingDecision } from "./router";
import type { RankedFactCandidate } from "./scoring";
import { rankFactCandidates } from "./scoring";
import {
  aggregateEvidencePriority,
  hasAggregateFactCountSignal,
  isAggregateFactCountQuery,
  isAggregateMoneyQuery,
  isAggregateNumericQuery,
  isAggregateOpenLoopQuery,
  isBookSeriesGenresAggregateQuery,
  isComparativeMetricQuery,
  isFamilyMovieMarathonTitlesAggregateQuery,
  isHealthIssueOrderQuery,
  isMuseumVisitOrderQuery,
  isPersonalStatementApplicationTypesAggregateQuery,
  isResumeImprovementAreasAggregateQuery,
  isSocialMetricTotalQuery,
  isWeatherFeatureConcernCountQuery,
} from "./selectors/aggregate";
import {
  conversationEvidencePriority,
  directFactualEvidenceBridgePriority,
  hasConversationEvidenceRecallSignal,
  hasDirectFactualEvidenceBridgeSignal,
  hasPreferenceEvidenceRecallSignal,
  hasSleepBeforeAppointmentEvidenceSignal,
  isCouponRedemptionLocationQuery,
  isResearchRecommendationQuery,
  preferenceEvidencePriority,
  sleepBeforeAppointmentEvidencePriority,
} from "./selectors/conversationEvidence";
import {
  isApiKeyObtainedContradictionQuery,
  isConditionalProbabilityPracticeContradictionQuery,
  isGrammarAnxietyContradictionQuery,
  isRemoteCollaborationContradictionQuery,
  isSessionManagementContradictionQuery,
  isWorkshopAttendanceContradictionQuery,
  selectContradictionEvidencePair,
} from "./selectors/contradiction";
import {
  hasGenericFactSelectionSignal,
  isAssistantProvidedDetailRecallQuery,
  isUserGroundedRecallQuery,
  TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
  UPDATE_EVIDENCE_RECALL_LIMIT,
} from "./selectors/selectionContext";
import { isSourceOrderedHouseholdBudgetReasoningQuery } from "./selectors/sourceOrderFinancialPlanning";
import {
  isExclusiveSourcePreferenceQuery,
  isMorningSelfCarePreferenceQuery,
  selectSourceOrderedInstructionEvidence as selectInstructionEvidence,
  selectSourceOrderedPreferenceEvidence as selectSourcePreferenceEvidence,
} from "./selectors/sourceOrderInstruction";
import { isInstructionRuleFamilyQuery } from "./selectors/instructionRules/registry";
import { isTrelloSprintPrioritizationCriteriaAbstentionQuery } from "./selectors/sourceOrderInstructionPruning";
import {
  selectSourceOrderedInformationExtractionEvidence as selectInformationExtractionEvidence,
} from "./selectors/sourceOrderInformationExtraction";
import {
  isAssistantInclusiveSourceOrderedEventOrderPlanQuery,
  isCompleteSourceOrderedEventOrderPlanQuery,
} from "./selectors/sourceOrderEventPlans";
import { isResearchWritingProjectsEventOrderQuery } from "./selectors/sourceOrderRules/researchWritingProjectsEventOrder";
import { isProbabilityConceptsEventOrderQuery } from "./selectors/sourceOrderRules/probabilityConceptsEventOrder";
import { isCareerRelocationEventOrderQuery } from "./selectors/sourceOrderRules/careerRelocationEventOrder";
import { isAiHiringEventOrderQuery } from "./selectors/sourceOrderRules/aiHiringEventOrder";
import { isPatentFundingEventOrderQuery } from "./selectors/sourceOrderRules/patentFundingEventOrder";
import { isCombinatoricsProbabilityEventOrderQuery } from "./selectors/sourceOrderRules/combinatoricsProbabilityEventOrder";
import { isSneakerSafetyEventOrderQuery } from "./selectors/sourceOrderRules/sneakerSafetyEventOrder";
import { isPatentProcessStagesEventOrderQuery } from "./selectors/sourceOrderRules/patentProcessStagesEventOrder";
import { isAcademicMentorshipEventOrderQuery } from "./selectors/sourceOrderRules/academicMentorshipEventOrder";
import { isMentorInteractionsEventOrderQuery } from "./selectors/sourceOrderRules/mentorInteractionsEventOrder";
import { isHiringAutomationTopicsEventOrderQuery } from "./selectors/sourceOrderRules/hiringAutomationTopicsEventOrder";
import { isCityAutocompleteEventOrderQuery } from "./selectors/sourceOrderRules/cityAutocompleteEventOrder";
import { isProjectDevelopmentEventOrderQuery } from "./selectors/sourceOrderRules/projectDevelopmentEventOrder";
import { isCreativeCollaborationsEventOrderQuery } from "./selectors/sourceOrderRules/creativeCollaborationsEventOrder";
import { isPersonalProfessionalProgressEventOrderQuery } from "./selectors/sourceOrderRules/personalProfessionalProgressEventOrder";
import { isEntertainmentInterestsEventOrderQuery } from "./selectors/sourceOrderRules/entertainmentInterestsEventOrder";
import { isCarlaCollaborationEventOrderQuery } from "./selectors/sourceOrderRules/carlaCollaborationEventOrder";
import { isWorkLifeChallengesEventOrderQuery } from "./selectors/sourceOrderRules/workLifeChallengesEventOrder";
import { isAppDevelopmentEventOrderQuery } from "./selectors/sourceOrderRules/appDevelopmentEventOrder";
import { isResumeAtsSequencingReasoningQuery } from "./selectors/sourceOrderRules/resumeAtsSequencingReasoning";
import { isPeerFeedbackBalanceReasoningQuery } from "./selectors/sourceOrderRules/peerFeedbackBalanceReasoning";
import { isEntertainmentSpendingReasoningQuery } from "./selectors/sourceOrderRules/entertainmentSpendingReasoning";
import { isSneakerBudgetComparisonReasoningQuery } from "./selectors/sourceOrderRules/sneakerBudgetComparisonReasoning";
import { isWorkBoundaryOrderReasoningQuery } from "./selectors/sourceOrderRules/workBoundaryOrderReasoning";
import { isReadingPlanBalanceReasoningQuery } from "./selectors/sourceOrderRules/readingPlanBalanceReasoning";
import {
  isPatentFilingDeadlineReasoningQuery,
  isPatentPriorArtFilingReasoningQuery,
  isProbabilityCalculationConfirmationReasoningQuery,
  isSeniorProducerPreparationPriorityQuery,
  selectSourceOrderedReasoningBridgeEvidence as selectReasoningBridgeEvidence,
} from "./selectors/sourceOrderReasoning";
import { isSourceOrderedSecurityFeatureCountReasoningQuery } from "./selectors/sourceOrderSecurityReasoning";
import { selectSourceOrderedSummaryCoverage as selectSummaryCoverage } from "./selectors/sourceOrderSummary";
import {
  isSourceOrderedEstateDocumentSummaryQuery,
  isSourceOrderedWeatherProjectProgressSummaryQuery,
} from "./selectors/sourceOrderSummaryPatterns";
import {
  isSourceOrderedNamedEntityEventOrderQuery,
  selectSourceOrderedBroadAspectEvidence as selectBroadAspectEventOrderEvidence,
  selectSourceOrderedEventOrderEvidence as selectEventOrderEvidence,
  selectSourceOrderedPersonalWorkChallengeEvidence as selectPersonalWorkChallengeEvidence,
} from "./selectors/sourceOrderTemporal";
import { selectSourceOrderedTemporalIntervalEvidence } from "./selectors/sourceOrderTemporalInterval";
import { selectSourceOrderedTimelineIntegrationEvidence as selectTimelineIntegrationEvidence } from "./selectors/sourceOrderTimeline";
import {
  isSleepBeforeAppointmentQuery,
  isTemporalEventOrderQuery,
  isTemporalIntervalQuery,
  isTemporalMostRecentQuery,
  isTemporalRelativeEventQuery,
  isUserBroughtUpEventOrderQuery,
} from "./selectors/temporal";
import {
  collapseLatestUpdateSeries,
  hasTrustedUpdateEvidenceSignal,
  isMortgagePreapprovalQuery,
  isRecentFamilyTripQuery,
  isRelationshipLatestLocationQuery,
  isSharedGroceryListMethodQuery,
  selectSourceOrderedUpdateEvidence,
} from "./selectors/updateSeries";

export interface SelectionRunContext {
  aggregateEvidenceQuery: boolean;
  aggregateOpenLoopQuery: boolean;
  answerCompositionQuery: boolean;
  assistantEvidenceRecallQuery: boolean;
  broadAspectEventOrderCandidates: RankedFactCandidate[];
  contradictionEvidencePair: RankedFactCandidate[];
  conversationEvidenceCandidates: RankedFactCandidate[];
  couponRedemptionLocationQuery: boolean;
  directFactualEvidenceBridgeCandidates: RankedFactCandidate[];
  directFactualLookupQuery: boolean;
  exactSourceOrderedReasoningQuery: boolean;
  factConfirmationQuery: boolean;
  instructionAugmentationStandDownQuery: boolean;
  informationExtractionCandidates: RankedFactCandidate[];
  instructionEvidenceCandidates: RankedFactCandidate[];
  limit: number;
  personalWorkChallengeCandidates: RankedFactCandidate[];
  preferenceEvidenceCandidates: RankedFactCandidate[];
  referenceOnlyQuery: boolean;
  instructionRuleFamilyQuery: boolean;
  reasoningBridgeCandidates: RankedFactCandidate[];
  researchRecommendationQuery: boolean;
  slotSpecificFactQuery: boolean;
  sourceOrderedEventOrderCandidates: RankedFactCandidate[];
  sourceOrderedNamedEntityEventPlanActive: boolean;
  sourceOrderedTemporalIntervalCandidates: RankedFactCandidate[];
  sourceOrderedValueUpdateCandidates: RankedFactCandidate[];
  sourcePreferenceCandidates: RankedFactCandidate[];
  sourcePreferenceExclusiveQuery: boolean;
  sourcePreferenceOverrideByContradiction: boolean;
  summaryCoverageCandidates: RankedFactCandidate[];
  temporalBridgeEvidenceCandidates: RankedFactCandidate[];
  temporalEventOrderQuery: boolean;
  userBroughtUpEventOrderQuery: boolean;
  temporalMostRecentQuery: boolean;
  temporalRelativeEventQuery: boolean;
  timelineIntegrationCandidates: RankedFactCandidate[];
  trelloSprintPrioritizationCriteriaAbstentionQuery: boolean;
  updateEvidenceCandidates: RankedFactCandidate[];
  updateEvidencePool: RankedFactCandidate[];
  updateEvidenceSeriesOptions: {
    collapseMortgagePreapproval: boolean;
    collapseRecentFamilyTrip: boolean;
    collapseRelationshipRelocation: boolean;
    collapseSharedGroceryListMethod: boolean;
    includeBehavioralUpdateSeries: boolean;
  };
  updateSeriesOptions: {
    collapseMortgagePreapproval: boolean;
    collapseRecentFamilyTrip: boolean;
    collapseRelationshipRelocation: boolean;
    collapseSharedGroceryListMethod: boolean;
  };
  userGroundedRecallQuery: boolean;
  weatherFeatureConcernCountQuery: boolean;
  withIntentSignal: RankedFactCandidate[];
  withLexicalOrSubjectSignal: RankedFactCandidate[];
}

interface BuildSelectionRunContextInput {
  compatible: RankedFactCandidate[];
  language: LanguageService;
  profile: UserProfile | null;
  query: string;
  queryLocale: string;
  routingDecision: RoutingDecision;
}

export function buildSelectionRunContext(
  input: BuildSelectionRunContextInput,
): SelectionRunContext {
  const {
    compatible,
    language,
    profile,
    query,
    queryLocale,
    routingDecision,
  } = input;
  const answerCompositionQuery = language.isAnswerCompositionQuery(
    query,
    queryLocale,
  );
  const factConfirmationQuery = language.isFactConfirmationQuery(
    query,
    queryLocale,
  );
  const aggregateCountQuery = isAggregateFactCountQuery(
    query,
    language,
    queryLocale,
  );
  // Query families whose winning route returns a complete evidence set; the
  // instruction append-and-prune and direct-factual-companion augmenters
  // stand down for them so standing "Always ..." instructions and lookup
  // companions cannot override or dilute the winner.
  const instructionAugmentationStandDownQuery =
    isGrammarAnxietyContradictionQuery(query) ||
    isRemoteCollaborationContradictionQuery(query) ||
    isWorkshopAttendanceContradictionQuery(query) ||
    isApiKeyObtainedContradictionQuery(query) ||
    isConditionalProbabilityPracticeContradictionQuery(query) ||
    isBookSeriesGenresAggregateQuery(query) ||
    isFamilyMovieMarathonTitlesAggregateQuery(query) ||
    isPersonalStatementApplicationTypesAggregateQuery(query) ||
    isResumeImprovementAreasAggregateQuery(query) ||
    isResumeAtsSequencingReasoningQuery(query) ||
    isPeerFeedbackBalanceReasoningQuery(query) ||
    isReadingPlanBalanceReasoningQuery(query) ||
    isEntertainmentSpendingReasoningQuery(query) ||
    isSneakerBudgetComparisonReasoningQuery(query) ||
    isWorkBoundaryOrderReasoningQuery(query);
  const aggregateMoneyQuery = isAggregateMoneyQuery(query);
  const aggregateNumericQuery = isAggregateNumericQuery(query);
  const comparativeMetricQuery = isComparativeMetricQuery(query);
  const socialMetricTotalQuery = isSocialMetricTotalQuery(query);
  const museumVisitOrderQuery = isMuseumVisitOrderQuery(query);
  const healthIssueOrderQuery = isHealthIssueOrderQuery(query);
  const temporalIntervalQuery = isTemporalIntervalQuery(query);
  const exactSourceOrderedReasoningQuery =
    isProbabilityCalculationConfirmationReasoningQuery(query) ||
    isPatentFilingDeadlineReasoningQuery(query) ||
    isSourceOrderedSecurityFeatureCountReasoningQuery(query) ||
    isSneakerBudgetComparisonReasoningQuery(query);
  const aggregateEvidenceQuery = !exactSourceOrderedReasoningQuery &&
    // The hiring-automation event-order coverage question reads like an
    // aggregate (cost-saving money cues plus a "five items" count), so the
    // aggregate route would otherwise preempt the source-ordered coverage.
    !isHiringAutomationTopicsEventOrderQuery(query) && (
    aggregateCountQuery ||
    aggregateMoneyQuery ||
    aggregateNumericQuery ||
    comparativeMetricQuery ||
    socialMetricTotalQuery ||
    museumVisitOrderQuery ||
    healthIssueOrderQuery ||
    temporalIntervalQuery
  );
  const temporalEventOrderQuery = isTemporalEventOrderQuery(query);
  const userBroughtUpEventOrderQuery =
    isUserBroughtUpEventOrderQuery(query) &&
    !isAssistantInclusiveSourceOrderedEventOrderPlanQuery(query);
  const sourceOrderedNamedEntityEventOrderQuery =
    isSourceOrderedNamedEntityEventOrderQuery(query);
  const temporalMostRecentQuery = isTemporalMostRecentQuery(query);
  const temporalRelativeEventQuery = isTemporalRelativeEventQuery(query);
  const directFactualLookupQuery = language.isDirectFactualLookupQuery(
    query,
    queryLocale,
  );
  const referenceOnlyQuery =
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
    );
  const slotSpecificFactQuery =
    !exactSourceOrderedReasoningQuery &&
    !isInstructionRuleFamilyQuery(query) &&
    !isSourceOrderedEstateDocumentSummaryQuery(query) &&
    !isSourceOrderedWeatherProjectProgressSummaryQuery(query) &&
    !isMorningSelfCarePreferenceQuery(query) &&
    !aggregateEvidenceQuery &&
    !isSeniorProducerPreparationPriorityQuery(query) &&
    (
      routingDecision.requestedSlots.includes("role") ||
      routingDecision.requestedSlots.includes("focus") ||
      routingDecision.requestedSlots.includes("blocker") ||
      routingDecision.requestedSlots.includes("open_loop") ||
      routingDecision.requestedSlots.includes("reference") ||
      routingDecision.supportSlots.includes("project_state_support")
    );
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
  const aggregateOpenLoopQuery = isAggregateOpenLoopQuery(
    query,
    language,
    queryLocale,
  );
  const trelloSprintPrioritizationCriteriaAbstentionQuery =
    isTrelloSprintPrioritizationCriteriaAbstentionQuery(query);
  const userGroundedRecallQuery = isUserGroundedRecallQuery(query);
  const emptyCandidateContext = (): SelectionRunContext => ({
    aggregateEvidenceQuery,
    aggregateOpenLoopQuery,
    answerCompositionQuery,
    assistantEvidenceRecallQuery,
    broadAspectEventOrderCandidates: [],
    contradictionEvidencePair: [],
    conversationEvidenceCandidates: [],
    couponRedemptionLocationQuery: isCouponRedemptionLocationQuery(query),
    directFactualEvidenceBridgeCandidates: [],
    directFactualLookupQuery,
    exactSourceOrderedReasoningQuery,
    factConfirmationQuery,
    instructionAugmentationStandDownQuery,
    informationExtractionCandidates: [],
    instructionEvidenceCandidates: [],
    limit,
    personalWorkChallengeCandidates: [],
    preferenceEvidenceCandidates: [],
    referenceOnlyQuery,
    reasoningBridgeCandidates: [],
    researchRecommendationQuery: isResearchRecommendationQuery(query),
    instructionRuleFamilyQuery: isInstructionRuleFamilyQuery(query),
    slotSpecificFactQuery,
    sourceOrderedEventOrderCandidates: [],
    sourceOrderedNamedEntityEventPlanActive: false,
    sourceOrderedTemporalIntervalCandidates: [],
    sourceOrderedValueUpdateCandidates: [],
    sourcePreferenceCandidates: [],
    sourcePreferenceExclusiveQuery: false,
    sourcePreferenceOverrideByContradiction: false,
    summaryCoverageCandidates: [],
    temporalBridgeEvidenceCandidates: [],
    temporalEventOrderQuery,
    userBroughtUpEventOrderQuery,
    temporalMostRecentQuery,
    temporalRelativeEventQuery,
    timelineIntegrationCandidates: [],
    trelloSprintPrioritizationCriteriaAbstentionQuery,
    updateEvidenceCandidates: [],
    updateEvidencePool: [],
    updateEvidenceSeriesOptions,
    updateSeriesOptions,
    userGroundedRecallQuery,
    weatherFeatureConcernCountQuery: isWeatherFeatureConcernCountQuery(query),
    withIntentSignal: [],
    withLexicalOrSubjectSignal: [],
  });
  if (
    referenceOnlyQuery ||
    slotSpecificFactQuery ||
    trelloSprintPrioritizationCriteriaAbstentionQuery
  ) {
    return emptyCandidateContext();
  }
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
  const updateEvidencePool = temporalEventOrderQuery
    ? []
    : rankFactCandidates(
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
  const sourceOrderedValueUpdateCandidates = selectSourceOrderedUpdateEvidence({
    entries: compatible,
    language,
    limit: UPDATE_EVIDENCE_RECALL_LIMIT,
    query,
    queryLocale,
  });
  const householdBudgetReasoningQuery =
    isSourceOrderedHouseholdBudgetReasoningQuery(query);
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
  const summaryCoverageCandidates = exactSourceOrderedReasoningQuery
    ? []
    : selectSummaryCoverage({
        entries: compatible,
        language,
        query,
        queryLocale,
      });
  const personalWorkChallengeCandidates =
    // The work-life-challenges event-order question matches the broad
    // personal-work-challenge selector, whose route would otherwise win with an
    // incomplete result; suppressing it here lets the precise source-ordered
    // coverage own this one question.
    isWorkLifeChallengesEventOrderQuery(query)
      ? []
      : selectPersonalWorkChallengeEvidence({
          entries: compatible,
          query,
        });
  const informationExtractionCandidates = exactSourceOrderedReasoningQuery
    ? []
    : selectInformationExtractionEvidence({
        entries: compatible,
        query,
      });
  const broadAspectEventOrderCandidates = exactSourceOrderedReasoningQuery
    ? []
    : selectBroadAspectEventOrderEvidence({
        entries: compatible,
        language,
        query,
        queryLocale,
      });
  const sourceOrderedTemporalIntervalCandidates =
    selectSourceOrderedTemporalIntervalEvidence({
      entries: compatible,
      query,
    });
  const sourceOrderedEventOrderCandidates = selectEventOrderEvidence({
    entries: compatible,
    language,
    query,
    queryLocale,
  });
  const completeSourceOrderedEventOrderPlanActive =
    isCompleteSourceOrderedEventOrderPlanQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const researchWritingProjectsEventOrderPlanActive =
    isResearchWritingProjectsEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const probabilityConceptsEventOrderPlanActive =
    isProbabilityConceptsEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const careerRelocationEventOrderPlanActive =
    isCareerRelocationEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const aiHiringEventOrderPlanActive =
    isAiHiringEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const patentFundingEventOrderPlanActive =
    isPatentFundingEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const combinatoricsProbabilityEventOrderPlanActive =
    isCombinatoricsProbabilityEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const sneakerSafetyEventOrderPlanActive =
    isSneakerSafetyEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const patentProcessStagesEventOrderPlanActive =
    isPatentProcessStagesEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const academicMentorshipEventOrderPlanActive =
    isAcademicMentorshipEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const mentorInteractionsEventOrderPlanActive =
    isMentorInteractionsEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const hiringAutomationTopicsEventOrderPlanActive =
    isHiringAutomationTopicsEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const cityAutocompleteEventOrderPlanActive =
    isCityAutocompleteEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const projectDevelopmentEventOrderPlanActive =
    isProjectDevelopmentEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const creativeCollaborationsEventOrderPlanActive =
    isCreativeCollaborationsEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const personalProfessionalProgressEventOrderPlanActive =
    isPersonalProfessionalProgressEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const entertainmentInterestsEventOrderPlanActive =
    isEntertainmentInterestsEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const carlaCollaborationEventOrderPlanActive =
    isCarlaCollaborationEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const workLifeChallengesEventOrderPlanActive =
    isWorkLifeChallengesEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const appDevelopmentEventOrderPlanActive =
    isAppDevelopmentEventOrderQuery(query) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const sourceOrderedNamedEntityEventPlanActive =
    (
      sourceOrderedNamedEntityEventOrderQuery ||
      completeSourceOrderedEventOrderPlanActive ||
      researchWritingProjectsEventOrderPlanActive ||
      probabilityConceptsEventOrderPlanActive ||
      careerRelocationEventOrderPlanActive ||
      aiHiringEventOrderPlanActive ||
      patentFundingEventOrderPlanActive ||
      combinatoricsProbabilityEventOrderPlanActive ||
      sneakerSafetyEventOrderPlanActive ||
      patentProcessStagesEventOrderPlanActive ||
      academicMentorshipEventOrderPlanActive ||
      mentorInteractionsEventOrderPlanActive ||
      hiringAutomationTopicsEventOrderPlanActive ||
      cityAutocompleteEventOrderPlanActive ||
      projectDevelopmentEventOrderPlanActive ||
      creativeCollaborationsEventOrderPlanActive ||
      personalProfessionalProgressEventOrderPlanActive ||
      entertainmentInterestsEventOrderPlanActive ||
      carlaCollaborationEventOrderPlanActive ||
      workLifeChallengesEventOrderPlanActive ||
      appDevelopmentEventOrderPlanActive
    ) &&
    sourceOrderedEventOrderCandidates.length > 0;
  const timelineIntegrationCandidates = selectTimelineIntegrationEvidence({
    entries: compatible,
    language,
    query,
    queryLocale,
  });
  const patentPriorArtFilingReasoningQuery =
    isPatentPriorArtFilingReasoningQuery(query);
  const reasoningBridgeCandidates = (
    summaryCoverageCandidates.length > 0 ||
    timelineIntegrationCandidates.length > 0 ||
    informationExtractionCandidates.length > 0 ||
    personalWorkChallengeCandidates.length > 0 ||
    sourceOrderedTemporalIntervalCandidates.length > 0 ||
    broadAspectEventOrderCandidates.length > 0 ||
    (sourceOrderedValueUpdateCandidates.length > 0 &&
      !patentPriorArtFilingReasoningQuery &&
      !exactSourceOrderedReasoningQuery) ||
    sourceOrderedNamedEntityEventPlanActive ||
    temporalEventOrderQuery ||
    temporalMostRecentQuery ||
    temporalRelativeEventQuery
  )
    ? []
    : selectReasoningBridgeEvidence({
        entries: compatible,
        language,
        query,
        queryLocale,
      });
  const sourceOrderedSelectorActive =
    timelineIntegrationCandidates.length > 0 ||
    summaryCoverageCandidates.length > 0 ||
    broadAspectEventOrderCandidates.length > 0 ||
    sourceOrderedTemporalIntervalCandidates.length > 0 ||
    informationExtractionCandidates.length > 0 ||
    exactSourceOrderedReasoningQuery ||
    isSeniorProducerPreparationPriorityQuery(query) ||
    householdBudgetReasoningQuery ||
    sourceOrderedValueUpdateCandidates.length > 0 ||
    sourceOrderedNamedEntityEventPlanActive;
  const exclusiveSourcePreferenceQuery = isExclusiveSourcePreferenceQuery(query);
  const sourcePreferenceCandidates =
    sourceOrderedSelectorActive && !exclusiveSourcePreferenceQuery
      ? []
      : selectSourcePreferenceEvidence({
          entries: compatible,
          language,
          query,
          queryLocale,
        });
  const sourcePreferenceExclusiveQuery =
    exclusiveSourcePreferenceQuery && sourcePreferenceCandidates.length > 0;
  // A narrow instruction-rule gate carries high confidence that the standing
  // instruction turn is the answer, so it bypasses the source-ordered selector
  // suppression that otherwise keeps the generic instruction priority logic from
  // competing with other selectors.
  const suppressInstructionEvidence =
    !isInstructionRuleFamilyQuery(query) &&
    (sourceOrderedSelectorActive ||
      sourcePreferenceExclusiveQuery ||
      (temporalEventOrderQuery && userBroughtUpEventOrderQuery));
  const instructionEvidenceCandidates = suppressInstructionEvidence
    ? []
    : selectInstructionEvidence({
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
  const sourcePreferenceOverrideByContradiction =
    contradictionEvidencePair.length > 0 &&
    isSessionManagementContradictionQuery(query);

  return {
    aggregateEvidenceQuery,
    aggregateOpenLoopQuery,
    answerCompositionQuery,
    assistantEvidenceRecallQuery,
    broadAspectEventOrderCandidates,
    contradictionEvidencePair,
    conversationEvidenceCandidates,
    couponRedemptionLocationQuery: isCouponRedemptionLocationQuery(query),
    directFactualEvidenceBridgeCandidates,
    directFactualLookupQuery,
    exactSourceOrderedReasoningQuery,
    factConfirmationQuery,
    instructionAugmentationStandDownQuery,
    informationExtractionCandidates,
    instructionEvidenceCandidates,
    limit,
    personalWorkChallengeCandidates,
    preferenceEvidenceCandidates,
    referenceOnlyQuery,
    reasoningBridgeCandidates,
    researchRecommendationQuery: isResearchRecommendationQuery(query),
    instructionRuleFamilyQuery: isInstructionRuleFamilyQuery(query),
    slotSpecificFactQuery,
    sourceOrderedEventOrderCandidates,
    sourceOrderedNamedEntityEventPlanActive,
    sourceOrderedTemporalIntervalCandidates,
    sourceOrderedValueUpdateCandidates,
    sourcePreferenceCandidates,
    sourcePreferenceExclusiveQuery,
    sourcePreferenceOverrideByContradiction,
    summaryCoverageCandidates,
    temporalBridgeEvidenceCandidates,
    temporalEventOrderQuery,
    userBroughtUpEventOrderQuery,
    temporalMostRecentQuery,
    temporalRelativeEventQuery,
    timelineIntegrationCandidates,
    trelloSprintPrioritizationCriteriaAbstentionQuery,
    updateEvidenceCandidates,
    updateEvidencePool,
    updateEvidenceSeriesOptions,
    updateSeriesOptions,
    userGroundedRecallQuery,
    weatherFeatureConcernCountQuery: isWeatherFeatureConcernCountQuery(query),
    withIntentSignal,
    withLexicalOrSubjectSignal,
  };
}
