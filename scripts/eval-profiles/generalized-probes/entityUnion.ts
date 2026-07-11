import {
  buildEntityDocumentFrequency,
  extractEntityKeys,
} from "../../../src/recall/entityExtraction";
import type { EntityDocument } from "../../../src/recall/entityExtraction";

// Embedding-free candidate-admission probe retained for historical eval
// comparison. Production retrieval uses generalizedFusion.ts instead.

export type EntityUnionDocument = EntityDocument;

export interface EntityUnionGates {
  minEntityOverlap: number;
  rareEntityMaxDocFrequency: number;
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
  documentFrequency?: Map<string, number>;
  alreadySelectedIds?: ReadonlySet<string>;
  maxAdditions: number;
  gates?: Partial<EntityUnionGates>;
}

export interface EntityUnionAdmission {
  id: string;
  sharedEntities: string[];
  rareSharedEntities: string[];
  rarityScore: number;
}

export interface EntityUnionResult {
  admittedIds: string[];
  admissions: EntityUnionAdmission[];
}

const EMPTY_RESULT: EntityUnionResult = { admittedIds: [], admissions: [] };

export function selectEntityUnionCandidates(
  input: EntityUnionInput,
): EntityUnionResult {
  const gates: EntityUnionGates = {
    ...DEFAULT_ENTITY_UNION_GATES,
    ...input.gates,
  };
  if (input.maxAdditions <= 0 || input.documents.length === 0) {
    return EMPTY_RESULT;
  }
  const queryEntities = extractEntityKeys(input.query);
  if (queryEntities.size === 0) {
    return EMPTY_RESULT;
  }
  const frequency =
    input.documentFrequency ?? buildEntityDocumentFrequency(input.documents);
  const candidates: EntityUnionAdmission[] = [];
  for (const document of input.documents) {
    if (input.alreadySelectedIds?.has(document.id)) {
      continue;
    }
    const sharedEntities: string[] = [];
    const rareSharedEntities: string[] = [];
    let rarityScore = 0;
    for (const key of extractEntityKeys(document.content)) {
      if (!queryEntities.has(key)) {
        continue;
      }
      sharedEntities.push(key);
      const documentFrequency = Math.max(1, frequency.get(key) ?? 1);
      rarityScore += 1 / documentFrequency;
      if (documentFrequency <= gates.rareEntityMaxDocFrequency) {
        rareSharedEntities.push(key);
      }
    }
    if (sharedEntities.length === 0) {
      continue;
    }
    const passesRareEntity = rareSharedEntities.length > 0;
    const passesOverlap =
      !gates.requireRareEntity &&
      sharedEntities.length >= gates.minEntityOverlap;
    if (!passesRareEntity && !passesOverlap) {
      continue;
    }
    candidates.push({
      id: document.id,
      rareSharedEntities: rareSharedEntities.sort(),
      rarityScore,
      sharedEntities: sharedEntities.sort(),
    });
  }

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
