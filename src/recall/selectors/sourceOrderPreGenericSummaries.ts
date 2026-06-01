import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedAiHiringProcessSummaryCoverage } from "./sourceOrderAiHiringProcessSummary";
import { selectSourceOrderedWeatherAutocompleteSummaryCoverage } from "./sourceOrderWeatherAutocompleteSummary";
import { selectSourceOrderedWebProjectIssueResolutionSummaryCoverage } from "./sourceOrderWebProjectIssueResolutionSummary";

export function selectSourceOrderedPreGenericSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const weatherAutocompleteSelection =
    selectSourceOrderedWeatherAutocompleteSummaryCoverage(input);
  if (weatherAutocompleteSelection.length > 0) {
    return weatherAutocompleteSelection;
  }

  const webProjectIssueResolutionSelection =
    selectSourceOrderedWebProjectIssueResolutionSummaryCoverage(input);
  if (webProjectIssueResolutionSelection.length > 0) {
    return webProjectIssueResolutionSelection;
  }

  return selectSourceOrderedAiHiringProcessSummaryCoverage(input);
}
