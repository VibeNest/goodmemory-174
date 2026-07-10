import type { FactSelector } from "./generalizedSelection";
import { selectGeneralizedFactsForInternalUse } from "./generalizedSelection";

export {
  selectGeneralizedFactsForInternalUse,
};
export type { FactSelector };
export {
  selectArchives,
  selectEpisodes,
  selectFeedback,
  selectFeedbackForProfile,
  selectFeedbackForQuery,
  selectPreferencesForQuery,
  selectReferences,
} from "./selectors/recordSelection";

let internalFactSelector: FactSelector | undefined;

export const selectFacts: FactSelector = (...args) =>
  (internalFactSelector ?? selectGeneralizedFactsForInternalUse)(...args);

/** Repo-only compatibility seam for historical evals and focused legacy tests. */
export function setFactSelectorForInternalEval(
  selector: FactSelector | undefined,
): void {
  internalFactSelector = selector;
}

export function __resetFactSelectorForTest(): void {
  internalFactSelector = undefined;
}
