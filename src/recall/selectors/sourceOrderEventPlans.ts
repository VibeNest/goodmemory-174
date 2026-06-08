import type { RankedFactCandidate } from "../scoring";
import {
  isSourceOrderAppDevelopmentDeploymentQuery,
  selectSourceOrderedAppDevelopmentDeploymentAnchors,
} from "./sourceOrderAppDevelopmentDeployment";
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
  isSourceOrderStressFinancialConcernQuery,
  selectSourceOrderedFinancialPlanningAnchors,
  selectSourceOrderedStressFinancialConcernAnchors,
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
  isSourceOrderRelationshipBeliefEventQuery,
  selectSourceOrderedRelationshipBeliefEventAnchors,
} from "./sourceOrderRelationshipBeliefs";
import {
  isSourceOrderWeatherAutocompleteEventQuery,
  selectSourceOrderedWeatherAutocompleteEventAnchors,
} from "./sourceOrderWeatherAutocompleteEventOrder";
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
  return isSourceOrderAppDevelopmentDeploymentQuery(query) ||
    isSourceOrderBookClubActivitiesQuery(query) ||
    isSourceOrderFrameworkCustomizationQuery(query) ||
    isSourceOrderFinancialPlanningQuery(query) ||
    isSourceOrderStressFinancialConcernQuery(query) ||
    isSourceOrderFreeWillReflectionQuery(query) ||
    isSourceOrderMovieNightContributionQuery(query) ||
    isSourceOrderPersonalStatementSupportQuery(query) ||
    isSourceOrderProfessionalPreparationQuery(query) ||
    isSourceOrderRelationshipBeliefEventQuery(query) ||
    isSourceOrderWeatherAutocompleteEventQuery(query) ||
    isSourceOrderWeatherErrorHandlingQuery(query) ||
    isSourceOrderWorkloadManagementQuery(query) ||
    isSourceOrderWritingJourneyQuery(query);
}

export function isPackedSourceOrderedEventOrderPlanQuery(query: string): boolean {
  return isSourceOrderAppDevelopmentDeploymentQuery(query) ||
    isSourceOrderWeatherErrorHandlingQuery(query);
}

export function isAssistantInclusiveSourceOrderedEventOrderPlanQuery(
  query: string,
): boolean {
  return isSourceOrderWeatherAutocompleteEventQuery(query);
}

export function selectCompleteSourceOrderedEventOrderAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
  query: string;
}): RankedFactCandidate[] {
  if (isSourceOrderAppDevelopmentDeploymentQuery(input.query)) {
    return selectSourceOrderedAppDevelopmentDeploymentAnchors(input);
  }
  if (isSourceOrderFrameworkCustomizationQuery(input.query)) {
    return selectSourceOrderedFrameworkCustomizationAnchors(input);
  }
  if (isSourceOrderBookClubActivitiesQuery(input.query)) {
    return selectSourceOrderedBookClubActivityAnchors(input);
  }
  if (isSourceOrderFinancialPlanningQuery(input.query)) {
    return selectSourceOrderedFinancialPlanningAnchors(input);
  }
  if (isSourceOrderStressFinancialConcernQuery(input.query)) {
    return selectSourceOrderedStressFinancialConcernAnchors(input);
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
  if (isSourceOrderRelationshipBeliefEventQuery(input.query)) {
    return selectSourceOrderedRelationshipBeliefEventAnchors(input);
  }
  if (isSourceOrderWeatherAutocompleteEventQuery(input.query)) {
    return selectSourceOrderedWeatherAutocompleteEventAnchors(input);
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
