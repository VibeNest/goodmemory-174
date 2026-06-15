import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolvePhase63RepoRoot } from "./run-phase-63-shared";
import { readPhase63BeamRows } from "./run-phase-63-beam-recall-diagnostic";
// Side-effect import so every wrapped narrow gate registers.
import "../src/recall/selection";
import * as preferenceRules from "../src/recall/selectors/sourceOrderRules/preferenceRules";
import * as aggregateNarrowGates from "../src/recall/selectors/aggregateNarrowGates";
import * as updateSeriesQueries from "../src/recall/selectors/updateSeriesQueries";
import * as reasoningRules from "../src/recall/selectors/sourceOrderRules/reasoningRules";
import { isResumeAtsSequencingReasoningQuery } from "../src/recall/selectors/sourceOrderRules/resumeAtsSequencingReasoning";
import { isPeerFeedbackBalanceReasoningQuery } from "../src/recall/selectors/sourceOrderRules/peerFeedbackBalanceReasoning";
import { isReadingPlanBalanceReasoningQuery } from "../src/recall/selectors/sourceOrderRules/readingPlanBalanceReasoning";
import { isEntertainmentSpendingReasoningQuery } from "../src/recall/selectors/sourceOrderRules/entertainmentSpendingReasoning";
import { isSneakerBudgetComparisonReasoningQuery } from "../src/recall/selectors/sourceOrderRules/sneakerBudgetComparisonReasoning";
import { isWorkBoundaryOrderReasoningQuery } from "../src/recall/selectors/sourceOrderRules/workBoundaryOrderReasoning";
import { isWritingGroupDeadlineUpdateQuery } from "../src/recall/selectors/updateSeriesRules/writingGroupDeadline";
import { isFinalDecisionMeetingUpdateQuery } from "../src/recall/selectors/updateSeriesRules/finalDecisionMeeting";
import { isExecutiveProducerInterviewsUpdateQuery } from "../src/recall/selectors/updateSeriesRules/executiveProducerInterviews";
import { isAiEthicsWebinarUpdateQuery } from "../src/recall/selectors/updateSeriesRules/aiEthicsWebinar";
import { isWinterReadingChallengeUpdateQuery } from "../src/recall/selectors/updateSeriesRules/winterReadingChallenge";
import { isEventCupcakeOrderUpdateQuery } from "../src/recall/selectors/updateSeriesRules/eventCupcakeOrder";
import { isRemoteWorkScheduleUpdateQuery } from "../src/recall/selectors/updateSeriesRules/remoteWorkSchedule";
import { isImmigrationConsultantSessionUpdateQuery } from "../src/recall/selectors/updateSeriesRules/immigrationConsultantSession";
import { isOnboardingModulesCompletionUpdateQuery } from "../src/recall/selectors/updateSeriesRules/onboardingModulesCompletion";
import { isHolidayGiftBudgetUpdateQuery } from "../src/recall/selectors/updateSeriesRules/holidayGiftBudget";
import { isZoteroSourcesUpdateQuery } from "../src/recall/selectors/updateSeriesRules/zoteroSources";
import { isProbabilityStudyHoursUpdateQuery } from "../src/recall/selectors/updateSeriesRules/probabilityStudyHours";
import { isSnackBudgetUpdateQuery } from "../src/recall/selectors/updateSeriesRules/snackBudget";
import { isPrototypeBudgetUpdateQuery } from "../src/recall/selectors/updateSeriesRules/prototypeBudget";
import { isAreaCalculationAccuracyUpdateQuery } from "../src/recall/selectors/updateSeriesRules/areaCalculationAccuracy";
import { isEstateTaxRateUpdateQuery } from "../src/recall/selectors/updateSeriesRules/estateTaxRate";
import { isProbateTimelineUpdateQuery } from "../src/recall/selectors/updateSeriesRules/probateTimeline";
import {
  isAiHiringWebinarDaysIntervalQuery,
  isCastingPilotEpisodeDaysIntervalQuery,
  isCoverLetterZoomCallDaysIntervalQuery,
  isDailyWalkingGoalFestivalMonthsIntervalQuery,
  isEmergencyFundDaysIntervalQuery,
  isFilmOfficeMoviesDaysIntervalQuery,
  isFirstDraftEssayGradeDaysIntervalQuery,
  isMeetingTestingPeriodDaysIntervalQuery,
  isPermutationsQuizScoreDaysIntervalQuery,
  isPriorArtProvisionalPatentDaysIntervalQuery,
  isEditingChallengeDaysIntervalQuery,
  isMovieListGameNightDaysIntervalQuery,
  isOutlanderReadingDaysIntervalQuery,
  isResumeTailoringApplyDaysIntervalQuery,
  isReunionPromotionDaysIntervalQuery,
  isScreenplayDraftDaysIntervalQuery,
  isSprintDeadlineDaysIntervalQuery,
  isWritingSessionAbstractDaysIntervalQuery,
  isTransactionDeploymentWeeksIntervalQuery,
  isTriangleProblemCountIntervalQuery,
} from "../src/recall/selectors/sourceOrderTemporalInterval";
import { isProbabilityConceptsEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/probabilityConceptsEventOrder";
import { isCareerRelocationEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/careerRelocationEventOrder";
import { isAiHiringEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/aiHiringEventOrder";
import { isPatentFundingEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/patentFundingEventOrder";
import { isCombinatoricsProbabilityEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/combinatoricsProbabilityEventOrder";
import { isSneakerSafetyEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/sneakerSafetyEventOrder";
import { isPatentProcessStagesEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/patentProcessStagesEventOrder";
import { isAcademicMentorshipEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/academicMentorshipEventOrder";
import { isMentorInteractionsEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/mentorInteractionsEventOrder";
import { isHiringAutomationTopicsEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/hiringAutomationTopicsEventOrder";
import { isCityAutocompleteEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/cityAutocompleteEventOrder";
import { isProjectDevelopmentEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/projectDevelopmentEventOrder";
import { isCreativeCollaborationsEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/creativeCollaborationsEventOrder";
import { isPersonalProfessionalProgressEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/personalProfessionalProgressEventOrder";
import { isEntertainmentInterestsEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/entertainmentInterestsEventOrder";
import { isCarlaCollaborationEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/carlaCollaborationEventOrder";
import { isWorkLifeChallengesEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/workLifeChallengesEventOrder";
import { isAppDevelopmentEventOrderQuery } from "../src/recall/selectors/sourceOrderRules/appDevelopmentEventOrder";
import { isTrelloSprintPrioritizationCriteriaAbstentionQuery } from "../src/recall/selectors/sourceOrderInstructionPruning";
import {
  isResumeDesignInstructionQuery,
  isTimelineDateFormatInstructionQuery,
} from "../src/recall/selectors/sourceOrderInstruction";
import { isLegalTermsExplanationInstructionQuery } from "../src/recall/selectors/instructionRules/legalTermsExplanation";
import { isPatentTimelinesInstructionQuery } from "../src/recall/selectors/instructionRules/patentTimelines";
import { isNonProvisionalFilingInstructionQuery } from "../src/recall/selectors/instructionRules/nonProvisionalFilingDate";
import {
  isAnniversaryCelebrationContradictionQuery,
  isAtsCourseEnrollmentContradictionQuery,
  isBootstrapComponentsContradictionQuery,
  isFamilyMovieInviteContradictionQuery,
  isMovieWatchlistContradictionQuery,
  isPatentWebinarContradictionQuery,
  isSessionManagementContradictionQuery,
  isTwoFactorAuthImplementationContradictionQuery,
  isWillAttorneyMeetingContradictionQuery,
  isWritingSessionsContradictionQuery,
} from "../src/recall/selectors/contradiction";
import { isCouponRedemptionLocationQuery } from "../src/recall/selectors/conversationEvidence";
import { isSourceOrderedHouseholdBudgetReasoningQuery } from "../src/recall/selectors/sourceOrderFinancialPlanning";

/**
 * Post-analysis for the narrow-gate audit: the diagnostic runs every
 * conversation's ~20 questions sequentially against one memory instance, so
 * retrieval reinforcement couples later cases to earlier retrieval changes.
 * A gate's raw case-delta set therefore mixes DIRECT effects (the affected
 * case's own question matches the gate) with same-conversation RIPPLES. This
 * script separates the two by testing each affected question's text against
 * the disabled gate and rewrites the report with per-gate direct/ripple
 * verdicts. Sunset candidates are gates with zero direct hits AND zero or
 * ripple-only deltas.
 */

const GATE_FUNCTIONS: Record<string, (query: string) => boolean> = {
  "preference.asaCongruenceProof": preferenceRules.isAsaCongruenceProofPreferenceQuery,
  "preference.automatedDeploymentMonitoring":
    preferenceRules.isAutomatedDeploymentMonitoringPreferenceQuery,
  "preference.lightweightLazyLoading":
    preferenceRules.isLightweightLazyLoadingPreferenceQuery,
  "preference.pragmaticSecurity": preferenceRules.isPragmaticSecurityPreferenceQuery,
  "preference.ukAtsResume": preferenceRules.isUkAtsResumePreferenceQuery,
  "preference.probabilityRatioWalkthrough":
    preferenceRules.isProbabilityRatioWalkthroughPreferenceQuery,
  "preference.triangleAreaMedianComparison":
    preferenceRules.isTriangleAreaMedianComparisonPreferenceQuery,
  "preference.coverLetterMeasurableImpact":
    preferenceRules.isCoverLetterMeasurableImpactPreferenceQuery,
  "preference.coverLetterPortfolioLink":
    preferenceRules.isCoverLetterPortfolioLinkPreferenceQuery,
  "preference.aiAssistedEditingWorkflow":
    preferenceRules.isAiAssistedEditingWorkflowPreferenceQuery,
  "preference.bookFormatPortability":
    preferenceRules.isBookFormatPortabilityPreferenceQuery,
  "preference.balancedStandaloneSeries":
    preferenceRules.isBalancedStandaloneSeriesPreferenceQuery,
  "preference.sleekNeutralSneaker":
    preferenceRules.isSleekNeutralSneakerPreferenceQuery,
  "preference.morningSelfCare": preferenceRules.isMorningSelfCarePreferenceQuery,
  "preference.excelDiningBudget": preferenceRules.isExcelDiningBudgetPreferenceQuery,
  "preference.digitalWillUpdate": preferenceRules.isDigitalWillUpdatePreferenceQuery,
  "preference.executorCandidate": preferenceRules.isExecutorCandidatePreferenceQuery,
  "preference.taskAppointmentDigitalTools":
    preferenceRules.isTaskAppointmentDigitalToolsPreferenceQuery,
  "preference.structuredDailyRoutine":
    preferenceRules.isStructuredDailyRoutinePreferenceQuery,
  "preference.positiveFamilyMovieReview":
    preferenceRules.isPositiveFamilyMovieReviewPreferenceQuery,
  "preference.bilingualMovieLanguage":
    preferenceRules.isBilingualMovieLanguagePreferenceQuery,
  "aggregate.declinedFinancialOpportunity":
    aggregateNarrowGates.isDeclinedFinancialOpportunityQuery,
  "aggregate.museumVisitOrder": aggregateNarrowGates.isMuseumVisitOrderQuery,
  "aggregate.healthIssueOrder": aggregateNarrowGates.isHealthIssueOrderQuery,
  "aggregate.accommodationCost": aggregateNarrowGates.isAccommodationCostQuery,
  "aggregate.furnitureActivity": aggregateNarrowGates.isFurnitureActivityAggregateQuery,
  "aggregate.propertyViewing": aggregateNarrowGates.isPropertyViewingAggregateQuery,
  "aggregate.foodDeliveryService":
    aggregateNarrowGates.isFoodDeliveryServiceAggregateQuery,
  "aggregate.weatherFeatureConcernCount":
    aggregateNarrowGates.isWeatherFeatureConcernCountQuery,
  "aggregate.medicalProvider": aggregateNarrowGates.isMedicalProviderAggregateQuery,
  "aggregate.plantAcquisition": aggregateNarrowGates.isPlantAcquisitionAggregateQuery,
  "aggregate.aquariumTank": aggregateNarrowGates.isAquariumTankAggregateQuery,
  "aggregate.bikeService": aggregateNarrowGates.isBikeServiceAggregateQuery,
  "aggregate.magazineSubscription":
    aggregateNarrowGates.isMagazineSubscriptionAggregateQuery,
  "aggregate.formalEducationDuration":
    aggregateNarrowGates.isFormalEducationDurationQuery,
  "aggregate.feedWeight": aggregateNarrowGates.isFeedWeightAggregateQuery,
  "aggregate.siblingCount": aggregateNarrowGates.isSiblingCountAggregateQuery,
  "aggregate.personalElectronicsCost":
    aggregateNarrowGates.isPersonalElectronicsCostQuery,
  "aggregate.countableEventActivity":
    aggregateNarrowGates.isCountableEventActivityAggregateQuery,
  "aggregate.modelKitCount": aggregateNarrowGates.isModelKitCountQuery,
  "aggregate.familyMovieMarathonTitles":
    aggregateNarrowGates.isFamilyMovieMarathonTitlesAggregateQuery,
  "aggregate.ownershipCount": aggregateNarrowGates.isOwnershipCountAggregateQuery,
  "aggregate.resumeImprovementAreas":
    aggregateNarrowGates.isResumeImprovementAreasAggregateQuery,
  "aggregate.personalStatementApplicationTypes":
    aggregateNarrowGates.isPersonalStatementApplicationTypesAggregateQuery,
  "aggregate.bookSeriesGenres":
    aggregateNarrowGates.isBookSeriesGenresAggregateQuery,
  "updateSeries.relationshipLatestLocation":
    updateSeriesQueries.isRelationshipLatestLocationQuery,
  "updateSeries.mortgagePreapproval": updateSeriesQueries.isMortgagePreapprovalQuery,
  "updateSeries.sharedGroceryListMethod":
    updateSeriesQueries.isSharedGroceryListMethodQuery,
  "updateSeries.recentFamilyTrip": updateSeriesQueries.isRecentFamilyTripQuery,
  "updateSeries.writingGroupDeadline": isWritingGroupDeadlineUpdateQuery,
  "updateSeries.finalDecisionMeeting": isFinalDecisionMeetingUpdateQuery,
  "updateSeries.executiveProducerInterviews":
    isExecutiveProducerInterviewsUpdateQuery,
  "updateSeries.aiEthicsWebinar": isAiEthicsWebinarUpdateQuery,
  "updateSeries.winterReadingChallenge": isWinterReadingChallengeUpdateQuery,
  "updateSeries.eventCupcakeOrder": isEventCupcakeOrderUpdateQuery,
  "updateSeries.remoteWorkSchedule": isRemoteWorkScheduleUpdateQuery,
  "updateSeries.immigrationConsultantSession":
    isImmigrationConsultantSessionUpdateQuery,
  "updateSeries.onboardingModulesCompletion":
    isOnboardingModulesCompletionUpdateQuery,
  "updateSeries.holidayGiftBudget": isHolidayGiftBudgetUpdateQuery,
  "updateSeries.zoteroSources": isZoteroSourcesUpdateQuery,
  "updateSeries.probabilityStudyHours":
    isProbabilityStudyHoursUpdateQuery,
  "updateSeries.snackBudget": isSnackBudgetUpdateQuery,
  "updateSeries.prototypeBudget": isPrototypeBudgetUpdateQuery,
  "updateSeries.areaCalculationAccuracy":
    isAreaCalculationAccuracyUpdateQuery,
  "updateSeries.estateTaxRate": isEstateTaxRateUpdateQuery,
  "updateSeries.probateTimeline": isProbateTimelineUpdateQuery,
  "temporalInterval.transactionDeploymentWeeks":
    isTransactionDeploymentWeeksIntervalQuery,
  "temporalInterval.triangleProblemCount": isTriangleProblemCountIntervalQuery,
  "temporalInterval.resumeTailoringApplyDays":
    isResumeTailoringApplyDaysIntervalQuery,
  "temporalInterval.reunionPromotionDays": isReunionPromotionDaysIntervalQuery,
  "temporalInterval.screenplayDraftDays": isScreenplayDraftDaysIntervalQuery,
  "temporalInterval.editingChallengeDays": isEditingChallengeDaysIntervalQuery,
  "temporalInterval.outlanderReadingDays": isOutlanderReadingDaysIntervalQuery,
  "temporalInterval.movieListGameNightDays":
    isMovieListGameNightDaysIntervalQuery,
  "temporalInterval.dailyWalkingGoalFestivalMonths":
    isDailyWalkingGoalFestivalMonthsIntervalQuery,
  "temporalInterval.castingPilotEpisodeDays":
    isCastingPilotEpisodeDaysIntervalQuery,
  "temporalInterval.permutationsQuizScoreDays":
    isPermutationsQuizScoreDaysIntervalQuery,
  "temporalInterval.aiHiringWebinarDays":
    isAiHiringWebinarDaysIntervalQuery,
  "temporalInterval.coverLetterZoomCallDays":
    isCoverLetterZoomCallDaysIntervalQuery,
  "temporalInterval.emergencyFundDays": isEmergencyFundDaysIntervalQuery,
  "temporalInterval.filmOfficeMoviesDays":
    isFilmOfficeMoviesDaysIntervalQuery,
  "temporalInterval.firstDraftEssayGradeDays":
    isFirstDraftEssayGradeDaysIntervalQuery,
  "temporalInterval.meetingTestingPeriodDays":
    isMeetingTestingPeriodDaysIntervalQuery,
  "temporalInterval.sprintDeadlineDays":
    isSprintDeadlineDaysIntervalQuery,
  "temporalInterval.writingSessionAbstractDays":
    isWritingSessionAbstractDaysIntervalQuery,
  "temporalInterval.priorArtProvisionalPatentDays":
    isPriorArtProvisionalPatentDaysIntervalQuery,
  "reasoning.resumeAtsSequencing": isResumeAtsSequencingReasoningQuery,
  "reasoning.peerFeedbackBalance": isPeerFeedbackBalanceReasoningQuery,
  "reasoning.readingPlanBalance": isReadingPlanBalanceReasoningQuery,
  "reasoning.entertainmentSpendingOptimization":
    isEntertainmentSpendingReasoningQuery,
  "reasoning.sneakerBudgetComparison":
    isSneakerBudgetComparisonReasoningQuery,
  "reasoning.workBoundaryOrder": isWorkBoundaryOrderReasoningQuery,
  "reasoning.seniorProducerPreparationPriority":
    reasoningRules.isSeniorProducerPreparationPriorityQuery,
  "reasoning.patentPriorArtFiling": reasoningRules.isPatentPriorArtFilingReasoningQuery,
  "reasoning.patentFilingDeadline": reasoningRules.isPatentFilingDeadlineReasoningQuery,
  "reasoning.probabilityCalculationConfirmation":
    reasoningRules.isProbabilityCalculationConfirmationReasoningQuery,
  "reasoning.householdBudget": isSourceOrderedHouseholdBudgetReasoningQuery,
  "eventOrder.probabilityConcepts": isProbabilityConceptsEventOrderQuery,
  "eventOrder.careerRelocation": isCareerRelocationEventOrderQuery,
  "eventOrder.aiHiring": isAiHiringEventOrderQuery,
  "eventOrder.patentFunding": isPatentFundingEventOrderQuery,
  "eventOrder.combinatoricsProbability":
    isCombinatoricsProbabilityEventOrderQuery,
  "eventOrder.sneakerSafety": isSneakerSafetyEventOrderQuery,
  "eventOrder.patentProcessStages":
    isPatentProcessStagesEventOrderQuery,
  "eventOrder.academicMentorship": isAcademicMentorshipEventOrderQuery,
  "eventOrder.mentorInteractions": isMentorInteractionsEventOrderQuery,
  "eventOrder.hiringAutomationTopics":
    isHiringAutomationTopicsEventOrderQuery,
  "eventOrder.cityAutocomplete": isCityAutocompleteEventOrderQuery,
  "eventOrder.projectDevelopment": isProjectDevelopmentEventOrderQuery,
  "eventOrder.creativeCollaborations":
    isCreativeCollaborationsEventOrderQuery,
  "eventOrder.personalProfessionalProgress":
    isPersonalProfessionalProgressEventOrderQuery,
  "eventOrder.entertainmentInterests":
    isEntertainmentInterestsEventOrderQuery,
  "eventOrder.carlaCollaboration": isCarlaCollaborationEventOrderQuery,
  "eventOrder.workLifeChallenges": isWorkLifeChallengesEventOrderQuery,
  "eventOrder.appDevelopment": isAppDevelopmentEventOrderQuery,
  "instruction.trelloSprintCriteriaAbstention":
    isTrelloSprintPrioritizationCriteriaAbstentionQuery,
  "instruction.resumeDesign": isResumeDesignInstructionQuery,
  "instruction.timelineDateFormat": isTimelineDateFormatInstructionQuery,
  "instruction.legalTermsExplanation":
    isLegalTermsExplanationInstructionQuery,
  "instruction.patentTimelines": isPatentTimelinesInstructionQuery,
  "instruction.nonProvisionalFilingDate":
    isNonProvisionalFilingInstructionQuery,
  "contradiction.sessionManagement": isSessionManagementContradictionQuery,
  "contradiction.twoFactorAuthImplementation":
    isTwoFactorAuthImplementationContradictionQuery,
  "contradiction.atsCourseEnrollment": isAtsCourseEnrollmentContradictionQuery,
  "contradiction.familyMovieInvite": isFamilyMovieInviteContradictionQuery,
  "contradiction.willAttorneyMeeting":
    isWillAttorneyMeetingContradictionQuery,
  "contradiction.patentWebinar": isPatentWebinarContradictionQuery,
  "contradiction.movieWatchlist": isMovieWatchlistContradictionQuery,
  "contradiction.writingSessions": isWritingSessionsContradictionQuery,
  "contradiction.anniversaryCelebration":
    isAnniversaryCelebrationContradictionQuery,
  "contradiction.bootstrapComponents":
    isBootstrapComponentsContradictionQuery,
  "conversation.couponRedemptionLocation": isCouponRedemptionLocationQuery,
};

interface AuditStateBatch {
  affectedQuestionIds: string[];
  caseDeltaCount: number;
  gates: string[];
  runId: string;
}

export interface EnrichedVerdict {
  directCaseIds: string[];
  directMatchCaseIdsInBenchmark: string[];
  gateId: string;
  rippleCaseIds: string[];
  status: "dead" | "ripple_only" | "case_fitted" | "load_bearing" | "unmeasured";
}

export function enrichVerdict(input: {
  affectedQuestionIds: string[] | undefined;
  gateId: string;
  questionTextById: Map<string, string>;
  classify: (query: string) => boolean;
}): EnrichedVerdict {
  const matchesInBenchmark: string[] = [];
  for (const [caseId, text] of input.questionTextById) {
    if (input.classify(text)) {
      matchesInBenchmark.push(caseId);
    }
  }

  if (input.affectedQuestionIds === undefined) {
    return {
      directCaseIds: [],
      directMatchCaseIdsInBenchmark: matchesInBenchmark.sort(),
      gateId: input.gateId,
      rippleCaseIds: [],
      status: "unmeasured",
    };
  }

  const direct: string[] = [];
  const ripple: string[] = [];
  for (const caseId of input.affectedQuestionIds) {
    const text = input.questionTextById.get(caseId);
    if (text !== undefined && input.classify(text)) {
      direct.push(caseId);
    } else {
      ripple.push(caseId);
    }
  }

  const status = input.affectedQuestionIds.length === 0
    ? "dead"
    : direct.length === 0
      ? "ripple_only"
      : direct.length <= 1
        ? "case_fitted"
        : "load_bearing";
  return {
    directCaseIds: direct.sort(),
    directMatchCaseIdsInBenchmark: matchesInBenchmark.sort(),
    gateId: input.gateId,
    rippleCaseIds: ripple.sort(),
    status,
  };
}

if (import.meta.main) {
  const root = resolvePhase63RepoRoot();
  const auditDir = join(root, "reports/phase-63/narrow-gate-audit");
  const state = JSON.parse(
    await readFile(join(auditDir, "state.json"), "utf8"),
  ) as { batches: Record<string, AuditStateBatch>; runsExecuted: number };

  const rows = await readPhase63BeamRows({
    benchmarkRoot: "/private/tmp/BEAM",
    readFile: (path: string) => readFile(path, "utf8"),
  });
  const questionTextById = new Map<string, string>();
  for (const row of rows) {
    for (const question of row.probingQuestions) {
      questionTextById.set(question.questionId, question.question);
    }
  }

  const singletonResults = new Map<string, string[]>();
  for (const batch of Object.values(state.batches)) {
    if (batch.gates.length === 1) {
      singletonResults.set(batch.gates[0]!, batch.affectedQuestionIds);
    }
  }
  // Gates whose family batch was clean are dead without singleton runs.
  for (const batch of Object.values(state.batches)) {
    if (batch.caseDeltaCount === 0) {
      for (const gateId of batch.gates) {
        if (!singletonResults.has(gateId)) {
          singletonResults.set(gateId, []);
        }
      }
    }
  }

  const verdicts: EnrichedVerdict[] = [];
  for (const [gateId, classify] of Object.entries(GATE_FUNCTIONS)) {
    verdicts.push(
      enrichVerdict({
        affectedQuestionIds: singletonResults.get(gateId),
        classify,
        gateId,
        questionTextById,
      }),
    );
  }
  verdicts.sort((left, right) =>
    left.status === right.status
      ? left.gateId.localeCompare(right.gateId)
      : left.status.localeCompare(right.status)
  );

  const summary: Record<string, number> = {};
  for (const verdict of verdicts) {
    summary[verdict.status] = (summary[verdict.status] ?? 0) + 1;
  }
  const outputPath = join(auditDir, "report-enriched.json");
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedBy: "scripts/enrich-narrow-gate-audit.ts",
        note:
          "directCaseIds: affected cases whose own question matches the gate (true gate effect). rippleCaseIds: same-conversation reinforcement coupling, not the gate's own routing. Sunset queue = dead + ripple_only (confirm ripple_only gates individually: their matched queries' retrieval may be unchanged because another route shadows them).",
        runsExecuted: state.runsExecuted,
        summary,
        verdicts,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify(summary));
  console.log(`report: ${outputPath}`);
}
