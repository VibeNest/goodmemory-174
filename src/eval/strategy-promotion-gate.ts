import type {
  EvalRuntimeMetadata,
  EvalStrategyPromotionGateDecision,
  EvalStrategyPromotionGateThresholds,
  EvalSuiteSummary,
  JudgedEvalCase,
} from "./contracts";
import type { JudgeScores } from "./judge";
import {
  DEFAULT_PROMOTED_RETRIEVAL_STRATEGY,
  type RetrievalStrategyRolloutConfig,
  type StrategyRolloutMode,
} from "./strategy-rollout";
import type { EvalAnswerPackage } from "./runners";

const OBSERVE_THRESHOLDS: EvalStrategyPromotionGateThresholds = {
  requireKnownObserveSafety: true,
  requireNoRegressions: true,
  requirePassingAssertions: false,
  requirePositivePrimaryUplift: false,
};

const ACTIVE_THRESHOLDS: EvalStrategyPromotionGateThresholds = {
  requireKnownObserveSafety: false,
  requireNoRegressions: true,
  requirePassingAssertions: true,
  requirePositivePrimaryUplift: true,
};

function uniqueLabels(
  labels: Array<EvalAnswerPackage["strategyLabel"] | undefined>,
): Array<Exclude<EvalAnswerPackage["strategyLabel"], "baseline">> {
  return [...new Set(labels)]
    .filter(
      (
        label,
      ): label is Exclude<EvalAnswerPackage["strategyLabel"], "baseline"> =>
        label !== undefined &&
        label !== "baseline" &&
        label !== "auto",
    );
}

function hasPositivePrimaryUplift(scores: JudgeScores): boolean {
  return (
    scores.factual_recall > 0 ||
    scores.preference_consistency > 0 ||
    scores.cross_domain_transfer > 0 ||
    scores.personalization_usefulness > 0
  );
}

function resolveRunCompletionEvidence(input: {
  summary: EvalSuiteSummary;
  fallbackCompletedCases: number;
}) {
  const completedCases =
    typeof input.summary.completedCases === "number" &&
    Number.isFinite(input.summary.completedCases)
      ? Math.max(0, input.summary.completedCases)
      : input.fallbackCompletedCases;
  const executionFailures =
    typeof input.summary.executionFailures === "number" &&
    Number.isFinite(input.summary.executionFailures)
      ? Math.max(0, input.summary.executionFailures)
      : Math.max(input.summary.totalCases - completedCases, 0);

  return {
    completedCases,
    executionFailures,
    isComplete:
      executionFailures === 0 && completedCases >= input.summary.totalCases,
  };
}

function resolveTargetStrategyLabel(input: {
  cases: JudgedEvalCase[];
  mode: StrategyRolloutMode;
  promotedStrategyLabel?: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
}): Exclude<EvalAnswerPackage["strategyLabel"], "baseline"> | undefined {
  if (input.mode === "promote") {
    return input.promotedStrategyLabel;
  }

  const withoutPromoted = (
    labels: Array<EvalAnswerPackage["strategyLabel"] | undefined>,
  ) =>
    uniqueLabels(labels).filter((label) => label !== input.promotedStrategyLabel);

  if (input.mode === "observe") {
    const requestedLabels = withoutPromoted(
      input.cases.map((item) => item.metadata.strategyLabel),
    );
    if (requestedLabels.length === 1) {
      return requestedLabels[0];
    }

    const shadowLabels = withoutPromoted(
      input.cases.map((item) => item.shadow?.resolvedStrategyLabel),
    );
    if (shadowLabels.length === 1) {
      return shadowLabels[0];
    }
  }

  const executedLabels = withoutPromoted(
    input.cases.map(
      (item) => item.metadata.resolvedStrategyLabel ?? item.metadata.strategyLabel,
    ),
  );
  if (executedLabels.length === 1) {
    return executedLabels[0];
  }

  const requestedLabels = withoutPromoted(
    input.cases.map((item) => item.metadata.strategyLabel),
  );
  return requestedLabels.length === 1 ? requestedLabels[0] : undefined;
}

export function evaluateStrategyPromotionGate(input: {
  cases: JudgedEvalCase[];
  runtime: EvalRuntimeMetadata;
  summary: EvalSuiteSummary;
}): EvalStrategyPromotionGateDecision | undefined {
  const rollout = input.runtime.strategyRollout;
  if (!rollout) {
    return undefined;
  }

  const rolloutCases = input.cases.filter(
    (item) => item.metadata.strategyFamily === rollout.family,
  );
  const targetStrategyLabel = resolveTargetStrategyLabel({
    cases: rolloutCases,
    mode: rollout.mode,
    promotedStrategyLabel: rollout.promotedStrategyLabel,
  });
  const completion = resolveRunCompletionEvidence({
    summary: input.summary,
    fallbackCompletedCases: input.cases.length,
  });

  if (!completion.isComplete) {
    return {
      family: rollout.family,
      mode: rollout.mode,
      targetStrategyLabel,
      promotedStrategyLabel: rollout.promotedStrategyLabel,
      decision: "delayed",
      outcome: "review_required",
      rationale:
        "eval run is incomplete; unexecuted cases remain unknown and cannot justify promotion",
      regressionCases: [],
      thresholds: rollout.mode === "observe" ? OBSERVE_THRESHOLDS : ACTIVE_THRESHOLDS,
      evidence: {
        totalCases:
          rollout.mode === "observe"
            ? input.summary.shadowSummary?.totalCases ?? 0
            : rolloutCases.length,
        completedCases: completion.completedCases,
        executionFailures: completion.executionFailures,
        assertionPassRate: input.summary.assertions.passRate,
        ...(rollout.mode === "observe"
          ? {
              safeObserveCases: input.summary.shadowSummary?.safeObserveCases ?? 0,
              unknownObserveCases:
                input.summary.shadowSummary?.unknownObserveCases ?? 0,
            }
          : {
              candidateInfluencedCases:
                input.summary.shadowSummary?.candidateInfluencedCases,
            }),
      },
    };
  }

  if (rollout.mode === "observe") {
    if (!input.summary.shadowSummary || input.summary.shadowSummary.totalCases === 0) {
      return {
        family: rollout.family,
        mode: rollout.mode,
        targetStrategyLabel,
        promotedStrategyLabel: rollout.promotedStrategyLabel,
        decision: "delayed",
        outcome: "review_required",
        rationale: "observe rollout has no persisted shadow evidence yet",
        regressionCases: [],
        thresholds: OBSERVE_THRESHOLDS,
        evidence: {
          totalCases: 0,
          completedCases: completion.completedCases,
          executionFailures: completion.executionFailures,
          assertionPassRate: input.summary.assertions.passRate,
          safeObserveCases: 0,
          unknownObserveCases: 0,
        },
      };
    }

    if (input.summary.shadowSummary.regressionCases.length > 0) {
      return {
        family: rollout.family,
        mode: rollout.mode,
        targetStrategyLabel,
        promotedStrategyLabel: rollout.promotedStrategyLabel,
        decision: "rejected",
        outcome: "blocked",
        rationale: "observe rollout produced shadow regressions and cannot advance",
        regressionCases: input.summary.shadowSummary.regressionCases,
        thresholds: OBSERVE_THRESHOLDS,
        evidence: {
          totalCases: input.summary.shadowSummary.totalCases,
          completedCases: completion.completedCases,
          executionFailures: completion.executionFailures,
          assertionPassRate: input.summary.assertions.passRate,
          safeObserveCases: input.summary.shadowSummary.safeObserveCases,
          unknownObserveCases: input.summary.shadowSummary.unknownObserveCases,
        },
      };
    }

    if (input.summary.shadowSummary.unknownObserveCases > 0) {
      return {
        family: rollout.family,
        mode: rollout.mode,
        targetStrategyLabel,
        promotedStrategyLabel: rollout.promotedStrategyLabel,
        decision: "delayed",
        outcome: "review_required",
        rationale: "observe rollout still has unknown execution influence and needs more isolated shadow evidence",
        regressionCases: [],
        thresholds: OBSERVE_THRESHOLDS,
        evidence: {
          totalCases: input.summary.shadowSummary.totalCases,
          completedCases: completion.completedCases,
          executionFailures: completion.executionFailures,
          assertionPassRate: input.summary.assertions.passRate,
          safeObserveCases: input.summary.shadowSummary.safeObserveCases,
          unknownObserveCases: input.summary.shadowSummary.unknownObserveCases,
        },
      };
    }

    return {
      family: rollout.family,
      mode: rollout.mode,
      targetStrategyLabel,
      promotedStrategyLabel: rollout.promotedStrategyLabel,
      decision: "delayed",
      outcome: "review_required",
      rationale: "observe rollout evidence is clean; the next step is assist, not direct promotion",
      regressionCases: [],
      thresholds: OBSERVE_THRESHOLDS,
      evidence: {
        totalCases: input.summary.shadowSummary.totalCases,
        completedCases: completion.completedCases,
        executionFailures: completion.executionFailures,
        assertionPassRate: input.summary.assertions.passRate,
        safeObserveCases: input.summary.shadowSummary.safeObserveCases,
        unknownObserveCases: input.summary.shadowSummary.unknownObserveCases,
      },
    };
  }

  if (!targetStrategyLabel) {
    return {
      family: rollout.family,
      mode: rollout.mode,
      promotedStrategyLabel: rollout.promotedStrategyLabel,
      decision: "delayed",
      outcome: "review_required",
      rationale: "rollout evidence does not resolve a single target strategy label yet",
      regressionCases: [],
      thresholds: ACTIVE_THRESHOLDS,
      evidence: {
        totalCases: rolloutCases.length,
        completedCases: completion.completedCases,
        executionFailures: completion.executionFailures,
        assertionPassRate: input.summary.assertions.passRate,
        candidateInfluencedCases: input.summary.shadowSummary?.candidateInfluencedCases,
      },
    };
  }

  const strategyBreakdown = input.summary.strategySummary.byStrategy[targetStrategyLabel];
  if (!strategyBreakdown) {
    return {
      family: rollout.family,
      mode: rollout.mode,
      targetStrategyLabel,
      promotedStrategyLabel: rollout.promotedStrategyLabel,
      decision: "delayed",
      outcome: "review_required",
      rationale: "no strategy summary was recorded for the candidate rollout target",
      regressionCases: [],
      thresholds: ACTIVE_THRESHOLDS,
      evidence: {
        totalCases: rolloutCases.length,
        completedCases: completion.completedCases,
        executionFailures: completion.executionFailures,
        assertionPassRate: input.summary.assertions.passRate,
        candidateInfluencedCases: input.summary.shadowSummary?.candidateInfluencedCases,
      },
    };
  }

  if (
    input.summary.assertions.passRate < 1 ||
    strategyBreakdown.regressionCases.length > 0
  ) {
    return {
      family: rollout.family,
      mode: rollout.mode,
      targetStrategyLabel,
      promotedStrategyLabel: rollout.promotedStrategyLabel,
      decision: "rejected",
      outcome: "blocked",
      rationale: "candidate rollout failed deterministic assertions or introduced regressions",
      regressionCases: strategyBreakdown.regressionCases,
      thresholds: ACTIVE_THRESHOLDS,
      evidence: {
        totalCases: strategyBreakdown.totalCases,
        completedCases: completion.completedCases,
        executionFailures: completion.executionFailures,
        assertionPassRate: input.summary.assertions.passRate,
        candidateInfluencedCases: input.summary.shadowSummary?.candidateInfluencedCases,
        positivePrimaryUplift: hasPositivePrimaryUplift(strategyBreakdown.uplift),
      },
    };
  }

  const positivePrimaryUplift = hasPositivePrimaryUplift(strategyBreakdown.uplift);
  if (!positivePrimaryUplift) {
    return {
      family: rollout.family,
      mode: rollout.mode,
      targetStrategyLabel,
      promotedStrategyLabel: rollout.promotedStrategyLabel,
      decision: "delayed",
      outcome: "review_required",
      rationale: "candidate rollout cleared regressions but did not show positive primary eval uplift",
      regressionCases: [],
      thresholds: ACTIVE_THRESHOLDS,
      evidence: {
        totalCases: strategyBreakdown.totalCases,
        completedCases: completion.completedCases,
        executionFailures: completion.executionFailures,
        assertionPassRate: input.summary.assertions.passRate,
        candidateInfluencedCases: input.summary.shadowSummary?.candidateInfluencedCases,
        positivePrimaryUplift,
      },
    };
  }

  return {
    family: rollout.family,
    mode: rollout.mode,
    targetStrategyLabel,
    promotedStrategyLabel: rollout.promotedStrategyLabel,
    decision: "accepted",
    outcome: "passed",
    rationale: "candidate rollout cleared deterministic assertions, avoided regressions, and showed positive primary eval uplift",
    regressionCases: [],
    thresholds: ACTIVE_THRESHOLDS,
    evidence: {
      totalCases: strategyBreakdown.totalCases,
      completedCases: completion.completedCases,
      executionFailures: completion.executionFailures,
      assertionPassRate: input.summary.assertions.passRate,
      candidateInfluencedCases: input.summary.shadowSummary?.candidateInfluencedCases,
      positivePrimaryUplift,
    },
  };
}

export function assertRetrievalPromotionGateAllowsDefaultRollout(input: {
  rollout?: RetrievalStrategyRolloutConfig;
}): void {
  if (!input.rollout) {
    return;
  }

  const mode = input.rollout.mode ?? "promote";
  const promotedStrategy =
    input.rollout.promotedStrategy ?? DEFAULT_PROMOTED_RETRIEVAL_STRATEGY;

  if (
    mode !== "promote" ||
    promotedStrategy === DEFAULT_PROMOTED_RETRIEVAL_STRATEGY
  ) {
    return;
  }

  throw new Error(
    `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization is not implemented yet.`,
  );
}
