import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedMovieEventSummaryCoverage } from "./sourceOrderMovieEvents";
import { selectSourceOrderedProbabilityConceptSummaryCoverage } from "./sourceOrderProbabilityConceptSummary";
import { selectSourceOrderedProfessionalPreparationSummaryCoverage } from "./sourceOrderProfessionalPreparationSummary";
import { selectSourceOrderedRelationshipWorkSummaryCoverage } from "./sourceOrderRelationshipWorkSummary";

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

  const probabilityConceptSelection =
    selectSourceOrderedProbabilityConceptSummaryCoverage(input);
  if (probabilityConceptSelection.length > 0) {
    return probabilityConceptSelection;
  }

  return selectSourceOrderedMovieEventSummaryCoverage(input);
}
