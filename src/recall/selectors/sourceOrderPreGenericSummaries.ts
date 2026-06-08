import type { RankedFactCandidate } from "../scoring";
import { selectSourceOrderedAiHiringProcessSummaryCoverage } from "./sourceOrderRules/hiringProcessSummary";
import { selectSourceOrderedWeatherAutocompleteSummaryCoverage } from "./sourceOrderRules/weatherSuggestionSummary";
import { selectSourceOrderedWebProjectIssueResolutionSummaryCoverage } from "./sourceOrderRules/webProjectIssueResolutionSummary";

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
