import { describe, expect, it } from "bun:test";
import type {
  LocomoLiveDeltaAnalysis,
  LocomoLiveDeltaSummary,
  LocomoLiveQuestionDelta,
} from "../../scripts/analyze-phase-65-locomo-live-delta";
import {
  LOCOMO_NEAR_MISS_LABEL_ANALYSIS_FILE_NAME,
  analyzeLocomoNearMissLabels,
  runLocomoNearMissLabelAnalysis,
} from "../../scripts/analyze-phase-65-locomo-near-miss-labels";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import {
  deriveLocomoMatchMode,
  locomoTokenF1,
} from "../../src/eval/locomo";
import type { LocomoQaCategory } from "../../src/eval/locomo";

const CANDIDATE_REPORT_PATH =
  "/reports/phase-65/locomo/candidate/smoke-report.json";
const LIVE_DELTA_PATH = "/reports/phase-65/locomo/delta/live-delta.json";

function question(input: {
  answer: string;
  caseId?: string;
  category?: LocomoQaCategory;
  evidenceRecall?: number;
  fullyRetrieved?: boolean;
  gold: string;
  noiseTurnIds?: string[];
  questionId: string;
}): LocomoSmokeReport["cases"][number] {
  const category = input.category ?? "multi_hop";
  const evidenceRecall = input.evidenceRecall ?? 1;
  const fullyRetrieved = input.fullyRetrieved ?? true;
  const noiseTurnIds = input.noiseTurnIds ?? [];
  const retrievedEvidenceTurnIds =
    evidenceRecall > 0 || fullyRetrieved ? ["D1:1"] : [];
  const missingEvidenceTurnIds = fullyRetrieved ? [] : ["D1:2"];
  return {
    answerCorrect: false,
    answerTokenF1: locomoTokenF1(input.answer, input.gold),
    caseId: input.caseId ?? "locomo-conv-1",
    category,
    evidenceRecall,
    evidenceTurnIds: fullyRetrieved ? ["D1:1"] : ["D1:1", "D1:2"],
    generatedAnswer: input.answer,
    goldEvidenceFullyRetrieved: fullyRetrieved,
    missingEvidenceTurnIds,
    noiseTurnCount: noiseTurnIds.length,
    noiseTurnIds,
    questionId: input.questionId,
    retrievedTurnIds: [...retrievedEvidenceTurnIds, ...noiseTurnIds],
  };
}

function candidateReport(
  cases: LocomoSmokeReport["cases"],
): LocomoSmokeReport {
  return {
    answerContextMode: "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/tmp/LOCOMO-full/cases.json",
    bm25Ranking: false,
    caseCount: 1,
    caseIds: ["locomo-conv-1"],
    cases,
    categories: [],
    executionFailures: 0,
    externalRoot: "/tmp/LOCOMO-full",
    generatedAt: "2026-07-04T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "live-answer",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: ["multi_hop"],
    questionCount: cases.length,
    resume: false,
    runDirectory: "/tmp/candidate",
    runId: "candidate-live",
    semanticCandidateEmbeddingSource: "provider",
    semanticCandidates: {
      enabled: true,
      maxAdditions: 8,
      minRelativeScore: 0.8,
      minSimilarity: null,
      topK: 32,
    },
    upstreamAnswerMetricByCategory: {
      multi_hop: deriveLocomoMatchMode("multi_hop"),
    },
    upstreamSource: "https://github.com/snap-research/locomo",
  };
}

function summary(questionCount: number): LocomoLiveDeltaSummary {
  return {
    answerContextModeChangedAnswerChangeCount: 0,
    answerContextModeChangedCount: 0,
    answerContextModeChangedRegressionCount: 0,
    answerContextModeUnchangedAnswerChangeCount: 0,
    answerContextModeUnchangedCount: questionCount,
    answerContextModeUnchangedRegressionCount: 0,
    answerCorrectDelta: 0,
    answerTransitions: {
      baselineOnlyAnswered: 0,
      bothUnanswered: 0,
      candidateOnlyAnswered: 0,
      improved: 0,
      regressed: 0,
      sameCorrect: 0,
      sameWrong: questionCount,
    },
    averageEvidenceRecallDelta: 0,
    baselineCorrectCount: 0,
    baselineFullyRetrievedCount: questionCount,
    candidateCorrectCount: 0,
    candidateFullyRetrievedCount: questionCount,
    convertedRetrievalGainCount: 0,
    effectiveAnswerPolicyChangedAnswerChangeCount: 0,
    effectiveAnswerPolicyChangedCount: 0,
    effectiveAnswerPolicyChangedRegressionCount: 0,
    effectiveAnswerPolicyUnchangedAnswerChangeCount: 0,
    effectiveAnswerPolicyUnchangedCount: questionCount,
    effectiveAnswerPolicyUnchangedRegressionCount: 0,
    fullyRetrievedDelta: 0,
    fullRecallWrongNoisyDelta: 0,
    missingEvidenceWrongDelta: 0,
    noiseTurnDelta: 0,
    noisyFullRecallRegressionCount: 0,
    questionCount,
    residualLiveAnswerChangeCount: 0,
    retrievalMetricChangedAnswerChangeCount: 0,
    retrievalTransitions: {
      "full->full": questionCount,
      "full->partial": 0,
      "full->zero": 0,
      "partial->full": 0,
      "partial->partial": 0,
      "partial->zero": 0,
      "zero->full": 0,
      "zero->partial": 0,
      "zero->zero": 0,
    },
    unconvertedRetrievalGainCount: 0,
  };
}

function nearMissDelta(
  candidateQuestion: LocomoSmokeReport["cases"][number],
): LocomoLiveQuestionDelta {
  return {
    answerChangeAttribution: {
      answerContextModeChanged: false,
      answerOutcomeChanged: false,
      effectiveAnswerPolicyChanged: false,
      residualLiveAnswerChange: false,
      retrievalMetricsChanged: false,
    },
    answerContextModeChanged: false,
    answerTransition: "sameWrong",
    baseline: {
      answerCorrect: false,
      answerTokenF1: 0,
      evidenceRecall: candidateQuestion.evidenceRecall,
      generatedAnswer: "wrong",
      goldEvidenceFullyRetrieved: candidateQuestion.goldEvidenceFullyRetrieved,
      missingEvidenceTurnCount: candidateQuestion.missingEvidenceTurnIds.length,
      noiseTurnCount: candidateQuestion.noiseTurnCount,
    },
    baselineAnswerContextMode: "evidence-pack",
    baselineEffectiveAnswerPolicy: {
      commonsenseResolution: false,
      strictNoEvidenceAbstention: false,
    },
    candidate: {
      answerCorrect: false,
      answerTokenF1: candidateQuestion.answerTokenF1 ?? null,
      evidenceRecall: candidateQuestion.evidenceRecall,
      generatedAnswer: candidateQuestion.generatedAnswer,
      goldEvidenceFullyRetrieved: candidateQuestion.goldEvidenceFullyRetrieved,
      missingEvidenceTurnCount: candidateQuestion.missingEvidenceTurnIds.length,
      noiseTurnCount: candidateQuestion.noiseTurnCount,
    },
    candidateAnswerContextMode: "evidence-pack",
    candidateEffectiveAnswerPolicy: {
      commonsenseResolution: false,
      strictNoEvidenceAbstention: false,
    },
    caseId: candidateQuestion.caseId,
    category: candidateQuestion.category,
    effectiveAnswerPolicyChanged: false,
    evidenceRecallDelta: 0,
    noiseTurnDelta: 0,
    questionId: candidateQuestion.questionId,
    retrievalTransition: "full->full",
  };
}

function liveDelta(
  answerTokenF1NearMisses: LocomoLiveQuestionDelta[],
): LocomoLiveDeltaAnalysis {
  return {
    answerImprovements: [],
    answerRegressions: [],
    answerTokenF1NearMisses,
    baselineReport: {
      path: "/reports/phase-65/locomo/baseline/smoke-report.json",
      runId: "baseline-live",
    },
    benchmark: "locomo",
    candidateReport: {
      path: CANDIDATE_REPORT_PATH,
      runId: "candidate-live",
    },
    categories: {
      multi_hop: summary(answerTokenF1NearMisses.length),
    },
    claimBoundary: "Research diagnostic only; not a public release or benchmark claim.",
    generatedAt: "2026-07-04T01:00:00.000Z",
    generatedBy: "scripts/analyze-phase-65-locomo-live-delta.ts",
    mode: "live-answer",
    outputPath: LIVE_DELTA_PATH,
    overall: summary(answerTokenF1NearMisses.length),
    phase: "phase-65",
    reanswerJobs: [],
    runId: "near-miss-delta",
    sourceReports: [
      {
        path: CANDIDATE_REPORT_PATH,
        questionCount: answerTokenF1NearMisses.length,
        runId: "candidate-live",
      },
    ],
    topNoisyFullRecallWrong: [],
    topUnconvertedRetrievalGains: [],
  };
}

function locomoCasesJson(): string {
  return JSON.stringify({
    cases: [
      {
        caseId: "locomo-conv-1",
        questions: [
          {
            adversarialAnswer: null,
            category: "multi_hop",
            evidenceTurnIds: ["D1:1"],
            goldAnswer: "Nintendo Switch OLED console",
            matchMode: deriveLocomoMatchMode("multi_hop"),
            question: "What console was mentioned?",
            questionId: "q-under",
          },
          {
            adversarialAnswer: null,
            category: "multi_hop",
            evidenceTurnIds: ["D1:1"],
            goldAnswer: "two times this month",
            matchMode: deriveLocomoMatchMode("multi_hop"),
            question: "How many times did it happen?",
            questionId: "q-numeric",
          },
          {
            adversarialAnswer: null,
            category: "multi_hop",
            evidenceTurnIds: ["D1:1"],
            goldAnswer: "Nintendo",
            matchMode: deriveLocomoMatchMode("multi_hop"),
            question: "What company was named?",
            questionId: "q-over",
          },
        ],
        sourceConversation: "conversation-1",
        speakers: ["Jordan", "Riley"],
        turns: [
          {
            content: "Jordan discussed a Nintendo Switch OLED console.",
            diaId: "D1:1",
            speaker: "Jordan",
          },
        ],
      },
    ],
  });
}

describe("phase-65 LoCoMo near-miss label analyzer", () => {
  it("classifies token-F1 near misses by answer shape", () => {
    const cases = [
      question({
        answer: "Switch",
        evidenceRecall: 0.5,
        fullyRetrieved: false,
        gold: "Nintendo Switch OLED console",
        questionId: "q-under",
      }),
      question({
        answer: "2 times total",
        gold: "two times this month",
        questionId: "q-numeric",
      }),
      question({
        answer: "Nintendo Switch OLED console from Best Buy",
        gold: "Nintendo",
        questionId: "q-over",
      }),
    ];
    const candidate = candidateReport(cases);
    const analysis = analyzeLocomoNearMissLabels({
      benchmarkCases: JSON.parse(locomoCasesJson()).cases,
      candidate,
      candidatePath: CANDIDATE_REPORT_PATH,
      generatedAt: "2026-07-04T02:00:00.000Z",
      liveDelta: liveDelta(cases.map(nearMissDelta)),
      liveDeltaPath: LIVE_DELTA_PATH,
      runId: "near-miss-label-analysis",
    });

    expect(analysis.generatedBy).toBe(
      "scripts/analyze-phase-65-locomo-near-miss-labels.ts",
    );
    expect(analysis.sourceReports).toEqual([
      {
        path: CANDIDATE_REPORT_PATH,
        questionCount: 3,
        runId: "candidate-live",
      },
    ]);
    expect(analysis.overall.nearMissCount).toBe(3);
    expect(analysis.overall.diagnosisCounts["under-specified-answer"]).toBe(1);
    expect(analysis.overall.diagnosisCounts["numeric-or-frequency-format"]).toBe(
      1,
    );
    expect(analysis.overall.diagnosisCounts["over-specified-answer"]).toBe(1);
    expect(analysis.overall.fullRecallCount).toBe(2);
    expect(analysis.overall.partialRecallCount).toBe(1);
    expect(analysis.overall.questionIds).toEqual([
      "q-under",
      "q-numeric",
      "q-over",
    ]);
    expect(analysis.questionIds).toEqual(["q-under", "q-numeric", "q-over"]);
    expect(analysis.categories.multi_hop?.nearMissCount).toBe(3);
    expect(analysis.categories.multi_hop?.questionIds).toEqual([
      "q-under",
      "q-numeric",
      "q-over",
    ]);
    expect(analysis.repairJobs).toEqual([
      {
        category: "multi_hop",
        diagnosis: "under-specified-answer",
        questionCount: 1,
        questionIds: ["q-under"],
        retrievalBucket: "partial",
      },
    ]);
    expect(analysis.rows.map((row) => row.diagnosis)).toEqual([
      "under-specified-answer",
      "numeric-or-frequency-format",
      "over-specified-answer",
    ]);
    expect(analysis.rows[0]?.candidateMissingEvidenceTurnIds).toEqual(["D1:2"]);
    expect(analysis.rows[0]?.candidateRetrievedTurnIds).toEqual(["D1:1"]);
    expect(analysis.rows[0]?.tokenOverlap.missingGoldTokens).toEqual([
      "console",
      "nintendo",
      "oled",
    ]);
    expect(analysis.rows[1]?.tokenOverlap.overlapTokens).toEqual(["times"]);
    expect(analysis.rows[2]?.tokenOverlap.extraGeneratedTokens).toEqual([
      "best",
      "buy",
      "console",
      "from",
      "oled",
      "switch",
    ]);
  });

  it("loads the candidate report and benchmark source from live-delta provenance", async () => {
    const cases = [
      question({
        answer: "Switch",
        gold: "Nintendo Switch OLED console",
        questionId: "q-under",
      }),
    ];
    const candidate = candidateReport(cases);
    const writes = new Map<string, string>();

    const result = await runLocomoNearMissLabelAnalysis(
      [
        "bun",
        "analyze",
        "--live-delta",
        LIVE_DELTA_PATH,
        "--run-id",
        "near-miss-label-analysis",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-04T03:00:00.000Z"),
        readFile: async (path) => {
          if (path === LIVE_DELTA_PATH) {
            return JSON.stringify(liveDelta(cases.map(nearMissDelta)));
          }
          if (path === CANDIDATE_REPORT_PATH) {
            return JSON.stringify(candidate);
          }
          if (path === "/tmp/LOCOMO-full/cases.json") {
            return locomoCasesJson();
          }
          throw new Error(`unexpected read ${path}`);
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(result.outputPath).toBe(
      `/reports/phase-65/locomo/near-miss-label-analysis/${LOCOMO_NEAR_MISS_LABEL_ANALYSIS_FILE_NAME}`,
    );
    expect(result.analysis.overall.nearMissCount).toBe(1);
    expect(JSON.parse(writes.get(result.outputPath) ?? "{}").rows).toHaveLength(1);
  });

  it("rejects output paths that overwrite the live-delta input before reading reports", async () => {
    await expect(
      runLocomoNearMissLabelAnalysis(
        [
          "bun",
          "analyze",
          "--live-delta",
          LIVE_DELTA_PATH,
          "--output-path",
          "/reports/phase-65/locomo/delta/../delta/live-delta.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --live-delta must refer to different paths",
    );
  });

  it("rejects output paths that overwrite the candidate source report before reading it", async () => {
    const cases = [
      question({
        answer: "Switch",
        gold: "Nintendo Switch OLED console",
        questionId: "q-under",
      }),
    ];

    await expect(
      runLocomoNearMissLabelAnalysis(
        [
          "bun",
          "analyze",
          "--live-delta",
          LIVE_DELTA_PATH,
          "--output-path",
          CANDIDATE_REPORT_PATH,
        ],
        {
          readFile: async (path) => {
            if (path === LIVE_DELTA_PATH) {
              return JSON.stringify(liveDelta(cases.map(nearMissDelta)));
            }
            throw new Error(`should not read ${path}`);
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and live-delta candidateReport.path must refer to different paths",
    );
  });
});
