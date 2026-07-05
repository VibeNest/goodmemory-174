import { describe, expect, it } from "bun:test";
import {
  buildPhase62Full500ShardOptions,
  parsePhase62Full500Options,
  runPhase62Full500LongMemEval,
} from "../../scripts/run-phase-62-full500";
import {
  LONGMEMEVAL_PROFILES,
  type LongMemEvalReport,
} from "../../src/eval/longmemeval";

function buildReport(input: {
  executionFailures?: number;
  runId: string;
}): LongMemEvalReport {
  return {
    benchmarkRoot: "/tmp/LongMemEval",
    generatedAt: "2026-05-06T00:00:00.000Z",
    generatedBy: "scripts/run-phase-62-eval.ts",
    mode: "full",
    outputDir: "/tmp/phase62-full500-test",
    phase: "phase-62",
    profiles: {},
    runDirectory: `/tmp/phase62-full500-test/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: 0,
      caseCountsByQuestionType: {},
      executionFailures: input.executionFailures ?? 0,
      profilesCompared: [...LONGMEMEVAL_PROFILES],
      totalCases: 50,
    },
  };
}

describe("run-phase-62 full-500 runner", () => {
  it("rejects duplicate boolean mode flags before running full-500 shards", () => {
    for (const flag of [
      "--continue-on-execution-failure",
      "--resume-existing-shards",
    ]) {
      expect(() =>
        parsePhase62Full500Options([
          "bun",
          "run",
          "scripts/run-phase-62-full500.ts",
          flag,
          flag,
        ]),
      ).toThrow(`${flag} cannot be specified more than once.`);
    }
  });

  it("builds ten fixed-size shard options by offset", () => {
    expect(
      buildPhase62Full500ShardOptions({
        benchmarkRoot: "/tmp/LongMemEval",
        caseConcurrency: 1,
        outputDir: "/tmp/out",
        profiles: [...LONGMEMEVAL_PROFILES],
        runId: "run-full500",
        shardSize: 50,
        shards: 3,
      }),
    ).toEqual([
      {
        benchmarkRoot: "/tmp/LongMemEval",
        limit: 50,
        maxConcurrency: 1,
        mode: "full",
        offset: 0,
        outputDir: "/tmp/out",
        profiles: [...LONGMEMEVAL_PROFILES],
        runId: "run-full500-shard-01",
      },
      {
        benchmarkRoot: "/tmp/LongMemEval",
        limit: 50,
        maxConcurrency: 1,
        mode: "full",
        offset: 50,
        outputDir: "/tmp/out",
        profiles: [...LONGMEMEVAL_PROFILES],
        runId: "run-full500-shard-02",
      },
      {
        benchmarkRoot: "/tmp/LongMemEval",
        limit: 50,
        maxConcurrency: 1,
        mode: "full",
        offset: 100,
        outputDir: "/tmp/out",
        profiles: [...LONGMEMEVAL_PROFILES],
        runId: "run-full500-shard-03",
      },
    ]);
  });

  it("summarizes only after all shards finish without execution failures", async () => {
    const shardRunIds: string[] = [];

    const report = await runPhase62Full500LongMemEval(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        outputDir: "/tmp/phase62-full500-test",
        runId: "run-full500",
        shardSize: 50,
        shards: 2,
      },
      {
        runShard: async (options) => {
          shardRunIds.push(String(options.runId));
          return buildReport({ runId: String(options.runId) });
        },
        summarize: async (options) =>
          buildReport({
            runId: String(options?.runId),
          }),
      },
    );

    expect(shardRunIds).toEqual([
      "run-full500-shard-01",
      "run-full500-shard-02",
    ]);
    expect(report.runId).toBe("run-full500");
  });

  it("forwards selected profiles into the merged summary", async () => {
    let summarizedProfiles: readonly string[] | undefined;

    await runPhase62Full500LongMemEval(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        outputDir: "/tmp/phase62-full500-test",
        profiles: ["goodmemory-rules-only"],
        runId: "run-full500-rules-only",
        shardSize: 50,
        shards: 2,
      },
      {
        runShard: async (options) =>
          buildReport({
            runId: String(options.runId),
          }),
        summarize: async (options) => {
          summarizedProfiles = options?.profiles;
          return buildReport({
            runId: String(options?.runId),
          });
        },
      },
    );

    expect(summarizedProfiles).toEqual(["goodmemory-rules-only"]);
  });

  it("reuses existing shard reports when resume-existing-shards is enabled", async () => {
    const shardRunIds: string[] = [];
    const reusedRunIds: string[] = [];

    const report = await runPhase62Full500LongMemEval(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        outputDir: "/tmp/phase62-full500-test",
        resumeExistingShards: true,
        runId: "run-full500",
        shardSize: 50,
        shards: 2,
      },
      {
        readShardReport: async (runId) => {
          if (runId !== "run-full500-shard-01") {
            return null;
          }
          reusedRunIds.push(runId);
          return buildReport({ runId });
        },
        runShard: async (options) => {
          shardRunIds.push(String(options.runId));
          return buildReport({ runId: String(options.runId) });
        },
        summarize: async (options) =>
          buildReport({
            runId: String(options?.runId),
          }),
      },
    );

    expect(reusedRunIds).toEqual(["run-full500-shard-01"]);
    expect(shardRunIds).toEqual(["run-full500-shard-02"]);
    expect(report.runId).toBe("run-full500");
  });

  it("stops the closure run when a shard has execution failures", async () => {
    const shardRunIds: string[] = [];

    await expect(
      runPhase62Full500LongMemEval(
        {
          benchmarkRoot: "/tmp/LongMemEval",
          outputDir: "/tmp/phase62-full500-test",
          runId: "run-full500",
          shardSize: 50,
          shards: 2,
        },
        {
          runShard: async (options) => {
            shardRunIds.push(String(options.runId));
            return buildReport({
              executionFailures: 1,
              runId: String(options.runId),
            });
          },
          summarize: async () => {
            throw new Error("summary should not run");
          },
        },
      ),
    ).rejects.toThrow("has 1 execution failures");
    expect(shardRunIds).toEqual(["run-full500-shard-01"]);
  });
});
