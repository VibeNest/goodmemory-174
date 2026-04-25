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

  it("keeps public runtime archives summary-only without normalized transcripts", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const runtime = createRuntimeContextService({
      sessionStore,
      archiveStore: createRuntimeArchiveStore({ documentStore }),
      now: () => "2026-04-25T00:00:00.000Z",
      createArchiveId: () => "archive-public-summary",
    });
    const scope = { userId: "u-1", sessionId: "s-summary-only" };

    await runtime.startSession(scope);
    await runtime.appendToSession(scope, {
      role: "user",
      content: "This public runtime message must not be archived as transcript.",
    });
    await runtime.updateWorkingMemory(scope, {
      currentGoal: "Keep public runtime archives summary only",
      openLoops: ["Confirm transcript omission"],
    });
    await runtime.endSession(scope, {
      archive: {
        mode: "summary_only",
        includeNormalizedTranscript: true,
      },
    } as any);

    const archives = await documentStore.query(SESSION_ARCHIVES_COLLECTION, {
      userId: scope.userId,
    }) as Array<{ normalizedTranscript?: string; summary?: string }>;

    expect(archives).toHaveLength(1);
    expect(archives[0]?.summary).toContain("Keep public runtime archives summary only");
    expect(archives[0]?.normalizedTranscript).toBeUndefined();
    expect(JSON.stringify(archives)).not.toContain(
      "This public runtime message must not be archived as transcript.",
    );
  });
});
