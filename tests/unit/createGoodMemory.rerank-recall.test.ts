import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
  type Reranker,
} from "../../src";
import { createFactMemory } from "../../src/domain/records";
import {
  mergeDurableCandidateOrder,
  resolveRerankerTopK,
  sanitizeRerankerGateway,
} from "../../src/api/recallReranking";

// The reranker adapter is opt-in: configure one and recalled facts are reranked
// over their top-K window (packet re-rendered); omit it and recall is unchanged.
describe("GoodMemory.recall reranker adapter", () => {
  const scope = { userId: "u-1", workspaceId: "workspace-a" };
  const query = "alpha topic";

  it("removes credentials and query data from the traced gateway", () => {
    expect(
      sanitizeRerankerGateway(
        "https://user:password@ai.gurkiai.com/v1/?token=secret#fragment",
      ),
    ).toBe("https://ai.gurkiai.com/v1");
  });

  it("preserves non-fact durable slots while applying the new fact order", () => {
    expect(
      mergeDurableCandidateOrder({
        factIdsAfter: ["fact-b", "fact-a"],
        factIdsBefore: ["fact-a", "fact-b"],
        originalOrder: ["reference-1", "fact-a", "archive-1", "fact-b"],
      }),
    ).toEqual(["reference-1", "fact-b", "archive-1", "fact-a"]);
  });

  it("caps the first-party listwise window while preserving pointwise defaults", () => {
    expect(
      resolveRerankerTopK({
        candidateCount: 80,
        target: {
          adapter: "provider",
          candidateLimit: 32,
          strategy: "listwise",
        },
      }),
    ).toBe(32);
    expect(
      resolveRerankerTopK({
        candidateCount: 80,
        target: { adapter: "provider", strategy: "pointwise" },
      }),
    ).toBeUndefined();
  });

  // Promotes fact-b above its first-stage position regardless of original order.
  const promoteBReranker: Reranker = {
    async rerank({ documents }) {
      return documents.map((document) => ({
        id: document.id,
        score: document.id === "fact-b" ? 1 : 0,
      }));
    },
  };

  function buildMemory(reranker?: Reranker) {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const memory = createGoodMemory({
      adapters: { documentStore, sessionStore, vectorStore, reranker },
      storage: { provider: "memory" },
      testing: { now: () => new Date("2026-01-02T00:00:00.000Z") },
    });
    const makeFact = (id: string, content: string) =>
      createFactMemory({
        id,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "project",
        content,
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    return { documentStore, makeFact, memory };
  }

  async function seed(documentStore: ReturnType<typeof createInMemoryDocumentStore>, makeFact: (id: string, content: string) => ReturnType<typeof createFactMemory>) {
    for (const fact of [
      makeFact("fact-a", "alpha topic update one"),
      makeFact("fact-b", "alpha topic detail two"),
      makeFact("fact-c", "alpha topic note three"),
    ]) {
      await documentStore.set("facts", fact.id, fact);
    }
  }

  it("reorders facts and marks the recall as reranked when configured", async () => {
    const { documentStore, makeFact, memory } = buildMemory(promoteBReranker);
    await seed(documentStore, makeFact);

    const result = await memory.recall({ scope, query, strategy: "rules-only" });
    const ids = result.facts.map((fact) => fact.id);
    // fact-b is promoted above fact-a, reversing the first-stage order.
    expect(ids.indexOf("fact-b")).toBeLessThan(ids.indexOf("fact-a"));
    expect(result.metadata.policyApplied).toContain("reranked");
    expect(result.metadata.retrievalTrace?.reranker).toMatchObject({
      adapter: "custom",
      candidateCount: 3,
      role: "reranker",
      status: "applied",
    });
    expect(result.metadata.retrievalTrace?.reranker?.scores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memoryId: "fact-b",
          rankAfter: 1,
          score: 1,
        }),
      ]),
    );
  });

  it("is a no-op when no reranker is configured", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    await seed(documentStore, makeFact);

    const result = await memory.recall({ scope, query, strategy: "rules-only" });
    const ids = result.facts.map((fact) => fact.id);
    // Baseline first-stage order keeps fact-a ahead of fact-b.
    expect(ids.indexOf("fact-a")).toBeLessThan(ids.indexOf("fact-b"));
    expect(result.metadata.policyApplied).not.toContain("reranked");
    expect(result.metadata.retrievalTrace).toBeUndefined();
  });

  it("can be disabled per call with rerank: false", async () => {
    const { documentStore, makeFact, memory } = buildMemory(promoteBReranker);
    await seed(documentStore, makeFact);

    const result = await memory.recall({
      scope,
      query,
      strategy: "rules-only",
      rerank: false,
    });
    expect(result.metadata.policyApplied).not.toContain("reranked");
    expect(result.metadata.retrievalTrace?.reranker).toMatchObject({
      adapter: "custom",
      fallbackReason: "disabled",
      role: "reranker",
      status: "skipped",
    });
  });

  it("does not call the reranker when fewer than two facts survive recall", async () => {
    let calls = 0;
    const { documentStore, makeFact, memory } = buildMemory({
      async rerank() {
        calls += 1;
        return [];
      },
    });
    const fact = makeFact("only-fact", "alpha topic only fact");
    await documentStore.set("facts", fact.id, fact);

    const result = await memory.recall({
      scope,
      query,
      strategy: "rules-only",
    });

    expect(calls).toBe(0);
    expect(result.metadata.retrievalTrace?.reranker).toMatchObject({
      candidateCount: 1,
      fallbackReason: "insufficient_candidates",
      status: "skipped",
    });
  });

  it("preserves deterministic recall when the reranker fails", async () => {
    const baseline = buildMemory();
    const failing = buildMemory({
      async rerank() {
        throw new Error("provider unavailable");
      },
    });
    await seed(baseline.documentStore, baseline.makeFact);
    await seed(failing.documentStore, failing.makeFact);

    const baselineResult = await baseline.memory.recall({
      scope,
      query,
      strategy: "rules-only",
    });
    const fallbackResult = await failing.memory.recall({
      scope,
      query,
      strategy: "rules-only",
    });

    expect(fallbackResult.facts).toEqual(baselineResult.facts);
    expect(fallbackResult.packet).toEqual(baselineResult.packet);
    expect(fallbackResult.metadata.policyApplied).toContain("reranker_fallback");
    expect(fallbackResult.metadata.retrievalTrace?.reranker).toMatchObject({
      adapter: "custom",
      candidateCount: 3,
      fallbackReason: "adapter_error",
      role: "reranker",
      status: "fallback",
    });
  });
});
