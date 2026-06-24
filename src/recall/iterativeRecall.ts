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

// Safety ceiling on the number of recall passes, independent of the requested
// maxHops, so an injected expandQuery strategy can never trigger a runaway loop.
const MAX_HOPS_CEILING = 6;
const DEFAULT_MAX_HOPS = 2;

export interface IterativeRecallOptions {
  bridgeEntityLimit?: number;
  // Maximum total recall passes (>= 1). Default 2 (one bridge expansion), the
  // historical two-pass behavior. The literature shows 2-3 hops capture most of
  // the multi-hop gain; clamped to MAX_HOPS_CEILING.
  maxHops?: number;
  // Optional strategy for the next-hop query, e.g. an LLM that reads the facts so
  // far and writes a focused follow-up question (reasoning-driven multi-hop).
  // Returns the next query, or null to stop. When provided it replaces the
  // default lexical bridge-entity expansion (so bridgeEntities stays empty).
  expandQuery?: (input: {
    originalQuery: string;
    query: string;
    facts: readonly { content: string }[];
    hop: number;
  }) => string | null | Promise<string | null>;
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
  const maxHops = Math.min(
    MAX_HOPS_CEILING,
    Math.max(1, input.options?.maxHops ?? DEFAULT_MAX_HOPS),
  );
  const expandQuery = input.options?.expandQuery;

  let result = await input.recall(input.query);
  let activeQuery = input.query;
  let hops = 1;
  const bridgeEntities: string[] = [];
  const seenBridge = new Set<string>();
  const seenFactContent = new Set(result.facts.map((fact) => fact.content));

  while (hops < maxHops) {
    let nextQuery: string | null;
    if (expandQuery) {
      nextQuery = await expandQuery({
        originalQuery: input.query,
        query: activeQuery,
        facts: result.facts,
        hop: hops,
      });
    } else {
      const hopBridges = extractBridgeEntities({
        facts: result.facts,
        limit: input.options?.bridgeEntityLimit,
        query: activeQuery,
      });
      const freshBridges = hopBridges.filter(
        (bridge) => !seenBridge.has(bridge.toLowerCase()),
      );
      if (freshBridges.length === 0) {
        break;
      }
      for (const bridge of freshBridges) {
        seenBridge.add(bridge.toLowerCase());
        bridgeEntities.push(bridge);
      }
      nextQuery = `${input.query} ${bridgeEntities.join(" ")}`;
    }
    if (!nextQuery || nextQuery === activeQuery) {
      break;
    }
    result = await input.recall(nextQuery);
    activeQuery = nextQuery;
    hops += 1;
    // Stop early once a hop surfaces nothing new, so extra hops are not wasted.
    const sizeBefore = seenFactContent.size;
    for (const fact of result.facts) {
      seenFactContent.add(fact.content);
    }
    if (seenFactContent.size === sizeBefore) {
      break;
    }
  }

  return {
    bridgeEntities,
    expandedQuery: activeQuery,
    hops,
    result,
  };
}
