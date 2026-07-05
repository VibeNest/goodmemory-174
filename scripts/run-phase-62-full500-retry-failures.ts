import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasCliFlagStrict, resolveCliFlagValueStrict } from "./cli-options";
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
  normalizeLongMemEvalProfileList,
} from "../src/eval/longmemeval";
import type {
  LongMemEvalCaseResult,
  LongMemEvalProfile,
  LongMemEvalReport,
} from "../src/eval/longmemeval";

const DEFAULT_BATCH_CONCURRENCY = 1;
const DEFAULT_BATCH_DELAY_MS = 0;
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
  batchDelayMs?: number;
  benchmarkRoot?: string;
  caseConcurrency?: number;
  chunkSize?: number;
  continueOnExecutionFailure?: boolean;
  dryRun?: boolean;
  expectedTotalCases?: number;
  excludeCaseIds?: readonly string[];
  maxBatches?: number;
  mergedRunId?: string;
  outputDir?: string;
  profiles?: readonly string[];
  resumeExistingBatches?: boolean;
  retryRunId?: string;
  sourceRunIds?: readonly string[];
}

export interface Phase62Full500RetryFailureDependencies {
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  readDir?: (path: string) => Promise<string[]>;
  runBatch?: (
    options: Partial<Phase62CliOptions>,
    dependencies?: Phase62EvalDependencies,
  ) => Promise<LongMemEvalReport>;
  summarize?: (
    options?: Parameters<typeof runPhase62Full500Summary>[0],
    dependencies?: Phase62Full500SummaryDependencies,
  ) => Promise<LongMemEvalReport>;
  sleep?: (ms: number) => Promise<void>;
}

export interface Phase62Full500RetryFailureResult {
  batches: Phase62FailureRetryBatch[];
  executedBatches: Phase62FailureRetryBatch[];
  mergedReport?: LongMemEvalReport;
  resumedBatchRunIds: string[];
  sourceRunIds: string[];
  stoppedOnExecutionFailure?: {
    executionFailures: number;
    runId: string;
  };
}

function parseBooleanFlag(argv: readonly string[], flagName: string): boolean {
  return hasCliFlagStrict(argv, flagName);
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

function parseNonNegativeInteger(
  value: string | undefined,
  flagName: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer`);
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

function parseCaseExclusionFlags(argv: readonly string[]): string[] | undefined {
  const values = [
    ...(parseRepeatedFlag(argv, "--exclude-case-id") ?? []),
    ...(parseRepeatedFlag(argv, "--skip-case-id") ?? []),
  ];
  return values.length === 0 ? undefined : values;
}

export function parsePhase62Full500RetryFailureOptions(
  argv: readonly string[],
): Phase62Full500RetryFailureOptions {
  return {
    batchConcurrency: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--batch-concurrency"),
      "--batch-concurrency",
    ),
    batchDelayMs: parseNonNegativeInteger(
      resolveCliFlagValueStrict(argv, "--batch-delay-ms"),
      "--batch-delay-ms",
    ),
    benchmarkRoot: resolveCliFlagValueStrict(argv, "--benchmark-root"),
    caseConcurrency: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--case-concurrency"),
      "--case-concurrency",
    ),
    chunkSize: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--chunk-size"),
      "--chunk-size",
    ),
    continueOnExecutionFailure: parseBooleanFlag(
      argv,
      "--continue-on-execution-failure",
    ),
    dryRun: parseBooleanFlag(argv, "--dry-run"),
    expectedTotalCases: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--expected-total-cases"),
      "--expected-total-cases",
    ),
    excludeCaseIds: parseCaseExclusionFlags(argv),
    maxBatches: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--max-batches"),
      "--max-batches",
    ),
    mergedRunId: resolveCliFlagValueStrict(argv, "--merged-run-id"),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    profiles: parseRepeatedFlag(argv, "--profile"),
    resumeExistingBatches: parseBooleanFlag(argv, "--resume-existing-batches"),
    retryRunId: resolveCliFlagValueStrict(argv, "--retry-run-id"),
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

function parseRetryBatchIndex(input: {
  retryRunId: string;
  runId: string;
}): number | null {
  if (!input.runId.startsWith(`${input.retryRunId}-`)) {
    return null;
  }

  const match = /-batch-(\d+)$/u.exec(input.runId);
  if (!match) {
    return null;
  }

  const batchIndex = Number(match[1]);
  return Number.isInteger(batchIndex) && batchIndex > 0 ? batchIndex : null;
}

export function discoverExistingRetryBatchRunIds(input: {
  entries: readonly string[];
  retryRunId: string;
}): string[] {
  return input.entries
    .map((entry) => ({
      batchIndex: parseRetryBatchIndex({
        retryRunId: input.retryRunId,
        runId: entry,
      }),
      runId: entry,
    }))
    .filter((entry): entry is { batchIndex: number; runId: string } =>
      entry.batchIndex !== null
    )
    .sort((left, right) => left.batchIndex - right.batchIndex)
    .map((entry) => entry.runId);
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
  excludeCaseIds?: readonly string[];
  maxBatches?: number;
  profiles?: readonly string[];
  reports: readonly LongMemEvalReport[];
  retryRunId: string;
  startingBatchIndex?: number;
}): Phase62FailureRetryBatch[] {
  const profiles = normalizeLongMemEvalProfileList(input.profiles);
  const latestCasesByProfile = collectLatestCasesByProfile({
    profiles,
    reports: input.reports,
  });
  const excludeCaseIds = new Set(input.excludeCaseIds ?? []);
  const batches: Phase62FailureRetryBatch[] = [];

  for (const profile of profiles) {
    const failedCaseIds = [...(latestCasesByProfile.get(profile)?.values() ?? [])]
      .filter((caseResult) =>
        caseResult.executionError && !excludeCaseIds.has(caseResult.questionId)
      )
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
          batchIndex: (input.startingBatchIndex ?? 1) + batches.length,
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
  const readDirImpl =
    dependencies.readDir ??
    (async (path: string) =>
      (await readdir(path, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name));
  const runBatch = dependencies.runBatch ?? runPhase62LongMemEval;
  const summarize = dependencies.summarize ?? runPhase62Full500Summary;
  const sleep =
    dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }));
  const reports = await readSourceReports({
    outputDir,
    readFile: readFileImpl,
    sourceRunIds,
  });
  const resumedBatchRunIds = options.resumeExistingBatches
    ? discoverExistingRetryBatchRunIds({
        entries: await readDirImpl(outputDir),
        retryRunId,
      })
    : [];
  const resumedBatchReports =
    resumedBatchRunIds.length === 0
      ? []
      : await readSourceReports({
          outputDir,
          readFile: readFileImpl,
          sourceRunIds: resumedBatchRunIds,
        });
  const latestBatchIndex = resumedBatchRunIds.reduce((max, runId) => {
    const batchIndex = parseRetryBatchIndex({ retryRunId, runId }) ?? 0;
    return Math.max(max, batchIndex);
  }, 0);
  const batches = buildPhase62FailureRetryBatches({
    chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
    excludeCaseIds: options.excludeCaseIds,
    maxBatches: options.maxBatches,
    profiles: options.profiles,
    reports: [...reports, ...resumedBatchReports],
    retryRunId,
    startingBatchIndex: latestBatchIndex + 1,
  });

  if (options.dryRun) {
    return {
      batches,
      executedBatches: [],
      resumedBatchRunIds,
      sourceRunIds,
    };
  }

  const batchConcurrency = options.batchConcurrency ?? DEFAULT_BATCH_CONCURRENCY;
  const batchDelayMs = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;
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
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index]!;
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
      if (batchDelayMs > 0 && index < batches.length - 1) {
        console.error(
          `Phase 62 full-500 retry waiting ${batchDelayMs}ms before next batch`,
        );
        await sleep(batchDelayMs);
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
    profiles: options.profiles,
    runId: options.mergedRunId ?? `${retryRunId}-merged`,
    shardRunIds: [
      ...sourceRunIds,
      ...resumedBatchRunIds,
      ...batchReports.map((report) => report.runId),
    ],
  });

  return {
    batches,
    executedBatches,
    mergedReport,
    resumedBatchRunIds,
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
        resumedBatchRunIds: result.resumedBatchRunIds,
        sourceRunIds: result.sourceRunIds,
        stoppedOnExecutionFailure: result.stoppedOnExecutionFailure,
      },
      null,
      2,
    ),
  );
}
