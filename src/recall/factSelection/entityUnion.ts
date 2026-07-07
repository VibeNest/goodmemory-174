import {
  buildEntityDocumentFrequency,
  type EntityDocument,
  extractEntityKeys,
} from "../entityExtraction";

// Entity candidate-generation UNION (embedding-free sibling of semanticUnion).
//
// Force-admit facts that share a query entity past the lexical floor, exactly
// like the semantic union force-admits vector top-K past it — but keyed on
// deterministic entity overlap instead of a neural score, so it needs no
// provider and lifts the rules-only floor.
//
// It is PRECISION-GATED on purpose: sharing any single common token must not
// admit a fact (that is just noise, and LoCoMo's two speaker names appear in
// nearly every turn). A fact is admitted only when it shares a RARE entity with
// the query (few facts mention it, so the overlap is discriminative) OR shares
// at least `minEntityOverlap` distinct entities. Rarity is measured against the
// candidate pool via document frequency.
//
// This module is engine-decoupled: it operates on a minimal {id, content}
// document shape and returns admitted ids, so an eval runner can call it
// directly on raw turns and a future engine adapter can wrap it into
// selection.ts alongside selectSemanticUnionCandidates. It is strictly additive
// (returns extra ids, never reorders or drops existing selections) and
// budget-capped by maxAdditions.

export interface EntityUnionDocument extends EntityDocument {}

export interface EntityUnionGates {
  // Admit when the query and a fact share at least this many distinct entities,
  // regardless of rarity. Set high to lean entirely on the rare-entity gate.
  minEntityOverlap: number;
  // An entity is "rare" (discriminative) when it appears in at most this many
  // documents across the pool.
  rareEntityMaxDocFrequency: number;
  // When true, a shared RARE entity is required — the minEntityOverlap path
  // alone cannot admit. When false, either gate admits.
  requireRareEntity: boolean;
}

export const DEFAULT_ENTITY_UNION_GATES: EntityUnionGates = {
  minEntityOverlap: 2,
  rareEntityMaxDocFrequency: 2,
  requireRareEntity: false,
};

export interface EntityUnionInput {
  query: string;
  documents: readonly EntityUnionDocument[];
  // Precomputed document frequency (normalized entity key -> document count).
  // Defaults to the frequency of `documents` when omitted. Pass an explicit
  // index when the rarity pool differs from the admission pool.
  documentFrequency?: Map<string, number>;
  alreadySelectedIds?: ReadonlySet<string>;
  // Noise budget: maximum facts admitted. Dedup hits and non-overlapping facts
  // consume no budget.
  maxAdditions: number;
  gates?: Partial<EntityUnionGates>;
}

export interface EntityUnionAdmission {
  id: string;
  sharedEntities: string[];
  rareSharedEntities: string[];
  // Sum of 1/documentFrequency over shared entities: an IDF-like strength that
  // ranks rarer overlaps first.
  rarityScore: number;
}

export interface EntityUnionResult {
  admittedIds: string[];
  admissions: EntityUnionAdmission[];
}

const EMPTY_RESULT: EntityUnionResult = { admittedIds: [], admissions: [] };

/**
 * Select the entity-union admissions for a query over a candidate pool. Pure and
 * deterministic: same inputs always yield the same ordered admissions.
 */
export function selectEntityUnionCandidates(
  input: EntityUnionInput,
): EntityUnionResult {
  const gates: EntityUnionGates = { ...DEFAULT_ENTITY_UNION_GATES, ...input.gates };
  if (input.maxAdditions <= 0 || input.documents.length === 0) {
    return EMPTY_RESULT;
  }
  const queryEntities = extractEntityKeys(input.query);
  if (queryEntities.size === 0) {
    return EMPTY_RESULT;
  }
  const frequency =
    input.documentFrequency ?? buildEntityDocumentFrequency(input.documents);
  const alreadySelected = input.alreadySelectedIds;

  const candidates: EntityUnionAdmission[] = [];
  for (const document of input.documents) {
    if (alreadySelected?.has(document.id)) {
      continue;
    }
    const shared: string[] = [];
    const rareShared: string[] = [];
    let rarityScore = 0;
    for (const key of extractEntityKeys(document.content)) {
      if (!queryEntities.has(key)) {
        continue;
      }
      shared.push(key);
      const df = Math.max(1, frequency.get(key) ?? 1);
      rarityScore += 1 / df;
      if (df <= gates.rareEntityMaxDocFrequency) {
        rareShared.push(key);
      }
    }
    if (shared.length === 0) {
      continue;
    }
    const passesRare = rareShared.length > 0;
    const passesOverlap =
      !gates.requireRareEntity && shared.length >= gates.minEntityOverlap;
    if (!passesRare && !passesOverlap) {
      continue;
    }
    candidates.push({
      id: document.id,
      rareSharedEntities: rareShared.sort(),
      rarityScore,
      sharedEntities: shared.sort(),
    });
  }

  // Rank most-discriminative first: rare overlaps, then IDF-like strength, then
  // raw overlap count, then a deterministic id tie-break.
  candidates.sort(
    (left, right) =>
      right.rareSharedEntities.length - left.rareSharedEntities.length ||
      right.rarityScore - left.rarityScore ||
      right.sharedEntities.length - left.sharedEntities.length ||
      left.id.localeCompare(right.id),
  );

  const admissions = candidates.slice(0, input.maxAdditions);
  return {
    admissions,
    admittedIds: admissions.map((admission) => admission.id),
  };
}
