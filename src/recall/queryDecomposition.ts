// Query decomposition for multi-part questions.
//
// A single compound question ("What database do I use and which editor did I
// switch to?") makes one retrieval query that matches neither part well. The
// evidence is that decomposing into sub-questions and retrieving each
// separately lifts recall, and that the lift is *larger* on lexical/BM25
// retrievers than on dense ones (it is the embedding-free, lexical-compatible
// cousin of HyDE; HyDE itself needs dense embeddings and is deliberately not
// used here). IRCoT shows decomposed/iterated retrieval adds double-digit
// multi-hop recall on a pure BM25 stage (arXiv:2212.10509).
//
// This module is provider-free and generic over the recall result type, exactly
// like iterativeRecall: the caller supplies a `recall` closure (bound to
// scope/strategy) and a `merge` for its own result type, so it never touches the
// recall engine internals or the api-layer RecallResult, and stays unit-testable
// with fakes. The default decomposer is a deterministic heuristic splitter; an
// LLM decomposer can be injected via `decompose` when a provider is available.

const DEFAULT_MAX_SUB_QUERIES = 4;
const DEFAULT_MIN_SUB_QUERY_WORDS = 2;

// Split on sentence / clause boundaries, then on coordination or an explicit
// `with` facet that can stand as a useful secondary retrieval query.
const CLAUSE_BOUNDARY_PATTERN = /[?.;!\n]+/u;
const QUERY_FACET_BOUNDARY_PATTERN =
  /\s+(?:and|&|as well as|along with|with)\s+/iu;

function countWords(text: string): number {
  return text.split(/\s+/u).filter((token) => token.length > 0).length;
}

export interface QueryDecompositionOptions {
  /** Maximum number of sub-queries to keep (excludes the original query). Default 4. */
  maxSubQueries?: number;
  /** Minimum word count for a fragment to count as a sub-query. Default 2. */
  minWords?: number;
}

/**
 * Deterministically split a compound query into sub-queries by clause and
 * coordinating-conjunction boundaries. Returns `[]` when the query has no
 * genuine multi-part structure (so the caller falls back to a single recall),
 * and only ever returns two or more distinct fragments. Pure and deterministic.
 */
export function splitQueryIntoSubQueries(
  query: string,
  options?: QueryDecompositionOptions,
): string[] {
  const minWords = options?.minWords ?? DEFAULT_MIN_SUB_QUERY_WORDS;
  const normalized = query.trim();
  if (normalized.length === 0) {
    return [];
  }
  const original = normalized
    .replace(/[?.;!]+$/u, "")
    .trim()
    .toLowerCase();

  const fragments: string[] = [];
  for (const clause of normalized.split(CLAUSE_BOUNDARY_PATTERN)) {
    for (const piece of clause.split(QUERY_FACET_BOUNDARY_PATTERN)) {
      const trimmed = piece.trim();
      if (trimmed.length > 0) {
        fragments.push(trimmed);
      }
    }
  }

  const seen = new Set<string>();
  const subQueries: string[] = [];
  for (const fragment of fragments) {
    const key = fragment.toLowerCase();
    if (key === original || seen.has(key) || countWords(fragment) < minWords) {
      continue;
    }
    seen.add(key);
    subQueries.push(fragment);
  }
  // Only treat it as a decomposition when there are genuinely multiple parts.
  return subQueries.length >= 2
    ? subQueries.slice(0, options?.maxSubQueries ?? DEFAULT_MAX_SUB_QUERIES)
    : [];
}

export interface DecomposedRecallOutcome<TResult> {
  /** The sub-queries actually recalled (empty when the query did not decompose). */
  subQueries: string[];
  /** Total number of recall calls performed (1 when there was no decomposition). */
  queriesRun: number;
  /** The merged result, or the single primary result when there was no decomposition. */
  result: TResult;
}

/**
 * Decompose `query`, run `recall` for the original query and each sub-query, and
 * combine the results with the caller-supplied `merge`. When the query does not
 * decompose, returns the single primary recall unchanged (one recall call), so
 * this is a strict no-op for ordinary single-part queries. Provider-free: inject
 * an LLM `decompose` to upgrade beyond the default heuristic splitter.
 */
export async function decomposedRecall<TResult>(input: {
  query: string;
  recall: (query: string) => Promise<TResult>;
  merge: (primary: TResult, supplementary: TResult[]) => TResult;
  decompose?: (query: string) => string[] | Promise<string[]>;
  options?: QueryDecompositionOptions;
}): Promise<DecomposedRecallOutcome<TResult>> {
  const maxSubQueries = input.options?.maxSubQueries ?? DEFAULT_MAX_SUB_QUERIES;
  const decompose = input.decompose ?? ((query: string) =>
    splitQueryIntoSubQueries(query, input.options));
  const rawSubQueries = await decompose(input.query);

  const originalKey = input.query.trim().toLowerCase();
  const seen = new Set<string>();
  const subQueries: string[] = [];
  for (const candidate of rawSubQueries) {
    const trimmed = candidate.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || key === originalKey || seen.has(key)) {
      continue;
    }
    seen.add(key);
    subQueries.push(trimmed);
    if (subQueries.length >= maxSubQueries) {
      break;
    }
  }

  const primary = await input.recall(input.query);
  if (subQueries.length === 0) {
    return { subQueries: [], queriesRun: 1, result: primary };
  }
  const supplementary = await Promise.all(
    subQueries.map((subQuery) => input.recall(subQuery)),
  );
  return {
    subQueries,
    queriesRun: 1 + subQueries.length,
    result: input.merge(primary, supplementary),
  };
}
