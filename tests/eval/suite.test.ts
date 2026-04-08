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

  it("persists partial artifacts incrementally before a later case fails", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-partial");
    let judgeCalls = 0;

    try {
      const runId = "run-partial";
      const outputDir = join(workspace.root, "reports");

      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir,
        runId,
        scenarioIds: ["scenario-complex-01", "scenario-complex-02"],
        caseRetryLimit: 3,
        baselineGenerator: async () => ({
          content: "I need more context before I can answer.",
        }),
        goodmemoryGenerator: async (input) => ({
          content: input.memoryContext ?? "missing memory context",
        }),
        judge: {
          async complete() {
            judgeCalls += 1;
            if (judgeCalls === 1) {
              return {
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
                  reasoning: "First case completed.",
                  failure_tags: [],
                }),
              };
            }

            throw new Error("simulated second-case judge failure");
          },
        },
      });

      const runDirectory = join(outputDir, runId);
      const report = JSON.parse(
        await readFile(join(runDirectory, "report.json"), "utf8"),
      ) as {
        summary: {
          totalCases: number;
          completedCases?: number;
          executionFailures?: number;
          winnerCounts: { goodmemory: number };
        };
      };
      const firstCase = JSON.parse(
        await readFile(
          join(runDirectory, "cases", "scenario-complex-01.json"),
          "utf8",
        ),
      ) as { caseId: string };
      const failuresSummary = JSON.parse(
        await readFile(join(runDirectory, "failures", "summary.json"), "utf8"),
      ) as { totalFailures: number };
      const executionFailure = JSON.parse(
        await readFile(
          join(runDirectory, "failures", "scenario-complex-02.execution.json"),
          "utf8",
        ),
      ) as { retryLimit: number; attempts: Array<{ attempt: number }> };

      expect(report.summary.totalCases).toBe(2);
      expect(report.summary.completedCases).toBe(1);
      expect(report.summary.executionFailures).toBe(1);
      expect(report.summary.winnerCounts.goodmemory).toBe(1);
      expect(firstCase.caseId).toBe("scenario-complex-01");
      expect(result.failedCases).toHaveLength(1);
      expect(result.failedCases?.[0]?.caseId).toBe("scenario-complex-02");
      expect(judgeCalls).toBe(4);
      expect(failuresSummary.totalFailures).toBe(1);
      expect(executionFailure.retryLimit).toBe(3);
      expect(executionFailure.attempts).toHaveLength(3);
    } finally {
      await workspace.cleanup();
    }
  });

  it("retries a case independently until a later attempt succeeds", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-retry-success");
    let judgeCalls = 0;

    try {
      const result = await runEvalSuite({
        mode: "live",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-complex-01"],
        caseRetryLimit: 3,
        baselineGenerator: async () => ({
          content: "baseline",
        }),
        goodmemoryGenerator: async (input) => ({
          content: input.memoryContext ?? "missing memory context",
        }),
        judge: {
          async complete() {
            judgeCalls += 1;
            if (judgeCalls < 3) {
              throw new Error(`transient judge failure ${judgeCalls}`);
            }

            return {
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
                reasoning: "Succeeded after retry.",
                failure_tags: [],
              }),
            };
          },
        },
      });

      expect(judgeCalls).toBe(3);
      expect(result.summary.totalCases).toBe(1);
      expect(result.failedCases).toHaveLength(0);
    } finally {
      await workspace.cleanup();
    }
  });

  it("runs live cases concurrently instead of serializing all baseline calls", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-concurrency");
    let releaseBaseline!: () => void;
    const baselineGate = new Promise<void>((resolve) => {
      releaseBaseline = resolve;
    });
    let activeBaselines = 0;
    let maxActiveBaselines = 0;

    try {
      const runPromise = runEvalSuite({
        mode: "live",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        maxConcurrency: 2,
        scenarioIds: ["scenario-complex-01", "scenario-complex-02"],
        baselineGenerator: async () => {
          activeBaselines += 1;
          maxActiveBaselines = Math.max(maxActiveBaselines, activeBaselines);
          await baselineGate;
          activeBaselines -= 1;
          return {
            content: "baseline",
          };
        },
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
              reasoning: "First case completed.",
              failure_tags: [],
            }),
          },
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
              reasoning: "Second case completed.",
              failure_tags: [],
            }),
          },
        ]),
      });

      const parallelObserved = await Promise.race([
        new Promise<boolean>((resolve) => {
          const interval = setInterval(() => {
            if (maxActiveBaselines >= 2) {
              clearInterval(interval);
              resolve(true);
            }
          }, 1);
          setTimeout(() => {
            clearInterval(interval);
            resolve(false);
          }, 100);
        }),
      ]);

      releaseBaseline();
      const result = await runPromise;

      expect(parallelObserved).toBe(true);
      expect(maxActiveBaselines).toBe(2);
      expect(result.summary.totalCases).toBe(2);
    } finally {
      await workspace.cleanup();
    }
  });
});
