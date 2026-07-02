import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src";
import type { EmbeddingAdapter } from "../../src/embedding/contracts";

// End-to-end opt-in proof for retrieval.semanticCandidates through the public
// API: facts stored via remember() are auto-embedded at write time (embedding
// adapter + vector store configured), and a query sharing NO tokens with the
// gold fact recovers it only when the union flag is set.
const QUERY = "What helps you relax in the evenings?";
const GOLD = "Marco goes fishing at the lake to destress.";
const NOISE = "Quarterly budget numbers were approved.";

function createFixedEmbeddingAdapter(): EmbeddingAdapter {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        if (text.includes("relax in the evenings")) {
          return [1, 0, 0];
        }
        if (text.includes("fishing")) {
          return [0.95, 0.05, 0];
        }
        return [0, 1, 0];
      });
    },
  };
}

const scope = { userId: "u-1", workspaceId: "workspace-a" };

function buildMemory(withUnion: boolean) {
  return createGoodMemory({
    adapters: {
      documentStore: createInMemoryDocumentStore(),
      embeddingAdapter: createFixedEmbeddingAdapter(),
      sessionStore: createInMemorySessionStore(),
      vectorStore: createInMemoryVectorStore(),
    },
    ...(withUnion
      ? { retrieval: { semanticCandidates: {} } }
      : {}),
    storage: { provider: "memory" },
  });
}

async function seed(memory: ReturnType<typeof createGoodMemory>) {
  await memory.remember({
    annotations: [GOLD, NOISE].map((_, messageIndex) => ({
      confirmed: true,
      kindHint: "fact" as const,
      messageIndex,
      reason: "seed",
      remember: "always" as const,
      verified: true,
    })),
    extractionStrategy: "rules-only",
    messages: [
      { content: GOLD, role: "user" },
      { content: NOISE, role: "user" },
    ],
    scope,
  });
}

describe("GoodMemory retrieval.semanticCandidates option", () => {
  it("recovers the zero-token-overlap fact only when the union is enabled", async () => {
    const withUnion = buildMemory(true);
    await seed(withUnion);
    const unionResult = await withUnion.recall({
      scope,
      query: QUERY,
      strategy: "hybrid",
    });
    const unionContents = unionResult.facts.map((fact) => fact.content);
    expect(unionContents.some((content) => content.includes("fishing"))).toBe(
      true,
    );
    expect(
      unionResult.metadata.candidateTraces.some(
        (trace) => trace.fallback === "semantic_union" && trace.returned,
      ),
    ).toBe(true);

    const withoutUnion = buildMemory(false);
    await seed(withoutUnion);
    const plainResult = await withoutUnion.recall({
      scope,
      query: QUERY,
      strategy: "hybrid",
    });
    expect(
      plainResult.facts.some((fact) => fact.content.includes("fishing")),
    ).toBe(false);
    expect(JSON.stringify(plainResult.metadata.candidateTraces)).not.toContain(
      "semantic_union",
    );
  });
});
