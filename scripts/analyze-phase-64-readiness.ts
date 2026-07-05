import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertCliPathSegmentValue,
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import type {
  Phase63RecallDiagnosticBucketSummary,
  Phase63RecallDiagnosticWorkbenchAnalysis,
} from "./analyze-phase-63-recall-diagnostic";

const GENERATED_BY = "scripts/analyze-phase-64-readiness.ts";

export const PHASE64_READINESS_RUN_ID =
  "run-phase64-memoryagentbench-readiness-current";

type Phase64ReadinessStatus =
  | "ready_for_adapter_probe"
  | "phase63_risk_prep_required";

type Phase64PriorityArea =
  | "behavior_policy_learning"
  | "conflict_update_resolution"
  | "long_horizon_task_memory"
  | "noise_budgeting";

interface Phase64AreaRule {
  area: Phase64PriorityArea;
  categories: readonly string[];
  recommendedPreparation: readonly string[];
  title: string;
}

export interface Phase64ReadinessCliOptions {
  outputDir?: string;
  outputPath?: string;
  phase63AnalysisPath?: string;
  runId?: string;
}

export interface Phase64ReadinessDependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

export interface Phase64PrioritySignal {
  averageEvidenceChatRecall: number | null;
  categories: string[];
  evidenceCases: number;
  incompleteRecallCases: number;
  totalHitEvidenceIds: number;
  totalMissingEvidenceIds: number;
  totalNoiseChatIds: number;
  wrongRecallCases: number;
  zeroRecallCases: number;
}

export interface Phase64ReadinessPriority {
  area: Phase64PriorityArea;
  blocking: boolean;
  phase63Signal: Phase64PrioritySignal;
  recommendedPreparation: string[];
  riskScore: number;
  title: string;
}

export interface Phase64MemoryAgentBenchReadinessReport {
  benchmark: {
    competencies: string[];
    name: "MemoryAgentBench";
    upstream: string;
  };
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  guardrails: string[];
  phase: "phase-64";
  priorities: Phase64ReadinessPriority[];
  runId: string;
  sourcePhase63Analysis: {
    globalSummary: Phase63RecallDiagnosticWorkbenchAnalysis["globalSummary"];
    profile: Phase63RecallDiagnosticWorkbenchAnalysis["profile"];
    reportPath: string;
    runId: string;
  };
  status: Phase64ReadinessStatus;
}

export interface Phase64ReadinessRunResult {
  outputPath: string;
  report: Phase64MemoryAgentBenchReadinessReport;
}

const AREA_RULES = [
  {
    area: "conflict_update_resolution",
    categories: [
      "knowledge_update",
      "contradiction_resolution",
      "temporal_reasoning",
    ],
    recommendedPreparation: [
      "Build the first MemoryAgentBench smoke fixture around old-vs-new facts and require latest verified state to win over stale evidence.",
      "Add a trace assertion that selected evidence separates current facts, superseded facts, and conflict-resolution rationale.",
      "Keep the Phase 63 knowledge_update regression as a blocker until same-source deltas stop losing hit evidence.",
    ],
    title: "Conflict and update handling before MemoryAgentBench CR",
  },
  {
    area: "noise_budgeting",
    categories: [],
    recommendedPreparation: [
      "Add per-step retrieved, hit, missing, and noise evidence counters to the Phase 64 adapter from the first smoke run.",
      "Gate any Phase 64 recall lift on non-worsening noise, not just answer accuracy.",
      "Prefer query-typed evidence budgets over broader source-order append paths before starting full MemoryAgentBench runs.",
    ],
    title: "Noise budget guard before agent-memory full runs",
  },
  {
    area: "behavior_policy_learning",
    categories: [
      "instruction_following",
      "preference_following",
    ],
    recommendedPreparation: [
      "Model test-time learning cases as confirmed feedback or preferences, then assert later actions use the learned rule without copying prompt text.",
      "Keep preference and instruction recall traces separate so policy learning is not hidden inside generic fact recall.",
      "Add negative cases where similar tasks should not inherit an unrelated preference.",
    ],
    title: "Behavior and policy learning before MemoryAgentBench TTL",
  },
  {
    area: "long_horizon_task_memory",
    categories: [
      "event_ordering",
      "multi_session_reasoning",
      "summarization",
      "timeline_integration",
    ],
    recommendedPreparation: [
      "Represent each MemoryAgentBench trajectory as ordered agent events plus state snapshots, not only flattened chat text.",
      "Assert that long-range understanding can retrieve the minimal state-changing turns without overselecting setup chatter.",
      "Prepare changed-case comparison for event-order and multi-hop regressions before adding new selectors.",
    ],
    title: "Long-horizon agent state before MemoryAgentBench LRU",
  },
] as const satisfies readonly Phase64AreaRule[];

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeCategory(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/gu, "_");
}

function categoryMatches(
  bucket: Phase63RecallDiagnosticBucketSummary,
  categories: readonly string[],
): boolean {
  const normalized = normalizeCategory(bucket.category);
  return categories.some((category) => normalized.includes(category));
}

function weightedAverageRecall(
  buckets: readonly Phase63RecallDiagnosticBucketSummary[],
): number | null {
  const evidenceCases = buckets.reduce(
    (sum, bucket) => sum + bucket.evidenceCases,
    0,
  );
  if (evidenceCases === 0) {
    return null;
  }

  const weightedTotal = buckets.reduce((sum, bucket) => {
    if (bucket.averageEvidenceChatRecall === null) {
      return sum;
    }
    return sum + bucket.averageEvidenceChatRecall * bucket.evidenceCases;
  }, 0);

  return roundMetric(weightedTotal / evidenceCases);
}

function summarizeBuckets(
  buckets: readonly Phase63RecallDiagnosticBucketSummary[],
): Phase64PrioritySignal {
  return {
    averageEvidenceChatRecall: weightedAverageRecall(buckets),
    categories: buckets.map((bucket) => bucket.category),
    evidenceCases: buckets.reduce((sum, bucket) => sum + bucket.evidenceCases, 0),
    incompleteRecallCases: buckets.reduce(
      (sum, bucket) => sum + bucket.incompleteRecallCases,
      0,
    ),
    totalHitEvidenceIds: buckets.reduce(
      (sum, bucket) => sum + bucket.totalHitEvidenceIds,
      0,
    ),
    totalMissingEvidenceIds: buckets.reduce(
      (sum, bucket) => sum + bucket.totalMissingEvidenceIds,
      0,
    ),
    totalNoiseChatIds: buckets.reduce(
      (sum, bucket) => sum + bucket.totalNoiseChatIds,
      0,
    ),
    wrongRecallCases: buckets.reduce(
      (sum, bucket) => sum + bucket.wrongRecallCases,
      0,
    ),
    zeroRecallCases: buckets.reduce(
      (sum, bucket) => sum + bucket.zeroRecallCases,
      0,
    ),
  };
}

function riskScore(signal: Phase64PrioritySignal): number {
  return roundMetric(
    signal.totalMissingEvidenceIds +
      signal.zeroRecallCases * 3 +
      signal.wrongRecallCases * 0.5 +
      signal.totalNoiseChatIds * 0.05,
  );
}

function isBlocking(signal: Phase64PrioritySignal): boolean {
  return signal.totalMissingEvidenceIds > 0 ||
    signal.zeroRecallCases > 0 ||
    signal.wrongRecallCases > signal.evidenceCases / 2;
}

function selectNoiseBuckets(
  buckets: readonly Phase63RecallDiagnosticBucketSummary[],
): Phase63RecallDiagnosticBucketSummary[] {
  return [...buckets]
    .filter((bucket) => bucket.totalNoiseChatIds > 0)
    .sort((left, right) => {
      const noiseDelta = right.totalNoiseChatIds - left.totalNoiseChatIds;
      if (noiseDelta !== 0) {
        return noiseDelta;
      }
      return right.wrongRecallCases - left.wrongRecallCases;
    })
    .slice(0, 5);
}

function buildPriority(input: {
  analysis: Phase63RecallDiagnosticWorkbenchAnalysis;
  rule: Phase64AreaRule;
}): Phase64ReadinessPriority {
  const buckets = input.rule.area === "noise_budgeting"
    ? selectNoiseBuckets(input.analysis.bucketSummaries)
    : input.analysis.bucketSummaries.filter((bucket) =>
      categoryMatches(bucket, input.rule.categories)
    );
  const phase63Signal = summarizeBuckets(buckets);

  return {
    area: input.rule.area,
    blocking: isBlocking(phase63Signal),
    phase63Signal,
    recommendedPreparation: [...input.rule.recommendedPreparation],
    riskScore: riskScore(phase63Signal),
    title: input.rule.title,
  };
}

export function buildPhase64MemoryAgentBenchReadiness(input: {
  analysis: Phase63RecallDiagnosticWorkbenchAnalysis;
  generatedAt: string;
  runId?: string;
}): Phase64MemoryAgentBenchReadinessReport {
  const priorities = AREA_RULES
    .map((rule) =>
      buildPriority({
        analysis: input.analysis,
        rule,
      })
    )
    .sort((left, right) => {
      if (left.blocking !== right.blocking) {
        return left.blocking ? -1 : 1;
      }
      return right.riskScore - left.riskScore;
    });

  return {
    benchmark: {
      competencies: [
        "Accurate Retrieval",
        "Test-Time Learning",
        "Long-Range Understanding",
        "Conflict Resolution",
      ],
      name: "MemoryAgentBench",
      upstream: "https://github.com/HUST-AI-HYZ/MemoryAgentBench",
    },
    generatedAt: input.generatedAt,
    generatedBy: GENERATED_BY,
    guardrails: [
      "Do not move Phase 64 to active until Phase 63 BEAM is closed or explicitly paused.",
      "Do not add benchmark-specific recall selectors for MemoryAgentBench rows.",
      "Carry Phase 63 wrong/noise deltas into Phase 64 gates from the first adapter run.",
      "Treat answer accuracy, evidence recall, stale suppression, and action-policy transfer as separate metrics.",
    ],
    phase: "phase-64",
    priorities,
    runId: input.runId ?? PHASE64_READINESS_RUN_ID,
    sourcePhase63Analysis: {
      globalSummary: input.analysis.globalSummary,
      profile: input.analysis.profile,
      reportPath: input.analysis.reportPath,
      runId: input.analysis.runId,
    },
    status: priorities.some((priority) => priority.blocking)
      ? "phase63_risk_prep_required"
      : "ready_for_adapter_probe",
  };
}

export function parsePhase64ReadinessAnalysisCliOptions(
  argv: readonly string[],
): Phase64ReadinessCliOptions {
  return {
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    phase63AnalysisPath: resolveCliFlagValueStrict(
      argv,
      "--phase63-analysis-path",
    ),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

export function resolvePhase64PrepOutputDir(root: string): string {
  return join(root, "reports/eval/research/phase-64/memoryagentbench-prep");
}

export async function runPhase64ReadinessAnalysis(
  options: Phase64ReadinessCliOptions,
  dependencies: Phase64ReadinessDependencies = {},
): Promise<Phase64ReadinessRunResult> {
  const readFileImpl = dependencies.readFile ??
    ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const phase63AnalysisPath = options.phase63AnalysisPath;
  if (!phase63AnalysisPath) {
    throw new Error(
      "Phase 64 readiness analysis requires --phase63-analysis-path.",
    );
  }
  if (options.runId !== undefined) {
    assertCliPathSegmentValue({
      flag: "--run-id",
      value: options.runId,
    });
  }

  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputPath = options.outputPath ??
    join(
      options.outputDir ?? resolvePhase64PrepOutputDir(root),
      options.runId ?? PHASE64_READINESS_RUN_ID,
      "phase-64-readiness.json",
    );
  assertDistinctCliPathValues({
    firstFlag: "--output-path",
    firstValue: outputPath,
    secondFlag: "--phase63-analysis-path",
    secondValue: phase63AnalysisPath,
  });

  const analysis = JSON.parse(
    await readFileImpl(phase63AnalysisPath),
  ) as Phase63RecallDiagnosticWorkbenchAnalysis;
  const report = buildPhase64MemoryAgentBenchReadiness({
    analysis,
    generatedAt: now().toISOString(),
    runId: options.runId,
  });

  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  return {
    outputPath,
    report,
  };
}

function buildCliSummary(result: Phase64ReadinessRunResult): {
  outputPath: string;
  priorities: Array<{
    area: Phase64PriorityArea;
    blocking: boolean;
    categories: string[];
    riskScore: number;
  }>;
  runId: string;
  sourcePhase63RunId: string;
  status: Phase64ReadinessStatus;
} {
  return {
    outputPath: result.outputPath,
    priorities: result.report.priorities.map((priority) => ({
      area: priority.area,
      blocking: priority.blocking,
      categories: priority.phase63Signal.categories,
      riskScore: priority.riskScore,
    })),
    runId: result.report.runId,
    sourcePhase63RunId: result.report.sourcePhase63Analysis.runId,
    status: result.report.status,
  };
}

if (import.meta.main) {
  const result = await runPhase64ReadinessAnalysis(
    parsePhase64ReadinessAnalysisCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(buildCliSummary(result), null, 2));
}
