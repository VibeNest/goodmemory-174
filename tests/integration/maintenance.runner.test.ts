import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
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

function createFixture() {
  const documentStore = createInMemoryDocumentStore();
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore: createInMemorySessionStore(),
  });
  const runner = createMaintenanceRunner({
    repositories,
    now: () => "2026-04-02T00:00:00.000Z",
  });

  return {
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
    ]);
  });
});
