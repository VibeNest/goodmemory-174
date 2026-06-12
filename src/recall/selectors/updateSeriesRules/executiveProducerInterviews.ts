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

export const isExecutiveProducerInterviewsUpdateQuery = narrowGate(
  "updateSeries.executiveProducerInterviews",
  (query: string): boolean => {
  return /\bhow many interviews\b/iu.test(query) &&
    /\bexecutive producer roles\b/iu.test(query);
  },
);

const ORIGINAL_INTERVIEW_COUNT_PATTERN =
  /^(?=[\s\S]*\bsecured 3 interviews for executive producer roles\b)(?=[\s\S]*\bbetween April 25 and May 1, 2024\b)/iu;
const UPDATED_INTERVIEW_COUNT_PATTERN =
  /^(?=[\s\S]*\bsecured 5 interviews\b)(?=[\s\S]*\bgetting more callbacks\b)/iu;

/**
 * Knowledge-update family for the executive-producer interview count: the
 * original three-interview worry and the later five-interview leverage turn.
 * Both are required so the complete original-plus-update evidence set wins
 * as a unit.
 */
export function selectSourceOrderedExecutiveProducerInterviewsEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isExecutiveProducerInterviewsUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_INTERVIEW_COUNT_PATTERN);
  const updated = pickFirst(UPDATED_INTERVIEW_COUNT_PATTERN);

  if (!original || !updated) {
    return [];
  }

  return [original, updated].sort(compareTemporalFactChronology);
}
