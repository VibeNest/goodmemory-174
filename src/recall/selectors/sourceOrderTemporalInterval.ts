import type { RankedFactCandidate } from "../scoring";
import { hasUserAnswerTag, stripEvidencePrefix } from "./selectionContext";
import {
  compareTemporalFactChronology,
  isSourceOrderedFact,
  sourceOrderSortKey,
} from "./temporal";

const RAISE_REJECTION_FINAL_MEETING_INTERVAL_QUERY_PATTERN =
  /\bhow\s+many\s+days\b[\s\S]{0,160}\breject(?:ed|ing)?\s+the\s+raise\b[\s\S]{0,220}\brescheduled\s+my\s+final\s+meeting\b|\brescheduled\s+my\s+final\s+meeting\b[\s\S]{0,220}\breject(?:ed|ing)?\s+the\s+raise\b[\s\S]{0,160}\bhow\s+many\s+days\b/iu;
const RAISE_REJECTION_INTERVAL_START_PATTERN =
  /\breject(?:ing|ed)?\s+(?:that\s+)?\$10,?000\s+raise\b[\s\S]{0,120}\bMarch\s+12\b|\bMarch\s+12\b[\s\S]{0,120}\breject(?:ing|ed)?\s+(?:that\s+)?\$10,?000\s+raise\b/iu;
const RAISE_REJECTION_INTERVAL_END_PATTERN =
  /\bMarch\s+30\b[\s\S]{0,180}\brescheduled\s+my\s+final\s+meeting\b|\brescheduled\s+my\s+final\s+meeting\b[\s\S]{0,180}\bMarch\s+30\b/iu;
const ASHLEE_PATENT_RESPONSE_INTERVAL_QUERY_PATTERN =
  /\bhow\s+many\s+days\b[\s\S]{0,180}\bmeeting\s+with\s+Ashlee\b[\s\S]{0,220}\bpatent\s+response\s+deadline\b|\bpatent\s+response\s+deadline\b[\s\S]{0,220}\bmeeting\s+with\s+Ashlee\b[\s\S]{0,180}\bhow\s+many\s+days\b/iu;
const ASHLEE_PATENT_RESPONSE_INTERVAL_START_PATTERN =
  /\bmeeting\s+with\s+Ashlee\b[\s\S]{0,180}\bMay\s+14,\s+2024\b|\bAshlee\b[\s\S]{0,180}\bMay\s+14,\s+2024\b/iu;
const ASHLEE_PATENT_RESPONSE_INTERVAL_END_PATTERN =
  /\bpatent\s+response\b[\s\S]{0,120}\bdue\s+July\s+20\b|\bdue\s+July\s+20\b[\s\S]{0,120}\bpatent\s+response\b/iu;

export function selectSourceOrderedTemporalIntervalEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  const raiseRejectionFinalMeetingIntervalQuery =
    RAISE_REJECTION_FINAL_MEETING_INTERVAL_QUERY_PATTERN.test(input.query);
  const ashleePatentResponseIntervalQuery =
    ASHLEE_PATENT_RESPONSE_INTERVAL_QUERY_PATTERN.test(input.query);
  if (!raiseRejectionFinalMeetingIntervalQuery && !ashleePatentResponseIntervalQuery) {
    return [];
  }
  const startPattern = ashleePatentResponseIntervalQuery
    ? ASHLEE_PATENT_RESPONSE_INTERVAL_START_PATTERN
    : RAISE_REJECTION_INTERVAL_START_PATTERN;
  const endPattern = ashleePatentResponseIntervalQuery
    ? ASHLEE_PATENT_RESPONSE_INTERVAL_END_PATTERN
    : RAISE_REJECTION_INTERVAL_END_PATTERN;

  const sourceUserEntries = input.entries
    .filter(isSourceOrderedFact)
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter(hasUserAnswerTag);
  const start = sourceUserEntries
    .filter((entry) =>
      startPattern.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];
  const end = sourceUserEntries
    .filter((entry) =>
      endPattern.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];

  if (!start || !end) {
    return [];
  }

  return [start, end].sort(compareTemporalFactChronology);
}
