import type {
  EvalPublicSurfaceDecision,
  EvalRegressionDashboardSummary,
  EvalRuntimeMetadata,
  EvalStrategyPromotionGateDecision,
  EvalStrategyPromotionGateThresholds,
  EvalSuiteSummary,
  JudgedEvalCase,
} from "./contracts";
import type { JudgeScores } from "./judge";
import {
  DEFAULT_PROMOTED_RETRIEVAL_STRATEGY,
  type RetrievalStrategyPromotionAuthorization,
  type RetrievalStrategyRolloutConfig,
  type StrategyRolloutMode,
} from "./strategy-rollout";
import type { EvalAnswerPackage } from "./runners";

const RETRIEVAL_PROMOTION_AUTH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function parseAuthorizationTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Trusted strategy-promotion authorization has an invalid ${label}: ${value}.`,
    );
  }

  return parsed;
}

function findPublicSurfaceDecision(
  decision: EvalPublicSurfaceDecision,
  surface: RetrievalStrategyPromotionAuthorization["publicSurfaceDecision"]["surfaces"][number]["surface"],
) {
  return decision.surfaces.find((entry) => entry.surface === surface);
}

function buildPairedObserveAuthorizationEvidence(input: {
  assistPromotionGate: NonNullable<EvalSuiteSummary["promotionGate"]>;
  observe: {
    runDirectory?: string;
    runId: string;
    summary: EvalSuiteSummary;
  };
}): RetrievalStrategyPromotionAuthorization["pairedObserve"] {
  const observeGate = input.observe.summary.promotionGate;
  if (
    !observeGate ||
    observeGate.family !== "retrieval" ||
    observeGate.mode !== "observe"
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe promotion-gate evidence.",
    );
  }

  const observeShadowSummary = input.observe.summary.shadowSummary;
  if (!observeShadowSummary) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe shadow evidence.",
    );
  }

  const observeCompletion = resolveRunCompletionEvidence({
    summary: input.observe.summary,
    fallbackCompletedCases: observeShadowSummary.totalCases,
  });
  if (
    !observeCompletion.isComplete ||
    observeCompletion.executionFailures > 0
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence to complete without execution failures.",
    );
  }
  if (input.observe.summary.assertions.passRate < 1) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe assertions to pass.",
    );
  }
  if (
    observeGate.decision === "rejected" ||
    observeGate.outcome === "blocked"
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence to stay clean and known-safe.",
    );
  }
  if (observeShadowSummary.totalCases <= 0) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence for at least one case.",
    );
  }
  if (observeShadowSummary.totalCases < input.observe.summary.totalCases) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe shadow evidence for the full evaluated case set.",
    );
  }
  if (observeShadowSummary.regressionCases.length > 0) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence with zero regressions.",
    );
  }
  if (observeShadowSummary.unknownObserveCases > 0) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe execution safety to be known for every case.",
    );
  }
  if (observeShadowSummary.safeObserveCases < observeShadowSummary.totalCases) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence to prove every executed path stayed on the promoted/default strategy.",
    );
  }
  if (
    observeGate.targetStrategyLabel !== input.assistPromotionGate.targetStrategyLabel
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence to target the same retrieval strategy as assist.",
    );
  }
  if (
    observeGate.promotedStrategyLabel !==
    input.assistPromotionGate.promotedStrategyLabel
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires paired observe evidence to use the same promoted baseline strategy as assist.",
    );
  }
  if (
    observeGate.targetStrategyLabel === "auto" ||
    observeGate.promotedStrategyLabel === "auto"
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization cannot use auto strategy labels in paired observe evidence.",
    );
  }

  return {
    promotionGate: {
      decision: observeGate.decision,
      outcome: observeGate.outcome,
      promotedStrategyLabel: observeGate.promotedStrategyLabel,
      targetStrategyLabel: observeGate.targetStrategyLabel,
    },
    source: {
      ...(input.observe.runDirectory
        ? { runDirectory: input.observe.runDirectory }
        : {}),
      runId: input.observe.runId,
    },
    summary: {
      assertionPassRate: input.observe.summary.assertions.passRate,
      completedCases: observeCompletion.completedCases,
      executionFailures: observeCompletion.executionFailures,
      regressionCases: [...observeShadowSummary.regressionCases],
      safeObserveCases: observeShadowSummary.safeObserveCases,
      totalCases: observeShadowSummary.totalCases,
      unknownObserveCases: observeShadowSummary.unknownObserveCases,
    },
  };
}

export function createRetrievalPromotionAuthorization(input: {
  expiresAt?: string;
  generatedBy: string;
  issuedAt?: string;
  observe: {
    runDirectory?: string;
    runId: string;
    summary: EvalSuiteSummary;
  };
  runDirectory?: string;
  runId: string;
  summary: EvalSuiteSummary;
}): RetrievalStrategyPromotionAuthorization {
  const promotionGate = input.summary.promotionGate;
  if (!promotionGate || promotionGate.family !== "retrieval") {
    throw new Error(
      "Trusted strategy-promotion authorization requires a retrieval promotion gate decision.",
    );
  }
  if (!promotionGate.targetStrategyLabel) {
    throw new Error(
      "Trusted strategy-promotion authorization requires a resolved retrieval target strategy.",
    );
  }
  if (!input.summary.regressionDashboardSummary) {
    throw new Error(
      "Trusted strategy-promotion authorization requires a regression dashboard summary.",
    );
  }
  if (!input.summary.publicSurfaceDecision) {
    throw new Error(
      "Trusted strategy-promotion authorization requires a public surface decision.",
    );
  }
  if (
    promotionGate.decision !== "accepted" ||
    promotionGate.outcome !== "passed"
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires an accepted/passed promotion gate.",
    );
  }
  if (
    input.summary.regressionDashboardSummary.totalBlockingCases > 0 ||
    input.summary.regressionDashboardSummary.executionFailureCount > 0
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires zero blocking cases and zero execution failures.",
    );
  }

  const rolloutSurface = findPublicSurfaceDecision(
    input.summary.publicSurfaceDecision,
    "strategy_rollout_config",
  );
  const promotionGateSurface = findPublicSurfaceDecision(
    input.summary.publicSurfaceDecision,
    "promotion_gate_runtime",
  );
  if (
    rolloutSurface?.exposure !== "internal" ||
    rolloutSurface.decision !== "delayed" ||
    promotionGateSurface?.exposure !== "internal" ||
    promotionGateSurface.decision !== "delayed"
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization requires rollout controls to remain internal.",
    );
  }

  if (
    promotionGate.targetStrategyLabel === "auto" ||
    promotionGate.promotedStrategyLabel === "auto"
  ) {
    throw new Error(
      "Trusted strategy-promotion authorization cannot be created from auto strategy labels.",
    );
  }
  const promotedStrategyLabel = promotionGate.promotedStrategyLabel;
  const targetStrategyLabel = promotionGate.targetStrategyLabel;
  const pairedObserve = buildPairedObserveAuthorizationEvidence({
    assistPromotionGate: promotionGate,
    observe: input.observe,
  });

  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const issuedAtMs = parseAuthorizationTimestamp("issuedAt", issuedAt);
  const expiresAt =
    input.expiresAt ??
    new Date(issuedAtMs + RETRIEVAL_PROMOTION_AUTH_TTL_MS).toISOString();
  parseAuthorizationTimestamp("expiresAt", expiresAt);

  return {
    expiresAt,
    family: "retrieval",
    issuedAt,
    pairedObserve,
    promotionGate: {
      decision: promotionGate.decision,
      outcome: promotionGate.outcome,
      promotedStrategyLabel,
      targetStrategyLabel,
    },
    publicSurfaceDecision: {
      surfaces: input.summary.publicSurfaceDecision.surfaces.map((surface) => ({
        decision: surface.decision,
        exposure: surface.exposure,
        surface: surface.surface,
      })),
    },
    regressionDashboardSummary: {
      executionFailureCount:
        input.summary.regressionDashboardSummary.executionFailureCount,
      totalBlockingCases: input.summary.regressionDashboardSummary.totalBlockingCases,
    },
    source: {
      generatedBy: input.generatedBy,
      ...(input.runDirectory ? { runDirectory: input.runDirectory } : {}),
      runId: input.runId,
    },
    targetStrategyLabel,
  };
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
  now?: string;
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

  const authorization = input.rollout.promotionAuthorization;
  if (!authorization) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because no trusted strategy-promotion authorization was supplied.`,
    );
  }
  if (authorization.family !== "retrieval") {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization is for ${authorization.family}.`,
    );
  }
  if (authorization.targetStrategyLabel !== promotedStrategy) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization targets ${authorization.targetStrategyLabel}.`,
    );
  }
  if (authorization.promotionGate.targetStrategyLabel !== promotedStrategy) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because the trusted promotion gate targets ${authorization.promotionGate.targetStrategyLabel ?? "unknown"}.`,
    );
  }
  if (
    authorization.promotionGate.decision !== "accepted" ||
    authorization.promotionGate.outcome !== "passed"
  ) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because the trusted promotion gate is ${authorization.promotionGate.decision}/${authorization.promotionGate.outcome}.`,
    );
  }
  const pairedObserve = authorization.pairedObserve;
  if (!pairedObserve) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization is missing paired observe evidence.`,
    );
  }
  if (pairedObserve.promotionGate.targetStrategyLabel !== promotedStrategy) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence targets ${pairedObserve.promotionGate.targetStrategyLabel ?? "unknown"}.`,
    );
  }
  if (
    pairedObserve.promotionGate.promotedStrategyLabel !==
    authorization.promotionGate.promotedStrategyLabel
  ) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence uses a different promoted baseline.`,
    );
  }
  if (
    pairedObserve.promotionGate.decision === "rejected" ||
    pairedObserve.promotionGate.outcome === "blocked"
  ) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence is ${pairedObserve.promotionGate.decision}/${pairedObserve.promotionGate.outcome}.`,
    );
  }
  if (pairedObserve.summary.totalCases <= 0) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence has no evaluated cases.`,
    );
  }
  if (pairedObserve.summary.executionFailures > 0) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence still has execution failures.`,
    );
  }
  if (pairedObserve.summary.assertionPassRate < 1) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe assertions did not fully pass.`,
    );
  }
  if (pairedObserve.summary.regressionCases.length > 0) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence still has regressions.`,
    );
  }
  if (pairedObserve.summary.unknownObserveCases > 0) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence still has unknown execution influence.`,
    );
  }
  if (
    pairedObserve.summary.safeObserveCases < pairedObserve.summary.totalCases ||
    pairedObserve.summary.completedCases < pairedObserve.summary.totalCases
  ) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because paired observe evidence does not prove full known-safe coverage.`,
    );
  }

  const strategyRolloutSurface = findPublicSurfaceDecision(
    authorization.publicSurfaceDecision as EvalPublicSurfaceDecision,
    "strategy_rollout_config",
  );
  const promotionGateSurface = findPublicSurfaceDecision(
    authorization.publicSurfaceDecision as EvalPublicSurfaceDecision,
    "promotion_gate_runtime",
  );
  if (
    strategyRolloutSurface?.exposure !== "internal" ||
    strategyRolloutSurface.decision !== "delayed" ||
    promotionGateSurface?.exposure !== "internal" ||
    promotionGateSurface.decision !== "delayed"
  ) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization does not keep rollout controls internal.`,
    );
  }

  const dashboard =
    authorization.regressionDashboardSummary as EvalRegressionDashboardSummary;
  if (dashboard.totalBlockingCases > 0 || dashboard.executionFailureCount > 0) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization still has blocking cases or execution failures.`,
    );
  }

  const nowMs = parseAuthorizationTimestamp(
    "now",
    input.now ?? new Date().toISOString(),
  );
  const expiresAtMs = parseAuthorizationTimestamp(
    "expiresAt",
    authorization.expiresAt,
  );
  if (nowMs > expiresAtMs) {
    throw new Error(
      `Retrieval strategy ${promotedStrategy} cannot become the promoted default because trusted strategy-promotion authorization expired at ${authorization.expiresAt}.`,
    );
  }
}
