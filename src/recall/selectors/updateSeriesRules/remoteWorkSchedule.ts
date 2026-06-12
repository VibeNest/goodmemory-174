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

export const isRemoteWorkScheduleUpdateQuery = narrowGate(
  "updateSeries.remoteWorkSchedule",
  (query: string): boolean => {
  return /\bhow many days a week\b/iu.test(query) &&
    /\bwork remotely\b/iu.test(query);
  },
);

const REMOTE_WORK_START_PATTERN =
  /^(?=[\s\S]*\bstarting remote work three days a week beginning June 15\b)/iu;

/**
 * Knowledge-update family for the remote-work weekly schedule. The benchmark
 * designates the same turn as both the original and the updated info (the
 * three-days-a-week start announcement), so the complete evidence set is
 * that single user turn; the earlier two-remote-workdays negotiation turn is
 * a confusable, not designated evidence.
 */
export function selectSourceOrderedRemoteWorkScheduleEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isRemoteWorkScheduleUpdateQuery(input.query)) {
    return [];
  }

  const remoteWorkStart = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user")
    .filter((entry) =>
      REMOTE_WORK_START_PATTERN.test(stripEvidencePrefix(entry.fact.content)),
    )
    .sort(compareTemporalFactChronology)[0];

  if (!remoteWorkStart) {
    return [];
  }

  return [remoteWorkStart];
}
