import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createFakeLLMAdapter } from "../../src/testing/fakes";
import { createTempWorkspace } from "../../src/testing/utils";
import { runEvalSuite } from "../../src/eval/suite";

describe("eval personalization matrix", () => {
  it("covers one judged case per MemoryCD-inspired task family", async () => {
    const workspace = await createTempWorkspace("goodmemory-personalization-matrix");

    try {
      const scenarioIds = [
        "scenario-complex-01",
        "scenario-complex-02",
        "scenario-complex-03",
        "scenario-complex-04",
      ];
      const judge = createFakeLLMAdapter(
        scenarioIds.map(() => ({
          content: JSON.stringify({
            winner: "goodmemory",
            scores: {
              factual_recall: 9,
              preference_consistency: 9,
              cross_domain_transfer: 8,
              contamination_penalty: 9,
              update_correctness: 9,
              personalization_usefulness: 9,
              provenance_explainability: 8,
            },
            baseline_scores: {
              factual_recall: 3,
              preference_consistency: 2,
              cross_domain_transfer: 2,
              contamination_penalty: 5,
              update_correctness: 2,
              personalization_usefulness: 2,
              provenance_explainability: 4,
            },
            goodmemory_scores: {
              factual_recall: 9,
              preference_consistency: 9,
              cross_domain_transfer: 8,
              contamination_penalty: 9,
              update_correctness: 9,
              personalization_usefulness: 9,
              provenance_explainability: 8,
            },
            reasoning: "GoodMemory used the latest user state and personalization cues.",
            failure_tags: [],
          }),
        })),
      );
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds,
        baselineGenerator: async () => ({
          content: "I need more context before I can answer.",
        }),
        goodmemoryGenerator: async (input) => ({
          content: input.memoryContext ?? "missing-memory-context",
        }),
        judge,
      });

      expect(result.cases).toHaveLength(4);
      expect(
        new Set(result.cases.map((item) => item.metadata.taskFamily)).size,
      ).toBe(4);
      expect(result.cases.every((item) => item.assertions.passed)).toBe(true);
      expect(result.summary.winnerCounts.goodmemory).toBe(4);
      expect(result.summary.layers.uplift.personalization).toBeGreaterThan(0);
    } finally {
      await workspace.cleanup();
    }
  });
});
