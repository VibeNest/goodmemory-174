// Iterative (two-pass) recall for multi-hop questions.
//
// Single-pass lexical/semantic recall cannot answer a question whose evidence is
// only reachable through a bridge: "What sport does the goaltender play?" matches
// the fact that NAMES the goaltender, but not the separate fact that records that
// person's sport. This composes recall with itself: hop 1 retrieves the facts the
// query matches directly, salient bridge entities (names, values) are extracted
// from those facts, and the query is expanded with them so a second recall also
// matches the chained fact. A caller-provided merger can preserve direct
// evidence from every hop; without one, the historical latest-hop behavior is
// retained.
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
const ISO_TIMESTAMP_PATTERN =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/giu;
const APOSTROPHE_SUFFIXES = new Set([
  "d",
  "ll",
  "m",
  "re",
  "s",
  "t",
  "ve",
]);

interface BridgeCandidate {
  count: number;
  firstIndex: number;
  proper: boolean;
  token: string;
}

export interface BridgeTextAnalysis {
  entities: readonly string[];
  tokens: readonly string[];
}

function queryTokenSet(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 0),
  );
}

function normalizeBridgeToken(raw: string): { key: string; token: string } {
  const apostropheIndex = raw.lastIndexOf("'");
  if (apostropheIndex > 0) {
    const suffix = raw.slice(apostropheIndex + 1).toLowerCase();
    if (APOSTROPHE_SUFFIXES.has(suffix)) {
      const token = raw.slice(0, apostropheIndex);
      return { key: token.toLowerCase(), token };
    }
  }
  return { key: raw.toLowerCase(), token: raw };
}

// Salient terms in the retrieved facts that the query did NOT already contain:
// the entities/values that bridge hop 1 to hop 2. Proper nouns (capitalized) and
// numeric values rank first, then novel content words by frequency, with original
// reading order as the deterministic tie-breaker.
export function extractBridgeEntities(input: {
  analyzeBridgeText?: (text: string) => BridgeTextAnalysis;
  facts: readonly { content: string }[];
  query: string;
  limit?: number;
}): string[] {
  const limit = input.limit ?? DEFAULT_BRIDGE_ENTITY_LIMIT;
  const queryAnalysis = input.analyzeBridgeText?.(input.query);
  const querySet = queryAnalysis
    ? new Set(
        [...queryAnalysis.entities, ...queryAnalysis.tokens]
          .map((term) => normalizeBridgeToken(term.normalize("NFKC")).key)
          .filter(Boolean),
      )
    : queryTokenSet(input.query);
  const candidates = new Map<string, BridgeCandidate>();
  let position = 0;

  for (const fact of input.facts.slice(0, DEFAULT_BRIDGE_FACT_LIMIT)) {
    const analyzed = input.analyzeBridgeText?.(
      fact.content.replace(ISO_TIMESTAMP_PATTERN, " "),
    );
    const terms = analyzed
      ? [
          ...analyzed.entities.map((raw) => ({ proper: true, raw })),
          ...analyzed.tokens.map((raw) => ({ proper: false, raw })),
        ]
      : (fact.content
          .replace(ISO_TIMESTAMP_PATTERN, " ")
          .match(/[A-Za-z0-9][A-Za-z0-9'-]*/gu) ?? [])
          .map((raw) => ({
            proper: /^[A-Z]/u.test(raw) || /\d/u.test(raw),
            raw,
          }));
    for (const term of terms) {
      const raw = term.raw.normalize("NFKC");
      const normalized = normalizeBridgeToken(raw);
      const lower = normalized.key;
      position += 1;
      if (
        lower.length < MIN_BRIDGE_TOKEN_LENGTH ||
        querySet.has(lower) ||
        BRIDGE_STOPWORDS.has(lower)
      ) {
        continue;
      }
      const proper = term.proper ||
        /^[A-Z]/u.test(normalized.token) || /\d/u.test(normalized.token);
      const existing = candidates.get(lower);
      if (existing) {
        existing.count += 1;
        existing.proper = existing.proper || proper;
      } else {
        candidates.set(lower, {
          count: 1,
          firstIndex: position,
          proper,
          token: normalized.token,
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
  analyzeBridgeText?: (text: string) => BridgeTextAnalysis;
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
  steps: IterativeRecallStep[];
  stopReason: IterativeRecallStopReason;
}

export type IterativeRecallStopReason =
  | "expander_stopped"
  | "max_hops_reached"
  | "no_bridge_entities"
  | "no_new_evidence"
  | "unchanged_query";

export interface IterativeRecallStep {
  bridgeEntities: string[];
  factCount: number;
  hop: number;
  query: string;
}

export async function iterativeRecall<
  TResult extends { facts: readonly { content: string }[] },
>(input: {
  query: string;
  recall: (query: string) => Promise<TResult>;
  merge?: (primary: TResult, supplementary: TResult[]) => TResult;
  options?: IterativeRecallOptions;
}): Promise<IterativeRecallOutcome<TResult>> {
  const maxHops = Math.min(
    MAX_HOPS_CEILING,
    Math.max(1, input.options?.maxHops ?? DEFAULT_MAX_HOPS),
  );
  const expandQuery = input.options?.expandQuery;

  let result = await input.recall(input.query);
  const primaryResult = result;
  const supplementaryResults: TResult[] = [];
  let activeQuery = input.query;
  let hops = 1;
  const bridgeEntities: string[] = [];
  const seenBridge = new Set<string>();
  const seenFactContent = new Set(result.facts.map((fact) => fact.content));
  const steps: IterativeRecallStep[] = [
    {
      bridgeEntities: [],
      factCount: result.facts.length,
      hop: 1,
      query: input.query,
    },
  ];
  let stopReason: IterativeRecallStopReason = "max_hops_reached";

  while (hops < maxHops) {
    let nextQuery: string | null;
    if (expandQuery) {
      nextQuery = await expandQuery({
        originalQuery: input.query,
        query: activeQuery,
        facts: result.facts,
        hop: hops,
      });
      if (!nextQuery?.trim()) {
        stopReason = "expander_stopped";
        break;
      }
    } else {
      const hopBridges = extractBridgeEntities({
        analyzeBridgeText: input.options?.analyzeBridgeText,
        facts: result.facts,
        limit: input.options?.bridgeEntityLimit,
        query: activeQuery,
      });
      const freshBridges = hopBridges.filter(
        (bridge) => !seenBridge.has(bridge.toLowerCase()),
      );
      if (freshBridges.length === 0) {
        stopReason = "no_bridge_entities";
        break;
      }
      steps[steps.length - 1]!.bridgeEntities = [...freshBridges];
      for (const bridge of freshBridges) {
        seenBridge.add(bridge.toLowerCase());
        bridgeEntities.push(bridge);
      }
      nextQuery = `${input.query} ${bridgeEntities.join(" ")}`;
    }
    const normalizedNextQuery = nextQuery.trim();
    if (normalizedNextQuery === activeQuery.trim()) {
      stopReason = "unchanged_query";
      break;
    }
    result = await input.recall(normalizedNextQuery);
    supplementaryResults.push(result);
    activeQuery = normalizedNextQuery;
    hops += 1;
    steps.push({
      bridgeEntities: [],
      factCount: result.facts.length,
      hop: hops,
      query: activeQuery,
    });
    // Stop early once a hop surfaces nothing new, so extra hops are not wasted.
    const sizeBefore = seenFactContent.size;
    for (const fact of result.facts) {
      seenFactContent.add(fact.content);
    }
    if (seenFactContent.size === sizeBefore) {
      stopReason = "no_new_evidence";
      break;
    }
  }

  return {
    bridgeEntities,
    expandedQuery: activeQuery,
    hops,
    result: input.merge && supplementaryResults.length > 0
      ? input.merge(primaryResult, supplementaryResults)
      : result,
    steps,
    stopReason,
  };
}
