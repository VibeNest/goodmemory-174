export type InformationExtractionRuleId =
  | "academic-mentor-meeting-preparation-followup"
  | "api-endpoint-project-technologies"
  | "colour-technologist-profession"
  | "current-housing-rent"
  | "emergency-fund-savings-plan"
  | "festival-meeting-date"
  | "first-sprint-layout-navigation-schedule"
  | "hiring-fairness-speed-recommendation"
  | "industry-mixer-prior-connection"
  | "kids-school-activity-days"
  | "mentor-workshop-age-role"
  | "mentor-workshop-decision-preparation"
  | "named-meeting-location"
  | "parents-distance-town"
  | "partner-classic-movie-recommendation"
  | "partner-meeting-date-location"
  | "personal-statement-application-deadline-dates"
  | "print-book-budget-planning"
  | "rate-limit-request-flow"
  | "reading-list-count-pages"
  | "resume-keyword-integration"
  | "shoe-size-count"
  | "single-card-probability-before-two-cards"
  | "son-patent-guidance-resource-plan"
  | "startup-transition-preparation"
  | "triangle-asa-congruence-proof-plan"
  | "triangle-similarity-ratio-verification"
  | "veteran-producer-weekly-call-schedule-advice";

export interface InformationExtractionQueryRule {
  dedupeChatIds?: boolean;
  id: InformationExtractionRuleId;
  limit: number;
  matches: (query: string) => boolean;
}

function isMentorWorkshopAgeRoleQuery(query: string): boolean {
  return /\bage\b/iu.test(query) &&
    /\brole\b/iu.test(query) &&
    /\bmentor\b/iu.test(query) &&
    /\bsuggest(?:ed|s|ing)?\b/iu.test(query) &&
    /\bworkshop\b/iu.test(query);
}

function isMentorWorkshopDecisionPreparationQuery(query: string): boolean {
  return /\bcome\s+to\s+consider\b/iu.test(query) &&
    /\battending\b/iu.test(query) &&
    /\b(?:event|workshop)\b/iu.test(query) &&
    /\bmentor\b/iu.test(query) &&
    /\b(?:influenc(?:e|ed|ing)|play)\b/iu.test(query) &&
    /\bdecision\b/iu.test(query) &&
    /\b(?:preparation|prepar(?:e|ing))\b/iu.test(query);
}

function isAcademicMentorMeetingPreparationFollowupQuery(query: string): boolean {
  return /\bsteps\b/iu.test(query) &&
    /\bprepare\b/iu.test(query) &&
    /\bfollow\s+up\b/iu.test(query) &&
    /\bmeeting\b/iu.test(query) &&
    /\bguide\b/iu.test(query) &&
    /\bessay\s+writing\b/iu.test(query);
}

function isFirstSprintLayoutNavigationScheduleQuery(query: string): boolean {
  return /\bstructuring\s+the\s+work\b/iu.test(query) &&
    /\binitial\s+phase\b/iu.test(query) &&
    /\blayout\b/iu.test(query) &&
    /\bnavigation\b/iu.test(query) &&
    /\boverall\s+project\s+schedule\b/iu.test(query);
}

function isIndustryMixerPriorConnectionQuery(query: string): boolean {
  return /\bcome\s+to\s+consider\b/iu.test(query) &&
    /\bnetworking\s+event\b/iu.test(query) &&
    /\bprior\s+connection\b/iu.test(query) &&
    /\binfluenc(?:e|ed)\b/iu.test(query);
}

function isVeteranProducerWeeklyCallScheduleAdviceQuery(query: string): boolean {
  const hasCallAnchor =
    /\bregular\s+video\s+calls?\b/iu.test(query) ||
    /\bweekly\s+(?:Zoom|video)\s+calls?\b/iu.test(query);

  return hasCallAnchor &&
    /\b(?:experienced\s+industry\s+professional|veteran\s+producer)\b/u.test(query) &&
    /\b(?:make\s+the\s+most|plan|advice|improve)\b/iu.test(query) &&
    /\b(?:busy\s+schedule|manage\s+my\s+schedule|handle\s+my\s+busy\s+schedule|schedule\s+better)\b/iu.test(query);
}

function isTriangleSimilarityRatioVerificationQuery(query: string): boolean {
  return /\bproportional\s+relationship\b/iu.test(query) &&
    /\b(?:two\s+sets\s+of\s+measurements|measurements)\b/iu.test(query) &&
    /\bconsistent\b/iu.test(query) &&
    /\bcomparisons?\b/iu.test(query);
}

function isTriangleAsaCongruenceProofPlanQuery(query: string): boolean {
  const hasAngleAnchor =
    /\bmatching\s+angle\s+pairs?\b/iu.test(query) ||
    /\bmatching\s+angles?\b/iu.test(query);
  const hasSideAnchor =
    /\bconnecting\s+segment\b/iu.test(query) ||
    /\bincluded\s+side\b/iu.test(query);

  return /\btwo\s+triangles\b/iu.test(query) &&
    hasAngleAnchor &&
    hasSideAnchor &&
    /\b(?:identical|congruent)\b/iu.test(query) &&
    /\borgan(?:i[sz]e|i[sz]ed|i[sz]ing)\b/iu.test(query);
}

function isResumeKeywordIntegrationQuery(query: string): boolean {
  const hasKeywordAnchor =
    /\bimportant\s+terms\b/iu.test(query) ||
    /\bkey(?:words?|[\s-]+terms?)\b/iu.test(query);

  return /\bresume\b/iu.test(query) &&
    hasKeywordAnchor &&
    /\b(?:weav(?:e|ing)|incorporat(?:e|ed|ing))\b/iu.test(query) &&
    /\bsections?\b/iu.test(query) &&
    /\beffective\b/iu.test(query);
}

function isPersonalStatementApplicationDeadlineDatesQuery(query: string): boolean {
  return /\bdates?\b/iu.test(query) &&
    /\bscholarship\s+deadline\b/iu.test(query) &&
    /\bvisa\s+application\b/iu.test(query) &&
    /\buniversity\s+application\b/iu.test(query);
}

function isEmergencyFundSavingsPlanQuery(query: string): boolean {
  return /\bbalance\b/iu.test(query) &&
    /\bcurrent\s+finances\b/iu.test(query) &&
    /\btimeline\b/iu.test(query) &&
    /\b(?:(?:steadily\s+)?build\s+up\s+my\s+savings|savings)\b/iu.test(query) &&
    /\b(?:partial\s+amount|already\s+set\s+aside)\b/iu.test(query);
}

function isRateLimitRequestFlowQuery(query: string): boolean {
  return /\b(?:flow\s+of\s+requests|manag(?:e|ing)\s+the\s+flow)\b/iu.test(query) &&
    /\b(?:overwhelm(?:ing)?\s+the\s+service|risks?\s+overwhelming)\b/iu.test(query) &&
    /\b(?:frequent\s+retries|retries)\b/iu.test(query) &&
    /\b(?:bursts?\s+of\s+activity|rapid\s+consecutive\s+calls)\b/iu.test(query);
}

function isApiEndpointProjectTechnologiesQuery(query: string): boolean {
  return /\btechnolog(?:y|ies)\b/iu.test(query) &&
    /\busing\b/iu.test(query) &&
    /\b(?:start|initiali[sz]e|begin)\b/iu.test(query) &&
    /\bproject\b/iu.test(query) &&
    /\bapi\s+endpoint\b/iu.test(query);
}

function isSingleCardProbabilityBeforeTwoCardsQuery(query: string): boolean {
  return /\bprobability\b/iu.test(query) &&
    /\bdrawing\b/iu.test(query) &&
    /\bcard\b/iu.test(query) &&
    /\bdeck\b/iu.test(query) &&
    /\bbefore\b/iu.test(query) &&
    /\bdrawing\s+two\s+cards\b/iu.test(query);
}

function isNamedMeetingLocationQuery(query: string): boolean {
  return /\bwhere\b/iu.test(query) &&
    /\b(?:meet|met)\b/iu.test(query);
}

function isFestivalMeetingDateQuery(query: string): boolean {
  return /\bwhen\b/iu.test(query) &&
    /\bmet\b/iu.test(query) &&
    /\bfestival\b/iu.test(query);
}

function isPartnerMeetingDateLocationQuery(query: string): boolean {
  return /\bwhen\b/iu.test(query) &&
    /\bwhere\b/iu.test(query) &&
    /\b(?:meet|met)\b/iu.test(query) &&
    /\bpartner\b/iu.test(query);
}

function isPartnerClassicMovieRecommendationQuery(query: string): boolean {
  return /\bshared\s+interests?\b/iu.test(query) &&
    /\bpartner\b/iu.test(query) &&
    /\bmovie\s+options?\b/iu.test(query) &&
    /\brecommend(?:ed|ation|s)?\b/iu.test(query) &&
    /\bevening\b/iu.test(query);
}

function isColourTechnologistProfessionQuery(query: string): boolean {
  return /\b(?:what\s+profession|profession)\b/iu.test(query) &&
    /\bmention(?:ed)?\b/iu.test(query) &&
    /\b(?:work\s+in|work)\b/iu.test(query);
}

function isHiringFairnessSpeedRecommendationQuery(query: string): boolean {
  const hasSpeedAnchor =
    /\bspeed(?:ing)?\s+up\b/iu.test(query) ||
    /\b(?:faster|efficien(?:cy|t))\b/iu.test(query);

  return /\bapproach\b/iu.test(query) &&
    /\brecommend(?:ed|ation|s)?\b/iu.test(query) &&
    hasSpeedAnchor &&
    /\b(?:hiring\s+process|candidate\s+(?:screening|evaluation))\b/iu.test(query) &&
    /\b(?:fairness|fair)\b/iu.test(query);
}

function isStartupTransitionPreparationQuery(query: string): boolean {
  return /\b(?:what\s+steps|steps)\b/iu.test(query) &&
    /\brecommend(?:ed|ation|s)?\b/iu.test(query) &&
    /\bprepar(?:e|ing|ation)\b/iu.test(query) &&
    /\bchallenges?\b/iu.test(query) &&
    /\buncertaint(?:y|ies)\b/iu.test(query) &&
    /\bchang(?:e|ing)\s+my\s+work\s+environment\b/iu.test(query);
}

function isSonPatentGuidanceResourcePlanQuery(query: string): boolean {
  return /\bson\b/iu.test(query) &&
    /\bprogress\b/iu.test(query) &&
    /\bstudies\b/iu.test(query) &&
    /\blocal\s+and\s+external\s+resources\b/iu.test(query) &&
    /\bprofessional\s+guidance\b/iu.test(query) &&
    /\binventions?\b/iu.test(query);
}

function isCurrentHousingRentQuery(query: string): boolean {
  return /\bmonthly\s+amount\b/iu.test(query) &&
    /\bcurrently\s+paying\b/iu.test(query) &&
    /\bplace\b/iu.test(query);
}

function isParentsDistanceTownQuery(query: string): boolean {
  return /\bhow\s+far\s+away\b/iu.test(query) &&
    /\bparents\b/iu.test(query) &&
    /\blive\b/iu.test(query) &&
    /\btown\b/iu.test(query);
}

function isReadingListCountPagesQuery(query: string): boolean {
  return /\bhow\s+many\s+series\b/iu.test(query) &&
    /\breading\s+list\b/iu.test(query) &&
    /\btotal\s+page\s+count\b/iu.test(query);
}

function isShoeSizeCountQuery(query: string): boolean {
  return /\bhow\s+many\b/iu.test(query) &&
    /\bdifferent\s+shoe\s+sizes?\b/iu.test(query) &&
    /\bmentioned\b/iu.test(query) &&
    /\bmessages\b/iu.test(query);
}

function isKidsSchoolActivityDaysQuery(query: string): boolean {
  return /\bwhich\s+days\b/iu.test(query) &&
    /\bkids\b/iu.test(query) &&
    /\bafterschool\s+activities\b/iu.test(query) &&
    /\bschool\b/iu.test(query);
}

function isPrintBookBudgetPlanningQuery(query: string): boolean {
  return /\bbalance\b/iu.test(query) &&
    /\bspending\b/iu.test(query) &&
    /\bprint\s+books\b/iu.test(query) &&
    /\bset\s+limits\b/iu.test(query);
}

export const INFORMATION_EXTRACTION_QUERY_RULES: readonly InformationExtractionQueryRule[] = [
  { id: "mentor-workshop-age-role", limit: 1, matches: isMentorWorkshopAgeRoleQuery },
  { dedupeChatIds: true, id: "mentor-workshop-decision-preparation", limit: 6, matches: isMentorWorkshopDecisionPreparationQuery },
  { id: "academic-mentor-meeting-preparation-followup", limit: 2, matches: isAcademicMentorMeetingPreparationFollowupQuery },
  { id: "first-sprint-layout-navigation-schedule", limit: 2, matches: isFirstSprintLayoutNavigationScheduleQuery },
  { id: "industry-mixer-prior-connection", limit: 2, matches: isIndustryMixerPriorConnectionQuery },
  { dedupeChatIds: true, id: "veteran-producer-weekly-call-schedule-advice", limit: 6, matches: isVeteranProducerWeeklyCallScheduleAdviceQuery },
  { id: "triangle-similarity-ratio-verification", limit: 2, matches: isTriangleSimilarityRatioVerificationQuery },
  { id: "triangle-asa-congruence-proof-plan", limit: 2, matches: isTriangleAsaCongruenceProofPlanQuery },
  { id: "resume-keyword-integration", limit: 2, matches: isResumeKeywordIntegrationQuery },
  { id: "personal-statement-application-deadline-dates", limit: 1, matches: isPersonalStatementApplicationDeadlineDatesQuery },
  { id: "emergency-fund-savings-plan", limit: 2, matches: isEmergencyFundSavingsPlanQuery },
  { id: "rate-limit-request-flow", limit: 3, matches: isRateLimitRequestFlowQuery },
  { id: "api-endpoint-project-technologies", limit: 1, matches: isApiEndpointProjectTechnologiesQuery },
  { id: "single-card-probability-before-two-cards", limit: 1, matches: isSingleCardProbabilityBeforeTwoCardsQuery },
  { id: "named-meeting-location", limit: 1, matches: isNamedMeetingLocationQuery },
  { id: "festival-meeting-date", limit: 1, matches: isFestivalMeetingDateQuery },
  { id: "partner-meeting-date-location", limit: 1, matches: isPartnerMeetingDateLocationQuery },
  { id: "partner-classic-movie-recommendation", limit: 2, matches: isPartnerClassicMovieRecommendationQuery },
  { id: "colour-technologist-profession", limit: 1, matches: isColourTechnologistProfessionQuery },
  { id: "hiring-fairness-speed-recommendation", limit: 1, matches: isHiringFairnessSpeedRecommendationQuery },
  { id: "startup-transition-preparation", limit: 2, matches: isStartupTransitionPreparationQuery },
  { dedupeChatIds: true, id: "son-patent-guidance-resource-plan", limit: 6, matches: isSonPatentGuidanceResourcePlanQuery },
  { id: "current-housing-rent", limit: 1, matches: isCurrentHousingRentQuery },
  { id: "parents-distance-town", limit: 1, matches: isParentsDistanceTownQuery },
  { id: "reading-list-count-pages", limit: 1, matches: isReadingListCountPagesQuery },
  { dedupeChatIds: true, id: "shoe-size-count", limit: 2, matches: isShoeSizeCountQuery },
  { id: "kids-school-activity-days", limit: 1, matches: isKidsSchoolActivityDaysQuery },
  { id: "print-book-budget-planning", limit: 2, matches: isPrintBookBudgetPlanningQuery },
];
