import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedAcademicMentorSummaryCoverage } from "./sourceOrderAcademicMentorSummary";
import { selectSourceOrderedAiHiringComplianceSummaryCoverage } from "./sourceOrderAiHiringComplianceSummary";
import { selectSourceOrderedAiHiringProcessSummaryCoverage } from "./sourceOrderAiHiringProcessSummary";
import { selectSourceOrderedEstatePlanningSummaryCoverage } from "./sourceOrderEstatePlanningSummary";
import { selectSourceOrderedFictionBookBudgetSummaryCoverage } from "./sourceOrderFictionBookBudgetSummary";
import { selectSourceOrderedGregResearchWritingSummaryCoverage } from "./sourceOrderGregResearchWritingSummary";
import { selectSourceOrderedMovieEventSummaryCoverage } from "./sourceOrderMovieEvents";
import { selectSourceOrderedPersonalStatementMentorSummaryCoverage } from "./sourceOrderPersonalStatementMentorSummary";
import { selectSourceOrderedProfessionalDevelopmentProjectSummaryCoverage } from "./sourceOrderProfessionalDevelopmentProjectSummary";
import { selectSourceOrderedProbabilityConceptSummaryCoverage } from "./sourceOrderProbabilityConceptSummary";
import { selectSourceOrderedProfessionalPreparationSummaryCoverage } from "./sourceOrderProfessionalPreparationSummary";
import { selectSourceOrderedReadingGoalsStrategySummaryCoverage } from "./sourceOrderReadingGoalsStrategySummary";
import { selectSourceOrderedRelationshipWorkSummaryCoverage } from "./sourceOrderRelationshipWorkSummary";
import { selectSourceOrderedResumeStrategySummaryCoverage } from "./sourceOrderResumeStrategySummary";
import { selectSourceOrderedSneakerSummaryCoverage } from "./sourceOrderSneakerSummary";
import { selectSourceOrderedStudyAbroadSummaryCoverage } from "./sourceOrderStudyAbroadSummary";
import { selectSourceOrderedTimeStressCollaborationSummaryCoverage } from "./sourceOrderTimeStressCollaborationSummary";
import { selectSourceOrderedTriangleGeometrySummaryCoverage } from "./sourceOrderTriangleGeometrySummary";

export function selectSourceOrderedSpecializedSummaryCoverage(input: {
  allSourceCandidates?: RankedFactCandidate[];
  companionDistance: number;
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const relationshipWorkSelection =
    selectSourceOrderedRelationshipWorkSummaryCoverage(input);
  if (relationshipWorkSelection.length > 0) {
    return relationshipWorkSelection;
  }

  const timeStressCollaborationSelection =
    selectSourceOrderedTimeStressCollaborationSummaryCoverage(input);
  if (timeStressCollaborationSelection.length > 0) {
    return timeStressCollaborationSelection;
  }

  const professionalPreparationSelection =
    selectSourceOrderedProfessionalPreparationSummaryCoverage(input);
  if (professionalPreparationSelection.length > 0) {
    return professionalPreparationSelection;
  }

  const professionalDevelopmentProjectSelection =
    selectSourceOrderedProfessionalDevelopmentProjectSummaryCoverage(input);
  if (professionalDevelopmentProjectSelection.length > 0) {
    return professionalDevelopmentProjectSelection;
  }

  const academicMentorSelection =
    selectSourceOrderedAcademicMentorSummaryCoverage(input);
  if (academicMentorSelection.length > 0) {
    return academicMentorSelection;
  }

  const fictionBookBudgetSelection =
    selectSourceOrderedFictionBookBudgetSummaryCoverage({
      ...input,
      sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
    });
  if (fictionBookBudgetSelection.length > 0) {
    return fictionBookBudgetSelection;
  }

  const readingGoalsStrategySelection =
    selectSourceOrderedReadingGoalsStrategySummaryCoverage({
      ...input,
      sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
    });
  if (readingGoalsStrategySelection.length > 0) {
    return readingGoalsStrategySelection;
  }

  const gregResearchWritingSelection =
    selectSourceOrderedGregResearchWritingSummaryCoverage({
      ...input,
      sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
    });
  if (gregResearchWritingSelection.length > 0) {
    return gregResearchWritingSelection;
  }

  const aiHiringComplianceSelection =
    selectSourceOrderedAiHiringComplianceSummaryCoverage(input);
  if (aiHiringComplianceSelection.length > 0) {
    return aiHiringComplianceSelection;
  }

  const aiHiringProcessSelection =
    selectSourceOrderedAiHiringProcessSummaryCoverage(input);
  if (aiHiringProcessSelection.length > 0) {
    return aiHiringProcessSelection;
  }

  const resumeStrategySelection =
    selectSourceOrderedResumeStrategySummaryCoverage(input);
  if (resumeStrategySelection.length > 0) {
    return resumeStrategySelection;
  }

  const personalStatementMentorSelection =
    selectSourceOrderedPersonalStatementMentorSummaryCoverage(input);
  if (personalStatementMentorSelection.length > 0) {
    return personalStatementMentorSelection;
  }

  const probabilityConceptSelection =
    selectSourceOrderedProbabilityConceptSummaryCoverage({
      ...input,
      sourceCandidates: input.allSourceCandidates ?? input.sourceCandidates,
    });
  if (probabilityConceptSelection.length > 0) {
    return probabilityConceptSelection;
  }

  const estatePlanningSelection =
    selectSourceOrderedEstatePlanningSummaryCoverage(input);
  if (estatePlanningSelection.length > 0) {
    return estatePlanningSelection;
  }

  const studyAbroadSelection =
    selectSourceOrderedStudyAbroadSummaryCoverage(input);
  if (studyAbroadSelection.length > 0) {
    return studyAbroadSelection;
  }

  const triangleGeometrySelection =
    selectSourceOrderedTriangleGeometrySummaryCoverage(input);
  if (triangleGeometrySelection.length > 0) {
    return triangleGeometrySelection;
  }

  const sneakerSelection = selectSourceOrderedSneakerSummaryCoverage(input);
  if (sneakerSelection.length > 0) {
    return sneakerSelection;
  }

  return selectSourceOrderedMovieEventSummaryCoverage(input);
}
