import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("public feedback API", () => {
  it("writes procedural memory without going through remember()", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.feedback({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      signal: "Please keep answers concise and action-oriented.",
    });

    expect(result.accepted).toBe(true);
    expect(result.outcome).toBe("written");
    expect(result.memoryId).toBeDefined();
    expect(result.kind).toBe("do");
    expect(
      await documentStore.query("feedback", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("records validated patterns separately when the user confirms a successful style", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.feedback({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      signal: "The checklist format worked well for me, keep using it for code reviews.",
    });

    const records = await documentStore.query<{ kind: string }>("feedback", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    expect(records[0]?.kind).toBe("validated_pattern");
  });

  it("normalizes and stores Chinese feedback signals", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.feedback({
      scope: { userId: "u-zh", workspaceId: "workspace-a", sessionId: "s-1" },
      signal: "请以后优先用要点列表回复。",
    });

    expect(result.kind).toBe("prefer");
    expect(result.metadata?.locale).toBe("zh-CN");
    expect(
      await documentStore.query("feedback", {
        userId: "u-zh",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });
});
