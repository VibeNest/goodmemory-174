#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchComparisonReport,
  ImplicitMemBenchDatasetFamily,
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchResearchReport,
  ImplicitMemBenchScorerFamily,
} from "../src/eval/implicitmembench-research";
import { listImplicitMemBenchResearchCases } from "../src/eval/implicitmembench-research";
import type { Phase60OverallSummary } from "../src/eval/phase60";
import { buildPhase60OverallSummary } from "../src/eval/phase60";
import { resolveCliFlagValue } from "./cli-options";
import {
  PHASE60_CANONICAL_RUN_ID,
  runPhase60Eval,
  type Phase60EvalDependencies,
} from "./run-phase-60-eval";
import {
  resolvePhase60BaselineReportPath,
  resolvePhase60GoodMemoryReportPath,
} from "./run-phase-60-overall";
import {
  resolvePhase60OverallSummaryPath,
  resolvePhase60RepoRoot,
} from "./run-phase-60-shared";

export const PHASE61_FULL300_DEFAULT_PRIMING_TIMEOUT_MS = 180_000;
export const PHASE61_FULL300_DEFAULT_MAX_CONCURRENCY = 1;
export const PHASE61_FULL300_DEFAULT_SHARDS = 10;
export const PHASE61_FULL300_DEFAULT_SHARD_CONCURRENCY = 6;
const GENERATED_BY = "scripts/run-phase-61-full300.ts";

const REQUIRED_LIVE_ENV = [
  "GOODMEMORY_EVAL_PROVIDER",
  "GOODMEMORY_EVAL_MODEL",
  "GOODMEMORY_EVAL_API_KEY",
  "GOODMEMORY_JUDGE_PROVIDER",
  "GOODMEMORY_JUDGE_MODEL",
  "GOODMEMORY_JUDGE_API_KEY",
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
  "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
] as const;

export interface Phase61Full300Options {
  benchmarkRoot?: string;
  maxConcurrency?: number;
  outputDir?: string;
  primingTimeoutMs?: number;
  runId?: string;
  shardConcurrency?: number;
  shards?: number;
}

export interface ResolvedPhase61Full300Options {
  benchmarkRoot: string;
  maxConcurrency?: number;
  outputDir: string;
  primingTimeoutMs: number;
  runId: string;
  shardConcurrency: number;
  shards: number;
}

export interface Phase61Full300EnvironmentSummary {
  missingRequiredEnv: string[];
  postgresUrlSource: "GOODMEMORY_STORAGE_URL" | "GOODMEMORY_TEST_POSTGRES_URL";
  storageProvider: "postgres";
}

export interface Phase61Full300Result {
  baselineReportPath: string;
  goodmemoryReportPath: string;
  overallSummaryPath: string;
  outputDir: string;
  reportPath: string;
  runDirectory: string;
  runId: string;
  shardCount: number;
  shardReportPaths: string[];
  summary: Phase60OverallSummary;
}

export interface Phase61Full300Dependencies extends Phase60EvalDependencies {
  env?: NodeJS.ProcessEnv;
  runEval?: typeof runPhase60Eval;
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePositiveInteger(value: string | undefined, label: string): number | undefined {
  if (!isNonEmpty(value)) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function timestampForRunId(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function resolvePhase61Full300OutputDir(root: string): string {
  return join(root, "reports/eval/live/phase-61-full300");
}

export function parsePhase61Full300CliOptions(
  argv: readonly string[],
  input?: {
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
  },
): Phase61Full300Options {
  const env = input?.env ?? process.env;
  const now = input?.now ?? (() => new Date());
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      env.GOODMEMORY_IMPLICITMEMBENCH_ROOT,
    maxConcurrency: parsePositiveInteger(
      resolveCliFlagValue(argv, "--max-concurrency") ??
        env.GOODMEMORY_PHASE61_FULL300_MAX_CONCURRENCY,
      "--max-concurrency",
    ),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    primingTimeoutMs: parsePositiveInteger(
      resolveCliFlagValue(argv, "--priming-timeout-ms") ??
        env.GOODMEMORY_IMPLICITMEMBENCH_PRIMING_TIMEOUT_MS,
      "--priming-timeout-ms",
    ),
    runId:
      resolveCliFlagValue(argv, "--run-id") ??
      `run-phase61-full300-${timestampForRunId(now())}`,
    shardConcurrency: parsePositiveInteger(
      resolveCliFlagValue(argv, "--shard-concurrency") ??
        env.GOODMEMORY_PHASE61_FULL300_SHARD_CONCURRENCY,
      "--shard-concurrency",
    ),
    shards: parsePositiveInteger(
      resolveCliFlagValue(argv, "--shards") ??
        env.GOODMEMORY_PHASE61_FULL300_SHARDS,
      "--shards",
    ),
  };
}

export function resolvePhase61Full300Options(
  input?: Phase61Full300Options,
): ResolvedPhase61Full300Options {
  const root = resolvePhase60RepoRoot();
  if (!isNonEmpty(input?.benchmarkRoot)) {
    throw new Error(
      "Phase 61 full-300 requires GOODMEMORY_IMPLICITMEMBENCH_ROOT or --benchmark-root.",
    );
  }

  return {
    benchmarkRoot: resolve(input.benchmarkRoot),
    maxConcurrency:
      input.maxConcurrency ?? PHASE61_FULL300_DEFAULT_MAX_CONCURRENCY,
    outputDir: resolve(input.outputDir ?? resolvePhase61Full300OutputDir(root)),
    primingTimeoutMs:
      input.primingTimeoutMs ?? PHASE61_FULL300_DEFAULT_PRIMING_TIMEOUT_MS,
    runId: input.runId ?? PHASE60_CANONICAL_RUN_ID,
    shardConcurrency:
      input.shardConcurrency ?? PHASE61_FULL300_DEFAULT_SHARD_CONCURRENCY,
    shards: input.shards ?? PHASE61_FULL300_DEFAULT_SHARDS,
  };
}

export function configurePhase61Full300Environment(
  options: ResolvedPhase61Full300Options,
  env: NodeJS.ProcessEnv = process.env,
): Phase61Full300EnvironmentSummary {
  const missingRequiredEnv: string[] = REQUIRED_LIVE_ENV.filter(
    (name) => !isNonEmpty(env[name]),
  );
  const postgresUrlSource = isNonEmpty(env.GOODMEMORY_STORAGE_URL)
    ? "GOODMEMORY_STORAGE_URL"
    : "GOODMEMORY_TEST_POSTGRES_URL";
  const postgresUrl = env.GOODMEMORY_STORAGE_URL ?? env.GOODMEMORY_TEST_POSTGRES_URL;

  if (!isNonEmpty(postgresUrl)) {
    missingRequiredEnv.push("GOODMEMORY_TEST_POSTGRES_URL");
  }
  if (missingRequiredEnv.length > 0) {
    throw new Error(
      `Missing required Phase 61 full-300 environment variables: ${missingRequiredEnv.join(", ")}`,
    );
  }

  env.GOODMEMORY_IMPLICITMEMBENCH_ROOT = options.benchmarkRoot;
  env.GOODMEMORY_IMPLICITMEMBENCH_TIMEOUT_MS = String(
    Math.max(
      parsePositiveInteger(
        env.GOODMEMORY_IMPLICITMEMBENCH_TIMEOUT_MS,
        "GOODMEMORY_IMPLICITMEMBENCH_TIMEOUT_MS",
      ) ?? 0,
      options.primingTimeoutMs,
    ),
  );
  env.GOODMEMORY_IMPLICITMEMBENCH_PRIMING_TIMEOUT_MS = String(
    options.primingTimeoutMs,
  );
  env.GOODMEMORY_STORAGE_PROVIDER = "postgres";
  env.GOODMEMORY_STORAGE_URL = postgresUrl;

  return {
    missingRequiredEnv: [],
    postgresUrlSource,
    storageProvider: "postgres",
  };
}

const ALL_DATASET_FAMILIES = [
  "classical_conditioning",
  "priming",
  "procedural_memory",
] as const satisfies readonly ImplicitMemBenchDatasetFamily[];

const ALL_SCORER_FAMILIES = [
  "structured_first_action",
  "text_behavior_judge",
  "priming_pair_judge",
] as const satisfies readonly ImplicitMemBenchScorerFamily[];

const RESEARCH_SOURCE = {
  benchmark: "ImplicitMemBench",
  license: "CC BY 4.0",
  url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
} as const;

function emptyDatasetCounts(): Record<ImplicitMemBenchDatasetFamily, number> {
  return {
    classical_conditioning: 0,
    priming: 0,
    procedural_memory: 0,
  };
}

function emptyScorerCounts(): Record<ImplicitMemBenchScorerFamily, number> {
  return {
    priming_pair_judge: 0,
    structured_first_action: 0,
    text_behavior_judge: 0,
  };
}

function summarizeCases(
  cases: readonly ImplicitMemBenchCaseResult[],
): ImplicitMemBenchProfileSummary {
  const caseCountsByDataset = emptyDatasetCounts();
  const caseCountsByScorer = emptyScorerCounts();
  let explicitRecallLeakCount = 0;
  let passedBlockingCases = 0;
  let primingScoreCount = 0;
  let primingScoreTotal = 0;
  let totalBlockingCases = 0;

  for (const caseResult of cases) {
    caseCountsByDataset[caseResult.datasetFamily] += 1;
    caseCountsByScorer[caseResult.scorerFamily] += 1;
    if (caseResult.executionFailure) {
      // Counted below via filter to keep this loop focused on score fields.
    }
    if (caseResult.explicitRecallLeak) {
      explicitRecallLeakCount += 1;
    }
    if (caseResult.blocking) {
      totalBlockingCases += 1;
      if (caseResult.passed) {
        passedBlockingCases += 1;
      }
    }
    if (typeof caseResult.primingInfluenceScore === "number") {
      primingScoreCount += 1;
      primingScoreTotal += caseResult.primingInfluenceScore;
    }
  }

  return {
    caseCountsByDataset,
    caseCountsByScorer,
    cases: [...cases],
    executionFailures: cases.filter((caseResult) => caseResult.executionFailure)
      .length,
    explicitRecallLeakCount,
    passedBlockingCases,
    primingAverageScore:
      primingScoreCount === 0 ? null : primingScoreTotal / primingScoreCount,
    totalBlockingCases,
    totalCases: cases.length,
  };
}

function summarizeReport(
  profiles: Partial<
    Record<ImplicitMemBenchResearchProfile, ImplicitMemBenchProfileSummary>
  >,
): ImplicitMemBenchResearchReport["summary"] {
  const caseCountsByDataset = emptyDatasetCounts();
  const caseCountsByScorer = emptyScorerCounts();
  let executionFailures = 0;
  let explicitRecallLeakCount = 0;
  let passedBlockingCases = 0;
  let primingScoreCount = 0;
  let primingScoreTotal = 0;
  let totalBlockingCases = 0;
  let totalCases = 0;

  for (const profile of Object.values(profiles)) {
    if (!profile) {
      continue;
    }
    executionFailures += profile.executionFailures;
    explicitRecallLeakCount += profile.explicitRecallLeakCount;
    passedBlockingCases += profile.passedBlockingCases;
    totalBlockingCases += profile.totalBlockingCases;
    totalCases += profile.totalCases;
    for (const datasetFamily of ALL_DATASET_FAMILIES) {
      caseCountsByDataset[datasetFamily] +=
        profile.caseCountsByDataset[datasetFamily];
    }
    for (const scorerFamily of ALL_SCORER_FAMILIES) {
      caseCountsByScorer[scorerFamily] += profile.caseCountsByScorer[scorerFamily];
    }
    for (const caseResult of profile.cases) {
      if (typeof caseResult.primingInfluenceScore === "number") {
        primingScoreCount += 1;
        primingScoreTotal += caseResult.primingInfluenceScore;
      }
    }
  }

  return {
    caseCountsByDataset,
    caseCountsByScorer,
    executionFailures,
    explicitRecallLeakCount,
    passedBlockingCases,
    primingAverageScore:
      primingScoreCount === 0 ? null : primingScoreTotal / primingScoreCount,
    totalBlockingCases,
    totalCases,
  };
}

function chunkCases(input: {
  cases: readonly ImplicitMemBenchResearchCase[];
  shards: number;
}): ImplicitMemBenchResearchCase[][] {
  const shards = Array.from(
    { length: input.shards },
    () => [] as ImplicitMemBenchResearchCase[],
  );
  for (const [index, caseDefinition] of input.cases.entries()) {
    shards[index % input.shards]!.push(caseDefinition);
  }

  return shards;
}

async function runWithShardConcurrency<T, TResult>(input: {
  items: readonly T[];
  limit: number;
  worker: (item: T, index: number) => Promise<TResult>;
}): Promise<TResult[]> {
  if (input.items.length === 0) {
    return [];
  }

  const results = new Array<TResult>(input.items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < input.items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await input.worker(input.items[current]!, current);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(input.limit, input.items.length) },
      () => worker(),
    ),
  );

  return results;
}

function mergeProfileCases(
  shardReports: readonly ImplicitMemBenchResearchReport[],
  profile: ImplicitMemBenchResearchProfile,
  orderedCases: readonly ImplicitMemBenchResearchCase[],
): ImplicitMemBenchCaseResult[] {
  const byCaseId = new Map<string, ImplicitMemBenchCaseResult>();
  for (const report of shardReports) {
    for (const caseResult of report.profiles[profile]?.cases ?? []) {
      byCaseId.set(caseResult.caseId, caseResult);
    }
  }

  return orderedCases
    .map((caseDefinition) => byCaseId.get(caseDefinition.caseId))
    .filter((caseResult): caseResult is ImplicitMemBenchCaseResult =>
      Boolean(caseResult),
    );
}

function buildMergedReport(input: {
  benchmarkRoot: string;
  generatedAt: string;
  kind: "baseline" | "goodmemory";
  manifestPath: string;
  outputDir: string;
  profiles: Partial<
    Record<ImplicitMemBenchResearchProfile, ImplicitMemBenchProfileSummary>
  >;
  runDirectory: string;
  runId: string;
}): ImplicitMemBenchResearchReport {
  return {
    benchmarkRoot: input.benchmarkRoot,
    generatedAt: input.generatedAt,
    generatedBy: GENERATED_BY,
    kind: input.kind,
    manifestPath: input.manifestPath,
    mode: "live",
    outputDir: input.outputDir,
    profiles: input.profiles,
    runDirectory: input.runDirectory,
    runId: input.runId,
    source: RESEARCH_SOURCE,
    summary: summarizeReport(input.profiles),
  };
}

function mapCaseResultsById(
  cases: readonly ImplicitMemBenchCaseResult[],
): Map<string, ImplicitMemBenchCaseResult> {
  return new Map(cases.map((caseResult) => [caseResult.caseId, caseResult]));
}

function blockingPassRate(
  summary: ImplicitMemBenchProfileSummary | undefined,
  scorerFamily: ImplicitMemBenchScorerFamily,
): number | null {
  if (!summary) {
    return null;
  }

  const cases = summary.cases.filter(
    (caseResult) =>
      caseResult.scorerFamily === scorerFamily && caseResult.blocking,
  );
  if (cases.length === 0) {
    return null;
  }

  return cases.filter((caseResult) => caseResult.passed).length / cases.length;
}

function buildComparisonReport(input: {
  baselineReport: ImplicitMemBenchResearchReport;
  goodmemoryReport: ImplicitMemBenchResearchReport;
  outputDir: string;
  runDirectory: string;
  runId: string;
}): ImplicitMemBenchComparisonReport {
  const baselineCases = mapCaseResultsById(
    input.baselineReport.profiles["baseline-upstream-chat"]?.cases ?? [],
  );
  const rawCases = mapCaseResultsById(
    input.goodmemoryReport.profiles["goodmemory-raw-experience"]?.cases ?? [],
  );
  const distilledCases = mapCaseResultsById(
    input.goodmemoryReport.profiles["goodmemory-distilled-feedback"]?.cases ?? [],
  );
  const caseIds = [
    ...new Set([
      ...baselineCases.keys(),
      ...rawCases.keys(),
      ...distilledCases.keys(),
    ]),
  ].sort();
  const comparisonCases = caseIds.map((caseId) => {
    const baseline = baselineCases.get(caseId);
    const raw = rawCases.get(caseId);
    const distilled = distilledCases.get(caseId);
    const exemplar = baseline ?? raw ?? distilled;
    if (!exemplar) {
      throw new Error(`Missing comparison exemplar for ${caseId}`);
    }

    return {
      baseline,
      caseId,
      datasetFamily: exemplar.datasetFamily,
      distilled,
      raw,
      scorerFamily: exemplar.scorerFamily,
      sourceFile: exemplar.sourceFile,
      taskFile: exemplar.taskFile,
      taskName: exemplar.taskName,
    };
  });
  const baselineSummary = input.baselineReport.profiles["baseline-upstream-chat"];
  const rawSummary = input.goodmemoryReport.profiles["goodmemory-raw-experience"];
  const distilledSummary =
    input.goodmemoryReport.profiles["goodmemory-distilled-feedback"];

  return {
    baselineReportPath: join(input.baselineReport.runDirectory, "report.json"),
    benchmarkRoot: input.baselineReport.benchmarkRoot,
    comparison: {
      byScorer: {
        priming_pair_judge: {
          baselineBlockingPassRate: null,
          caseCount: comparisonCases.filter(
            (caseResult) => caseResult.scorerFamily === "priming_pair_judge",
          ).length,
          goodmemoryDistilledBlockingPassRate: null,
          goodmemoryRawBlockingPassRate: null,
          primingDeltaOfDelta:
            rawSummary?.primingAverageScore === null ||
            rawSummary?.primingAverageScore === undefined ||
            baselineSummary?.primingAverageScore === null ||
            baselineSummary?.primingAverageScore === undefined
              ? null
              : rawSummary.primingAverageScore - baselineSummary.primingAverageScore,
          primingScoreBaseline: baselineSummary?.primingAverageScore ?? null,
          primingScoreRaw: rawSummary?.primingAverageScore ?? null,
        },
        structured_first_action: {
          baselineBlockingPassRate: blockingPassRate(
            baselineSummary,
            "structured_first_action",
          ),
          caseCount: comparisonCases.filter(
            (caseResult) =>
              caseResult.scorerFamily === "structured_first_action",
          ).length,
          goodmemoryDistilledBlockingPassRate: blockingPassRate(
            distilledSummary,
            "structured_first_action",
          ),
          goodmemoryRawBlockingPassRate: blockingPassRate(
            rawSummary,
            "structured_first_action",
          ),
          primingDeltaOfDelta: null,
          primingScoreBaseline: null,
          primingScoreRaw: null,
        },
        text_behavior_judge: {
          baselineBlockingPassRate: blockingPassRate(
            baselineSummary,
            "text_behavior_judge",
          ),
          caseCount: comparisonCases.filter(
            (caseResult) => caseResult.scorerFamily === "text_behavior_judge",
          ).length,
          goodmemoryDistilledBlockingPassRate: blockingPassRate(
            distilledSummary,
            "text_behavior_judge",
          ),
          goodmemoryRawBlockingPassRate: blockingPassRate(
            rawSummary,
            "text_behavior_judge",
          ),
          primingDeltaOfDelta: null,
          primingScoreBaseline: null,
          primingScoreRaw: null,
        },
      },
      cases: comparisonCases,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: GENERATED_BY,
    goodmemoryReportPath: join(input.goodmemoryReport.runDirectory, "report.json"),
    kind: "comparison",
    manifestPath: input.baselineReport.manifestPath,
    mode: "live",
    outputDir: input.outputDir,
    runDirectory: input.runDirectory,
    runId: input.runId,
    source: RESEARCH_SOURCE,
    summary: {
      caseCount: comparisonCases.length,
      scorerFamilies: [...ALL_SCORER_FAMILIES],
    },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function runPhase61Full300(
  input?: Phase61Full300Options,
  dependencies?: Phase61Full300Dependencies,
): Promise<Phase61Full300Result> {
  const env = dependencies?.env ?? process.env;
  const resolved = resolvePhase61Full300Options(input);
  configurePhase61Full300Environment(resolved, env);

  const manifestPath = join(
    resolvePhase60RepoRoot(),
    "fixtures/implicitmembench-research/adapter-manifest.json",
  );
  const listCases = dependencies?.listCases ?? listImplicitMemBenchResearchCases;
  const allCases = await listCases({
    benchmarkRoot: resolved.benchmarkRoot,
    manifestPath,
  });
  const shardCases = chunkCases({
    cases: allCases,
    shards: resolved.shards,
  });
  const runEval = dependencies?.runEval ?? runPhase60Eval;
  const shardResults = await runWithShardConcurrency({
    items: shardCases,
    limit: resolved.shardConcurrency,
    worker: async (cases, index) => {
      const shardNumber = index + 1;
      const shardRunId = `${resolved.runId}-shard-${String(shardNumber).padStart(
        2,
        "0",
      )}`;
      console.error(
        `Phase 61 shard ${shardNumber}/${resolved.shards} started: ${cases.length} cases`,
      );
      const result = await runEval(
        {
          benchmarkRoot: resolved.benchmarkRoot,
          cases,
          maxConcurrency: resolved.maxConcurrency,
          outputDir: resolved.outputDir,
          runId: shardRunId,
          smoke: false,
        },
        dependencies,
      );
      console.error(`Phase 61 shard ${shardNumber}/${resolved.shards} finished.`);
      return result;
    },
  });

  const baselineShardReports = shardResults.map((result) => result.baselineReport);
  const goodmemoryShardReports = shardResults.map(
    (result) => result.goodmemoryReport,
  );

  const runDirectory = resolve(resolved.outputDir, resolved.runId);
  const baselineRunDirectory = resolve(
    resolved.outputDir,
    "baseline",
    resolved.runId,
  );
  const goodmemoryRunDirectory = resolve(
    resolved.outputDir,
    "goodmemory",
    resolved.runId,
  );
  const comparisonRunDirectory = resolve(
    resolved.outputDir,
    "comparison",
    resolved.runId,
  );
  const baselineProfiles = {
    "baseline-upstream-chat": summarizeCases(
      mergeProfileCases(
        baselineShardReports,
        "baseline-upstream-chat",
        allCases,
      ),
    ),
  } satisfies ImplicitMemBenchResearchReport["profiles"];
  const goodmemoryProfiles = {
    "goodmemory-raw-experience": summarizeCases(
      mergeProfileCases(
        goodmemoryShardReports,
        "goodmemory-raw-experience",
        allCases,
      ),
    ),
    "goodmemory-distilled-feedback": summarizeCases(
      mergeProfileCases(
        goodmemoryShardReports,
        "goodmemory-distilled-feedback",
        allCases,
      ),
    ),
  } satisfies ImplicitMemBenchResearchReport["profiles"];
  const generatedAt = new Date().toISOString();
  const baselineReport = buildMergedReport({
    benchmarkRoot: resolved.benchmarkRoot,
    generatedAt,
    kind: "baseline",
    manifestPath,
    outputDir: resolve(resolved.outputDir, "baseline"),
    profiles: baselineProfiles,
    runDirectory: baselineRunDirectory,
    runId: resolved.runId,
  });
  const goodmemoryReport = buildMergedReport({
    benchmarkRoot: resolved.benchmarkRoot,
    generatedAt,
    kind: "goodmemory",
    manifestPath,
    outputDir: resolve(resolved.outputDir, "goodmemory"),
    profiles: goodmemoryProfiles,
    runDirectory: goodmemoryRunDirectory,
    runId: resolved.runId,
  });
  const comparisonReport = buildComparisonReport({
    baselineReport,
    goodmemoryReport,
    outputDir: resolve(resolved.outputDir, "comparison"),
    runDirectory: comparisonRunDirectory,
    runId: resolved.runId,
  });
  const summary = buildPhase60OverallSummary({
    baselineReport,
    cases: allCases,
    generatedAt,
    generatedBy: GENERATED_BY,
    goodmemoryReport,
    outputDir: resolved.outputDir,
    runDirectory,
    runId: resolved.runId,
  });

  await Promise.all([
    writeJson(join(baselineRunDirectory, "report.json"), baselineReport),
    writeJson(join(goodmemoryRunDirectory, "report.json"), goodmemoryReport),
    writeJson(join(comparisonRunDirectory, "report.json"), comparisonReport),
    writeJson(resolvePhase60OverallSummaryPath(resolved.outputDir, resolved.runId), summary),
    writeJson(join(runDirectory, "report.json"), summary),
  ]);

  return {
    baselineReportPath: resolvePhase60BaselineReportPath(
      resolved.outputDir,
      resolved.runId,
    ),
    goodmemoryReportPath: resolvePhase60GoodMemoryReportPath(
      resolved.outputDir,
      resolved.runId,
    ),
    overallSummaryPath: resolvePhase60OverallSummaryPath(
      resolved.outputDir,
      resolved.runId,
    ),
    outputDir: resolved.outputDir,
    reportPath: join(runDirectory, "report.json"),
    runDirectory,
    runId: resolved.runId,
    shardCount: resolved.shards,
    shardReportPaths: shardCases.map((_, index) =>
      resolvePhase60OverallSummaryPath(
        resolved.outputDir,
        `${resolved.runId}-shard-${String(index + 1).padStart(2, "0")}`,
      ),
    ),
    summary,
  };
}

function buildCliResult(result: Phase61Full300Result): object {
  return {
    generatedBy: GENERATED_BY,
    runId: result.runId,
    outputDir: result.outputDir,
    shardCount: result.shardCount,
    shardReportPaths: result.shardReportPaths,
    paths: {
      baselineReportPath: result.baselineReportPath,
      goodmemoryReportPath: result.goodmemoryReportPath,
      overallSummaryPath: result.overallSummaryPath,
      reportPath: result.reportPath,
      runDirectory: result.runDirectory,
    },
    comparison: result.summary.comparison,
    profiles: Object.fromEntries(
      Object.entries(result.summary.profiles).map(([profile, summary]) => [
        profile,
        summary
          ? {
              blockingScore: summary.blockingScore,
              full300OverallScore: summary.full300OverallScore,
              overallComparableToOfficial: summary.overallComparableToOfficial,
              primingContaminationCount: summary.primingContaminationCount,
              primingScore: summary.primingScore,
              primingTaskViolationCount: summary.primingTaskViolationCount,
              primingViolationCounts: summary.primingViolationCounts,
            }
          : null,
      ]),
    ),
  };
}

async function main(): Promise<void> {
  const options = parsePhase61Full300CliOptions(process.argv);
  const resolved = resolvePhase61Full300Options(options);
  const envSummary = configurePhase61Full300Environment(resolved);

  console.error("Phase 61 live full-300 started.");
  console.error(`runId: ${resolved.runId}`);
  console.error(`benchmarkRoot: ${resolved.benchmarkRoot}`);
  console.error(`outputDir: ${resolved.outputDir}`);
  console.error(`storageProvider: ${envSummary.storageProvider}`);
  console.error(`postgresUrlSource: ${envSummary.postgresUrlSource}`);
  console.error(`primingTimeoutMs: ${resolved.primingTimeoutMs}`);
  console.error(`shards: ${resolved.shards}`);
  console.error(`shardConcurrency: ${resolved.shardConcurrency}`);
  if (resolved.maxConcurrency) {
    console.error(`maxConcurrency: ${resolved.maxConcurrency}`);
  }

  const result = await runPhase61Full300(resolved);
  console.log(JSON.stringify(buildCliResult(result), null, 2));
}

if (import.meta.main) {
  await main();
}
