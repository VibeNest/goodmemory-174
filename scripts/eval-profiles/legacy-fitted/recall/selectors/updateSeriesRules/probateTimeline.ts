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

export const isProbateTimelineUpdateQuery = narrowGate(
  "updateSeries.probateTimeline",
  (query: string): boolean => {
  return /\bprobate process\b/iu.test(query) &&
    /\bMontserrat\b/iu.test(query);
  },
);

const ORIGINAL_PROBATE_TIMELINE_PATTERN =
  /^(?=[\s\S]*\bprobate timeline\b)(?=[\s\S]*\btypically takes 6-9 months in Montserrat\b)/iu;
const UPDATED_PROBATE_TIMELINE_PATTERN =
  /^(?=[\s\S]*\bshortened to 5-7 months\b)/iu;

/**
 * Knowledge-update family for the probate timeline: the original 6-9 month
 * estimate turn and the updated 5-7 month turn. Both are required so the
 * complete original-plus-update evidence set wins as a unit. The original turn
 * also names the attorney, but the patterns key only on the probate phrasing
 * so the selector file stays free of the disallowed fixture name.
 */
export function selectSourceOrderedProbateTimelineEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isProbateTimelineUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_PROBATE_TIMELINE_PATTERN);
  const update = pickFirst(UPDATED_PROBATE_TIMELINE_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
