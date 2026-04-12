import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AISDKProvider } from "../llm/ai-sdk";
import { normalizeProviderRuntimeMetadata } from "../provider/layer";
import type { EvalAssertionSummary } from "./assertions";
import type { JudgeResult, JudgeScores } from "./judge";
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

export interface EvalRuntimeMetadata {
  generationMode: "live" | "fallback";
  generationLayer?: "fallback" | "vercel-ai-sdk";
  generationModel?: string;
  generationProvider?: AISDKProvider;
  judgeMode: "live" | "fallback";
  judgeLayer?: "fallback" | "vercel-ai-sdk";
  judgeModel?: string;
  judgeProvider?: AISDKProvider;
}

export type PersistedEvalMode = "live" | "fallback";

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

function emptyScores(): JudgeScores {
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

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function roundScores(scores: JudgeScores): JudgeScores {
  return {
    factual_recall: roundMetric(scores.factual_recall),
    preference_consistency: roundMetric(scores.preference_consistency),
    cross_domain_transfer: roundMetric(scores.cross_domain_transfer),
    contamination_penalty: roundMetric(scores.contamination_penalty),
    update_correctness: roundMetric(scores.update_correctness),
    personalization_usefulness: roundMetric(scores.personalization_usefulness),
    provenance_explainability: roundMetric(scores.provenance_explainability),
  };
}

function roundLayerScores(scores: EvalLayerScores): EvalLayerScores {
  return {
    retrieval: roundMetric(scores.retrieval),
    personalization: roundMetric(scores.personalization),
    runtime_governance: roundMetric(scores.runtime_governance),
  };
}

function addScores(target: JudgeScores, source: JudgeScores): JudgeScores {
  return {
    factual_recall: target.factual_recall + source.factual_recall,
    preference_consistency:
      target.preference_consistency + source.preference_consistency,
    cross_domain_transfer:
      target.cross_domain_transfer + source.cross_domain_transfer,
    contamination_penalty:
      target.contamination_penalty + source.contamination_penalty,
    update_correctness:
      target.update_correctness + source.update_correctness,
    personalization_usefulness:
      target.personalization_usefulness + source.personalization_usefulness,
    provenance_explainability:
      target.provenance_explainability + source.provenance_explainability,
  };
}

function divideScores(scores: JudgeScores, divisor: number): JudgeScores {
  return {
    factual_recall: scores.factual_recall / divisor,
    preference_consistency: scores.preference_consistency / divisor,
    cross_domain_transfer: scores.cross_domain_transfer / divisor,
    contamination_penalty: scores.contamination_penalty / divisor,
    update_correctness: scores.update_correctness / divisor,
    personalization_usefulness:
      scores.personalization_usefulness / divisor,
    provenance_explainability:
      scores.provenance_explainability / divisor,
  };
}

function subtractScores(left: JudgeScores, right: JudgeScores): JudgeScores {
  return {
    factual_recall: left.factual_recall - right.factual_recall,
    preference_consistency:
      left.preference_consistency - right.preference_consistency,
    cross_domain_transfer:
      left.cross_domain_transfer - right.cross_domain_transfer,
    contamination_penalty:
      left.contamination_penalty - right.contamination_penalty,
    update_correctness:
      left.update_correctness - right.update_correctness,
    personalization_usefulness:
      left.personalization_usefulness - right.personalization_usefulness,
    provenance_explainability:
      left.provenance_explainability - right.provenance_explainability,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function toLayerScores(scores: JudgeScores): EvalLayerScores {
  return {
    retrieval: average([
      scores.factual_recall,
      scores.provenance_explainability,
    ]),
    personalization: average([
      scores.preference_consistency,
      scores.cross_domain_transfer,
      scores.contamination_penalty,
      scores.update_correctness,
      scores.personalization_usefulness,
    ]),
    runtime_governance: average([
      scores.contamination_penalty,
      scores.update_correctness,
      scores.provenance_explainability,
    ]),
  };
}

function subtractLayerScores(
  left: EvalLayerScores,
  right: EvalLayerScores,
): EvalLayerScores {
  return {
    retrieval: left.retrieval - right.retrieval,
    personalization: left.personalization - right.personalization,
    runtime_governance: left.runtime_governance - right.runtime_governance,
  };
}

function aggregateAssertions(cases: JudgedEvalCase[]): EvalAssertionsAggregate {
  const totalCases = cases.length;
  const passingCases = cases.filter((item) => item.assertions.passed).length;
  const totalChecks = cases.reduce((sum, item) => sum + item.assertions.totalChecks, 0);
  const passingChecks = cases.reduce(
    (sum, item) => sum + item.assertions.passedChecks,
    0,
  );

  return {
    totalCases,
    passingCases,
    passRate: roundMetric(passingCases / Math.max(totalCases, 1)),
    totalChecks,
    passingChecks,
    checkPassRate: roundMetric(passingChecks / Math.max(totalChecks, 1)),
    contaminationFailures: cases.filter(
      (item) => item.assertions.contaminationFindings.length > 0,
    ).length,
    updateFailures: cases.filter((item) => item.assertions.updateFindings.length > 0)
      .length,
  };
}

function resolveComparativeScores(judge: JudgeResult): {
  baseline: JudgeScores;
  goodmemory: JudgeScores;
} {
  return {
    baseline: judge.baseline_scores ?? judge.scores,
    goodmemory: judge.goodmemory_scores ?? judge.scores,
  };
}

function hasFailureTagPrefix(tag: string, prefix: "baseline" | "goodmemory" | "shared"): boolean {
  return tag.startsWith(`${prefix}_`) || tag.startsWith(`${prefix}:`);
}

function resolveBlockingFailureTags(judge: JudgeResult): string[] {
  if (judge.winner !== "goodmemory") {
    return judge.failure_tags;
  }

  return judge.failure_tags.filter((tag) => hasFailureTagPrefix(tag, "goodmemory"));
}

function buildStrategyWinnerCounts() {
  return {
    baseline: 0,
    goodmemory: 0,
    tie: 0,
  };
}

function resolveExecutedStrategyLabel(
  item: JudgedEvalCase,
): Exclude<EvalAnswerPackage["strategyLabel"], "baseline"> {
  return (item.metadata.resolvedStrategyLabel ??
    item.metadata.strategyLabel) as Exclude<
    EvalAnswerPackage["strategyLabel"],
    "baseline"
  >;
}

function isStrategyRegression(caseArtifact: JudgedEvalCase): boolean {
  return (
    caseArtifact.judge.winner !== "goodmemory" ||
    !caseArtifact.assertions.passed ||
    resolveBlockingFailureTags(caseArtifact.judge).length > 0
  );
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function buildStrategySlice(
  cases: JudgedEvalCase[],
  strategyOrder: Array<EvalAnswerPackage["strategyLabel"]>,
): EvalStrategySliceSummary | null {
  const filtered = cases.filter((item) =>
    strategyOrder.includes(resolveExecutedStrategyLabel(item)),
  );
  const presentStrategies = strategyOrder.filter((strategy) =>
    filtered.some((item) => resolveExecutedStrategyLabel(item) === strategy),
  );

  if (presentStrategies.length < 2) {
    return null;
  }

  const scenarioIdsByStrategy = new Map<string, Set<string>>();
  const uniqueScenarioIds = new Set<string>();

  for (const item of filtered) {
    const strategy = resolveExecutedStrategyLabel(item);
    let scenarioIds = scenarioIdsByStrategy.get(strategy);
    if (!scenarioIds) {
      scenarioIds = new Set<string>();
      scenarioIdsByStrategy.set(strategy, scenarioIds);
    }

    scenarioIds.add(item.goodmemory.scenarioId);
    uniqueScenarioIds.add(item.goodmemory.scenarioId);
  }

  const firstScenarioSet = scenarioIdsByStrategy.get(presentStrategies[0]!) ?? new Set();
  const consistentScenarioCoverage = presentStrategies.every((strategy) =>
    setsEqual(scenarioIdsByStrategy.get(strategy) ?? new Set(), firstScenarioSet),
  );

  return {
    strategiesCompared: presentStrategies,
    totalCases: filtered.length,
    uniqueScenarios: uniqueScenarioIds.size,
    consistentScenarioCoverage,
    regressionCases: filtered
      .filter((item) => isStrategyRegression(item))
      .map((item) => item.caseId),
  };
}

function buildStrategySummary(cases: JudgedEvalCase[]): EvalStrategySummary {
  const accumulators = new Map<
    string,
    {
      totalCases: number;
      scenarioIds: Set<string>;
      winnerCounts: EvalStrategyBreakdown["winnerCounts"];
      upliftTotal: JudgeScores;
      regressionCases: string[];
    }
  >();

  for (const item of cases) {
    const strategy = resolveExecutedStrategyLabel(item);
    const comparative = resolveComparativeScores(item.judge);
    const uplift = subtractScores(comparative.goodmemory, comparative.baseline);
    let accumulator = accumulators.get(strategy);

    if (!accumulator) {
      accumulator = {
        totalCases: 0,
        scenarioIds: new Set<string>(),
        winnerCounts: buildStrategyWinnerCounts(),
        upliftTotal: emptyScores(),
        regressionCases: [],
      };
      accumulators.set(strategy, accumulator);
    }

    accumulator.totalCases += 1;
    accumulator.scenarioIds.add(item.goodmemory.scenarioId);
    accumulator.winnerCounts[item.judge.winner] += 1;
    accumulator.upliftTotal = addScores(accumulator.upliftTotal, uplift);
    if (isStrategyRegression(item)) {
      accumulator.regressionCases.push(item.caseId);
    }
  }

  const byStrategy = Object.fromEntries(
    [...accumulators.entries()].map(([strategy, accumulator]) => [
      strategy,
      {
        totalCases: accumulator.totalCases,
        uniqueScenarios: accumulator.scenarioIds.size,
        winnerCounts: accumulator.winnerCounts,
        uplift: roundScores(
          divideScores(accumulator.upliftTotal, Math.max(accumulator.totalCases, 1)),
        ),
        regressionCases: accumulator.regressionCases,
      } satisfies EvalStrategyBreakdown,
    ]),
  );

  return {
    byStrategy,
    embeddingImpact: buildStrategySlice(cases, ["rules-only", "hybrid"]),
    routerImpact: buildStrategySlice(cases, [
      "rules-only",
      "hybrid",
      "llm-assisted",
    ]),
  };
}

export function aggregateJudgedCases(
  cases: JudgedEvalCase[],
  executionFailureCount = 0,
): EvalSuiteSummary {
  const winnerCounts = {
    baseline: 0,
    goodmemory: 0,
    tie: 0,
  };

  let baselineTotal = emptyScores();
  let goodmemoryTotal = emptyScores();

  for (const item of cases) {
    winnerCounts[item.judge.winner] += 1;
    const comparative = resolveComparativeScores(item.judge);
    baselineTotal = addScores(baselineTotal, comparative.baseline);
    goodmemoryTotal = addScores(goodmemoryTotal, comparative.goodmemory);
  }

  const divisor = Math.max(cases.length, 1);
  const baselineAverage = roundScores(divideScores(baselineTotal, divisor));
  const goodmemoryAverage = roundScores(divideScores(goodmemoryTotal, divisor));
  const baselineLayers = roundLayerScores(toLayerScores(baselineAverage));
  const goodmemoryLayers = roundLayerScores(toLayerScores(goodmemoryAverage));
  const uplift = roundScores(subtractScores(goodmemoryAverage, baselineAverage));
  const upliftLayers = roundLayerScores(
    subtractLayerScores(goodmemoryLayers, baselineLayers),
  );

  return {
    totalCases: cases.length + executionFailureCount,
    completedCases: cases.length,
    executionFailures: executionFailureCount,
    winnerCounts,
    baselineAverage,
    goodmemoryAverage,
    uplift,
    layers: {
      baseline: baselineLayers,
      goodmemory: goodmemoryLayers,
      uplift: upliftLayers,
    },
    assertions: aggregateAssertions(cases),
    strategySummary: buildStrategySummary(cases),
  };
}

export async function persistEvalArtifacts(input: {
  mode: PersistedEvalMode;
  outputDir: string;
  runId: string;
  summary: EvalSuiteSummary;
  runtime: EvalRuntimeMetadata;
  cases: JudgedEvalCase[];
  executionFailures?: EvalCaseExecutionFailure[];
}): Promise<{ runDirectory: string }> {
  const runtime = normalizeProviderRuntimeMetadata(input.runtime);
  const runDirectory = join(input.outputDir, input.runId);
  const casesDirectory = join(runDirectory, "cases");
  const failuresDirectory = join(runDirectory, "failures");
  const tracesDirectory = join(runDirectory, "traces");

  await mkdir(casesDirectory, { recursive: true });
  await mkdir(failuresDirectory, { recursive: true });
  await mkdir(tracesDirectory, { recursive: true });

  await writeFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(
      {
        mode: input.mode,
        runId: input.runId,
        summary: input.summary,
        runtime,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const failedCases: Array<{
    caseId: string;
    path: string;
    kind: "judged" | "execution";
    winner: JudgeResult["winner"];
    failureTags: string[];
    lastError?: string;
    attemptCount?: number;
  }> = [];

  for (const item of input.cases) {
    const caseTraceDirectory = join(tracesDirectory, item.caseId);
    await mkdir(caseTraceDirectory, { recursive: true });

    await writeFile(
      join(casesDirectory, `${item.caseId}.json`),
      `${JSON.stringify(item, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "baseline.json"),
      `${JSON.stringify(item.baseline, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "goodmemory.json"),
      `${JSON.stringify(item.goodmemory, null, 2)}\n`,
      "utf8",
    );
    if (item.goodmemory.retrieved) {
      await writeFile(
        join(caseTraceDirectory, "raw-recall.json"),
        `${JSON.stringify(item.goodmemory.retrieved, null, 2)}\n`,
        "utf8",
      );
    }
    if (item.goodmemory.memoryContext) {
      await writeFile(
        join(caseTraceDirectory, "built-context.md"),
        `${item.goodmemory.memoryContext}\n`,
        "utf8",
      );
    }
    await writeFile(
      join(caseTraceDirectory, "remember-trace.json"),
      `${JSON.stringify(item.goodmemory.trace.rememberEvents, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "feedback-trace.json"),
      `${JSON.stringify(item.goodmemory.trace.feedbackEvents, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "context-build.json"),
      `${JSON.stringify(item.goodmemory.trace.contextBuild, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "judge.json"),
      `${JSON.stringify(item.judge, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "assertions.json"),
      `${JSON.stringify(item.assertions, null, 2)}\n`,
      "utf8",
    );

    const blockingFailureTags = resolveBlockingFailureTags(item.judge);
    const failed =
      item.judge.winner !== "goodmemory" ||
      blockingFailureTags.length > 0 ||
      !item.assertions.passed;

    if (!failed) {
      continue;
    }

    await writeFile(
      join(failuresDirectory, `${item.caseId}.json`),
      `${JSON.stringify(item, null, 2)}\n`,
      "utf8",
    );
      failedCases.push({
      caseId: item.caseId,
      path: join(failuresDirectory, `${item.caseId}.json`),
      kind: "judged",
      winner: item.judge.winner,
      failureTags: [
        ...blockingFailureTags,
        ...item.assertions.checks
          .filter((check) => !check.passed)
          .map((check) => `assertion:${check.id}`),
      ],
    });
  }

  for (const failure of input.executionFailures ?? []) {
    const path = join(failuresDirectory, `${failure.caseId}.execution.json`);

    await writeFile(
      path,
      `${JSON.stringify(failure, null, 2)}\n`,
      "utf8",
    );
    failedCases.push({
      caseId: failure.caseId,
      path,
      kind: "execution",
      winner: "baseline",
      failureTags: ["execution:retry_exhausted"],
      lastError: failure.lastError,
      attemptCount: failure.attempts.length,
    });
  }

  await writeFile(
    join(failuresDirectory, "summary.json"),
    `${JSON.stringify(
      {
        mode: input.mode,
        runId: input.runId,
        totalFailures: failedCases.length,
        failedCases,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    runDirectory,
  };
}
