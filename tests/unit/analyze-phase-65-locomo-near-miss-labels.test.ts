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
            goldAnswer:
              "A Nintendo Switch, since Xenoblade 2 is made for this console",
            matchMode: deriveLocomoMatchMode("multi_hop"),
            question: "What console does Nate own?",
            questionId: "q-rationale-only",
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
        answer: "Nintendo Switch",
        gold: "A Nintendo Switch, since Xenoblade 2 is made for this console",
        questionId: "q-rationale-only",
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
        questionCount: 4,
        runId: "candidate-live",
      },
    ]);
    expect(analysis.overall.nearMissCount).toBe(4);
    expect(analysis.overall.diagnosisCounts["under-specified-answer"]).toBe(1);
    expect(analysis.overall.diagnosisCounts["numeric-or-frequency-format"]).toBe(
      1,
    );
    expect(analysis.overall.diagnosisCounts["over-specified-answer"]).toBe(1);
    expect(analysis.overall.diagnosisCounts["rationale-bearing-gold-answer"]).toBe(
      1,
    );
    expect(analysis.overall.fullRecallCount).toBe(3);
    expect(analysis.overall.partialRecallCount).toBe(1);
    expect(analysis.overall.questionIds).toEqual([
      "q-under",
      "q-rationale-only",
      "q-numeric",
      "q-over",
    ]);
    expect(analysis.questionIds).toEqual([
      "q-under",
      "q-rationale-only",
      "q-numeric",
      "q-over",
    ]);
    expect(analysis.categories.multi_hop?.nearMissCount).toBe(4);
    expect(analysis.categories.multi_hop?.questionIds).toEqual([
      "q-under",
      "q-rationale-only",
      "q-numeric",
      "q-over",
    ]);
    expect(analysis.repairJobs).toEqual([
      {
        category: "multi_hop",
        diagnosis: "numeric-or-frequency-format",
        questionCount: 1,
        questionIds: ["q-numeric"],
        retrievalBucket: "full",
      },
      {
        category: "multi_hop",
        diagnosis: "over-specified-answer",
        questionCount: 1,
        questionIds: ["q-over"],
        retrievalBucket: "full",
      },
      {
        category: "multi_hop",
        diagnosis: "rationale-bearing-gold-answer",
        questionCount: 1,
        questionIds: ["q-rationale-only"],
        retrievalBucket: "full",
      },
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
      "rationale-bearing-gold-answer",
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
    expect(analysis.rows[1]?.tokenOverlap.missingGoldTokens).toEqual([
      "2",
      "console",
      "for",
      "is",
      "made",
      "since",
      "this",
      "xenoblade",
    ]);
    expect(analysis.rows[2]?.tokenOverlap.overlapTokens).toEqual(["times"]);
    expect(analysis.rows[3]?.tokenOverlap.extraGeneratedTokens).toEqual([
      "best",
      "buy",
      "console",
      "from",
      "oled",
      "switch",
    ]);
  });

  it("routes appositive gold rationales to the rationale-bearing queue", () => {
    const cases = [
      question({
        answer: "Nintendo Switch",
        gold: "Nintendo Switch, a console Nate plays Xenoblade 2 on",
        questionId: "q-appositive-rationale",
      }),
    ];
    const candidate = candidateReport(cases);
    const analysis = analyzeLocomoNearMissLabels({
      benchmarkCases: [
        {
          caseId: "locomo-conv-1",
          questions: [
            {
              adversarialAnswer: null,
              category: "multi_hop",
              evidenceTurnIds: ["D1:1"],
              goldAnswer: "Nintendo Switch, a console Nate plays Xenoblade 2 on",
              matchMode: deriveLocomoMatchMode("multi_hop"),
              question: "What console does Nate own?",
              questionId: "q-appositive-rationale",
            },
          ],
          sourceConversation: "conversation-1",
          speakers: ["Jordan", "Riley"],
          turns: [
            {
              content: "Jordan discussed a Nintendo Switch.",
              diaId: "D1:1",
              speaker: "Jordan",
            },
          ],
        },
      ],
      candidate,
      candidatePath: CANDIDATE_REPORT_PATH,
      generatedAt: "2026-07-04T02:30:00.000Z",
      liveDelta: liveDelta(cases.map(nearMissDelta)),
      liveDeltaPath: LIVE_DELTA_PATH,
      runId: "near-miss-label-analysis",
    });

    expect(analysis.rows[0]?.diagnosis).toBe("rationale-bearing-gold-answer");
    expect(analysis.repairJobs).toEqual([
      {
        category: "multi_hop",
        diagnosis: "rationale-bearing-gold-answer",
        questionCount: 1,
        questionIds: ["q-appositive-rationale"],
        retrievalBucket: "full",
      },
    ]);
  });

  it("routes parenthetical gold rationales to the rationale-bearing queue", () => {
    const cases = [
      question({
        answer: "Nintendo Switch",
        gold: "Nintendo Switch (the console Nate plays Xenoblade 2 on)",
        questionId: "q-parenthetical-rationale",
      }),
    ];
    const candidate = candidateReport(cases);
    const analysis = analyzeLocomoNearMissLabels({
      benchmarkCases: [
        {
          caseId: "locomo-conv-1",
          questions: [
            {
              adversarialAnswer: null,
              category: "multi_hop",
              evidenceTurnIds: ["D1:1"],
              goldAnswer: "Nintendo Switch (the console Nate plays Xenoblade 2 on)",
              matchMode: deriveLocomoMatchMode("multi_hop"),
              question: "What console does Nate own?",
              questionId: "q-parenthetical-rationale",
            },
          ],
          sourceConversation: "conversation-1",
          speakers: ["Jordan", "Riley"],
          turns: [
            {
              content: "Jordan discussed a Nintendo Switch.",
              diaId: "D1:1",
              speaker: "Jordan",
            },
          ],
        },
      ],
      candidate,
      candidatePath: CANDIDATE_REPORT_PATH,
      generatedAt: "2026-07-04T02:45:00.000Z",
      liveDelta: liveDelta(cases.map(nearMissDelta)),
      liveDeltaPath: LIVE_DELTA_PATH,
      runId: "near-miss-label-analysis",
    });

    expect(analysis.rows[0]?.diagnosis).toBe("rationale-bearing-gold-answer");
    expect(analysis.repairJobs).toEqual([
      {
        category: "multi_hop",
        diagnosis: "rationale-bearing-gold-answer",
        questionCount: 1,
        questionIds: ["q-parenthetical-rationale"],
        retrievalBucket: "full",
      },
    ]);
  });

  it("records selected near-miss row counts in source report lineage", () => {
    const nearMiss = question({
      answer: "Switch",
      gold: "Nintendo Switch OLED console",
      questionId: "q-under",
    });
    const extraCandidateRow = question({
      answer: "Nintendo",
      gold: "Nintendo",
      questionId: "q-not-selected",
    });
    const analysis = analyzeLocomoNearMissLabels({
      benchmarkCases: JSON.parse(locomoCasesJson()).cases,
      candidate: candidateReport([nearMiss, extraCandidateRow]),
      candidatePath: CANDIDATE_REPORT_PATH,
      generatedAt: "2026-07-04T02:50:00.000Z",
      liveDelta: liveDelta([nearMissDelta(nearMiss)]),
      liveDeltaPath: LIVE_DELTA_PATH,
      runId: "near-miss-label-analysis",
    });

    expect(analysis.questionIds).toEqual(["q-under"]);
    expect(analysis.sourceReports).toEqual([
      {
        path: CANDIDATE_REPORT_PATH,
        questionCount: 1,
        runId: "candidate-live",
      },
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

  it("rejects output run ids that are not single path segments before reading reports", async () => {
    await expect(
      runLocomoNearMissLabelAnalysis(
        [
          "bun",
          "analyze",
          "--live-delta",
          LIVE_DELTA_PATH,
          "--run-id",
          "../outside-locomo",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--run-id must be a single path segment.");
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

  it("rejects output paths that overwrite the candidate benchmark cases before reading them", async () => {
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
          "/tmp/LOCOMO-full/../LOCOMO-full/cases.json",
        ],
        {
          readFile: async (path) => {
            if (path === LIVE_DELTA_PATH) {
              return JSON.stringify(liveDelta(cases.map(nearMissDelta)));
            }
            if (path === CANDIDATE_REPORT_PATH) {
              return JSON.stringify(candidateReport(cases));
            }
            throw new Error(`should not read ${path}`);
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and candidate benchmark cases must refer to different paths",
    );
  });
});
