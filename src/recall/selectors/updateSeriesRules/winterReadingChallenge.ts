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

export const isWinterReadingChallengeUpdateQuery = narrowGate(
  "updateSeries.winterReadingChallenge",
  (query: string): boolean => {
  return /\bhow many books\b/iu.test(query) &&
    /\bwinter reading challenge\b/iu.test(query);
  },
);

const ORIGINAL_CHALLENGE_GOAL_PATTERN =
  /^(?=[\s\S]*\bwinter reading challenge on Goodreads aiming for 10 books by March 1\b)/iu;
const EXTENDED_CHALLENGE_GOAL_PATTERN =
  /^(?=[\s\S]*\bextended my reading challenge goal to 12 books by March 1\b)/iu;

/**
 * Knowledge-update family for the winter reading challenge goal: the
 * original 10-book Goodreads target and the extended 12-book goal. Both are
 * required so the complete original-plus-update evidence set wins as a unit;
 * assistant echoes of both turns are excluded by the user-role filter.
 */
export function selectSourceOrderedWinterReadingChallengeEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isWinterReadingChallengeUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_CHALLENGE_GOAL_PATTERN);
  const extended = pickFirst(EXTENDED_CHALLENGE_GOAL_PATTERN);

  if (!original || !extended) {
    return [];
  }

  return [original, extended].sort(compareTemporalFactChronology);
}
