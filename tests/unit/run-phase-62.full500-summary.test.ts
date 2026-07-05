import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  PHASE62_FULL500_CANONICAL_RUN_ID,
  parsePhase62Full500SummaryOptions,
  runPhase62Full500Summary,
} from "../../scripts/run-phase-62-full500-summary";
import {
  LONGMEMEVAL_PROFILES,
  type LongMemEvalCaseResult,
  type LongMemEvalProfile,
  type LongMemEvalReport,
} from "../../src/eval/longmemeval";

function buildCase(input: {
  correct?: boolean;
  executionError?: boolean;
  questionId: string;
  questionType: string;
}): LongMemEvalCaseResult {
  return {
    answerScore: {
      correct: input.correct ?? true,
      method: "exact",
      reasoning: "test",
    },
    answerSessionIds: [`session-${input.questionId}`],
    correct: input.correct ?? true,
    evidenceSessionRecall: 1,
    executionError: input.executionError
      ? {
          message: "provider cooldown",
          stage: "answer_generation",
        }
      : undefined,
    hypothesis: "test",
    questionId: input.questionId,
    questionType: input.questionType,
    retrievedSessionIds: [`session-${input.questionId}`],
  };
}

function buildProfileCases(
  cases: readonly LongMemEvalCaseResult[],
): Record<LongMemEvalProfile, { cases: LongMemEvalCaseResult[]; summary: never }> {
  return Object.fromEntries(
    LONGMEMEVAL_PROFILES.map((profile) => [
      profile,
      {
        cases: [...cases],
        summary: undefined as never,
      },
    ]),
  ) as Record<LongMemEvalProfile, { cases: LongMemEvalCaseResult[]; summary: never }>;
}

function buildShardReport(input: {
  cases: readonly LongMemEvalCaseResult[];
  profileCases?: Partial<Record<LongMemEvalProfile, readonly LongMemEvalCaseResult[]>>;
  runId: string;
}): LongMemEvalReport {
  return {
    benchmarkRoot: "/tmp/LongMemEval",
    generatedAt: "2026-05-06T00:00:00.000Z",
    generatedBy: "scripts/run-phase-62-eval.ts",
    mode: "full",
    outputDir: "/tmp/phase62-full500-summary-test",
    phase: "phase-62",
    profiles: {
      ...buildProfileCases(input.cases),
      ...Object.fromEntries(
        Object.entries(input.profileCases ?? {}).map(([profile, cases]) => [
          profile,
          {
            cases: [...(cases ?? [])],
            summary: undefined as never,
          },
        ]),
      ),
    },
    runDirectory: `/tmp/phase62-full500-summary-test/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: 0,
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [...LONGMEMEVAL_PROFILES],
      totalCases: input.cases.length,
    },
  };
}

describe("run-phase-62 full-500 summary", () => {
  it("rejects duplicate boolean summary flags before reading shard reports", () => {
    expect(() =>
      parsePhase62Full500SummaryOptions([
        "bun",
        "run",
        "scripts/run-phase-62-full500-summary.ts",
        "--allow-duplicate-case-coverage",
        "--allow-duplicate-case-coverage",
      ]),
    ).toThrow("--allow-duplicate-case-coverage cannot be specified more than once.");
  });

  it("rejects duplicate scalar summary flags before reading shard reports", () => {
    for (const flag of [
      "--expected-total-cases",
      "--output-dir",
      "--run-id",
      "--shards",
    ]) {
      expect(() =>
        parsePhase62Full500SummaryOptions([
          "bun",
          "run",
          "scripts/run-phase-62-full500-summary.ts",
          flag,
          "first",
          flag,
          "second",
        ]),
      ).toThrow(`${flag} cannot be specified more than once.`);
    }
  });

  it("aggregates shard reports into a canonical full report", async () => {
    const outputDir = "/tmp/phase62-full500-summary-test";
    const shardRunIds = [
      `${PHASE62_FULL500_CANONICAL_RUN_ID}-shard-01`,
      `${PHASE62_FULL500_CANONICAL_RUN_ID}-shard-02`,
    ];
    const reports = new Map([
      [
        join(outputDir, shardRunIds[0]!, "report.json"),
        JSON.stringify(
          buildShardReport({
            cases: [
              buildCase({
                questionId: "q-1",
                questionType: "single-session-user",
              }),
              buildCase({
                questionId: "q-2",
                questionType: "multi-session",
              }),
            ],
            runId: shardRunIds[0]!,
          }),
        ),
      ],
      [
        join(outputDir, shardRunIds[1]!, "report.json"),
        JSON.stringify(
          buildShardReport({
            cases: [
              buildCase({
                correct: false,
                questionId: "q-3",
                questionType: "knowledge-update",
              }),
            ],
            runId: shardRunIds[1]!,
          }),
        ),
      ],
    ]);
    const writes = new Map<string, string>();

    const report = await runPhase62Full500Summary(
      {
        expectedTotalCases: 3,
        outputDir,
        shardRunIds,
      },
      {
        now: () => new Date("2026-05-06T00:01:00.000Z"),
        readFile: async (path) => reports.get(path) ?? "{}",
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.runId).toBe(PHASE62_FULL500_CANONICAL_RUN_ID);
    expect(report.summary.totalCases).toBe(3);
    expect(report.summary.executionFailures).toBe(0);
    expect(report.summary.caseCountsByQuestionType).toEqual({
      "knowledge-update": 1,
      "multi-session": 1,
      "single-session-user": 1,
    });
    expect(report.profiles["goodmemory-rules-only"]?.summary).toMatchObject({
      accuracy: 2 / 3,
      correctCases: 2,
      totalCases: 3,
      wrongAnswerCases: 1,
    });
    expect(
      writes.has(join(outputDir, PHASE62_FULL500_CANONICAL_RUN_ID, "report.json")),
    ).toBe(true);
  });

  it("rejects duplicate full-500 case coverage across shards", async () => {
    const outputDir = "/tmp/phase62-full500-summary-test";
    const shardRunIds = ["run-duplicate-shard-01", "run-duplicate-shard-02"];
    const duplicateCase = buildCase({
      questionId: "q-duplicate",
      questionType: "multi-session",
    });
    const reports = new Map(
      shardRunIds.map((runId) => [
        join(outputDir, runId, "report.json"),
        JSON.stringify(buildShardReport({ cases: [duplicateCase], runId })),
      ]),
    );

    await expect(
      runPhase62Full500Summary(
        {
          expectedTotalCases: 2,
          outputDir,
          shardRunIds,
        },
        {
          readFile: async (path) => reports.get(path) ?? "{}",
          writeFile: async () => {},
        },
      ),
    ).rejects.toThrow("duplicate case q-duplicate");
  });

  it("can merge unique shard coverage for one selected profile", async () => {
    const outputDir = "/tmp/phase62-full500-summary-test";
    const shardRunIds = ["run-rules-shard-01", "run-rules-shard-02"];
    const shardCases = [
      buildCase({
        questionId: "q-rules-1",
        questionType: "multi-session",
      }),
      buildCase({
        questionId: "q-rules-2",
        questionType: "temporal-reasoning",
      }),
    ];
    const reports = new Map(
      shardRunIds.map((runId, index) => {
        const shardReport = buildShardReport({
          cases: [shardCases[index]!],
          runId,
        });
        shardReport.profiles = {
          "goodmemory-rules-only": {
            cases: [shardCases[index]!],
            summary: undefined as never,
          },
        };
        shardReport.summary.profilesCompared = ["goodmemory-rules-only"];
        return [join(outputDir, runId, "report.json"), JSON.stringify(shardReport)];
      }),
    );

    const report = await runPhase62Full500Summary(
      {
        expectedTotalCases: 2,
        outputDir,
        profiles: ["goodmemory-rules-only"],
        runId: "run-rules-only-merged",
        shardRunIds,
      },
      {
        readFile: async (path) => reports.get(path) ?? "{}",
        writeFile: async () => {},
      },
    );

    expect(report.summary.profilesCompared).toEqual(["goodmemory-rules-only"]);
    expect(report.summary.totalCases).toBe(2);
    expect(report.profiles["goodmemory-rules-only"]?.summary.totalCases).toBe(2);
  });

  it("can merge retry reports over failed profile cases", async () => {
    const outputDir = "/tmp/phase62-full500-summary-test";
    const sourceRunId = "run-source";
    const retryRunId = "run-retry-goodmemory-rules-only";
    const failedCase = buildCase({
      correct: false,
      executionError: true,
      questionId: "q-retry",
      questionType: "multi-session",
    });
    const successfulCase = buildCase({
      correct: true,
      questionId: "q-retry",
      questionType: "multi-session",
    });
    const reports = new Map([
      [
        join(outputDir, sourceRunId, "report.json"),
        JSON.stringify(
          buildShardReport({
            cases: [failedCase],
            runId: sourceRunId,
          }),
        ),
      ],
      [
        join(outputDir, retryRunId, "report.json"),
        JSON.stringify({
          ...buildShardReport({
            cases: [successfulCase],
            profileCases: {
              "goodmemory-rules-only": [successfulCase],
            },
            runId: retryRunId,
          }),
          profiles: {
            "goodmemory-rules-only": {
              cases: [successfulCase],
              summary: undefined,
            },
          },
          summary: {
            abstentionCases: 0,
            caseCountsByQuestionType: {},
            executionFailures: 0,
            profilesCompared: ["goodmemory-rules-only"],
            totalCases: 1,
          },
        }),
      ],
    ]);

    const report = await runPhase62Full500Summary(
      {
        allowDuplicateCaseCoverage: true,
        expectedTotalCases: 1,
        outputDir,
        runId: "run-merged",
        shardRunIds: [sourceRunId, retryRunId],
      },
      {
        readFile: async (path) => reports.get(path) ?? "{}",
        writeFile: async () => {},
      },
    );

    expect(report.summary.executionFailures).toBe(3);
    expect(report.profiles["goodmemory-rules-only"]?.summary).toMatchObject({
      correctCases: 1,
      totalCases: 1,
      wrongAnswerCases: 0,
    });
    expect(
      report.profiles["goodmemory-rules-only"]?.cases[0]?.executionError,
    ).toBeUndefined();
  });

  it("can merge duplicate-coverage retries for one selected profile", async () => {
    const outputDir = "/tmp/phase62-full500-summary-test";
    const sourceRunId = "run-source-hybrid";
    const retryRunId = "run-retry-hybrid";
    const failedCase = buildCase({
      correct: false,
      executionError: true,
      questionId: "q-hybrid",
      questionType: "single-session-assistant",
    });
    const successfulCase = buildCase({
      correct: true,
      questionId: "q-hybrid",
      questionType: "single-session-assistant",
    });
    const sourceReport = buildShardReport({
      cases: [failedCase],
      runId: sourceRunId,
    });
    const retryReport = buildShardReport({
      cases: [successfulCase],
      runId: retryRunId,
    });
    sourceReport.profiles = {
      "goodmemory-hybrid": {
        cases: [failedCase],
        summary: undefined as never,
      },
    };
    sourceReport.summary.profilesCompared = ["goodmemory-hybrid"];
    retryReport.profiles = {
      "goodmemory-hybrid": {
        cases: [successfulCase],
        summary: undefined as never,
      },
    };
    retryReport.summary.profilesCompared = ["goodmemory-hybrid"];
    const reports = new Map([
      [join(outputDir, sourceRunId, "report.json"), JSON.stringify(sourceReport)],
      [join(outputDir, retryRunId, "report.json"), JSON.stringify(retryReport)],
    ]);

    const report = await runPhase62Full500Summary(
      {
        allowDuplicateCaseCoverage: true,
        expectedTotalCases: 1,
        outputDir,
        profiles: ["goodmemory-hybrid"],
        runId: "run-hybrid-merged",
        shardRunIds: [sourceRunId, retryRunId],
      },
      {
        readFile: async (path) => reports.get(path) ?? "{}",
        writeFile: async () => {},
      },
    );

    expect(report.summary.profilesCompared).toEqual(["goodmemory-hybrid"]);
    expect(report.profiles["goodmemory-hybrid"]?.summary).toMatchObject({
      correctCases: 1,
      totalCases: 1,
      wrongAnswerCases: 0,
    });
  });

  it("preserves abstention suffix counts in merged reports", async () => {
    const outputDir = "/tmp/phase62-full500-summary-test";
    const shardRunId = "run-abstention-shard";
    const abstentionCase = buildCase({
      questionId: "q-abstention_abs",
      questionType: "single-session-user",
    });
    const reports = new Map([
      [
        join(outputDir, shardRunId, "report.json"),
        JSON.stringify(
          buildShardReport({
            cases: [abstentionCase],
            runId: shardRunId,
          }),
        ),
      ],
    ]);

    const report = await runPhase62Full500Summary(
      {
        expectedTotalCases: 1,
        outputDir,
        shardRunIds: [shardRunId],
      },
      {
        readFile: async (path) => reports.get(path) ?? "{}",
        writeFile: async () => {},
      },
    );

    expect(report.summary.abstentionCases).toBe(1);
    expect(report.profiles["goodmemory-rules-only"]?.summary.abstentionCorrectCases).toBe(1);
  });
});
