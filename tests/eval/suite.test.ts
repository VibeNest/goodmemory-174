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
        runtime: {
          generationMode: string;
          generationAdapter?: string;
          judgeMode: string;
          judgeAdapter?: string;
        };
      };

      expect(result.mode).toBe("fallback");
      expect(result.summary.totalCases).toBe(1);
      expect(result.summary.winnerCounts.goodmemory).toBe(1);
      expect(report.mode).toBe("fallback");
      expect(report.summary.totalCases).toBe(1);
      expect(report.runtime.generationMode).toBe("fallback");
      expect(report.runtime.judgeMode).toBe("fallback");
      expect(report.runtime.generationAdapter).toBe("fallback");
      expect(report.runtime.judgeAdapter).toBe("fallback");
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

  it("applies limit after scenario filtering instead of before it", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-limit-filter-order");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        limit: 1,
        scenarioIds: ["scenario-medium-01"],
        baselineGenerator: async () => ({
          content: "baseline",
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
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 5,
                cross_domain_transfer: 5,
                contamination_penalty: 5,
                update_correctness: 5,
                personalization_usefulness: 5,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 8,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              reasoning: "scenario-medium-01 case",
              failure_tags: [],
            }),
          },
        ]),
      });

      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]?.caseId).toBe("scenario-medium-01");
    } finally {
      await workspace.cleanup();
    }
  });

  it("runs the same scenario across requested strategies and persists strategy summaries", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-strategies");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-complex-01"],
        strategies: ["rules-only", "hybrid"],
        baselineGenerator: async () => ({
          content: "baseline",
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
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 5,
                cross_domain_transfer: 5,
                contamination_penalty: 5,
                update_correctness: 5,
                personalization_usefulness: 5,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 8,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              reasoning: "rules-only case",
              failure_tags: [],
            }),
          },
          {
            content: JSON.stringify({
              winner: "goodmemory",
              scores: {
                factual_recall: 9,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 5,
                cross_domain_transfer: 5,
                contamination_penalty: 5,
                update_correctness: 5,
                personalization_usefulness: 5,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 9,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              reasoning: "hybrid case",
              failure_tags: [],
            }),
          },
        ]),
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        summary: {
          strategySummary?: {
            byStrategy?: Record<string, { totalCases: number }>;
            embeddingImpact?: {
              consistentScenarioCoverage?: boolean;
              strategiesCompared?: string[];
            };
          };
        };
      };

      expect(result.summary.totalCases).toBe(2);
      expect(result.cases).toHaveLength(2);
      expect(result.cases.map((item) => item.metadata.strategyLabel)).toEqual([
        "rules-only",
        "hybrid",
      ]);
      expect(result.cases.map((item) => item.metadata.resolvedStrategyLabel)).toEqual([
        "rules-only",
        "rules-only",
      ]);
      expect(result.cases[0]?.caseId).toContain("__");
      expect(
        result.summary.strategySummary.byStrategy["rules-only"]?.totalCases,
      ).toBe(2);
      expect(result.summary.strategySummary.byStrategy["hybrid"]).toBeUndefined();
      expect(result.summary.strategySummary.embeddingImpact).toBeNull();
      expect(report.summary.strategySummary?.embeddingImpact).toBeNull();
    } finally {
      await workspace.cleanup();
    }
  });

  it("reuses the same baseline answer across strategy variants for one scenario", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-shared-baseline");
    let baselineCalls = 0;

    try {
      const result = await runEvalSuite({
        mode: "live",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-complex-01"],
        strategies: ["rules-only", "hybrid"],
        baselineGenerator: async () => ({
          content: `baseline-${++baselineCalls}`,
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
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 5,
                cross_domain_transfer: 5,
                contamination_penalty: 5,
                update_correctness: 5,
                personalization_usefulness: 5,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 8,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              reasoning: "rules-only case",
              failure_tags: [],
            }),
          },
          {
            content: JSON.stringify({
              winner: "goodmemory",
              scores: {
                factual_recall: 9,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 5,
                cross_domain_transfer: 5,
                contamination_penalty: 5,
                update_correctness: 5,
                personalization_usefulness: 5,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 9,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              reasoning: "hybrid case",
              failure_tags: [],
            }),
          },
        ]),
      });

      expect(baselineCalls).toBe(1);
      expect(result.cases.map((item) => item.baseline.answer)).toEqual([
        "baseline-1",
        "baseline-1",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });

  it("reuses a successful baseline across retries for the same case", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-retry-baseline");
    let baselineCalls = 0;
    let judgeCalls = 0;

    try {
      const result = await runEvalSuite({
        mode: "live",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-complex-01"],
        caseRetryLimit: 2,
        baselineGenerator: async () => ({
          content: `baseline-${++baselineCalls}`,
        }),
        goodmemoryGenerator: async (input) => ({
          content: input.memoryContext ?? "missing memory context",
        }),
        judge: {
          async complete() {
            judgeCalls += 1;
            if (judgeCalls === 1) {
              throw new Error("transient judge failure");
            }

            return {
              content: JSON.stringify({
                winner: "goodmemory",
                scores: {
                  factual_recall: 8,
                  preference_consistency: 8,
                  cross_domain_transfer: 8,
                  contamination_penalty: 8,
                  update_correctness: 8,
                  personalization_usefulness: 8,
                  provenance_explainability: 8,
                },
                baseline_scores: {
                  factual_recall: 5,
                  preference_consistency: 5,
                  cross_domain_transfer: 5,
                  contamination_penalty: 5,
                  update_correctness: 5,
                  personalization_usefulness: 5,
                  provenance_explainability: 5,
                },
                goodmemory_scores: {
                  factual_recall: 8,
                  preference_consistency: 8,
                  cross_domain_transfer: 8,
                  contamination_penalty: 8,
                  update_correctness: 8,
                  personalization_usefulness: 8,
                  provenance_explainability: 8,
                },
                reasoning: "retry case",
                failure_tags: [],
              }),
            };
          },
        },
      });

      expect(judgeCalls).toBe(2);
      expect(baselineCalls).toBe(1);
      expect(result.cases[0]?.baseline.answer).toBe("baseline-1");
    } finally {
      await workspace.cleanup();
    }
  });

  it("supports rerunning a single failed strategy case by case id", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-case-id");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        caseIds: ["scenario-complex-01__hybrid"],
        baselineGenerator: async () => ({
          content: "baseline",
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
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              baseline_scores: {
                factual_recall: 5,
                preference_consistency: 5,
                cross_domain_transfer: 5,
                contamination_penalty: 5,
                update_correctness: 5,
                personalization_usefulness: 5,
                provenance_explainability: 5,
              },
              goodmemory_scores: {
                factual_recall: 8,
                preference_consistency: 8,
                cross_domain_transfer: 8,
                contamination_penalty: 8,
                update_correctness: 8,
                personalization_usefulness: 8,
                provenance_explainability: 8,
              },
              reasoning: "hybrid retry",
              failure_tags: [],
            }),
          },
        ]),
      });

      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]?.caseId).toBe("scenario-complex-01__hybrid");
      expect(result.cases[0]?.metadata.strategyLabel).toBe("hybrid");
    } finally {
      await workspace.cleanup();
    }
  });
});
