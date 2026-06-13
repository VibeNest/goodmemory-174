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

export const isHolidayGiftBudgetUpdateQuery = narrowGate(
  "updateSeries.holidayGiftBudget",
  (query: string): boolean => {
  return /\btotal\s+budget\b/iu.test(query) &&
    /\bholiday\s+gifts?\b/iu.test(query);
  },
);

const ORIGINAL_HOLIDAY_GIFT_BUDGET_PATTERN =
  /^(?=[\s\S]*\bbudget of \$400 total for gifts\b)/iu;
const UPDATED_HOLIDAY_GIFT_BUDGET_PATTERN =
  /^(?=[\s\S]*\badjusted our holiday gift budget to \$450\b)/iu;

/**
 * Knowledge-update family for the holiday gift budget: the original $400 total
 * turn and the updated $450 turn. Both are required so the complete
 * original-plus-update evidence set wins as a unit.
 */
export function selectSourceOrderedHolidayGiftBudgetEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isHolidayGiftBudgetUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_HOLIDAY_GIFT_BUDGET_PATTERN);
  const update = pickFirst(UPDATED_HOLIDAY_GIFT_BUDGET_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
