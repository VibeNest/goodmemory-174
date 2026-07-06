import { describe, expect, it } from "bun:test";
import {
  parseLocomoReanswerDeltaAggregateCliOptions,
  runLocomoReanswerDeltaAggregate,
  summarizeLocomoReanswerDeltas,
} from "../../scripts/summarize-phase-65-locomo-reanswer-deltas";

type Bucket =
  | "baselineCorrectHighNoise"
  | "wrongFullRecallNoisy"
  | "wrongMissingEvidence";
type Category = "single_hop" | "multi_hop" | "temporal";

function readinessJob(input: {
  bucket: Bucket;
  category: Category;
  index: number;
  questionCount: number;
  targetRunId: string;
}): Record<string, unknown> {
  return {
    bucket: input.bucket,
    category: input.category,
    command: `bun run eval:phase-65-reanswer-report -- --run-id ${input.targetRunId}`,
    manifestPath: "/reports/answer-policy-slice.json",
    questionCount: input.questionCount,
    questionIds: Array.from(
      { length: input.questionCount },
      (_, index) => `${input.category}:q${input.index}-${index}`,
    ),
    sourceReportPath: `/reports/${input.category}.json`,
    sourceRunId: `${input.category}-source`,
    targetRunId: input.targetRunId,
  };
}

function readiness(): Record<string, unknown> {
  return {
    benchmark: "locomo",
    replayPlan: {
      commands: [
        readinessJob({
          bucket: "baselineCorrectHighNoise",
          category: "single_hop",
          index: 0,
          questionCount: 2,
          targetRunId: "job-0",
        }),
        readinessJob({
          bucket: "wrongFullRecallNoisy",
          category: "multi_hop",
          index: 1,
          questionCount: 3,
          targetRunId: "job-1",
        }),
      ],
    },
  };
}

function summary(input: {
  baselineCorrect: number;
  candidateCorrect: number;
  improved?: number;
  regressed?: number;
  sameCorrect?: number;
  sameWrong?: number;
}): Record<string, unknown> {
  const improved = input.improved ?? 0;
  const regressed = input.regressed ?? 0;
  const sameCorrect = input.sameCorrect ?? 0;
  const sameWrong = input.sameWrong ?? 0;
  const questionCount = improved + regressed + sameCorrect + sameWrong;
  return {
    answerContextModeChangedAnswerChangeCount: 0,
    answerContextModeChangedCount: 0,
    answerContextModeChangedRegressionCount: 0,
    answerContextModeUnchangedAnswerChangeCount: improved + regressed,
    answerContextModeUnchangedCount: questionCount,
    answerContextModeUnchangedRegressionCount: regressed,
    answerCorrectDelta: input.candidateCorrect - input.baselineCorrect,
    answerTransitions: {
      baselineOnlyAnswered: 0,
      bothUnanswered: 0,
      candidateOnlyAnswered: 0,
      improved,
      regressed,
      sameCorrect,
      sameWrong,
    },
    averageEvidenceRecallDelta: 0.2,
    baselineCorrectCount: input.baselineCorrect,
    baselineFullyRetrievedCount: 1,
    candidateCorrectCount: input.candidateCorrect,
    candidateFullyRetrievedCount: 2,
    convertedRetrievalGainCount: 1,
    effectiveAnswerPolicyChangedAnswerChangeCount: 0,
    effectiveAnswerPolicyChangedCount: 0,
    effectiveAnswerPolicyChangedRegressionCount: 0,
    effectiveAnswerPolicyUnchangedAnswerChangeCount: improved + regressed,
    effectiveAnswerPolicyUnchangedCount: questionCount,
    effectiveAnswerPolicyUnchangedRegressionCount: regressed,
    fullyRetrievedDelta: 1,
    fullRecallWrongNoisyDelta: -1,
    missingEvidenceWrongDelta: 1,
    noiseTurnDelta: 2,
    noisyFullRecallRegressionCount: regressed,
    questionCount,
    residualLiveAnswerChangeCount: improved + regressed,
    retrievalMetricChangedAnswerChangeCount: 0,
    retrievalTransitions: {
      "full->full": 0,
      "full->partial": 0,
      "full->zero": 0,
      "partial->full": 1,
      "partial->partial": 0,
      "partial->zero": 0,
      "zero->full": 0,
      "zero->partial": 0,
      "zero->zero": questionCount - 1,
    },
    unconvertedRetrievalGainCount: 0,
  };
}

function deltaReport(input: {
  category: Category;
  candidateRunId: string;
  nearMissCount?: number;
  runId: string;
  summary: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    answerTokenF1NearMisses: Array.from(
      { length: input.nearMissCount ?? 0 },
      (_, index) => ({ questionId: `${input.candidateRunId}:near-${index}` }),
    ),
    baselineReport: { path: `/reports/${input.category}.json`, runId: `${input.category}-source` },
    benchmark: "locomo",
    candidateReport: { path: `/reports/${input.candidateRunId}.json`, runId: input.candidateRunId },
    categories: { [input.category]: input.summary },
    generatedBy: "scripts/analyze-phase-65-locomo-live-delta.ts",
    overall: input.summary,
    runId: input.runId,
  };
}

function fixtures(): Record<string, unknown> {
  return {
    "/reports/readiness.json": readiness(),
    "/reports/job-0-delta.json": deltaReport({
      candidateRunId: "job-0",
      category: "single_hop",
      runId: "job-0-delta",
      summary: summary({
        baselineCorrect: 2,
        candidateCorrect: 1,
        regressed: 1,
        sameCorrect: 1,
      }),
    }),
    "/reports/job-1-delta.json": deltaReport({
      candidateRunId: "job-1",
      category: "multi_hop",
      nearMissCount: 2,
      runId: "job-1-delta",
      summary: summary({
        baselineCorrect: 0,
        candidateCorrect: 2,
        improved: 2,
        sameWrong: 1,
      }),
    }),
  };
}

function readFixture(values: Record<string, unknown>) {
  return async (path: string): Promise<string> => {
    if (!(path in values)) {
      throw new Error(`ENOENT ${path}`);
    }
    return JSON.stringify(values[path]);
  };
}

describe("phase-65 LoCoMo reanswer delta aggregate", () => {
  it("aggregates live-delta reports by readiness bucket and category", async () => {
    const aggregate = await summarizeLocomoReanswerDeltas(
      {
        deltaPaths: ["/reports/job-0-delta.json", "/reports/job-1-delta.json"],
        readinessPath: "/reports/readiness.json",
        runId: "locomo-reanswer-delta-aggregate-current",
      },
      {
        now: () => new Date("2026-07-06T00:00:00.000Z"),
        readFile: readFixture(fixtures()),
      },
    );

    expect(aggregate.totals).toMatchObject({
      answerCorrectDelta: 1,
      answerTokenF1NearMissCount: 2,
      baselineCorrectCount: 2,
      candidateCorrectCount: 3,
      deltaReportCount: 2,
      questionCount: 5,
    });
    expect(aggregate.totals.answerTransitions).toMatchObject({
      improved: 2,
      regressed: 1,
      sameCorrect: 1,
      sameWrong: 1,
    });
    expect(aggregate.byBucket.baselineCorrectHighNoise).toMatchObject({
      answerCorrectDelta: -1,
      bucket: "baselineCorrectHighNoise",
      questionCount: 2,
    });
    expect(aggregate.byBucket.wrongFullRecallNoisy).toMatchObject({
      answerCorrectDelta: 2,
      bucket: "wrongFullRecallNoisy",
      questionCount: 3,
    });
    expect(aggregate.byCategory.multi_hop).toMatchObject({
      answerCorrectDelta: 2,
      category: "multi_hop",
      questionCount: 3,
    });
    expect(aggregate.sourceDeltaReports.map((report) => report.bucket)).toEqual([
      "baselineCorrectHighNoise",
      "wrongFullRecallNoisy",
    ]);
  });

  it("rejects duplicate CLI delta paths and delta reports outside readiness scope", async () => {
    expect(() =>
      parseLocomoReanswerDeltaAggregateCliOptions([
        "bun",
        "run",
        "scripts/summarize-phase-65-locomo-reanswer-deltas.ts",
        "--readiness",
        "/reports/readiness.json",
        "--delta",
        "/reports/job-0-delta.json,/reports/job-0-delta.json",
      ]),
    ).toThrow("--delta contains duplicate value /reports/job-0-delta.json.");

    await expect(
      summarizeLocomoReanswerDeltas(
        {
          deltaPaths: ["/reports/missing-job-delta.json"],
          readinessPath: "/reports/readiness.json",
          runId: "locomo-reanswer-delta-aggregate-current",
        },
        {
          readFile: readFixture({
            ...fixtures(),
            "/reports/missing-job-delta.json": deltaReport({
              candidateRunId: "not-in-readiness",
              category: "single_hop",
              runId: "missing-job-delta",
              summary: summary({
                baselineCorrect: 0,
                candidateCorrect: 0,
                sameWrong: 1,
              }),
            }),
          }),
        },
      ),
    ).rejects.toThrow("does not match any readiness replay job");
  });

  it("rejects inconsistent delta summaries and writes the aggregate", async () => {
    const badSummary = summary({
      baselineCorrect: 0,
      candidateCorrect: 0,
      sameWrong: 1,
    });
    (badSummary.answerTransitions as Record<string, number>).sameWrong = 2;
    await expect(
      summarizeLocomoReanswerDeltas(
        {
          deltaPaths: ["/reports/bad-delta.json"],
          readinessPath: "/reports/readiness.json",
          runId: "locomo-reanswer-delta-aggregate-current",
        },
        {
          readFile: readFixture({
            ...fixtures(),
            "/reports/bad-delta.json": deltaReport({
              candidateRunId: "job-0",
              category: "single_hop",
              runId: "bad-delta",
              summary: badSummary,
            }),
          }),
        },
      ),
    ).rejects.toThrow("answer transition total");

    const writes: Array<{ data: string; path: string }> = [];
    const aggregate = await runLocomoReanswerDeltaAggregate(
      {
        deltaPaths: ["/reports/job-0-delta.json"],
        outputPath: "/reports/out/reanswer-delta-aggregate.json",
        readinessPath: "/reports/readiness.json",
        runId: "locomo-reanswer-delta-aggregate-current",
      },
      {
        mkdir: async () => undefined,
        readFile: readFixture(fixtures()),
        writeFile: async (path, data) => {
          writes.push({ data, path });
        },
      },
    );

    expect(aggregate.outputPath).toBe("/reports/out/reanswer-delta-aggregate.json");
    expect(writes[0]?.path).toBe("/reports/out/reanswer-delta-aggregate.json");
    expect(JSON.parse(writes[0]?.data ?? "{}").benchmark).toBe("locomo");
  });
});
