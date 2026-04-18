import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { EvalSuiteSummary } from "../../src/eval/contracts";
import {
  resolvePhase17FallbackOutputDir,
  resolvePhase17FallbackScenarioIds,
  runPhase17FallbackEval,
} from "../../scripts/run-phase-17-eval";
import {
  resolvePhase17LiveMemoryOutputDir,
  runPhase17LiveMemoryGate,
} from "../../scripts/run-phase-17-live-memory";

function buildJudgeScores() {
  return {
    factual_recall: 0,
    preference_consistency: 0,
    cross_domain_transfer: 0,
    contamination_penalty: 0,
    update_correctness: 0,
    personalization_usefulness: 0,
    provenance_explainability: 0,
  };
}

function buildSummary(
  overrides: Partial<EvalSuiteSummary> = {},
): EvalSuiteSummary {
  return {
    totalCases: 1,
    completedCases: 1,
    executionFailures: 0,
    winnerCounts: {
      baseline: 0,
      goodmemory: 1,
      tie: 0,
    },
    baselineAverage: buildJudgeScores(),
    goodmemoryAverage: buildJudgeScores(),
    uplift: {
      factual_recall: 1,
      preference_consistency: 1,
      cross_domain_transfer: 1,
      contamination_penalty: 0,
      update_correctness: 1,
      personalization_usefulness: 1,
      provenance_explainability: 1,
    },
    layers: {
      baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
      goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
      uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
    },
    assertions: {
      totalCases: 1,
      passingCases: 1,
      passRate: 1,
      totalChecks: 1,
      passingChecks: 1,
      checkPassRate: 1,
      applicableStaleSuppressionCases: 0,
      applicableUpdateCases: 0,
      contaminationFailures: 0,
      staleMisuseCases: 0,
      staleMisuseRate: 0,
      staleSuppressionCases: 0,
      staleSuppressionRate: 0,
      updateWinCases: 0,
      updateWinRate: 0,
      updateFailures: 0,
    },
    strategySummary: {
      byStrategy: {
        hybrid: {
          totalCases: 1,
          uniqueScenarios: 1,
          winnerCounts: {
            baseline: 0,
            goodmemory: 1,
            tie: 0,
          },
          uplift: {
            factual_recall: 1,
            preference_consistency: 1,
            cross_domain_transfer: 1,
            contamination_penalty: 0,
            update_correctness: 1,
            personalization_usefulness: 1,
            provenance_explainability: 1,
          },
          regressionCases: [],
        },
      },
      embeddingImpact: null,
      routerImpact: null,
    },
    regressionDashboardSummary: {
      totalRegressionCases: 0,
      totalBlockingCases: 0,
      judgedRegressionCases: 0,
      executionFailureCount: 0,
      unattributedExecutionFailureCount: 0,
      strategyRegressions: [],
    },
    publicSurfaceDecision: {
      officialCliShape: {
        evalSubcommandsNested: true as const,
        memoryCommandsAtRoot: true as const,
        publicEvolutionNamespace: false as const,
      },
      surfaces: [
        {
          surface: "core_config",
          exposure: "public",
          decision: "accepted",
          rationale: "core remains public",
        },
        {
          surface: "eval_artifact_cli",
          exposure: "public",
          decision: "accepted",
          rationale: "eval cli remains public",
        },
        {
          surface: "official_memory_cli",
          exposure: "public",
          decision: "accepted",
          rationale: "official cli is public",
        },
        {
          surface: "strategy_rollout_config",
          exposure: "internal",
          decision: "delayed",
          rationale: "strategy rollout config remains internal",
        },
        {
          surface: "promotion_gate_runtime",
          exposure: "internal",
          decision: "delayed",
          rationale: "promotion gate remains internal",
        },
        {
          surface: "evolution_namespace",
          exposure: "internal",
          decision: "delayed",
          rationale: "evolution remains internal",
        },
      ],
      evidence: {
        totalRegressionCases: 0,
        executionFailureCount: 0,
        promotionGateDecision: "accepted",
        promotionGateOutcome: "passed",
      },
    },
    ...overrides,
  };
}

describe("run-phase-17-eval script", () => {
  it("resolves the dedicated fallback output directory", () => {
    expect(resolvePhase17FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-17",
    );
  });

  it("uses the curated phase-17 fallback scenario slice by default", () => {
    expect(resolvePhase17FallbackScenarioIds()).toEqual([
      "scenario-complex-01",
      "scenario-medium-11-blocker-slot-zh",
      "scenario-medium-11-reference-slot-zh",
      "scenario-medium-13-blocker-slot",
      "scenario-medium-13-reference-next-step",
      "scenario-medium-13-reference-slot",
      "scenario-medium-13-role-slot",
    ]);
    expect(resolvePhase17FallbackScenarioIds(["scenario-complex-01"])).toEqual([
      "scenario-complex-01",
    ]);
  });

  it("wires the phase-17 fallback runner with observe rollout and fake-embedding memory", async () => {
    const calls: Array<Record<string, unknown>> = [];

    const result = await runPhase17FallbackEval(
      {
        limit: 4,
        runId: "phase17-run",
      },
      {
        runSuite: async (input) => {
          calls.push({
            hasCreateMemory: typeof input.createMemory === "function",
            limit: input.limit,
            mode: input.mode,
            outputDir: input.outputDir,
            rememberExtractionStrategy: input.rememberExtractionStrategy,
            runId: input.runId,
            scenarioIds: input.scenarioIds,
            strategies: input.strategies,
            strategyRollout: input.strategyRollout,
          });

          return {
            mode: input.mode,
            runId: input.runId ?? "phase17-run",
            runDirectory: join("/tmp", "phase17-run"),
            summary: buildSummary(),
            runtime: input.runtime!,
            cases: [],
          };
        },
      },
    );

    expect(result.mode).toBe("fallback");
    expect(calls[0]?.mode).toBe("fallback");
    expect(calls[0]?.runId).toBe("phase17-run");
    expect(calls[0]?.limit).toBe(4);
    expect(calls[0]?.hasCreateMemory).toBe(true);
    expect(calls[0]?.rememberExtractionStrategy).toBe("auto");
    expect(calls[0]?.strategies).toEqual(["rules-only", "hybrid"]);
    expect(calls[0]?.scenarioIds).toEqual([
      "scenario-complex-01",
      "scenario-medium-11-blocker-slot-zh",
      "scenario-medium-11-reference-slot-zh",
      "scenario-medium-13-blocker-slot",
      "scenario-medium-13-reference-next-step",
      "scenario-medium-13-reference-slot",
      "scenario-medium-13-role-slot",
    ]);
    expect(calls[0]?.strategyRollout).toEqual({
      family: "retrieval",
      mode: "observe",
      promotedStrategy: "rules-only",
    });
    expect(String(calls[0]?.outputDir)).toContain("reports/eval/fallback/phase-17");
  });
});

describe("run-phase-17-live-memory script", () => {
  it("resolves the dedicated live-memory output directory", () => {
    expect(resolvePhase17LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-17",
    );
  });

  it("runs observe and assist subruns, then writes a trusted authorization artifact", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const writes: Array<Record<string, string>> = [];

    const report = await runPhase17LiveMemoryGate(
      {
        limit: 6,
        runId: "phase17-live",
        scenarioIds: ["scenario-complex-01"],
      },
      {
        runEval: async (input) => {
          calls.push({
            limit: input?.limit,
            outputDir: input?.outputDir,
            rememberExtractionStrategy: input?.rememberExtractionStrategy,
            runId: input?.runId,
            scenarioIds: input?.scenarioIds,
            strategies: input?.strategies,
            strategyRollout: input?.strategyRollout,
          });

          const mode =
            input?.strategyRollout?.mode === "observe" ? "observe" : "assist";
          return {
            mode: "live",
            runId: input?.runId ?? `phase17-live-${mode}`,
            runDirectory: join("/tmp", `phase17-live-${mode}`),
            summary: buildSummary({
              promotionGate:
                mode === "assist"
                  ? {
                      family: "retrieval",
                      mode: "assist",
                      targetStrategyLabel: "hybrid",
                      promotedStrategyLabel: "rules-only",
                      decision: "accepted",
                      outcome: "passed",
                      rationale: "clean",
                      regressionCases: [],
                      thresholds: {
                        requireKnownObserveSafety: false,
                        requireNoRegressions: true,
                        requirePassingAssertions: true,
                        requirePositivePrimaryUplift: true,
                      },
                      evidence: {
                        assertionPassRate: 1,
                        candidateInfluencedCases: 1,
                        completedCases: 1,
                        executionFailures: 0,
                        positivePrimaryUplift: true,
                        totalCases: 1,
                      },
                    }
                  : {
                      family: "retrieval",
                      mode: "observe",
                      targetStrategyLabel: "hybrid",
                      promotedStrategyLabel: "rules-only",
                      decision: "delayed",
                      outcome: "review_required",
                      rationale: "observe must advance to assist",
                      regressionCases: [],
                      thresholds: {
                        requireKnownObserveSafety: true,
                        requireNoRegressions: true,
                        requirePassingAssertions: false,
                        requirePositivePrimaryUplift: false,
                      },
                      evidence: {
                        assertionPassRate: 1,
                        completedCases: 1,
                        executionFailures: 0,
                        safeObserveCases: 1,
                        totalCases: 1,
                        unknownObserveCases: 0,
                      },
                    },
              shadowSummary: {
                totalCases: 1,
                byFamily: { retrieval: 1 },
                byMode:
                  mode === "observe" ? { observe: 1 } : { assist: 1 },
                candidateInfluencedCases: mode === "assist" ? 1 : 0,
                safeObserveCases: mode === "observe" ? 1 : 0,
                unknownObserveCases: 0,
                regressionCases: [],
              },
            }),
            runtime: {
              generationMode: "live",
              judgeMode: "live",
            },
            cases: [],
          };
        },
        writeFileImpl: async (path, content) => {
          writes.push({
            content: String(content),
            path: String(path),
          });
        },
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.runId).toBe("phase17-live-observe");
    expect(calls[0]?.scenarioIds).toEqual(["scenario-complex-01"]);
    expect(calls[0]?.strategies).toEqual(["rules-only", "hybrid"]);
    expect(calls[0]?.rememberExtractionStrategy).toBe("auto");
    expect(calls[0]?.strategyRollout).toEqual({
      family: "retrieval",
      mode: "observe",
      promotedStrategy: "rules-only",
    });
    expect(calls[1]?.runId).toBe("phase17-live-assist");
    expect(calls[1]?.strategyRollout).toEqual({
      family: "retrieval",
      mode: "assist",
      promotedStrategy: "rules-only",
    });
    expect(report.authorization.targetStrategyLabel).toBe("hybrid");
    expect(report.authorization.source.runId).toBe("phase17-live-assist");
    expect(report.authorizationPath).toBe(
      "/tmp/phase17-live-assist/strategy-promotion-authorization.json",
    );
    expect(writes[0]?.path).toBe(report.authorizationPath);
    expect(writes[0]?.content).toContain("\"targetStrategyLabel\": \"hybrid\"");
  });

  it("refuses to issue promotion authorization when observe is blocked", async () => {
    const writes: Array<Record<string, string>> = [];

    await expect(
      runPhase17LiveMemoryGate(
        {
          limit: 6,
          runId: "phase17-live",
          scenarioIds: ["scenario-complex-01"],
        },
        {
          runEval: async (input) => {
            const mode =
              input?.strategyRollout?.mode === "observe" ? "observe" : "assist";
            return {
              mode: "live",
              runId: input?.runId ?? `phase17-live-${mode}`,
              runDirectory: join("/tmp", `phase17-live-${mode}`),
              summary: buildSummary({
                promotionGate:
                  mode === "assist"
                    ? {
                        family: "retrieval",
                        mode: "assist",
                        targetStrategyLabel: "hybrid",
                        promotedStrategyLabel: "rules-only",
                        decision: "accepted",
                        outcome: "passed",
                        rationale: "assist looked clean",
                        regressionCases: [],
                        thresholds: {
                          requireKnownObserveSafety: false,
                          requireNoRegressions: true,
                          requirePassingAssertions: true,
                          requirePositivePrimaryUplift: true,
                        },
                        evidence: {
                          assertionPassRate: 1,
                          candidateInfluencedCases: 1,
                          completedCases: 1,
                          executionFailures: 0,
                          positivePrimaryUplift: true,
                          totalCases: 1,
                        },
                      }
                    : {
                        family: "retrieval",
                        mode: "observe",
                        targetStrategyLabel: "hybrid",
                        promotedStrategyLabel: "rules-only",
                        decision: "rejected",
                        outcome: "blocked",
                        rationale: "observe regressions detected",
                        regressionCases: ["case-1"],
                        thresholds: {
                          requireKnownObserveSafety: true,
                          requireNoRegressions: true,
                          requirePassingAssertions: false,
                          requirePositivePrimaryUplift: false,
                        },
                        evidence: {
                          assertionPassRate: 0,
                          completedCases: 1,
                          executionFailures: 0,
                          safeObserveCases: 0,
                          totalCases: 1,
                          unknownObserveCases: 0,
                        },
                      },
                shadowSummary: {
                  totalCases: 1,
                  byFamily: { retrieval: 1 },
                  byMode:
                    mode === "observe" ? { observe: 1 } : { assist: 1 },
                  candidateInfluencedCases: mode === "assist" ? 1 : 0,
                  safeObserveCases: 0,
                  unknownObserveCases: 0,
                  regressionCases: mode === "observe" ? ["case-1"] : [],
                },
                assertions: {
                  ...buildSummary().assertions,
                  passRate: mode === "observe" ? 0 : 1,
                  passingCases: mode === "observe" ? 0 : 1,
                },
              }),
              runtime: {
                generationMode: "live",
                judgeMode: "live",
              },
              cases: [],
            };
          },
          writeFileImpl: async (path, content) => {
            writes.push({
              content: String(content),
              path: String(path),
            });
          },
        },
      ),
    ).rejects.toThrow(
      "Phase 17 live-memory promotion authorization requires observe to stay clean and known-safe; observe ended rejected/blocked.",
    );

    expect(writes).toHaveLength(0);
  });
});
