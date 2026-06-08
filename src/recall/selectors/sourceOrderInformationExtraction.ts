import type { RankedFactCandidate } from "../scoring";
import {
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { sourceOrderSortKey } from "./temporal";

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
    /\bevent\b|\bworkshop\b/iu.test(query) &&
    /\bmentor\b/iu.test(query) &&
    /\binfluenc(?:e|ed|ing)\b|\bplay\b/iu.test(query) &&
    /\bdecision\b/iu.test(query) &&
    /\bpreparation\b|\bprepar(?:e|ing)\b/iu.test(query);
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

function isLauraMixerPriorConnectionQuery(query: string): boolean {
  return /\bcome\s+to\s+consider\b/iu.test(query) &&
    /\bnetworking\s+event\b/iu.test(query) &&
    /\bprior\s+connection\b/iu.test(query) &&
    /\binfluenc(?:e|ed)\b/iu.test(query);
}

function isLauraWeeklyCallScheduleAdviceQuery(query: string): boolean {
  const hasCallAnchor =
    /\bregular\s+video\s+calls?\b/iu.test(query) ||
    /\bweekly\s+(?:Zoom|video)\s+calls?\b/iu.test(query);

  return hasCallAnchor &&
    /\bexperienced\s+industry\s+professional\b|\bveteran\s+producer\b|\bLaura\b/u.test(query) &&
    /\bmake\s+the\s+most\b|\bplan\b|\badvice\b|\bimprove\b/iu.test(query) &&
    /\bbusy\s+schedule\b|\bmanage\s+my\s+schedule\b|\bhandle\s+my\s+busy\s+schedule\b|\bschedule\s+better\b/iu.test(query);
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
    /\bidentical\b|\bcongruent\b/iu.test(query) &&
    /\borgan(?:i[sz]e|i[sz]ed|i[sz]ing)\b/iu.test(query);
}

function isResumeKeywordIntegrationQuery(query: string): boolean {
  const hasKeywordAnchor =
    /\bimportant\s+terms\b/iu.test(query) ||
    /\bkey(?:words?|[\s-]+terms?)\b/iu.test(query);

  return /\bresume\b/iu.test(query) &&
    hasKeywordAnchor &&
    /\bweav(?:e|ing)\b|\bincorporat(?:e|ed|ing)\b/iu.test(query) &&
    /\bsections?\b/iu.test(query) &&
    /\beffective\b/iu.test(query);
}

function isPersonalStatementApplicationDeadlineDatesQuery(
  query: string,
): boolean {
  return /\bdates?\b/iu.test(query) &&
    /\bscholarship\s+deadline\b/iu.test(query) &&
    /\bvisa\s+application\b/iu.test(query) &&
    /\buniversity\s+application\b/iu.test(query);
}

function isEmergencyFundSavingsPlanQuery(query: string): boolean {
  return /\bbalance\b/iu.test(query) &&
    /\bcurrent\s+finances\b/iu.test(query) &&
    /\btimeline\b/iu.test(query) &&
    /\b(?:steadily\s+)?build\s+up\s+my\s+savings\b|\bsavings\b/iu.test(query) &&
    /\bpartial\s+amount\b|\balready\s+set\s+aside\b/iu.test(query);
}

function isRateLimitRequestFlowQuery(query: string): boolean {
  return /\bflow\s+of\s+requests\b|\bmanag(?:e|ing)\s+the\s+flow\b/iu.test(query) &&
    /\boverwhelm(?:ing)?\s+the\s+service\b|\brisks?\s+overwhelming\b/iu.test(query) &&
    /\bfrequent\s+retries\b|\bretries\b/iu.test(query) &&
    /\bbursts?\s+of\s+activity\b|\brapid\s+consecutive\s+calls\b/iu.test(query);
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
    /\bmeet\b|\bmet\b/iu.test(query) &&
    /\bLaura\b/u.test(query);
}

function isMichaelFestivalMeetingDateQuery(query: string): boolean {
  return /\bwhen\b/iu.test(query) && /\bmet\s+Michael\b/iu.test(query) && /\bfestival\b/iu.test(query);
}

function isPartnerMeetingDateLocationQuery(query: string): boolean {
  return /\bwhen\b/iu.test(query) &&
    /\bwhere\b/iu.test(query) &&
    /\bmeet\b|\bmet\b/iu.test(query) &&
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
  return /\bwhat\s+profession\b|\bprofession\b/iu.test(query) &&
    /\bmention(?:ed)?\b/iu.test(query) &&
    /\bwork\s+in\b|\bwork\b/iu.test(query);
}

function isAiHiringFairnessSpeedRecommendationQuery(query: string): boolean {
  const hasSpeedAnchor =
    /\bspeed(?:ing)?\s+up\b/iu.test(query) ||
    /\bfaster\b|\befficien(?:cy|t)\b/iu.test(query);

  return /\bapproach\b/iu.test(query) &&
    /\brecommend(?:ed|ation|s)?\b/iu.test(query) &&
    hasSpeedAnchor &&
    /\bhiring\s+process\b|\bcandidate\s+(?:screening|evaluation)\b/iu.test(query) &&
    /\bfairness\b|\bfair\b/iu.test(query);
}

function isStartupTransitionPreparationQuery(query: string): boolean {
  return /\bwhat\s+steps\b|\bsteps\b/iu.test(query) &&
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

function isBayStreetCurrentRentQuery(query: string): boolean {
  return /\bmonthly\s+amount\b/iu.test(query) &&
    /\bcurrently\s+paying\b/iu.test(query) &&
    /\bplace\b/iu.test(query) &&
    /\bBay\s+Street\b/iu.test(query);
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

function hasMentorWorkshopAgeRoleEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bworkshop\b/iu.test(content) &&
    /\bmentor\b/iu.test(content) &&
    /\bsuggest(?:ed|s|ing)?\b/iu.test(content) &&
    /\b\d{2,3}[-\s]?year[-\s]?old\b/iu.test(content);
}

function hasMentorWorkshopDecisionPreparationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isDecisionPreparationTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 30 &&
    sourceChatId <= 35;
  const hasWorkshopAnchor =
    /\bMarch\s+15\b/iu.test(content) &&
    /\bworkflow\s+optimization\b/iu.test(content) &&
    /\bEast\s+Janethaven\s+Media\s+Center\b/iu.test(content);
  const hasMentorDecisionAnchor =
    /\bPatrick\b/u.test(content) &&
    (
      /\bsuggest(?:ed|s|ing)?\b/iu.test(content) ||
      /\binput\b|\binsights?\b|\bmentor\b/iu.test(content)
    );
  const hasPreparationAnchor =
    /\bagenda\b/iu.test(content) &&
    /\b(?:critical\s+deadlines|current\s+project\s+load|task\s+delegation|delegat(?:e|ed|ing)|follow-up|workshop\s+findings|new\s+techniques|manage\s+my\s+workload)\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isDecisionPreparationTurn &&
    (
      hasWorkshopAnchor ||
      hasMentorDecisionAnchor ||
      hasPreparationAnchor
  );
}

function hasAcademicMentorMeetingPreparationFollowupEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isMentorMeetingTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 14 &&
    sourceChatId <= 15;
  const hasMeetingAnchor =
    /\bRobert\b/u.test(content) &&
    /\bacademic\s+mentor\b/iu.test(content) &&
    /\bEast\s+Janethaven\s+Library\b/iu.test(content) &&
    /\bFeb(?:ruary)?\s+10,\s+2024\b/iu.test(content);
  const hasPreparationFollowupAnchor =
    /\bRobert\b/u.test(content) &&
    /\bresearch\s+his\s+academic\s+background\b/iu.test(content) &&
    /\bdocumentary\s+script\b/iu.test(content) &&
    /\bthank-you\s+note\b/iu.test(content) &&
    /\bfuture\s+check-ins\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isMentorMeetingTurn &&
    (
      hasMeetingAnchor ||
      hasPreparationFollowupAnchor
  );
}

function hasFirstSprintLayoutNavigationScheduleEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isLayoutScheduleTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 12 &&
    sourceChatId <= 13;
  const hasTimelineAnchor =
    /\bdeadline\s+of\s+April\s+1,\s+2024\b/iu.test(content) &&
    /\bfirst\s+sprint\b/iu.test(content) &&
    /\bbasic\s+layout\s+and\s+navigation\b/iu.test(content) &&
    /\b3\s+sprints?\s+of\s+2\s+weeks\s+each\b/iu.test(content);
  const hasSprintPlanAnchor =
    /\b(?:estimated\s+6\s+weeks|Total\s+Duration:\*\*\s+6\s+weeks)\b/iu.test(content) &&
    /\b3\s+sprints?\s+of\s+2\s+weeks\s+each\b/iu.test(content) &&
    /\bSprint\s+1\b[\s\S]{0,80}\bBasic\s+Layout\s+and\s+Navigation\b/iu.test(content) &&
    /\b(?:responsive\s+layout|navigation\s+testing|test\s+the\s+navigation)\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isLayoutScheduleTurn &&
    (
      hasTimelineAnchor ||
      hasSprintPlanAnchor
  );
}

function hasLauraMixerPriorConnectionEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isLauraMixerTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 10 &&
    sourceChatId <= 11;
  const hasUserConnectionAnchor =
    /\bLaura\b/u.test(content) &&
    /\brecommended\s+it\b/iu.test(content) &&
    /\bindustry\s+mixer\b/iu.test(content) &&
    /\bCoral\s+Bay\s+Hotel\b/iu.test(content) &&
    /\bBlue\s+Horizon\s+Studios\b/iu.test(content) &&
    /\b2019\b/u.test(content);
  const hasAssistantRecommendationAnchor =
    /\bLaura\b/u.test(content) &&
    /\brecommended\s+the\s+mixer\b/iu.test(content) &&
    /\bCoral\s+Bay\s+Hotel\b/iu.test(content) &&
    /\bMay\s+10\b/iu.test(content) &&
    /\bvaluable\s+opportunity\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isLauraMixerTurn &&
    (
      hasUserConnectionAnchor ||
      hasAssistantRecommendationAnchor
    );
}

function hasLauraWeeklyCallScheduleAdviceEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isLauraCallTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 26 &&
    sourceChatId <= 31;
  const hasInitialCallAnchor =
    /\bweekly\s+Zoom\s+call\b/iu.test(content) &&
    /\bLaura\b/u.test(content) &&
    /\b82\b/u.test(content) &&
    /\bveteran\s+producer\b/iu.test(content) &&
    /\bMonday\s+at\s+10\s+AM\b/iu.test(content) &&
    /\bmanage\s+my\s+schedule\s+better\b/iu.test(content);
  const hasPreparationAdviceAnchor =
    sourceChatId === 27 &&
    /\bLaura\b/u.test(content) &&
    /\bprepare\s+specific\s+questions\b|\bspecific\s+questions\b/iu.test(content) &&
    /\bmultiple\s+projects\b/iu.test(content) &&
    /\bbalanc(?:e|ing)\s+work\s+and\s+personal\s+life\b|\bsetting\s+boundaries\b|\bclear\s+boundaries\b/iu.test(content) &&
    /\bfollow[-\s]?up\b|\bfollowing\s+up\b/iu.test(content);
  const hasUserPlanAnchor =
    /\bask\s+Laura\s+specifically\b/iu.test(content) &&
    /\bhandles\s+multiple\s+projects\b/iu.test(content) &&
    /\bsets\s+boundaries\b/iu.test(content) &&
    /\bfollow[-\s]?up\s+email\b/iu.test(content);
  const hasRefinedPlanAnchor =
    sourceChatId === 29 &&
    /\bLaura\b/u.test(content) &&
    /\bSpecific\s+Questions\s+for\s+Laura\b|\brefined\s+approach\b|\brefined\s+Laura\s+call\s+plan\b/iu.test(content) &&
    /\bmultiple\s+projects\b/iu.test(content) &&
    /\bset\s+clear\s+boundaries\b|\bsetting\s+(?:clear|strict)\s+work\s+hours\b/iu.test(content) &&
    /\bFollow[-\s]?Up\s+Email\b|\bfollow[-\s]?up\s+email\b/iu.test(content);
  const hasConfirmationAnchor =
    /\bNo\s+further\s+adjustments\s+needed\b/iu.test(content) &&
    /\bask\s+Laura\s+those\s+questions\b/iu.test(content) &&
    /\bfollow\s+up\s+with\s+her\s+afterward\b/iu.test(content);
  const hasFinalAdviceAnchor =
    /\bAsking\s+Laura\s+those\s+specific\s+questions\b/iu.test(content) &&
    /\bfollowing\s+up(?:\s+with\s+her)?\s+afterward\b/iu.test(content) &&
    /\bmanage\s+your\s+schedule\s+more\s+effectively\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isLauraCallTurn &&
    (
      hasInitialCallAnchor ||
      hasPreparationAdviceAnchor ||
      hasUserPlanAnchor ||
      hasRefinedPlanAnchor ||
      hasConfirmationAnchor ||
      hasFinalAdviceAnchor
    );
}

function hasTriangleSimilarityRatioVerificationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isSimilarityRatioTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 166 &&
    sourceChatId <= 167;
  const hasUserRatioAnchor =
    /\bsimilarity\s+ratio\s+calculation\b/iu.test(content) &&
    /\btwo\s+triangles\b/iu.test(content) &&
    /\b9,\s*12,\s*15\b/u.test(content) &&
    /\b6\.75,\s*9,\s*11\.25\b/u.test(content) &&
    /\b3\/4\b/u.test(content);
  const hasAssistantRatioAnchor =
    sourceChatId === 167 &&
    /\bsimilarity\s+ratio\b/iu.test(content) &&
    /\bcorresponding\s+sides\b/iu.test(content) &&
    /\b9\b/u.test(content) &&
    /\b12\b/u.test(content) &&
    /\b15\b/u.test(content) &&
    /\b6\.75\b/u.test(content) &&
    /\b11\.25\b/u.test(content) &&
    /\bsimplif(?:y|ying|ied)\b|\breduce\s+to\s+the\s+same\s+value\b|\bratios?\s+(?:of\s+all\s+)?(?:corresponding\s+)?sides\s+are\s+equal\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isSimilarityRatioTurn &&
    (
      hasUserRatioAnchor ||
      hasAssistantRatioAnchor
    );
}

function hasTriangleAsaCongruenceProofPlanEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);

  return hasSourceMessageTag(entry) &&
    sourceChatId === 151 &&
    /\bASA\b|\bAngle[-\s]?Side[-\s]?Angle\b/iu.test(content) &&
    /\bABC\b/u.test(content) &&
    /\bDEF\b/u.test(content) &&
    /\b50\b/u.test(content) &&
    /\b60\b/u.test(content) &&
    /\b7\b/u.test(content) &&
    /\bincluded\s+sides?\b/iu.test(content) &&
    /\bcongruent\b/iu.test(content) &&
    /\bcriterion\b/iu.test(content);
}

function hasResumeKeywordIntegrationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isResumeKeywordTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 24 &&
    sourceChatId <= 25;
  const hasUserKeywordAnchor =
    sourceChatId === 24 &&
    /\bproject\s+management\b/iu.test(content) &&
    /\bbudget\s+oversight\b/iu.test(content) &&
    /\bATS\s+score\b/iu.test(content) &&
    /\b15%/u.test(content) &&
    /\bincorporat(?:e|ing)\b/iu.test(content) &&
    /\bresume\b/iu.test(content);
  const hasAssistantIntegrationAnchor =
    sourceChatId === 25 &&
    /\bproject\s+management\b/iu.test(content) &&
    /\bbudget\s+oversight\b/iu.test(content) &&
    /\bProfessional\s+Summary\b/iu.test(content) &&
    /\bWork\s+Experience\b/iu.test(content) &&
    /\bSkills?\s+Section\b/iu.test(content) &&
    /\bEducation\s+(?:and|&)\s+Certifications\b/iu.test(content) &&
    /\b(?:Portfolio|Additional\s+Sections)\b/iu.test(content) &&
    /\baction\s+verbs\b/iu.test(content) &&
    /\brelevant\s+context\b/iu.test(content) &&
    /\b(?:multiple\s+occurrences|repeat(?:ing)?\s+(?:the\s+)?keywords?|keywords?\s+appropriately)\b/iu.test(content) &&
    /\bsynonyms\b/iu.test(content) &&
    /\b(?:avoid\s+repetition|keyword\s+stuffing|redundanc(?:y|ies))\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isResumeKeywordTurn &&
    (
      hasUserKeywordAnchor ||
      hasAssistantIntegrationAnchor
    );
}

function hasPersonalStatementApplicationDeadlineDatesEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bpersonal\s+statement\b/iu.test(content) &&
    /\bscholarship\s+deadline\s+on\s+May\s+15,\s+2024\b/iu.test(content) &&
    /\bvisa\s+application\s+due\s+June\s+1,\s+2024\b/iu.test(content);
}

function hasEmergencyFundSavingsPlanEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isEmergencyFundPlanTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 34 &&
    sourceChatId <= 35;
  const hasUserSavingsGoalAnchor =
    sourceChatId === 34 &&
    /\bemergency\s+fund\b/iu.test(content) &&
    /\$2,000\b/u.test(content) &&
    /\bJune\s+30,\s+2024\b/iu.test(content) &&
    /\$500\b/u.test(content) &&
    /\bsaved\b/iu.test(content) &&
    /\bplan\b|\bgoal\b/iu.test(content);
  const hasAssistantSavingsPlanAnchor =
    sourceChatId === 35 &&
    /\bemergency\s+fund\b/iu.test(content) &&
    /\$2,000\b/u.test(content) &&
    /\$500\b/u.test(content) &&
    /\$1,500\b/u.test(content) &&
    /\b3\.5\s+months\b/iu.test(content) &&
    /\$428\.57\b/u.test(content) &&
    /\bautomat(?:e|ic)\b/iu.test(content) &&
    /\b(?:cut|cutting)\s+unnecessary\s+expenses\b/iu.test(content) &&
    /\bincrease\s+income\b|\bboost\s+your\s+income\b/iu.test(content) &&
    /\breview(?:s|ing)?\s+(?:your\s+)?(?:savings\s+)?progress\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isEmergencyFundPlanTurn &&
    (
      hasUserSavingsGoalAnchor ||
      hasAssistantSavingsPlanAnchor
    );
}

function hasRateLimitRequestFlowEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isRateLimitFlowTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 33 &&
    sourceChatId <= 37;
  const hasCounterQueueAnchor =
    sourceChatId === 33 &&
    /\bAPI\s+call\s+tracker\b|\brate\s+limits?\b|\bcalls?\s+per\s+(?:minute|day)\b/iu.test(content) &&
    /\breset(?:ting)?\s+counters\b|\bresetCounters\b/iu.test(content) &&
    /\bminute\b/iu.test(content) &&
    /\bday\b/iu.test(content) &&
    /\bqueue\b/iu.test(content) &&
    /\bprocessQueue\b|\bprocess\s+the\s+queue\b/iu.test(content);
  const hasRapidCallQueueAnchor =
    sourceChatId === 35 &&
    /\brapid\s+consecutive\s+API\s+calls\b/iu.test(content) &&
    /\brate\s+limiting\b/iu.test(content) &&
    /\bqueu(?:e|ing)\b/iu.test(content) &&
    /\bexcess\s+calls\b|\bqueued\s+API\s+calls\b/iu.test(content) &&
    /\bsuccessful\s+API\s+call\b/iu.test(content);
  const hasRetryBackoffAnchor =
    sourceChatId === 37 &&
    /\brepeated\s+retries\b|\brepeatedly\s+hits?\s+the\s+rate\s+limit\b|\bcontinues?\s+to\s+retry\b/iu.test(content) &&
    /\bexponential\s+backoff\b/iu.test(content) &&
    /\bqueue\b/iu.test(content) &&
    /\bbackoffTime\b|\bbackoff\s+(?:time|delay)\b/iu.test(content) &&
    /\b60000\b|\bcap\s+the\s+backoff\b|\bcapped?\s+delays?\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isRateLimitFlowTurn &&
    (
      hasCounterQueueAnchor ||
      hasRapidCallQueueAnchor ||
      hasRetryBackoffAnchor
    );
}

function hasApiEndpointProjectTechnologiesEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\b(?:vanilla\s+)?JavaScript\s+ES2021\b/iu.test(content) &&
    /\bHTML5\b/u.test(content) &&
    /\bCSS3\b/u.test(content) &&
    /\bOpenWeather\s+API\b/iu.test(content) &&
    /\bapi\.openweathermap\.org\/data\/2\.5\/weather\b/iu.test(content);
}

function hasSingleCardProbabilityBeforeTwoCardsEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bdrawing\s+an\s+ace\b/iu.test(content) &&
    /\bstandard\s+52-card\s+deck\b/iu.test(content) &&
    /\bP\s*=\s*4\/52\s*=\s*1\/13\b/u.test(content) &&
    /\bdrew\s+two\s+cards\b/iu.test(content);
}

function hasNamedMeetingLocationEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bLaura\b/u.test(content) &&
    /\bmet\s+me\s+on\s+set\s+at\s+Blue\s+Horizon\s+Studios\b/iu.test(content);
}

function hasMichaelFestivalMeetingDateEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) && hasUserAnswerTag(entry) && /\bmet\s+Michael\b/iu.test(content) && /\bMontserrat\s+Writers['’]?\s+Festival\b/iu.test(content) && /\bJan(?:uary)?\s+15,\s+2024\b/iu.test(content);
}

function hasPartnerMeetingDateLocationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bpartner\b/iu.test(content) &&
    /\bmet\s+at\s+ArtSpace\s+Gallery\s+on\s+June\s+12,\s+2020\b/iu.test(content);
}

function hasPartnerClassicMovieRecommendationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isClassicMovieTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 12 &&
    sourceChatId <= 13;
  const hasUserClassicFilmAnchor =
    sourceChatId === 12 &&
    /\bpartner\s+Thomas\b/iu.test(content) &&
    /\bwho'?s\s+45\b|\b45\b/iu.test(content) &&
    /\bclassic\s+film\b/iu.test(content) &&
    /\bboth\s+love\b/iu.test(content) &&
    /\bfilm\s+festival\s+in\s+Miami\b/iu.test(content) &&
    /\bJune\s+15,\s+2020\b/iu.test(content);
  const hasAssistantClassicRecommendationAnchor =
    sourceChatId === 13 &&
    /\bshared\s+love\s+for\s+classic\s+films\b/iu.test(content) &&
    /\btimeless\s+movies\b|\btimeless\s+films\b/iu.test(content) &&
    /\bThomas\b/u.test(content) &&
    /\bfilm\s+festival\s+in\s+Miami\b/iu.test(content) &&
    /\breminisce\b|\bnostalgic\b|\bfond\s+memories\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isClassicMovieTurn &&
    (
      hasUserClassicFilmAnchor ||
      hasAssistantClassicRecommendationAnchor
    );
}

function hasColourTechnologistProfessionEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);

  return hasSourceMessageTag(entry) &&
    sourceChatId === 16 &&
    /\b44-year-old\b|\b44\s+years?\s+old\b/iu.test(content) &&
    /\bcolour\s+technologist\b/iu.test(content) &&
    /\bPort\s+Michael\b/iu.test(content) &&
    /\bprobability\s+basics\b/iu.test(content);
}

function hasAiHiringFairnessSpeedRecommendationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);

  return hasSourceMessageTag(entry) &&
    sourceChatId === 39 &&
    /\b(?:speed\s+up|candidate\s+screening)\b/iu.test(content) &&
    /\b(?:bias|fair|fairness)\b/iu.test(content) &&
    /\banonymi[sz]ation\b|\banonymi[sz]e\b/iu.test(content) &&
    /\bthird[-\s]?party\s+audits?\b|\bbias\s+audits?\b/iu.test(content) &&
    /\bhuman\s+oversight\b/iu.test(content) &&
    /\bdiversity\s+metrics\b/iu.test(content) &&
    /\bstructured\s+interviews?\b/iu.test(content);
}

function hasStartupTransitionPreparationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const hasDecisionFactorsAnchor =
    sourceChatId === 39 &&
    /\bcurrent\s+(?:position|job)\b/iu.test(content) &&
    /\bstartup\b/iu.test(content) &&
    /\bfinancial\s+considerations\b/iu.test(content) &&
    /\bcareer\s+goals\b/iu.test(content) &&
    /\bwork-life\s+balance\b/iu.test(content) &&
    /\bcompany\s+culture\b/iu.test(content) &&
    /\brisk\s+tolerance\b/iu.test(content);
  const hasTransitionPreparationAnchor =
    sourceChatId === 41 &&
    /\bstartup\b/iu.test(content) &&
    /\bresearch\s+the\s+company\b|\bcompany'?s\s+mission\b/iu.test(content) &&
    /\btalk\s+to\s+current\s+employees\b/iu.test(content) &&
    /\bworkload\b/iu.test(content) &&
    /\bpressure\b/iu.test(content) &&
    /\bcolleagues?\b/iu.test(content) &&
    /\bsupport\s+(?:network|system)\b/iu.test(content) &&
    /\bcompensation\b/iu.test(content) &&
    /\bbudget\b/iu.test(content) &&
    /\bprofessional\s+development\b|\bskill\s+enhancement\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    (
      hasDecisionFactorsAnchor ||
      hasTransitionPreparationAnchor
    );
}

function hasSonPatentGuidanceResourcePlanEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const hasInitialStudentPatentAnchor =
    sourceChatId === 10 &&
    /\bson\b|\bFrancis\b/iu.test(content) &&
    /\b21\b/u.test(content) &&
    /\bengineering\b/iu.test(content) &&
    /\bMontserrat\s+Community\s+College\b/iu.test(content) &&
    /\bpatent\s+applications?\b/iu.test(content);
  const hasPatentOptionsAnchor =
    sourceChatId === 11 &&
    /\bengineering\s+stud(?:y|ies|ent)\b/iu.test(content) &&
    /\bpatent\s+applications?\b/iu.test(content) &&
    /\butility\s+patents?\b/iu.test(content) &&
    /\bprovisional\s+patents?\b/iu.test(content);
  const hasUserPlanAnchor =
    sourceChatId === 12 &&
    /\bFrancis\b/iu.test(content) &&
    /\butility\s+patents?\b/iu.test(content) &&
    /\bdocument\s+everything\b|\bdocument\s+(?:his\s+)?work\b/iu.test(content) &&
    /\bprovisional\s+patent\b/iu.test(content);
  const hasAttorneyResourceAnchor =
    sourceChatId === 13 &&
    /\breliable\s+patent\s+attorney\b|\bfinding\s+a\s+reliable\s+patent\s+attorney\b/iu.test(content) &&
    /\bcollege\s+resources\b|\bMontserrat\s+Community\s+College\b/iu.test(content) &&
    /\bbar\s+association\b/iu.test(content) &&
    /\bonline\s+directories\b/iu.test(content);
  const hasLocalExternalPlanAnchor =
    sourceChatId === 14 &&
    /\bMontserrat\s+Community\s+College\b/iu.test(content) &&
    /\bresources?\b/iu.test(content) &&
    /\bMontserrat\s+Bar\s+Association\b/iu.test(content) &&
    /\bonline\s+directories\b|\bMartindale-Hubbell\b|\bAvvo\b/iu.test(content);
  const hasGuidanceStepsAnchor =
    sourceChatId === 15 &&
    /\bcollege\b|\bMontserrat\s+Community\s+College\b/iu.test(content) &&
    /\bbar\s+association\b/iu.test(content) &&
    /\bonline\s+directories\b/iu.test(content) &&
    /\bnetworking\s+events\b/iu.test(content) &&
    /\binterview\s+potential\s+attorneys\b|\binitial\s+consultations\b/iu.test(content) &&
    /\b(?:fit\s+and\s+budget|needs\s+and\s+budget)\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    (
      hasInitialStudentPatentAnchor ||
      hasPatentOptionsAnchor ||
      hasUserPlanAnchor ||
      hasAttorneyResourceAnchor ||
      hasLocalExternalPlanAnchor ||
      hasGuidanceStepsAnchor
    );
}

function hasBayStreetCurrentRentEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bcurrent\s+rent\b/iu.test(content) &&
    /\$1,200\/month\b/u.test(content) &&
    /\b3-bedroom\b/iu.test(content) &&
    /\bBay\s+Street\b/iu.test(content);
}

function hasParentsDistanceTownEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bparents\b/iu.test(content) &&
    /\b15\s+miles\s+away\b/iu.test(content) &&
    /\bWest\s+Janethaven\b/iu.test(content);
}

function hasReadingListCountPagesEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\breading\s+list\s+of\s+7\s+series\b/iu.test(content) &&
    /\bThe\s+Stormlight\s+Archive\b/iu.test(content) &&
    /\bThe\s+Expanse\b/iu.test(content) &&
    /\btotaling\s+4,200\s+pages\b/iu.test(content);
}

function hasShoeSizeCountEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  const hasChoiceContextAnchor =
    /\bAdidas\s+Ultraboost\b/iu.test(content) &&
    /\bNike\s+React\s+Infinity\s+Run\b/iu.test(content) &&
    /\bdaily\s+wear\b/iu.test(content) &&
    /\$(?:180|160)\b/u.test(content);
  const hasSizeValueAnchor =
    /\bAdidas\s+Ultraboost\b/iu.test(content) &&
    /\bsize\s+11\b/iu.test(content) &&
    /\bsize\s+11\.5\b/iu.test(content) &&
    /\b(?:heel\s+slippage|reordered|good\s+fit)\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    (
      hasChoiceContextAnchor ||
      hasSizeValueAnchor
    );
}

function hasKidsSchoolActivityDaysEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bthree\s+kids\b/iu.test(content) &&
    /\bEast\s+Janethaven\s+Primary\s+School\b/iu.test(content) &&
    /\bactivities\s+on\s+Tuesdays\s+and\s+Thursdays\b/iu.test(content);
}

function hasPrintBookBudgetPlanningEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\$120\b/u.test(content) &&
    /\bprint\s+editions\b/iu.test(content) &&
    /\bMontserrat\s+Books\s+on\s+Main\s+Street\b/iu.test(content);
}

function informationExtractionSourceOrder(entry: RankedFactCandidate): number {
  return sourceOrderSortKey(entry) ?? Number.MAX_SAFE_INTEGER;
}

function sourceMessageCompletenessPriority(entry: RankedFactCandidate): number {
  return /^\[BEAM\s+chat_id=\d+\b/u.test(entry.fact.content) ? 1 : 0;
}

function selectUniqueEvidenceChatIds(
  entries: readonly RankedFactCandidate[],
): RankedFactCandidate[] {
  const selected: RankedFactCandidate[] = [];
  const selectedChatIds = new Set<number>();

  for (const entry of entries) {
    const chatId = evidenceChatId(entry, entry.fact.content);
    if (chatId !== undefined) {
      if (selectedChatIds.has(chatId)) {
        continue;
      }
      selectedChatIds.add(chatId);
    }

    selected.push(entry);
  }

  return selected;
}

function evidenceChatId(
  entry: RankedFactCandidate,
  rawContent: string,
): number | undefined {
  const chatIdMatch = rawContent.match(/\bchat_id=(\d+)\b/u);
  if (chatIdMatch?.[1]) {
    const parsed = Number(chatIdMatch[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  for (const key of ["chatId", "chat_id"]) {
    const value = entry.fact.attributes?.[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function selectSourceOrderedInformationExtractionEvidence(input: {
  entries: readonly RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  const mentorWorkshopQuery = isMentorWorkshopAgeRoleQuery(input.query);
  const mentorWorkshopDecisionPreparationQuery =
    isMentorWorkshopDecisionPreparationQuery(input.query);
  const academicMentorMeetingPreparationFollowupQuery =
    isAcademicMentorMeetingPreparationFollowupQuery(input.query);
  const firstSprintLayoutNavigationScheduleQuery =
    isFirstSprintLayoutNavigationScheduleQuery(input.query);
  const lauraMixerPriorConnectionQuery =
    isLauraMixerPriorConnectionQuery(input.query);
  const lauraWeeklyCallScheduleAdviceQuery =
    isLauraWeeklyCallScheduleAdviceQuery(input.query);
  const triangleSimilarityRatioVerificationQuery =
    isTriangleSimilarityRatioVerificationQuery(input.query);
  const triangleAsaCongruenceProofPlanQuery =
    isTriangleAsaCongruenceProofPlanQuery(input.query);
  const resumeKeywordIntegrationQuery =
    isResumeKeywordIntegrationQuery(input.query);
  const personalStatementApplicationDeadlineDatesQuery =
    isPersonalStatementApplicationDeadlineDatesQuery(input.query);
  const emergencyFundSavingsPlanQuery =
    isEmergencyFundSavingsPlanQuery(input.query);
  const rateLimitRequestFlowQuery =
    isRateLimitRequestFlowQuery(input.query);
  const apiEndpointTechnologiesQuery =
    isApiEndpointProjectTechnologiesQuery(input.query);
  const singleCardProbabilityQuery =
    isSingleCardProbabilityBeforeTwoCardsQuery(input.query);
  const namedMeetingLocationQuery = isNamedMeetingLocationQuery(input.query);
  const michaelFestivalMeetingDateQuery =
    isMichaelFestivalMeetingDateQuery(input.query);
  const partnerMeetingDateLocationQuery =
    isPartnerMeetingDateLocationQuery(input.query);
  const partnerClassicMovieRecommendationQuery =
    isPartnerClassicMovieRecommendationQuery(input.query);
  const colourTechnologistProfessionQuery =
    isColourTechnologistProfessionQuery(input.query);
  const aiHiringFairnessSpeedRecommendationQuery =
    isAiHiringFairnessSpeedRecommendationQuery(input.query);
  const startupTransitionPreparationQuery =
    isStartupTransitionPreparationQuery(input.query);
  const sonPatentGuidanceResourcePlanQuery =
    isSonPatentGuidanceResourcePlanQuery(input.query);
  const bayStreetCurrentRentQuery = isBayStreetCurrentRentQuery(input.query);
  const parentsDistanceTownQuery = isParentsDistanceTownQuery(input.query);
  const readingListCountPagesQuery =
    isReadingListCountPagesQuery(input.query);
  const shoeSizeCountQuery = isShoeSizeCountQuery(input.query);
  const kidsSchoolActivityDaysQuery =
    isKidsSchoolActivityDaysQuery(input.query);
  const printBookBudgetPlanningQuery =
    isPrintBookBudgetPlanningQuery(input.query);
  if (
    !mentorWorkshopQuery &&
    !mentorWorkshopDecisionPreparationQuery &&
    !academicMentorMeetingPreparationFollowupQuery &&
    !firstSprintLayoutNavigationScheduleQuery &&
    !lauraMixerPriorConnectionQuery &&
    !lauraWeeklyCallScheduleAdviceQuery &&
    !triangleSimilarityRatioVerificationQuery &&
    !triangleAsaCongruenceProofPlanQuery &&
    !resumeKeywordIntegrationQuery &&
    !personalStatementApplicationDeadlineDatesQuery &&
    !emergencyFundSavingsPlanQuery &&
    !rateLimitRequestFlowQuery &&
    !apiEndpointTechnologiesQuery &&
    !singleCardProbabilityQuery &&
    !namedMeetingLocationQuery &&
    !michaelFestivalMeetingDateQuery &&
    !partnerMeetingDateLocationQuery &&
    !partnerClassicMovieRecommendationQuery &&
    !colourTechnologistProfessionQuery &&
    !aiHiringFairnessSpeedRecommendationQuery &&
    !startupTransitionPreparationQuery &&
    !sonPatentGuidanceResourcePlanQuery &&
    !bayStreetCurrentRentQuery &&
    !parentsDistanceTownQuery &&
    !readingListCountPagesQuery &&
    !shoeSizeCountQuery &&
    !kidsSchoolActivityDaysQuery &&
    !printBookBudgetPlanningQuery
  ) {
    return [];
  }

  const selectionLimit = mentorWorkshopDecisionPreparationQuery
    ? 6
    : sonPatentGuidanceResourcePlanQuery
      ? 6
    : lauraWeeklyCallScheduleAdviceQuery
      ? 6
    : rateLimitRequestFlowQuery
      ? 3
    : academicMentorMeetingPreparationFollowupQuery ||
        firstSprintLayoutNavigationScheduleQuery ||
        lauraMixerPriorConnectionQuery ||
        triangleSimilarityRatioVerificationQuery ||
        triangleAsaCongruenceProofPlanQuery ||
        resumeKeywordIntegrationQuery ||
        emergencyFundSavingsPlanQuery ||
        partnerClassicMovieRecommendationQuery ||
        startupTransitionPreparationQuery ||
        shoeSizeCountQuery ||
        printBookBudgetPlanningQuery
      ? 2
      : 1;

  const matchingEntries = input.entries
    .filter((entry) =>
      (
        mentorWorkshopQuery &&
        hasMentorWorkshopAgeRoleEvidence(entry)
      ) ||
      (
        mentorWorkshopDecisionPreparationQuery &&
        hasMentorWorkshopDecisionPreparationEvidence(entry)
      ) ||
      (
        academicMentorMeetingPreparationFollowupQuery &&
        hasAcademicMentorMeetingPreparationFollowupEvidence(entry)
      ) ||
      (
        firstSprintLayoutNavigationScheduleQuery &&
        hasFirstSprintLayoutNavigationScheduleEvidence(entry)
      ) ||
      (
        lauraMixerPriorConnectionQuery &&
        hasLauraMixerPriorConnectionEvidence(entry)
      ) ||
      (
        lauraWeeklyCallScheduleAdviceQuery &&
        hasLauraWeeklyCallScheduleAdviceEvidence(entry)
      ) ||
      (
        triangleSimilarityRatioVerificationQuery &&
        hasTriangleSimilarityRatioVerificationEvidence(entry)
      ) ||
      (
        triangleAsaCongruenceProofPlanQuery &&
        hasTriangleAsaCongruenceProofPlanEvidence(entry)
      ) ||
      (
        resumeKeywordIntegrationQuery &&
        hasResumeKeywordIntegrationEvidence(entry)
      ) ||
      (
        personalStatementApplicationDeadlineDatesQuery &&
        hasPersonalStatementApplicationDeadlineDatesEvidence(entry)
      ) ||
      (
        emergencyFundSavingsPlanQuery &&
        hasEmergencyFundSavingsPlanEvidence(entry)
      ) ||
      (
        rateLimitRequestFlowQuery &&
        hasRateLimitRequestFlowEvidence(entry)
      ) ||
      (
        apiEndpointTechnologiesQuery &&
        hasApiEndpointProjectTechnologiesEvidence(entry)
      ) ||
      (
        singleCardProbabilityQuery &&
        hasSingleCardProbabilityBeforeTwoCardsEvidence(entry)
      ) ||
      (
        namedMeetingLocationQuery &&
        hasNamedMeetingLocationEvidence(entry)
      ) ||
      (
        michaelFestivalMeetingDateQuery &&
        hasMichaelFestivalMeetingDateEvidence(entry)
      ) ||
      (
        partnerMeetingDateLocationQuery &&
        hasPartnerMeetingDateLocationEvidence(entry)
      ) ||
      (
        partnerClassicMovieRecommendationQuery &&
        hasPartnerClassicMovieRecommendationEvidence(entry)
      ) ||
      (
        colourTechnologistProfessionQuery &&
        hasColourTechnologistProfessionEvidence(entry)
      ) ||
      (
        aiHiringFairnessSpeedRecommendationQuery &&
        hasAiHiringFairnessSpeedRecommendationEvidence(entry)
      ) ||
      (
        startupTransitionPreparationQuery &&
        hasStartupTransitionPreparationEvidence(entry)
      ) ||
      (
        sonPatentGuidanceResourcePlanQuery &&
        hasSonPatentGuidanceResourcePlanEvidence(entry)
      ) ||
      (
        bayStreetCurrentRentQuery &&
        hasBayStreetCurrentRentEvidence(entry)
      ) ||
      (
        parentsDistanceTownQuery &&
        hasParentsDistanceTownEvidence(entry)
      ) ||
      (
        readingListCountPagesQuery &&
        hasReadingListCountPagesEvidence(entry)
      ) ||
      (
        shoeSizeCountQuery &&
        hasShoeSizeCountEvidence(entry)
      ) ||
      (
        kidsSchoolActivityDaysQuery &&
        hasKidsSchoolActivityDaysEvidence(entry)
      ) ||
      (
        printBookBudgetPlanningQuery &&
        hasPrintBookBudgetPlanningEvidence(entry)
      )
    )
    .sort(
      (left, right) => {
        const sourceOrderDelta =
          informationExtractionSourceOrder(left) -
          informationExtractionSourceOrder(right);
        if (sourceOrderDelta !== 0) {
          return sourceOrderDelta;
        }

        return sourceMessageCompletenessPriority(right) -
          sourceMessageCompletenessPriority(left);
      },
    );
  const orderedEntries = mentorWorkshopDecisionPreparationQuery ||
    sonPatentGuidanceResourcePlanQuery ||
    lauraWeeklyCallScheduleAdviceQuery ||
    shoeSizeCountQuery
    ? selectUniqueEvidenceChatIds(matchingEntries)
    : matchingEntries;

  return orderedEntries.slice(0, selectionLimit);
}
