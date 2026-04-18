import { describe, expect, it } from "bun:test";

import type { EvalSuiteSummary } from "../../src/eval/contracts";
import { evaluatePublicSurfaceDecision } from "../../src/eval/public-surface-decision";

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
    goodmemoryAverage: buildJudgeScores(),
    baselineAverage: buildJudgeScores(),
    uplift: buildJudgeScores(),
    layers: {
      baseline: {
        retrieval: 0,
        personalization: 0,
        runtime_governance: 0,
      },
      goodmemory: {
        retrieval: 0,
        personalization: 0,
        runtime_governance: 0,
      },
      uplift: {
        retrieval: 0,
        personalization: 0,
        runtime_governance: 0,
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
      byStrategy: {},
      embeddingImpact: null,
      routerImpact: null,
    },
    ...overrides,
  };
}

describe("public surface decision", () => {
  it("preserves non-blocking regression counts in evidence", () => {
    const decision = evaluatePublicSurfaceDecision(
      buildSummary({
        promotionGate: {
          family: "retrieval",
          mode: "assist",
          decision: "accepted",
          outcome: "passed",
          rationale: "ready",
          regressionCases: [],
          thresholds: {
            requireKnownObserveSafety: false,
            requireNoRegressions: false,
            requirePassingAssertions: true,
            requirePositivePrimaryUplift: false,
          },
          evidence: {
            assertionPassRate: 1,
            completedCases: 1,
            executionFailures: 0,
            positivePrimaryUplift: true,
            totalCases: 1,
          },
        },
        regressionDashboardSummary: {
          totalRegressionCases: 2,
          totalBlockingCases: 0,
          judgedRegressionCases: 2,
          executionFailureCount: 0,
          unattributedExecutionFailureCount: 0,
          strategyRegressions: [],
        },
      }),
    );

    expect(decision.evidence).toMatchObject({
      totalRegressionCases: 2,
      executionFailureCount: 0,
      promotionGateDecision: "accepted",
      promotionGateOutcome: "passed",
    });
  });

  it("accepts the official memory cli once rollout evidence is clean", () => {
    const decision = evaluatePublicSurfaceDecision(
      buildSummary({
        promotionGate: {
          family: "retrieval",
          mode: "assist",
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
            completedCases: 1,
            executionFailures: 0,
            positivePrimaryUplift: true,
            totalCases: 1,
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
      }),
    );

    expect(decision.surfaces).toContainEqual(
      expect.objectContaining({
        surface: "official_memory_cli",
        exposure: "public",
        decision: "accepted",
      }),
    );
  });
});
