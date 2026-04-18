import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import {
  createFakeEmbeddingAdapter,
  createFakeLLMAdapter,
} from "../../src/testing/fakes";
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

  it("preserves the primary case failure when cleanup also fails", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-cleanup-errors");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-medium-01"],
        baselineGenerator: async () => ({
          content: "baseline",
        }),
        goodmemoryGenerator: async () => ({
          content: "not used",
        }),
        judge: createFakeLLMAdapter([]),
        createMemory: () => ({
          memory: {
            async remember() {
              return {
                accepted: 0,
                rejected: 0,
                events: [],
              };
            },
            async feedback() {
              return { accepted: false };
            },
            async recall() {
              throw new Error("primary-recall-error");
            },
            async buildContext() {
              throw new Error("not used");
            },
            async forget() {
              return { forgotten: false };
            },
            async exportMemory() {
              throw new Error("not used");
            },
            async deleteAllMemory() {
              return {
                scope: { userId: "u-1" },
                deleted: {
                  profiles: 0,
                  preferences: 0,
                  references: 0,
                  facts: 0,
                  feedback: 0,
                  episodes: 0,
                  archives: 0,
                  evidence: 0,
                  experiences: 0,
                  proposals: 0,
                  promotions: 0,
                  workingMemory: 0,
                  journal: 0,
                  artifactSpills: 0,
                },
              };
            },
          } as never,
          cleanup: async () => {
            throw new Error("cleanup-error");
          },
        }),
      });

      expect(result.cases).toHaveLength(0);
      expect(result.failedCases).toHaveLength(1);
      expect(result.failedCases?.[0]?.lastError).toContain("primary-recall-error");
      expect(result.failedCases?.[0]?.lastError).toContain("cleanup-error");
      expect(
        result.failedCases?.[0]?.lastError.indexOf("primary-recall-error"),
      ).toBeLessThan(
        result.failedCases?.[0]?.lastError.indexOf("cleanup-error") ?? Infinity,
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("reports undefined primary failures instead of swallowing the case", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-undefined-primary");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-medium-01"],
        baselineGenerator: async () => ({
          content: "baseline",
        }),
        goodmemoryGenerator: async () => ({
          content: "not used",
        }),
        judge: createFakeLLMAdapter([]),
        createMemory: () => ({
          memory: {
            async remember() {
              return {
                accepted: 0,
                rejected: 0,
                events: [],
              };
            },
            async feedback() {
              return { accepted: false };
            },
            async recall() {
              throw undefined;
            },
            async buildContext() {
              throw new Error("not used");
            },
            async forget() {
              return { forgotten: false };
            },
            async exportMemory() {
              throw new Error("not used");
            },
            async deleteAllMemory() {
              return {
                scope: { userId: "u-1" },
                deleted: {
                  profiles: 0,
                  preferences: 0,
                  references: 0,
                  facts: 0,
                  feedback: 0,
                  episodes: 0,
                  archives: 0,
                  evidence: 0,
                  experiences: 0,
                  proposals: 0,
                  promotions: 0,
                  workingMemory: 0,
                  journal: 0,
                  artifactSpills: 0,
                },
              };
            },
          } as never,
        }),
      });

      expect(result.summary.totalCases).toBe(1);
      expect(result.cases).toHaveLength(0);
      expect(result.failedCases).toHaveLength(1);
      expect(result.failedCases?.[0]?.caseId).toBe("scenario-medium-01");
      expect(result.failedCases?.[0]?.lastError).toBe("undefined");
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

  it("persists retrieval rollout metadata and keeps observe mode execution on the promoted strategy", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-observe-rollout");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        caseIds: ["scenario-complex-01__hybrid"],
        strategyRollout: {
          family: "retrieval",
          mode: "observe",
          promotedStrategy: "rules-only",
        },
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
              reasoning: "observe mode case",
              failure_tags: [],
            }),
          },
        ]),
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        summary?: {
          shadowSummary?: {
            totalCases?: number;
            safeObserveCases?: number;
            unknownObserveCases?: number;
          };
        };
      };
      const shadowArtifact = JSON.parse(
        await readFile(
          join(result.runDirectory, "shadow-executed-path-comparisons.json"),
          "utf8",
        ),
      ) as {
        comparisonTarget: string;
        totalCases: number;
        comparisons: Array<{
          requestedStrategyLabel: string;
          executedStrategyLabel: string;
          comparisonTarget: string;
          executedPathSource: string;
          candidateInfluencedExecution?: boolean;
        }>;
      };

      expect(result.runtime.strategyRollout).toEqual({
        family: "retrieval",
        mode: "observe",
        promotedStrategyLabel: "rules-only",
      });
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]?.metadata.strategyFamily).toBe("retrieval");
      expect(result.cases[0]?.metadata.strategyMode).toBe("observe");
      expect(result.cases[0]?.metadata.promotedStrategyLabel).toBe("rules-only");
      expect(result.cases[0]?.metadata.strategyLabel).toBe("hybrid");
      expect(result.cases[0]?.metadata.resolvedStrategyLabel).toBe("rules-only");
      expect(result.cases[0]?.goodmemory.candidateInfluencedExecution).toBe(false);
      expect(result.summary.shadowSummary).toEqual({
        totalCases: 1,
        byFamily: {
          retrieval: 1,
        },
        byMode: {
          observe: 1,
        },
        candidateInfluencedCases: 0,
        safeObserveCases: 1,
        unknownObserveCases: 0,
        regressionCases: [],
      });
      expect(report.summary?.shadowSummary).toMatchObject({
        totalCases: 1,
        safeObserveCases: 1,
        unknownObserveCases: 0,
      });
      expect(shadowArtifact.totalCases).toBe(1);
      expect(shadowArtifact.comparisonTarget).toBe("executed-path");
      expect(shadowArtifact.comparisons[0]).toMatchObject({
        requestedStrategyLabel: "hybrid",
        executedStrategyLabel: "rules-only",
        comparisonTarget: "executed-path",
        executedPathSource: "promoted_or_default",
        candidateInfluencedExecution: false,
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("uses runtime rollout metadata as the execution source of truth when no case-level rollout is provided", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-runtime-rollout");

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        scenarioIds: ["scenario-complex-01"],
        strategies: ["hybrid"],
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
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
              reasoning: "runtime observe mode case",
              failure_tags: [],
            }),
          },
        ]),
      });

      expect(result.runtime.strategyRollout).toEqual({
        family: "retrieval",
        mode: "observe",
        promotedStrategyLabel: "rules-only",
      });
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]?.metadata.strategyFamily).toBe("retrieval");
      expect(result.cases[0]?.metadata.strategyMode).toBe("observe");
      expect(result.cases[0]?.metadata.promotedStrategyLabel).toBe("rules-only");
      expect(result.cases[0]?.metadata.strategyLabel).toBe("hybrid");
      expect(result.cases[0]?.metadata.resolvedStrategyLabel).toBe("rules-only");
      expect(result.cases[0]?.goodmemory.candidateInfluencedExecution).toBe(false);
    } finally {
      await workspace.cleanup();
    }
  });

  it("runs an isolated shadow candidate replay in observe mode and persists separate shadow traces", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-shadow-replay");
    const createMemoryCalls: Array<{
      caseId: string;
      scopeNamespace: string;
    }> = [];

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        caseIds: ["scenario-complex-01__hybrid"],
        strategyRollout: {
          family: "retrieval",
          mode: "observe",
          promotedStrategy: "rules-only",
        },
        createMemory: ({ caseId, scopeNamespace }) => {
          createMemoryCalls.push({ caseId, scopeNamespace });

          return createGoodMemory({
            storage: { provider: "memory" },
            adapters: {
              embeddingAdapter: createFakeEmbeddingAdapter(),
            },
          });
        },
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
              reasoning: "shadow replay case",
              failure_tags: [],
            }),
          },
        ]),
      });

      const shadowArtifact = JSON.parse(
        await readFile(
          join(result.runDirectory, "shadow-executed-path-comparisons.json"),
          "utf8",
        ),
      ) as {
        comparisons: Array<{
          shadowResolvedStrategyLabel?: string;
          artifactPaths: {
            shadowTrace?: string;
            shadowRawRecall?: string;
          };
        }>;
      };
      const shadowTracePath = shadowArtifact.comparisons[0]?.artifactPaths.shadowTrace;
      const shadowRawRecallPath =
        shadowArtifact.comparisons[0]?.artifactPaths.shadowRawRecall;
      if (!shadowTracePath || !shadowRawRecallPath) {
        throw new Error("Missing persisted shadow artifact paths");
      }
      const shadowTrace = JSON.parse(
        await readFile(join(result.runDirectory, shadowTracePath), "utf8"),
      ) as {
        strategyMode?: string;
        candidateInfluencedExecution?: boolean;
        resolvedStrategyLabel?: string;
      };
      const shadowRecall = JSON.parse(
        await readFile(join(result.runDirectory, shadowRawRecallPath), "utf8"),
      ) as {
        routingDecision?: {
          strategy?: string;
        };
      };

      expect(createMemoryCalls).toHaveLength(2);
      expect(createMemoryCalls[0]?.caseId).toBe("scenario-complex-01__hybrid");
      expect(createMemoryCalls[1]?.caseId).toBe("scenario-complex-01__hybrid__shadow");
      expect(createMemoryCalls[1]?.scopeNamespace).toContain("__shadow");
      expect(createMemoryCalls[1]?.scopeNamespace).not.toBe(
        createMemoryCalls[0]?.scopeNamespace,
      );
      expect(result.cases[0]?.shadow?.strategyMode).toBe("assist");
      expect(result.cases[0]?.shadow?.candidateInfluencedExecution).toBe(true);
      expect(result.cases[0]?.shadow?.resolvedStrategyLabel).toBe("hybrid");
      expect(shadowTrace.strategyMode).toBe("assist");
      expect(shadowTrace.candidateInfluencedExecution).toBe(true);
      expect(shadowTrace.resolvedStrategyLabel).toBe("hybrid");
      expect(shadowRecall.routingDecision?.strategy).toBe("hybrid");
      expect(shadowArtifact.comparisons[0]?.shadowResolvedStrategyLabel).toBe("hybrid");
      expect(shadowTracePath).toBe(
        "traces/scenario-complex-01__hybrid__shadow/shadow.json",
      );
      expect(shadowRawRecallPath).toBe(
        "traces/scenario-complex-01__hybrid__shadow/shadow-raw-recall.json",
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("cleans up the primary handle when observe shadow setup fails", async () => {
    const workspace = await createTempWorkspace(
      "goodmemory-suite-shadow-setup-cleanup",
    );
    const createMemoryCalls: string[] = [];
    let primaryCleanupCalls = 0;

    try {
      const result = await runEvalSuite({
        mode: "fallback",
        personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
        scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
        outputDir: join(workspace.root, "reports"),
        caseIds: ["scenario-complex-01__hybrid"],
        strategyRollout: {
          family: "retrieval",
          mode: "observe",
          promotedStrategy: "rules-only",
        },
        baselineGenerator: async () => ({
          content: "baseline",
        }),
        goodmemoryGenerator: async () => ({
          content: "not used",
        }),
        judge: createFakeLLMAdapter([]),
        createMemory: ({ caseId }) => {
          createMemoryCalls.push(caseId);
          if (caseId.endsWith("__shadow")) {
            throw new Error("shadow-create-error");
          }

          return {
            memory: {
              async remember() {
                return {
                  accepted: 0,
                  rejected: 0,
                  events: [],
                };
              },
              async feedback() {
                return { accepted: false };
              },
              async recall() {
                throw new Error("should-not-run");
              },
              async buildContext() {
                throw new Error("should-not-run");
              },
              async forget() {
                return { forgotten: false };
              },
              async exportMemory() {
                throw new Error("should-not-run");
              },
              async deleteAllMemory() {
                return {
                  scope: { userId: "u-1" },
                  deleted: {
                    profiles: 0,
                    preferences: 0,
                    references: 0,
                    facts: 0,
                    feedback: 0,
                    episodes: 0,
                    archives: 0,
                    evidence: 0,
                    experiences: 0,
                    proposals: 0,
                    promotions: 0,
                    workingMemory: 0,
                    journal: 0,
                    artifactSpills: 0,
                  },
                };
              },
            } as never,
            cleanup: async () => {
              primaryCleanupCalls += 1;
            },
          };
        },
      });

      expect(createMemoryCalls).toEqual([
        "scenario-complex-01__hybrid",
        "scenario-complex-01__hybrid__shadow",
      ]);
      expect(primaryCleanupCalls).toBe(1);
      expect(result.cases).toHaveLength(0);
      expect(result.failedCases).toHaveLength(1);
      expect(result.failedCases?.[0]?.lastError).toContain("shadow-create-error");
    } finally {
      await workspace.cleanup();
    }
  });

  it("rejects non-retrieval runtime rollout metadata that cannot affect suite execution", async () => {
    const workspace = await createTempWorkspace("goodmemory-suite-unsupported-runtime-rollout");

    try {
      await expect(
        runEvalSuite({
          mode: "fallback",
          personaDir: join(import.meta.dir, "../../fixtures/personas/eval"),
          scenarioDir: join(import.meta.dir, "../../fixtures/scenarios/eval"),
          outputDir: join(workspace.root, "reports"),
          scenarioIds: ["scenario-complex-01"],
          runtime: {
            generationMode: "fallback",
            judgeMode: "fallback",
            strategyRollout: {
              family: "reviewer",
              mode: "observe",
            },
          },
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
                reasoning: "not used",
                failure_tags: [],
              }),
            },
          ]),
        }),
      ).rejects.toThrow(
        "runEvalSuite currently supports only retrieval strategy rollouts; received reviewer.",
      );
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
