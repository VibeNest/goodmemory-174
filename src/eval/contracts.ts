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
import type { StrategyRolloutMetadata } from "./strategy-rollout";

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
    strategyLabel: EvalAnswerPackage["strategyLabel"];
    resolvedStrategyLabel?: EvalAnswerPackage["resolvedStrategyLabel"];
    strategyFamily?: EvalAnswerPackage["strategyFamily"];
    strategyMode?: EvalAnswerPackage["strategyMode"];
    promotedStrategyLabel?: EvalAnswerPackage["promotedStrategyLabel"];
  };
  baseline: EvalAnswerPackage;
  goodmemory: EvalAnswerPackage;
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
  strategySummary: EvalStrategySummary;
  maintenanceSummary?: EvalMaintenanceSummary;
}

export interface EvalRuntimeMetadata extends ProviderRuntimeMetadata {
  strategyRollout?: StrategyRolloutMetadata;
}

export type PersistedEvalMode = ProviderExecutionMode;

export interface EvalCaseExecutionFailure {
  caseId: string;
  metadata: {
    taskFamily: EvalAnswerPackage["taskFamily"];
    targetDomain: string;
    memorySourceDomains: string[];
    evaluationSetting: EvalAnswerPackage["evaluationSetting"];
  };
  retryLimit: number;
  attempts: Array<{
    attempt: number;
    error: string;
  }>;
  lastError: string;
}
