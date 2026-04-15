import { describe, expect, it } from "bun:test";
import {
  PROMOTION_RECORDS_COLLECTION,
  createLearningProposal,
} from "../../src/evolution/contracts";
import { createProposalGateProcessor } from "../../src/evolution/gates";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import type { DocumentStore } from "../../src/storage/contracts";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";

function createFixture() {
  const repositories = createMemoryRepositories({
    documentStore: createInMemoryDocumentStore(),
    sessionStore: createInMemorySessionStore(),
  });
  const processor = createProposalGateProcessor({
    repositories,
    now: () => "2026-04-15T00:00:00.000Z",
    createId: (() => {
      let count = 0;
      return () => `promotion-${String(++count).padStart(4, "0")}`;
    })(),
    createTraceId: (() => {
      let count = 0;
      return () => `gate-trace-${String(++count).padStart(4, "0")}`;
    })(),
  });

  return {
    processor,
    repositories,
  };
}

function createPromotionFailingDocumentStore(): DocumentStore {
  const store = createInMemoryDocumentStore();

  return {
    ...store,
    async set(collection, id, document) {
      if (collection === PROMOTION_RECORDS_COLLECTION) {
        throw new Error("promotion repository unavailable");
      }

      await store.set(collection, id, document);
    },
  };
}

describe("proposal gate processor", () => {
  it("rejects blocked proposals and records an auditable promotion decision", async () => {
    const { processor, repositories } = createFixture();
    const proposal = createLearningProposal({
      id: "proposal-1",
      userId: "u-2",
      workspaceId: "workspace-a",
      proposalType: "memory_revision",
      traceId: "proposal-trace-1",
      summary: "Revise stale memory",
      rationale: "Mismatch scope should block this proposal.",
      sourceExperienceIds: ["xp-1"],
      linkedMemoryIds: ["fact-1"],
      linkedEvidenceIds: ["evidence-1"],
    });

    const decisions = await processor.process({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      proposals: [proposal],
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decision).toBe("rejected");
    expect(decisions[0]?.policyOutcome).toBe("blocked");

    const storedProposal = await repositories.proposals.get("proposal-1");
    const promotions = await repositories.promotions.listByUser("u-2");
    expect(storedProposal?.status).toBe("rejected");
    expect(promotions).toHaveLength(1);
    expect(promotions[0]?.decision).toBe("rejected");
    expect(promotions[0]?.proposalId).toBe("proposal-1");
  });

  it("accepts low-risk maintenance proposals and persists a promotion record", async () => {
    const { processor, repositories } = createFixture();
    const proposal = createLearningProposal({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      proposalType: "maintenance_action",
      traceId: "proposal-trace-1",
      summary: "Re-check stale blocker memory.",
      rationale: "One verification trace suggests a bounded maintenance follow-up.",
      sourceExperienceIds: ["xp-1"],
      linkedMemoryIds: ["fact-1"],
      linkedEvidenceIds: ["evidence-1"],
      modelInfluence: "rules-only",
    });

    const decisions = await processor.process({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      proposals: [proposal],
    });

    expect(decisions[0]?.decision).toBe("accepted");
    expect(decisions[0]?.verificationOutcome).toBe("passed");
    expect(decisions[0]?.evalOutcome).toBe("passed");
    expect((await repositories.proposals.get("proposal-1"))?.status).toBe("accepted");
    expect((await repositories.promotions.get("promotion-0001"))?.decision).toBe("accepted");
  });

  it("delays high-risk proposals while keeping them queryable for later review", async () => {
    const { processor, repositories } = createFixture();
    const proposal = createLearningProposal({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      proposalType: "procedural_pattern",
      traceId: "proposal-trace-1",
      summary: "Promote repeated guidance into a pattern.",
      rationale: "Repeated feedback suggests a reusable pattern.",
      sourceExperienceIds: ["xp-1", "xp-2"],
      linkedMemoryIds: ["feedback-1"],
      modelInfluence: "rules-only",
    });

    const decisions = await processor.process({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      proposals: [proposal],
    });

    expect(decisions[0]?.decision).toBe("delayed");
    expect(decisions[0]?.evalOutcome).toBe("review_required");
    expect((await repositories.proposals.get("proposal-1"))?.status).toBe("delayed");
    expect((await repositories.promotions.get("promotion-0001"))?.decision).toBe("delayed");
  });

  it("rolls back a finalized proposal when promotion persistence fails", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createPromotionFailingDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const processor = createProposalGateProcessor({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "promotion-0001",
      createTraceId: () => "gate-trace-0001",
    });
    const proposal = createLearningProposal({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      proposalType: "maintenance_action",
      traceId: "proposal-trace-1",
      summary: "Re-check stale blocker memory.",
      rationale: "One verification trace suggests a bounded maintenance follow-up.",
      sourceExperienceIds: ["xp-1"],
      linkedMemoryIds: ["fact-1"],
      linkedEvidenceIds: ["evidence-1"],
      modelInfluence: "rules-only",
    });

    await expect(
      processor.process({
        scope: { userId: "u-1", workspaceId: "workspace-a" },
        proposals: [proposal],
      }),
    ).rejects.toThrow("promotion repository unavailable");

    expect(await repositories.proposals.get("proposal-1")).toBeNull();
    expect(await repositories.promotions.listByUser("u-1")).toHaveLength(0);
  });

  it("restores the previous delayed proposal when a refreshed decision cannot persist", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createPromotionFailingDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const processor = createProposalGateProcessor({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "promotion-0001",
      createTraceId: () => "gate-trace-0001",
    });
    const existing = createLearningProposal({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      proposalType: "procedural_pattern",
      status: "delayed",
      traceId: "proposal-trace-1",
      summary: "Promote repeated guidance into a pattern.",
      rationale: "Rules-only reviewer saw 2 successful feedback traces.",
      sourceExperienceIds: ["xp-1", "xp-2"],
      linkedMemoryIds: ["feedback-1"],
      modelInfluence: "rules-only",
      createdAt: "2026-04-14T00:00:00.000Z",
      updatedAt: "2026-04-14T00:00:00.000Z",
    });

    await repositories.proposals.add(existing);

    await expect(
      processor.process({
        scope: { userId: "u-1", workspaceId: "workspace-a" },
        proposals: [
          {
            ...existing,
            rationale: "Rules-only reviewer saw 3 successful feedback traces.",
            sourceExperienceIds: ["xp-1", "xp-2", "xp-3"],
            updatedAt: "2026-04-15T00:00:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow("promotion repository unavailable");

    expect(await repositories.proposals.get("proposal-1")).toEqual(existing);
    expect(await repositories.promotions.listByUser("u-1")).toHaveLength(0);
  });
});
