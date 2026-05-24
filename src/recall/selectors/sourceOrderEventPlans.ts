import type { RankedFactCandidate } from "../scoring";
import {
  isSourceOrderBookClubActivitiesQuery,
  selectSourceOrderedBookClubActivityAnchors,
} from "./sourceOrderBookClubActivities";
import {
  isSourceOrderFrameworkCustomizationQuery,
  selectSourceOrderedFrameworkCustomizationAnchors,
} from "./sourceOrderFrameworkCustomization";
import {
  isSourceOrderMovieNightContributionQuery,
  selectSourceOrderedMovieNightContributionAnchors,
} from "./sourceOrderMovieEvents";
import {
  isSourceOrderWritingJourneyQuery,
  selectSourceOrderedWritingJourneyAnchors,
} from "./sourceOrderWritingJourney";

export function isCompleteSourceOrderedEventOrderPlanQuery(query: string): boolean {
  return isSourceOrderBookClubActivitiesQuery(query) ||
    isSourceOrderFrameworkCustomizationQuery(query) ||
    isSourceOrderMovieNightContributionQuery(query) ||
    isSourceOrderWritingJourneyQuery(query);
}

export function selectCompleteSourceOrderedEventOrderAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
  query: string;
}): RankedFactCandidate[] {
  if (isSourceOrderFrameworkCustomizationQuery(input.query)) {
    return selectSourceOrderedFrameworkCustomizationAnchors(input);
  }
  if (isSourceOrderBookClubActivitiesQuery(input.query)) {
    return selectSourceOrderedBookClubActivityAnchors(input);
  }
  if (isSourceOrderMovieNightContributionQuery(input.query)) {
    return selectSourceOrderedMovieNightContributionAnchors(input);
  }
  if (isSourceOrderWritingJourneyQuery(input.query)) {
    return selectSourceOrderedWritingJourneyAnchors(input);
  }

  return [];
}
