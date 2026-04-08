import { describe, expect, it } from "bun:test";
import { createEpisodeMemory } from "../../src/domain/records";
import {
  createMaintenanceRunner,
} from "../../src/maintenance/runner";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";

describe("maintenance consolidation", () => {
  it("consolidates related active episodes and archives originals", async () => {
    const documentStore = createInMemoryDocumentStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore: createInMemorySessionStore(),
    });
    const runner = createMaintenanceRunner({
      repositories,
      now: () => "2026-04-02T00:00:00.000Z",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        summary: "Recall refactor covered routing and semantic selection.",
        topics: ["recall", "routing", "semantic"],
        unresolvedItems: ["budget-aware context output"],
        keyDecisions: ["keep router deterministic"],
        importance: 0.8,
        confidence: 0.9,
        createdAt: "2026-03-30T00:00:00.000Z",
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        summary: "Recall work continued with episodic retrieval and context sections.",
        topics: ["recall", "episodes", "semantic"],
        unresolvedItems: ["finalize markdown output"],
        keyDecisions: ["add episode summaries"],
        importance: 0.85,
        confidence: 0.92,
        createdAt: "2026-03-31T00:00:00.000Z",
      }),
    );

    const report = await runner.run(scope, ["consolidation"]);
    expect(report.jobs[0]?.applied).toBe(1);

    const episodes = await repositories.episodes.listByScope(scope);
    const archived = episodes.filter((episode) => episode.archivedAt);
    const active = episodes.filter((episode) => !episode.archivedAt);

    expect(archived).toHaveLength(2);
    expect(active).toHaveLength(1);
    expect(active[0]?.summary).toContain("Consolidated");
    expect(active[0]?.topics).toContain("recall");
  });

  it("consolidates related Chinese episodes", async () => {
    const documentStore = createInMemoryDocumentStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore: createInMemorySessionStore(),
    });
    const runner = createMaintenanceRunner({
      repositories,
      now: () => "2026-04-02T00:00:00.000Z",
    });
    const scope = { userId: "u-zh", workspaceId: "workspace-a" };

    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-zh-1",
        userId: "u-zh",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        summary: "上次会话聚焦迁移流程和审批阻塞。",
        topics: ["迁移流程", "审批阻塞"],
        unresolvedItems: ["等待审批"],
        keyDecisions: ["继续跟进审批"],
        importance: 0.8,
        confidence: 0.9,
        createdAt: "2026-03-30T00:00:00.000Z",
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-zh-2",
        userId: "u-zh",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        summary: "本次会话继续处理迁移流程，确认审批仍未完成。",
        topics: ["迁移流程", "审批"],
        unresolvedItems: ["确认审批时间"],
        keyDecisions: ["维持当前方案"],
        importance: 0.82,
        confidence: 0.91,
        createdAt: "2026-03-31T00:00:00.000Z",
      }),
    );

    const report = await runner.run(scope, ["consolidation"]);
    expect(report.jobs[0]?.applied).toBe(1);
  });
});
