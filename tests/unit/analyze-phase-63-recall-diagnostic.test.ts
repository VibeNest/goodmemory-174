import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  analyzePhase63RecallDiagnostic,
  parsePhase63RecallDiagnosticAnalysisCliOptions,
  runPhase63RecallDiagnosticAnalysis,
} from "../../scripts/analyze-phase-63-recall-diagnostic";
import type { BeamCaseResult, BeamReport } from "../../src/eval/beam";

function buildCase(input: {
  answerable?: boolean;
  evidenceChatIds: number[];
  evidenceChatRecall: number | null;
  questionId: string;
  questionType: string;
  retrievedChatIds: number[];
}): BeamCaseResult {
  return {
    answerScore: {
      correct: false,
      method: "mismatch",
      reasoning: "Recall diagnostic only.",
    },
    answerable: input.answerable ?? true,
    correct: false,
    evidenceChatIds: input.evidenceChatIds,
    evidenceChatRecall: input.evidenceChatRecall,
    hypothesis: "Recall diagnostic only.",
    questionId: input.questionId,
    questionType: input.questionType,
    retrievedChatIds: input.retrievedChatIds,
  };
}

function buildReport(input: {
  cases: BeamCaseResult[];
  runId: string;
}): BeamReport {
  return {
    benchmarkRoot: "/tmp/BEAM",
    generatedAt: "2026-05-20T07:00:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-recall-diagnostic.ts",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profiles: {
      "goodmemory-rules-only": {
        cases: input.cases,
        summary: {
          accuracy: 0,
          abstentionCorrectCases: 0,
          correctCases: 0,
          evidenceCaseCount: input.cases.filter(
            (testCase) => testCase.evidenceChatRecall !== null,
          ).length,
          evidenceChatRecall: 0.5,
          missedRecallCases: input.cases.filter(
            (testCase) =>
              testCase.evidenceChatRecall !== null &&
              testCase.evidenceChatRecall < 1,
          ).length,
          totalCases: input.cases.length,
          wrongAnswerCases: input.cases.length,
          wrongRecallCases: input.cases.filter((testCase) =>
            testCase.retrievedChatIds.some(
              (id) => !testCase.evidenceChatIds.includes(id),
            )
          ).length,
        },
      },
    },
    runDirectory: `/tmp/out/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {
        abstention: 1,
        event_ordering: 1,
        summarization: 2,
      },
      executionFailures: 0,
      profilesCompared: ["goodmemory-rules-only"],
      scale: "100K",
      totalCases: input.cases.length,
    },
  };
}

function buildBeamRows(): unknown[] {
  return [
    {
      chat: [
        [
          {
            content: "The learner started with general triangle area formulas.",
            id: 1,
            index: "1,1",
            question_type: "summarization",
            role: "user",
            time_anchor: "March-01-2024",
          },
          {
            content: "We connected SSS ratios to triangle similarity.",
            id: 2,
            index: "1,2",
            question_type: "summarization",
            role: "assistant",
            time_anchor: "March-01-2024",
          },
          {
            content: "We explained why SSA is ambiguous for congruence.",
            id: 3,
            index: "1,3",
            question_type: "summarization",
            role: "assistant",
            time_anchor: "March-02-2024",
          },
          {
            content: "Carla completed the collaboration review milestone.",
            id: 4,
            index: "1,4",
            question_type: "event_ordering",
            role: "user",
            time_anchor: "March-03-2024",
          },
          {
            content: "Generic writing progress note without Carla details.",
            id: 5,
            index: "1,5",
            question_type: "event_ordering",
            role: "assistant",
            time_anchor: "March-04-2024",
          },
          {
            content: "Noise about unrelated publication planning.",
            id: 6,
            index: "1,6",
            question_type: "event_ordering",
            role: "assistant",
            time_anchor: "March-05-2024",
          },
          {
            content: "An abstention distractor turn.",
            id: 7,
            index: "1,7",
            question_type: "abstention",
            role: "user",
            time_anchor: "March-06-2024",
          },
        ],
      ],
      conversation_id: "beam-recall-analysis",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Education",
        id: 4,
        subtopics: ["Triangle proofs", "Collaboration"],
        theme: "Learning progression",
        title: "Triangle Learning",
      },
      narratives: "Triangle and writing collaboration labels",
      probing_questions: {
        abstention: [
          {
            answer: "No answer.",
            evidence_chat_ids: [],
            question: "What did I say about astronomy?",
            question_id: "4:abstention:1",
            question_type: "abstention",
          },
        ],
        event_ordering: [
          {
            answer: "Carla completed the review.",
            evidence_chat_ids: [4],
            question: "What happened in the Carla collaboration sequence?",
            question_id: "10:event_ordering:2",
            question_type: "event_ordering",
          },
        ],
        summarization: [
          {
            answer: "The learner moved from formulas to proof criteria.",
            evidence_chat_ids: [1, 2],
            question:
              "How did my triangle similarity and congruence understanding develop?",
            question_id: "4:summarization:2",
            question_type: "summarization",
          },
          {
            answer: "SSA ambiguity was the later point.",
            evidence_chat_ids: [3],
            question: "Summarize my later triangle proof milestone.",
            question_id: "4:summarization:3",
            question_type: "summarization",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Mira",
        user_relationships: "Carla is a collaborator.",
      },
      user_questions: [],
    },
  ];
}

describe("analyze phase-63 recall diagnostic", () => {
  it("parses recall diagnostic analysis cli flags", () => {
    expect(
      parsePhase63RecallDiagnosticAnalysisCliOptions([
        "bun",
        "run",
        "scripts/analyze-phase-63-recall-diagnostic.ts",
        "--report-path",
        "/tmp/after/recall-diagnostic.json",
        "--baseline-report-path",
        "/tmp/before/recall-diagnostic.json",
        "--benchmark-root",
        "/tmp/BEAM",
        "--profile",
        "goodmemory-rules-only",
        "--source-turn-limit",
        "2",
      ]),
    ).toEqual({
      baselineReportPath: "/tmp/before/recall-diagnostic.json",
      baselineRunId: undefined,
      benchmarkRoot: "/tmp/BEAM",
      outputDir: undefined,
      outputPath: undefined,
      profile: "goodmemory-rules-only",
      reportPath: "/tmp/after/recall-diagnostic.json",
      runId: undefined,
      sourceTurnLimit: 2,
    });
  });

  it("rejects duplicate scalar cli selectors before comparing reports", () => {
    for (const flagName of [
      "--baseline-report-path",
      "--baseline-run-id",
      "--benchmark-root",
      "--output-dir",
      "--output-path",
      "--profile",
      "--report-path",
      "--run-id",
      "--source-turn-limit",
    ]) {
      expect(() =>
        parsePhase63RecallDiagnosticAnalysisCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-63-recall-diagnostic.ts",
          flagName,
          flagName === "--source-turn-limit" ? "2" : "first",
          flagName,
          flagName === "--source-turn-limit" ? "3" : "second",
        ]),
      ).toThrow(`${flagName} cannot be specified more than once.`);
    }
  });

  it("summarizes bucket failures and deltas from recall diagnostic reports", () => {
    const baselineReport = buildReport({
      cases: [
        buildCase({
          evidenceChatIds: [1, 2],
          evidenceChatRecall: 0.5,
          questionId: "4:summarization:2",
          questionType: "summarization",
          retrievedChatIds: [1, 5],
        }),
        buildCase({
          evidenceChatIds: [3],
          evidenceChatRecall: 0,
          questionId: "4:summarization:3",
          questionType: "summarization",
          retrievedChatIds: [],
        }),
        buildCase({
          evidenceChatIds: [4],
          evidenceChatRecall: 1,
          questionId: "10:event_ordering:2",
          questionType: "event_ordering",
          retrievedChatIds: [4, 6],
        }),
        buildCase({
          answerable: false,
          evidenceChatIds: [],
          evidenceChatRecall: null,
          questionId: "4:abstention:1",
          questionType: "abstention",
          retrievedChatIds: [],
        }),
      ],
      runId: "before",
    });
    const report = buildReport({
      cases: [
        buildCase({
          evidenceChatIds: [1, 2],
          evidenceChatRecall: 1,
          questionId: "4:summarization:2",
          questionType: "summarization",
          retrievedChatIds: [1, 2, 5],
        }),
        buildCase({
          evidenceChatIds: [3],
          evidenceChatRecall: 0,
          questionId: "4:summarization:3",
          questionType: "summarization",
          retrievedChatIds: [],
        }),
        buildCase({
          evidenceChatIds: [4],
          evidenceChatRecall: 0,
          questionId: "10:event_ordering:2",
          questionType: "event_ordering",
          retrievedChatIds: [6],
        }),
        buildCase({
          answerable: false,
          evidenceChatIds: [],
          evidenceChatRecall: null,
          questionId: "4:abstention:1",
          questionType: "abstention",
          retrievedChatIds: [7],
        }),
      ],
      runId: "after",
    });

    const analysis = analyzePhase63RecallDiagnostic({
      baselineReport,
      baselineReportPath: "/tmp/before/recall-diagnostic.json",
      generatedAt: "2026-05-20T07:10:00.000Z",
      report,
      reportPath: "/tmp/after/recall-diagnostic.json",
      sourceTurnLimit: 2,
    });

    expect(analysis.globalSummary).toMatchObject({
      evidenceCases: 3,
      missedRecallCases: 2,
      totalExpectedEvidenceIds: 4,
      totalHitEvidenceIds: 2,
      totalMissingEvidenceIds: 2,
      totalNoiseChatIds: 3,
      totalRetrievedChatIds: 5,
      wrongRecallCases: 3,
      zeroRecallCases: 2,
    });
    expect(
      analysis.bucketSummaries.find((bucket) => bucket.category === "summarization"),
    ).toMatchObject({
      averageEvidenceChatRecall: 0.5,
      totalHitEvidenceIds: 2,
      totalMissingEvidenceIds: 1,
      zeroRecallCases: 1,
    });
    expect(
      analysis.bucketDeltas?.find((bucket) => bucket.category === "summarization"),
    ).toMatchObject({
      averageEvidenceChatRecallDelta: 0.25,
      totalHitEvidenceIdsDelta: 1,
      totalMissingEvidenceIdsDelta: -1,
    });
    expect(
      analysis.bucketDeltas?.find((bucket) => bucket.category === "event_ordering"),
    ).toMatchObject({
      averageEvidenceChatRecallDelta: -1,
      totalHitEvidenceIdsDelta: -1,
      totalMissingEvidenceIdsDelta: 1,
    });
    expect(
      analysis.caseDeltas?.find(
        (testCase) => testCase.questionId === "4:summarization:2",
      ),
    ).toMatchObject({
      recoveredChatIds: [2],
      recallDelta: 0.5,
    });
  });

  it("writes workbench analysis with representative source turns", async () => {
    const baselineReportPath = "/tmp/before/recall-diagnostic.json";
    const reportPath = "/tmp/after/recall-diagnostic.json";
    const writes = new Map<string, string>();
    const baselineReport = buildReport({
      cases: [
        buildCase({
          evidenceChatIds: [3],
          evidenceChatRecall: 0,
          questionId: "4:summarization:3",
          questionType: "summarization",
          retrievedChatIds: [],
        }),
      ],
      runId: "before",
    });
    const report = buildReport({
      cases: [
        buildCase({
          evidenceChatIds: [3],
          evidenceChatRecall: 0,
          questionId: "4:summarization:3",
          questionType: "summarization",
          retrievedChatIds: [6],
        }),
      ],
      runId: "after",
    });

    const result = await runPhase63RecallDiagnosticAnalysis(
      {
        baselineReportPath,
        benchmarkRoot: "/tmp/BEAM",
        reportPath,
        sourceTurnLimit: 1,
      },
      {
        now: () => new Date("2026-05-20T07:10:00.000Z"),
        readFile: async (path) => {
          if (path === baselineReportPath) {
            return JSON.stringify(baselineReport);
          }
          if (path === reportPath) {
            return JSON.stringify(report);
          }
          expect(path).toBe(join("/tmp/BEAM", "beam_100k.json"));
          return JSON.stringify(buildBeamRows());
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(result.outputPath).toBe("/tmp/after/recall-diagnostic-analysis.json");
    expect(writes.has("/tmp/after/recall-diagnostic-analysis.json")).toBe(true);
    expect(result.analysis.zeroRecallCases[0]?.sourceTurns?.missing[0]).toMatchObject({
      chatId: 3,
      contentPreview: "We explained why SSA is ambiguous for congruence.",
    });
    expect(result.analysis.zeroRecallCases[0]?.sourceTurns?.noise[0]).toMatchObject({
      chatId: 6,
      contentPreview: "Noise about unrelated publication planning.",
    });
  });
});
