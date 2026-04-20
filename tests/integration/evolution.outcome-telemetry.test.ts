import { describe, expect, it } from "bun:test";
import { createInternalGoodMemory } from "../../src/api/createGoodMemory";
import {
  GOODMEMORY_EVAL_SUPPORT,
  type GoodMemoryEvalSupport,
} from "../../src/api/evalSupport";
import { EVIDENCE_COLLECTION } from "../../src/evidence/contracts";
import {
  createInMemoryDocumentStore,
} from "../../src/storage/memory";
import type { DocumentStore } from "../../src/storage/contracts";

function createEvidenceFailingDocumentStore(): DocumentStore {
  const store = createInMemoryDocumentStore();

  return {
    ...store,
    async set(collection, id, document) {
      if (collection === EVIDENCE_COLLECTION) {
        throw new Error("evidence repository unavailable");
      }

      await store.set(collection, id, document);
    },
  };
}

describe("outcome telemetry promotion chain", () => {
  it("promotes repeated tool outcome failures into a validated pattern without explicit feedback memory", async () => {
    const memory = createInternalGoodMemory(
      {
        storage: { provider: "memory" },
        testing: {
          now: () => new Date("2026-04-20T00:00:00.000Z"),
        },
      },
      {
        behavioralOutcomeRecorder: true,
      },
    );
    const support = (
      memory as typeof memory & {
        [GOODMEMORY_EVAL_SUPPORT]?: GoodMemoryEvalSupport;
      }
    )[GOODMEMORY_EVAL_SUPPORT];

    expect(support?.recordBehavioralOutcome).toBeDefined();

    await support!.recordBehavioralOutcome!({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      cue: "detailed analysis",
      evidenceExcerpt: "Error: Timeout Error. DeepAnalyzer failed due to computational complexity.",
      failureClass: "timeout",
      firstAction: {
        kind: "tool_call",
        name: "DeepAnalyzer",
        raw: "DeepAnalyzer --detailed",
      },
      saferAlternative: {
        kind: "tool_call",
        name: "QuickCheck",
        raw: "QuickCheck --network",
      },
    });
    await support!.recordBehavioralOutcome!({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      cue: "detailed analysis",
      evidenceExcerpt: "Error: Timeout Error. DeepAnalyzer cannot handle detailed analysis requests.",
      failureClass: "timeout",
      firstAction: {
        kind: "tool_call",
        name: "DeepAnalyzer",
        raw: "DeepAnalyzer --detailed",
      },
      saferAlternative: {
        kind: "tool_call",
        name: "QuickCheck",
        raw: "QuickCheck --network",
      },
    });

    const exported = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
    });
    const toolOutcomeExperiences = exported.durable.experiences.filter(
      (experience) => (experience.kind as string) === "tool_outcome",
    );
    const proposals = exported.durable.proposals.filter(
      (proposal) => proposal.proposalType === "procedural_pattern",
    );
    const acceptedPromotions = exported.durable.promotions.filter(
      (promotion) => promotion.decision === "accepted",
    );
    const validatedPatterns = exported.durable.feedback.filter(
      (feedback) =>
        feedback.kind === "validated_pattern" && feedback.lifecycle === "active",
    );

    expect(toolOutcomeExperiences).toHaveLength(2);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.status).toBe("accepted");
    expect(acceptedPromotions).toHaveLength(1);
    expect(validatedPatterns).toHaveLength(1);
    expect(validatedPatterns[0]?.rule).toContain("avoid DeepAnalyzer");
    expect(validatedPatterns[0]?.rule).toContain("QuickCheck");
    expect(validatedPatterns[0]?.source.method).toBe("confirmed");
  });

  it("does not persist dangling evidence lineage when evidence storage fails", async () => {
    const memory = createInternalGoodMemory(
      {
        storage: { provider: "memory" },
        adapters: {
          documentStore: createEvidenceFailingDocumentStore(),
        },
        testing: {
          now: () => new Date("2026-04-20T00:00:00.000Z"),
        },
      },
      {
        behavioralOutcomeRecorder: true,
      },
    );
    const support = (
      memory as typeof memory & {
        [GOODMEMORY_EVAL_SUPPORT]?: GoodMemoryEvalSupport;
      }
    )[GOODMEMORY_EVAL_SUPPORT];
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await support!.recordBehavioralOutcome!({
        scope: { userId: "u-1", workspaceId: "workspace-a" },
        cue: "detailed analysis",
        evidenceExcerpt: "DeepAnalyzer timed out during detailed analysis.",
        failureClass: "timeout",
        firstAction: {
          kind: "tool_call",
          name: "DeepAnalyzer",
          raw: "DeepAnalyzer --detailed",
        },
        saferAlternative: {
          kind: "tool_call",
          name: "QuickCheck",
          raw: "QuickCheck --network",
        },
      });
    } finally {
      console.error = originalConsoleError;
    }

    const exported = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
    });
    const toolOutcomeExperiences = exported.durable.experiences.filter(
      (experience) => (experience.kind as string) === "tool_outcome",
    );

    expect(exported.durable.evidence).toHaveLength(0);
    expect(toolOutcomeExperiences).toHaveLength(1);
    expect(toolOutcomeExperiences[0]?.linkedEvidenceIds).toEqual([]);
  });
});
