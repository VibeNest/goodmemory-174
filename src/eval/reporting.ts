import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeProviderRuntimeMetadata } from "../provider/layer";
import type {
  EvalAssertionsAggregate,
  EvalCaseExecutionFailure,
  EvalCaseExecutionFailureStage,
  EvalPublicSurfaceDecision,
  EvalRegressionDashboardSummary,
  EvalLayerScores,
  EvalRuntimePromotionSelectivitySummary,
  EvalRuntimeMetadata,
  EvalShadowComparisonRow,
  EvalShadowSummary,
  EvalStrategyBreakdown,
  EvalStrategyPromotionGateDecision,
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
import { evaluatePublicSurfaceDecision } from "./public-surface-decision";
import type { EvalAnswerPackage } from "./runners";
import { evaluateStrategyPromotionGate } from "./strategy-promotion-gate";
import type { StrategyRolloutFamily, StrategyRolloutMode } from "./strategy-rollout";

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
    runtimePromotionSelectivity: buildRuntimePromotionSelectivity(cases),
  };
}

function isRuntimePromotionSelectivityCase(item: JudgedEvalCase): boolean {
  return (
    item.metadata.strategyFamily === "retrieval" &&
    item.metadata.strategyMode === "promote" &&
    item.metadata.promotedStrategyLabel !== undefined
  );
}

function buildRuntimePromotionSelectivity(
  cases: JudgedEvalCase[],
): EvalRuntimePromotionSelectivitySummary | undefined {
  const promotionCases = cases.filter(isRuntimePromotionSelectivityCase);
  if (promotionCases.length === 0) {
    return undefined;
  }

  const rows = promotionCases.map((item) => {
    const requestedStrategyLabel = item.metadata.strategyLabel;
    const executedStrategyLabel = resolveExecutedStrategyLabel(item);

    return {
      caseId: item.caseId,
      scenarioId: item.goodmemory.scenarioId,
      requestedStrategyLabel,
      resolvedStrategyLabel: item.metadata.resolvedStrategyLabel,
      executedStrategyLabel,
      promotedStrategyLabel: item.metadata.promotedStrategyLabel,
      candidateInfluencedExecution: item.goodmemory.candidateInfluencedExecution,
      transition: `${requestedStrategyLabel} -> ${executedStrategyLabel}`,
    };
  });
  const promotedCases = rows.filter(
    (row) =>
      row.candidateInfluencedExecution === true ||
      (row.requestedStrategyLabel !== row.executedStrategyLabel &&
        row.executedStrategyLabel === row.promotedStrategyLabel),
  ).length;

  return {
    totalCases: rows.length,
    promotedCases,
    defaultOrRequestedCases: rows.length - promotedCases,
    cases: rows,
  };
}

function incrementRolloutCount<Key extends string>(
  counts: Partial<Record<Key, number>>,
  key: Key,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isShadowComparisonCase(
  item: JudgedEvalCase,
): item is JudgedEvalCase & {
  metadata: JudgedEvalCase["metadata"] & {
    strategyFamily: StrategyRolloutFamily;
    strategyMode: StrategyRolloutMode;
  };
} {
  return (
    item.metadata.strategyFamily !== undefined &&
    item.metadata.strategyMode !== undefined &&
    item.metadata.strategyMode !== "promote"
  );
}

function resolveShadowExecutionPathSource(
  item: JudgedEvalCase,
): EvalShadowComparisonRow["executedPathSource"] {
  if (item.goodmemory.candidateInfluencedExecution === true) {
    return "candidate";
  }
  if (item.goodmemory.candidateInfluencedExecution === false) {
    return "promoted_or_default";
  }
  return "unknown";
}

function buildShadowSummary(cases: JudgedEvalCase[]): EvalShadowSummary | undefined {
  const shadowCases = cases.filter(isShadowComparisonCase);
  if (shadowCases.length === 0) {
    return undefined;
  }

  const byFamily: EvalShadowSummary["byFamily"] = {};
  const byMode: EvalShadowSummary["byMode"] = {};
  let candidateInfluencedCases = 0;
  let safeObserveCases = 0;
  let unknownObserveCases = 0;
  const regressionCases: string[] = [];

  for (const item of shadowCases) {
    const executedPathSource = resolveShadowExecutionPathSource(item);

    incrementRolloutCount(byFamily, item.metadata.strategyFamily);
    incrementRolloutCount(byMode, item.metadata.strategyMode);

    if (executedPathSource === "candidate") {
      candidateInfluencedCases += 1;
    }

    if (item.metadata.strategyMode === "observe") {
      if (executedPathSource === "promoted_or_default") {
        safeObserveCases += 1;
      } else if (executedPathSource === "unknown") {
        unknownObserveCases += 1;
      }
    }

    if (isStrategyRegression(item)) {
      regressionCases.push(item.caseId);
    }
  }

  return {
    totalCases: shadowCases.length,
    byFamily,
    byMode,
    candidateInfluencedCases,
    safeObserveCases,
    unknownObserveCases,
    regressionCases,
  };
}

function buildShadowComparisonRows(
  cases: JudgedEvalCase[],
): EvalShadowComparisonRow[] {
  return cases.filter(isShadowComparisonCase).map((item) => {
    const candidateInfluencedExecution =
      item.goodmemory.candidateInfluencedExecution;

    return {
      caseId: item.caseId,
      scenarioId: item.goodmemory.scenarioId,
      strategyFamily: item.metadata.strategyFamily,
      strategyMode: item.metadata.strategyMode,
      requestedStrategyLabel: item.metadata.strategyLabel as Exclude<
        EvalAnswerPackage["strategyLabel"],
        "baseline"
      >,
      executedStrategyLabel: resolveExecutedStrategyLabel(item),
      ...(item.shadow?.resolvedStrategyLabel
        ? {
            shadowResolvedStrategyLabel: item.shadow.resolvedStrategyLabel as Exclude<
              EvalAnswerPackage["strategyLabel"],
              "baseline"
            >,
          }
        : {}),
      promotedStrategyLabel: item.metadata.promotedStrategyLabel as Exclude<
        EvalAnswerPackage["strategyLabel"],
        "baseline"
      > | undefined,
      comparisonTarget: "executed-path",
      executedPathSource: resolveShadowExecutionPathSource(item),
      ...(candidateInfluencedExecution !== undefined
        ? { candidateInfluencedExecution }
        : {}),
      winner: item.judge.winner,
      assertionsPassed: item.assertions.passed,
      artifactPaths: {
        baselineTrace: join("traces", item.caseId, "baseline.json"),
        executedTrace: join("traces", item.caseId, "goodmemory.json"),
        ...(item.shadow
          ? { shadowTrace: join("traces", `${item.caseId}__shadow`, "shadow.json") }
          : {}),
        ...(item.shadow?.retrieved
          ? {
              shadowRawRecall: join(
                "traces",
                `${item.caseId}__shadow`,
                "shadow-raw-recall.json",
              ),
            }
          : {}),
        ...(item.goodmemory.retrieved
          ? { rawRecall: join("traces", item.caseId, "raw-recall.json") }
          : {}),
        judge: join("traces", item.caseId, "judge.json"),
        assertions: join("traces", item.caseId, "assertions.json"),
      },
    };
  });
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

function resolveExecutionFailureCount(
  executionFailures: number | EvalCaseExecutionFailure[],
): number {
  return typeof executionFailures === "number"
    ? Math.max(0, executionFailures)
    : executionFailures.length;
}

function resolveExecutionFailureExecutedStrategyLabel(
  failure: EvalCaseExecutionFailure,
): Exclude<EvalAnswerPackage["strategyLabel"], "baseline"> | undefined {
  return failure.metadata.resolvedStrategyLabel;
}

function buildExecutionFailureBreakdown(
  executionFailures: number | EvalCaseExecutionFailure[],
): {
  count: number;
  unattributedCount: number;
  byStrategy: Map<
    Exclude<EvalAnswerPackage["strategyLabel"], "baseline">,
    string[]
  >;
} {
  if (typeof executionFailures === "number") {
    return {
      count: Math.max(0, executionFailures),
      unattributedCount: Math.max(0, executionFailures),
      byStrategy: new Map(),
    };
  }

  const byStrategy = new Map<
    Exclude<EvalAnswerPackage["strategyLabel"], "baseline">,
    string[]
  >();
  let unattributedCount = 0;

  for (const failure of executionFailures) {
    const strategyLabel = resolveExecutionFailureExecutedStrategyLabel(failure);
    if (!strategyLabel) {
      unattributedCount += 1;
      continue;
    }

    const cases = byStrategy.get(strategyLabel) ?? [];
    cases.push(failure.caseId);
    byStrategy.set(strategyLabel, cases);
  }

  return {
    count: executionFailures.length,
    unattributedCount,
    byStrategy,
  };
}

function buildRegressionDashboardSummary(
  summary: EvalSuiteSummary,
  executionFailures: number | EvalCaseExecutionFailure[] = summary.executionFailures ?? 0,
): EvalRegressionDashboardSummary {
  const executionFailureBreakdown = buildExecutionFailureBreakdown(
    executionFailures,
  );
  const strategyLabels = new Set<
    EvalRegressionDashboardSummary["strategyRegressions"][number]["strategyLabel"]
  >([
    ...Object.keys(summary.strategySummary.byStrategy),
    ...executionFailureBreakdown.byStrategy.keys(),
  ] as EvalRegressionDashboardSummary["strategyRegressions"][number]["strategyLabel"][]);
  const strategyRegressions = [...strategyLabels]
    .map((strategyLabel) => {
      const breakdown = summary.strategySummary.byStrategy[strategyLabel];
      const regressionCases = breakdown?.regressionCases ?? [];
      const executionFailureCases =
        executionFailureBreakdown.byStrategy.get(strategyLabel) ?? [];
      const totalCases = breakdown?.totalCases ?? 0;
      const attemptedCaseCount = totalCases + executionFailureCases.length;
      const regressionCaseCount = regressionCases.length;
      const executionFailureCaseCount = executionFailureCases.length;
      const blockingCaseCount =
        regressionCaseCount + executionFailureCaseCount;

      return {
        strategyLabel,
        totalCases,
        attemptedCaseCount,
        regressionCaseCount,
        executionFailureCaseCount,
        blockingCaseCount,
        regressionRate: roundMetric(
          regressionCaseCount / Math.max(totalCases, 1),
        ),
        blockingRate: roundMetric(
          blockingCaseCount / Math.max(attemptedCaseCount, 1),
        ),
        regressionCases,
        executionFailureCases,
      };
    })
    .sort((left, right) => {
      if (right.blockingCaseCount !== left.blockingCaseCount) {
        return right.blockingCaseCount - left.blockingCaseCount;
      }
      if (right.regressionCaseCount !== left.regressionCaseCount) {
        return right.regressionCaseCount - left.regressionCaseCount;
      }
      return left.strategyLabel.localeCompare(right.strategyLabel);
    });

  const judgedRegressionCases = new Set(
    strategyRegressions.flatMap((item) => item.regressionCases),
  ).size;
  const executionFailureCount = resolveExecutionFailureCount(executionFailures);

  return {
    totalRegressionCases: judgedRegressionCases,
    totalBlockingCases: judgedRegressionCases + executionFailureCount,
    judgedRegressionCases,
    executionFailureCount,
    unattributedExecutionFailureCount:
      executionFailureBreakdown.unattributedCount,
    strategyRegressions,
    ...(summary.promotionGate
      ? {
          gate: {
            family: summary.promotionGate.family,
            mode: summary.promotionGate.mode,
            targetStrategyLabel: summary.promotionGate.targetStrategyLabel,
            promotedStrategyLabel: summary.promotionGate.promotedStrategyLabel,
            decision: summary.promotionGate.decision,
            outcome: summary.promotionGate.outcome,
            regressionCaseCount: summary.promotionGate.regressionCases.length,
          },
        }
      : {}),
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
  executionFailures: number | EvalCaseExecutionFailure[] = 0,
  runtime?: EvalRuntimeMetadata,
): EvalSuiteSummary {
  const executionFailureCount = resolveExecutionFailureCount(executionFailures);
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

  const summary: EvalSuiteSummary = {
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
    shadowSummary: buildShadowSummary(cases),
    strategySummary: buildStrategySummary(cases),
    maintenanceSummary: buildMaintenanceSummary(cases),
  };

  const promotionGate =
    runtime ? evaluateStrategyPromotionGate({ cases, runtime, summary }) : undefined;
  const summaryWithGate = promotionGate ? { ...summary, promotionGate } : summary;
  const summaryWithDashboard = {
    ...summaryWithGate,
    regressionDashboardSummary: buildRegressionDashboardSummary(
      summaryWithGate,
      executionFailures,
    ),
  };

  return {
    ...summaryWithDashboard,
    publicSurfaceDecision: evaluatePublicSurfaceDecision(summaryWithDashboard),
  };
}

interface PersistedFailureSummaryRecord {
  caseId: string;
  path: string;
  kind: "judged" | "execution";
  winner: JudgeResult["winner"];
  failureTags: string[];
  lastError?: string;
  attemptCount?: number;
}

interface DashboardFailureCaseRecord {
  caseId: string;
  scenarioId?: string;
  kind: "judged" | "execution";
  winner: JudgeResult["winner"];
  failureStage?: EvalCaseExecutionFailureStage;
  taskFamily?: JudgedEvalCase["metadata"]["taskFamily"];
  strategyLabel?: JudgedEvalCase["metadata"]["strategyLabel"];
  executedStrategyLabel?: JudgedEvalCase["metadata"]["resolvedStrategyLabel"];
  resolvedStrategyLabel?: JudgedEvalCase["metadata"]["resolvedStrategyLabel"];
  strategyMode?: JudgedEvalCase["metadata"]["strategyMode"];
  failureTags: string[];
  artifactPaths: Record<string, string>;
}

type ClusterableDashboardFailureCaseRecord =
  DashboardFailureCaseRecord & { clusterId: string };

function buildJudgedCaseArtifactPaths(item: JudgedEvalCase): Record<string, string> {
  return {
    case: join("cases", `${item.caseId}.json`),
    failure: join("failures", `${item.caseId}.json`),
    baselineTrace: join("traces", item.caseId, "baseline.json"),
    executedTrace: join("traces", item.caseId, "goodmemory.json"),
    rememberTrace: join("traces", item.caseId, "remember-trace.json"),
    feedbackTrace: join("traces", item.caseId, "feedback-trace.json"),
    proposalTrace: join("traces", item.caseId, "proposal-trace.json"),
    contextBuild: join("traces", item.caseId, "context-build.json"),
    judge: join("traces", item.caseId, "judge.json"),
    assertions: join("traces", item.caseId, "assertions.json"),
    ...(item.goodmemory.retrieved
      ? { rawRecall: join("traces", item.caseId, "raw-recall.json") }
      : {}),
    ...(item.shadow
      ? { shadowTrace: join("traces", `${item.caseId}__shadow`, "shadow.json") }
      : {}),
    ...(item.shadow?.retrieved
      ? {
          shadowRawRecall: join(
            "traces",
            `${item.caseId}__shadow`,
            "shadow-raw-recall.json",
          ),
        }
      : {}),
  };
}

function resolveJudgedFailureTags(item: JudgedEvalCase): string[] {
  const blockingFailureTags = resolveBlockingFailureTags(item.judge);
  const summaryFailureTags = resolveFailureSummaryTags(
    item.judge,
    blockingFailureTags,
  );

  return [
    ...summaryFailureTags,
    ...item.assertions.checks
      .filter((check) => !check.passed)
      .map((check) => `assertion:${check.id}`),
  ];
}

function buildJudgedFailureRecord(
  item: JudgedEvalCase,
): PersistedFailureSummaryRecord | undefined {
  const failureTags = resolveJudgedFailureTags(item);
  const failed =
    item.judge.winner !== "goodmemory" ||
    resolveBlockingFailureTags(item.judge).length > 0 ||
    !item.assertions.passed;

  if (!failed) {
    return undefined;
  }

  return {
    caseId: item.caseId,
    path: join("failures", `${item.caseId}.json`),
    kind: "judged",
    winner: item.judge.winner,
    failureTags,
  };
}

function buildExecutionFailureRecord(
  failure: EvalCaseExecutionFailure,
): PersistedFailureSummaryRecord {
  return {
    caseId: failure.caseId,
    path: join("failures", `${failure.caseId}.execution.json`),
    kind: "execution",
    winner: "baseline",
    failureTags: ["execution:retry_exhausted"],
    lastError: failure.lastError,
    attemptCount: failure.attempts.length,
  };
}

function resolveDashboardClusterStrategyLabel(
  record: DashboardFailureCaseRecord,
): string | undefined {
  if (record.kind === "execution") {
    return record.executedStrategyLabel ?? record.resolvedStrategyLabel;
  }

  return (
    record.executedStrategyLabel ??
    record.resolvedStrategyLabel ??
    record.strategyLabel
  );
}

function buildRegressionDashboardArtifact(input: {
  mode: PersistedEvalMode;
  runId: string;
  summary: EvalSuiteSummary;
  cases: JudgedEvalCase[];
  executionFailures: EvalCaseExecutionFailure[];
}): {
  mode: PersistedEvalMode;
  runId: string;
  summary: Record<string, unknown>;
  failureClusters: Array<Record<string, unknown>>;
} {
  const judgedFailures: ClusterableDashboardFailureCaseRecord[] = input.cases.flatMap((item) => {
    const failure = buildJudgedFailureRecord(item);
    if (!failure) {
      return [];
    }

    return [
      {
        clusterId: `judged:${[...failure.failureTags].sort().join("|")}`,
        kind: "judged" as const,
        caseId: item.caseId,
        scenarioId: item.goodmemory.scenarioId,
        winner: item.judge.winner,
        taskFamily: item.metadata.taskFamily,
        strategyLabel: item.metadata.strategyLabel,
        executedStrategyLabel: resolveExecutedStrategyLabel(item),
        resolvedStrategyLabel: item.metadata.resolvedStrategyLabel,
        strategyMode: item.metadata.strategyMode,
        failureTags: failure.failureTags,
        artifactPaths: buildJudgedCaseArtifactPaths(item),
      } satisfies ClusterableDashboardFailureCaseRecord,
    ];
  });

  const executionFailureRecords: ClusterableDashboardFailureCaseRecord[] =
    input.executionFailures.map((failure) => {
      const record = buildExecutionFailureRecord(failure);

      return {
        clusterId: `execution:${record.failureTags.join("|")}`,
        kind: "execution" as const,
        caseId: failure.caseId,
        winner: record.winner,
        failureStage: failure.failureStage,
        taskFamily: failure.metadata.taskFamily,
        strategyLabel: failure.metadata.strategyLabel,
        executedStrategyLabel: failure.metadata.resolvedStrategyLabel,
        resolvedStrategyLabel: failure.metadata.resolvedStrategyLabel,
        strategyMode: failure.metadata.strategyMode,
        failureTags: record.failureTags,
        artifactPaths: {
          failure: record.path,
        },
      } satisfies ClusterableDashboardFailureCaseRecord;
    });

  const clustered = new Map<
    string,
    {
      clusterId: string;
      kind: "judged" | "execution";
      failureTags: string[];
      strategyLabels: Set<string>;
      strategyModes: Set<string>;
      cases: DashboardFailureCaseRecord[];
    }
  >();

  for (const record of [...judgedFailures, ...executionFailureRecords]) {
    let cluster = clustered.get(record.clusterId);
    if (!cluster) {
      cluster = {
        clusterId: record.clusterId,
        kind: record.kind,
        failureTags: [...record.failureTags].sort(),
        strategyLabels: new Set<string>(),
        strategyModes: new Set<string>(),
        cases: [],
      };
      clustered.set(record.clusterId, cluster);
    }

    const clusterStrategyLabel = resolveDashboardClusterStrategyLabel(record);
    if (clusterStrategyLabel) {
      cluster.strategyLabels.add(clusterStrategyLabel);
    }
    if (record.strategyMode) {
      cluster.strategyModes.add(record.strategyMode);
    }
    cluster.cases.push(record);
  }

  const failureClusters = [...clustered.values()]
    .map((cluster) => ({
      clusterId: cluster.clusterId,
      kind: cluster.kind,
      totalCases: cluster.cases.length,
      failureTags: cluster.failureTags,
      strategyLabels: [...cluster.strategyLabels].sort(),
      strategyModes: [...cluster.strategyModes].sort(),
      cases: cluster.cases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    }))
    .sort((left, right) => {
      if (right.totalCases !== left.totalCases) {
        return right.totalCases - left.totalCases;
      }
      return left.clusterId.localeCompare(right.clusterId);
    });

  return {
    mode: input.mode,
    runId: input.runId,
    summary: {
      totalCases: input.summary.totalCases,
      completedCases: input.summary.completedCases ?? 0,
      executionFailures: input.summary.executionFailures ?? 0,
      winnerCounts: input.summary.winnerCounts,
      uplift: input.summary.uplift,
      assertions: {
        passRate: input.summary.assertions.passRate,
        checkPassRate: input.summary.assertions.checkPassRate,
        contaminationFailures: input.summary.assertions.contaminationFailures,
        updateFailures: input.summary.assertions.updateFailures,
      },
      shadowSummary: input.summary.shadowSummary ?? null,
      promotionGate: input.summary.promotionGate ?? null,
      publicSurfaceDecision:
        input.summary.publicSurfaceDecision ??
        evaluatePublicSurfaceDecision(input.summary),
      regressionDashboardSummary: buildRegressionDashboardSummary(
        input.summary,
        input.executionFailures,
      ),
      failureClusterCount: failureClusters.length,
    },
    failureClusters,
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
  const runtime = {
    ...normalizeProviderRuntimeMetadata(input.runtime),
    ...(input.runtime.strategyRollout
      ? { strategyRollout: input.runtime.strategyRollout }
      : {}),
  } satisfies EvalRuntimeMetadata;
  const summary =
    input.summary.promotionGate !== undefined || runtime.strategyRollout === undefined
      ? input.summary
      : {
          ...input.summary,
          promotionGate: evaluateStrategyPromotionGate({
            cases: input.cases,
            runtime,
            summary: input.summary,
          }),
        };
  const summaryWithDashboard = {
    ...summary,
    regressionDashboardSummary: buildRegressionDashboardSummary(
      summary,
      input.executionFailures ?? summary.executionFailures ?? 0,
    ),
  };
  const summaryWithPublicSurface = {
    ...summaryWithDashboard,
    publicSurfaceDecision: evaluatePublicSurfaceDecision(summaryWithDashboard),
  };
  const runDirectory = join(input.outputDir, input.runId);
  const casesDirectory = join(runDirectory, "cases");
  const failuresDirectory = join(runDirectory, "failures");
  const tracesDirectory = join(runDirectory, "traces");
  const shadowComparisons = buildShadowComparisonRows(input.cases);

  await mkdir(casesDirectory, { recursive: true });
  await mkdir(failuresDirectory, { recursive: true });
  await mkdir(tracesDirectory, { recursive: true });

  await writeFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(
      {
        mode: input.mode,
        runId: input.runId,
        summary: summaryWithPublicSurface,
        runtime,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const failedCases: PersistedFailureSummaryRecord[] = [];

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
    if (item.shadow) {
      const shadowTraceDirectory = join(tracesDirectory, `${item.caseId}__shadow`);
      await mkdir(shadowTraceDirectory, { recursive: true });
      await writeFile(
        join(shadowTraceDirectory, "shadow.json"),
        `${JSON.stringify(item.shadow, null, 2)}\n`,
        "utf8",
      );
      if (item.shadow.retrieved) {
        await writeFile(
          join(shadowTraceDirectory, "shadow-raw-recall.json"),
          `${JSON.stringify(item.shadow.retrieved, null, 2)}\n`,
          "utf8",
        );
      }
      if (item.shadow.memoryContext) {
        await writeFile(
          join(shadowTraceDirectory, "shadow-built-context.md"),
          `${item.shadow.memoryContext}\n`,
          "utf8",
        );
      }
    }
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

    const failureRecord = buildJudgedFailureRecord(item);
    if (!failureRecord) {
      continue;
    }

    await writeFile(
      join(failuresDirectory, `${item.caseId}.json`),
      `${JSON.stringify(item, null, 2)}\n`,
      "utf8",
    );
    failedCases.push({
      ...failureRecord,
      path: join(failuresDirectory, `${item.caseId}.json`),
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
      ...buildExecutionFailureRecord(failure),
      path,
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

  const shadowComparisonPayload = `${JSON.stringify(
    {
      mode: input.mode,
      runId: input.runId,
      strategyFamily: input.runtime.strategyRollout?.family ?? null,
      comparisonTarget: "executed-path",
      totalCases: shadowComparisons.length,
      comparisons: shadowComparisons,
    },
    null,
    2,
  )}\n`;

  await writeFile(
    join(runDirectory, "shadow-executed-path-comparisons.json"),
    shadowComparisonPayload,
    "utf8",
  );

  await writeFile(
    join(runDirectory, "shadow-comparisons.json"),
    shadowComparisonPayload,
    "utf8",
  );

  const promotionGatePayload = `${JSON.stringify(
    summaryWithPublicSurface.promotionGate ?? null,
    null,
    2,
  )}\n`;
  await writeFile(
    join(runDirectory, "strategy-promotion-gate.json"),
    promotionGatePayload,
    "utf8",
  );

  const regressionDashboardPayload = `${JSON.stringify(
    buildRegressionDashboardArtifact({
      mode: input.mode,
      runId: input.runId,
      summary: summaryWithPublicSurface,
      cases: input.cases,
      executionFailures: input.executionFailures ?? [],
    }),
    null,
    2,
  )}\n`;
  await writeFile(
    join(runDirectory, "regression-dashboard.json"),
    regressionDashboardPayload,
    "utf8",
  );

  const rolloutFamily = input.runtime.strategyRollout?.family;
  if (rolloutFamily && rolloutFamily !== "retrieval") {
    await writeFile(
      join(runDirectory, `${rolloutFamily}-shadow-executed-path-comparisons.json`),
      shadowComparisonPayload,
      "utf8",
    );
    await writeFile(
      join(runDirectory, `${rolloutFamily}-strategy-promotion-gate.json`),
      promotionGatePayload,
      "utf8",
    );
    await writeFile(
      join(runDirectory, `${rolloutFamily}-regression-dashboard.json`),
      regressionDashboardPayload,
      "utf8",
    );
  }

  await writeFile(
    join(runDirectory, "public-surface-decision.json"),
    `${JSON.stringify(summaryWithPublicSurface.publicSurfaceDecision ?? null, null, 2)}\n`,
    "utf8",
  );

  return {
    runDirectory,
  };
}
