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
  isSourceOrderFinancialPlanningQuery,
  selectSourceOrderedFinancialPlanningAnchors,
} from "./sourceOrderFinancialPlanning";
import {
  isSourceOrderFreeWillReflectionQuery,
  selectSourceOrderedFreeWillReflectionAnchors,
} from "./sourceOrderFreeWillReflection";
import {
  isSourceOrderMovieNightContributionQuery,
  selectSourceOrderedMovieNightContributionAnchors,
} from "./sourceOrderMovieEvents";
import {
  isSourceOrderPersonalStatementSupportQuery,
  selectSourceOrderedPersonalStatementSupportAnchors,
} from "./sourceOrderPersonalStatementSupport";
import {
  isSourceOrderProfessionalPreparationQuery,
  selectSourceOrderedProfessionalPreparationAnchors,
} from "./sourceOrderProfessionalPreparation";
import {
  isSourceOrderWeatherErrorHandlingQuery,
  selectSourceOrderedWeatherErrorHandlingAnchors,
} from "./sourceOrderWeatherErrorHandling";
import {
  isSourceOrderWorkloadManagementQuery,
  selectSourceOrderedWorkloadManagementAnchors,
} from "./sourceOrderWorkloadManagement";
import {
  isSourceOrderWritingJourneyQuery,
  selectSourceOrderedWritingJourneyAnchors,
} from "./sourceOrderWritingJourney";

export function isCompleteSourceOrderedEventOrderPlanQuery(query: string): boolean {
  return isSourceOrderBookClubActivitiesQuery(query) ||
    isSourceOrderFrameworkCustomizationQuery(query) ||
    isSourceOrderFinancialPlanningQuery(query) ||
    isSourceOrderFreeWillReflectionQuery(query) ||
    isSourceOrderMovieNightContributionQuery(query) ||
    isSourceOrderPersonalStatementSupportQuery(query) ||
    isSourceOrderProfessionalPreparationQuery(query) ||
    isSourceOrderWeatherErrorHandlingQuery(query) ||
    isSourceOrderWorkloadManagementQuery(query) ||
    isSourceOrderWritingJourneyQuery(query);
}

export function isPackedSourceOrderedEventOrderPlanQuery(query: string): boolean {
  return isSourceOrderWeatherErrorHandlingQuery(query);
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
  if (isSourceOrderFinancialPlanningQuery(input.query)) {
    return selectSourceOrderedFinancialPlanningAnchors(input);
  }
  if (isSourceOrderFreeWillReflectionQuery(input.query)) {
    return selectSourceOrderedFreeWillReflectionAnchors(input);
  }
  if (isSourceOrderMovieNightContributionQuery(input.query)) {
    return selectSourceOrderedMovieNightContributionAnchors(input);
  }
  if (isSourceOrderPersonalStatementSupportQuery(input.query)) {
    return selectSourceOrderedPersonalStatementSupportAnchors(input);
  }
  if (isSourceOrderProfessionalPreparationQuery(input.query)) {
    return selectSourceOrderedProfessionalPreparationAnchors(input);
  }
  if (isSourceOrderWeatherErrorHandlingQuery(input.query)) {
    return selectSourceOrderedWeatherErrorHandlingAnchors(input);
  }
  if (isSourceOrderWorkloadManagementQuery(input.query)) {
    return selectSourceOrderedWorkloadManagementAnchors(input);
  }
  if (isSourceOrderWritingJourneyQuery(input.query)) {
    return selectSourceOrderedWritingJourneyAnchors(input);
  }

  return [];
}
