import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src";
import { createFactMemory } from "../../src/domain/records";

// The multiHop recall option is opt-in: default recall stays single-pass, and
// multiHop: true routes the same query through iterative two-pass retrieval so a
// fact reachable only through a bridge entity is recovered.
describe("GoodMemory.recall multiHop option", () => {
  const scope = { userId: "u-1", workspaceId: "workspace-a" };

  function buildMemory() {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const memory = createGoodMemory({
      adapters: { documentStore, sessionStore, vectorStore },
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

  it("recovers the bridged fact only when multiHop is enabled", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    const identity = makeFact("identity", "Mika Linna is our goaltender.");
    const attribute = makeFact("attribute", "Mika Linna competes in pesapallo.");
    const noise = makeFact("noise", "The quarterly budget review is on Friday.");
    for (const fact of [identity, attribute, noise]) {
      await documentStore.set("facts", fact.id, fact);
    }
    const query = "What is the goaltender known for?";

    const single = await memory.recall({ scope, query, strategy: "rules-only" });
    const singleIds = single.facts.map((entry) => entry.id);
    expect(singleIds).toContain("identity");
    expect(singleIds).not.toContain("attribute");

    const multi = await memory.recall({
      scope,
      query,
      strategy: "rules-only",
      multiHop: true,
    });
    const multiIds = multi.facts.map((entry) => entry.id);
    expect(multiIds).toContain("attribute");
  });
});
