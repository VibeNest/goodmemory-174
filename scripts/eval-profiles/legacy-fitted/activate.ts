import { setFactSelectorForInternalEval } from "../../../src/recall/selection";
import { enableLegacyFittedNarrowGatesForInternalEval } from "./recall/narrowGates";
import { selectFactsLegacy } from "./recall/selectionLegacy";

/** Activates the historical fitted selector graph for repo-local evals only. */
export function activateLegacyFittedEvalProfile(): void {
  enableLegacyFittedNarrowGatesForInternalEval();
  setFactSelectorForInternalEval(selectFactsLegacy);
}
