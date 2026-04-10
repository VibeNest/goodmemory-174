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

  it("does not surface unrelated personal facts for answer-composition recalls", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "personal",
        content: "For education tasks, avoid irrelevant carry-over from hobby preferences.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-11",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-11", workspaceId: "workspace-a" },
      query:
        "Please confirm the updated runbook, my role, and the open loop before proposing the next step for release quality program.",
      retrievalProfile: "general_chat",
    });

    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not promote unrelated project facts when confirming preferred response style", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

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
    await repositories.preferences.upsert(
      createPreferenceMemory({
        id: "pref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "response_style",
        value: "concise bullet points",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-confirm-style",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-confirm-style",
        workspaceId: "workspace-a",
      },
      query: "Please confirm my preferred response style.",
      retrievalProfile: "general_chat",
    });

    expect(result.preferences).toHaveLength(1);
    expect(result.preferences[0]?.value).toBe("concise bullet points");
    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not pull unrelated project facts into reference-only runbook queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-runtime",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Runtime runbook",
        pointer: "docs/runtime-runbook.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Vendor approval is still blocking the migration rollout.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-runbook-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-runbook-only",
        workspaceId: "workspace-a",
      },
      query: "Which runbook should I use for runtime work?",
      retrievalProfile: "general_chat",
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.pointer).toBe("docs/runtime-runbook.md");
    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not let workflow-doc queries pull workflow status facts into recall", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-workflow",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Workflow guide",
        pointer: "docs/workflow-guide.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-workflow-status",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-workflow-doc-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-workflow-doc-only",
        workspaceId: "workspace-a",
      },
      query: "Which workflow doc should I use?",
      retrievalProfile: "general_chat",
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.pointer).toBe("docs/workflow-guide.md");
    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not pull unrelated project facts into blocker confirmation queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The current blocker is vendor approval for runtime migration.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-role",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "my current role is staff platform engineer leading runtime reliability.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-blocker-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-blocker-only",
        workspaceId: "workspace-a",
      },
      query: "What is the current blocker?",
      retrievalProfile: "general_chat",
    });

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("vendor approval");
    expect(result.facts[0]?.content).not.toContain("current role");
  });

  it("records explainability traces for returned and suppressed fact candidates", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker-trace",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "blocker",
        scopeKind: "project",
        subject: "migration rollout",
        content: "The current blocker is vendor approval for migration rollout.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-role-trace",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "role_update",
        scopeKind: "identity",
        subject: "migration rollout",
        content: "my current role is staff platform engineer leading migration rollout.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-trace-blocker",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-trace-blocker",
        workspaceId: "workspace-a",
      },
      query: "What is the current blocker?",
      retrievalProfile: "general_chat",
    });

    const blockerTrace = result.metadata.candidateTraces.find(
      (trace) => trace.memoryId === "fact-blocker-trace",
    );
    const roleTrace = result.metadata.candidateTraces.find(
      (trace) => trace.memoryId === "fact-role-trace",
    );

    expect(blockerTrace?.returned).toBe(true);
    expect(blockerTrace?.slot).toBe("blocker");
    expect(blockerTrace?.whyReturned).toContain("slot=blocker");
    expect(roleTrace?.returned).toBe(false);
    expect(roleTrace?.whySuppressed).toBe("slot mismatch");
  });

  it("does not fall back to open-loop facts for blocker queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-open-loop-only",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The open loop is pending signoff.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-blocker-slot-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-blocker-slot-only",
        workspaceId: "workspace-a",
      },
      query: "What is the current blocker?",
      retrievalProfile: "general_chat",
    });

    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not fall back to blocker facts for open-loop queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker-only",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The blocker is vendor approval.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-open-loop-slot-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-open-loop-slot-only",
        workspaceId: "workspace-a",
      },
      query: "What is the open loop?",
      retrievalProfile: "general_chat",
    });

    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not fall back to unrelated blocker facts for role queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The blocker is vendor approval for migration rollout.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-only",
        workspaceId: "workspace-a",
      },
      query: "What is my current role?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("does not pull role or blocker facts into focus-only queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-focus-only",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "focus_update",
        scopeKind: "project",
        subject: "runtime reliability",
        content: "my current focus is runtime reliability and platform migration.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-role-noise",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "role_update",
        scopeKind: "identity",
        subject: "runtime reliability",
        content: "my current role is staff platform engineer leading runtime reliability.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker-noise",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "blocker",
        scopeKind: "project",
        subject: "runtime reliability",
        content: "The current blocker is vendor approval for runtime reliability.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-focus-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-focus-only",
        workspaceId: "workspace-a",
      },
      query: "What is my current focus?",
      retrievalProfile: "general_chat",
    });

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("current focus");
    expect(result.facts[0]?.content).not.toContain("current role");
    expect(result.facts[0]?.content).not.toContain("current blocker");
    expect(
      result.metadata.candidateTraces.find((trace) => trace.memoryId === "fact-role-noise")
        ?.whySuppressed,
    ).toBe("slot mismatch");
    expect(
      result.metadata.candidateTraces.find((trace) => trace.memoryId === "fact-blocker-noise")
        ?.whySuppressed,
    ).toBe("slot mismatch");
  });

  it("keeps project-state facts for mixed role and next-step queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The blocker is vendor approval for migration rollout.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-next-step",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-next-step",
        workspaceId: "workspace-a",
      },
      query: "What is my current role, and what should I do next for the migration rollout?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("vendor approval");
  });

  it("falls back to a unique active state fact for mixed role and next-step queries without lexical overlap", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker-unique",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The blocker is vendor approval.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-next-step-implicit-blocker",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-next-step-implicit-blocker",
        workspaceId: "workspace-a",
      },
      query: "What is my current role, and what should I do next for the migration rollout?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toBe("The blocker is vendor approval.");
    expect(
      result.metadata.candidateTraces.find(
        (trace) => trace.memoryId === "fact-blocker-unique",
      )?.fallback,
    ).toBe("same_slot_unique_candidate");
  });

  it("does not treat generic project facts as project-state support for next-step queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-generic-next-step",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "generic_project",
        scopeKind: "project",
        subject: "runtime reliability",
        content: "The architecture uses Kafka.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-next-step-generic-project",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-next-step-generic-project",
        workspaceId: "workspace-a",
      },
      query: "What is my current role, and what should I do next for runtime reliability?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(0);
    expect(
      result.metadata.candidateTraces.find(
        (trace) => trace.memoryId === "fact-generic-next-step",
      )?.whySuppressed,
    ).toBe("slot mismatch");
  });

  it("keeps project-state facts available to project-state support for next-step queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-project-state-next-step",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "project_state",
        scopeKind: "project",
        subject: "runtime reliability",
        content: "Owner signoff is still pending for runtime reliability rollout.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-next-step-project-state",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-next-step-project-state",
        workspaceId: "workspace-a",
      },
      query: "What is my current role, and what should I do next for runtime reliability?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("Owner signoff is still pending");
  });

  it("recognizes legacy next-milestone facts as project-state support for next-step queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-legacy-next-milestone",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        subject: "runtime reliability",
        content: "The next milestone is cutover readiness for runtime reliability.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-next-step-next-milestone",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-next-step-next-milestone",
        workspaceId: "workspace-a",
      },
      query: "What is my current role, and what should I do next for runtime reliability?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("next milestone");
  });

  it("does not guess among multiple state facts for mixed role and next-step queries without lexical overlap", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.profiles.upsert(
      createUserProfile({
        userId: "u-1",
        identity: { name: "Lin", role: "Staff platform engineer" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker-a",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The blocker is vendor approval.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-blocker-b",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The open loop is pending signoff.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-role-next-step-ambiguous",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-role-next-step-ambiguous",
        workspaceId: "workspace-a",
      },
      query: "What is my current role, and what should I do next for the migration rollout?",
      retrievalProfile: "general_chat",
    });

    expect(result.profile?.identity.role).toBe("Staff platform engineer");
    expect(result.facts).toHaveLength(0);
    expect(result.packet.factSummary).toBeUndefined();
  });

  it("keeps references primary and project-state support narrow for reference plus next-step queries", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-next-step",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Release runbook",
        pointer: "docs/release-runbook.md",
        referenceKind: "source_of_truth",
        subject: "release quality",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-support-blocker",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "blocker",
        scopeKind: "project",
        subject: "release quality",
        content: "The current blocker is vendor approval for release quality.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-role-noise-reference",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "role_update",
        scopeKind: "identity",
        subject: "release quality",
        content: "my current role is staff platform engineer leading release quality.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await runtime.startSession({
      userId: "u-1",
      sessionId: "s-reference-next-step",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: {
        userId: "u-1",
        sessionId: "s-reference-next-step",
        workspaceId: "workspace-a",
      },
      query: "Which runbook is the source of truth, and what should I do next for release quality?",
      retrievalProfile: "general_chat",
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.pointer).toBe("docs/release-runbook.md");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toContain("vendor approval");
    expect(result.facts[0]?.content).not.toContain("current role");
    expect(
      result.metadata.candidateTraces.find((trace) => trace.memoryId === "fact-role-noise-reference")
        ?.whySuppressed,
    ).toBe("slot mismatch");
  });

  it("keeps corrected source-of-truth recall bound to the superseded project's subject across multiple projects", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    await memory.remember({
      scope: { userId: "u-ref", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Use docs/runbook-v1.md as the source of truth for migration work.",
        },
      ],
    });
    await memory.remember({
      scope: { userId: "u-ref", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content:
            "Correction: docs/runbook-v2.md is now the source of truth, not docs/runbook-v1.md. Please update that.",
        },
      ],
    });
    await memory.remember({
      scope: { userId: "u-ref", workspaceId: "workspace-a", sessionId: "s-3" },
      messages: [
        {
          role: "user",
          content: "Use docs/current-runbook.md as the source of truth for payments work.",
        },
      ],
    });

    const result = await memory.recall({
      scope: {
        userId: "u-ref",
        workspaceId: "workspace-a",
        sessionId: "s-4",
      },
      query: "Which runbook is the source of truth for migration work?",
      retrievalProfile: "general_chat",
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]?.pointer).toBe("docs/runbook-v2.md");
    expect(result.references[0]?.subject).toBe("migration work");
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

  it("keeps Chinese blocker-only queries inside the blocker slot", async () => {
    const { documentStore, sessionStore, repositories, runtime } = seedMemory();

    await repositories.facts.add(
      createFactMemory({
        id: "fact-zh-blocker",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "blocker",
        scopeKind: "project",
        subject: "迁移流程",
        content: "当前阻塞是供应商审批。",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z", locale: "zh-CN" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-zh-open-loop-noise",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        factKind: "open_loop",
        scopeKind: "project",
        subject: "迁移流程",
        content: "当前开环是最终验收。",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z", locale: "zh-CN" },
      }),
    );
    await runtime.startSession({
      userId: "u-zh",
      sessionId: "s-zh-blocker-only",
      workspaceId: "workspace-a",
    });

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await memory.recall({
      scope: { userId: "u-zh", sessionId: "s-zh-blocker-only", workspaceId: "workspace-a" },
      query: "当前阻塞是什么？",
      locale: "zh-CN",
      retrievalProfile: "general_chat",
    });

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.content).toBe("当前阻塞是供应商审批。");
    expect(
      result.metadata.candidateTraces.find((trace) => trace.memoryId === "fact-zh-open-loop-noise")
        ?.whySuppressed,
    ).toBe("slot mismatch");
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
