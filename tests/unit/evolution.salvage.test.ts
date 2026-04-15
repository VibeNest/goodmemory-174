import { describe, expect, it } from "bun:test";
import { createSessionArchive } from "../../src/evolution/contracts";
import { createRuntimeSalvageHooks } from "../../src/evolution/salvage";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";

function createFixture() {
  const repositories = createMemoryRepositories({
    documentStore: createInMemoryDocumentStore(),
    sessionStore: createInMemorySessionStore(),
  });
  const hooks = createRuntimeSalvageHooks({
    repositories,
    now: () => "2026-04-15T00:00:00.000Z",
    createId: (() => {
      let count = 0;
      return () => `proposal-${String(++count).padStart(4, "0")}`;
    })(),
    createTraceId: (() => {
      let count = 0;
      return () => `trace-${String(++count).padStart(4, "0")}`;
    })(),
  });

  return {
    hooks,
    repositories,
  };
}

describe("runtime salvage hooks", () => {
  it("emits compact-boundary proposals for unresolved loops and candidate procedural patterns", async () => {
    const { hooks, repositories } = createFixture();
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" };

    await hooks.onPreCompact?.({
      scope,
      overflowCount: 2,
      nextMessage: {
        id: "msg-3",
        role: "user",
        content: "Please keep the deploy rollback steps visible.",
      },
      nextMessages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Use the rollback checklist before deploy.",
        },
        {
          id: "msg-2",
          role: "user",
          content: "Keep the owner assignment explicit.",
        },
        {
          id: "msg-3",
          role: "user",
          content: "Please keep the deploy rollback steps visible.",
        },
      ],
      evictedMessages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Use the rollback checklist before deploy.",
        },
        {
          id: "msg-2",
          role: "user",
          content: "Keep the owner assignment explicit.",
        },
      ],
      runtimeState: {
        buffer: {
          sessionId: "s-1",
          userId: "u-1",
          messages: [],
          summary: "Earlier messages compacted.",
          summaryUpToIndex: 2,
          createdAt: "2026-04-15T00:00:00.000Z",
          lastActiveAt: "2026-04-15T00:00:00.000Z",
        },
        workingMemory: {
          sessionId: "s-1",
          userId: "u-1",
          currentGoal: "Keep compact handoff stable",
          constraints: [],
          openLoops: ["confirm rollback owner"],
          updatedAt: "2026-04-15T00:00:00.000Z",
          temporaryDecisions: ["Use the rollback checklist before deploy."],
        },
        journal: {
          sessionId: "s-1",
          userId: "u-1",
          worklog: ["Compaction boundary reached."],
          filesAndFunctions: ["src/runtime/contextService.ts"],
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      },
    });

    const proposals = await repositories.proposals.listByScope(scope);

    expect(proposals).toHaveLength(2);
    expect(proposals.map((proposal) => proposal.proposalType).sort()).toEqual([
      "maintenance_action",
      "procedural_pattern",
    ]);
    expect(
      proposals.some((proposal) =>
        proposal.summary.includes("confirm rollback owner"),
      ),
    ).toBe(true);
    expect(
      proposals.some((proposal) =>
        proposal.rationale.includes("Use the rollback checklist before deploy."),
      ),
    ).toBe(true);
  });

  it("emits session-end proposals linked to the session archive and stays idempotent", async () => {
    const { hooks, repositories } = createFixture();
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" };
    const archive = createSessionArchive({
      id: "archive-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
      summary: "Session ended with one unresolved rollout blocker.",
      keyDecisions: ["Use the rollout checklist before deploy."],
      unresolvedItems: ["verify blocker owner"],
      referencedArtifacts: ["docs/rollout-checklist.md"],
      createdAt: "2026-04-15T00:00:00.000Z",
      archivedAt: "2026-04-15T00:00:01.000Z",
    });

    await hooks.onSessionEnd?.({
      scope,
      archive,
    });
    await hooks.onSessionEnd?.({
      scope,
      archive,
    });

    const proposals = await repositories.proposals.listByScope(scope);

    expect(proposals).toHaveLength(2);
    expect(proposals.map((proposal) => proposal.linkedArchiveIds)).toEqual([
      ["archive-1"],
      ["archive-1"],
    ]);
    expect(
      proposals.some((proposal) => proposal.proposalType === "maintenance_action"),
    ).toBe(true);
    expect(
      proposals.some((proposal) => proposal.proposalType === "procedural_pattern"),
    ).toBe(true);
  });
});
