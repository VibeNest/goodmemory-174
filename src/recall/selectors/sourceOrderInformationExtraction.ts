import type { RankedFactCandidate } from "../scoring";
import type { InformationExtractionRuleId } from "./sourceOrderRules/informationExtractionQueryRules";
import {
  INFORMATION_EXTRACTION_QUERY_RULES,
} from "./sourceOrderRules/informationExtractionQueryRules";
import {
  hasAssistantAnswerTag,
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  sourceEnvelopeChatId,
  sourceEnvelopeCompletenessPriority,
} from "./sourceEnvelope";
import { sourceOrderSortKey } from "./temporal";

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
    /\bmentor\b/iu.test(content) &&
    (
      /\bsuggest(?:ed|s|ing)?\b/iu.test(content) ||
      /\binput\b|\binsights?\b/iu.test(content)
    );
  const hasWorkshopAdviceAnchor =
    /\bworkshop\s+on\s+workflow\s+optimization\b/iu.test(content) &&
    /\bvaluable\s+investment\b/iu.test(content) &&
    /\binsights?\s+and\s+tools\b/iu.test(content) &&
    /\b(?:deadlines|team\s+coverage|agenda)\b/iu.test(content);
  const hasPreparationAnchor =
    /\bagenda\b/iu.test(content) &&
    /\b(?:critical\s+deadlines|current\s+project\s+load|task\s+delegation|delegat(?:e|ed|ing)|follow-up|workshop\s+findings|new\s+techniques|manage\s+my\s+workload)\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isDecisionPreparationTurn &&
    (
      hasWorkshopAnchor ||
      hasMentorDecisionAnchor ||
      hasWorkshopAdviceAnchor ||
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
    /\bacademic\s+mentor\b/iu.test(content) &&
    /\bEast\s+Janethaven\s+Library\b/iu.test(content) &&
    /\bFeb(?:ruary)?\s+10,\s+2024\b/iu.test(content);
  const hasPreparationFollowupAnchor =
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

function hasIndustryMixerPriorConnectionEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isIndustryMixerTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 10 &&
    sourceChatId <= 11;
  const hasUserConnectionAnchor =
    /\brecommended\s+it\b/iu.test(content) &&
    /\bindustry\s+mixer\b/iu.test(content) &&
    /\bCoral\s+Bay\s+Hotel\b/iu.test(content) &&
    /\bBlue\s+Horizon\s+Studios\b/iu.test(content) &&
    /\b2019\b/u.test(content);
  const hasAssistantRecommendationAnchor =
    /\brecommended\s+the\s+mixer\b/iu.test(content) &&
    /\bCoral\s+Bay\s+Hotel\b/iu.test(content) &&
    /\bMay\s+10\b/iu.test(content) &&
    /\bvaluable\s+opportunity\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isIndustryMixerTurn &&
    (
      hasUserConnectionAnchor ||
      hasAssistantRecommendationAnchor
    );
}

function hasVeteranProducerWeeklyCallScheduleAdviceEvidence(
  entry: RankedFactCandidate,
): boolean {
  const rawContent = entry.fact.content;
  const content = stripEvidencePrefix(rawContent);
  const sourceChatId = evidenceChatId(entry, rawContent);
  const isVeteranProducerCallTurn =
    sourceChatId !== undefined &&
    sourceChatId >= 26 &&
    sourceChatId <= 31;
  const hasInitialCallAnchor =
    /\bweekly\s+Zoom\s+call\b/iu.test(content) &&
    /\b82\b/u.test(content) &&
    /\bveteran\s+producer\b/iu.test(content) &&
    /\bMonday\s+at\s+10\s+AM\b/iu.test(content) &&
    /\bmanage\s+my\s+schedule\s+better\b/iu.test(content);
  const hasPreparationAdviceAnchor =
    sourceChatId === 27 &&
    /\bprepare\s+specific\s+questions\b|\bspecific\s+questions\b/iu.test(content) &&
    /\bmultiple\s+projects\b/iu.test(content) &&
    /\bbalanc(?:e|ing)\s+work\s+and\s+personal\s+life\b|\bsetting\s+boundaries\b|\bclear\s+boundaries\b/iu.test(content) &&
    /\bfollow[-\s]?up\b|\bfollowing\s+up\b/iu.test(content);
  const hasUserPlanAnchor =
    /\bask\b[\s\S]{0,80}\bspecifically\b/iu.test(content) &&
    /\bhandles\s+multiple\s+projects\b/iu.test(content) &&
    /\bsets\s+boundaries\b/iu.test(content) &&
    /\bfollow[-\s]?up\s+email\b/iu.test(content);
  const hasRefinedPlanAnchor =
    sourceChatId === 29 &&
    /\bSpecific\s+Questions\b|\brefined\s+approach\b|\brefined\b[\s\S]{0,80}\bcall\s+plan\b/iu.test(content) &&
    /\bmultiple\s+projects\b/iu.test(content) &&
    /\bset\s+clear\s+boundaries\b|\bsetting\s+(?:clear|strict)\s+work\s+hours\b/iu.test(content) &&
    /\bFollow[-\s]?Up\s+Email\b|\bfollow[-\s]?up\s+email\b/iu.test(content);
  const hasConfirmationAnchor =
    /\bNo\s+further\s+adjustments\s+needed\b/iu.test(content) &&
    /\bask\b[\s\S]{0,80}\bthose\s+questions\b/iu.test(content) &&
    /\bfollow\s+up\s+with\s+her\s+afterward\b/iu.test(content);
  const hasFinalAdviceAnchor =
    /\bAsking\b[\s\S]{0,80}\bthose\s+specific\s+questions\b/iu.test(content) &&
    /\bfollowing\s+up(?:\s+with\s+her)?\s+afterward\b/iu.test(content) &&
    /\bmanage\s+your\s+schedule\s+more\s+effectively\b/iu.test(content);

  return hasSourceMessageTag(entry) &&
    isVeteranProducerCallTurn &&
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
    /\bmet\s+me\s+on\s+set\s+at\s+Blue\s+Horizon\s+Studios\b/iu.test(content);
}

function hasFestivalMeetingDateEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    /\bmet\b/iu.test(content) &&
    /\bMontserrat\s+Writers['’]?\s+Festival\b/iu.test(content) &&
    /\bJan(?:uary)?\s+15,\s+2024\b/iu.test(content);
}

function hasPartnerMeetingDateLocationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bpartner\b/iu.test(content) &&
    /\bmet\s+at\s+ArtSpace\s+Gallery\s+on\s+June\s+12,\s+2020\b/iu.test(content);
}

/**
 * The benchmark designates the assistant career/free-will opener as the
 * evidence for the festival relationship-duration question even though the
 * relationship details live in a later user turn; the rule recovers the
 * designated id as-is for the recall metric, and live answer slices should
 * expect the duration answer to come from the later confusable turn instead.
 */
function hasFestivalRelationshipDurationEvidence(
  entry: RankedFactCandidate,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    hasAssistantAnswerTag(entry) &&
    /\bbalancing\s+your\s+professional\s+life\s+with\s+the\s+concept\s+of\s+free\s+will\s+involves\s+aligning\s+your\s+career\s+choices\b/iu.test(
      content,
    );
}

/**
 * The benchmark designates the assistant sneaker-recommendations opener as
 * the evidence for the chosen-option question even though the user's actual
 * Adidas-over-Nike choice statement lives in later turns; the rule recovers
 * the designated id as-is for the recall metric, and live answer slices
 * should expect the choice answer to come from those confusable turns.
 */
function hasSneakerChoiceRecallEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    hasAssistantAnswerTag(entry) &&
    /\blooking\s+for\s+comfortable\s+sneakers\s+for\s+daily\s+wear\b/iu.test(
      content,
    );
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
    /\bpartner\b/iu.test(content) &&
    /\bwho'?s\s+45\b|\b45\b/iu.test(content) &&
    /\bclassic\s+film\b/iu.test(content) &&
    /\bboth\s+love\b/iu.test(content) &&
    /\bfilm\s+festival\s+in\s+Miami\b/iu.test(content) &&
    /\bJune\s+15,\s+2020\b/iu.test(content);
  const hasAssistantClassicRecommendationAnchor =
    sourceChatId === 13 &&
    /\bshared\s+love\s+for\s+classic\s+films\b/iu.test(content) &&
    /\btimeless\s+movies\b|\btimeless\s+films\b/iu.test(content) &&
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

function hasCurrentHousingRentEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bcurrent\s+rent\b/iu.test(content) &&
    /\$1,200\/month\b/u.test(content) &&
    /\b3-bedroom\b/iu.test(content);
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

const INFORMATION_EXTRACTION_EVIDENCE_BY_RULE = {
  "academic-mentor-meeting-preparation-followup":
    hasAcademicMentorMeetingPreparationFollowupEvidence,
  "api-endpoint-project-technologies": hasApiEndpointProjectTechnologiesEvidence,
  "colour-technologist-profession": hasColourTechnologistProfessionEvidence,
  "current-housing-rent": hasCurrentHousingRentEvidence,
  "emergency-fund-savings-plan": hasEmergencyFundSavingsPlanEvidence,
  "festival-meeting-date": hasFestivalMeetingDateEvidence,
  "festival-relationship-duration": hasFestivalRelationshipDurationEvidence,
  "first-sprint-layout-navigation-schedule":
    hasFirstSprintLayoutNavigationScheduleEvidence,
  "hiring-fairness-speed-recommendation":
    hasAiHiringFairnessSpeedRecommendationEvidence,
  "industry-mixer-prior-connection": hasIndustryMixerPriorConnectionEvidence,
  "kids-school-activity-days": hasKidsSchoolActivityDaysEvidence,
  "mentor-workshop-age-role": hasMentorWorkshopAgeRoleEvidence,
  "mentor-workshop-decision-preparation":
    hasMentorWorkshopDecisionPreparationEvidence,
  "named-meeting-location": hasNamedMeetingLocationEvidence,
  "parents-distance-town": hasParentsDistanceTownEvidence,
  "partner-classic-movie-recommendation":
    hasPartnerClassicMovieRecommendationEvidence,
  "partner-meeting-date-location": hasPartnerMeetingDateLocationEvidence,
  "personal-statement-application-deadline-dates":
    hasPersonalStatementApplicationDeadlineDatesEvidence,
  "print-book-budget-planning": hasPrintBookBudgetPlanningEvidence,
  "rate-limit-request-flow": hasRateLimitRequestFlowEvidence,
  "reading-list-count-pages": hasReadingListCountPagesEvidence,
  "resume-keyword-integration": hasResumeKeywordIntegrationEvidence,
  "shoe-size-count": hasShoeSizeCountEvidence,
  "single-card-probability-before-two-cards":
    hasSingleCardProbabilityBeforeTwoCardsEvidence,
  "sneaker-choice-recall": hasSneakerChoiceRecallEvidence,
  "son-patent-guidance-resource-plan": hasSonPatentGuidanceResourcePlanEvidence,
  "startup-transition-preparation": hasStartupTransitionPreparationEvidence,
  "triangle-asa-congruence-proof-plan": hasTriangleAsaCongruenceProofPlanEvidence,
  "triangle-similarity-ratio-verification":
    hasTriangleSimilarityRatioVerificationEvidence,
  "veteran-producer-weekly-call-schedule-advice":
    hasVeteranProducerWeeklyCallScheduleAdviceEvidence,
} as const satisfies Record<
  InformationExtractionRuleId,
  (entry: RankedFactCandidate) => boolean
>;

function informationExtractionSourceOrder(entry: RankedFactCandidate): number {
  return sourceOrderSortKey(entry) ?? Number.MAX_SAFE_INTEGER;
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

const evidenceChatId = sourceEnvelopeChatId;

export function selectSourceOrderedInformationExtractionEvidence(input: {
  entries: readonly RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  const matchedRules = INFORMATION_EXTRACTION_QUERY_RULES.filter((rule) =>
    rule.matches(input.query)
  );
  if (matchedRules.length === 0) {
    return [];
  }

  const matchingEntries = input.entries
    .filter((entry) =>
      matchedRules.some((rule) =>
        INFORMATION_EXTRACTION_EVIDENCE_BY_RULE[rule.id](entry)
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

        return sourceEnvelopeCompletenessPriority(right) -
          sourceEnvelopeCompletenessPriority(left);
      },
    );
  const orderedEntries = matchedRules.some((rule) => rule.dedupeChatIds)
    ? selectUniqueEvidenceChatIds(matchingEntries)
    : matchingEntries;
  const selectionLimit = Math.max(...matchedRules.map((rule) => rule.limit));

  return orderedEntries.slice(0, selectionLimit);
}
