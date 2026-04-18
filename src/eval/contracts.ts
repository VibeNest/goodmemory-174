import type {
  PromotionDecision,
  PromotionGateOutcome,
} from "../evolution/contracts";
import type {
  ProviderExecutionMode,
  ProviderRuntimeMetadata,
} from "../provider/contracts";
import type { EvalAssertionSummary } from "./assertions";
import type {
  JudgeResult,
  JudgeScores,
} from "./judge";
import type { EvalAnswerPackage } from "./runners";
import type {
  StrategyRolloutFamily,
  StrategyRolloutMetadata,
  StrategyRolloutMode,
} from "./strategy-rollout";

export interface EvalLayerScores {
  retrieval: number;
  personalization: number;
  runtime_governance: number;
}

export interface EvalAssertionsAggregate {
  totalCases: number;
  passingCases: number;
  passRate: number;
  totalChecks: number;
  passingChecks: number;
  checkPassRate: number;
  applicableStaleSuppressionCases: number;
  applicableUpdateCases: number;
  contaminationFailures: number;
  staleMisuseCases: number;
  staleMisuseRate: number;
  staleSuppressionCases: number;
  staleSuppressionRate: number;
  updateWinCases: number;
  updateWinRate: number;
  updateFailures: number;
}

export interface JudgedEvalCase {
  caseId: string;
  metadata: {
    taskFamily: EvalAnswerPackage["taskFamily"];
    targetDomain: string;
    memorySourceDomains: string[];
    evaluationSetting: EvalAnswerPackage["evaluationSetting"];
    strategyLabel: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
    resolvedStrategyLabel?: Exclude<
      EvalAnswerPackage["resolvedStrategyLabel"],
      "baseline"
    >;
    strategyFamily?: EvalAnswerPackage["strategyFamily"];
    strategyMode?: EvalAnswerPackage["strategyMode"];
    promotedStrategyLabel?: EvalAnswerPackage["promotedStrategyLabel"];
  };
  baseline: EvalAnswerPackage;
  goodmemory: EvalAnswerPackage;
  shadow?: EvalAnswerPackage;
  judge: JudgeResult;
  assertions: EvalAssertionSummary;
}

export interface EvalStrategyBreakdown {
  totalCases: number;
  uniqueScenarios: number;
  winnerCounts: {
    baseline: number;
    goodmemory: number;
    tie: number;
  };
  uplift: JudgeScores;
  regressionCases: string[];
}

export interface EvalStrategySliceSummary {
  strategiesCompared: Array<EvalAnswerPackage["strategyLabel"]>;
  totalCases: number;
  uniqueScenarios: number;
  consistentScenarioCoverage: boolean;
  regressionCases: string[];
}

export interface EvalStrategySummary {
  byStrategy: Record<string, EvalStrategyBreakdown>;
  embeddingImpact: EvalStrategySliceSummary | null;
  routerImpact: EvalStrategySliceSummary | null;
}

export interface EvalStrategyRegressionSummary {
  strategyLabel: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
  totalCases: number;
  attemptedCaseCount: number;
  regressionCaseCount: number;
  executionFailureCaseCount: number;
  blockingCaseCount: number;
  regressionRate: number;
  blockingRate: number;
  regressionCases: string[];
  executionFailureCases: string[];
}

export interface EvalRegressionDashboardSummary {
  totalRegressionCases: number;
  totalBlockingCases: number;
  judgedRegressionCases: number;
  executionFailureCount: number;
  unattributedExecutionFailureCount: number;
  strategyRegressions: EvalStrategyRegressionSummary[];
  gate?: {
    family: StrategyRolloutFamily;
    mode: StrategyRolloutMode;
    targetStrategyLabel?: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
    promotedStrategyLabel?: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
    decision: PromotionDecision;
    outcome: PromotionGateOutcome;
    regressionCaseCount: number;
  };
}

export interface EvalMaintenanceSummary {
  averageActiveValidatedPatterns: number;
  averageCompiledValidatedPatterns: number;
  averageCorrectionRepairs: number;
  averageDemotedFacts: number;
  averagePressuredFacts: number;
  casesWithAcceptedProceduralPromotions: number;
  casesWithCompiledProceduralReuse: number;
  casesWithCorrectionRepairs: number;
  casesWithDemotions: number;
  casesWithProceduralReuse: number;
  casesWithVerificationPressure: number;
}

export interface EvalOutcomeLoopSummary {
  acceptedProceduralPromotionCases: number;
  applicableCorrectionCases: number;
  applicableProceduralReuseCases: number;
  applicableStaleSuppressionCases: number;
  correctionWinCases: number;
  correctionWinRate: number;
  governedProceduralReuseCases: number;
  governedProceduralReuseRate: number;
  staleMisuseCases: number;
  staleMisuseRate: number;
  staleSuppressionCases: number;
  staleSuppressionRate: number;
}

export interface EvalShadowSummary {
  totalCases: number;
  byFamily: Partial<Record<StrategyRolloutFamily, number>>;
  byMode: Partial<Record<StrategyRolloutMode, number>>;
  candidateInfluencedCases: number;
  safeObserveCases: number;
  unknownObserveCases: number;
  regressionCases: string[];
}

export type EvalShadowExecutionPathSource =
  | "candidate"
  | "promoted_or_default"
  | "unknown";

export interface EvalShadowComparisonRow {
  caseId: string;
  scenarioId: string;
  strategyFamily: StrategyRolloutFamily;
  strategyMode: StrategyRolloutMode;
  requestedStrategyLabel: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
  executedStrategyLabel: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
  shadowResolvedStrategyLabel?: Exclude<
    EvalAnswerPackage["strategyLabel"],
    "baseline"
  >;
  promotedStrategyLabel?: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
  comparisonTarget: "executed-path";
  executedPathSource: EvalShadowExecutionPathSource;
  candidateInfluencedExecution?: boolean;
  winner: JudgeResult["winner"];
  assertionsPassed: boolean;
  artifactPaths: {
    baselineTrace: string;
    executedTrace: string;
    shadowTrace?: string;
    shadowRawRecall?: string;
    rawRecall?: string;
    judge: string;
    assertions: string;
  };
}

export interface EvalStrategyPromotionGateThresholds {
  requireKnownObserveSafety: boolean;
  requireNoRegressions: boolean;
  requirePassingAssertions: boolean;
  requirePositivePrimaryUplift: boolean;
}

export interface EvalStrategyPromotionGateDecision {
  family: StrategyRolloutFamily;
  mode: StrategyRolloutMode;
  targetStrategyLabel?: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
  promotedStrategyLabel?: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
  decision: PromotionDecision;
  outcome: PromotionGateOutcome;
  rationale: string;
  regressionCases: string[];
  thresholds: EvalStrategyPromotionGateThresholds;
  evidence: {
    assertionPassRate: number;
    candidateInfluencedCases?: number;
    completedCases?: number;
    executionFailures?: number;
    positivePrimaryUplift?: boolean;
    safeObserveCases?: number;
    totalCases: number;
    unknownObserveCases?: number;
  };
}

export interface EvalSuiteSummary {
  totalCases: number;
  completedCases?: number;
  executionFailures?: number;
  winnerCounts: {
    baseline: number;
    goodmemory: number;
    tie: number;
  };
  goodmemoryAverage: JudgeScores;
  baselineAverage: JudgeScores;
  uplift: JudgeScores;
  layers: {
    baseline: EvalLayerScores;
    goodmemory: EvalLayerScores;
    uplift: EvalLayerScores;
  };
  assertions: EvalAssertionsAggregate;
  outcomeLoopSummary?: EvalOutcomeLoopSummary;
  promotionGate?: EvalStrategyPromotionGateDecision;
  regressionDashboardSummary?: EvalRegressionDashboardSummary;
  shadowSummary?: EvalShadowSummary;
  strategySummary: EvalStrategySummary;
  maintenanceSummary?: EvalMaintenanceSummary;
}

export interface EvalRuntimeMetadata extends ProviderRuntimeMetadata {
  strategyRollout?: StrategyRolloutMetadata;
}

export type PersistedEvalMode = ProviderExecutionMode;

export type EvalCaseExecutionFailureStage =
  | "unknown"
  | "baseline_execution"
  | "primary_setup"
  | "primary_pre_recall"
  | "primary_execution"
  | "shadow_setup"
  | "shadow_pre_recall"
  | "shadow_execution"
  | "judge"
  | "cleanup";

export interface EvalCaseExecutionFailure {
  caseId: string;
  failureStage: EvalCaseExecutionFailureStage;
  metadata: {
    taskFamily: EvalAnswerPackage["taskFamily"];
    targetDomain: string;
    memorySourceDomains: string[];
    evaluationSetting: EvalAnswerPackage["evaluationSetting"];
    strategyLabel: Exclude<EvalAnswerPackage["strategyLabel"], "baseline">;
    resolvedStrategyLabel?: Exclude<
      EvalAnswerPackage["resolvedStrategyLabel"],
      "baseline"
    >;
    strategyFamily?: EvalAnswerPackage["strategyFamily"];
    strategyMode?: EvalAnswerPackage["strategyMode"];
    promotedStrategyLabel?: EvalAnswerPackage["promotedStrategyLabel"];
  };
  retryLimit: number;
  attempts: Array<{
    attempt: number;
    error: string;
  }>;
  lastError: string;
}
