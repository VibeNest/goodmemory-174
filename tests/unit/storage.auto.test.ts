import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { createAutoStorageAdapters } from "../../src/storage/auto";
import { createTempWorkspace } from "../../src/testing/utils";

describe("auto storage adapters", () => {
  it("lazily resolves sqlite and forwards document, session, and vector operations", async () => {
    const workspace = await createTempWorkspace("goodmemory-auto-adapters");
    const adapters = createAutoStorageAdapters({
      sqliteUrl: join(workspace.root, "memory.sqlite"),
    });
    const scope = {
      userId: "auto-user",
      workspaceId: "workspace-a",
      sessionId: "session-1",
    };

    try {
      await adapters.documentStore.set("records", "record-1", {
        id: "record-1",
        kind: "fact",
        value: "initial",
      });
      await adapters.documentStore.update("records", "record-1", {
        value: "updated",
      });

      expect(await adapters.documentStore.get("records", "record-1")).toEqual({
        id: "record-1",
        kind: "fact",
        value: "updated",
      });
      expect(
        await adapters.documentStore.query("records", { kind: "fact" }),
      ).toEqual([
          {
            id: "record-1",
            kind: "fact",
            value: "updated",
          },
        ]);

      const buffer = {
        sessionId: scope.sessionId,
        userId: scope.userId,
        messages: [
          {
            role: "user",
            content: "Remember the current release blocker.",
          },
        ],
        summary: null,
        summaryUpToIndex: 0,
        createdAt: "2026-04-21T00:00:00.000Z",
        lastActiveAt: "2026-04-21T00:00:00.000Z",
      };
      await adapters.sessionStore.saveBuffer(scope, buffer);
      await adapters.sessionStore.saveWorkingMemory(scope, {
        sessionId: scope.sessionId,
        userId: scope.userId,
        currentGoal: "Ship env isolation",
        openLoops: ["run CI"],
        temporaryDecisions: [],
        updatedAt: "2026-04-21T00:00:00.000Z",
      });
      await adapters.sessionStore.saveJournal(scope, {
        sessionId: scope.sessionId,
        userId: scope.userId,
        currentState: "testing",
        filesAndFunctions: ["src/storage/auto.ts"],
        workflow: ["verify forwarding"],
        worklog: ["patched auto adapters"],
        updatedAt: "2026-04-21T00:00:00.000Z",
      });

      expect((await adapters.sessionStore.getBuffer(scope))?.messages).toHaveLength(
        1,
      );
      expect(
        await adapters.sessionStore.deleteBufferIfUnchanged(scope, {
          ...buffer,
          summary: "stale snapshot",
        }),
      ).toBe(false);
      expect(await adapters.sessionStore.getBuffer(scope)).toEqual(buffer);
      expect((await adapters.sessionStore.getWorkingMemory(scope))?.currentGoal)
        .toBe("Ship env isolation");
      expect((await adapters.sessionStore.getJournal(scope))?.currentState).toBe(
        "testing",
      );

      await adapters.vectorStore.upsert("vectors", [
        {
          id: "vector-1",
          embedding: [1, 0, 0],
          metadata: {
            kind: "fact",
          },
          content: "release blocker",
        },
      ]);

      expect(await adapters.vectorStore.get("vectors", "vector-1")).toMatchObject({
        id: "vector-1",
        content: "release blocker",
      });
      expect(
        await adapters.vectorStore.search("vectors", [1, 0, 0], {
          topK: 1,
          filter: {
            kind: "fact",
          },
        }),
      ).toHaveLength(1);

      await adapters.vectorStore.delete("vectors", "vector-1");
      await adapters.documentStore.delete("records", "record-1");

      expect(await adapters.vectorStore.get("vectors", "vector-1")).toBeNull();
      expect(await adapters.documentStore.get("records", "record-1")).toBeNull();
      expect(await adapters.sessionStore.deleteBuffersByScope(scope)).toBe(1);
      expect(await adapters.sessionStore.deleteWorkingMemoryByScope(scope)).toBe(1);
      expect(await adapters.sessionStore.deleteJournalsByScope(scope)).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });
});
