// Iterative (two-pass) recall for multi-hop questions.
//
// Single-pass lexical/semantic recall cannot answer a question whose evidence is
// only reachable through a bridge: "What sport does the goaltender play?" matches
// the fact that NAMES the goaltender, but not the separate fact that records that
// person's sport. This composes recall with itself: hop 1 retrieves the facts the
// query matches directly, salient bridge entities (names, values) are extracted
// from those facts, and the query is expanded with them so a second recall also
// matches the chained fact. It returns the second pass's result (a complete
// RecallResult with a valid packet), or the first pass unchanged when no bridge
// entity is found.
//
// It is opt-in and provider-free: the caller supplies a `recall` closure (already
// bound to scope/strategy), so this never changes default single-pass behavior
// and adds no dependency on the recall engine internals.

const BRIDGE_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "and",
  "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from", "as",
  "that", "this", "these", "those", "it", "its", "they", "them", "their", "i",
  "my", "me", "we", "our", "you", "your", "he", "she", "his", "her", "do",
  "does", "did", "has", "have", "had", "will", "would", "can", "could", "what",
  "when", "where", "which", "who", "why", "how", "not", "no", "yes",
]);

const MIN_BRIDGE_TOKEN_LENGTH = 2;
const DEFAULT_BRIDGE_ENTITY_LIMIT = 4;
const DEFAULT_BRIDGE_FACT_LIMIT = 6;

interface BridgeCandidate {
  count: number;
  firstIndex: number;
  proper: boolean;
  token: string;
}

function queryTokenSet(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 0),
  );
}

// Salient terms in the retrieved facts that the query did NOT already contain:
// the entities/values that bridge hop 1 to hop 2. Proper nouns (capitalized) and
// numeric values rank first, then novel content words by frequency, with original
// reading order as the deterministic tie-breaker.
export function extractBridgeEntities(input: {
  facts: readonly { content: string }[];
  query: string;
  limit?: number;
}): string[] {
  const limit = input.limit ?? DEFAULT_BRIDGE_ENTITY_LIMIT;
  const querySet = queryTokenSet(input.query);
  const candidates = new Map<string, BridgeCandidate>();
  let position = 0;

  for (const fact of input.facts.slice(0, DEFAULT_BRIDGE_FACT_LIMIT)) {
    const rawTokens = fact.content.match(/[A-Za-z0-9][A-Za-z0-9'-]*/gu) ?? [];
    for (const raw of rawTokens) {
      const lower = raw.toLowerCase();
      position += 1;
      if (
        lower.length < MIN_BRIDGE_TOKEN_LENGTH ||
        querySet.has(lower) ||
        BRIDGE_STOPWORDS.has(lower)
      ) {
        continue;
      }
      const proper = /^[A-Z]/u.test(raw) || /\d/u.test(raw);
      const existing = candidates.get(lower);
      if (existing) {
        existing.count += 1;
        existing.proper = existing.proper || proper;
      } else {
        candidates.set(lower, {
          count: 1,
          firstIndex: position,
          proper,
          token: raw,
        });
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => {
      if (left.proper !== right.proper) {
        return left.proper ? -1 : 1;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.firstIndex - right.firstIndex;
    })
    .slice(0, limit)
    .map((candidate) => candidate.token);
}

export interface IterativeRecallOptions {
  bridgeEntityLimit?: number;
}

export interface IterativeRecallOutcome<TResult> {
  bridgeEntities: string[];
  expandedQuery: string;
  hops: number;
  result: TResult;
}

export async function iterativeRecall<
  TResult extends { facts: readonly { content: string }[] },
>(input: {
  query: string;
  recall: (query: string) => Promise<TResult>;
  options?: IterativeRecallOptions;
}): Promise<IterativeRecallOutcome<TResult>> {
  const first = await input.recall(input.query);
  const bridgeEntities = extractBridgeEntities({
    facts: first.facts,
    limit: input.options?.bridgeEntityLimit,
    query: input.query,
  });
  if (bridgeEntities.length === 0) {
    return {
      bridgeEntities,
      expandedQuery: input.query,
      hops: 1,
      result: first,
    };
  }
  const expandedQuery = `${input.query} ${bridgeEntities.join(" ")}`;
  const second = await input.recall(expandedQuery);
  return {
    bridgeEntities,
    expandedQuery,
    hops: 2,
    result: second,
  };
}
