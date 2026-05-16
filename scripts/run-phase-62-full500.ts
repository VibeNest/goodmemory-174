import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveCliFlagValue } from "./cli-options";
import {
  runPhase62LongMemEval,
  type Phase62EvalDependencies,
} from "./run-phase-62-eval";
import {
  PHASE62_FULL500_CANONICAL_RUN_ID,
  runPhase62Full500Summary,
  type Phase62Full500SummaryDependencies,
} from "./run-phase-62-full500-summary";
import {
  resolvePhase62BenchmarkRoot,
  resolvePhase62OutputDir,
  resolvePhase62RepoRoot,
  type Phase62CliOptions,
} from "./run-phase-62-shared";
import {
  LONGMEMEVAL_PROFILES,
  type LongMemEvalProfile,
  type LongMemEvalReport,
} from "../src/eval/longmemeval";

const DEFAULT_SHARDS = 10;
const DEFAULT_SHARD_SIZE = 50;
const DEFAULT_SHARD_CONCURRENCY = 1;
const DEFAULT_CASE_CONCURRENCY = 1;

export interface Phase62Full500Options {
  benchmarkRoot?: string;
  caseConcurrency?: number;
  continueOnExecutionFailure?: boolean;
  outputDir?: string;
  profiles?: readonly string[];
  resumeExistingShards?: boolean;
  runId?: string;
  shardConcurrency?: number;
  shardSize?: number;
  shards?: number;
}

export interface Phase62Full500Dependencies {
  runShard?: (
    options: Partial<Phase62CliOptions>,
    dependencies?: Phase62EvalDependencies,
  ) => Promise<LongMemEvalReport>;
  readShardReport?: (
    runId: string,
    outputDir: string,
  ) => Promise<LongMemEvalReport | null>;
  summarize?: (
    options?: Parameters<typeof runPhase62Full500Summary>[0],
    dependencies?: Phase62Full500SummaryDependencies,
  ) => Promise<LongMemEvalReport>;
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

function parseBooleanFlag(argv: readonly string[], flagName: string): boolean {
  return argv.includes(flagName);
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

function parsePhase62Full500Options(
  argv: readonly string[],
): Phase62Full500Options {
  return {
    benchmarkRoot: resolveCliFlagValue(argv, "--benchmark-root"),
    caseConcurrency: parsePositiveInteger(
      resolveCliFlagValue(argv, "--case-concurrency"),
      "--case-concurrency",
    ),
    continueOnExecutionFailure: parseBooleanFlag(
      argv,
      "--continue-on-execution-failure",
    ),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    profiles: parseRepeatedFlag(argv, "--profile"),
    resumeExistingShards: parseBooleanFlag(argv, "--resume-existing-shards"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    shardConcurrency: parsePositiveInteger(
      resolveCliFlagValue(argv, "--shard-concurrency"),
      "--shard-concurrency",
    ),
    shardSize: parsePositiveInteger(
      resolveCliFlagValue(argv, "--shard-size"),
      "--shard-size",
    ),
    shards: parsePositiveInteger(resolveCliFlagValue(argv, "--shards"), "--shards"),
  };
}

function normalizeFull500Profiles(
  profiles?: readonly string[],
): LongMemEvalProfile[] {
  if (!profiles || profiles.length === 0) {
    return [...LONGMEMEVAL_PROFILES];
  }

  const requested = new Set(profiles);
  for (const profile of requested) {
    if (!LONGMEMEVAL_PROFILES.includes(profile as LongMemEvalProfile)) {
      throw new Error(`Unsupported LongMemEval profile: ${profile}`);
    }
  }
  return LONGMEMEVAL_PROFILES.filter((profile) => requested.has(profile));
}

export function buildPhase62Full500ShardOptions(input: {
  benchmarkRoot: string;
  caseConcurrency: number;
  outputDir: string;
  profiles: readonly string[];
  runId: string;
  shardSize: number;
  shards: number;
}): Partial<Phase62CliOptions>[] {
  return Array.from({ length: input.shards }, (_, index) => ({
    benchmarkRoot: input.benchmarkRoot,
    limit: input.shardSize,
    maxConcurrency: input.caseConcurrency,
    mode: "full",
    offset: index * input.shardSize,
    outputDir: input.outputDir,
    profiles: input.profiles,
    runId: `${input.runId}-shard-${String(index + 1).padStart(2, "0")}`,
  }));
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

function assertNoShardExecutionFailures(report: LongMemEvalReport): void {
  if (report.summary.executionFailures === 0) {
    return;
  }

  throw new Error(
    `Phase 62 full-500 shard ${report.runId} has ${report.summary.executionFailures} execution failures; refusing to continue closure run.`,
  );
}

async function readExistingShardReport(
  runId: string,
  outputDir: string,
): Promise<LongMemEvalReport | null> {
  try {
    return JSON.parse(
      await readFile(join(outputDir, runId, "report.json"), "utf8"),
    ) as LongMemEvalReport;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function runPhase62Full500LongMemEval(
  options: Phase62Full500Options = {},
  dependencies: Phase62Full500Dependencies = {},
): Promise<LongMemEvalReport> {
  const root = resolvePhase62RepoRoot();
  const runShard = dependencies.runShard ?? runPhase62LongMemEval;
  const readShardReport = dependencies.readShardReport ?? readExistingShardReport;
  const summarize = dependencies.summarize ?? runPhase62Full500Summary;
  const runId = options.runId ?? PHASE62_FULL500_CANONICAL_RUN_ID;
  const shardSize = options.shardSize ?? DEFAULT_SHARD_SIZE;
  const shards = options.shards ?? DEFAULT_SHARDS;
  const outputDir = options.outputDir ?? resolvePhase62OutputDir(root);
  const benchmarkRoot =
    options.benchmarkRoot ?? resolvePhase62BenchmarkRoot(root, false);
  const profiles = normalizeFull500Profiles(options.profiles);
  const shardOptions = buildPhase62Full500ShardOptions({
    benchmarkRoot,
    caseConcurrency: options.caseConcurrency ?? DEFAULT_CASE_CONCURRENCY,
    outputDir,
    profiles,
    runId,
    shardSize,
    shards,
  });
  const shardConcurrency =
    options.shardConcurrency ?? DEFAULT_SHARD_CONCURRENCY;

  const reports = await runWithConcurrency({
    items: shardOptions,
    limit: shardConcurrency,
    map: async (shardOption) => {
      const shardRunId = String(shardOption.runId);
      if (options.resumeExistingShards) {
        const existingReport = await readShardReport(shardRunId, outputDir);
        if (existingReport) {
          console.error(
            `Phase 62 full-500 shard reused: ${shardRunId}; executionFailures=${existingReport.summary.executionFailures}`,
          );
          if (!options.continueOnExecutionFailure) {
            assertNoShardExecutionFailures(existingReport);
          }
          return existingReport;
        }
      }
      console.error(`Phase 62 full-500 shard started: ${shardOption.runId}`);
      const report = await runShard(shardOption);
      console.error(
        `Phase 62 full-500 shard finished: ${shardOption.runId}; executionFailures=${report.summary.executionFailures}`,
      );
      if (!options.continueOnExecutionFailure) {
        assertNoShardExecutionFailures(report);
      }
      return report;
    },
  });

  return summarize({
    expectedTotalCases: shardSize * shards,
    outputDir,
    profiles,
    runId,
    shardRunIds: reports.map((report) => report.runId),
  });
}

if (import.meta.main) {
  const report = await runPhase62Full500LongMemEval(
    parsePhase62Full500Options(Bun.argv),
  );
  console.log(
    JSON.stringify(
      {
        executionFailures: report.summary.executionFailures,
        profiles: Object.fromEntries(
          LONGMEMEVAL_PROFILES.map((profile) => [
            profile,
            report.profiles[profile]?.summary,
          ]),
        ),
        runDirectory: report.runDirectory,
        runId: report.runId,
        totalCases: report.summary.totalCases,
      },
      null,
      2,
    ),
  );
}
