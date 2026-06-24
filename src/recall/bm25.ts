// Okapi BM25 lexical scoring.
//
// GoodMemory's default lexical signal (`language.tokenOverlap`) is naive Jaccard
// overlap: `intersection / max(|a|, |b|)`, with no inverse-document-frequency and
// no length normalization, so a rare, highly-discriminative term counts no more
// than a common one. BM25 fixes both: it down-weights common terms (IDF),
// saturates repeated terms (k1), and normalizes for document length (b). The
// agent-memory evidence is that this matters more than dense vectors out of the
// box — BM25 is a strong zero-shot retriever that dense models "frequently
// underperform" out of domain (BEIR, arXiv:2104.08663), it is the lexical leg of
// the strongest production memory engines (Zep/Graphiti), and rerankers /
// iterative retrievers deliver large gains on a BM25-only first stage
// (arXiv:2508.16757, arXiv:2212.10509) — all without an embedding endpoint.
//
// This scorer is pure and deterministic. It returns scores in the same
// `Map<id, number>` (normalized to (0, 1]) shape as the semantic-search slot, so
// it is drop-in compatible with the recall engine's existing additive ranking
// term (`scoring.ts` `effectiveRankingScore`) and can populate it when no neural
// embedding endpoint is available.

export interface Bm25Document {
  id: string;
  text: string;
}

export interface Bm25Options {
  /** Term-frequency saturation. Standard default 1.2. */
  k1?: number;
  /** Length normalization, 0 (off) .. 1 (full). Standard default 0.75. */
  b?: number;
  /**
   * Tokenizer. Defaults to a Unicode-aware lowercase word splitter. Pass the
   * language service's locale-aware tokenizer to stay consistent with the rest
   * of recall (e.g. stopword handling, CJK segmentation).
   */
  tokenize?: (text: string) => string[];
}

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

function defaultTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/**
 * Score `documents` against `query` with Okapi BM25 and return a map from
 * document id to a relevance score normalized to (0, 1] (the maximum-scoring
 * document gets 1). Documents with zero query-term overlap are omitted, exactly
 * like an empty semantic-search result, so the result can be passed straight
 * into the recall engine's additive ranking slot. Returns an empty map when
 * there are no documents, no query terms, or no overlap.
 */
export function computeBm25Scores(
  query: string,
  documents: readonly Bm25Document[],
  options?: Bm25Options,
): Map<string, number> {
  const scores = new Map<string, number>();
  if (documents.length === 0) {
    return scores;
  }
  const k1 = options?.k1 ?? DEFAULT_K1;
  const b = options?.b ?? DEFAULT_B;
  const tokenize = options?.tokenize ?? defaultTokenize;

  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) {
    return scores;
  }

  const tfPerDoc = documents.map((document) => {
    const termFrequencies = new Map<string, number>();
    for (const token of tokenize(document.text)) {
      termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
    }
    return termFrequencies;
  });
  const docLengths = tfPerDoc.map((tf) => {
    let length = 0;
    for (const count of tf.values()) {
      length += count;
    }
    return length;
  });
  const totalLength = docLengths.reduce((sum, length) => sum + length, 0);
  const averageLength = totalLength / documents.length;
  if (averageLength === 0) {
    return scores;
  }

  const documentCount = documents.length;
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    let documentFrequency = 0;
    for (const tf of tfPerDoc) {
      if (tf.has(term)) {
        documentFrequency += 1;
      }
    }
    // BM25 IDF with the +1 smoothing variant, which is always non-negative.
    idf.set(
      term,
      Math.log(
        1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5),
      ),
    );
  }

  let maxScore = 0;
  const rawScores = documents.map((document, index) => {
    const tf = tfPerDoc[index];
    const docLength = docLengths[index];
    let score = 0;
    for (const term of queryTerms) {
      const frequency = tf.get(term) ?? 0;
      if (frequency === 0) {
        continue;
      }
      const denominator =
        frequency + k1 * (1 - b + (b * docLength) / averageLength);
      score += (idf.get(term) ?? 0) * ((frequency * (k1 + 1)) / denominator);
    }
    if (score > maxScore) {
      maxScore = score;
    }
    return { id: document.id, score };
  });

  if (maxScore <= 0) {
    return scores;
  }
  for (const { id, score } of rawScores) {
    if (score > 0) {
      scores.set(id, score / maxScore);
    }
  }
  return scores;
}
