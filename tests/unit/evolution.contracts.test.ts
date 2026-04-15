import { describe, expect, it } from "bun:test";
import {
  createExperienceRecord,
  createLearningProposal,
  createPromotionRecord,
  createSessionArchive,
} from "../../src/evolution/contracts";

describe("evolution contracts", () => {
  it("creates session archive records with continuity defaults", () => {
    const archive = createSessionArchive({
      id: "archive-1",
      userId: "u-1",
      sessionId: "s-1",
      summary: "The session closed after narrowing the rollback window and next verification step.",
    });

    expect(archive.sourceSessionIds).toEqual(["s-1"]);
    expect(archive.keyDecisions).toEqual([]);
    expect(archive.unresolvedItems).toEqual([]);
    expect(archive.referencedArtifacts).toEqual([]);
  });

  it("keeps optional normalized transcript, lineage, and scoped metadata", () => {
    const archive = createSessionArchive({
      id: "archive-2",
      userId: "u-1",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agentId: "agent-a",
      sessionId: "s-2",
      summary: "The session ended with a handoff to the runtime migration checklist.",
      normalizedTranscript: "user: check the runtime checklist\nassistant: next step is signoff",
      keyDecisions: ["Use the runtime checklist as the handoff source of truth."],
      unresolvedItems: ["confirm signoff owner"],
      referencedArtifacts: ["session-memory/s-2.md"],
      scopeLineage: ["tenant-a", "workspace-a"],
      locale: "en-US",
      createdAt: "2026-04-10T02:00:00.000Z",
      archivedAt: "2026-04-10T02:05:00.000Z",
    });

    expect(archive.normalizedTranscript).toContain("runtime checklist");
    expect(archive.scopeLineage).toEqual(["tenant-a", "workspace-a"]);
    expect(archive.locale).toBe("en-US");
    expect(archive.archivedAt).toBe("2026-04-10T02:05:00.000Z");
  });

  it("creates experience records with append-only telemetry defaults", () => {
    const experience = createExperienceRecord({
      id: "xp-1",
      userId: "u-1",
      sessionId: "s-1",
      kind: "recall",
      traceId: "trace-1",
      summary: "Recall finished with one policy marker and two durable hits.",
    });

    expect(experience.kind).toBe("recall");
    expect(experience.outcome).toBe("success");
    expect(experience.sourceTraceIds).toEqual(["trace-1"]);
    expect(experience.trigger).toBe("api");
    expect(experience.modelInfluence).toBe("none");
    expect(experience.policyApplied).toEqual([]);
    expect(experience.metrics).toEqual({});
    expect(experience.linkedMemoryIds).toEqual([]);
    expect(experience.linkedEvidenceIds).toEqual([]);
    expect(experience.linkedProposalIds).toEqual([]);
  });

  it("creates learning proposals with governed defaults", () => {
    const proposal = createLearningProposal({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
      proposalType: "memory_revision",
      traceId: "trace-review-1",
      summary: "Revise a stale rollout memory after repeated correction.",
      rationale: "Two later traces contradicted the previous durable fact.",
      sourceExperienceIds: ["xp-1"],
      linkedMemoryIds: ["fact-1"],
      linkedEvidenceIds: ["evidence-1"],
    });

    expect(proposal.status).toBe("pending");
    expect(proposal.modelInfluence).toBe("none");
    expect(proposal.sourceExperienceIds).toEqual(["xp-1"]);
    expect(proposal.linkedArchiveIds).toEqual([]);
    expect(proposal.updatedAt).toBe(proposal.createdAt);
  });

  it("creates promotion records with gate defaults", () => {
    const promotion = createPromotionRecord({
      id: "promotion-1",
      proposalId: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
      traceId: "trace-gate-1",
      decision: "delayed",
      summary: "Delay promotion until verification is complete.",
      rationale: "The proposal affects a production workflow and needs re-checking.",
      sourceExperienceIds: ["xp-1"],
      linkedEvidenceIds: ["evidence-1"],
    });

    expect(promotion.policyOutcome).toBe("not_run");
    expect(promotion.verificationOutcome).toBe("not_run");
    expect(promotion.evalOutcome).toBe("not_run");
    expect(promotion.linkedMemoryIds).toEqual([]);
    expect(promotion.decidedAt).toBe(promotion.createdAt);
  });
});
