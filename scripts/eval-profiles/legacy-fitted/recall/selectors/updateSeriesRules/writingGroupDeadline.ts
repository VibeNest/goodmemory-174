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

export const isWritingGroupDeadlineUpdateQuery = narrowGate(
  "updateSeries.writingGroupDeadline",
  (query: string): boolean => {
  return /\bdeadline\b/iu.test(query) &&
    /\bpeer-reviewed draft\b/iu.test(query) &&
    /\blocal writing group\b/iu.test(query);
  },
);

const ORIGINAL_DEADLINE_PATTERN =
  /^(?=[\s\S]*\bApril 20 deadline\b)(?=[\s\S]*\bpeer-reviewed draft submission to the local writing group\b)/iu;
const UPDATED_DEADLINE_PATTERN =
  /^(?=[\s\S]*\bnew April 25 deadline\b)(?=[\s\S]*\bextra peer review feedback\b)/iu;
const SCHEDULE_ACCEPTANCE_PATTERN =
  /^(?=[\s\S]*\bfollow this schedule\b)(?=[\s\S]*\bincorporate the peer feedback\b)/iu;

/**
 * Knowledge-update family for the writing-group deadline: the original
 * April 20 deadline turn, the new April 25 deadline turn, and the user's
 * schedule-acceptance turn that locks the update in. All three are required
 * so the complete original-plus-update evidence set wins as a unit.
 */
export function selectSourceOrderedWritingGroupDeadlineEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isWritingGroupDeadlineUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_DEADLINE_PATTERN);
  const update = pickFirst(UPDATED_DEADLINE_PATTERN);
  const acceptance = pickFirst(SCHEDULE_ACCEPTANCE_PATTERN);

  if (!original || !update || !acceptance) {
    return [];
  }

  return [original, update, acceptance].sort(compareTemporalFactChronology);
}
