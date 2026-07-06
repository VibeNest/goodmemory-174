import { describe, expect, it } from "bun:test";
import {
  analyzePhase63LiveAnswerGap,
  expectedHypothesisOverlap,
  findPhase63SourceCoverageWarnings,
  parsePhase63AnswerGapCliOptions,
  resolvePhase63AnswerGapBucket,
  resolvePhase63AnswerGapRecallStatus,
  resolvePhase63SourceCoverageStatus,
  uniqueNoiseChatCount,
} from "../../scripts/analyze-phase-63-live-answer-gap";
import type { BeamChatTurn } from "../../src/eval/beam";

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
        "--scale",
        "500K",
      ]),
    ).toMatchObject({
      benchmarkRoot: "/tmp/BEAM",
      liveReportPath: "/tmp/live.json",
      runId: "run-x",
      scale: "500K",
    });
    expect(() =>
      parsePhase63AnswerGapCliOptions([
        "bun",
        "run",
        "scripts/analyze-phase-63-live-answer-gap.ts",
        "--scale",
        "50K",
      ]),
    ).toThrow("--scale must be 100K, 500K, 1M, 10M, or unknown");
  });

  it("rejects duplicate scalar CLI selectors before reading answer-gap inputs", () => {
    for (const flagName of [
      "--benchmark-root",
      "--live-report",
      "--output-dir",
      "--output-path",
      "--run-id",
      "--scale",
    ]) {
      expect(() =>
        parsePhase63AnswerGapCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-63-live-answer-gap.ts",
          flagName,
          flagName === "--scale" ? "100K" : "first",
          flagName,
          flagName === "--scale" ? "500K" : "second",
        ]),
      ).toThrow(`${flagName} cannot be specified more than once.`);
    }
  });

  it("rejects empty or whitespace-padded BEAM root environment values", () => {
    const original = process.env.GOODMEMORY_BEAM_ROOT;
    try {
      process.env.GOODMEMORY_BEAM_ROOT = "/tmp/BEAM-env";
      expect(
        parsePhase63AnswerGapCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-63-live-answer-gap.ts",
          "--live-report",
          "/tmp/live.json",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-env");
      expect(
        parsePhase63AnswerGapCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-63-live-answer-gap.ts",
          "--live-report",
          "/tmp/live.json",
          "--benchmark-root",
          "/tmp/BEAM-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-cli");

      process.env.GOODMEMORY_BEAM_ROOT = " /tmp/BEAM-env ";
      expect(() =>
        parsePhase63AnswerGapCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-63-live-answer-gap.ts",
          "--live-report",
          "/tmp/live.json",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");

      process.env.GOODMEMORY_BEAM_ROOT = "";
      expect(() =>
        parsePhase63AnswerGapCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-63-live-answer-gap.ts",
          "--live-report",
          "/tmp/live.json",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");
    } finally {
      if (original === undefined) {
        delete process.env.GOODMEMORY_BEAM_ROOT;
      } else {
        process.env.GOODMEMORY_BEAM_ROOT = original;
      }
    }
  });

  it("rejects output run ids that are not single path segments", async () => {
    expect(() =>
      parsePhase63AnswerGapCliOptions([
        "bun",
        "run",
        "scripts/analyze-phase-63-live-answer-gap.ts",
        "--live-report",
        "/tmp/live.json",
        "--run-id",
        "../outside-beam",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    await expect(
      analyzePhase63LiveAnswerGap(
        {
          liveReportPath: "/tmp/live.json",
          runId: "../outside-beam",
        },
        {
          readFile: async () => {
            throw new Error("should not read live report");
          },
        },
      ),
    ).rejects.toThrow("--run-id must be a single path segment.");
  });

  it("rejects an output path that would overwrite the live report before reading it", async () => {
    await expect(
      analyzePhase63LiveAnswerGap(
        {
          liveReportPath: "/tmp/beam-live-report.json",
          outputPath: "/tmp/beam-live-report.json",
        },
        {
          readFile: async () => {
            throw new Error("should not read live report");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --live-report must refer to different paths",
    );
  });

  it("rejects an output path that would overwrite a benchmark source file before reading it", async () => {
    await expect(
      analyzePhase63LiveAnswerGap(
        {
          benchmarkRoot: "/tmp/BEAM",
          liveReportPath: "/tmp/beam-live-report.json",
          outputPath: "/tmp/BEAM/../BEAM/100K.json",
        },
        {
          readFile: async (path) => {
            if (path === "/tmp/beam-live-report.json") {
              return JSON.stringify({ cases: [] });
            }
            throw new Error(`should not read benchmark source ${path}`);
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --benchmark-root source must refer to different paths",
    );
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
    expect(
      resolvePhase63AnswerGapBucket({
        ...base,
        questionType: "preference_following",
      }),
    ).toBe("preference_following");
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

  it("warns when expected cues appear outside the declared source chats", () => {
    const turn = (id: number, content: string): BeamChatTurn => ({
      content,
      id,
      index: "1,1",
      questionType: "summarization",
      role: "assistant",
      timeAnchor: "March-15-2024",
    });
    const warnings = findPhase63SourceCoverageWarnings({
      expectedAnswer:
        "The plan later integrated a freelance contract into the budget while balancing income against expenses and savings.",
      sourceCase: {
        chat: [
          [
            turn(
              10,
              "The source budget covers a $2,000 emergency fund and warm clothing.",
            ),
            turn(
              11,
              "The later freelance contract increased income and changed the budget plan.",
            ),
          ],
        ],
        evidenceChatIds: [10],
      },
    });

    expect(warnings).toContainEqual({
      cue: "freelance contract",
      matchingChatIdsOutsideEvidence: [11],
    });
  });

  it("warns when expected cues are missing from the whole source case", () => {
    const turn = (id: number, content: string): BeamChatTurn => ({
      content,
      id,
      index: "1,1",
      questionType: "summarization",
      role: "assistant",
      timeAnchor: "March-15-2024",
    });
    const warnings = findPhase63SourceCoverageWarnings({
      expectedAnswer:
        "The project started with initial planning and resource gathering, then moved into development, testing, and review.",
      sourceCase: {
        chat: [
          [
            turn(
              4,
              "Crystal wanted morning movie recommendations for family viewing.",
            ),
            turn(
              9,
              "The assistant suggested classic musicals and family-friendly films.",
            ),
          ],
        ],
        evidenceChatIds: [4, 9],
      },
    });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.matchingChatIdsOutsideEvidence.length === 0)).toBe(
      true,
    );
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCase: { chat: [], evidenceChatIds: [4, 9] },
        sourceCoverageWarnings: warnings,
      }),
    ).toBe("expected-cues-missing-from-source");
  });

  it("classifies source coverage audit status", () => {
    const warning = {
      cue: "freelance contract",
      matchingChatIdsOutsideEvidence: [11],
    };
    const missingWarning = {
      cue: "project development",
      matchingChatIdsOutsideEvidence: [],
    };
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCoverageWarnings: [warning],
      }),
    ).toBe("not-audited");
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCase: { chat: [], evidenceChatIds: [10] },
        sourceCoverageWarnings: [],
      }),
    ).toBe("covered-or-no-warning");
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCase: { chat: [], evidenceChatIds: [10] },
        sourceCoverageWarnings: [warning],
      }),
    ).toBe("expected-cues-outside-source");
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCase: { chat: [], evidenceChatIds: [10] },
        sourceCoverageWarnings: [missingWarning],
      }),
    ).toBe("expected-cues-missing-from-source");
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCase: { chat: [], evidenceChatIds: [] },
        sourceCoverageWarnings: [],
      }),
    ).toBe("no-declared-source-ids");
    expect(
      resolvePhase63SourceCoverageStatus({
        sourceCase: { chat: [], evidenceChatIds: [] },
        sourceCoverageWarnings: [warning],
      }),
    ).toBe("no-declared-source-ids");
  });

  it("analyzes a synthetic live report end to end", async () => {
    const liveReport = {
      profile: "goodmemory-rules-only",
      runId: "run-src",
      summary: { totalCases: 8, correctCases: 1, wrongAnswerCases: 7 },
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
        {
          questionId: "c8",
          questionType: "summarization",
          answerable: true,
          correct: false,
          evidenceChatRecall: 1,
          evidenceChatIds: [10],
          retrievedChatIds: [10],
          expectedAnswer:
            "The plan later integrated a freelance contract into the budget.",
          hypothesis: "The plan covered a budget.",
          conversationId: "1",
        },
      ],
    };
    const turn = (id: number, content: string): BeamChatTurn => ({
      content,
      id,
      index: "1,1",
      questionType: "summarization",
      role: "assistant",
      timeAnchor: "March-15-2024",
    });
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
        sourceCaseByQuestionId: new Map([
          [
            "c8",
            {
              chat: [
                [
                  turn(10, "The source budget covers warm clothing."),
                  turn(
                    11,
                    "The later freelance contract changed the budget plan.",
                  ),
                ],
              ],
              evidenceChatIds: [10],
            },
          ],
        ]),
      },
    );

    expect(report.summary.wrongAnswerCases).toBe(7);
    expect(report.summary.correctCases).toBe(1);
    expect(report.summary.totalCases).toBe(8);
    expect(report.recallStatusCounts["full-recall-clean"]).toBe(4);
    expect(report.recallStatusCounts["full-recall-noisy"]).toBe(1);
    expect(report.recallStatusCounts["missing-evidence"]).toBe(1);
    expect(report.recallStatusCounts.abstention).toBe(1);
    expect(report.sourceCoverageStatusCounts).toMatchObject({
      "covered-or-no-warning": 0,
      "expected-cues-missing-from-source": 0,
      "expected-cues-outside-source": 1,
      "no-declared-source-ids": 0,
      "not-audited": 6,
    });
    expect(report.buckets.conflict_update).toEqual(["c2"]);
    expect(report.buckets.temporal_order).toEqual(["c3"]);
    expect(report.buckets.aggregate_count).toEqual(["c4"]);
    expect(report.buckets.instruction_following).toEqual(["c5"]);
    expect(report.buckets.summarization).toEqual(["c6", "c8"]);
    expect(report.buckets.abstention).toEqual(["c7"]);
    expect(report.buckets.other).toEqual([]);
    expect(report.summary.wrongSourceCoverageWarningCases).toBe(1);
    expect(report.summary.wrongSourceCoverageWarnings).toBeGreaterThan(0);
    expect(report.sourceCoverageWarningBuckets).toEqual([
      {
        bucket: "summarization",
        caseCount: 1,
        sampleQuestionIds: ["c8"],
        warningCount: 3,
      },
    ]);
    expect(
      report.cases.find((testCase) => testCase.questionId === "c8")
        ?.sourceCoverageWarnings,
    ).toContainEqual({
      cue: "freelance contract",
      matchingChatIdsOutsideEvidence: [11],
    });
    expect(
      report.cases.find((testCase) => testCase.questionId === "c8")
        ?.sourceCoverageStatus,
    ).toBe("expected-cues-outside-source");
    expect(report.summary.attributedShare).toBe(1);
    const summarizationRepair = report.topRepairFamilies.find(
      (repair) => repair.bucket === "summarization",
    );
    expect(summarizationRepair).toMatchObject({
      dominantSourceCoverageStatus: "expected-cues-outside-source",
      sourceCoverageWarningCases: 1,
    });
    expect(summarizationRepair?.suggestedLane).toContain(
      "evidence-source selection",
    );
    expect(report.topRepairFamilies[0].count).toBe(2);
    expect(written["/tmp/gap.json"]).toContain("topRepairFamilies");
  });
});
