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
  contaminationFailures: number;
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
  strategySummary: EvalStrategySummary;
}

export type EvalRuntimeMetadata = ProviderRuntimeMetadata;

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
