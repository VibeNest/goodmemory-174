import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeProviderRuntimeMetadata } from "../provider/layer";
import type {
  EvalAssertionsAggregate,
  EvalCaseExecutionFailure,
  EvalLayerScores,
  EvalRuntimeMetadata,
  EvalStrategyBreakdown,
  EvalStrategySliceSummary,
  EvalStrategySummary,
  EvalSuiteSummary,
  JudgedEvalCase,
  PersistedEvalMode,
} from "./contracts";
import type {
  JudgeResult,
  JudgeScores,
} from "./judge";
import type { EvalAnswerPackage } from "./runners";

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
  let applicableUpdateCases = 0;
  let updateWinCases = 0;
  let applicableStaleSuppressionCases = 0;
  let staleSuppressionCases = 0;

  for (const item of cases) {
    const updateCheck = item.assertions.checks.find(
      (check) => check.id === "update_wins_present",
    );
    if (updateCheck && updateCheck.details.length > 0) {
      applicableUpdateCases += 1;
      if (updateCheck.passed) {
        updateWinCases += 1;
      }
    }

    const staleSuppressionCheck = item.assertions.checks.find(
      (check) => check.id === "stale_suppression_absent",
    );
    if (staleSuppressionCheck && staleSuppressionCheck.details.length > 0) {
      applicableStaleSuppressionCases += 1;
      if (staleSuppressionCheck.passed) {
        staleSuppressionCases += 1;
      }
    }
  }

  const staleMisuseCases =
    applicableStaleSuppressionCases - staleSuppressionCases;

  return {
    totalCases,
    passingCases,
    passRate: roundMetric(passingCases / Math.max(totalCases, 1)),
    totalChecks,
    passingChecks,
    checkPassRate: roundMetric(passingChecks / Math.max(totalChecks, 1)),
    applicableUpdateCases,
    updateWinCases,
    updateWinRate: roundMetric(
      updateWinCases / Math.max(applicableUpdateCases, 1),
    ),
    applicableStaleSuppressionCases,
    staleSuppressionCases,
    staleSuppressionRate: roundMetric(
      staleSuppressionCases / Math.max(applicableStaleSuppressionCases, 1),
    ),
    staleMisuseCases,
    staleMisuseRate: roundMetric(
      staleMisuseCases / Math.max(applicableStaleSuppressionCases, 1),
    ),
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

const LEGACY_BLOCKING_GOODMEMORY_TAG_PATTERNS = [
  /(?:^|[_:])(?:internal_)?thought_leak(?:$|[_:])/,
  /(?:^|[_:])memory_leak(?:$|[_:])/,
  /(?:^|[_:])wrong_personalization(?:$|[_:])/,
  /(?:^|[_:])contamination(?:$|[_:])/,
  /(?:^|[_:])privacy(?:$|[_:])/,
  /(?:^|[_:])unsafe(?:$|[_:])/,
  /(?:^|[_:])(?:missed|rejected|ignored)_(?:update|override)(?:$|[_:])/,
  /(?:^|[_:])hallucin(?:ation|ated|ates)?(?:$|[_:])/,
  /(?:^|[_:])fabricat(?:e|ed|ion)(?:$|[_:])/,
] as const;

function isLegacyBlockingGoodMemoryTag(tag: string): boolean {
  if (!hasFailureTagPrefix(tag, "goodmemory")) {
    return false;
  }

  const normalizedTag = tag.replace(/^goodmemory[:_]/, "");
  return LEGACY_BLOCKING_GOODMEMORY_TAG_PATTERNS.some((pattern) =>
    pattern.test(normalizedTag),
  );
}

function resolveBlockingFailureTags(judge: JudgeResult): string[] {
  if (judge.blocking_failure_tags !== undefined) {
    if (judge.winner !== "goodmemory") {
      return judge.blocking_failure_tags;
    }

    return judge.blocking_failure_tags.filter((tag) =>
      hasFailureTagPrefix(tag, "goodmemory") || hasFailureTagPrefix(tag, "shared"),
    );
  }

  if (judge.winner !== "goodmemory") {
    return judge.failure_tags;
  }

  return judge.failure_tags.filter((tag) => isLegacyBlockingGoodMemoryTag(tag));
}

function resolveFailureSummaryTags(
  judge: JudgeResult,
  blockingFailureTags: string[],
): string[] {
  if (judge.winner === "goodmemory") {
    return blockingFailureTags;
  }

  if (judge.failure_tags.length > 0) {
    return judge.failure_tags;
  }

  return blockingFailureTags;
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

function buildMaintenanceSummary(cases: JudgedEvalCase[]) {
  const summaries = cases
    .map((item) => item.goodmemory.trace.maintenanceSummary)
    .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));

  return {
    casesWithAcceptedProceduralPromotions: summaries.filter(
      (summary) => summary.acceptedProceduralPromotionCount > 0,
    ).length,
    casesWithCompiledProceduralReuse: summaries.filter(
      (summary) => summary.compiledValidatedPatternCount > 0,
    ).length,
    casesWithCorrectionRepairs: summaries.filter(
      (summary) => summary.correctionRepairFactCount > 0,
    ).length,
    casesWithProceduralReuse: summaries.filter(
      (summary) => summary.activeValidatedPatternCount > 0,
    ).length,
    casesWithVerificationPressure: summaries.filter(
      (summary) => summary.pressuredFactCount > 0,
    ).length,
    casesWithDemotions: summaries.filter(
      (summary) => summary.demotedFactCount > 0,
    ).length,
    averageActiveValidatedPatterns: roundMetric(
      average(summaries.map((summary) => summary.activeValidatedPatternCount)),
    ),
    averageCompiledValidatedPatterns: roundMetric(
      average(summaries.map((summary) => summary.compiledValidatedPatternCount)),
    ),
    averageCorrectionRepairs: roundMetric(
      average(summaries.map((summary) => summary.correctionRepairFactCount)),
    ),
    averagePressuredFacts: roundMetric(
      average(summaries.map((summary) => summary.pressuredFactCount)),
    ),
    averageDemotedFacts: roundMetric(
      average(summaries.map((summary) => summary.demotedFactCount)),
    ),
  };
}

function buildOutcomeLoopSummary(cases: JudgedEvalCase[]) {
  let applicableProceduralReuseCases = 0;
  let governedProceduralReuseCases = 0;
  let acceptedProceduralPromotionCases = 0;
  let applicableCorrectionCases = 0;
  let correctionWinCases = 0;
  let applicableStaleSuppressionCases = 0;
  let staleSuppressionCases = 0;

  for (const item of cases) {
    const maintenanceSummary = item.goodmemory.trace.maintenanceSummary;
    const transferCheck = item.assertions.checks.find(
      (check) => check.id === "transfer_signals_present",
    );
    if (transferCheck && transferCheck.details.length > 0) {
      applicableProceduralReuseCases += 1;
      const recalledGovernedPattern = item.goodmemory.retrieved?.feedback.some(
        (record) =>
          record.lifecycle === "active" &&
          record.kind === "validated_pattern" &&
          record.source.method === "confirmed",
      );
      if (
        transferCheck.passed &&
        recalledGovernedPattern &&
        (maintenanceSummary?.compiledValidatedPatternCount ?? 0) > 0
      ) {
        governedProceduralReuseCases += 1;
      }
      if ((maintenanceSummary?.acceptedProceduralPromotionCount ?? 0) > 0) {
        acceptedProceduralPromotionCases += 1;
      }
    }

    const updateCheck = item.assertions.checks.find(
      (check) => check.id === "update_wins_present",
    );
    if (updateCheck && updateCheck.details.length > 0) {
      applicableCorrectionCases += 1;
      if (updateCheck.passed) {
        correctionWinCases += 1;
      }
    }

    const staleSuppressionCheck = item.assertions.checks.find(
      (check) => check.id === "stale_suppression_absent",
    );
    if (staleSuppressionCheck && staleSuppressionCheck.details.length > 0) {
      applicableStaleSuppressionCases += 1;
      if (staleSuppressionCheck.passed) {
        staleSuppressionCases += 1;
      }
    }
  }

  const staleMisuseCases =
    applicableStaleSuppressionCases - staleSuppressionCases;

  return {
    acceptedProceduralPromotionCases,
    applicableCorrectionCases,
    applicableProceduralReuseCases,
    applicableStaleSuppressionCases,
    correctionWinCases,
    correctionWinRate: roundMetric(
      correctionWinCases / Math.max(applicableCorrectionCases, 1),
    ),
    governedProceduralReuseCases,
    governedProceduralReuseRate: roundMetric(
      governedProceduralReuseCases / Math.max(applicableProceduralReuseCases, 1),
    ),
    staleMisuseCases,
    staleMisuseRate: roundMetric(
      staleMisuseCases / Math.max(applicableStaleSuppressionCases, 1),
    ),
    staleSuppressionCases,
    staleSuppressionRate: roundMetric(
      staleSuppressionCases / Math.max(applicableStaleSuppressionCases, 1),
    ),
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
    outcomeLoopSummary: buildOutcomeLoopSummary(cases),
    strategySummary: buildStrategySummary(cases),
    maintenanceSummary: buildMaintenanceSummary(cases),
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
      join(caseTraceDirectory, "proposal-trace.json"),
      `${JSON.stringify(item.goodmemory.trace.proposalLifecycle, null, 2)}\n`,
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
    const summaryFailureTags = resolveFailureSummaryTags(
      item.judge,
      blockingFailureTags,
    );
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
        ...summaryFailureTags,
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
