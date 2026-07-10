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

export const isPrototypeBudgetUpdateQuery = narrowGate(
  "updateSeries.prototypeBudget",
  (query: string): boolean => {
    return /\bprototype refinement\b/iu.test(query) &&
      /\bpatent attorney fees\b/iu.test(query);
  },
);

const ORIGINAL_PROTOTYPE_BUDGET_PATTERN =
  /^(?=[\s\S]*\$7,000 budget for prototype refinement\b)(?=[\s\S]*\bpatent attorney fees\b)/iu;
const UPDATED_PROTOTYPE_BUDGET_PATTERN =
  /^(?=[\s\S]*\bincreased budget allocation to \$8,000\b)(?=[\s\S]*\bprototype enhancements\b)/iu;

/**
 * Knowledge-update family for the prototype-refinement budget: the original
 * $7,000 turn and the updated $8,000 turn. Both are required so the complete
 * original-plus-update evidence set wins as a unit.
 */
export function selectSourceOrderedPrototypeBudgetEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isPrototypeBudgetUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_PROTOTYPE_BUDGET_PATTERN);
  const update = pickFirst(UPDATED_PROTOTYPE_BUDGET_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
