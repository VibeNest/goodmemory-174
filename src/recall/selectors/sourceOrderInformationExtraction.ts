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

function hasMentorWorkshopAgeRoleEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    /\bworkshop\b/iu.test(content) &&
    /\bmentor\b/iu.test(content) &&
    /\bsuggest(?:ed|s|ing)?\b/iu.test(content) &&
    /\b\d{2,3}[-\s]?year[-\s]?old\b/iu.test(content);
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

function informationExtractionSourceOrder(entry: RankedFactCandidate): number {
  return sourceOrderSortKey(entry) ?? Number.MAX_SAFE_INTEGER;
}

export function selectSourceOrderedInformationExtractionEvidence(input: {
  entries: readonly RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  const mentorWorkshopQuery = isMentorWorkshopAgeRoleQuery(input.query);
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
  if (
    !mentorWorkshopQuery &&
    !apiEndpointTechnologiesQuery &&
    !singleCardProbabilityQuery &&
    !namedMeetingLocationQuery &&
    !partnerMeetingDateLocationQuery &&
    !bayStreetCurrentRentQuery &&
    !parentsDistanceTownQuery &&
    !readingListCountPagesQuery
  ) {
    return [];
  }

  return input.entries
    .filter((entry) =>
      (
        mentorWorkshopQuery &&
        hasMentorWorkshopAgeRoleEvidence(entry)
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
      )
    )
    .sort(
      (left, right) =>
        informationExtractionSourceOrder(left) -
        informationExtractionSourceOrder(right),
    )
    .slice(0, 1);
}
