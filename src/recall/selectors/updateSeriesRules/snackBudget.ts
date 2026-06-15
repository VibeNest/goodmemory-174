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

export const isSnackBudgetUpdateQuery = narrowGate(
  "updateSeries.snackBudget",
  (query: string): boolean => {
    return /\bsnack budget\b/iu.test(query) &&
      /\bthemed treats\b/iu.test(query);
  },
);

const ORIGINAL_SNACK_BUDGET_PATTERN =
  /^(?=[\s\S]*\bincreased my snack budget to \$65\b)(?=[\s\S]*\bthemed cupcakes\b)/iu;
const UPDATED_SNACK_BUDGET_PATTERN =
  /^(?=[\s\S]*\badjusted the snack budget to \$75\b)(?=[\s\S]*\bthemed drinks\b)/iu;

/**
 * Knowledge-update family for the movie-marathon snack budget: the original
 * $65 turn and the updated $75 turn. Both are required so the complete
 * original-plus-update evidence set wins as a unit.
 */
export function selectSourceOrderedSnackBudgetEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSnackBudgetUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_SNACK_BUDGET_PATTERN);
  const update = pickFirst(UPDATED_SNACK_BUDGET_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
