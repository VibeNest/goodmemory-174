import type { RankedFactCandidate } from "../scoring";
import type { SelectionDraft } from "./contracts";

export interface GeneralizedFusionUnionCandidate {
  id: string;
  score: number;
}

export interface GeneralizedFusionSelectionInput {
  candidates: readonly GeneralizedFusionUnionCandidate[];
  maxAdditions: number;
  maxTotalFacts?: number;
}

export function selectGeneralizedFusionCandidates(input: {
  compatible: readonly RankedFactCandidate[];
  draft: SelectionDraft;
  union: GeneralizedFusionSelectionInput;
}): void {
  if (input.union.maxAdditions <= 0 || input.union.candidates.length === 0) {
    return;
  }
  const compatibleById = new Map(
    input.compatible.map((candidate) => [candidate.fact.id, candidate]),
  );
  const ordered = [...input.union.candidates].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id),
  );
  const additionBudget = Math.min(
    input.union.maxAdditions,
    Math.max(
      0,
      (input.union.maxTotalFacts ?? Number.POSITIVE_INFINITY) -
        input.draft.selected.length,
    ),
  );
  let admitted = 0;
  for (const candidate of ordered) {
    if (admitted >= additionBudget) {
      break;
    }
    if (input.draft.selectedIds.has(candidate.id)) {
      continue;
    }
    const entry = compatibleById.get(candidate.id);
    if (!entry) {
      continue;
    }
    input.draft.select(entry, "generic", "generalized_fusion");
    admitted += 1;
  }
}
