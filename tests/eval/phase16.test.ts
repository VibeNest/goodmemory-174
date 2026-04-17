import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  loadPersonaSpec,
  loadScenarioFixture,
} from "../../src/eval/dataset";
import {
  createPhase16FallbackCreateMemory,
} from "../../src/eval/phase16";
import {
  buildEvalUserId,
  buildEvalWorkspaceId,
  runGoodMemoryScenario,
} from "../../src/eval/runners";

describe("phase 16 eval", () => {
  it("produces governed procedural promotions through real replay lineage", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/complex-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-complex-01.json"),
    );
    const createMemory = createPhase16FallbackCreateMemory();
    const memoryHandle = createMemory({
      caseId: scenario.scenario_id,
      persona,
      scenario,
      scopeNamespace: "phase16-real-lineage-eval",
    });
    const memory = "memory" in memoryHandle ? memoryHandle.memory : memoryHandle;

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
      scopeNamespace: "phase16-real-lineage-eval",
    });
    const exported = await memory.exportMemory({
      scope: {
        userId: buildEvalUserId(persona, "phase16-real-lineage-eval"),
        workspaceId: buildEvalWorkspaceId(persona, "phase16-real-lineage-eval"),
      },
    });
    const experienceIds = new Set(
      exported.durable.experiences.map((experience) => experience.id),
    );
    const proceduralProposals = exported.durable.proposals.filter(
      (proposal) => proposal.proposalType === "procedural_pattern",
    );
    const acceptedPromotions = exported.durable.promotions.filter(
      (promotion) => promotion.decision === "accepted",
    );

    expect(result.trace.proposalLifecycle?.proposalStatusCounts.accepted).toBeGreaterThanOrEqual(1);
    expect(result.trace.proposalLifecycle?.promotionDecisionCounts.accepted).toBeGreaterThanOrEqual(
      1,
    );
    expect(result.trace.maintenanceSummary?.compiledValidatedPatternCount).toBeGreaterThan(0);
    expect(result.trace.maintenanceSummary?.acceptedProceduralPromotionCount).toBeGreaterThan(0);
    expect(
      result.retrieved?.feedback.some(
        (record) =>
          record.kind === "validated_pattern" &&
          record.source.method === "confirmed",
      ),
    ).toBe(true);
    expect(proceduralProposals).toHaveLength(1);
    expect(proceduralProposals[0]?.sourceExperienceIds).toHaveLength(2);
    expect(
      proceduralProposals.every((proposal) =>
        proposal.sourceExperienceIds.every((experienceId) => experienceIds.has(experienceId)),
      ),
    ).toBe(true);
    expect(
      acceptedPromotions.every((promotion) =>
        promotion.sourceExperienceIds.every((experienceId) => experienceIds.has(experienceId)),
      ),
    ).toBe(true);
  });
});
