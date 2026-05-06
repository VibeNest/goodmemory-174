import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { runPhase62LongMemEval } from "./run-phase-62-eval";
import type { Phase62EvalDependencies } from "./run-phase-62-eval";
import {
  runPhase62Full500Summary,
} from "./run-phase-62-full500-summary";
import type {
  Phase62Full500SummaryDependencies,
} from "./run-phase-62-full500-summary";
import {
  resolvePhase62BenchmarkRoot,
  resolvePhase62OutputDir,
  resolvePhase62RepoRoot,
} from "./run-phase-62-shared";
import type { Phase62CliOptions } from "./run-phase-62-shared";
import {
  LONGMEMEVAL_PROFILES,
  normalizeLongMemEvalProfileList,
} from "../src/eval/longmemeval";
import type {
  LongMemEvalCaseResult,
  LongMemEvalProfile,
  LongMemEvalReport,
} from "../src/eval/longmemeval";

const DEFAULT_BATCH_CONCURRENCY = 1;
const DEFAULT_CASE_CONCURRENCY = 1;
const DEFAULT_CHUNK_SIZE = 10;
const DEFAULT_EXPECTED_TOTAL_CASES = 500;

export interface Phase62FailureRetryBatch {
  caseIds: string[];
  profile: LongMemEvalProfile;
  runId: string;
}

export interface Phase62Full500RetryFailureOptions {
  batchConcurrency?: number;
  benchmarkRoot?: string;
  caseConcurrency?: number;
  chunkSize?: number;
  continueOnExecutionFailure?: boolean;
  dryRun?: boolean;
  expectedTotalCases?: number;
  maxBatches?: number;
  mergedRunId?: string;
  outputDir?: string;
  profiles?: readonly string[];
  retryRunId?: string;
  sourceRunIds?: readonly string[];
}

export interface Phase62Full500RetryFailureDependencies {
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  runBatch?: (
    options: Partial<Phase62CliOptions>,
    dependencies?: Phase62EvalDependencies,
  ) => Promise<LongMemEvalReport>;
  summarize?: (
    options?: Parameters<typeof runPhase62Full500Summary>[0],
    dependencies?: Phase62Full500SummaryDependencies,
  ) => Promise<LongMemEvalReport>;
}

export interface Phase62Full500RetryFailureResult {
  batches: Phase62FailureRetryBatch[];
  executedBatches: Phase62FailureRetryBatch[];
  mergedReport?: LongMemEvalReport;
  sourceRunIds: string[];
  stoppedOnExecutionFailure?: {
    executionFailures: number;
    runId: string;
  };
}

function parseBooleanFlag(argv: readonly string[], flagName: string): boolean {
  return argv.includes(flagName);
}

function parsePositiveInteger(
  value: string | undefined,
  flagName: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function parseRepeatedFlag(
  argv: readonly string[],
  flagName: string,
): string[] | undefined {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flagName) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${flagName} requires a value`);
      }
      values.push(value);
    }
  }
  return values.length === 0 ? undefined : values;
}

function parsePhase62Full500RetryFailureOptions(
  argv: readonly string[],
): Phase62Full500RetryFailureOptions {
  return {
    batchConcurrency: parsePositiveInteger(
      resolveCliFlagValue(argv, "--batch-concurrency"),
      "--batch-concurrency",
    ),
    benchmarkRoot: resolveCliFlagValue(argv, "--benchmark-root"),
    caseConcurrency: parsePositiveInteger(
      resolveCliFlagValue(argv, "--case-concurrency"),
      "--case-concurrency",
    ),
    chunkSize: parsePositiveInteger(
      resolveCliFlagValue(argv, "--chunk-size"),
      "--chunk-size",
    ),
    continueOnExecutionFailure: parseBooleanFlag(
      argv,
      "--continue-on-execution-failure",
    ),
    dryRun: parseBooleanFlag(argv, "--dry-run"),
    expectedTotalCases: parsePositiveInteger(
      resolveCliFlagValue(argv, "--expected-total-cases"),
      "--expected-total-cases",
    ),
    maxBatches: parsePositiveInteger(
      resolveCliFlagValue(argv, "--max-batches"),
      "--max-batches",
    ),
    mergedRunId: resolveCliFlagValue(argv, "--merged-run-id"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    profiles: parseRepeatedFlag(argv, "--profile"),
    retryRunId: resolveCliFlagValue(argv, "--retry-run-id"),
    sourceRunIds: parseRepeatedFlag(argv, "--source-run-id"),
  };
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function buildDefaultRetryRunId(now: Date): string {
  return `run-phase62-longmemeval-full500-failure-retry-${formatTimestamp(now)}`;
}

function buildBatchRunId(input: {
  batchIndex: number;
  profile: LongMemEvalProfile;
  retryRunId: string;
}): string {
  return `${input.retryRunId}-${input.profile}-batch-${String(input.batchIndex).padStart(3, "0")}`;
}

function validateReport(value: unknown, path: string): LongMemEvalReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Phase 62 retry source report must be an object: ${path}`);
  }

  const report = value as LongMemEvalReport;
  if (report.phase !== "phase-62" || report.mode !== "full") {
    throw new Error(`Phase 62 retry source report must be a full phase-62 report: ${path}`);
  }
  if (report.source?.benchmark !== "LongMemEval") {
    throw new Error(`Phase 62 retry source report must be LongMemEval: ${path}`);
  }
  return report;
}

async function readSourceReports(input: {
  outputDir: string;
  readFile: (path: string) => Promise<string>;
  sourceRunIds: readonly string[];
}): Promise<LongMemEvalReport[]> {
  const reports: LongMemEvalReport[] = [];
  for (const sourceRunId of input.sourceRunIds) {
    const path = join(input.outputDir, sourceRunId, "report.json");
    reports.push(validateReport(JSON.parse(await input.readFile(path)), path));
  }
  return reports;
}

function shouldReplaceFailureSource(input: {
  candidate: LongMemEvalCaseResult;
  existing?: LongMemEvalCaseResult;
}): boolean {
  if (!input.existing) {
    return true;
  }
  if (input.candidate.executionError && !input.existing.executionError) {
    return false;
  }
  return true;
}

function collectLatestCasesByProfile(input: {
  profiles: readonly LongMemEvalProfile[];
  reports: readonly LongMemEvalReport[];
}): Map<LongMemEvalProfile, Map<string, LongMemEvalCaseResult>> {
  const byProfile = new Map<LongMemEvalProfile, Map<string, LongMemEvalCaseResult>>();
  for (const profile of input.profiles) {
    byProfile.set(profile, new Map());
  }

  for (const report of input.reports) {
    for (const profile of input.profiles) {
      const profileCases = report.profiles[profile]?.cases ?? [];
      const byQuestionId = byProfile.get(profile);
      if (!byQuestionId) {
        continue;
      }
      for (const candidate of profileCases) {
        const existing = byQuestionId.get(candidate.questionId);
        if (shouldReplaceFailureSource({ candidate, existing })) {
          byQuestionId.set(candidate.questionId, candidate);
        }
      }
    }
  }

  return byProfile;
}

export function buildPhase62FailureRetryBatches(input: {
  chunkSize: number;
  maxBatches?: number;
  profiles?: readonly string[];
  reports: readonly LongMemEvalReport[];
  retryRunId: string;
}): Phase62FailureRetryBatch[] {
  const profiles = normalizeLongMemEvalProfileList(input.profiles);
  const latestCasesByProfile = collectLatestCasesByProfile({
    profiles,
    reports: input.reports,
  });
  const batches: Phase62FailureRetryBatch[] = [];

  for (const profile of profiles) {
    const failedCaseIds = [...(latestCasesByProfile.get(profile)?.values() ?? [])]
      .filter((caseResult) => caseResult.executionError)
      .map((caseResult) => caseResult.questionId);

    for (
      let offset = 0;
      offset < failedCaseIds.length;
      offset += input.chunkSize
    ) {
      batches.push({
        caseIds: failedCaseIds.slice(offset, offset + input.chunkSize),
        profile,
        runId: buildBatchRunId({
          batchIndex: batches.length + 1,
          profile,
          retryRunId: input.retryRunId,
        }),
      });
    }
  }

  return input.maxBatches === undefined
    ? batches
    : batches.slice(0, input.maxBatches);
}

async function runWithConcurrency<TInput, TOutput>(input: {
  items: readonly TInput[];
  limit: number;
  map: (item: TInput) => Promise<TOutput>;
}): Promise<TOutput[]> {
  const results = new Array<TOutput>(input.items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < input.items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await input.map(input.items[index]!);
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

export async function runPhase62Full500FailureRetries(
  options: Phase62Full500RetryFailureOptions,
  dependencies: Phase62Full500RetryFailureDependencies = {},
): Promise<Phase62Full500RetryFailureResult> {
  if (!options.sourceRunIds || options.sourceRunIds.length === 0) {
    throw new Error("Phase 62 full-500 failure retry requires --source-run-id.");
  }

  const root = resolvePhase62RepoRoot();
  const now = dependencies.now ?? (() => new Date());
  const outputDir = options.outputDir ?? resolvePhase62OutputDir(root);
  const benchmarkRoot =
    options.benchmarkRoot ?? resolvePhase62BenchmarkRoot(root, false);
  const retryRunId = options.retryRunId ?? buildDefaultRetryRunId(now());
  const sourceRunIds = [...options.sourceRunIds];
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const runBatch = dependencies.runBatch ?? runPhase62LongMemEval;
  const summarize = dependencies.summarize ?? runPhase62Full500Summary;
  const reports = await readSourceReports({
    outputDir,
    readFile: readFileImpl,
    sourceRunIds,
  });
  const batches = buildPhase62FailureRetryBatches({
    chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
    maxBatches: options.maxBatches,
    profiles: options.profiles,
    reports,
    retryRunId,
  });

  if (options.dryRun) {
    return {
      batches,
      executedBatches: [],
      sourceRunIds,
    };
  }

  const batchConcurrency = options.batchConcurrency ?? DEFAULT_BATCH_CONCURRENCY;
  const runSingleBatch = async (
    batch: Phase62FailureRetryBatch,
  ): Promise<LongMemEvalReport> => {
    console.error(
      `Phase 62 full-500 retry batch started: ${batch.runId}; profile=${batch.profile}; cases=${batch.caseIds.length}`,
    );
    const report = await runBatch({
      benchmarkRoot,
      caseIds: batch.caseIds,
      maxConcurrency: options.caseConcurrency ?? DEFAULT_CASE_CONCURRENCY,
      mode: "full",
      outputDir,
      profiles: [batch.profile],
      runId: batch.runId,
    });
    console.error(
      `Phase 62 full-500 retry batch finished: ${batch.runId}; executionFailures=${report.summary.executionFailures}`,
    );
    return report;
  };
  const batchReports: LongMemEvalReport[] = [];
  const executedBatches: Phase62FailureRetryBatch[] = [];
  let stoppedOnExecutionFailure:
    | Phase62Full500RetryFailureResult["stoppedOnExecutionFailure"]
    | undefined;

  if (!options.continueOnExecutionFailure && batchConcurrency === 1) {
    for (const batch of batches) {
      const report = await runSingleBatch(batch);
      batchReports.push(report);
      executedBatches.push(batch);
      if (report.summary.executionFailures > 0) {
        stoppedOnExecutionFailure = {
          executionFailures: report.summary.executionFailures,
          runId: report.runId,
        };
        console.error(
          `Phase 62 full-500 retry stopped after ${report.runId}; executionFailures=${report.summary.executionFailures}`,
        );
        break;
      }
    }
  } else {
    batchReports.push(
      ...(await runWithConcurrency({
        items: batches,
        limit: batchConcurrency,
        map: runSingleBatch,
      })),
    );
    executedBatches.push(...batches);
    if (!options.continueOnExecutionFailure) {
      const failedReport = batchReports.find(
        (report) => report.summary.executionFailures > 0,
      );
      if (failedReport) {
        stoppedOnExecutionFailure = {
          executionFailures: failedReport.summary.executionFailures,
          runId: failedReport.runId,
        };
      }
    }
  }

  const mergedReport = await summarize({
    allowDuplicateCaseCoverage: true,
    expectedTotalCases:
      options.expectedTotalCases ?? DEFAULT_EXPECTED_TOTAL_CASES,
    outputDir,
    runId: options.mergedRunId ?? `${retryRunId}-merged`,
    shardRunIds: [...sourceRunIds, ...batchReports.map((report) => report.runId)],
  });

  return {
    batches,
    executedBatches,
    mergedReport,
    sourceRunIds,
    stoppedOnExecutionFailure,
  };
}

if (import.meta.main) {
  const result = await runPhase62Full500FailureRetries(
    parsePhase62Full500RetryFailureOptions(Bun.argv),
  );
  console.log(
    JSON.stringify(
      {
        batchCount: result.batches.length,
        executedBatchCount: result.executedBatches.length,
        mergedExecutionFailures: result.mergedReport?.summary.executionFailures,
        mergedRunDirectory: result.mergedReport?.runDirectory,
        mergedRunId: result.mergedReport?.runId,
        sourceRunIds: result.sourceRunIds,
        stoppedOnExecutionFailure: result.stoppedOnExecutionFailure,
      },
      null,
      2,
    ),
  );
}
