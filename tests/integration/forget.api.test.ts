import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("public forget API", () => {
  it("deletes a stored memory record by id", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
      ],
    });

    const stored = await documentStore.query<{ id: string }>("facts", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    const forgotten = await memory.forget({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      memoryId: String(stored[0]?.id),
    });

    expect(forgotten.forgotten).toBe(true);
    expect(
      await documentStore.query("facts", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(0);
  });

  it("returns false when the requested memory id does not exist", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    const result = await memory.forget({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      memoryId: "missing-memory",
    });

    expect(result.forgotten).toBe(false);
  });

  it("does not delete memory outside the requested scope", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
      ],
    });

    const stored = await documentStore.query<{ id: string }>("facts", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    const result = await memory.forget({
      scope: { userId: "u-1", workspaceId: "workspace-b" },
      memoryId: String(stored[0]?.id),
    });

    expect(result.forgotten).toBe(false);
    expect(
      await documentStore.query("facts", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });
});
