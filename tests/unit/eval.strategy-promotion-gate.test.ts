import { describe, expect, it } from "bun:test";
import type {
  EvalRuntimeMetadata,
  EvalSuiteSummary,
  JudgedEvalCase,
} from "../../src/eval/contracts";
import {
  assertRetrievalPromotionGateAllowsDefaultRollout,
  createRetrievalPromotionAuthorization,
  evaluateStrategyPromotionGate,
} from "../../src/eval/strategy-promotion-gate";

function buildCase(input: {
  strategyLabel: "rules-only" | "hybrid" | "llm-assisted";
  resolvedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  strategyMode?: "observe" | "assist" | "promote";
  promotedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  candidateInfluencedExecution?: boolean;
}): JudgedEvalCase {
  return {
    caseId: "case-1",
    metadata: {
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      strategyLabel: input.strategyLabel,
      resolvedStrategyLabel: input.resolvedStrategyLabel,
      strategyFamily: "retrieval",
      strategyMode: input.strategyMode,
      promotedStrategyLabel: input.promotedStrategyLabel,
    },
    baseline: {
      mode: "baseline",
      strategyLabel: "baseline",
      personaId: "persona-1",
      scenarioId: "scenario-1",
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      prompt: "prompt",
      transcript: "transcript",
      answer: "baseline",
      trace: {
        sessionsReplayed: 0,
        rememberEvents: [],
        feedbackEvents: [],
        recallHitCount: 0,
        verificationHintCount: 0,
        proposalLifecycle: null,
        maintenanceSummary: null,
        contextBuild: null,
      },
    },
    goodmemory: {
      mode: "goodmemory",
      strategyLabel: input.strategyLabel,
      resolvedStrategyLabel: input.resolvedStrategyLabel,
      strategyFamily: "retrieval",
      strategyMode: input.strategyMode,
      promotedStrategyLabel: input.promotedStrategyLabel,
      candidateInfluencedExecution: input.candidateInfluencedExecution,
      personaId: "persona-1",
      scenarioId: "scenario-1",
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      prompt: "prompt",
      transcript: "transcript",
      answer: "goodmemory",
      trace: {
        sessionsReplayed: 0,
        rememberEvents: [],
        feedbackEvents: [],
        recallHitCount: 0,
        verificationHintCount: 0,
        proposalLifecycle: null,
        maintenanceSummary: null,
        contextBuild: null,
      },
    },
    judge: {
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
      reasoning: "comparison complete",
      failure_tags: [],
    },
    assertions: {
      passed: true,
      totalChecks: 1,
      passedChecks: 1,
      checks: [{ id: "provenance_explainable", passed: true, details: ["ok"] }],
      contaminationFindings: [],
      updateFindings: [],
    },
  };
}

function buildSummary(
  overrides?: Partial<EvalSuiteSummary>,
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
    goodmemoryAverage: {
      factual_recall: 8,
      preference_consistency: 8,
      cross_domain_transfer: 8,
      contamination_penalty: 8,
      update_correctness: 8,
      personalization_usefulness: 8,
      provenance_explainability: 8,
    },
    baselineAverage: {
      factual_recall: 5,
      preference_consistency: 5,
      cross_domain_transfer: 5,
      contamination_penalty: 5,
      update_correctness: 5,
      personalization_usefulness: 5,
      provenance_explainability: 5,
    },
    uplift: {
      factual_recall: 3,
      preference_consistency: 3,
      cross_domain_transfer: 3,
      contamination_penalty: 3,
      update_correctness: 3,
      personalization_usefulness: 3,
      provenance_explainability: 3,
    },
    layers: {
      baseline: {
        retrieval: 5,
        personalization: 5,
        runtime_governance: 5,
      },
      goodmemory: {
        retrieval: 8,
        personalization: 8,
        runtime_governance: 8,
      },
      uplift: {
        retrieval: 3,
        personalization: 3,
        runtime_governance: 3,
      },
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
            factual_recall: 3,
            preference_consistency: 3,
            cross_domain_transfer: 3,
            contamination_penalty: 3,
            update_correctness: 3,
            personalization_usefulness: 3,
            provenance_explainability: 3,
          },
          regressionCases: [],
        },
      },
      embeddingImpact: null,
      routerImpact: null,
    },
    publicSurfaceDecision: {
      officialCliShape: {
        evalSubcommandsNested: true,
        memoryCommandsAtRoot: true,
        publicEvolutionNamespace: false,
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
          rationale: "eval cli is public",
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
          rationale: "rollout config remains internal",
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
          rationale: "evolution namespace remains internal",
        },
      ],
      evidence: {
        totalRegressionCases: 0,
        executionFailureCount: 0,
        promotionGateDecision: "accepted",
        promotionGateOutcome: "passed",
      },
    },
    regressionDashboardSummary: {
      totalRegressionCases: 0,
      totalBlockingCases: 0,
      judgedRegressionCases: 0,
      executionFailureCount: 0,
      unattributedExecutionFailureCount: 0,
      strategyRegressions: [],
    },
    shadowSummary: undefined,
    maintenanceSummary: undefined,
    outcomeLoopSummary: undefined,
    ...overrides,
  };
}

function buildPromotionAuthorization(
  overrides?: Partial<EvalSuiteSummary>,
  observeOverrides?: Partial<EvalSuiteSummary>,
) {
  return createRetrievalPromotionAuthorization({
    generatedBy: "tests",
    issuedAt: "2026-01-10T00:00:00.000Z",
    observe: {
      runId: "run-001-observe",
      summary: buildSummary({
        promotionGate: {
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
          byMode: { observe: 1 },
          candidateInfluencedCases: 0,
          safeObserveCases: 1,
          unknownObserveCases: 0,
          regressionCases: [],
        },
        ...observeOverrides,
      }),
    },
    runId: "run-001",
    summary: buildSummary({
      promotionGate: {
        family: "retrieval",
        mode: "assist",
        targetStrategyLabel: "hybrid",
        promotedStrategyLabel: "rules-only",
        decision: "accepted",
        outcome: "passed",
        rationale: "ready",
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
      },
      ...overrides,
    }),
  });
}

describe("eval strategy promotion gate", () => {
  it("returns undefined when no strategy rollout metadata exists", () => {
    expect(
      evaluateStrategyPromotionGate({
        cases: [],
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
        summary: buildSummary(),
      }),
    ).toBeUndefined();
  });

  it("delays observe-mode promotion even when shadow evidence is clean", () => {
    const decision = evaluateStrategyPromotionGate({
      cases: [
        buildCase({
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: false,
        }),
      ],
      runtime: {
        generationMode: "fallback",
        judgeMode: "fallback",
        strategyRollout: {
          family: "retrieval",
          mode: "observe",
          promotedStrategyLabel: "rules-only",
        },
      } satisfies EvalRuntimeMetadata,
      summary: buildSummary({
        shadowSummary: {
          totalCases: 1,
          byFamily: { retrieval: 1 },
          byMode: { observe: 1 },
          candidateInfluencedCases: 0,
          safeObserveCases: 1,
          unknownObserveCases: 0,
          regressionCases: [],
        },
      }),
    });

    expect(decision).toMatchObject({
      mode: "observe",
      targetStrategyLabel: "hybrid",
      promotedStrategyLabel: "rules-only",
      decision: "delayed",
      outcome: "review_required",
    });
    expect(decision?.rationale).toContain("assist");
  });

  it("accepts assist-mode promotion when assertions pass, uplift is positive, and regressions are absent", () => {
    const decision = evaluateStrategyPromotionGate({
      cases: [
        buildCase({
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "hybrid",
          strategyMode: "assist",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: true,
        }),
      ],
      runtime: {
        generationMode: "fallback",
        judgeMode: "fallback",
        strategyRollout: {
          family: "retrieval",
          mode: "assist",
          promotedStrategyLabel: "rules-only",
        },
      } satisfies EvalRuntimeMetadata,
      summary: buildSummary(),
    });

    expect(decision).toMatchObject({
      mode: "assist",
      targetStrategyLabel: "hybrid",
      promotedStrategyLabel: "rules-only",
      decision: "accepted",
      outcome: "passed",
    });
    expect(decision?.evidence.positivePrimaryUplift).toBe(true);
  });

  it("delays assist-mode promotion when the eval run is incomplete", () => {
    const decision = evaluateStrategyPromotionGate({
      cases: [
        buildCase({
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "hybrid",
          strategyMode: "assist",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: true,
        }),
      ],
      runtime: {
        generationMode: "fallback",
        judgeMode: "fallback",
        strategyRollout: {
          family: "retrieval",
          mode: "assist",
          promotedStrategyLabel: "rules-only",
        },
      } satisfies EvalRuntimeMetadata,
      summary: buildSummary({
        totalCases: 2,
        completedCases: 1,
        executionFailures: 1,
      }),
    });

    expect(decision).toMatchObject({
      mode: "assist",
      targetStrategyLabel: "hybrid",
      decision: "delayed",
      outcome: "review_required",
      evidence: {
        totalCases: 1,
        completedCases: 1,
        executionFailures: 1,
      },
    });
    expect(decision?.rationale).toContain("incomplete");
  });

  it("rejects assist-mode promotion when regressions exist", () => {
    const decision = evaluateStrategyPromotionGate({
      cases: [
        buildCase({
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "hybrid",
          strategyMode: "assist",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: true,
        }),
      ],
      runtime: {
        generationMode: "fallback",
        judgeMode: "fallback",
        strategyRollout: {
          family: "retrieval",
          mode: "assist",
          promotedStrategyLabel: "rules-only",
        },
      } satisfies EvalRuntimeMetadata,
      summary: buildSummary({
        strategySummary: {
          byStrategy: {
            hybrid: {
              totalCases: 1,
              uniqueScenarios: 1,
              winnerCounts: {
                baseline: 1,
                goodmemory: 0,
                tie: 0,
              },
              uplift: {
                factual_recall: -1,
                preference_consistency: -1,
                cross_domain_transfer: -1,
                contamination_penalty: 0,
                update_correctness: -1,
                personalization_usefulness: -1,
                provenance_explainability: -1,
              },
              regressionCases: ["case-1"],
            },
          },
          embeddingImpact: null,
          routerImpact: null,
        },
      }),
    });

    expect(decision).toMatchObject({
      mode: "assist",
      targetStrategyLabel: "hybrid",
      decision: "rejected",
      outcome: "blocked",
      regressionCases: ["case-1"],
    });
  });

  it("blocks promote-mode default rollout without a matching accepted gate", () => {
    expect(() =>
      assertRetrievalPromotionGateAllowsDefaultRollout({
        rollout: {
          family: "retrieval",
          mode: "promote",
          promotedStrategy: "hybrid",
        },
      }),
    ).toThrow(
      "Retrieval strategy hybrid cannot become the promoted default because no trusted strategy-promotion authorization was supplied.",
    );
  });

  it("keeps non-default promote rollouts blocked until trusted authorization exists", () => {
    expect(() =>
      assertRetrievalPromotionGateAllowsDefaultRollout({
        rollout: {
          family: "retrieval",
          mode: "promote",
          promotedStrategy: "hybrid",
        },
      }),
    ).toThrow(
      "Retrieval strategy hybrid cannot become the promoted default because no trusted strategy-promotion authorization was supplied.",
    );
  });

  it("accepts a matching clean trusted promotion authorization", () => {
    expect(() =>
      assertRetrievalPromotionGateAllowsDefaultRollout({
        now: "2026-01-10T12:00:00.000Z",
        rollout: {
          family: "retrieval",
          mode: "promote",
          promotedStrategy: "hybrid",
          promotionAuthorization: buildPromotionAuthorization(),
        },
      }),
    ).not.toThrow();
  });

  it("rejects trusted promotion authorization missing paired observe evidence", () => {
    const authorization = buildPromotionAuthorization();
    const forged = {
      ...authorization,
      pairedObserve: undefined,
    } as unknown as ReturnType<typeof buildPromotionAuthorization>;

    expect(() =>
      assertRetrievalPromotionGateAllowsDefaultRollout({
        now: "2026-01-10T12:00:00.000Z",
        rollout: {
          family: "retrieval",
          mode: "promote",
          promotedStrategy: "hybrid",
          promotionAuthorization: forged,
        },
      }),
    ).toThrow(
      "Retrieval strategy hybrid cannot become the promoted default because trusted strategy-promotion authorization is missing paired observe evidence.",
    );
  });

  it("rejects trusted promotion authorization that targets a different strategy", () => {
    expect(() =>
      assertRetrievalPromotionGateAllowsDefaultRollout({
        now: "2026-01-10T12:00:00.000Z",
        rollout: {
          family: "retrieval",
          mode: "promote",
          promotedStrategy: "llm-assisted",
          promotionAuthorization: buildPromotionAuthorization(),
        },
      }),
    ).toThrow(
      "Retrieval strategy llm-assisted cannot become the promoted default because trusted strategy-promotion authorization targets hybrid.",
    );
  });

  it("rejects stale trusted promotion authorization", () => {
    expect(() =>
      assertRetrievalPromotionGateAllowsDefaultRollout({
        now: "2026-01-20T00:00:00.000Z",
        rollout: {
          family: "retrieval",
          mode: "promote",
          promotedStrategy: "hybrid",
          promotionAuthorization: buildPromotionAuthorization({
            regressionDashboardSummary: {
              totalRegressionCases: 0,
              totalBlockingCases: 0,
              judgedRegressionCases: 0,
              executionFailureCount: 0,
              unattributedExecutionFailureCount: 0,
              strategyRegressions: [],
            },
          }),
        },
      }),
    ).toThrow(
      "Retrieval strategy hybrid cannot become the promoted default because trusted strategy-promotion authorization expired at 2026-01-17T00:00:00.000Z.",
    );
  });

  it("rejects trusted promotion authorization with blocking evidence", () => {
    expect(() =>
      buildPromotionAuthorization({
        regressionDashboardSummary: {
          totalRegressionCases: 1,
          totalBlockingCases: 1,
          judgedRegressionCases: 1,
          executionFailureCount: 0,
          unattributedExecutionFailureCount: 0,
          strategyRegressions: [],
        },
      }),
    ).toThrow(
      "Trusted strategy-promotion authorization requires zero blocking cases and zero execution failures.",
    );
  });

  it("rejects trusted promotion authorization when paired observe evidence is not known-safe", () => {
    expect(() =>
      buildPromotionAuthorization(
        undefined,
        {
          shadowSummary: {
            totalCases: 1,
            byFamily: { retrieval: 1 },
            byMode: { observe: 1 },
            candidateInfluencedCases: 0,
            safeObserveCases: 0,
            unknownObserveCases: 1,
            regressionCases: [],
          },
        },
      ),
    ).toThrow(
      "Trusted strategy-promotion authorization requires paired observe execution safety to be known for every case.",
    );
  });
});
