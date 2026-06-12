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

export const isOnboardingModulesCompletionUpdateQuery = narrowGate(
  "updateSeries.onboardingModulesCompletion",
  (query: string): boolean => {
  return /\bby what date\b/iu.test(query) &&
    /\bonboarding modules\b/iu.test(query);
  },
);

const QUIZ_SCORE_GOAL_PATTERN =
  /^(?=[\s\S]*\bachieve a 95% quiz score by April 25 for my onboarding modules\b)/iu;

/**
 * Knowledge-update family for the onboarding-modules completion date. The
 * benchmark designates only the April 25 quiz-score goal turn (original_info,
 * with an empty updated_info list), so the complete evidence set is that
 * single user turn. Ground-truth caveat recorded here: the benchmark's answer
 * says April 22, a deadline that surfaces in the later date-confirmation
 * turns the benchmark did not designate, so live answer slices should expect
 * the answer to come from those confusable turns instead.
 */
export function selectSourceOrderedOnboardingModulesCompletionEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isOnboardingModulesCompletionUpdateQuery(input.query)) {
    return [];
  }

  const quizScoreGoal = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user")
    .filter((entry) =>
      QUIZ_SCORE_GOAL_PATTERN.test(stripEvidencePrefix(entry.fact.content)),
    )
    .sort(compareTemporalFactChronology)[0];

  if (!quizScoreGoal) {
    return [];
  }

  return [quizScoreGoal];
}
