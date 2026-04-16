import { describe, expect, it } from "bun:test";
import {
  createEpisodeMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import {
  createMaintenanceRunner,
} from "../../src/maintenance/runner";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";
import { createFakeEmbeddingAdapter } from "../../src/testing/fakes";

function createFixture(input?: { withEmbeddings?: boolean }) {
  const documentStore = createInMemoryDocumentStore();
  const embeddingAdapter = input?.withEmbeddings
    ? createFakeEmbeddingAdapter()
    : undefined;
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore: createInMemorySessionStore(),
    vectorStore: input?.withEmbeddings ? createInMemoryVectorStore() : undefined,
  });
  const runner = createMaintenanceRunner({
    embedding: embeddingAdapter,
    repositories,
    vectorIndex: repositories.vectorIndex,
    now: () => "2026-04-02T00:00:00.000Z",
  });

  return {
    embeddingAdapter,
    repositories,
    runner,
  };
}

describe("maintenance runner", () => {
  it("consolidates duplicate active facts safely and idempotently", async () => {
    const { repositories, runner } = createFixture();
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-02-01T00:00:00.000Z" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    const firstRun = await runner.run(scope, ["dedupe"]);
    expect(firstRun.jobs[0]?.applied).toBe(1);

    const facts = await repositories.facts.listByScope(scope);
    expect(facts.filter((fact) => fact.lifecycle === "active")).toHaveLength(1);
    expect(facts.filter((fact) => fact.lifecycle === "superseded")).toHaveLength(1);

    const secondRun = await runner.run(scope, ["dedupe"]);
    expect(secondRun.jobs[0]?.applied).toBe(0);
  });

  it("repairs safe contradictions by inactivating weaker inferred facts", async () => {
    const { repositories, runner } = createFixture();
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "inferred", extractedAt: "2026-02-01T00:00:00.000Z" },
        confidence: 0.6,
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is stable after prod migration.",
        source: { method: "explicit", extractedAt: "2026-03-20T00:00:00.000Z" },
        confidence: 0.95,
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      }),
    );

    const report = await runner.run(scope, ["contradiction"]);
    expect(report.jobs[0]?.applied).toBe(1);

    const facts = await repositories.facts.listByScope(scope);
    const repaired = facts.find((fact) => fact.id === "fact-1");
    expect(repaired?.lifecycle).toBe("inactive");
    expect(repaired?.isActive).toBe(false);
  });

  it("prefers newer or verification-safer facts during contradiction repair and records the demotion reason", async () => {
    const { repositories, runner } = createFixture();
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-older",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        verificationPressureCount: 3,
        lastVerificationHintAt: "2026-03-15T00:00:00.000Z",
        source: { method: "explicit", extractedAt: "2026-03-01T00:00:00.000Z" },
        confidence: 0.95,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-newer",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is stable after prod migration.",
        source: { method: "explicit", extractedAt: "2026-03-20T00:00:00.000Z" },
        confidence: 0.95,
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      }),
    );

    const report = await runner.run(scope, ["contradiction"]);
    expect(report.jobs[0]?.applied).toBe(1);

    const facts = await repositories.facts.listByScope(scope);
    const older = facts.find((fact) => fact.id === "fact-older");
    const newer = facts.find((fact) => fact.id === "fact-newer");

    expect(older?.lifecycle).toBe("inactive");
    expect(older?.isActive).toBe(false);
    expect(older?.demotionReason).toBe("contradicted_by_stronger_fact");
    expect(older?.demotedAt).toBe("2026-04-02T00:00:00.000Z");
    expect(newer?.lifecycle).toBe("active");
    expect(newer?.isActive).toBe(true);
  });

  it("can run selected jobs or all jobs through one entry point", async () => {
    const { repositories, runner } = createFixture();
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-02-01T00:00:00.000Z" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    const selected = await runner.run(scope, ["dedupe"]);
    expect(selected.jobs).toHaveLength(1);
    expect(selected.jobs[0]?.name).toBe("dedupe");

    const all = await runner.run(scope);
    expect(all.jobs.map((job) => job.name)).toEqual([
      "dedupe",
      "contradiction",
      "consolidation",
      "embeddingRepair",
    ]);
  });

  it("persists append-only maintenance telemetry after each run", async () => {
    const { repositories, runner } = createFixture();
    const scope = { userId: "u-telemetry", workspaceId: "workspace-a" };

    const report = await runner.run(scope, ["dedupe"]);
    const experiences = await repositories.experiences.listByScope(scope);

    expect(report.jobs[0]?.name).toBe("dedupe");
    expect(report.jobs[0]?.applied).toBe(0);
    expect(experiences).toHaveLength(1);
    expect(experiences[0]?.kind).toBe("maintenance");
    expect(experiences[0]?.trigger).toBe("maintenance");
    expect(experiences[0]?.outcome).toBe("skipped");
    expect(experiences[0]?.summary).toContain("dedupe=0");
  });

  it("does not fail the run when telemetry persistence fails after maintenance mutations", async () => {
    const scope = { userId: "u-telemetry-failure", workspaceId: "workspace-a" };
    const { repositories: baseRepositories } = createFixture();
    const repositories = {
      ...baseRepositories,
      experiences: {
        ...baseRepositories.experiences,
        async add() {
          throw new Error("telemetry unavailable");
        },
      },
    };
    const runner = createMaintenanceRunner({
      repositories,
      now: () => "2026-04-02T00:00:00.000Z",
    });

    await baseRepositories.facts.add(
      createFactMemory({
        id: "fact-telemetry-1",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "project",
        content: "Rollout is blocked on prod verification.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await baseRepositories.facts.add(
      createFactMemory({
        id: "fact-telemetry-2",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "project",
        content: "Rollout is blocked on prod verification.",
        source: { method: "explicit", extractedAt: "2026-02-01T00:00:00.000Z" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const report = await runner.run(scope, ["dedupe"]);
      const facts = await baseRepositories.facts.listByScope(scope);
      const experiences = await baseRepositories.experiences.listByScope(scope);

      expect(report.jobs[0]?.applied).toBe(1);
      expect(facts.filter((fact) => fact.lifecycle === "active")).toHaveLength(1);
      expect(facts.filter((fact) => fact.lifecycle === "superseded")).toHaveLength(1);
      expect(experiences).toHaveLength(0);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("dedupes and repairs Chinese facts", async () => {
    const { repositories, runner } = createFixture();
    const scope = { userId: "u-zh", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-zh-1",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        content: "迁移流程目前仍然被审批阻塞。",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-zh-2",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        content: "迁移流程目前仍然被审批阻塞。",
        source: { method: "explicit", extractedAt: "2026-01-02T00:00:00.000Z" },
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    );
    await repositories.facts.add(
      createFactMemory({
        id: "fact-zh-3",
        userId: "u-zh",
        workspaceId: "workspace-a",
        category: "project",
        content: "迁移流程已经稳定。",
        source: { method: "explicit", extractedAt: "2026-01-03T00:00:00.000Z" },
        confidence: 0.95,
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    );

    const dedupe = await runner.run(scope, ["dedupe"]);
    expect(dedupe.jobs[0]?.applied).toBe(1);

    const contradiction = await runner.run(scope, ["contradiction"]);
    expect(contradiction.jobs[0]?.applied).toBe(1);
  });

  it("repairs missing fact, reference, and episode embeddings through maintenance hooks", async () => {
    const { embeddingAdapter, repositories, runner } = createFixture({
      withEmbeddings: true,
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Runtime rollout is blocked on vendor approval.",
        source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
      }),
    );
    await repositories.references.add(
      createReferenceMemory({
        id: "ref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Runtime runbook",
        pointer: "docs/runtime-runbook.md",
        source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        summary: "Conversation covered runtime rollout continuity.",
        keyDecisions: ["Use the runtime runbook."],
        unresolvedItems: ["Confirm vendor approval."],
        topics: ["runtime rollout"],
      }),
    );

    const report = await runner.run(scope, ["embeddingRepair"]);
    expect(report.jobs[0]?.applied).toBe(3);

    const [factEmbedding] = await embeddingAdapter!.embed([
      "Runtime rollout is blocked on vendor approval.",
    ]);
    const [referenceEmbedding] = await embeddingAdapter!.embed([
      "Runtime runbook\ndocs/runtime-runbook.md",
    ]);
    const [episodeEmbedding] = await embeddingAdapter!.embed([
      [
        "Conversation covered runtime rollout continuity.",
        "Use the runtime runbook.",
        "Confirm vendor approval.",
        "runtime rollout",
      ].join("\n"),
    ]);

    expect(
      await repositories.vectorIndex?.searchFactEmbedding(factEmbedding, {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);
    expect(
      await repositories.vectorIndex?.searchReferenceEmbedding(referenceEmbedding, {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);
    expect(
      await repositories.vectorIndex?.searchEpisodeEmbedding(episodeEmbedding, {
        topK: 1,
        filter: { userId: "u-1", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);
  });

  it("builds a vector for the consolidated episode when running consolidation as a selected job", async () => {
    const { embeddingAdapter, repositories, runner } = createFixture({
      withEmbeddings: true,
    });
    const scope = { userId: "u-consolidate", workspaceId: "workspace-a" };

    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-left",
        userId: "u-consolidate",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        summary: "Left episode summary.",
        keyDecisions: ["Use the release checklist."],
        unresolvedItems: ["Confirm signoff."],
        topics: ["release rollout"],
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-right",
        userId: "u-consolidate",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        summary: "Right episode summary.",
        keyDecisions: ["Use the release checklist."],
        unresolvedItems: ["Confirm signoff."],
        topics: ["release rollout"],
      }),
    );

    const report = await runner.run(scope, ["consolidation"]);
    expect(report.jobs[0]?.applied).toBe(1);

    const episodes = await repositories.episodes.listByScope(scope);
    const consolidated = episodes.find((episode) => episode.summary.startsWith("Consolidated:"));
    expect(consolidated).toBeTruthy();

    const [embedding] = await embeddingAdapter!.embed([
      [
        consolidated?.summary ?? "",
        consolidated?.keyDecisions.join("\n") ?? "",
        consolidated?.unresolvedItems.join("\n") ?? "",
        consolidated?.topics.join("\n") ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    ]);

    expect(
      await repositories.vectorIndex?.searchEpisodeEmbedding(embedding, {
        topK: 5,
        filter: { userId: "u-consolidate", workspaceId: "workspace-a" },
      }),
    ).toContainEqual(expect.objectContaining({ id: consolidated?.id }));
  });

  it("uses repositories.vectorIndex by default so legacy maintenance wiring still cleans stale vectors", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
      vectorStore,
    });
    const embeddingAdapter = createFakeEmbeddingAdapter();
    const runner = createMaintenanceRunner({
      repositories,
      embedding: embeddingAdapter,
      now: () => "2026-04-02T00:00:00.000Z",
    });
    const scope = { userId: "u-legacy", workspaceId: "workspace-a" };
    const factOne = createFactMemory({
      id: "fact-legacy-1",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      category: "project",
      content: "Runtime rollout is blocked on vendor approval.",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const factTwo = createFactMemory({
      id: "fact-legacy-2",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      category: "project",
      content: "Runtime rollout is blocked on vendor approval.",
      source: { method: "explicit", extractedAt: "2026-02-01T00:00:00.000Z" },
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    await repositories.facts.add(factOne);
    await repositories.facts.add(factTwo);

    const [embedding] = await embeddingAdapter.embed([factOne.content]);
    await repositories.vectorIndex?.upsertFactEmbedding([
      {
        id: factOne.id,
        embedding,
        metadata: { userId: scope.userId, workspaceId: scope.workspaceId, memoryType: "fact" },
        content: factOne.content,
      },
      {
        id: factTwo.id,
        embedding,
        metadata: { userId: scope.userId, workspaceId: scope.workspaceId, memoryType: "fact" },
        content: factTwo.content,
      },
    ]);

    const report = await runner.run(scope, ["dedupe"]);

    expect(report.jobs[0]?.applied).toBe(1);
    expect(await repositories.vectorIndex?.getFactEmbedding(factOne.id)).toBeNull();
    expect(await repositories.vectorIndex?.getFactEmbedding(factTwo.id)).not.toBeNull();
  });

  it("removes stale vectors for superseded, inactive, and archived memory during embedding repair", async () => {
    const { embeddingAdapter, repositories, runner } = createFixture({
      withEmbeddings: true,
    });
    const scope = { userId: "u-stale", workspaceId: "workspace-a" };

    const staleFact = createFactMemory({
      id: "fact-stale",
      userId: "u-stale",
      workspaceId: "workspace-a",
      category: "project",
      content: "Runtime rollout is blocked on vendor approval.",
      lifecycle: "superseded",
      isActive: false,
      source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
    });
    const staleReference = createReferenceMemory({
      id: "ref-stale",
      userId: "u-stale",
      workspaceId: "workspace-a",
      title: "Old runtime runbook",
      pointer: "docs/runtime-runbook-v1.md",
      lifecycle: "inactive",
      source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
    });
    const staleEpisode = createEpisodeMemory({
      id: "ep-stale",
      userId: "u-stale",
      workspaceId: "workspace-a",
      summary: "Old runtime continuity thread.",
      topics: ["runtime rollout"],
      archivedAt: "2026-04-01T00:00:00.000Z",
    });
    const activeFact = createFactMemory({
      id: "fact-active",
      userId: "u-stale",
      workspaceId: "workspace-a",
      category: "project",
      content: "Current blocker is security review.",
      source: { method: "explicit", extractedAt: "2026-04-02T00:00:00.000Z" },
    });

    await repositories.facts.add(staleFact);
    await repositories.references.add(staleReference);
    await repositories.episodes.add(staleEpisode);
    await repositories.facts.add(activeFact);

    const [staleFactEmbedding] = await embeddingAdapter!.embed([staleFact.content]);
    const [staleReferenceEmbedding] = await embeddingAdapter!.embed([
      `${staleReference.title}\n${staleReference.pointer}`,
    ]);
    const [staleEpisodeEmbedding] = await embeddingAdapter!.embed([
      [staleEpisode.summary, staleEpisode.topics.join("\n")].filter(Boolean).join("\n"),
    ]);

    await repositories.vectorIndex?.upsertFactEmbedding([
      {
        id: staleFact.id,
        embedding: staleFactEmbedding,
        metadata: { userId: "u-stale", workspaceId: "workspace-a", memoryType: "fact" },
        content: staleFact.content,
      },
    ]);
    await repositories.vectorIndex?.upsertReferenceEmbedding([
      {
        id: staleReference.id,
        embedding: staleReferenceEmbedding,
        metadata: { userId: "u-stale", workspaceId: "workspace-a", memoryType: "reference" },
        content: `${staleReference.title}\n${staleReference.pointer}`,
      },
    ]);
    await repositories.vectorIndex?.upsertEpisodeEmbedding([
      {
        id: staleEpisode.id,
        embedding: staleEpisodeEmbedding,
        metadata: { userId: "u-stale", workspaceId: "workspace-a", memoryType: "episode" },
        content: [staleEpisode.summary, staleEpisode.topics.join("\n")].filter(Boolean).join(
          "\n",
        ),
      },
    ]);

    await runner.run(scope, ["embeddingRepair"]);

    expect(
      await repositories.vectorIndex?.searchFactEmbedding(staleFactEmbedding, {
        topK: 5,
        filter: { userId: "u-stale", workspaceId: "workspace-a" },
      }),
    ).not.toContainEqual(expect.objectContaining({ id: staleFact.id }));
    expect(
      await repositories.vectorIndex?.searchReferenceEmbedding(staleReferenceEmbedding, {
        topK: 5,
        filter: { userId: "u-stale", workspaceId: "workspace-a" },
      }),
    ).not.toContainEqual(expect.objectContaining({ id: staleReference.id }));
    expect(
      await repositories.vectorIndex?.searchEpisodeEmbedding(staleEpisodeEmbedding, {
        topK: 5,
        filter: { userId: "u-stale", workspaceId: "workspace-a" },
      }),
    ).not.toContainEqual(expect.objectContaining({ id: staleEpisode.id }));
  });
});
