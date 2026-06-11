import { narrowGate } from "../narrowGates";
import {
  DECLINED_FINANCIAL_OPPORTUNITY_QUERY_PATTERN,
  DECLINED_FINANCIAL_OPPORTUNITY_QUERY_ZH_PATTERN,
  WEATHER_FEATURE_CONCERN_COUNT_QUERY_PATTERN,
  isAggregateMoneyQuery,
} from "./aggregate";

export const isDeclinedFinancialOpportunityQuery = narrowGate(
  "aggregate.declinedFinancialOpportunity",
  (query: string): boolean => {
  return DECLINED_FINANCIAL_OPPORTUNITY_QUERY_PATTERN.test(query) ||
    DECLINED_FINANCIAL_OPPORTUNITY_QUERY_ZH_PATTERN.test(query);
  },
);

export const isMuseumVisitOrderQuery = narrowGate(
  "aggregate.museumVisitOrder",
  (query: string): boolean => {
  return /\border\b[\s\S]{0,120}\b(?:museums?|gallery|galleries)\b/iu.test(query) ||
    /\b(?:museums?|gallery|galleries)\b[\s\S]{0,120}\border\b/iu.test(query);
  },
);

export const isHealthIssueOrderQuery = narrowGate(
  "aggregate.healthIssueOrder",
  (query: string): boolean => {
  return /\bwhich\b[\s\S]{0,120}\bhealth\s+issues?\b[\s\S]{0,120}\bfirst\b/iu.test(query);
  },
);

export const isAccommodationCostQuery = narrowGate(
  "aggregate.accommodationCost",
  (query: string): boolean => {
  return /\b(?:accommodations?|lodging|hotel|hostel|resort|motel|airbnb|room|stay|staying)\b/i.test(query) &&
    /\b(?:per\s+night|nightly|how much|cost|costs|spent|spend|paid|price|prices)\b/i.test(query);
  },
);

export const isFurnitureActivityAggregateQuery = narrowGate(
  "aggregate.furnitureActivity",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:furniture|pieces?|items?|buy|bought|assemble|assembled|sell|sold|fix|fixed)\b/i.test(query);
  },
);

export const isPropertyViewingAggregateQuery = narrowGate(
  "aggregate.propertyViewing",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:properties|property|view|viewed|saw|seen|offer|townhouse|condo|house|home)\b/i.test(query);
  },
);

export const isFoodDeliveryServiceAggregateQuery = narrowGate(
  "aggregate.foodDeliveryService",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:food delivery|delivery services?|Domino'?s|Uber Eats|Fresh Fusion)\b/i.test(query);
  },
);

export const isWeatherFeatureConcernCountQuery = narrowGate(
  "aggregate.weatherFeatureConcernCount",
  (query: string): boolean => {
  return WEATHER_FEATURE_CONCERN_COUNT_QUERY_PATTERN.test(query);
  },
);

export const isMedicalProviderAggregateQuery = narrowGate(
  "aggregate.medicalProvider",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:doctor|doctors|physician|physicians|specialist|specialists)\b/i.test(query);
  },
);

export const isPlantAcquisitionAggregateQuery = narrowGate(
  "aggregate.plantAcquisition",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:plants?|lily|succulent|fern|basil|rose|snake plant|spider plant)\b/i.test(query) &&
    /\b(?:acquire|acquired|got|bought|purchased|picked up|received|last month|initially|planted|growing)\b/i.test(query);
  },
);

export const isAquariumTankAggregateQuery = narrowGate(
  "aggregate.aquariumTank",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:tank|tanks|aquariums?)\b/i.test(query);
  },
);

export const isBikeServiceAggregateQuery = narrowGate(
  "aggregate.bikeService",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\bbikes?\b/i.test(query) &&
    /\b(?:service|serviced|plan|planned|maintenance|replace|replaced|cleaned|lubricated)\b/i.test(query);
  },
);

export const isMagazineSubscriptionAggregateQuery = narrowGate(
  "aggregate.magazineSubscription",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:magazine|subscription|subscriptions|publications?)\b/i.test(query);
  },
);

export const isFormalEducationDurationQuery = narrowGate(
  "aggregate.formalEducationDuration",
  (query: string): boolean => {
  return /\b(?:how many years|total)\b/i.test(query) &&
    /\b(?:formal education|high school|Bachelor'?s|degree|education)\b/i.test(query);
  },
);

export const isFeedWeightAggregateQuery = narrowGate(
  "aggregate.feedWeight",
  (query: string): boolean => {
  return /\b(?:total|combined|sum)\b/i.test(query) &&
    /\b(?:weight|pounds?|feed|grains)\b/i.test(query);
  },
);

export const isSiblingCountAggregateQuery = narrowGate(
  "aggregate.siblingCount",
  (query: string): boolean => {
  return /\b(?:how many|total(?:\s+number)?)\b/i.test(query) &&
    /\bsiblings?\b/i.test(query);
  },
);

export const isPersonalElectronicsCostQuery = narrowGate(
  "aggregate.personalElectronicsCost",
  (query: string): boolean => {
  return isAggregateMoneyQuery(query) &&
    /\b(?:headphones?|iPad|tablet|phone|watch|electronics?)\b/i.test(query);
  },
);

export const isCountableEventActivityAggregateQuery = narrowGate(
  "aggregate.countableEventActivity",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:events?|activities?|classes?|appointments?|ceremonies?|sports?|instruments?|points?|rewards?|museums?|galleries?|workshops?|lectures?|tours?)\b/i.test(query);
  },
);

export const isModelKitCountQuery = narrowGate(
  "aggregate.modelKitCount",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) && /\bmodel kits?\b/i.test(query);
  },
);

export const isOwnershipCountAggregateQuery = narrowGate(
  "aggregate.ownershipCount",
  (query: string): boolean => {
  return /\bhow many\b/i.test(query) &&
    /\b(?:own|owns|owned|have|has|currently|bring|bringing)\b/i.test(query);
  },
);
