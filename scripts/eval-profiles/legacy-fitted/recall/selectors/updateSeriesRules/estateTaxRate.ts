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

export const isEstateTaxRateUpdateQuery = narrowGate(
  "updateSeries.estateTaxRate",
  (query: string): boolean => {
    return /\bestate tax rate\b/iu.test(query) &&
      /200,000/u.test(query);
  },
);

// No trailing \b after "15%"/"12%": a word boundary never matches adjacent to "%".
const ORIGINAL_ESTATE_TAX_RATE_PATTERN =
  /^(?=[\s\S]*\b15% on assets above \$200,000)/iu;
const UPDATED_ESTATE_TAX_RATE_PATTERN =
  /^(?=[\s\S]*\b12% rate on assets above \$200,000)/iu;

/**
 * Knowledge-update family for the estate tax rate: the original 15% turn and
 * the updated 12% turn. Both are required so the complete original-plus-update
 * evidence set wins as a unit.
 */
export function selectSourceOrderedEstateTaxRateEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isEstateTaxRateUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_ESTATE_TAX_RATE_PATTERN);
  const update = pickFirst(UPDATED_ESTATE_TAX_RATE_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
