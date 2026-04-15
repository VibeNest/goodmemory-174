import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import { createFactMemory } from "../../src/domain/records";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("reflective reviewer integration", () => {
  it("emits one procedural pattern proposal after repeated feedback and does not duplicate it", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" } as const;

    await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });
    await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });
    await memory.feedback({
      scope,
      signal: "Use bullet points in summaries.",
    });

    const exported = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
    });

    expect(exported.durable.proposals).toHaveLength(1);
    expect(exported.durable.proposals[0]?.proposalType).toBe("procedural_pattern");
    expect(exported.durable.proposals[0]?.linkedMemoryIds).toHaveLength(1);
    expect(exported.durable.proposals[0]?.sourceExperienceIds).toHaveLength(3);
    expect(exported.durable.promotions).toHaveLength(2);
    expect(
      exported.durable.promotions.every(
        (promotion) => promotion.proposalId === exported.durable.proposals[0]?.id,
      ),
    ).toBe(true);
  });

  it("emits a maintenance proposal after a stale verification signal is observed and the turn completes", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore,
      },
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" } as const;

    await documentStore.set(
      "facts",
      "fact-stale-1",
      createFactMemory({
        id: "fact-stale-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The rollout blocker is vendor approval.",
        source: { method: "explicit", extractedAt: "2026-02-01T00:00:00.000Z" },
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    await memory.recall({
      scope,
      query: "Use the remembered blocker to continue the rollout.",
      retrievalProfile: "coding_agent",
    });

    const exported = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
    });

    expect(exported.durable.experiences.map((experience) => experience.kind).sort()).toEqual([
      "recall",
      "verify",
    ]);
    expect(
      exported.durable.proposals.some(
        (proposal) =>
          proposal.proposalType === "maintenance_action" &&
          proposal.linkedMemoryIds.includes("fact-stale-1"),
      ),
    ).toBe(true);
  });
});
