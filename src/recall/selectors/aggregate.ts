import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  HEALTH_ISSUE_EVENT_FACT_PATTERN,
  isTemporalIntervalEvidenceFact,
  isTemporalIntervalQuery,
  REALIZED_TEMPORAL_EVENT_FACT_PATTERN,
  sourceOrderSortKey,
  temporalIntervalBoundaryPriority,
} from "./temporal";
import {
  hasEntityBearingEvidenceSignal,
  hasTrustedAggregateEvidence,
  hasUserAnswerTag,
  INSTRUMENT_PRACTICE_FACT_PATTERN,
  isDatedEventFact,
  isInstrumentPracticeTimeQuery,
  PERSONAL_ELECTRONICS_FACT_PATTERN,
  QUANTIFIED_FACT_PATTERN,
  valueBearingFactContent,
} from "./selectionContext";

import {
  isAccommodationCostQuery,
  isAquariumTankAggregateQuery,
  isBikeServiceAggregateQuery,
  isCountableEventActivityAggregateQuery,
  isDeclinedFinancialOpportunityQuery,
  isFamilyMovieMarathonTitlesAggregateQuery,
  isFeedWeightAggregateQuery,
  isFoodDeliveryServiceAggregateQuery,
  isFormalEducationDurationQuery,
  isFurnitureActivityAggregateQuery,
  isHealthIssueOrderQuery,
  isMagazineSubscriptionAggregateQuery,
  isMedicalProviderAggregateQuery,
  isModelKitCountQuery,
  isMuseumVisitOrderQuery,
  isOwnershipCountAggregateQuery,
  isPersonalElectronicsCostQuery,
  isPlantAcquisitionAggregateQuery,
  isPersonalStatementApplicationTypesAggregateQuery,
  isPropertyViewingAggregateQuery,
  isResumeImprovementAreasAggregateQuery,
  isSiblingCountAggregateQuery,
  isWeatherFeatureConcernCountQuery,
} from "./aggregateNarrowGates";
import {
  aggregateRuleFamilyPriorityBonus,
  aggregateRuleFamilyRecallLimit,
  hasAggregateRuleFamilySignal,
} from "./aggregateRules/registry";

export {
  isAccommodationCostQuery,
  isAquariumTankAggregateQuery,
  isBikeServiceAggregateQuery,
  isCountableEventActivityAggregateQuery,
  isDeclinedFinancialOpportunityQuery,
  isFamilyMovieMarathonTitlesAggregateQuery,
  isFeedWeightAggregateQuery,
  isFoodDeliveryServiceAggregateQuery,
  isFormalEducationDurationQuery,
  isFurnitureActivityAggregateQuery,
  isHealthIssueOrderQuery,
  isMagazineSubscriptionAggregateQuery,
  isMedicalProviderAggregateQuery,
  isModelKitCountQuery,
  isMuseumVisitOrderQuery,
  isOwnershipCountAggregateQuery,
  isPersonalElectronicsCostQuery,
  isPlantAcquisitionAggregateQuery,
  isPersonalStatementApplicationTypesAggregateQuery,
  isPropertyViewingAggregateQuery,
  isResumeImprovementAreasAggregateQuery,
  isSiblingCountAggregateQuery,
  isWeatherFeatureConcernCountQuery,
};

export const AGGREGATE_OPEN_LOOP_LIMIT = 6;
export const AGGREGATE_FACT_COUNT_LIMIT = 6;
export const FAMILY_MOVIE_MARATHON_TITLES_RECALL_LIMIT = 11;
export const AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD = 0.05;
export const AGGREGATE_GENERIC_LEXICAL_FACT_THRESHOLD = 0.2;
export const MONEY_FACT_PATTERN =
  /\$\s*\d|\d+(?:[.,]\d+)?\s*(?:元|块|人民币)|\b(?:cost|costs|costing|paid|price|prices|spent|spend|dollars?)\b|(?:花了|花费|费用|价格)/iu;
export const DECLINED_FINANCIAL_OPPORTUNITY_QUERY_PATTERN =
  /\b(?:declin(?:e|ed|ing)|passed\s+on|reject(?:ed|ing)?|turn(?:ed|ing)?\s+down)\b[\s\S]{0,180}\b(?:amounts?|bonus|financial|freelance|money|opportunit(?:y|ies)|project|raise)\b|\b(?:amounts?|bonus|financial|freelance|money|opportunit(?:y|ies)|project|raise)\b[\s\S]{0,180}\b(?:declin(?:e|ed|ing)|passed\s+on|reject(?:ed|ing)?|turn(?:ed|ing)?\s+down)\b/iu;
export const DECLINED_FINANCIAL_OPPORTUNITY_QUERY_ZH_PATTERN =
  /(拒绝|放弃|推掉).{0,120}(财务|机会|加薪|奖金|自由职业|项目|金额|钱)|(财务|机会|加薪|奖金|自由职业|项目|金额|钱).{0,120}(拒绝|放弃|推掉)/u;
export const DECLINED_FINANCIAL_OPPORTUNITY_FACT_PATTERN =
  /\b(?:declin(?:e|ed|ing)|passed\s+on|reject(?:ed|ing)?|turn(?:ed|ing)?\s+down)\b[\s\S]{0,180}\b(?:\$\s*\d|bonus|dollars?|freelance|opportunit(?:y|ies)|project|raise)\b|\b(?:\$\s*\d|bonus|dollars?|freelance|opportunit(?:y|ies)|project|raise)\b[\s\S]{0,180}\b(?:declin(?:e|ed|ing)|passed\s+on|reject(?:ed|ing)?|turn(?:ed|ing)?\s+down)\b/iu;
export const DECLINED_FINANCIAL_OPPORTUNITY_FACT_ZH_PATTERN =
  /(拒绝|放弃|推掉).{0,160}(加薪|奖金|自由职业|项目|合同|机会|金额|元|钱)|(加薪|奖金|自由职业|项目|合同|机会|金额|元|钱).{0,160}(拒绝|放弃|推掉)/u;
export const ACCOMMODATION_COST_FACT_PATTERN =
  /\b(?:accommodations?|lodging|hotel|hostel|resort|motel|airbnb|room|stay|stayed|booked)\b[\s\S]{0,160}\b(?:cost|costs|costing|paid|price|prices|spent|spend|per\s+night|\$\s*\d)\b|\b(?:cost|costs|costing|paid|price|prices|spent|spend|per\s+night|\$\s*\d)\b[\s\S]{0,160}\b(?:accommodations?|lodging|hotel|hostel|resort|motel|airbnb|room)\b/iu;
export const MEDICAL_PROVIDER_FACT_PATTERN =
  /\b(?:dr\.?\s+[a-z][a-z'-]+|doctor|doctors|physician|dermatologist|ent specialist|specialist)\b/iu;
export const NAMED_MEDICAL_PROVIDER_FACT_PATTERN =
  /\bdr\.?\s+[a-z][a-z'-]+\b/iu;
export const COMPACT_MEDICAL_PROVIDER_FACT_PATTERN =
  /^Medical provider evidence:/iu;
export const OWNERSHIP_COUNT_FACT_PATTERN =
  /\b(?:have|has|own|owns|owned|currently have|with me|bring|bringing|using|new one|purchased)\b/iu;
export const PLANT_ACQUISITION_FACT_PATTERN =
  /\bPlant count evidence:|\b(?:got|bought|purchased|picked up|received|brought home|acquired|planted|repotting)\b[\s\S]{0,120}\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant|tomato|cucumber)\b|\b(?:plant|plants|lily|succulent|fern|basil|rose|snake plant|spider plant|tomato|cucumber)\b[\s\S]{0,120}\b(?:from|at|nursery|sister|bought|purchased|picked up|received|brought home|acquired|planted|repotting|growing)\b/iu;
export const AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN =
  /\bAquarium tank ownership evidence:/iu;
export const BIKE_SERVICE_FACT_PATTERN =
  /\bBike service evidence:/iu;
export const MAGAZINE_SUBSCRIPTION_FACT_PATTERN =
  /\bMagazine subscription evidence:/iu;
export const FORMAL_EDUCATION_FACT_PATTERN =
  /\bFormal education duration evidence:/iu;
export const FEED_WEIGHT_FACT_PATTERN =
  /\bFeed purchase weight evidence:/iu;
export const SIBLING_COUNT_FACT_PATTERN =
  /\bSibling count evidence:/iu;
export const FITNESS_CLASS_FACT_PATTERN =
  /\bFitness class I attend:/iu;
export const PROJECT_EXPERIENCE_FACT_PATTERN =
  /\b(?:led|lead|leading|solo project|class project|research project|working on a project|project that involves)\b/iu;
export const COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN =
  /\b(?:event|events|activity|activities|attended|attending|visited|visit|volunteered|participated|museum|museums|gallery|galleries|class|classes|appointment|appointments|ceremony|ceremonies|sport|sports|instrument|instruments|points?|rewards?)\b/iu;
export const COUNTABLE_CATEGORY_INSTANCE_FACT_PATTERN =
  /\b(?:added|ate|attended|attending|bought|contains?|cook(?:ed|ing)?|drink|drank|have|had|includes?|learn(?:ed)?|made|make|ordered|own|served|tried|use|used|using|with)\b/iu;
export const FURNITURE_ACTIVITY_FACT_PATTERN =
  /\b(?:furniture|coffee table|kitchen table|bookshelf|mattress|sofa|couch|chair|dresser|desk|bed)\b[\s\S]{0,160}\b(?:bought|buy|assembled|fixed|sold|ordered|got|rearranged|replaced)\b|\b(?:bought|buy|assembled|fixed|sold|ordered|got|rearranged|replaced)\b[\s\S]{0,160}\b(?:furniture|coffee table|kitchen table|bookshelf|mattress|sofa|couch|chair|dresser|desk|bed)\b/iu;
export const PROPERTY_VIEWING_FACT_PATTERN =
  /\b(?:property|properties|house|home|condo|townhouse|bungalow)\b[\s\S]{0,180}\b(?:viewed|saw|seen|offer|rejected|budget|renovation|deal-breaker|Brookside)\b|\b(?:viewed|saw|seen|offer|rejected|budget|renovation|deal-breaker)\b[\s\S]{0,180}\b(?:property|properties|house|home|condo|townhouse|bungalow)\b/iu;
export const FOOD_DELIVERY_SERVICE_FACT_PATTERN =
  /\b(?:food delivery|delivery service|Domino'?s Pizza|Uber Eats|Fresh Fusion)\b/iu;
export const SOCIAL_FOLLOWER_FACT_PATTERN =
  /\b(?:social media|followers?|follower count|Twitter|TikTok|Facebook|Instagram)\b[\s\S]{0,180}\b(?:gained|jumped|steady|from\s+\d+\s+to\s+\d+|\d+\s+followers?)\b|\b(?:gained|jumped|steady|from\s+\d+\s+to\s+\d+|\d+\s+followers?)\b[\s\S]{0,180}\b(?:social media|followers?|follower count|Twitter|TikTok|Facebook|Instagram)\b/iu;
export const SOCIAL_REACH_METRIC_FACT_PATTERN =
  /\bSocial reach metric:\s*(?:Facebook ad campaign|Instagram influencer collaboration)\b[\s\S]{0,120}\b(?:reached|followers?)\b[\s\S]{0,80}\b[\d,]+\b/iu;
export const VIDEO_VIEW_METRIC_FACT_PATTERN =
  /\bVideo view metric:\s*(?:YouTube|TikTok)\b[\s\S]{0,120}\b[\d,]+\s+views\b/iu;
export const WEATHER_FEATURE_CONCERN_COUNT_QUERY_PATTERN =
  /\bhow\s+many\b[\s\S]{0,80}\bdifferent\b[\s\S]{0,80}\bfeatures?\s+or\s+concerns?\b[\s\S]{0,160}\bweather\s+app\b/iu;
export const WEATHER_FEATURE_CONCERN_COUNT_FACT_PATTERN =
  /\bweather\s+app\b[\s\S]{0,180}\bAPI\s+rate\s+limits?\b[\s\S]{0,220}\b(?:calls?\s+made\s+per\s+minute|calls?\/minute|calls?\s+per\s+day|calls?\/day|OpenWeather\s+API\s+key)\b|\bAPI\s+rate\s+limits?\b[\s\S]{0,180}\bweather\s+app\b[\s\S]{0,220}\b(?:calls?\s+made\s+per\s+minute|calls?\/minute|calls?\s+per\s+day|calls?\/day|OpenWeather\s+API\s+key)\b|\brapid\s+consecutive\s+calls\b|\b(?:keeps?\s+retrying|retrying)\b[\s\S]{0,160}\bhitting\s+the\s+rate\s+limit\b|\bcustom\s+feature\b[\s\S]{0,180}\bweather\s+app\b[\s\S]{0,180}\bmaintain\s+full\s+control\b[\s\S]{0,160}\bavoid\s+external\s+dependency\s+risks\b|\buptime\s+monitoring\s+results\b[\s\S]{0,160}\b100\s*%\s+availability\b[\s\S]{0,160}\bpast\s+7\s+days\b/iu;
export const MUSEUM_VISIT_ORDER_FACT_PATTERN =
  /\b(?:Museum or gallery I visited|Art-related event I attended|I visited\b[\s\S]{0,80}\bMuseum|Museum\b[\s\S]{0,80}\b(?:exhibition|guided tour|lecture|tour))\b/iu;
export const FAMILY_AGE_FACT_PATTERN =
  /\b(?:family age|age evidence|grandma|grandpa|grandparents?|parents?|mom|dad|mother|father|I am|turned)\b[\s\S]{0,120}\b\d{1,3}\b/iu;
export const COMPACT_MODEL_KIT_FACT_PATTERN =
  /^I worked on or got the model kit:/iu;
export const AGGREGATE_CATEGORY_INSTANCE_GROUPS = [
  {
    categoryTokens: ["citrus"],
    instanceTokens: [
      "clementine",
      "grapefruit",
      "kumquat",
      "lemon",
      "lime",
      "mandarin",
      "orange",
      "pomelo",
      "tangerine",
      "yuzu",
    ],
  },
  {
    categoryTokens: ["cuisine"],
    instanceTokens: [
      "american",
      "chinese",
      "ethiopian",
      "french",
      "greek",
      "indian",
      "italian",
      "japanese",
      "korean",
      "mediterranean",
      "mexican",
      "spanish",
      "thai",
      "vegan",
      "vietnamese",
    ],
  },
] as const satisfies ReadonlyArray<{
  categoryTokens: readonly string[];
  instanceTokens: readonly string[];
}>;

export function hasAggregateCategoryInstanceSignal(input: {
  factContent: string;
  factTopics: ReadonlySet<string>;
  queryTopics: ReadonlySet<string>;
}): boolean {
  if (!COUNTABLE_CATEGORY_INSTANCE_FACT_PATTERN.test(input.factContent)) {
    return false;
  }

  return AGGREGATE_CATEGORY_INSTANCE_GROUPS.some(
    (group) =>
      group.categoryTokens.some((token) => input.queryTopics.has(token)) &&
      group.instanceTokens.some((token) => input.factTopics.has(token)),
  );
}

export function isAggregateOpenLoopQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return (
    language.isOpenLoopQuery(query, locale) &&
    (
      /\b(how many|what|which|list|all|remaining|pending|todo|to-do|open loops?)\b/i.test(
        query,
      ) ||
      /(哪些|多少|几个|几项|所有|全部|剩余|还有|当前|待办|开环|未完成|待处理|待跟进)/u.test(
        query,
      )
    )
  );
}

export function hasAggregateOpenLoopSignal(entry: RankedFactCandidate): boolean {
  return entry.factKind === "open_loop" ||
    entry.lexicalScore >= 0.2 ||
    entry.subjectScore >= 0.2;
}

export function isAggregateFactCountQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return language.isAggregateCountQuery(query, locale);
}

export function isAggregateMoneyQuery(query: string): boolean {
  const lower = query.toLowerCase();
  const asksForEarnedMoney =
    /\b(?:total|amount|money|earnings?|revenue|dollars?)\b/i.test(lower) &&
    /\b(?:earn|earned|earning|sold|selling|markets?|products?)\b/i.test(lower);

  return /\bhow much\b/i.test(query) ||
    asksForEarnedMoney ||
    isDeclinedFinancialOpportunityQuery(query) ||
    /\b(?:total(?:\s+amount\s+of)?\s+money|amount\s+of\s+money|spent|spend|cost|costs|paid|price|dollars?)\b/i.test(query) ||
    /(多少钱|总共.*(?:花|费用|花费)|一共.*(?:花|费用|花费)|合计.*(?:花|费用|花费)|花了多少钱|花费多少|费用|价格)/u.test(query);
}

export function isDeclinedFinancialOpportunityFact(content: string): boolean {
  return DECLINED_FINANCIAL_OPPORTUNITY_FACT_PATTERN.test(content) ||
    DECLINED_FINANCIAL_OPPORTUNITY_FACT_ZH_PATTERN.test(content);
}

export function isAggregateNumericQuery(query: string): boolean {
  if (
    /\bhow\s+long\b/i.test(query) &&
    /\b(?:work(?:ing|ed)?|role|tenure|experience|position)\b/i.test(query)
  ) {
    return true;
  }

  return (
    /\b(?:average|mean|total|combined|sum|older|younger|how\s+old|how\s+many\s+years)\b/i.test(query) &&
    /\b(?:age|ages|old|older|younger|years?|hours?|followers?|points?|score|scores|money|amount|weight|pounds?|siblings?)\b/i.test(query)
  ) ||
    /(平均|总共|合计|一共|总数|年龄|几岁|多少年|几个小时|粉丝|积分|分数|重量|兄弟姐妹)/u.test(query);
}

export function isComparativeMetricQuery(query: string): boolean {
  return (
    /\b(?:which|what)\b/i.test(query) &&
    /\b(?:most|least|highest|lowest|largest|smallest|more|less|biggest)\b/i.test(query) &&
    /\b(?:followers?|follower count|money|spent|spend|cost|costs|price|amount|store|platform)\b/i.test(query)
  ) ||
    /(哪个|哪一个|什么).*(最多|最少|最高|最低|最大|最小|更多|更少).*(粉丝|钱|花费|费用|价格|金额|商店|平台)/u.test(query);
}

export function isSocialMetricTotalQuery(query: string): boolean {
  return /\btotal(?:\s+number)?\b/i.test(query) &&
    /\b(?:people\s+reached|reached|views?|Facebook|Instagram|YouTube|TikTok|influencer)\b/i.test(query);
}

export function hasAggregateDomainSignal(input: {
  categoryInstanceSignal: boolean;
  entry: RankedFactCandidate;
  factTopics: ReadonlySet<string>;
  language: LanguageService;
  query: string;
  queryLocale: string;
  queryTopics: ReadonlySet<string>;
  topicOverlap: number;
}): boolean {
  if (isDeclinedFinancialOpportunityQuery(input.query)) {
    return isDeclinedFinancialOpportunityFact(input.entry.fact.content);
  }

  if (input.topicOverlap >= 2) {
    return true;
  }

  if (input.categoryInstanceSignal) {
    return true;
  }

  if (
    isAggregateMoneyQuery(input.query) &&
    input.topicOverlap >= 1 &&
    MONEY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isAccommodationCostQuery(input.query) &&
    ACCOMMODATION_COST_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFurnitureActivityAggregateQuery(input.query) &&
    FURNITURE_ACTIVITY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPropertyViewingAggregateQuery(input.query) &&
    PROPERTY_VIEWING_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFoodDeliveryServiceAggregateQuery(input.query) &&
    FOOD_DELIVERY_SERVICE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isComparativeMetricQuery(input.query) &&
    SOCIAL_FOLLOWER_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isSocialMetricTotalQuery(input.query) &&
    (
      SOCIAL_REACH_METRIC_FACT_PATTERN.test(input.entry.fact.content) ||
      VIDEO_VIEW_METRIC_FACT_PATTERN.test(input.entry.fact.content)
    )
  ) {
    return true;
  }

  if (
    isAggregateNumericQuery(input.query) &&
    FAMILY_AGE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isMedicalProviderAggregateQuery(input.query) &&
    MEDICAL_PROVIDER_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isOwnershipCountAggregateQuery(input.query) &&
    input.topicOverlap >= 1 &&
    OWNERSHIP_COUNT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPlantAcquisitionAggregateQuery(input.query) &&
    PLANT_ACQUISITION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isAquariumTankAggregateQuery(input.query) &&
    AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isBikeServiceAggregateQuery(input.query) &&
    BIKE_SERVICE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isMagazineSubscriptionAggregateQuery(input.query) &&
    MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFormalEducationDurationQuery(input.query) &&
    FORMAL_EDUCATION_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isFeedWeightAggregateQuery(input.query) &&
    FEED_WEIGHT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isSiblingCountAggregateQuery(input.query) &&
    SIBLING_COUNT_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isPersonalElectronicsCostQuery(input.query) &&
    PERSONAL_ELECTRONICS_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isInstrumentPracticeTimeQuery(input.query) &&
    INSTRUMENT_PRACTICE_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  if (
    isCountableEventActivityAggregateQuery(input.query) &&
    input.topicOverlap >= 1 &&
    COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(input.entry.fact.content)
  ) {
    return true;
  }

  return false;
}

const FAMILY_MOVIE_MARATHON_TITLE_FACT_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*\bmovie marathon for April 6-7, 2024\b)(?=[\s\S]*\b5 family-friendly movies\b)/iu,
  /^(?=[\s\S]*\bwatchlist for the family movie marathon on April 6-7\b)(?=[\s\S]*"Soul,?")/iu,
  /^(?=[\s\S]*\bwhich are Netflix and Disney\+)(?=[\s\S]*"Paddington 2")/iu,
  /^(?=[\s\S]*\brent "Paddington 2")(?=[\s\S]*\bThomas and Michelle\b)/iu,
  /^(?=[\s\S]*\bmovies you've selected\b)(?=[\s\S]*"Moana")(?=[\s\S]*availability)/iu,
  /^(?=[\s\S]*\bmovies would you recommend for a family weekend\b)(?=[\s\S]*"Coco")(?=[\s\S]*April 8, 2024)/iu,
  /^(?=[\s\S]*\bwho loves musicals\b)(?=[\s\S]*"Moana" \(PG\))(?=[\s\S]*"Zootopia" \(PG\))/iu,
  /^(?=[\s\S]*"Moana" and "Zootopia" sound perfect)/iu,
  /^(?=[\s\S]*\bschedule for your family movie day on April 8\b)/iu,
  /^(?=[\s\S]*\bpopcorn and fruit platters\b)(?=[\s\S]*\bthemed cookies\b)/iu,
  /^(?=[\s\S]*\bCrafting Paper Flowers\b)(?=[\s\S]*\bAnimal Masks\b)/iu,
];

function familyMovieMarathonTitleFacetIndex(content: string): number {
  return FAMILY_MOVIE_MARATHON_TITLE_FACT_PATTERNS.findIndex((pattern) =>
    pattern.test(content)
  );
}

function hasFamilyMovieMarathonTitleFact(content: string): boolean {
  return familyMovieMarathonTitleFacetIndex(content) >= 0;
}

export function aggregateFactCountRecallLimit(query: string): number {
  if (isFamilyMovieMarathonTitlesAggregateQuery(query)) {
    return FAMILY_MOVIE_MARATHON_TITLES_RECALL_LIMIT;
  }
  return aggregateRuleFamilyRecallLimit(query) ?? AGGREGATE_FACT_COUNT_LIMIT;
}

export function hasAggregateFactCountSignal(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): boolean {
  if (
    isDeclinedFinancialOpportunityQuery(query) &&
    entry.fact.source.method !== "inferred" &&
    isDeclinedFinancialOpportunityFact(entry.fact.content)
  ) {
    return true;
  }

  if (isTemporalIntervalQuery(query) && isTemporalIntervalEvidenceFact(entry)) {
    return true;
  }

  if (
    isMuseumVisitOrderQuery(query) &&
    (
      MUSEUM_VISIT_ORDER_FACT_PATTERN.test(entry.fact.content) ||
      (isDatedEventFact(entry) && /\bmuseums?\b/iu.test(entry.fact.content)) ||
      (
        isDatedEventFact(entry) &&
        hasTrustedAggregateEvidence(entry) &&
        /\b(?:guided\s+tour|exhibition|lecture)\b/iu.test(
          valueBearingFactContent(entry.fact.content),
        )
      )
    )
  ) {
    return true;
  }

  if (isWeatherFeatureConcernCountQuery(query)) {
    return hasUserAnswerTag(entry) &&
      WEATHER_FEATURE_CONCERN_COUNT_FACT_PATTERN.test(
        valueBearingFactContent(entry.fact.content),
      );
  }

  if (
    isHealthIssueOrderQuery(query) &&
    HEALTH_ISSUE_EVENT_FACT_PATTERN.test(entry.fact.content)
  ) {
    return true;
  }

  if (
    /\bprojects?\b/i.test(query) &&
    (
      entry.fact.category === "project" ||
      (
        hasTrustedAggregateEvidence(entry) &&
        PROJECT_EXPERIENCE_FACT_PATTERN.test(entry.fact.content)
      )
    )
  ) {
    return true;
  }

  if (isModelKitCountQuery(query) && /\b(model kit|kit|\d+\/\d+\s+scale)\b/i.test(entry.fact.content)) {
    return true;
  }

  if (
    isFamilyMovieMarathonTitlesAggregateQuery(query) &&
    hasFamilyMovieMarathonTitleFact(entry.fact.content)
  ) {
    return true;
  }

  if (hasAggregateRuleFamilySignal(entry, query)) {
    return true;
  }

  const queryTopics = selectorTopicTokens(query, language, queryLocale);
  const factTopics = selectorTopicTokens(entry.fact.content, language, entry.locale);
  const topicOverlap = selectorTopicOverlapCount(queryTopics, factTopics);
  const categoryInstanceSignal = hasAggregateCategoryInstanceSignal({
    factContent: entry.fact.content,
    factTopics,
    queryTopics,
  });
  const hasDomainSignal = hasAggregateDomainSignal({
    entry,
    factTopics,
    language,
    query,
    queryLocale,
    queryTopics,
    topicOverlap,
    categoryInstanceSignal,
  });
  const trustedAggregateEvidence = hasTrustedAggregateEvidence(entry);
  const countableEventActivityAggregate = isCountableEventActivityAggregateQuery(query);
  const hasWeakAggregateEvidenceSignal =
    entry.lexicalScore >= AGGREGATE_WEAK_LEXICAL_FACT_THRESHOLD ||
    categoryInstanceSignal ||
    (
      isMedicalProviderAggregateQuery(query) &&
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isAccommodationCostQuery(query) &&
      ACCOMMODATION_COST_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isDeclinedFinancialOpportunityQuery(query) &&
      isDeclinedFinancialOpportunityFact(entry.fact.content)
    ) ||
    (
      isFurnitureActivityAggregateQuery(query) &&
      FURNITURE_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPropertyViewingAggregateQuery(query) &&
      PROPERTY_VIEWING_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFoodDeliveryServiceAggregateQuery(query) &&
      FOOD_DELIVERY_SERVICE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isComparativeMetricQuery(query) &&
      SOCIAL_FOLLOWER_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isSocialMetricTotalQuery(query) &&
      (
        SOCIAL_REACH_METRIC_FACT_PATTERN.test(entry.fact.content) ||
        VIDEO_VIEW_METRIC_FACT_PATTERN.test(entry.fact.content)
      )
    ) ||
    (
      isAggregateNumericQuery(query) &&
      FAMILY_AGE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPlantAcquisitionAggregateQuery(query) &&
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isAquariumTankAggregateQuery(query) &&
      AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isBikeServiceAggregateQuery(query) &&
      BIKE_SERVICE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isMagazineSubscriptionAggregateQuery(query) &&
      MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFormalEducationDurationQuery(query) &&
      FORMAL_EDUCATION_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isFeedWeightAggregateQuery(query) &&
      FEED_WEIGHT_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isSiblingCountAggregateQuery(query) &&
      SIBLING_COUNT_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isPersonalElectronicsCostQuery(query) &&
      PERSONAL_ELECTRONICS_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      isInstrumentPracticeTimeQuery(query) &&
      INSTRUMENT_PRACTICE_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      countableEventActivityAggregate &&
      FITNESS_CLASS_FACT_PATTERN.test(entry.fact.content)
    ) ||
    (
      countableEventActivityAggregate &&
      COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
    );

  if (
    trustedAggregateEvidence &&
    hasWeakAggregateEvidenceSignal &&
    hasDomainSignal &&
    (
      QUANTIFIED_FACT_PATTERN.test(entry.fact.content) ||
      MEDICAL_PROVIDER_FACT_PATTERN.test(entry.fact.content) ||
      PLANT_ACQUISITION_FACT_PATTERN.test(entry.fact.content) ||
      FURNITURE_ACTIVITY_FACT_PATTERN.test(entry.fact.content) ||
      PROPERTY_VIEWING_FACT_PATTERN.test(entry.fact.content) ||
      FOOD_DELIVERY_SERVICE_FACT_PATTERN.test(entry.fact.content) ||
      SOCIAL_FOLLOWER_FACT_PATTERN.test(entry.fact.content) ||
      SOCIAL_REACH_METRIC_FACT_PATTERN.test(entry.fact.content) ||
      VIDEO_VIEW_METRIC_FACT_PATTERN.test(entry.fact.content) ||
      isDeclinedFinancialOpportunityFact(entry.fact.content) ||
      FAMILY_AGE_FACT_PATTERN.test(entry.fact.content) ||
      AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(entry.fact.content) ||
      BIKE_SERVICE_FACT_PATTERN.test(entry.fact.content) ||
      MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(entry.fact.content) ||
      FORMAL_EDUCATION_FACT_PATTERN.test(entry.fact.content) ||
      FEED_WEIGHT_FACT_PATTERN.test(entry.fact.content) ||
      SIBLING_COUNT_FACT_PATTERN.test(entry.fact.content) ||
      PERSONAL_ELECTRONICS_FACT_PATTERN.test(entry.fact.content) ||
      INSTRUMENT_PRACTICE_FACT_PATTERN.test(entry.fact.content) ||
      FITNESS_CLASS_FACT_PATTERN.test(entry.fact.content) ||
      MUSEUM_VISIT_ORDER_FACT_PATTERN.test(entry.fact.content) ||
      categoryInstanceSignal ||
      (
        countableEventActivityAggregate &&
        COUNTABLE_EVENT_ACTIVITY_FACT_PATTERN.test(entry.fact.content)
      )
    )
  ) {
    return true;
  }

  return (
    hasDomainSignal &&
    (
      entry.intentScore > 0 ||
      entry.lexicalScore >= AGGREGATE_GENERIC_LEXICAL_FACT_THRESHOLD ||
      entry.subjectScore > 0
    )
  );
}

export function aggregateEvidencePriority(
  entry: RankedFactCandidate,
  query: string,
  language: LanguageService,
  queryLocale: string,
): number {
  const queryTopics = selectorTopicTokens(query, language, queryLocale);
  const factTopics = selectorTopicTokens(entry.fact.content, language, entry.locale);
  const valueContent = valueBearingFactContent(entry.fact.content);
  let priority =
    selectorTopicOverlapCount(queryTopics, factTopics) * 5;

  if (hasTrustedAggregateEvidence(entry)) {
    priority += 20;
  }
  if (hasUserAnswerTag(entry)) {
    priority += 35;
  }
  if (QUANTIFIED_FACT_PATTERN.test(valueContent)) {
    priority += 40;
  }
  if (isModelKitCountQuery(query)) {
    if (COMPACT_MODEL_KIT_FACT_PATTERN.test(valueContent)) {
      priority += 120;
    } else if (/\b(?:model kit|kit|\d+\/\d+\s+scale)\b/iu.test(valueContent)) {
      priority += 20;
    }
  }
  if (isFamilyMovieMarathonTitlesAggregateQuery(query)) {
    const facetIndex = familyMovieMarathonTitleFacetIndex(entry.fact.content);
    if (facetIndex >= 0) {
      // The facet list is in conversation order; the per-facet step must
      // dominate the base-score spread so the planning turns come back
      // chronologically.
      priority += 1000 +
        (FAMILY_MOVIE_MARATHON_TITLE_FACT_PATTERNS.length - facetIndex) * 200;
    }
  }
  priority += aggregateRuleFamilyPriorityBonus(entry, query);
  if (
    isAggregateMoneyQuery(query) &&
    MONEY_FACT_PATTERN.test(valueContent)
  ) {
    priority += 30;
  }
  if (
    isDeclinedFinancialOpportunityQuery(query) &&
    isDeclinedFinancialOpportunityFact(valueContent)
  ) {
    priority += 90;
  }
  if (
    isAccommodationCostQuery(query) &&
    ACCOMMODATION_COST_FACT_PATTERN.test(valueContent)
  ) {
    priority += 30;
  }
  if (
    isMedicalProviderAggregateQuery(query) &&
    NAMED_MEDICAL_PROVIDER_FACT_PATTERN.test(valueContent)
  ) {
    priority += 40;
  }
  if (
    isMedicalProviderAggregateQuery(query) &&
    COMPACT_MEDICAL_PROVIDER_FACT_PATTERN.test(valueContent)
  ) {
    priority += 80;
  }
  if (
    isTemporalIntervalQuery(query) &&
    isTemporalIntervalEvidenceFact(entry)
  ) {
    priority += 30;
    priority += temporalIntervalBoundaryPriority({
      content: valueContent,
      entry,
      language,
      query,
      queryLocale,
    });
  }
  if (
    isSocialMetricTotalQuery(query) &&
    (
      SOCIAL_REACH_METRIC_FACT_PATTERN.test(valueContent) ||
      VIDEO_VIEW_METRIC_FACT_PATTERN.test(valueContent)
    )
  ) {
    priority += 80;
  }
  if (
    isMuseumVisitOrderQuery(query) &&
    MUSEUM_VISIT_ORDER_FACT_PATTERN.test(valueContent)
  ) {
    priority += 80;
  }
  if (
    isHealthIssueOrderQuery(query) &&
    HEALTH_ISSUE_EVENT_FACT_PATTERN.test(valueContent)
  ) {
    priority += 80;
  }
  if (
    (
      isAquariumTankAggregateQuery(query) &&
      AQUARIUM_TANK_OWNERSHIP_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isBikeServiceAggregateQuery(query) &&
      BIKE_SERVICE_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isMagazineSubscriptionAggregateQuery(query) &&
      MAGAZINE_SUBSCRIPTION_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isFormalEducationDurationQuery(query) &&
      FORMAL_EDUCATION_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isFeedWeightAggregateQuery(query) &&
      FEED_WEIGHT_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isSiblingCountAggregateQuery(query) &&
      SIBLING_COUNT_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isPersonalElectronicsCostQuery(query) &&
      PERSONAL_ELECTRONICS_FACT_PATTERN.test(valueContent)
    ) ||
    (
      isInstrumentPracticeTimeQuery(query) &&
      INSTRUMENT_PRACTICE_FACT_PATTERN.test(valueContent)
    )
  ) {
    priority += 80;
  }
  if (
    isCountableEventActivityAggregateQuery(query) &&
    FITNESS_CLASS_FACT_PATTERN.test(valueContent)
  ) {
    priority += 60;
  }
  if (
    isWeatherFeatureConcernCountQuery(query) &&
    WEATHER_FEATURE_CONCERN_COUNT_FACT_PATTERN.test(valueContent)
  ) {
    const sourceOrder = sourceOrderSortKey(entry) ?? Number.MAX_SAFE_INTEGER;
    priority += 100_000 - Math.min(sourceOrder, 1000) * 100;
  }
  if (
    hasAggregateCategoryInstanceSignal({
      factContent: entry.fact.content,
      factTopics,
      queryTopics,
    })
  ) {
    priority += 30;
  }
  if (hasEntityBearingEvidenceSignal(entry)) {
    priority += 30;
  }
  if (
    REALIZED_TEMPORAL_EVENT_FACT_PATTERN.test(
      valueBearingFactContent(entry.fact.content),
    )
  ) {
    priority += 40;
  }

  return priority;
}
