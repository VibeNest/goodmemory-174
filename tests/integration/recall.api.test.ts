import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createEpisodeMemory,
  createFactMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
  createUserProfile,
} from "../../src/domain/records";
import {
  createRuntimeContextService,
} from "../../src/runtime/contextService";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";

function seedMemory() {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore,
  });
  const runtime = createRuntimeContextService({
    sessionStore,
    now: () => "2026-01-01T00:00:00.000Z",
  });

  return {
    documentStore,
    sessionStore,
    repositories,
    runtime,
  };
}

describe("public recall API", () => {
  it("retrieves semantic and procedural memory for general chat", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Robotics engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "personal",
        content: "User likes weekend hiking in Hangzhou.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.feedback.upsert(
      createFeedbackMemory({
        id: "fb-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        rule: "Keep answers concise and action-oriented.",
        kind: "do",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.preferences.upsert(
      createPreferenceMemory({
        id: "pref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "response_style",
        value: "concise",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.references.add(
      createReferenceMemory({
        id: "ref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Migration runbook",
        pointer: "docs/migration-runbook.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "How should I answer this user?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.name).toBe("Lin");
    expect(result.facts).toHaveLength(1);
    expect(result.feedback).toHaveLength(1);
    expect(result.preferences).toHaveLength(1);
    expect(result.references).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("prod migration");
    expect(result.packet.profileSummary).toContain("Lin");
    expect(result.packet.preferenceSummary).toContain("response_style");
    expect(result.packet.referenceSummary).toContain("Migration runbook");
    expect(result.metadata.hits.some((hit) => hit.type === "feedback")).toBe(true);
    expect(result.metadata.hits.some((hit) => hit.reason === "semantic_preference")).toBe(true);
    expect(
      result.metadata.hits.find((hit) => hit.type === "fact")?.sourceMethod,
    ).toBe("explicit");
  });

  it("retrieves runtime continuity for coding-agent recalls and builds markdown context", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Runtime refactor touches recall and context builder.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });
    await runtime.updateWorkingMemory(
      { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      {
        currentGoal: "Finish recall engine",
        openLoops: ["wire buildContext output"],
      },
    );
    await runtime.updateSessionJournal(
      { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      {
        currentState: "Phase 6 in progress",
        appendWorklog: ["Recall router implemented."],
      },
    );

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "Continue the recall engine implementation.",
      retrievalProfile: "coding_agent",
    });

    expect(result.workingMemory?.currentGoal).toBe("Finish recall engine");
    expect(result.journal?.currentState).toBe("Phase 6 in progress");
    expect(result.packet.workingMemorySummary).toContain("Finish recall engine");

    const context = await memory.buildContext({
      recall: result,
      output: "markdown",
      maxTokens: 80,
    });

    expect(context.content).toContain("## Working Memory");
    expect(context.content).toContain("## Session Journal");
  });

  it("retrieves episodic memory for continuation-style prompts", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-prev",
        summary: "Last session narrowed the recall work to episodic retrieval and context sections.",
        keyDecisions: ["Implement episode retrieval before verification layer."],
        unresolvedItems: ["Add episode section to context builder."],
        topics: ["recall", "episodes"],
        importance: 0.9,
        confidence: 0.95,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "Continue the recall work from last time.",
      retrievalProfile: "coding_agent",
    });

    expect(result.episodes).toHaveLength(1);
    expect(result.packet.episodeSummary).toContain("episodic retrieval");
    expect(result.metadata.hits.some((hit) => hit.type === "episode")).toBe(true);

    const context = await memory.buildContext({
      recall: result,
      output: "markdown",
      maxTokens: 120,
    });

    expect(context.content).toContain("## Relevant Episodes");
  });

  it("does not inject unrelated long-term memory when the query has no relevant signal", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Migration runbook",
        pointer: "docs/migration-runbook.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        summary: "Previous session discussed rollout cleanup.",
        topics: ["rollout", "cleanup"],
        keyDecisions: [],
        unresolvedItems: [],
        importance: 0.8,
        confidence: 0.9,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-9",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-9", workspaceId: "workspace-a" },
      query: "Translate this sentence into Chinese.",
      retrievalProfile: "general_chat",
    });

    expect(result.references).toHaveLength(0);
    expect(result.episodes).toHaveLength(0);
  });

  it("explains recalled preferences and references even when no profile exists", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.preferences.upsert(
      createPreferenceMemory({
        id: "pref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "response_style",
        value: "concise",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.references.add(
      createReferenceMemory({
        id: "ref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Runbook",
        pointer: "docs/runbook.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-10",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-10", workspaceId: "workspace-a" },
      query: "How should I answer this user?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile).toBeNull();
    expect(result.metadata.hits.some((hit) => hit.type === "preference")).toBe(true);
    expect(result.metadata.hits.some((hit) => hit.type === "reference")).toBe(true);
  });

  it("retrieves Chinese facts for Chinese queries without faking English lexical matches", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-zh",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        content: "迁移流程目前仍然被审批阻塞。",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-zh",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const zhResult = await memory.recall({
      scope: { userId: "u-zh", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "现在项目卡在哪里？",
    });
    const enResult = await memory.recall({
      scope: { userId: "u-zh", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "What is the current project blocker?",
      locale: "en-US",
    });

    expect(zhResult.facts).toHaveLength(1);
    expect(zhResult.metadata.locale).toBe("zh-CN");
    expect(enResult.facts).toHaveLength(0);
  });

  it("does not leak English facts into Chinese answer-style queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-en",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        content: "The migration is blocked on approval.",
        source: {
          method: "explicit",
          extractedAt: "2026-01-01T00:00:00.000Z",
          locale: "en-US",
        },
      }),
    );
    await runtime.startSession({
      userId: "u-zh",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-zh", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "我应该怎么回复这个用户？",
    });

    expect(result.facts).toHaveLength(0);
  });

  it("does not fall back to English references for Chinese reference-seeking queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-en",
        userId: "u-zh",
        workspaceId: "workspace-a",
        title: "Migration runbook",
        pointer: "docs/migration-runbook.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-zh",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-zh", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "应该参考哪份文档？",
    });

    expect(result.references).toHaveLength(0);
  });

  it("retrieves Chinese-authored ASCII references for Chinese reference-seeking queries", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    await memory.remember({
      scope: { userId: "u-zh-ref", sessionId: "s-1", workspaceId: "workspace-a" },
      messages: [
        {
          role: "user",
          content: "以docs/migration-runbook.md为准。",
        },
      ],
    });

    const result = await memory.recall({
      scope: { userId: "u-zh-ref", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "应该参考哪份文档？",
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.pointer).toBe("docs/migration-runbook.md");
  });

  it("does not surface English episodes for Chinese continuation queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-en",
        userId: "u-zh",
        workspaceId: "workspace-a",
        sessionId: "s-prev",
        summary: "Last session continued the rollout cleanup and dependency review.",
        keyDecisions: ["Continue with the old rollout checklist."],
        unresolvedItems: ["Review the migration plan."],
        topics: ["rollout", "checklist"],
        importance: 0.8,
        confidence: 0.9,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await runtime.startSession({
      userId: "u-zh",
      sessionId: "s-1",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-zh", sessionId: "s-1", workspaceId: "workspace-a" },
      query: "继续上次的工作流修复。",
    });

    expect(result.episodes).toHaveLength(0);
  });
});
