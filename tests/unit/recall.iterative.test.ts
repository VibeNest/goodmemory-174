import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
import type { FactMemory } from "../../src/domain/records";
import type { RecallResult } from "../../src/api/contracts";
import {
  extractBridgeEntities,
  iterativeRecall,
} from "../../src/recall/iterativeRecall";

function fact(id: string, content: string): FactMemory {
  return createFactMemory({
    id,
    userId: "u-1",
    workspaceId: "workspace-a",
    category: "project",
    content,
    source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

// A deterministic stand-in for the recall engine: a fact is "retrieved" when it
// shares a content word of length >= 4 with the query (so short/common words do
// not cause spurious matches). This isolates the multi-hop ORCHESTRATION from
// the engine's ranking internals.
function lexicalRecall(
  corpus: readonly FactMemory[],
): (query: string) => Promise<RecallResult> {
  const significant = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .filter((token) => token.length >= 4),
    );
  return async (query: string) => {
    const queryWords = significant(query);
    const facts = corpus.filter((candidate) => {
      for (const word of significant(candidate.content)) {
        if (queryWords.has(word)) {
          return true;
        }
      }
      return false;
    });
    return { facts } as unknown as RecallResult;
  };
}

describe("iterative (two-pass) recall", () => {
  const goaltender = fact("a-goaltender", "The goaltender is Mika Linna.");
  const sport = fact("b-sport", "Mika Linna won the pesapallo championship.");
  const distractor = fact("d-distractor", "The quarterly budget review is Friday.");
  const corpus = [goaltender, sport, distractor];
  const query = "What is the goaltender known for?";

  it("single-pass recall cannot reach the bridged fact", async () => {
    const recall = lexicalRecall(corpus);
    const single = await recall(query);
    const ids = single.facts.map((entry) => entry.id);
    expect(ids).toContain("a-goaltender");
    expect(ids).not.toContain("b-sport");
  });

  it("extracts proper-noun bridge entities the query did not contain", () => {
    const bridges = extractBridgeEntities({ facts: [goaltender], query });
    expect(bridges).toContain("Mika");
    expect(bridges).toContain("Linna");
    // The query's own words and stopwords are never bridges.
    expect(bridges).not.toContain("goaltender");
    expect(bridges).not.toContain("The");
  });

  it("reaches the bridged fact via the expanded second hop", async () => {
    const outcome = await iterativeRecall({
      query,
      recall: lexicalRecall(corpus),
    });
    expect(outcome.hops).toBe(2);
    expect(outcome.bridgeEntities).toContain("Mika");
    const ids = outcome.result.facts.map((entry) => entry.id);
    expect(ids).toContain("a-goaltender");
    expect(ids).toContain("b-sport"); // the chained answer single-pass missed
    expect(ids).not.toContain("d-distractor");
  });

  it("stays single-hop when the first pass yields no bridge entity", async () => {
    const onlyStopwords = fact("s", "the it is a to of");
    const outcome = await iterativeRecall({
      query: "what is it",
      recall: lexicalRecall([onlyStopwords]),
    });
    expect(outcome.hops).toBe(1);
    expect(outcome.bridgeEntities).toEqual([]);
    expect(outcome.expandedQuery).toBe("what is it");
  });
});
