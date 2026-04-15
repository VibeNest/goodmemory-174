import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("proposal gate integration", () => {
  it("writes promotion records for reviewer-generated proposals and updates proposal status", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" } as const;

    await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });
    await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });

    const exported = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
    });

    expect(exported.durable.proposals).toHaveLength(1);
    expect(exported.durable.promotions).toHaveLength(1);
    expect(exported.durable.proposals[0]?.status).toBe("delayed");
    expect(exported.durable.promotions[0]?.decision).toBe("delayed");
    expect(exported.durable.promotions[0]?.proposalId).toBe(
      exported.durable.proposals[0]?.id,
    );
  });
});
