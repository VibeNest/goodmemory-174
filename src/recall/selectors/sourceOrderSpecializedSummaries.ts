import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedAiHiringComplianceSummaryCoverage } from "./sourceOrderAiHiringComplianceSummary";
import { selectSourceOrderedMovieEventSummaryCoverage } from "./sourceOrderMovieEvents";
import { selectSourceOrderedProbabilityConceptSummaryCoverage } from "./sourceOrderProbabilityConceptSummary";
import { selectSourceOrderedProfessionalPreparationSummaryCoverage } from "./sourceOrderProfessionalPreparationSummary";
import { selectSourceOrderedRelationshipWorkSummaryCoverage } from "./sourceOrderRelationshipWorkSummary";
import { selectSourceOrderedResumeStrategySummaryCoverage } from "./sourceOrderResumeStrategySummary";
import { selectSourceOrderedSneakerSummaryCoverage } from "./sourceOrderSneakerSummary";

export function selectSourceOrderedSpecializedSummaryCoverage(input: {
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

  const professionalPreparationSelection =
    selectSourceOrderedProfessionalPreparationSummaryCoverage(input);
  if (professionalPreparationSelection.length > 0) {
    return professionalPreparationSelection;
  }

  const aiHiringComplianceSelection =
    selectSourceOrderedAiHiringComplianceSummaryCoverage(input);
  if (aiHiringComplianceSelection.length > 0) {
    return aiHiringComplianceSelection;
  }

  const resumeStrategySelection =
    selectSourceOrderedResumeStrategySummaryCoverage(input);
  if (resumeStrategySelection.length > 0) {
    return resumeStrategySelection;
  }

  const probabilityConceptSelection =
    selectSourceOrderedProbabilityConceptSummaryCoverage(input);
  if (probabilityConceptSelection.length > 0) {
    return probabilityConceptSelection;
  }

  const sneakerSelection = selectSourceOrderedSneakerSummaryCoverage(input);
  if (sneakerSelection.length > 0) {
    return sneakerSelection;
  }

  return selectSourceOrderedMovieEventSummaryCoverage(input);
}
