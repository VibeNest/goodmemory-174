import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
import { createRecallEngine } from "../../src/recall/engine";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";

// Verifies the opt-in BM25 ranking leg over the real recall engine:
//  - it is gated: rules-only never receives the additive BM25 term (safety);
//  - under hybrid it reorders by IDF, lifting a rare-term match above a
//    common-term match that ties it on naive lexical overlap;
//  - it is a no-op when the flag is off.
// "alpha" is seeded into 5/6 facts (common, low IDF); "gamma" into 1/6 (rare,
// high IDF). Under naive Jaccard both head facts tie (0.5), so id order keeps
// fact-1-alpha first; BM25 breaks that tie toward the rare term.
describe("BM25 ranking leg over the real recall engine", () => {
  const scope = { userId: "u-1", workspaceId: "workspace-a" };
  const query = "What about alpha and gamma?";

  async function buildEngine(bm25Ranking?: boolean) {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
      vectorStore,
    });
    const makeFact = (id: string, content: string) =>
      createFactMemory({
        id,
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content,
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    await repositories.facts.add(makeFact("fact-1-alpha", "alpha"));
    await repositories.facts.add(makeFact("fact-2-gamma", "gamma"));
    for (let index = 0; index < 4; index += 1) {
      await repositories.facts.add(
        makeFact(`filler-${index}`, "alpha beta delta epsilon zeta eta theta"),
      );
    }
    return createRecallEngine({ repositories, runtime: sessionStore, bm25Ranking });
  }

  function rankOf(ids: string[], id: string): number {
    const index = ids.indexOf(id);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  }

  it("does not apply BM25 to the rules-only floor (gating)", async () => {
    const engine = await buildEngine(true);
    const result = await engine.recall({
      scope,
      query,
      retrievalProfile: "general_chat",
      strategy: "rules-only",
    });
    const ids = result.facts.map((fact) => fact.id);
    expect(rankOf(ids, "fact-1-alpha")).toBeLessThan(
      rankOf(ids, "fact-2-gamma"),
    );
  });

  it("reorders by IDF under hybrid, lifting the rare-term fact", async () => {
    const engine = await buildEngine(true);
    const result = await engine.recall({
      scope,
      query,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    const ids = result.facts.map((fact) => fact.id);
    expect(rankOf(ids, "fact-2-gamma")).toBeLessThan(
      rankOf(ids, "fact-1-alpha"),
    );
  });

  it("is a no-op under hybrid when bm25Ranking is off", async () => {
    const engine = await buildEngine(false);
    const result = await engine.recall({
      scope,
      query,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    const ids = result.facts.map((fact) => fact.id);
    expect(rankOf(ids, "fact-1-alpha")).toBeLessThan(
      rankOf(ids, "fact-2-gamma"),
    );
  });
});
