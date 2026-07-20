import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src";
import { createFactMemory } from "../../src/domain/records";

// A query-only RecallPlan drives decomposition by default. The public option
// remains as an explicit override for callers that need a single-query replay.
describe("GoodMemory.recall decompose option", () => {
  const scope = { userId: "u-1", workspaceId: "workspace-a" };

  function buildMemory(recallPlanExecution = true) {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const memory = createGoodMemory({
      adapters: { documentStore, sessionStore, vectorStore },
      retrieval: { recallPlanExecution },
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

  it("uses planned facets by default and keeps an explicit disable override", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    const facts = [
      makeFact("db", "My production database is PostgreSQL."),
      makeFact("editor", "My preferred code editor is Neovim."),
      makeFact("noise-1", "The quarterly budget review is on Friday."),
      makeFact("noise-2", "Standup happens at 9am daily."),
    ];
    for (const fact of facts) {
      await documentStore.set("facts", fact.id, fact);
    }
    const query = "What database do I use and which code editor do I prefer?";

    const single = await memory.recall({
      scope,
      query,
      strategy: "rules-only",
      decompose: false,
    });
    const singleIds = single.facts.map((fact) => fact.id);

    const decomposed = await memory.recall({
      scope,
      query,
      strategy: "rules-only",
    });
    const decomposedIds = decomposed.facts.map((fact) => fact.id);

    // Both topic-specific facts are retrieved through their focused sub-queries.
    expect(decomposedIds).toContain("db");
    expect(decomposedIds).toContain("editor");
    expect(decomposed.metadata.policyApplied).toContain("decomposed_recall");
    expect(single.metadata.policyApplied).not.toContain("decomposed_recall");
    expect(single.metadata.retrievalTrace).toMatchObject({
      schemaVersion: 2,
      stopReason: "single_pass_complete",
      subQueries: [],
    });
    const retrievalTrace = decomposed.metadata.retrievalTrace;
    const recallPlan = retrievalTrace?.schemaVersion === 2
      ? retrievalTrace.plan
      : undefined;
    expect(decomposed.metadata.retrievalTrace).toMatchObject({
      schemaVersion: 2,
      stopReason: "decomposition_complete",
      subQueries: ["What database do I use", "which code editor do I prefer"],
      queryExecutions: [
        expect.objectContaining({ query, role: "primary" }),
        expect.objectContaining({
          query: "What database do I use",
          role: "subquery",
          subQueryIndex: 0,
        }),
        expect.objectContaining({
          query: "which code editor do I prefer",
          role: "subquery",
          subQueryIndex: 1,
        }),
      ],
    });
    expect(recallPlan).toMatchObject({
      maxRenderedTokens: 6_000,
      preRankLimit: 32,
      selectedLimit: 12,
    });
    // The union never drops what the single recall already found.
    for (const id of singleIds) {
      expect(decomposedIds).toContain(id);
    }
    expect(decomposedIds.length).toBeGreaterThanOrEqual(singleIds.length);
    // The packet is re-rendered over the union, so it reflects the merged facts.
    expect(decomposed.packet).toBeDefined();
    expect(decomposed.packet.renderBudget).toEqual({ maxTokens: 6_000 });
  });

  it("keeps query-plan execution behind the experimental retrieval option", async () => {
    const { documentStore, makeFact, memory } = buildMemory(false);
    for (const fact of [
      makeFact("db", "My production database is PostgreSQL."),
      makeFact("editor", "My preferred code editor is Neovim."),
    ]) {
      await documentStore.set("facts", fact.id, fact);
    }

    const result = await memory.recall({
      scope,
      query: "What database do I use and which code editor do I prefer?",
      strategy: "rules-only",
    });

    expect(result.metadata.policyApplied).not.toContain("decomposed_recall");
    expect(result.metadata.retrievalTrace).toMatchObject({
      schemaVersion: 2,
      stopReason: "single_pass_complete",
      subQueries: [],
    });
  });

  it("is a no-op for a single-part query (no decomposition marker)", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    const fact = makeFact("home", "I live in Seattle.");
    await documentStore.set("facts", fact.id, fact);

    const result = await memory.recall({
      scope,
      query: "Where do I live?",
      strategy: "rules-only",
      decompose: true,
    });
    expect(result.metadata.policyApplied).not.toContain("decomposed_recall");
    expect(result.metadata.retrievalTrace).toMatchObject({
      schemaVersion: 2,
      stopReason: "single_pass_complete",
      subQueries: [],
    });
  });
});
