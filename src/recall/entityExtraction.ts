// Deterministic, embedding-free entity extraction for candidate admission.
//
// This packages the salient-term heuristic already proven in iterativeRecall's
// bridge-entity extraction (capitalized proper nouns + numeric values, stop-word
// filtered) as a reusable normalizer, and adds a document-frequency index so an
// admission arm can gate on RARE-entity overlap rather than admitting a fact for
// any shared common token.
//
// The mechanism it enables: a query names an entity E; a stored fact that also
// contains E is surfaced past the lexical floor even when its surrounding token
// overlap with the query is weak (the LoCoMo "question<->gold-turn token overlap
// ~0.29" phrasing gap). It is provider-free and deterministic by construction —
// no embeddings, no LLM, offline — so it lifts the rules-only floor rather than
// depending on a neural endpoint.
//
// Scope note: this surfaces facts sharing a query entity. It is NOT a multi-hop
// bridge (where the query does not name the bridge entity) — that is
// iterativeRecall's two-pass job, a separately measured (and, on LoCoMo, banked-
// negative) lever. Keeping the two mechanisms distinct is deliberate.

// Lower-cased tokens that never count as entities: pronouns, question words,
// auxiliaries, and high-frequency function words. Mirrors iterativeRecall's
// BRIDGE_STOPWORDS so the two extractors agree on what is "salient", plus a few
// generic relational nouns that are capitalized often enough to add noise.
const ENTITY_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "and",
  "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from", "as",
  "that", "this", "these", "those", "it", "its", "they", "them", "their", "i",
  "my", "me", "we", "our", "you", "your", "he", "she", "his", "her", "do",
  "does", "did", "has", "have", "had", "will", "would", "can", "could", "what",
  "when", "where", "which", "who", "whom", "whose", "why", "how", "not", "no",
  "yes", "if", "then", "than", "so", "such", "there", "here", "about",
]);

const MIN_ENTITY_TOKEN_LENGTH = 2;

// Candidate tokens: alphanumeric runs allowing internal apostrophes/hyphens,
// same shape as iterativeRecall — "O'Brien" and "co-op" stay whole, while
// dotted/coloned strings deliberately split ("D11:26" -> "d11","26";
// "v18.15.0" -> "v18","15","0"), pinned by the extraction unit test.
const ENTITY_TOKEN_PATTERN = /[A-Za-z0-9][A-Za-z0-9'-]*/gu;

export type EntityKind = "proper" | "numeric";

export interface ExtractedEntity {
  // Match key: lower-cased, trailing possessive stripped.
  normalized: string;
  // First-seen surface form (for traces/debugging).
  surface: string;
  kind: EntityKind;
}

function normalizeEntityToken(raw: string): string {
  return raw.toLowerCase().replace(/'s$/u, "");
}

// A token is an entity when it is a proper noun (leading capital) or carries a
// digit (a numeric value / dated id), is long enough, and is not a stop-word.
// Numeric-or-capitalized is exactly the `proper` signal iterativeRecall ranks
// first; here it is the admission key rather than a ranking tiebreak.
function classifyEntityToken(raw: string): EntityKind | null {
  const normalized = normalizeEntityToken(raw);
  if (
    normalized.length < MIN_ENTITY_TOKEN_LENGTH ||
    ENTITY_STOPWORDS.has(normalized)
  ) {
    return null;
  }
  if (/\d/u.test(raw)) {
    return "numeric";
  }
  if (/^[A-Z]/u.test(raw)) {
    return "proper";
  }
  return null;
}

/**
 * Extract the salient entities from a piece of text, de-duplicated by their
 * normalized key (first surface/kind wins, reading order preserved). Pure and
 * deterministic.
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();
  const rawTokens = text.match(ENTITY_TOKEN_PATTERN) ?? [];
  for (const raw of rawTokens) {
    const kind = classifyEntityToken(raw);
    if (!kind) {
      continue;
    }
    const normalized = normalizeEntityToken(raw);
    if (!seen.has(normalized)) {
      seen.set(normalized, { normalized, surface: raw, kind });
    }
  }
  return [...seen.values()];
}

/** The set of normalized entity keys in a piece of text. */
export function extractEntityKeys(text: string): Set<string> {
  return new Set(extractEntities(text).map((entity) => entity.normalized));
}

export interface EntityDocument {
  content: string;
  id: string;
}

/**
 * Count, for each normalized entity key, how many documents contain it. This is
 * the rarity signal the admission arm gates on: an entity present in most
 * documents (e.g. a conversation's two speaker names) carries little discriminative
 * value, while a rare entity strongly implicates the few facts that mention it.
 * Presence is per-document (repeated mentions in one document count once).
 */
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
