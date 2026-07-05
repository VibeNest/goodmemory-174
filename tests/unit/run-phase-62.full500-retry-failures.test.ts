import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  buildPhase62FailureRetryBatches,
  discoverExistingRetryBatchRunIds,
  parsePhase62Full500RetryFailureOptions,
  runPhase62Full500FailureRetries,
} from "../../scripts/run-phase-62-full500-retry-failures";
import type {
  LongMemEvalCaseResult,
  LongMemEvalProfile,
  LongMemEvalProfileReport,
  LongMemEvalReport,
} from "../../src/eval/longmemeval";

function buildCase(input: {
  executionError?: boolean;
  questionId: string;
  questionType?: string;
}): LongMemEvalCaseResult {
  const base = {
    answerSessionIds: [`session-${input.questionId}`],
    correct: !input.executionError,
    evidenceSessionRecall: 1,
    hypothesis: "test",
    questionId: input.questionId,
    questionType: input.questionType ?? "multi-session",
    retrievedSessionIds: [`session-${input.questionId}`],
  };
  return input.executionError
    ? {
        ...base,
        executionError: {
          message: "provider cooldown",
          stage: "answer_generation",
        },
      }
    : base;
}

function buildProfileReport(
  cases: readonly LongMemEvalCaseResult[],
): LongMemEvalProfileReport {
  return {
    cases: [...cases],
    summary: undefined as never,
  };
}

function buildReport(input: {
  profiles: Partial<Record<LongMemEvalProfile, readonly LongMemEvalCaseResult[]>>;
  runId: string;
}): LongMemEvalReport {
  const firstCases = Object.values(input.profiles)[0] ?? [];
  return {
    benchmarkRoot: "/tmp/LongMemEval",
    generatedAt: "2026-05-06T00:00:00.000Z",
    generatedBy: "scripts/run-phase-62-eval.ts",
    mode: "full",
    outputDir: "/tmp/phase62-full500-retry-test",
    phase: "phase-62",
    profiles: Object.fromEntries(
      Object.entries(input.profiles).map(([profile, cases]) => [
        profile,
        buildProfileReport(cases ?? []),
      ]),
    ),
    runDirectory: `/tmp/phase62-full500-retry-test/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: 0,
      caseCountsByQuestionType: {},
      executionFailures: Object.values(input.profiles).reduce(
        (sum, cases) =>
          sum + (cases ?? []).filter((caseResult) => caseResult.executionError).length,
        0,
      ),
      profilesCompared: Object.keys(input.profiles) as LongMemEvalProfile[],
      totalCases: firstCases.length,
    },
  };
}

describe("run-phase-62 full-500 failure retries", () => {
  it("rejects duplicate boolean retry mode flags before planning batches", () => {
    for (const flag of [
      "--continue-on-execution-failure",
      "--dry-run",
      "--resume-existing-batches",
    ]) {
      expect(() =>
        parsePhase62Full500RetryFailureOptions([
          "bun",
          "run",
          "scripts/run-phase-62-full500-retry-failures.ts",
          flag,
          flag,
        ]),
      ).toThrow(`${flag} cannot be specified more than once.`);
    }
  });

  it("discovers existing retry batch run ids in batch order", () => {
    expect(
      discoverExistingRetryBatchRunIds({
        entries: [
          "run-retry-goodmemory-rules-only-batch-010",
          "run-retry-merged",
          "run-retry-goodmemory-rules-only-batch-002",
          "other-run-goodmemory-rules-only-batch-001",
          "run-retry-goodmemory-hybrid-batch-003",
        ],
        retryRunId: "run-retry",
      }),
    ).toEqual([
      "run-retry-goodmemory-rules-only-batch-002",
      "run-retry-goodmemory-hybrid-batch-003",
      "run-retry-goodmemory-rules-only-batch-010",
    ]);
  });

  it("builds retry batches only for unresolved failed profile cases", () => {
    const report = buildReport({
      profiles: {
        "baseline-full-context": [
          buildCase({ executionError: true, questionId: "q-1" }),
          buildCase({ questionId: "q-2" }),
        ],
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-1" }),
          buildCase({ executionError: true, questionId: "q-2" }),
          buildCase({ executionError: true, questionId: "q-3" }),
        ],
      },
      runId: "run-source",
    });

    expect(
      buildPhase62FailureRetryBatches({
        chunkSize: 2,
        profiles: ["baseline-full-context", "goodmemory-rules-only"],
        reports: [report],
        retryRunId: "run-retry",
      }),
    ).toEqual([
      {
        caseIds: ["q-1"],
        profile: "baseline-full-context",
        runId: "run-retry-baseline-full-context-batch-001",
      },
      {
        caseIds: ["q-1", "q-2"],
        profile: "goodmemory-rules-only",
        runId: "run-retry-goodmemory-rules-only-batch-002",
      },
      {
        caseIds: ["q-3"],
        profile: "goodmemory-rules-only",
        runId: "run-retry-goodmemory-rules-only-batch-003",
      },
    ]);
  });

  it("does not retry failures that are resolved by a later source report", () => {
    const firstReport = buildReport({
      profiles: {
        "goodmemory-hybrid": [
          buildCase({ executionError: true, questionId: "q-1" }),
          buildCase({ executionError: true, questionId: "q-2" }),
        ],
      },
      runId: "run-source-failed",
    });
    const laterReport = buildReport({
      profiles: {
        "goodmemory-hybrid": [
          buildCase({ questionId: "q-1" }),
          buildCase({ executionError: true, questionId: "q-2" }),
        ],
      },
      runId: "run-source-partial-retry",
    });

    expect(
      buildPhase62FailureRetryBatches({
        chunkSize: 10,
        profiles: ["goodmemory-hybrid"],
        reports: [firstReport, laterReport],
        retryRunId: "run-retry",
      }),
    ).toEqual([
      {
        caseIds: ["q-2"],
        profile: "goodmemory-hybrid",
        runId: "run-retry-goodmemory-hybrid-batch-001",
      },
    ]);
  });

  it("excludes requested failed case ids from retry batches", () => {
    const report = buildReport({
      profiles: {
        "baseline-full-context": [
          buildCase({ executionError: true, questionId: "q-blocked" }),
          buildCase({ executionError: true, questionId: "q-open" }),
        ],
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-blocked" }),
          buildCase({ executionError: true, questionId: "q-rules" }),
        ],
      },
      runId: "run-source",
    });

    expect(
      buildPhase62FailureRetryBatches({
        chunkSize: 10,
        excludeCaseIds: ["q-blocked"],
        profiles: ["baseline-full-context", "goodmemory-rules-only"],
        reports: [report],
        retryRunId: "run-retry",
      }),
    ).toEqual([
      {
        caseIds: ["q-open"],
        profile: "baseline-full-context",
        runId: "run-retry-baseline-full-context-batch-001",
      },
      {
        caseIds: ["q-rules"],
        profile: "goodmemory-rules-only",
        runId: "run-retry-goodmemory-rules-only-batch-002",
      },
    ]);
  });

  it("passes excluded failed case ids through the runner", async () => {
    const outputDir = "/tmp/phase62-full500-retry-test";
    const sourceRunId = "run-source";
    const sourceReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-blocked" }),
          buildCase({ executionError: true, questionId: "q-open" }),
        ],
      },
      runId: sourceRunId,
    });
    const runBatchCalls: Array<{
      caseIds?: readonly string[];
      runId?: string;
    }> = [];

    await runPhase62Full500FailureRetries(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        chunkSize: 1,
        excludeCaseIds: ["q-blocked"],
        expectedTotalCases: 2,
        outputDir,
        retryRunId: "run-retry",
        sourceRunIds: [sourceRunId],
      },
      {
        readFile: async () => JSON.stringify(sourceReport),
        runBatch: async (options) => {
          runBatchCalls.push({
            caseIds: options.caseIds,
            runId: options.runId,
          });
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [buildCase({ questionId: "q-open" })],
            },
            runId: String(options.runId),
          });
        },
        summarize: async (options) =>
          buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ executionError: true, questionId: "q-blocked" }),
                buildCase({ questionId: "q-open" }),
              ],
            },
            runId: String(options?.runId),
          }),
      },
    );

    expect(runBatchCalls).toEqual([
      {
        caseIds: ["q-open"],
        runId: "run-retry-goodmemory-rules-only-batch-001",
      },
    ]);
  });

  it("runs retry batches and merges them over source reports", async () => {
    const outputDir = "/tmp/phase62-full500-retry-test";
    const sourceRunId = "run-source";
    const sourceReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-1" }),
        ],
      },
      runId: sourceRunId,
    });
    const runBatchCalls: Array<{
      caseIds?: readonly string[];
      profiles?: readonly string[];
      runId?: string;
    }> = [];
    let summaryOptions:
      | Parameters<typeof runPhase62Full500FailureRetries>[0]
      | Record<string, unknown>
      | undefined;

    const result = await runPhase62Full500FailureRetries(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        chunkSize: 1,
        expectedTotalCases: 1,
        mergedRunId: "run-merged",
        outputDir,
        profiles: ["goodmemory-rules-only"],
        retryRunId: "run-retry",
        sourceRunIds: [sourceRunId],
      },
      {
        readFile: async (path) => {
          expect(path).toBe(join(outputDir, sourceRunId, "report.json"));
          return JSON.stringify(sourceReport);
        },
        runBatch: async (options) => {
          runBatchCalls.push({
            caseIds: options.caseIds,
            profiles: options.profiles,
            runId: options.runId,
          });
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [buildCase({ questionId: "q-1" })],
            },
            runId: String(options.runId),
          });
        },
        summarize: async (options) => {
          summaryOptions = options ?? {};
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [buildCase({ questionId: "q-1" })],
            },
            runId: String(options?.runId),
          });
        },
      },
    );

    expect(runBatchCalls).toEqual([
      {
        caseIds: ["q-1"],
        profiles: ["goodmemory-rules-only"],
        runId: "run-retry-goodmemory-rules-only-batch-001",
      },
    ]);
    expect(summaryOptions).toMatchObject({
      allowDuplicateCaseCoverage: true,
      expectedTotalCases: 1,
      outputDir,
      profiles: ["goodmemory-rules-only"],
      runId: "run-merged",
      shardRunIds: [sourceRunId, "run-retry-goodmemory-rules-only-batch-001"],
    });
    expect(result.executedBatches).toHaveLength(1);
    expect(result.mergedReport?.runId).toBe("run-merged");
  });

  it("resumes from existing completed retry batches before scheduling remaining failures", async () => {
    const outputDir = "/tmp/phase62-full500-retry-test";
    const sourceRunId = "run-source";
    const existingBatchRunId = "run-retry-goodmemory-rules-only-batch-001";
    const sourceReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-1" }),
          buildCase({ executionError: true, questionId: "q-2" }),
        ],
      },
      runId: sourceRunId,
    });
    const existingBatchReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [buildCase({ questionId: "q-1" })],
      },
      runId: existingBatchRunId,
    });
    const runBatchCalls: Array<{
      caseIds?: readonly string[];
      runId?: string;
    }> = [];
    let summaryOptions: Record<string, unknown> | undefined;

    const result = await runPhase62Full500FailureRetries(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        chunkSize: 1,
        expectedTotalCases: 2,
        mergedRunId: "run-merged",
        outputDir,
        resumeExistingBatches: true,
        retryRunId: "run-retry",
        sourceRunIds: [sourceRunId],
      },
      {
        readDir: async () => [
          "run-retry-merged",
          existingBatchRunId,
          "other-run-goodmemory-rules-only-batch-001",
        ],
        readFile: async (path) => {
          if (path === join(outputDir, sourceRunId, "report.json")) {
            return JSON.stringify(sourceReport);
          }
          if (path === join(outputDir, existingBatchRunId, "report.json")) {
            return JSON.stringify(existingBatchReport);
          }
          throw new Error(`unexpected read: ${path}`);
        },
        runBatch: async (options) => {
          runBatchCalls.push({
            caseIds: options.caseIds,
            runId: options.runId,
          });
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [buildCase({ questionId: "q-2" })],
            },
            runId: String(options.runId),
          });
        },
        summarize: async (options) => {
          summaryOptions = options as Record<string, unknown>;
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ questionId: "q-1" }),
                buildCase({ questionId: "q-2" }),
              ],
            },
            runId: String(options?.runId),
          });
        },
      },
    );

    expect(result.resumedBatchRunIds).toEqual([existingBatchRunId]);
    expect(runBatchCalls).toEqual([
      {
        caseIds: ["q-2"],
        runId: "run-retry-goodmemory-rules-only-batch-002",
      },
    ]);
    expect(summaryOptions).toMatchObject({
      allowDuplicateCaseCoverage: true,
      shardRunIds: [
        sourceRunId,
        existingBatchRunId,
        "run-retry-goodmemory-rules-only-batch-002",
      ],
    });
  });

  it("stops and merges completed retry batches when one still has execution failures", async () => {
    const outputDir = "/tmp/phase62-full500-retry-test";
    const sourceRunId = "run-source";
    const sourceReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-1" }),
        ],
      },
      runId: sourceRunId,
    });
    let summaryOptions: Record<string, unknown> | undefined;

    const result = await runPhase62Full500FailureRetries(
      {
        benchmarkRoot: "/tmp/LongMemEval",
        chunkSize: 1,
        outputDir,
        retryRunId: "run-retry",
        sourceRunIds: [sourceRunId],
      },
      {
        readFile: async () => JSON.stringify(sourceReport),
        runBatch: async (options) =>
          buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ executionError: true, questionId: "q-1" }),
              ],
            },
            runId: String(options.runId),
          }),
        summarize: async (options) => {
          summaryOptions = options as Record<string, unknown>;
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ executionError: true, questionId: "q-1" }),
              ],
            },
            runId: String(options?.runId),
          });
        },
      },
    );

    expect(result.executedBatches).toHaveLength(1);
    expect(result.stoppedOnExecutionFailure).toEqual({
      executionFailures: 1,
      runId: "run-retry-goodmemory-rules-only-batch-001",
    });
    expect(summaryOptions).toMatchObject({
      allowDuplicateCaseCoverage: true,
      shardRunIds: [sourceRunId, "run-retry-goodmemory-rules-only-batch-001"],
    });
  });

  it("waits between serial successful retry batches when configured", async () => {
    const outputDir = "/tmp/phase62-full500-retry-test";
    const sourceRunId = "run-source";
    const sourceReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-1" }),
          buildCase({ executionError: true, questionId: "q-2" }),
        ],
      },
      runId: sourceRunId,
    });
    const sleeps: number[] = [];
    const runBatchCalls: string[] = [];

    const result = await runPhase62Full500FailureRetries(
      {
        batchDelayMs: 2_500,
        benchmarkRoot: "/tmp/LongMemEval",
        chunkSize: 1,
        expectedTotalCases: 2,
        outputDir,
        retryRunId: "run-retry",
        sourceRunIds: [sourceRunId],
      },
      {
        readFile: async () => JSON.stringify(sourceReport),
        runBatch: async (options) => {
          runBatchCalls.push(String(options.runId));
          return buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ questionId: String(options.caseIds?.[0]) }),
              ],
            },
            runId: String(options.runId),
          });
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        summarize: async (options) =>
          buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ questionId: "q-1" }),
                buildCase({ questionId: "q-2" }),
              ],
            },
            runId: String(options?.runId),
          }),
      },
    );

    expect(runBatchCalls).toEqual([
      "run-retry-goodmemory-rules-only-batch-001",
      "run-retry-goodmemory-rules-only-batch-002",
    ]);
    expect(sleeps).toEqual([2_500]);
    expect(result.executedBatches).toHaveLength(2);
  });

  it("does not wait after a serial retry batch that still fails", async () => {
    const outputDir = "/tmp/phase62-full500-retry-test";
    const sourceRunId = "run-source";
    const sourceReport = buildReport({
      profiles: {
        "goodmemory-rules-only": [
          buildCase({ executionError: true, questionId: "q-1" }),
          buildCase({ executionError: true, questionId: "q-2" }),
        ],
      },
      runId: sourceRunId,
    });
    const sleeps: number[] = [];

    const result = await runPhase62Full500FailureRetries(
      {
        batchDelayMs: 2_500,
        benchmarkRoot: "/tmp/LongMemEval",
        chunkSize: 1,
        outputDir,
        retryRunId: "run-retry",
        sourceRunIds: [sourceRunId],
      },
      {
        readFile: async () => JSON.stringify(sourceReport),
        runBatch: async (options) =>
          buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({
                  executionError: true,
                  questionId: String(options.caseIds?.[0]),
                }),
              ],
            },
            runId: String(options.runId),
          }),
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        summarize: async (options) =>
          buildReport({
            profiles: {
              "goodmemory-rules-only": [
                buildCase({ executionError: true, questionId: "q-1" }),
                buildCase({ executionError: true, questionId: "q-2" }),
              ],
            },
            runId: String(options?.runId),
          }),
      },
    );

    expect(result.executedBatches).toHaveLength(1);
    expect(result.stoppedOnExecutionFailure).toEqual({
      executionFailures: 1,
      runId: "run-retry-goodmemory-rules-only-batch-001",
    });
    expect(sleeps).toEqual([]);
  });
});
