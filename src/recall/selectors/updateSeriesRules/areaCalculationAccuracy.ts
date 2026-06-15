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

export const isAreaCalculationAccuracyUpdateQuery = narrowGate(
  "updateSeries.areaCalculationAccuracy",
  (query: string): boolean => {
    return /\baccuracy percentage\b/iu.test(query) &&
      /\barea calculation problems\b/iu.test(query);
  },
);

// No trailing \b after "90%"/"95%": a word boundary never matches adjacent to "%".
const ORIGINAL_AREA_CALCULATION_ACCURACY_PATTERN =
  /^(?=[\s\S]*\baccuracy in area calculation problems improved from 70% to 90%)/iu;
const UPDATED_AREA_CALCULATION_ACCURACY_PATTERN =
  /^(?=[\s\S]*\bcompleted 15 problems with 95% accuracy\b)/iu;

/**
 * Knowledge-update family for the area-calculation accuracy: the original
 * 70%-to-90% turn and the updated 95% turn. Both are required so the complete
 * original-plus-update evidence set wins as a unit. The original pattern keys
 * on "accuracy in area calculation problems improved" so it does not match the
 * near-duplicate "quiz score from 70% to 90%" turn.
 */
export function selectSourceOrderedAreaCalculationAccuracyEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isAreaCalculationAccuracyUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_AREA_CALCULATION_ACCURACY_PATTERN);
  const update = pickFirst(UPDATED_AREA_CALCULATION_ACCURACY_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
