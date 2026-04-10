import { describe, expect, it } from "bun:test";
import { createInMemoryDocumentStore, createInMemorySessionStore } from "../../src/storage/memory";
import {
  createRuntimeContextService,
} from "../../src/runtime/contextService";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";
import {
  DeterministicClock,
  createDeterministicIdGenerator,
} from "../../src/testing/utils";

function createService(maxBufferedMessages = 3) {
  const clock = new DeterministicClock("2026-01-01T00:00:00.000Z");
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore,
  });
  const service = createRuntimeContextService({
    sessionStore,
    archiveStore: repositories.archives,
    now: () => clock.now().toISOString(),
    createMessageId: createDeterministicIdGenerator("msg"),
    createArchiveId: createDeterministicIdGenerator("archive"),
    maxBufferedMessages,
  });

  return {
    clock,
    repositories,
    service,
  };
}

describe("runtime context service", () => {
  it("starts isolated sessions and enforces lifecycle boundaries", async () => {
    const { clock, service } = createService();
    const sessionOne = { userId: "u-1", sessionId: "s-1" };
    const sessionTwo = { userId: "u-1", sessionId: "s-2" };

    const started = await service.startSession(sessionOne);
    expect(started.buffer.messages).toEqual([]);
    expect(started.workingMemory.openLoops).toEqual([]);
    expect(started.journal.worklog).toEqual([]);

    await service.appendToSession(sessionOne, {
      role: "user",
      content: "Remember the runtime plan.",
    });

    clock.advanceMs(1000);
    await service.startSession(sessionTwo);
    await service.appendToSession(sessionTwo, {
      role: "user",
      content: "This is another session.",
    });

    expect((await service.getRuntimeState(sessionOne)).buffer.messages).toHaveLength(1);
    expect((await service.getRuntimeState(sessionTwo)).buffer.messages).toHaveLength(1);

    await service.endSession(sessionOne);

    await expect(
      service.appendToSession(sessionOne, {
        role: "assistant",
        content: "This should be rejected.",
      }),
    ).rejects.toThrow("ended");

    const restarted = await service.startSession(sessionOne);
    expect(restarted.buffer.messages).toEqual([]);
  });

  it("maintains a sliding session buffer and summary placeholder", async () => {
    const { clock, service } = createService(2);
    const scope = { userId: "u-1", sessionId: "s-1" };

    await service.startSession(scope);
    await service.appendToSession(scope, { role: "user", content: "m1" });
    clock.advanceMs(1000);
    await service.appendToSession(scope, { role: "assistant", content: "m2" });
    clock.advanceMs(1000);
    await service.appendToSession(scope, { role: "user", content: "m3" });

    let state = await service.getRuntimeState(scope);
    expect(state.buffer.messages.map((message) => message.content)).toEqual(["m2", "m3"]);
    expect(state.buffer.summary).toBe("Earlier messages compacted.");
    expect(state.buffer.summaryUpToIndex).toBe(1);

    clock.advanceMs(1000);
    await service.setSessionSummary(scope, {
      summary: "User confirmed runtime architecture.",
      summaryUpToIndex: 2,
    });

    state = await service.getRuntimeState(scope);
    expect(state.buffer.summary).toBe("User confirmed runtime architecture.");
    expect(state.buffer.summaryUpToIndex).toBe(2);
  });

  it("updates working memory without leaking into durable memory semantics", async () => {
    const { clock, service } = createService();
    const scope = { userId: "u-1", sessionId: "s-1" };

    await service.startSession(scope);

    let snapshot = await service.updateWorkingMemory(scope, {
      currentGoal: "Implement runtime context engine",
      openLoops: ["wire runtime recall", "keep journal updated"],
      temporaryDecisions: ["start with in-memory store"],
    });

    expect(snapshot.currentGoal).toBe("Implement runtime context engine");
    expect(snapshot.openLoops).toEqual([
      "wire runtime recall",
      "keep journal updated",
    ]);
    expect(snapshot.temporaryDecisions).toEqual(["start with in-memory store"]);

    clock.advanceMs(1000);
    snapshot = await service.updateWorkingMemory(scope, {
      openLoops: ["wire runtime recall", "add spillover scaffolding"],
      resolvedOpenLoops: ["keep journal updated"],
      temporaryDecisions: ["keep runtime state internal"],
    });

    expect(snapshot.openLoops).toEqual([
      "wire runtime recall",
      "add spillover scaffolding",
    ]);
    expect(snapshot.temporaryDecisions).toEqual(["keep runtime state internal"]);

    clock.advanceMs(1000);
    snapshot = await service.updateWorkingMemory(scope, {
      currentGoal: null,
      temporaryDecisions: null,
    });

    expect(snapshot.currentGoal).toBeUndefined();
    expect(snapshot.temporaryDecisions).toBeUndefined();
  });

  it("creates and updates a structurally valid session journal", async () => {
    const { service } = createService();
    const scope = { userId: "u-1", sessionId: "s-1" };

    await service.startSession(scope);

    let journal = await service.updateSessionJournal(scope, {
      title: "Runtime context rollout",
      currentState: "storage complete, runtime in progress",
      filesAndFunctions: ["src/runtime/contextService.ts"],
      appendWorklog: ["Phase 3 storage completed."],
      lastSummarizedMessageId: "msg-0002",
    });

    expect(journal.filesAndFunctions).toEqual(["src/runtime/contextService.ts"]);
    expect(journal.workflow).toEqual([]);
    expect(journal.worklog).toEqual(["Phase 3 storage completed."]);
    expect(journal.lastSummarizedMessageId).toBe("msg-0002");

    journal = await service.updateSessionJournal(scope, {
      learnings: ["Shared storage contracts reduce adapter drift."],
      appendWorklog: ["Phase 4 runtime service added."],
    });

    expect(journal.learnings).toEqual([
      "Shared storage contracts reduce adapter drift.",
    ]);
    expect(journal.worklog).toEqual([
      "Phase 3 storage completed.",
      "Phase 4 runtime service added.",
    ]);
  });

  it("builds runtime recall differently for general chat and coding agent profiles", async () => {
    const { service } = createService();
    const scope = { userId: "u-1", sessionId: "s-1" };

    await service.startSession(scope);
    await service.appendToSession(scope, {
      role: "user",
      content: "Keep the refactor aligned with the PRD.",
    });
    await service.updateWorkingMemory(scope, {
      currentGoal: "Finish runtime context engine",
      openLoops: ["wire runtime recall"],
    });
    await service.updateSessionJournal(scope, {
      currentState: "Phase 4 in progress",
      appendWorklog: ["Runtime skeleton implemented."],
    });

    const generalChat = await service.getRuntimeRecall(scope, "general_chat");
    expect(generalChat.workingMemory?.currentGoal).toBe("Finish runtime context engine");
    expect(generalChat.journal).toBeNull();

    const codingAgent = await service.getRuntimeRecall(scope, "coding_agent");
    expect(codingAgent.workingMemory?.openLoops).toEqual(["wire runtime recall"]);
    expect(codingAgent.journal?.currentState).toBe("Phase 4 in progress");
  });

  it("persists a session archive on endSession when the session has continuity signal", async () => {
    const { clock, repositories, service } = createService();
    const scope = {
      userId: "u-1",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agentId: "agent-a",
      sessionId: "s-1",
    };

    await service.startSession(scope);
    await service.appendToSession(scope, {
      role: "user",
      content: "Please keep the rollback plan ready for Friday night.",
    });
    await service.updateWorkingMemory(scope, {
      currentGoal: "Finish archive write path",
      openLoops: ["wire archive recall"],
      temporaryDecisions: ["Keep runtime archive writes deterministic."],
    });
    await service.updateSessionJournal(scope, {
      currentState: "Phase 14.2 in progress",
      filesAndFunctions: ["src/runtime/contextService.ts"],
      appendWorklog: ["Archive write path drafted."],
      keyResults: ["Session archive persistence is the next checkpoint."],
    });

    clock.advanceMs(1000);
    await service.endSession(scope);

    const archives = await repositories.archives.listByScope(scope);
    expect(archives).toHaveLength(1);

    const archive = archives[0]!;
    expect(archive.id).toBe("archive-0001");
    expect(archive.summary).toContain("Phase 14.2 in progress");
    expect(archive.keyDecisions).toEqual([
      "Keep runtime archive writes deterministic.",
      "Session archive persistence is the next checkpoint.",
    ]);
    expect(archive.unresolvedItems).toEqual(["wire archive recall"]);
    expect(archive.referencedArtifacts).toEqual(["src/runtime/contextService.ts"]);
    expect(archive.scopeLineage).toEqual(["tenant-a", "workspace-a", "agent-a"]);
    expect(archive.normalizedTranscript).toContain("rollback plan ready");
    expect(archive.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(archive.archivedAt).toBe("2026-01-01T00:00:01.000Z");
  });

  it("does not persist an archive when ending an untouched empty session", async () => {
    const { repositories, service } = createService();
    const scope = { userId: "u-1", sessionId: "s-empty" };

    await service.startSession(scope);
    await service.endSession(scope);

    expect(await repositories.archives.listByUser("u-1")).toHaveLength(0);
  });
});
