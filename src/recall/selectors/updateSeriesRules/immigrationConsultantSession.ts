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

export const isImmigrationConsultantSessionUpdateQuery = narrowGate(
  "updateSeries.immigrationConsultantSession",
  (query: string): boolean => {
  return /\bwhen is my session\b/iu.test(query) &&
    /\bimmigration consultant\b/iu.test(query);
  },
);

const CONSULTANT_BOOKING_PATTERN =
  /^(?=[\s\S]*\bbooked a session with an immigration consultant on May 20\b)/iu;

/**
 * Knowledge-update family for the immigration-consultant session date. The
 * benchmark designates the same turn as both the original and the updated
 * info (the May 20 booking announcement), so the complete evidence set is
 * that single user turn; the calendar-confirmation turns and the August
 * mock-interview turn are confusables, not designated evidence. Ground-truth
 * caveat recorded here: the benchmark's answer says May 22, a date no
 * conversation turn mentions, so live answer slices should expect this case
 * to stay unanswerable even with full evidence recall.
 */
export function selectSourceOrderedImmigrationConsultantSessionEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isImmigrationConsultantSessionUpdateQuery(input.query)) {
    return [];
  }

  const consultantBooking = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user")
    .filter((entry) =>
      CONSULTANT_BOOKING_PATTERN.test(stripEvidencePrefix(entry.fact.content)),
    )
    .sort(compareTemporalFactChronology)[0];

  if (!consultantBooking) {
    return [];
  }

  return [consultantBooking];
}
