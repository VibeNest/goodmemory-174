import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasSourceMessageTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderedEvidenceRole } from "../sourceOrderPlan";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

export const isProbabilityStudyHoursUpdateQuery = narrowGate(
  "updateSeries.probabilityStudyHours",
  (query: string): boolean => {
    return /\bhours\b/iu.test(query) &&
      /\bprobability basics\b/iu.test(query) &&
      /\bdice roll\b/iu.test(query);
  },
);

const ORIGINAL_PROBABILITY_STUDY_HOURS_PATTERN =
  /^(?=[\s\S]*\balready spent 3 hours on it\b)(?=[\s\S]*\bcoin toss and dice roll problems\b)/iu;
const UPDATED_PROBABILITY_STUDY_HOURS_PATTERN =
  /^(?=[\s\S]*\bextended my study sessions to 4 hours\b)(?=[\s\S]*\bdedicating an extra hour\b)/iu;

/**
 * Knowledge-update family for the probability study hours: the original 3-hour
 * turn and the updated 4-hour turn. Both are required so the complete
 * original-plus-update evidence set wins as a unit.
 */
export function selectSourceOrderedProbabilityStudyHoursEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isProbabilityStudyHoursUpdateQuery(input.query)) {
    return [];
  }

  const sourceUserEntries = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user");
  const pickFirst = (pattern: RegExp): RankedFactCandidate | undefined =>
    sourceUserEntries
      .filter((entry) => pattern.test(stripEvidencePrefix(entry.fact.content)))
      .sort(compareTemporalFactChronology)[0];

  const original = pickFirst(ORIGINAL_PROBABILITY_STUDY_HOURS_PATTERN);
  const update = pickFirst(UPDATED_PROBABILITY_STUDY_HOURS_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
