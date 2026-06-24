import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
  type Reranker,
} from "../../src";
import { createFactMemory } from "../../src/domain/records";

// The reranker adapter is opt-in: configure one and recalled facts are reranked
// over their top-K window (packet re-rendered); omit it and recall is unchanged.
describe("GoodMemory.recall reranker adapter", () => {
  const scope = { userId: "u-1", workspaceId: "workspace-a" };
  const query = "alpha topic";

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
  });

  it("is a no-op when no reranker is configured", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    await seed(documentStore, makeFact);

    const result = await memory.recall({ scope, query, strategy: "rules-only" });
    const ids = result.facts.map((fact) => fact.id);
    // Baseline first-stage order keeps fact-a ahead of fact-b.
    expect(ids.indexOf("fact-a")).toBeLessThan(ids.indexOf("fact-b"));
    expect(result.metadata.policyApplied).not.toContain("reranked");
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
  });
});
