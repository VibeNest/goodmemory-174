import type { RecallRouterStrategy } from "../recall/router";
import type {
  PromotionDecision,
  PromotionGateOutcome,
} from "../evolution/contracts";

export type StrategyRolloutFamily = "retrieval" | "reviewer" | "maintenance";
export type StrategyRolloutMode = "observe" | "assist" | "promote";
type PromotedRecallRouterStrategy = Exclude<RecallRouterStrategy, "auto">;

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

export interface StrategyRolloutMetadata {
  family: StrategyRolloutFamily;
  mode: StrategyRolloutMode;
  promotedStrategyLabel?: PromotedRecallRouterStrategy;
}

export interface RetrievalStrategyRolloutConfig {
  family?: "retrieval";
  mode?: StrategyRolloutMode;
  promotedStrategy?: PromotedRecallRouterStrategy;
  promotionAuthorization?: RetrievalStrategyPromotionAuthorization;
}

export interface RetrievalStrategyRolloutDecision {
  family?: "retrieval";
  mode?: StrategyRolloutMode;
  requestedStrategyLabel: RecallRouterStrategy;
  promotedStrategyLabel?: PromotedRecallRouterStrategy;
  candidateStrategyLabel?: RecallRouterStrategy;
  executedStrategy: RecallRouterStrategy;
  candidateInfluencedExecution?: boolean;
}

export const DEFAULT_PROMOTED_RETRIEVAL_STRATEGY = "rules-only";

export function buildStrategyRolloutMetadata(
  rollout?: RetrievalStrategyRolloutConfig,
): StrategyRolloutMetadata | undefined {
  if (!rollout) {
    return undefined;
  }

  return {
    family: rollout?.family ?? "retrieval",
    mode: rollout?.mode ?? "promote",
    promotedStrategyLabel:
      rollout?.promotedStrategy ?? DEFAULT_PROMOTED_RETRIEVAL_STRATEGY,
  };
}

export function buildRetrievalStrategyRolloutConfig(
  metadata?: StrategyRolloutMetadata,
): RetrievalStrategyRolloutConfig | undefined {
  if (!metadata || metadata.family !== "retrieval") {
    return undefined;
  }

  return {
    family: "retrieval",
    mode: metadata.mode,
    promotedStrategy: metadata.promotedStrategyLabel,
  };
}

export function resolveRetrievalStrategyRollout(input: {
  requestedStrategy?: RecallRouterStrategy;
  rollout?: RetrievalStrategyRolloutConfig;
}): RetrievalStrategyRolloutDecision {
  const requestedStrategyLabel = input.requestedStrategy ?? "auto";
  if (!input.rollout) {
    return {
      requestedStrategyLabel,
      executedStrategy: requestedStrategyLabel,
    };
  }

  const metadata = buildStrategyRolloutMetadata(input.rollout);
  const promotedStrategyLabel =
    metadata?.promotedStrategyLabel ?? DEFAULT_PROMOTED_RETRIEVAL_STRATEGY;
  const candidateStrategyLabel =
    input.requestedStrategy && input.requestedStrategy !== "auto"
      ? input.requestedStrategy
      : undefined;

  if (metadata?.mode === "assist" && candidateStrategyLabel) {
    return {
      family: "retrieval",
      mode: metadata.mode,
      requestedStrategyLabel,
      promotedStrategyLabel,
      candidateStrategyLabel,
      executedStrategy: candidateStrategyLabel,
      candidateInfluencedExecution: true,
    };
  }

  return {
    family: "retrieval",
    mode: metadata?.mode ?? "promote",
    requestedStrategyLabel,
    promotedStrategyLabel,
    candidateStrategyLabel,
    executedStrategy: promotedStrategyLabel,
    candidateInfluencedExecution: false,
  };
}
