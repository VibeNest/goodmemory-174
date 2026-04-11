import { describe, expect, it } from "bun:test";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";
import {
  createFactMemory,
  createEpisodeMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
  createSessionBuffer,
  createSessionJournal,
  createUserProfile,
  createWorkingMemorySnapshot,
} from "../../src/domain/records";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import {
  createExperienceRecord,
  createSessionArchive,
} from "../../src/evolution/contracts";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";

describe("memory repositories", () => {
  it("provides typed accessors over storage contracts", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });

    const profile = createUserProfile({
      userId: "u-1",
      identity: { name: "Lin" },
    });
    await repositories.profiles.upsert(profile);
    expect(await repositories.profiles.get("u-1")).toEqual(profile);

    const fact = createFactMemory({
      id: "f-1",
      userId: "u-1",
      category: "project",
      content: "Robot workflow remains open.",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    });
    await repositories.facts.add(fact);

    expect(await repositories.facts.listByUser("u-1")).toHaveLength(1);
  });

  it("supports scope-aware retrieval for facts and feedback", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });

    await repositories.facts.add(
      createFactMemory({
        id: "f-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Workspace A fact.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "f-2",
        userId: "u-1",
        workspaceId: "workspace-b",
        category: "project",
        content: "Workspace B fact.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.feedback.upsert(
      createFeedbackMemory({
        id: "fb-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        rule: "Keep answers concise.",
        kind: "do",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    expect(
      await repositories.facts.listByScope({
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
    expect(
      await repositories.feedback.listByScope({
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
    expect(
      await repositories.feedback.listByScope({
        userId: "u-1",
        workspaceId: "workspace-b",
      }),
    ).toHaveLength(0);
  });

  it("persists preferences, references, episodes, and runtime state through typed accessors", async () => {
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    };
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
      vectorStore: createInMemoryVectorStore(),
    });

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
    await repositories.references.add(
      createReferenceMemory({
        id: "ref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Runbook",
        pointer: "docs/runtime-runbook.md",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        summary: "Conversation covered runtime migration.",
        keyDecisions: [],
        unresolvedItems: ["confirm rollout"],
        topics: ["runtime migration"],
      }),
    );
    await repositories.sessionBuffers.save(
      scope,
      createSessionBuffer({
        sessionId: "s-1",
        userId: "u-1",
      }),
    );
    await repositories.workingMemory.save(
      scope,
      createWorkingMemorySnapshot({
        sessionId: "s-1",
        userId: "u-1",
        currentGoal: "finish runtime migration",
      }),
    );
    await repositories.sessionJournals.save(
      scope,
      createSessionJournal({
        sessionId: "s-1",
        userId: "u-1",
        worklog: ["runtime migration started"],
      }),
    );
    await repositories.vectorIndex?.upsertEpisodeEmbedding([
      {
        id: "ep-1",
        embedding: [1, 0, 0],
        metadata: { userId: "u-1", workspaceId: "workspace-a" },
        content: "runtime migration",
      },
    ]);

    expect(await repositories.preferences.listByUser("u-1")).toHaveLength(1);
    expect(await repositories.references.listByUser("u-1")).toHaveLength(1);
    expect(await repositories.episodes.listByUser("u-1")).toHaveLength(1);
    expect(await repositories.preferences.listByScope(scope)).toHaveLength(1);
    expect(await repositories.references.listByScope(scope)).toHaveLength(1);
    expect(await repositories.episodes.listByScope(scope)).toHaveLength(1);
    expect((await repositories.sessionBuffers.get(scope))?.sessionId).toBe("s-1");
    expect((await repositories.workingMemory.get(scope))?.currentGoal).toBe(
      "finish runtime migration",
    );
    expect((await repositories.sessionJournals.get(scope))?.worklog).toEqual([
      "runtime migration started",
    ]);
    expect(
      await repositories.vectorIndex?.searchEpisodeEmbedding([1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1" },
      }),
    ).toHaveLength(1);
  });

  it("stores and searches fact, reference, and episode embeddings through typed vector hooks", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
      vectorStore: createInMemoryVectorStore(),
    });

    await repositories.vectorIndex?.upsertFactEmbedding([
      {
        id: "fact-1",
        embedding: [1, 0, 0],
        metadata: {
          userId: "u-1",
          workspaceId: "workspace-a",
          memoryType: "fact",
        },
        content: "runtime rollout blocked on vendor approval",
      },
    ]);
    await repositories.vectorIndex?.upsertReferenceEmbedding([
      {
        id: "ref-1",
        embedding: [0, 1, 0],
        metadata: {
          userId: "u-1",
          workspaceId: "workspace-a",
          memoryType: "reference",
        },
        content: "Runbook\ndocs/runtime-runbook.md",
      },
    ]);
    await repositories.vectorIndex?.upsertEpisodeEmbedding([
      {
        id: "ep-1",
        embedding: [0, 0, 1],
        metadata: {
          userId: "u-1",
          workspaceId: "workspace-a",
          memoryType: "episode",
        },
        content: "Runtime migration continuity",
      },
    ]);

    expect(
      await repositories.vectorIndex?.searchFactEmbedding([1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);
    expect(
      await repositories.vectorIndex?.searchReferenceEmbedding([0, 1, 0], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);
    expect(
      await repositories.vectorIndex?.searchEpisodeEmbedding([0, 0, 1], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);
    expect(
      await repositories.vectorIndex?.searchFactEmbedding([1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-b" },
      }),
    ).toHaveLength(0);
    expect(await repositories.vectorIndex?.getFactEmbedding("fact-1")).toEqual({
      id: "fact-1",
      embedding: [1, 0, 0],
      metadata: {
        userId: "u-1",
        workspaceId: "workspace-a",
        memoryType: "fact",
      },
      content: "runtime rollout blocked on vendor approval",
    });
  });

  it("deletes fact, reference, and episode embeddings through typed vector hooks", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
      vectorStore: createInMemoryVectorStore(),
    });

    await repositories.vectorIndex?.upsertFactEmbedding([
      {
        id: "fact-1",
        embedding: [1, 0, 0],
        metadata: { userId: "u-1", workspaceId: "workspace-a", memoryType: "fact" },
        content: "runtime rollout blocked",
      },
    ]);
    await repositories.vectorIndex?.upsertReferenceEmbedding([
      {
        id: "ref-1",
        embedding: [0, 1, 0],
        metadata: { userId: "u-1", workspaceId: "workspace-a", memoryType: "reference" },
        content: "Runbook\ndocs/runtime-runbook.md",
      },
    ]);
    await repositories.vectorIndex?.upsertEpisodeEmbedding([
      {
        id: "ep-1",
        embedding: [0, 0, 1],
        metadata: { userId: "u-1", workspaceId: "workspace-a", memoryType: "episode" },
        content: "Runtime migration continuity",
      },
    ]);

    await repositories.vectorIndex?.deleteFactEmbedding("fact-1");
    await repositories.vectorIndex?.deleteReferenceEmbedding("ref-1");
    await repositories.vectorIndex?.deleteEpisodeEmbedding("ep-1");

    expect(
      await repositories.vectorIndex?.searchFactEmbedding([1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(0);
    expect(
      await repositories.vectorIndex?.searchReferenceEmbedding([0, 1, 0], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(0);
    expect(
      await repositories.vectorIndex?.searchEpisodeEmbedding([0, 0, 1], {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(0);
  });

  it("persists archives and evidence through typed accessors", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });

    const archive = createSessionArchive({
      id: "archive-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
      summary: "The session closed with one unresolved rollout blocker.",
      unresolvedItems: ["confirm rollback owner"],
    });
    const evidence = createEvidenceRecord({
      id: "evidence-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
      kind: "conversation_excerpt",
      excerpt: "The user said the rollback owner is still pending.",
      source: { method: "explicit", extractedAt: "2026-04-10T00:00:00.000Z" },
      linkedArchiveIds: ["archive-1"],
    });

    await repositories.archives.add(archive);
    await repositories.evidence.add(evidence);

    expect(await repositories.archives.get("archive-1")).toEqual(archive);
    expect(await repositories.evidence.get("evidence-1")).toEqual(evidence);
    expect(await repositories.archives.listByUser("u-1")).toHaveLength(1);
    expect(
      await repositories.archives.listByScope({
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
    expect(
      await repositories.evidence.listByScope({
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("persists experience telemetry through typed accessors", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });

    const experience = createExperienceRecord({
      id: "xp-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
      kind: "maintenance",
      traceId: "trace-maint-1",
      summary: "Maintenance ran one low-risk dedupe job.",
      linkedMemoryIds: ["fact-1"],
    });

    await repositories.experiences.add(experience);

    expect(await repositories.experiences.get("xp-1")).toEqual(experience);
    expect(await repositories.experiences.listByUser("u-1")).toHaveLength(1);
    expect(
      await repositories.experiences.listByScope({
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("returns a null vector index when no vector store is configured", () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });

    expect(repositories.vectorIndex).toBeNull();
  });
});
