import type { RecallRouterStrategy } from "../recall/router";
import type {
  PromotionDecision,
  PromotionGateOutcome,
} from "../evolution/contracts";
import {
  DEFAULT_PROMOTED_RETRIEVAL_STRATEGY,
} from "../governance/retrievalInternalRollout";
import type {
  PromotedRecallRouterStrategy,
  RetrievalStrategyPromotionAuthorization,
  RetrievalStrategyRolloutConfig,
  StrategyRolloutMode,
} from "../governance/retrievalInternalRollout";

export {
  DEFAULT_PROMOTED_RETRIEVAL_STRATEGY,
} from "../governance/retrievalInternalRollout";
export type {
  PromotedRecallRouterStrategy,
  RetrievalStrategyPromotionAuthorization,
  RetrievalStrategyRolloutConfig,
  StrategyRolloutMode,
} from "../governance/retrievalInternalRollout";

export type StrategyRolloutFamily = "retrieval" | "reviewer" | "maintenance";
export type ReviewerStrategyLabel = "rules-only" | "assisted";
export type MaintenanceStrategyLabel = "default-hygiene" | "outcome-aware";
export type StrategyRolloutLabel =
  | PromotedRecallRouterStrategy
  | ReviewerStrategyLabel
  | MaintenanceStrategyLabel;
export type EvalNonBaselineStrategyLabel = Exclude<StrategyRolloutLabel, "auto">;

export interface FamilyStrategyPromotionAuthorization<
  TFamily extends "reviewer" | "maintenance",
  TLabel extends ReviewerStrategyLabel | MaintenanceStrategyLabel,
> {
  expiresAt: string;
  family: TFamily;
  issuedAt: string;
  promotionGate: {
    decision: PromotionDecision;
    outcome: PromotionGateOutcome;
    promotedStrategyLabel?: TLabel;
    targetStrategyLabel?: TLabel;
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
  targetStrategyLabel: TLabel;
}

export type ReviewerStrategyPromotionAuthorization =
  FamilyStrategyPromotionAuthorization<"reviewer", ReviewerStrategyLabel>;

export type MaintenanceStrategyPromotionAuthorization =
  FamilyStrategyPromotionAuthorization<"maintenance", MaintenanceStrategyLabel>;

export interface StrategyRolloutMetadata {
  family: StrategyRolloutFamily;
  mode: StrategyRolloutMode;
  promotedStrategyLabel?: StrategyRolloutLabel;
}

export interface ReviewerStrategyRolloutConfig {
  family: "reviewer";
  mode?: StrategyRolloutMode;
  promotedStrategy?: ReviewerStrategyLabel;
  promotionAuthorization?: ReviewerStrategyPromotionAuthorization;
}

export interface MaintenanceStrategyRolloutConfig {
  family: "maintenance";
  mode?: StrategyRolloutMode;
  promotedStrategy?: MaintenanceStrategyLabel;
  promotionAuthorization?: MaintenanceStrategyPromotionAuthorization;
}

export type StrategyRolloutConfig =
  | RetrievalStrategyRolloutConfig
  | ReviewerStrategyRolloutConfig
  | MaintenanceStrategyRolloutConfig;

export interface RetrievalStrategyRolloutDecision {
  family?: "retrieval";
  mode?: StrategyRolloutMode;
  requestedStrategyLabel: RecallRouterStrategy;
  promotedStrategyLabel?: PromotedRecallRouterStrategy;
  candidateStrategyLabel?: RecallRouterStrategy;
  executedStrategy: RecallRouterStrategy;
  candidateInfluencedExecution?: boolean;
  runtimeAppliesPromotion?: boolean;
}

export interface ReviewerStrategyRolloutDecision {
  family: "reviewer";
  mode: StrategyRolloutMode;
  requestedStrategyLabel: ReviewerStrategyLabel;
  promotedStrategyLabel: ReviewerStrategyLabel;
  candidateStrategyLabel?: ReviewerStrategyLabel;
  executedStrategyLabel: ReviewerStrategyLabel;
  candidateInfluencedExecution?: boolean;
}

export interface MaintenanceStrategyRolloutDecision {
  family: "maintenance";
  mode: StrategyRolloutMode;
  requestedStrategyLabel: MaintenanceStrategyLabel;
  promotedStrategyLabel: MaintenanceStrategyLabel;
  candidateStrategyLabel?: MaintenanceStrategyLabel;
  executedStrategyLabel: MaintenanceStrategyLabel;
  candidateInfluencedExecution?: boolean;
}

export const DEFAULT_PROMOTED_REVIEWER_STRATEGY = "rules-only";
export const DEFAULT_PROMOTED_MAINTENANCE_STRATEGY = "default-hygiene";
export const REVIEWER_CANDIDATE_STRATEGY = "assisted";
export const MAINTENANCE_CANDIDATE_STRATEGY = "outcome-aware";

function resolveDefaultPromotedStrategy(
  family: StrategyRolloutFamily,
): StrategyRolloutLabel {
  if (family === "maintenance") {
    return DEFAULT_PROMOTED_MAINTENANCE_STRATEGY;
  }

  if (family === "reviewer") {
    return DEFAULT_PROMOTED_REVIEWER_STRATEGY;
  }

  return DEFAULT_PROMOTED_RETRIEVAL_STRATEGY;
}

export function buildStrategyRolloutMetadata(
  rollout?: StrategyRolloutConfig,
): StrategyRolloutMetadata | undefined {
  if (!rollout) {
    return undefined;
  }

  const family = rollout.family ?? "retrieval";

  return {
    family,
    mode: rollout.mode ?? "promote",
    promotedStrategyLabel:
      rollout.promotedStrategy ?? resolveDefaultPromotedStrategy(family),
  };
}

export function normalizeStrategyRolloutMetadata(
  metadata?: StrategyRolloutMetadata,
): StrategyRolloutMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    family: metadata.family,
    mode: metadata.mode,
    promotedStrategyLabel:
      metadata.promotedStrategyLabel ??
      resolveDefaultPromotedStrategy(metadata.family),
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
    promotedStrategy:
      (metadata.promotedStrategyLabel as PromotedRecallRouterStrategy | undefined) ??
      DEFAULT_PROMOTED_RETRIEVAL_STRATEGY,
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

  const mode = input.rollout.mode ?? "promote";
  const promotedStrategyLabel =
    input.rollout.promotedStrategy ?? DEFAULT_PROMOTED_RETRIEVAL_STRATEGY;
  const candidateStrategyLabel =
    input.requestedStrategy && input.requestedStrategy !== "auto"
      ? input.requestedStrategy
      : undefined;
  const runtimePromotedDefault =
    mode === "promote" &&
    promotedStrategyLabel !== DEFAULT_PROMOTED_RETRIEVAL_STRATEGY;

  if (runtimePromotedDefault) {
    if (candidateStrategyLabel) {
      return {
        family: "retrieval",
        mode,
        requestedStrategyLabel,
        promotedStrategyLabel,
        candidateStrategyLabel,
        executedStrategy: candidateStrategyLabel,
        candidateInfluencedExecution: false,
        runtimeAppliesPromotion: false,
      };
    }

    return {
      family: "retrieval",
      mode,
      requestedStrategyLabel,
      promotedStrategyLabel,
      executedStrategy: "auto",
      runtimeAppliesPromotion: true,
    };
  }

  if (mode === "assist" && candidateStrategyLabel) {
    return {
      family: "retrieval",
      mode,
      requestedStrategyLabel,
      promotedStrategyLabel,
      candidateStrategyLabel,
      executedStrategy: candidateStrategyLabel,
      candidateInfluencedExecution: true,
    };
  }

  return {
    family: "retrieval",
    mode,
    requestedStrategyLabel,
    promotedStrategyLabel,
    candidateStrategyLabel,
    executedStrategy: promotedStrategyLabel,
    candidateInfluencedExecution: false,
  };
}

function resolveCandidateLabel<TLabel extends StrategyRolloutLabel>(
  promotedStrategyLabel: TLabel,
  candidateStrategyLabel: TLabel,
): TLabel | undefined {
  return promotedStrategyLabel === candidateStrategyLabel
    ? undefined
    : candidateStrategyLabel;
}

function resolveRequestedStrategyLabel<TLabel extends StrategyRolloutLabel>(
  mode: StrategyRolloutMode,
  promotedStrategyLabel: TLabel,
  candidateStrategyLabel?: TLabel,
): TLabel {
  if (mode === "promote" || !candidateStrategyLabel) {
    return promotedStrategyLabel;
  }

  return candidateStrategyLabel;
}

function resolveExecutedStrategyLabel<TLabel extends StrategyRolloutLabel>(
  mode: StrategyRolloutMode,
  promotedStrategyLabel: TLabel,
  candidateStrategyLabel?: TLabel,
): TLabel {
  if (mode === "assist" && candidateStrategyLabel) {
    return candidateStrategyLabel;
  }

  return promotedStrategyLabel;
}

export function resolveReviewerStrategyRollout(
  rollout?: ReviewerStrategyRolloutConfig,
): ReviewerStrategyRolloutDecision | undefined {
  if (!rollout) {
    return undefined;
  }

  const mode = rollout.mode ?? "promote";
  const promotedStrategyLabel =
    rollout.promotedStrategy ?? DEFAULT_PROMOTED_REVIEWER_STRATEGY;
  const candidateStrategyLabel = resolveCandidateLabel(
    promotedStrategyLabel,
    REVIEWER_CANDIDATE_STRATEGY,
  );

  return {
    family: "reviewer",
    mode,
    requestedStrategyLabel: resolveRequestedStrategyLabel(
      mode,
      promotedStrategyLabel,
      candidateStrategyLabel,
    ),
    promotedStrategyLabel,
    candidateStrategyLabel,
    executedStrategyLabel: resolveExecutedStrategyLabel(
      mode,
      promotedStrategyLabel,
      candidateStrategyLabel,
    ),
    candidateInfluencedExecution:
      mode === "assist" && candidateStrategyLabel ? true : false,
  };
}

export function resolveMaintenanceStrategyRollout(
  rollout?: MaintenanceStrategyRolloutConfig,
): MaintenanceStrategyRolloutDecision | undefined {
  if (!rollout) {
    return undefined;
  }

  const mode = rollout.mode ?? "promote";
  const promotedStrategyLabel =
    rollout.promotedStrategy ?? DEFAULT_PROMOTED_MAINTENANCE_STRATEGY;
  const candidateStrategyLabel = resolveCandidateLabel(
    promotedStrategyLabel,
    MAINTENANCE_CANDIDATE_STRATEGY,
  );

  return {
    family: "maintenance",
    mode,
    requestedStrategyLabel: resolveRequestedStrategyLabel(
      mode,
      promotedStrategyLabel,
      candidateStrategyLabel,
    ),
    promotedStrategyLabel,
    candidateStrategyLabel,
    executedStrategyLabel: resolveExecutedStrategyLabel(
      mode,
      promotedStrategyLabel,
      candidateStrategyLabel,
    ),
    candidateInfluencedExecution:
      mode === "assist" && candidateStrategyLabel ? true : false,
  };
}
