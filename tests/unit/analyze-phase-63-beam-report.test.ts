import { describe, expect, it } from "bun:test";
import {
  analyzePhase63BeamReport,
  inferPhase63BeamCaseCategory,
  runPhase63BeamReportAnalysis,
} from "../../scripts/analyze-phase-63-beam-report";
import type { BeamReport } from "../../src/eval/beam";

function buildReport(): BeamReport {
  return {
    benchmarkRoot: "/private/tmp/BEAM",
    generatedAt: "2026-05-18T00:04:14.426Z",
    generatedBy: "scripts/run-phase-63-eval.ts",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profiles: {
      "baseline-full-context": {
        cases: [
          {
            answerScore: {
              correct: true,
              method: "exact",
              reasoning: "ok",
            },
            answerable: true,
            correct: true,
            evidenceChatIds: [3],
            evidenceChatRecall: 1,
            hypothesis: "Theo",
            questionId: "1:information_extraction:1",
            questionType: "numerical_precision",
            retrievedChatIds: [1, 2, 3, 4],
          },
        ],
        summary: {
          accuracy: 1,
          abstentionCorrectCases: 0,
          correctCases: 1,
          evidenceCaseCount: 1,
          evidenceChatRecall: 1,
          missedRecallCases: 0,
          totalCases: 1,
          wrongAnswerCases: 0,
          wrongRecallCases: 1,
        },
      },
      "baseline-no-memory": {
        cases: [
          {
            answerScore: {
              correct: false,
              method: "mismatch",
              reasoning: "missing",
            },
            answerable: true,
            correct: false,
            evidenceChatIds: [3],
            evidenceChatRecall: 0,
            hypothesis: "No answer.",
            questionId: "1:information_extraction:1",
            questionType: "numerical_precision",
            retrievedChatIds: [],
          },
        ],
        summary: {
          accuracy: 0,
          abstentionCorrectCases: 0,
          correctCases: 0,
          evidenceCaseCount: 1,
          evidenceChatRecall: 0,
          missedRecallCases: 1,
          totalCases: 1,
          wrongAnswerCases: 1,
          wrongRecallCases: 0,
        },
      },
      "goodmemory-hybrid": {
        cases: [
          {
            answerScore: {
              correct: true,
              method: "exact",
              reasoning: "oracle",
            },
            answerable: true,
            correct: true,
            evidenceChatIds: [3],
            evidenceChatRecall: 1,
            hypothesis: "Theo",
            questionId: "1:information_extraction:1",
            questionType: "numerical_precision",
            retrievedChatIds: [3],
          },
          {
            answerScore: {
              correct: true,
              method: "exact",
              reasoning: "source-id blind oracle",
            },
            answerable: true,
            correct: true,
            evidenceChatIds: [],
            evidenceChatRecall: null,
            hypothesis: "A summary answer",
            questionId: "1:summarization:1",
            questionType: "summarization",
            retrievedChatIds: [],
          },
        ],
        summary: {
          accuracy: 1,
          abstentionCorrectCases: 0,
          correctCases: 2,
          evidenceCaseCount: 1,
          evidenceChatRecall: 1,
          missedRecallCases: 0,
          totalCases: 2,
          wrongAnswerCases: 0,
          wrongRecallCases: 0,
        },
      },
    },
    runDirectory: "/tmp/out/run",
    runId: "run-phase63-beam-100k-full-initial-20260518T000335Z",
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {
        numerical_precision: 1,
      },
      executionFailures: 0,
      profilesCompared: [
        "baseline-no-memory",
        "baseline-full-context",
        "goodmemory-hybrid",
      ],
      scale: "100K",
      totalCases: 2,
    },
  };
}

describe("analyze phase-63 BEAM report", () => {
  it("infers BEAM task category from real-row question ids", () => {
    expect(
      inferPhase63BeamCaseCategory({
        questionId: "12:multi_session_reasoning:2",
        questionType: "multi_session_reasoning",
      }),
    ).toBe("multi_session_reasoning");
    expect(
      inferPhase63BeamCaseCategory({
        questionId: "beam-smoke-q1",
        questionType: "specific",
      }),
    ).toBe("specific");
  });

  it("groups answer, recall, and noise pressure failures by category", () => {
    const analysis = analyzePhase63BeamReport(buildReport(), {
      generatedAt: "2026-05-18T00:10:00.000Z",
      sourceReportPath: "/tmp/out/run/report.json",
    });

    expect(analysis.status).toBe("needs-live-retrieval-analysis");
    expect(analysis.dataset.totalCases).toBe(2);
    expect(analysis.dataset.answerableWithoutEvidenceIds).toBe(1);
    expect(
      analysis.profiles["baseline-no-memory"]?.answerFailures.byCategory,
    ).toEqual({
      information_extraction: 1,
    });
    expect(
      analysis.profiles["baseline-no-memory"]?.missedRecall.byCategory,
    ).toEqual({
      information_extraction: 1,
    });
    expect(
      analysis.profiles["baseline-full-context"]?.wrongRecall.byCategory,
    ).toEqual({
      information_extraction: 1,
    });
    expect(
      analysis.profiles["baseline-full-context"]?.retrievalPressure
        .averageDistractorChatIds,
    ).toBe(3);
    expect(analysis.boundaryFindings).toContain(
      "goodmemory profiles currently use deterministic oracle hypotheses/evidence ids; this report is not live GoodMemory answer-quality proof.",
    );
  });

  it("writes the analysis next to the source report", async () => {
    const writes = new Map<string, string>();
    const result = await runPhase63BeamReportAnalysis(
      {
        reportPath: "/tmp/out/run/report.json",
      },
      {
        now: () => new Date("2026-05-18T00:10:00.000Z"),
        readFile: async () => JSON.stringify(buildReport()),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(result.outputPath).toBe("/tmp/out/run/miss-case-analysis.json");
    expect(writes.has("/tmp/out/run/miss-case-analysis.json")).toBe(true);
  });

  it("rejects output paths that overwrite the source report before reading it", async () => {
    await expect(
      runPhase63BeamReportAnalysis(
        {
          outputPath: "/tmp/out/run/report.json",
          reportPath: "/tmp/out/run/report.json",
        },
        {
          readFile: async () => {
            throw new Error("should not read source report");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --report-path must refer to different paths",
    );
  });
});
