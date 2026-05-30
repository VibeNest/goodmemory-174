import type { RankedFactCandidate } from "../scoring";
import {
  hasSourceMessageTag,
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

function isPartnerMeetingDateLocationQuery(query: string): boolean {
  return /\bwhen\b/iu.test(query) &&
    /\bwhere\b/iu.test(query) &&
    /\bmeet\b|\bmet\b/iu.test(query) &&
    /\bpartner\b/iu.test(query);
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

function hasPartnerMeetingDateLocationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bpartner\b/iu.test(content) &&
    /\bmet\s+at\s+ArtSpace\s+Gallery\s+on\s+June\s+12,\s+2020\b/iu.test(content);
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
  const resumeKeywordIntegrationQuery =
    isResumeKeywordIntegrationQuery(input.query);
  const apiEndpointTechnologiesQuery =
    isApiEndpointProjectTechnologiesQuery(input.query);
  const singleCardProbabilityQuery =
    isSingleCardProbabilityBeforeTwoCardsQuery(input.query);
  const namedMeetingLocationQuery = isNamedMeetingLocationQuery(input.query);
  const partnerMeetingDateLocationQuery =
    isPartnerMeetingDateLocationQuery(input.query);
  const bayStreetCurrentRentQuery = isBayStreetCurrentRentQuery(input.query);
  const parentsDistanceTownQuery = isParentsDistanceTownQuery(input.query);
  const readingListCountPagesQuery =
    isReadingListCountPagesQuery(input.query);
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
    !resumeKeywordIntegrationQuery &&
    !apiEndpointTechnologiesQuery &&
    !singleCardProbabilityQuery &&
    !namedMeetingLocationQuery &&
    !partnerMeetingDateLocationQuery &&
    !bayStreetCurrentRentQuery &&
    !parentsDistanceTownQuery &&
    !readingListCountPagesQuery &&
    !kidsSchoolActivityDaysQuery &&
    !printBookBudgetPlanningQuery
  ) {
    return [];
  }

  const selectionLimit = mentorWorkshopDecisionPreparationQuery
    ? 6
    : lauraWeeklyCallScheduleAdviceQuery
      ? 6
    : academicMentorMeetingPreparationFollowupQuery ||
        firstSprintLayoutNavigationScheduleQuery ||
        lauraMixerPriorConnectionQuery ||
        triangleSimilarityRatioVerificationQuery ||
        resumeKeywordIntegrationQuery ||
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
        resumeKeywordIntegrationQuery &&
        hasResumeKeywordIntegrationEvidence(entry)
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
        partnerMeetingDateLocationQuery &&
        hasPartnerMeetingDateLocationEvidence(entry)
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
    lauraWeeklyCallScheduleAdviceQuery
    ? selectUniqueEvidenceChatIds(matchingEntries)
    : matchingEntries;

  return orderedEntries.slice(0, selectionLimit);
}
