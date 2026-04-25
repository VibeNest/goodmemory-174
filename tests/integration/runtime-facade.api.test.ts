import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  type GoodMemoryTraceSpan,
} from "../../src";

describe("public memory.runtime facade", () => {
  it("manages session runtime through the createGoodMemory result", async () => {
    const spans: GoodMemoryTraceSpan[] = [];
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit(span) {
            spans.push(span);
          },
        },
      },
      testing: {
        now: () => new Date("2026-04-25T00:00:00.000Z"),
      },
    });
    const scope = {
      userId: "runtime-facade-user",
      workspaceId: "phase-38",
      sessionId: "runtime-session-1",
    };

    await memory.runtime.startSession({ scope });
    const buffer = await memory.runtime.appendMessage({
      scope,
      message: {
        role: "user",
        content: "Let's continue the migration smoke verification.",
      },
    });
    const workingMemory = await memory.runtime.updateWorkingMemory({
      scope,
      patch: {
        currentGoal: "Finish migration smoke verification",
        openLoops: ["Confirm staging smoke results"],
      },
    });
    const journal = await memory.runtime.updateSessionJournal({
      scope,
      patch: {
        title: "Migration smoke",
        currentState: "Staging smoke still needs confirmation.",
        appendWorklog: ["Captured the open smoke verification loop."],
      },
    });
    const snapshot = await memory.runtime.getRecallSnapshot({
      scope,
      retrievalProfile: "coding_agent",
    });
    const recall = await memory.recall({
      scope,
      query: "What is the current migration goal?",
      retrievalProfile: "coding_agent",
    });

    expect(buffer.buffer.messages).toHaveLength(1);
    expect(workingMemory.workingMemory.currentGoal).toBe(
      "Finish migration smoke verification",
    );
    expect(journal.journal.title).toBe("Migration smoke");
    expect(snapshot.snapshot.workingMemory?.openLoops).toEqual([
      "Confirm staging smoke results",
    ]);
    expect(snapshot.snapshot.journal?.currentState).toContain("Staging smoke");
    expect(recall.workingMemory?.currentGoal).toBe(
      "Finish migration smoke verification",
    );
    expect(recall.journal?.title).toBe("Migration smoke");
    expect(spans.map((span) => `${span.name}:${span.status}`)).toContain(
      "runtime.session.start:succeeded",
    );
    expect(JSON.stringify(spans)).not.toContain(
      "Let's continue the migration smoke verification.",
    );
    expect(JSON.stringify(spans)).not.toContain("runtime-facade-user");
  });

  it("ends sessions without archive persistence by default", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const scope = {
      userId: "runtime-default-archive-user",
      workspaceId: "phase-38",
      sessionId: "runtime-session-2",
    };

    await memory.runtime.startSession({ scope });
    await memory.runtime.appendMessage({
      scope,
      message: {
        role: "user",
        content: "Remember this session transcript must not be archived by default.",
      },
    });
    await memory.runtime.updateWorkingMemory({
      scope,
      patch: {
        currentGoal: "Verify archive defaults",
        openLoops: ["Check archive count"],
      },
    });

    const ended = await memory.runtime.endSession({ scope });
    const exported = await memory.exportMemory({
      scope,
      includeRuntime: true,
    });

    expect(ended.state.workingMemory.currentGoal).toBe("Verify archive defaults");
    expect(exported.durable.archives).toHaveLength(0);
    expect(exported.runtime?.workingMemory).toBeNull();
    expect(exported.runtime?.journal).toBeNull();
  });

  it("only archives a summary-only session when explicitly requested", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      testing: {
        now: () => new Date("2026-04-25T00:00:00.000Z"),
      },
    });
    const scope = {
      userId: "runtime-summary-archive-user",
      workspaceId: "phase-38",
      sessionId: "runtime-session-3",
    };

    await memory.runtime.startSession({ scope });
    await memory.runtime.appendMessage({
      scope,
      message: {
        role: "user",
        content: "This message should not appear as a normalized transcript.",
      },
    });
    await memory.runtime.updateWorkingMemory({
      scope,
      patch: {
        currentGoal: "Archive the session summary only",
        openLoops: ["Confirm transcript omission"],
      },
    });

    await memory.runtime.endSession({
      scope,
      archive: {
        mode: "summary_only",
        includeNormalizedTranscript: false,
      },
    });
    const exported = await memory.exportMemory({
      scope,
    });

    expect(exported.durable.archives).toHaveLength(1);
    expect(exported.durable.archives[0]?.summary).toContain(
      "Archive the session summary only",
    );
    expect(exported.durable.archives[0]?.unresolvedItems).toEqual([
      "Confirm transcript omission",
    ]);
    expect(exported.durable.archives[0]?.normalizedTranscript).toBeUndefined();
    expect(JSON.stringify(exported.durable.archives)).not.toContain(
      "This message should not appear as a normalized transcript.",
    );
  });
});
