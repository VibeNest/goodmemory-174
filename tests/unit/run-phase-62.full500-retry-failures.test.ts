import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  buildPhase62FailureRetryBatches,
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
      runId: "run-merged",
      shardRunIds: [sourceRunId, "run-retry-goodmemory-rules-only-batch-001"],
    });
    expect(result.executedBatches).toHaveLength(1);
    expect(result.mergedReport?.runId).toBe("run-merged");
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
});
