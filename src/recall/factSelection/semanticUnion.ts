import type { RankedFactCandidate } from "../scoring";
import type { SelectionDraft } from "./contracts";

export interface SemanticUnionCandidate {
  id: string;
  // RAW vector-store score, pre-normalization (see SemanticFactCandidate).
  score: number;
}

export interface SemanticUnionSelectionInput {
  candidates: readonly SemanticUnionCandidate[];
  // Noise budget: maximum facts admitted by the union. Dedup hits and
  // pool-miss candidates consume no budget.
  maxAdditions: number;
  // RAW score floor; candidates below it are never admitted.
  minSimilarity?: number;
}

/**
 * Semantic candidate-generation UNION: force-admit the vector top-K facts into
 * the selection draft regardless of lexical/intent/subject signal. This is the
 * only admission path that can surface a zero-lexical-overlap fact — every
 * route, augmenter, and the zero-retrieval fallback key on lexical-family
 * signals, and the additive semanticScore only re-ranks already-admitted
 * candidates.
 *
 * Strictly additive by construction: it runs after every route/augmenter/
 * fallback, dedupes against the draft via selectedIds, and admits only facts
 * still present in the compatible pool (active lifecycle + locale-compatible),
 * so a stale vector row or a deleted/filtered fact is never admitted and
 * everything the pre-union path returned is returned unchanged, in order.
 */
export function selectSemanticUnionCandidates(input: {
  compatible: readonly RankedFactCandidate[];
  draft: SelectionDraft;
  union: SemanticUnionSelectionInput;
}): void {
  const { compatible, draft, union } = input;
  if (union.maxAdditions <= 0 || union.candidates.length === 0) {
    return;
  }
  const byFactId = new Map<string, RankedFactCandidate>();
  for (const entry of compatible) {
    byFactId.set(entry.fact.id, entry);
  }
  // Raw-score descending; deterministic id tie-break.
  const ordered = [...union.candidates].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id),
  );
  let admitted = 0;
  for (const candidate of ordered) {
    if (admitted >= union.maxAdditions) {
      break;
    }
    if (candidate.score <= 0) {
      // A non-positive raw score carries no similarity signal at all; admitting
      // it would be pure noise. Sorted descending: everything after is too.
      break;
    }
    if (union.minSimilarity !== undefined && candidate.score < union.minSimilarity) {
      // Sorted descending: everything after is below the floor too.
      break;
    }
    if (draft.selectedIds.has(candidate.id)) {
      continue;
    }
    const entry = byFactId.get(candidate.id);
    if (!entry) {
      continue;
    }
    draft.select(entry, "generic", "semantic_union");
    admitted += 1;
  }
}
