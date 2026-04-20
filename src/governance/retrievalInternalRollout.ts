import type {
  PromotionDecision,
  PromotionGateOutcome,
} from "../evolution/contracts";
import type { RecallRouterStrategy } from "../recall/router";

export type StrategyRolloutMode = "observe" | "assist" | "promote";
export type PromotedRecallRouterStrategy = Exclude<
  RecallRouterStrategy,
  "auto"
>;

export const DEFAULT_PROMOTED_RETRIEVAL_STRATEGY = "rules-only";

export interface RetrievalStrategyPromotionAuthorization {
  expiresAt: string;
  family: "retrieval";
  issuedAt: string;
  pairedObserve: {
    promotionGate: {
      decision: PromotionDecision;
      outcome: PromotionGateOutcome;
      promotedStrategyLabel?: PromotedRecallRouterStrategy;
      targetStrategyLabel?: PromotedRecallRouterStrategy;
    };
    source: {
      runDirectory?: string;
      runId: string;
    };
    summary: {
      assertionPassRate: number;
      completedCases: number;
      executionFailures: number;
      regressionCases: string[];
      safeObserveCases: number;
      totalCases: number;
      unknownObserveCases: number;
    };
  };
  promotionGate: {
    decision: PromotionDecision;
    outcome: PromotionGateOutcome;
    promotedStrategyLabel?: PromotedRecallRouterStrategy;
    targetStrategyLabel?: PromotedRecallRouterStrategy;
  };
  publicSurfaceDecision: {
    surfaces: Array<{
      decision: PromotionDecision;
      exposure: "advanced" | "internal" | "public";
      surface:
        | "core_config"
        | "eval_artifact_cli"
        | "official_memory_cli"
        | "strategy_rollout_config"
        | "promotion_gate_runtime"
        | "evolution_namespace";
    }>;
  };
  regressionDashboardSummary: {
    executionFailureCount: number;
    totalBlockingCases: number;
  };
  source: {
    generatedBy: string;
    runDirectory?: string;
    runId: string;
  };
  targetStrategyLabel: PromotedRecallRouterStrategy;
}

export interface RetrievalStrategyRolloutConfig {
  family?: "retrieval";
  mode?: StrategyRolloutMode;
  promotedStrategy?: PromotedRecallRouterStrategy;
  promotionAuthorization?: RetrievalStrategyPromotionAuthorization;
}

interface RetrievalPromotionAuthorizationRollout {
  family?: string;
  mode?: string;
  promotedStrategy?: string;
  promotionAuthorization?: unknown;
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
  decision: RetrievalStrategyPromotionAuthorization["publicSurfaceDecision"],
  surface: RetrievalStrategyPromotionAuthorization["publicSurfaceDecision"]["surfaces"][number]["surface"],
) {
  return decision.surfaces.find((entry) => entry.surface === surface);
}

export function assertRetrievalPromotionAuthorizationAllowsDefaultRollout(input: {
  now?: string;
  rollout?: RetrievalPromotionAuthorizationRollout;
}): void {
  if (!input.rollout) {
    return;
  }

  if ((input.rollout.family ?? "retrieval") !== "retrieval") {
    return;
  }

  const rollout = input.rollout as RetrievalStrategyRolloutConfig;
  const mode = rollout.mode ?? "promote";
  const promotedStrategy =
    rollout.promotedStrategy ?? DEFAULT_PROMOTED_RETRIEVAL_STRATEGY;

  if (
    mode !== "promote" ||
    promotedStrategy === DEFAULT_PROMOTED_RETRIEVAL_STRATEGY
  ) {
    return;
  }

  const authorization = rollout.promotionAuthorization;
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
    authorization.publicSurfaceDecision,
    "strategy_rollout_config",
  );
  const promotionGateSurface = findPublicSurfaceDecision(
    authorization.publicSurfaceDecision,
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

  const dashboard = authorization.regressionDashboardSummary;
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
