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
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        limit: 1,
        baselineGenerator: async () => ({
          content: "I need more context before I can answer.",
        }),
        goodmemoryGenerator: async (input) => ({
          content: input.memoryContext?.includes("runbook-v2")
            ? "You are a robotics engineer and the updated runbook is v2."
            : "missing memory context",
        }),
        judge: createFakeLLMAdapter([
          {
            content: JSON.stringify({
              winner: "goodmemory",
              scores: {
                identity_understanding: 9,
                history_continuation: 9,
                factual_alignment: 8,
                relevance: 9,
              },
              baseline_scores: {
                identity_understanding: 4,
                history_continuation: 4,
                factual_alignment: 5,
                relevance: 5,
              },
              goodmemory_scores: {
                identity_understanding: 9,
                history_continuation: 9,
                factual_alignment: 8,
                relevance: 9,
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
        summary: { totalCases: number; winnerCounts: { goodmemory: number } };
        runtime: { generationMode: string; judgeMode: string };
      };

      expect(result.summary.totalCases).toBe(1);
      expect(result.summary.winnerCounts.goodmemory).toBe(1);
      expect(report.summary.totalCases).toBe(1);
      expect(report.runtime.generationMode).toBe("fallback");
      expect(report.runtime.judgeMode).toBe("fallback");
    } finally {
      await workspace.cleanup();
    }
  });
});
