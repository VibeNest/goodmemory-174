import { describe, expect, it } from "bun:test";
import {
  analyzePhase63LiveAnswerGap,
  expectedHypothesisOverlap,
  parsePhase63AnswerGapCliOptions,
  resolvePhase63AnswerGapBucket,
  resolvePhase63AnswerGapRecallStatus,
  uniqueNoiseChatCount,
} from "../../scripts/analyze-phase-63-live-answer-gap";

describe("phase-63 live answer-gap analyzer", () => {
  it("parses cli options", () => {
    expect(
      parsePhase63AnswerGapCliOptions([
        "bun",
        "run",
        "scripts/analyze-phase-63-live-answer-gap.ts",
        "--live-report",
        "/tmp/live.json",
        "--benchmark-root",
        "/tmp/BEAM",
        "--run-id",
        "run-x",
      ]),
    ).toMatchObject({
      benchmarkRoot: "/tmp/BEAM",
      liveReportPath: "/tmp/live.json",
      runId: "run-x",
    });
  });

  it("counts unique noise chats excluding evidence", () => {
    expect(
      uniqueNoiseChatCount({
        evidenceChatIds: [1, 2],
        retrievedChatIds: [1, 2, 3, 3, 4],
      }),
    ).toBe(2);
    expect(
      uniqueNoiseChatCount({ evidenceChatIds: [1], retrievedChatIds: [1] }),
    ).toBe(0);
  });

  it("resolves recall status across answerable regimes plus abstention", () => {
    expect(
      resolvePhase63AnswerGapRecallStatus({
        answerable: false,
        correct: false,
        evidenceChatRecall: null,
        questionId: "a",
        questionType: "abstention",
      }),
    ).toBe("abstention");
    expect(
      resolvePhase63AnswerGapRecallStatus({
        answerable: true,
        correct: false,
        evidenceChatRecall: null,
        questionId: "a",
        questionType: "x",
      }),
    ).toBe("unknown");
    expect(
      resolvePhase63AnswerGapRecallStatus({
        answerable: true,
        correct: false,
        evidenceChatRecall: 0.5,
        questionId: "a",
        questionType: "x",
      }),
    ).toBe("missing-evidence");
    expect(
      resolvePhase63AnswerGapRecallStatus({
        answerable: true,
        correct: false,
        evidenceChatRecall: 1,
        evidenceChatIds: [1],
        retrievedChatIds: [1, 9],
        questionId: "a",
        questionType: "x",
      }),
    ).toBe("full-recall-noisy");
    expect(
      resolvePhase63AnswerGapRecallStatus({
        answerable: true,
        correct: false,
        evidenceChatRecall: 1,
        evidenceChatIds: [1],
        retrievedChatIds: [1],
        questionId: "a",
        questionType: "x",
      }),
    ).toBe("full-recall-clean");
  });

  it("routes reasoning buckets by type, then count/order phrasing, then judge fallback", () => {
    const base = { expectedAnswer: "", hypothesis: "", question: "" };
    expect(
      resolvePhase63AnswerGapBucket({ ...base, questionType: "abstention" }),
    ).toBe("abstention");
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "instruction_following",
      }),
    ).toBe("instruction_following");
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "knowledge_update",
      }),
    ).toBe("conflict_update");
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "contradiction_resolution",
      }),
    ).toBe("conflict_update");
    expect(
      resolvePhase63AnswerGapBucket({ ...base, questionType: "summarization" }),
    ).toBe("summarization");
    // count phrasing wins over the multi_session_reasoning type
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "multi_session_reasoning",
        question: "How many cards do I have in total?",
      }),
    ).toBe("aggregate_count");
    expect(
      resolvePhase63AnswerGapBucket({ ...base, questionType: "event_ordering" }),
    ).toBe("temporal_order");
    // order phrasing on an otherwise-unbucketed type
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "information_extraction",
        question: "What happened before launch?",
      }),
    ).toBe("temporal_order");
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "multi_session_reasoning",
        question: "Which roles exist?",
      }),
    ).toBe("multi_session_reasoning");
    // rubric-style expected answer -> probable judge/expected mismatch
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "information_extraction",
        expectedAnswer: "Response should include the library versions.",
      }),
    ).toBe("judge_or_expected_answer");
    // near-identical hypothesis judged wrong -> probable false negative
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "information_extraction",
        expectedAnswer: "The deploy uses Gunicorn workers",
        hypothesis: "The deploy uses Gunicorn workers",
      }),
    ).toBe("judge_or_expected_answer");
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "information_extraction",
        expectedAnswer: "alpha",
        hypothesis: "zeta",
      }),
    ).toBe("other");
  });

  it("computes a bounded token-overlap F1", () => {
    expect(expectedHypothesisOverlap("a b c", "a b c")).toBe(1);
    expect(expectedHypothesisOverlap("", "")).toBe(1);
    expect(expectedHypothesisOverlap("a", "")).toBe(0);
    expect(expectedHypothesisOverlap("a b", "a c")).toBeCloseTo(0.5, 5);
  });

  it("analyzes a synthetic live report end to end", async () => {
    const liveReport = {
      profile: "goodmemory-rules-only",
      runId: "run-src",
      summary: { totalCases: 7, correctCases: 1, wrongAnswerCases: 6 },
      cases: [
        {
          questionId: "c1",
          questionType: "information_extraction",
          answerable: true,
          correct: true,
          evidenceChatRecall: 1,
          evidenceChatIds: [1],
          retrievedChatIds: [1],
          expectedAnswer: "x",
          hypothesis: "x",
          conversationId: "1",
        },
        {
          questionId: "c2",
          questionType: "knowledge_update",
          answerable: true,
          correct: false,
          evidenceChatRecall: 1,
          evidenceChatIds: [2],
          retrievedChatIds: [2],
          expectedAnswer: "78%",
          hypothesis: "conflicting 65% and 78%",
          conversationId: "1",
        },
        {
          questionId: "c3",
          questionType: "event_ordering",
          answerable: true,
          correct: false,
          evidenceChatRecall: 1,
          evidenceChatIds: [3],
          retrievedChatIds: [3, 9],
          expectedAnswer: "a then b",
          hypothesis: "b then a",
          conversationId: "1",
        },
        {
          questionId: "c4",
          questionType: "multi_session_reasoning",
          answerable: true,
          correct: false,
          evidenceChatRecall: 1,
          evidenceChatIds: [4],
          retrievedChatIds: [4],
          expectedAnswer: "10",
          hypothesis: "8",
          conversationId: "1",
        },
        {
          questionId: "c5",
          questionType: "instruction_following",
          answerable: true,
          correct: false,
          evidenceChatRecall: 1,
          evidenceChatIds: [5],
          retrievedChatIds: [5],
          expectedAnswer: "explain tags",
          hypothesis: "use tags",
          conversationId: "1",
        },
        {
          questionId: "c6",
          questionType: "summarization",
          answerable: true,
          correct: false,
          evidenceChatRecall: 0.5,
          evidenceChatIds: [6, 7],
          retrievedChatIds: [6],
          expectedAnswer: "long summary",
          hypothesis: "short",
          conversationId: "1",
        },
        {
          questionId: "c7",
          questionType: "abstention",
          answerable: false,
          correct: false,
          evidenceChatRecall: null,
          evidenceChatIds: [],
          retrievedChatIds: [8],
          expectedAnswer: "no info",
          hypothesis: "some made up answer",
          conversationId: "1",
        },
      ],
    };
    const written: Record<string, string> = {};
    const report = await analyzePhase63LiveAnswerGap(
      { liveReportPath: "/tmp/live.json", outputPath: "/tmp/gap.json" },
      {
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async () => JSON.stringify(liveReport),
        writeFile: async (path, value) => {
          written[path] = value;
        },
        mkdir: async () => undefined,
        questionByQuestionId: new Map([
          ["c4", "How many cards do I have in total?"],
        ]),
      },
    );

    expect(report.summary.wrongAnswerCases).toBe(6);
    expect(report.summary.correctCases).toBe(1);
    expect(report.summary.totalCases).toBe(7);
    expect(report.recallStatusCounts["full-recall-clean"]).toBe(3);
    expect(report.recallStatusCounts["full-recall-noisy"]).toBe(1);
    expect(report.recallStatusCounts["missing-evidence"]).toBe(1);
    expect(report.recallStatusCounts.abstention).toBe(1);
    expect(report.buckets.conflict_update).toEqual(["c2"]);
    expect(report.buckets.temporal_order).toEqual(["c3"]);
    expect(report.buckets.aggregate_count).toEqual(["c4"]);
    expect(report.buckets.instruction_following).toEqual(["c5"]);
    expect(report.buckets.summarization).toEqual(["c6"]);
    expect(report.buckets.abstention).toEqual(["c7"]);
    expect(report.buckets.other).toEqual([]);
    expect(report.summary.attributedShare).toBe(1);
    expect(report.topRepairFamilies[0].count).toBe(1);
    expect(written["/tmp/gap.json"]).toContain("topRepairFamilies");
  });
});
