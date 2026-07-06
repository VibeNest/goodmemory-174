import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
  createLocalEmbeddingAdapter,
  inspectGoodMemoryRuntime,
} from "../../src";
import type { EmbeddingAdapter } from "../../src/embedding/contracts";

// End-to-end proof for retrieval.preset "recommended" through the public API:
// with an embedding adapter injected and NO per-call strategy, the preset's
// auto→hybrid bias makes the semantic union recover a zero-token-overlap fact.
// The same setup without the preset keeps today's auto→rules-only behavior,
// proving the bias is preset-scoped. Without any embedding the preset throws
// at construction instead of silently degrading to the lexical floor.
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

function buildMemory(withPreset: boolean) {
  return createGoodMemory({
    adapters: {
      documentStore: createInMemoryDocumentStore(),
      embeddingAdapter: createFixedEmbeddingAdapter(),
      sessionStore: createInMemorySessionStore(),
      vectorStore: createInMemoryVectorStore(),
    },
    ...(withPreset ? { retrieval: { preset: "recommended" as const } } : {}),
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

describe("GoodMemory retrieval.preset recommended", () => {
  it("fires the semantic union under auto strategy (no per-call strategy)", async () => {
    const memory = buildMemory(true);
    await seed(memory);

    const result = await memory.recall({ scope, query: QUERY });

    expect(result.facts.some((fact) => fact.content.includes("fishing"))).toBe(
      true,
    );
    expect(
      result.metadata.candidateTraces.some(
        (trace) => trace.fallback === "semantic_union" && trace.returned,
      ),
    ).toBe(true);
    const routing = result.metadata.routingDecision as {
      strategy: string;
    };
    expect(routing.strategy).toBe("hybrid");
  });

  it("keeps auto→rules-only without the preset (bias is preset-scoped)", async () => {
    const memory = buildMemory(false);
    await seed(memory);

    const result = await memory.recall({ scope, query: QUERY });

    expect(result.facts.some((fact) => fact.content.includes("fishing"))).toBe(
      false,
    );
    expect(JSON.stringify(result.metadata.candidateTraces)).not.toContain(
      "semantic_union",
    );
  });

  it("throws at construction without a resolvable embedding", () => {
    let message = "";
    try {
      createGoodMemory({
        retrieval: { preset: "recommended" },
        storage: { provider: "memory" },
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("GOODMEMORY_EMBEDDING_");
    expect(message).toContain("Ollama");
  });

  it("rejects the hashed-lexical local adapter", () => {
    expect(() =>
      createGoodMemory({
        adapters: { embeddingAdapter: createLocalEmbeddingAdapter() },
        retrieval: { preset: "recommended" },
        storage: { provider: "memory" },
      }),
    ).toThrow(/hashed-lexical/);
  });

  it("reports preset resolution through inspectGoodMemoryRuntime", () => {
    const memory = buildMemory(true);
    expect(inspectGoodMemoryRuntime(memory)?.retrievalPreset).toEqual({
      active: true,
      extraction: "unavailable",
      requested: "recommended",
    });

    const withoutPreset = buildMemory(false);
    expect(
      inspectGoodMemoryRuntime(withoutPreset)?.retrievalPreset,
    ).toBeUndefined();
  });
});
