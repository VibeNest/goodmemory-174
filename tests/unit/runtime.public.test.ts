import { describe, expect, it } from "bun:test";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../../src";
import { SESSION_ARCHIVES_COLLECTION } from "../../src/evolution/contracts";

describe("public runtime wrapper", () => {
  it("ignores injected internal salvage hooks at runtime", async () => {
    let called = false;
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();

    const runtime = createRuntimeContextService({
      sessionStore,
      archiveStore: createRuntimeArchiveStore({ documentStore }),
      now: () => "2026-04-18T00:00:00.000Z",
      createArchiveId: () => "archive-public-1",
      maxBufferedMessages: 2,
      salvageHooks: {
        async onSessionEnd() {
          called = true;
        },
      },
    } as any);

    const scope = { userId: "u-1", sessionId: "s-1" };

    await runtime.startSession(scope);
    await runtime.updateWorkingMemory(scope, {
      currentGoal: "Keep salvage internal",
      openLoops: ["verify root runtime boundary"],
    });
    await runtime.endSession(scope);

    expect(called).toBeFalse();
    expect(
      await documentStore.query(SESSION_ARCHIVES_COLLECTION, {
        userId: scope.userId,
      }),
    ).toHaveLength(1);
  });
});
