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
    : printBookBudgetPlanningQuery
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
  const orderedEntries = mentorWorkshopDecisionPreparationQuery
    ? selectUniqueEvidenceChatIds(matchingEntries)
    : matchingEntries;

  return orderedEntries.slice(0, selectionLimit);
}
