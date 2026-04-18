import { describe, expect, it } from "bun:test";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createMemoryRepositories,
  createRuntimeContextService,
} from "../../src";

describe("public runtime wrapper", () => {
  it("ignores injected internal salvage hooks at runtime", async () => {
    let called = false;
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
    });

    const runtime = createRuntimeContextService({
      sessionStore,
      archiveStore: repositories.archives,
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
    expect(await repositories.archives.listByScope(scope)).toHaveLength(1);
  });
});
