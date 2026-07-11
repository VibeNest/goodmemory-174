// Reranking seam for a precise second-stage over a lexical first stage.
//
// The single most reliable accuracy lever in the retrieval literature is
// reranking a first-stage candidate set with a model that sees the full
// query-document pair, and crucially it does NOT need a dense first stage:
// rerankers operating on a BM25-only top-100 lift nDCG@10 from ~40 to 71-75
// (arXiv:2508.16757), and Anthropic's contextual-retrieval result improves
// further with a reranker on top of BM25 + embeddings. The same study warns that
// listwise LLM rerankers are a latency/overfitting trap (one ran 53 minutes for a
// workload a small cross-encoder did in ~12s, with order-sensitivity and a
// 5-15% drop on novel queries), so the right shape is POINTWISE: score each
// document independently.
//
// GoodMemory has no neural endpoint, so this module ships the pluggable seam
// (a pointwise Reranker interface + a generic, provider-free orchestration) plus
// a deterministic embedding-free default. A consumer can inject a cross-encoder
// or pointwise-LLM reranker without touching the recall engine. The seam is the
// durable contribution; the default is a sensible, dependency-free baseline.

export interface RerankerDocument {
  id: string;
  text: string;
}

export interface RerankerScore {
  id: string;
  score: number;
}

export interface RerankerInput {
  query: string;
  documents: readonly RerankerDocument[];
}

/**
 * A pointwise reranker: score each document against the query independently.
 * Higher is more relevant. Implementations may be a cross-encoder, a pointwise
 * LLM relevance scorer, or the deterministic default below. Pointwise (not
 * listwise) by contract, to avoid the latency/order-sensitivity of listwise LLM
 * reranking.
 */
export interface Reranker {
  rerank(input: RerankerInput): Promise<RerankerScore[]>;
}

const DEFAULT_RERANK_TOP_K = 20;

export interface RerankingOutcome<T> {
  items: T[];
  scores: RerankerScore[];
  windowIds: string[];
}

function defaultTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/**
 * Reorder `items` by reranking the first `topK` of them (the candidate window)
 * with the supplied pointwise reranker; documents below the window keep their
 * position. Stable: within the window, items the reranker does not score keep
 * their original relative order at the end of the window. Pure orchestration —
 * the reranker is injected — so it is unit-testable with a fake reranker.
 */
export async function applyReranking<T extends { id: string }>(input: {
  items: readonly T[];
  query: string;
  reranker: Reranker;
  getText: (item: T) => string;
  topK?: number;
}): Promise<T[]> {
  return (await applyRerankingWithScores(input)).items;
}

export async function applyRerankingWithScores<T extends { id: string }>(input: {
  items: readonly T[];
  query: string;
  reranker: Reranker;
  getText: (item: T) => string;
  topK?: number;
}): Promise<RerankingOutcome<T>> {
  const topK = input.topK ?? DEFAULT_RERANK_TOP_K;
  if (input.items.length < 2 || topK < 2) {
    return { items: [...input.items], scores: [], windowIds: [] };
  }
  const window = input.items.slice(0, topK);
  const tail = input.items.slice(topK);
  const rawScores = await input.reranker.rerank({
    query: input.query,
    documents: window.map((item) => ({ id: item.id, text: input.getText(item) })),
  });
  const windowIds = new Set(window.map((item) => item.id));
  const scoreById = new Map(
    rawScores
      .filter(
        (score) => windowIds.has(score.id) && Number.isFinite(score.score),
      )
      .map((score) => [score.id, score.score] as const),
  );
  const reordered = window
    .map((item, index) => ({ item, index, score: scoreById.get(item.id) }))
    .sort((left, right) => {
      const leftScore = left.score ?? Number.NEGATIVE_INFINITY;
      const rightScore = right.score ?? Number.NEGATIVE_INFINITY;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return left.index - right.index;
    })
    .map((wrapped) => wrapped.item);
  return {
    items: [...reordered, ...tail],
    scores: window.flatMap((item) => {
      const score = scoreById.get(item.id);
      return score === undefined ? [] : [{ id: item.id, score }];
    }),
    windowIds: window.map((item) => item.id),
  };
}

/**
 * A deterministic, embedding-free pointwise reranker scoring each document by
 * the fraction of distinct query terms it covers, plus a bonus when the document
 * contains the full query as a substring (exact-phrase signal). This emphasizes
 * precision/coverage differently from the BM25 first stage and needs no model;
 * it is the default until a cross-encoder/LLM reranker is injected.
 */
export function createLexicalCoverageReranker(options?: {
  tokenize?: (text: string) => string[];
  phraseBonus?: number;
}): Reranker {
  const tokenize = options?.tokenize ?? defaultTokenize;
  const phraseBonus = options?.phraseBonus ?? 0.5;
  return {
    async rerank({ query, documents }) {
      const queryTerms = new Set(tokenize(query));
      const normalizedQuery = query.trim().toLowerCase();
      if (queryTerms.size === 0) {
        return documents.map((document) => ({ id: document.id, score: 0 }));
      }
      return documents.map((document) => {
        const documentTerms = new Set(tokenize(document.text));
        let covered = 0;
        for (const term of queryTerms) {
          if (documentTerms.has(term)) {
            covered += 1;
          }
        }
        const coverage = covered / queryTerms.size;
        const bonus =
          normalizedQuery.length > 0 &&
          document.text.toLowerCase().includes(normalizedQuery)
            ? phraseBonus
            : 0;
        return { id: document.id, score: coverage + bonus };
      });
    },
  };
}
