import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src";
import { createFactMemory, type FactMemory } from "../../src/domain/records";

// The ttlExpiry maintenance job demotes facts whose validity window closed or TTL
// elapsed to "inactive", so recall (which only surfaces active facts) stops
// returning them. It is opt-in (not in the default maintenance job set) and a
// no-op for facts without validUntil/expiresAt.
describe("ttlExpiry maintenance job", () => {
  const scope = { userId: "u-1", workspaceId: "workspace-a" };

  function buildMemory() {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
        vectorStore: createInMemoryVectorStore(),
      },
      storage: { provider: "memory" },
    });
    const makeFact = (
      id: string,
      content: string,
      extra?: Partial<FactMemory>,
    ) =>
      createFactMemory({
        id,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "project",
        content,
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...extra,
      });
    return { documentStore, makeFact, memory };
  }

  it("demotes expired facts so recall no longer returns them", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    // A far-past expiresAt is expired under any plausible maintenance clock.
    await documentStore.set(
      "facts",
      "expired",
      makeFact("expired", "alpha topic old deadline", {
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "facts",
      "fresh",
      makeFact("fresh", "alpha topic current plan"),
    );

    const before = await memory.recall({
      scope,
      query: "alpha topic",
      strategy: "rules-only",
    });
    expect(before.facts.map((fact) => fact.id)).toContain("expired");

    await memory.runMaintenance({ scope, jobs: ["ttlExpiry"] });

    const after = await memory.recall({
      scope,
      query: "alpha topic",
      strategy: "rules-only",
    });
    const ids = after.facts.map((fact) => fact.id);
    expect(ids).not.toContain("expired");
    expect(ids).toContain("fresh");

    const persisted = (await documentStore.get("facts", "expired")) as
      | FactMemory
      | undefined;
    expect(persisted?.lifecycle).toBe("inactive");
    expect(persisted?.demotionReason).toBe("ttl_expired");
  });

  it("leaves facts without a TTL untouched", async () => {
    const { documentStore, makeFact, memory } = buildMemory();
    await documentStore.set(
      "facts",
      "no-ttl",
      makeFact("no-ttl", "alpha topic durable note"),
    );

    await memory.runMaintenance({ scope, jobs: ["ttlExpiry"] });

    const persisted = (await documentStore.get("facts", "no-ttl")) as
      | FactMemory
      | undefined;
    expect(persisted?.lifecycle).toBe("active");
    const after = await memory.recall({
      scope,
      query: "alpha topic",
      strategy: "rules-only",
    });
    expect(after.facts.map((fact) => fact.id)).toContain("no-ttl");
  });
});
