// Embedding-free candidate-admission probe retained for historical eval
// comparison. Production retrieval uses generalizedFusion.ts instead.

const ENTITY_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by",
  "from", "as", "that", "this", "these", "those", "it", "its", "they",
  "them", "their", "i", "my", "me", "we", "our", "you", "your", "he",
  "she", "his", "her", "do", "does", "did", "has", "have", "had",
  "will", "would", "can", "could", "what", "when", "where", "which",
  "who", "whom", "whose", "why", "how", "not", "no", "yes", "if",
  "then", "than", "so", "such", "there", "here", "about",
]);
const ENTITY_TOKEN_PATTERN = /[A-Za-z0-9][A-Za-z0-9'-]*/gu;

export type EntityKind = "proper" | "numeric";

export interface ExtractedEntity {
  kind: EntityKind;
  normalized: string;
  surface: string;
}

export interface EntityDocument {
  content: string;
  id: string;
}

function normalizeEntityToken(raw: string): string {
  return raw.toLowerCase().replace(/'s$/u, "");
}

function classifyEntityToken(raw: string): EntityKind | null {
  const normalized = normalizeEntityToken(raw);
  if (normalized.length < 2 || ENTITY_STOPWORDS.has(normalized)) {
    return null;
  }
  if (/\d/u.test(raw)) {
    return "numeric";
  }
  return /^[A-Z]/u.test(raw) ? "proper" : null;
}

export function extractEntities(text: string): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();
  for (const raw of text.match(ENTITY_TOKEN_PATTERN) ?? []) {
    const kind = classifyEntityToken(raw);
    if (!kind) {
      continue;
    }
    const normalized = normalizeEntityToken(raw);
    if (!seen.has(normalized)) {
      seen.set(normalized, { kind, normalized, surface: raw });
    }
  }
  return [...seen.values()];
}

export function extractEntityKeys(text: string): Set<string> {
  return new Set(extractEntities(text).map(({ normalized }) => normalized));
}

export function buildEntityDocumentFrequency(
  documents: readonly EntityDocument[],
): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const document of documents) {
    for (const key of extractEntityKeys(document.content)) {
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  return frequency;
}

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
