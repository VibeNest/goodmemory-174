import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createFakeLLMAdapter } from "../../src/testing/fakes";
import { createTempWorkspace } from "../../src/testing/utils";
import {
  runEvalSuite,
} from "../../src/eval/suite";

describe("eval suite", () => {
  it("runs a judged A/B suite over fixture-backed cases and persists a report", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        limit: 1,
        baselineGenerator: async () => ({
          content: "I need more context before I can answer.",
        }),
        goodmemoryGenerator: async (input) => ({
          content: input.memoryContext ?? "missing memory context",
        }),
        judge: createFakeLLMAdapter([
          {
            content: JSON.stringify({
              winner: "goodmemory",
              scores: {
                factual_recall: 8,
                preference_consistency: 9,
                cross_domain_transfer: 8,
                contamination_penalty: 9,
                update_correctness: 9,
                personalization_usefulness: 9,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 4,
                cross_domain_transfer: 4,
                contamination_penalty: 5,
                update_correctness: 4,
                personalization_usefulness: 4,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 8,
                preference_consistency: 9,
                cross_domain_transfer: 8,
                contamination_penalty: 9,
                update_correctness: 9,
                personalization_usefulness: 9,
                provenance_explainability: 8,
              },
              reasoning: "GoodMemory used the corrected runbook and prior open loop.",
              failure_tags: [],
            }),
          },
        ]),
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        mode: string;
        summary: { totalCases: number; winnerCounts: { goodmemory: number } };
        runtime: { generationMode: string; judgeMode: string };
      };

      expect(result.mode).toBe("fallback");
      expect(result.summary.totalCases).toBe(1);
      expect(result.summary.winnerCounts.goodmemory).toBe(1);
      expect(report.mode).toBe("fallback");
      expect(report.summary.totalCases).toBe(1);
      expect(report.runtime.generationMode).toBe("fallback");
      expect(report.runtime.judgeMode).toBe("fallback");
      expect(result.cases[0]?.assertions.passed).toBe(true);
      expect(result.cases[0]?.metadata.taskFamily).toBeDefined();
    } finally {
      await workspace.cleanup();
    }
  });
});
