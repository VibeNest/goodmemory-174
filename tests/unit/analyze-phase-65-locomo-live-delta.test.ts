import { describe, expect, it } from "bun:test";
import {
  LOCOMO_LIVE_DELTA_FILE_NAME,
  analyzeLocomoLiveDelta,
  runLocomoLiveDeltaAnalysis,
} from "../../scripts/analyze-phase-65-locomo-live-delta";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import { deriveLocomoMatchMode } from "../../src/eval/locomo";
import type { LocomoQaCategory } from "../../src/eval/locomo";

function retrievedEvidenceTurnIdsForRecall(input: {
  evidenceRecall: number;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnIds: readonly string[];
  questionId: string;
}): string[] {
  if (input.goldEvidenceFullyRetrieved) {
    return ["D1:1"];
  }
  if (input.evidenceRecall === 0) {
    return [];
  }
  const hitCount = Math.round(
    (input.evidenceRecall * input.missingEvidenceTurnIds.length) /
      (1 - input.evidenceRecall),
  );
  const actualRecall =
    hitCount / (hitCount + input.missingEvidenceTurnIds.length);
  if (Math.abs(actualRecall - input.evidenceRecall) > 1e-12) {
    throw new Error(`unsupported synthetic recall for ${input.questionId}`);
  }
  return Array.from(
    { length: hitCount },
    (_value, index) => `D98:${index + 1}`,
  );
}

function question(input: {
  answerCorrect: boolean;
  answerTokenF1?: number | null;
  caseId?: string;
  category: LocomoQaCategory;
  evidenceRecall: number;
  generatedAnswer?: string;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnIds?: string[];
  noiseTurnIds?: string[];
  questionId: string;
}): LocomoSmokeReport["cases"][number] {
  const missingEvidenceTurnIds =
    input.missingEvidenceTurnIds ??
    (input.goldEvidenceFullyRetrieved ? [] : ["D1:1"]);
  const retrievedEvidenceTurnIds = retrievedEvidenceTurnIdsForRecall({
    evidenceRecall: input.evidenceRecall,
    goldEvidenceFullyRetrieved: input.goldEvidenceFullyRetrieved,
    missingEvidenceTurnIds,
    questionId: input.questionId,
  });
  const evidenceTurnIds = [...retrievedEvidenceTurnIds, ...missingEvidenceTurnIds];
  const noiseTurnIds = input.noiseTurnIds ?? [];
  return {
    answerCorrect: input.answerCorrect,
    answerTokenF1: input.answerTokenF1 ?? (input.answerCorrect ? 1 : 0),
    caseId: input.caseId ?? "locomo-conv-1",
    category: input.category,
    evidenceRecall: input.evidenceRecall,
    evidenceTurnIds,
    generatedAnswer:
      input.generatedAnswer ?? (input.answerCorrect ? "correct" : "incorrect"),
    goldEvidenceFullyRetrieved: input.goldEvidenceFullyRetrieved,
    missingEvidenceTurnIds,
    noiseTurnCount: noiseTurnIds.length,
    noiseTurnIds,
    questionId: input.questionId,
    retrievedTurnIds: [...retrievedEvidenceTurnIds, ...noiseTurnIds],
  };
}

function upstreamAnswerMetricByCategory(
  cases: LocomoSmokeReport["cases"],
): Partial<Record<LocomoQaCategory, string>> {
  const metrics: Partial<Record<LocomoQaCategory, string>> = {};
  for (const testCase of cases) {
    metrics[testCase.category] = deriveLocomoMatchMode(testCase.category);
  }
  return metrics;
}

function report(input: {
  allowCommonsenseResolution?: boolean;
  answerContextMode?: LocomoSmokeReport["answerContextMode"];
  benchmarkSource?: string;
  bm25Ranking?: boolean;
  cases: LocomoSmokeReport["cases"];
  externalRoot?: string;
  ingestMode?: LocomoSmokeReport["ingestMode"];
  maxAdditions: number;
  minRelativeScore?: number;
  questionCategories?: LocomoSmokeReport["questionCategories"];
  runId: string;
  semanticCandidateEmbeddingSource?: LocomoSmokeReport["semanticCandidateEmbeddingSource"];
  strictNoEvidenceAbstention?: boolean;
  topK: number;
}): LocomoSmokeReport {
  return {
    allowCommonsenseResolution: input.allowCommonsenseResolution ?? false,
    answerContextMode: input.answerContextMode ?? "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: input.benchmarkSource ?? "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: input.bm25Ranking ?? false,
    caseCount: 1,
    caseIds: ["locomo-conv-1"],
    cases: input.cases,
    categories: [],
    executionFailures: 0,
    externalRoot: input.externalRoot ?? "/private/tmp/LOCOMO-full",
    generatedAt: "2026-07-03T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: input.ingestMode ?? "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "live-answer",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: input.questionCategories ?? ["open_domain"],
    questionCount: input.cases.length,
    resume: false,
    runDirectory: `/tmp/${input.runId}`,
    runId: input.runId,
    semanticCandidateEmbeddingSource:
      input.semanticCandidateEmbeddingSource ?? "provider",
    strictNoEvidenceAbstention: input.strictNoEvidenceAbstention ?? false,
    semanticCandidates: {
      enabled: true,
      maxAdditions: input.maxAdditions,
      minRelativeScore: input.minRelativeScore ?? null,
      minSimilarity: null,
      topK: input.topK,
    },
    upstreamAnswerMetricByCategory: upstreamAnswerMetricByCategory(input.cases),
    upstreamSource: "https://github.com/snap-research/locomo",
  };
}

function reportWithoutAnswerTokenF1(reportValue: LocomoSmokeReport): LocomoSmokeReport {
  return {
    ...reportValue,
    cases: reportValue.cases.map((caseRow) => {
      const copy = { ...caseRow };
      delete copy.answerTokenF1;
      return copy;
    }),
  };
}

function locomoCasesJson(input: {
  category?: LocomoQaCategory;
  goldAnswer: string;
  questionId: string;
}): string {
  const category = input.category ?? "open_domain";
  return JSON.stringify({
    cases: [
      {
        caseId: "locomo-conv-1",
        questions: [
          {
            adversarialAnswer: null,
            category,
            evidenceTurnIds: ["D1:1"],
            goldAnswer: input.goldAnswer,
            matchMode: deriveLocomoMatchMode(category),
            question: "What console did Jordan mention?",
            questionId: input.questionId,
          },
        ],
        sourceConversation: "synthetic-near-miss",
        speakers: ["Jordan", "Riley"],
        turns: [
          {
            content: "Jordan said the gift was a Nintendo Switch.",
            diaId: "D1:1",
            speaker: "Jordan",
          },
        ],
      },
    ],
  });
}

describe("phase-65 LoCoMo live delta analyzer", () => {
  it("classifies answer and retrieval transitions between compatible live reports", () => {
    const baseline = report({
      maxAdditions: 4,
      runId: "open-domain-top16-add4-live",
      topK: 16,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q1",
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0.5,
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:1"],
          noiseTurnIds: ["D1:9"],
          questionId: "q2",
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q3",
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q4",
        }),
      ],
    });
    const candidate = report({
      maxAdditions: 8,
      minRelativeScore: 0.8,
      runId: "open-domain-top32-add8-rel08-live",
      topK: 32,
      cases: [
        question({
          answerTokenF1: 0.4,
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D1:8", "D1:9"],
          questionId: "q1",
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D1:9"],
          questionId: "q2",
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D1:7", "D1:8"],
          questionId: "q3",
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q4",
        }),
      ],
    });

    const analysis = analyzeLocomoLiveDelta({
      baseline: {
        path: "/reports/top16/smoke-report.json",
        report: baseline,
      },
      candidate: {
        path: "/reports/top32/smoke-report.json",
        report: candidate,
      },
      generatedAt: "2026-07-03T00:00:00.000Z",
      runId: "open-domain-live-delta",
    });

    expect(analysis.runId).toBe("open-domain-live-delta");
    expect(analysis.claimBoundary).toContain("Research diagnostic");
    expect(analysis.overall.questionCount).toBe(4);
    expect(analysis.overall.answerTransitions).toEqual({
      baselineOnlyAnswered: 0,
      bothUnanswered: 0,
      candidateOnlyAnswered: 0,
      improved: 1,
      regressed: 1,
      sameCorrect: 1,
      sameWrong: 1,
    });
    expect(analysis.overall.retrievalTransitions).toMatchObject({
      "full->full": 2,
      "partial->full": 1,
      "zero->full": 1,
    });
    expect(analysis.overall.answerCorrectDelta).toBe(0);
    expect(analysis.overall.fullyRetrievedDelta).toBe(2);
    expect(analysis.overall.missingEvidenceWrongDelta).toBe(-2);
    expect(analysis.overall.fullRecallWrongNoisyDelta).toBe(2);
    expect(analysis.overall.unconvertedRetrievalGainCount).toBe(1);
    expect(analysis.overall.convertedRetrievalGainCount).toBe(1);
    expect(analysis.overall.noisyFullRecallRegressionCount).toBe(1);
    expect(analysis.sourceReports).toEqual([
      {
        path: "/reports/top32/smoke-report.json",
        questionCount: 4,
        runId: "open-domain-top32-add8-rel08-live",
      },
    ]);
    expect(analysis.topUnconvertedRetrievalGains[0]).toMatchObject({
      answerTransition: "sameWrong",
      candidate: {
        answerTokenF1: 0.4,
      },
      evidenceRecallDelta: 1,
      questionId: "q1",
      retrievalTransition: "zero->full",
    });
    expect(analysis.topNoisyFullRecallWrong.map((delta) => delta.questionId))
      .toEqual(["q1", "q3"]);
    expect(analysis.reanswerJobs).toEqual([
      {
        bucket: "noisyFullRecallWrong",
        categories: ["open_domain"],
        category: "open_domain",
        questionCount: 2,
        questionIds: ["q1", "q3"],
        sourceReportPath: "/reports/top32/smoke-report.json",
        sourceRunId: "open-domain-top32-add8-rel08-live",
      },
      {
        bucket: "answerImprovements",
        categories: ["open_domain"],
        category: "open_domain",
        questionCount: 1,
        questionIds: ["q2"],
        sourceReportPath: "/reports/top32/smoke-report.json",
        sourceRunId: "open-domain-top32-add8-rel08-live",
      },
    ]);
    expect(analysis.answerRegressions[0]).toMatchObject({
      answerTransition: "regressed",
      answerChangeAttribution: {
        answerContextModeChanged: false,
        answerOutcomeChanged: true,
        effectiveAnswerPolicyChanged: false,
        residualLiveAnswerChange: false,
        retrievalMetricsChanged: true,
      },
      questionId: "q3",
    });
    expect(analysis.categories.open_domain?.questionCount).toBe(4);
  });

  it("emits unique noisy full-recall wrong jobs for gold-evidence-only replay", () => {
    const baseline = report({
      maxAdditions: 4,
      runId: "open-domain-top16-add4-live",
      topK: 16,
      cases: [
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-noisy-regression",
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-noisy-same-wrong",
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-clean-regression",
        }),
      ],
    });
    const candidate = report({
      maxAdditions: 8,
      minRelativeScore: 0.8,
      runId: "open-domain-top32-add8-rel08-live",
      topK: 32,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D9:1", "D9:2", "D9:3"],
          questionId: "q-noisy-regression",
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D9:4", "D9:5", "D9:6", "D9:7"],
          questionId: "q-noisy-same-wrong",
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-clean-regression",
        }),
      ],
    });

    const analysis = analyzeLocomoLiveDelta({
      baseline: {
        path: "/reports/top16/smoke-report.json",
        report: baseline,
      },
      candidate: {
        path: "/reports/top32/smoke-report.json",
        report: candidate,
      },
    });

    expect(
      analysis.topNoisyFullRecallWrong.map((delta) => delta.questionId),
    ).toEqual(["q-noisy-same-wrong", "q-noisy-regression"]);
    expect(analysis.reanswerJobs).toContainEqual({
      bucket: "noisyFullRecallWrong",
      categories: ["open_domain"],
      category: "open_domain",
      questionCount: 2,
      questionIds: ["q-noisy-same-wrong", "q-noisy-regression"],
      sourceReportPath: "/reports/top32/smoke-report.json",
      sourceRunId: "open-domain-top32-add8-rel08-live",
    });
    expect(
      analysis.reanswerJobs.find(
        (job) => job.bucket === "answerRegressions",
      )?.questionIds,
    ).toEqual(["q-clean-regression"]);
    const allQueuedQuestionIds = analysis.reanswerJobs.flatMap(
      (job) => job.questionIds,
    );
    expect(new Set(allQueuedQuestionIds).size).toBe(allQueuedQuestionIds.length);
  });

  it("exports answer token-F1 near-miss rows for label-compatibility replay", () => {
    const baseline = report({
      maxAdditions: 4,
      runId: "open-domain-top16-add4-live",
      topK: 16,
      cases: [
        question({
          answerCorrect: false,
          answerTokenF1: 0.1,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-near-high",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0.2,
          category: "multi_hop",
          evidenceRecall: 0.5,
          goldEvidenceFullyRetrieved: false,
          questionId: "q-near-low",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0.2,
          category: "adversarial",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-adversarial",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-zero-overlap",
        }),
      ],
      questionCategories: ["open_domain", "multi_hop", "adversarial"],
    });
    const candidate = report({
      maxAdditions: 8,
      minRelativeScore: 0.8,
      runId: "open-domain-top32-add8-rel08-live",
      topK: 32,
      cases: [
        question({
          answerCorrect: false,
          answerTokenF1: 0.49,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-near-high",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0.25,
          category: "multi_hop",
          evidenceRecall: 0.5,
          goldEvidenceFullyRetrieved: false,
          questionId: "q-near-low",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0.49,
          category: "adversarial",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-adversarial",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-zero-overlap",
        }),
      ],
      questionCategories: ["open_domain", "multi_hop", "adversarial"],
    });

    const analysis = analyzeLocomoLiveDelta({
      baseline: {
        path: "/reports/top16/smoke-report.json",
        report: baseline,
      },
      candidate: {
        path: "/reports/top32/smoke-report.json",
        report: candidate,
      },
      runId: "answer-token-f1-near-miss-delta",
    });

    expect(
      analysis.answerTokenF1NearMisses.map((delta) => [
        delta.questionId,
        delta.candidate.answerTokenF1,
      ]),
    ).toEqual([
      ["q-near-high", 0.49],
      ["q-near-low", 0.25],
    ]);
    expect(analysis.reanswerJobs.map((job) => [job.bucket, job.questionIds]))
      .toEqual([
        ["answerTokenF1NearMiss", ["q-near-low"]],
        ["answerTokenF1NearMiss", ["q-near-high"]],
      ]);
  });

  it("rejects incompatible benchmark identities before computing question deltas", () => {
    const cases = [
      question({
        answerCorrect: false,
        category: "open_domain",
        evidenceRecall: 0,
        goldEvidenceFullyRetrieved: false,
        missingEvidenceTurnIds: ["D1:1"],
        questionId: "q1",
      }),
    ];
    const baseline = report({
      cases,
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
    });

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/other-root.json",
          report: report({
            benchmarkSource: "/private/tmp/LOCOMO-other/cases.json",
            cases,
            externalRoot: "/private/tmp/LOCOMO-other",
            maxAdditions: 8,
            runId: "candidate-other-root",
            topK: 32,
          }),
        },
      }),
    ).toThrow("benchmarkSource");

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/other-category.json",
          report: report({
            cases,
            maxAdditions: 8,
            questionCategories: ["multi_hop"],
            runId: "candidate-other-category",
            topK: 32,
          }),
        },
      }),
    ).toThrow("questionCategories");
  });

  it("rejects direct self-comparison report inputs with path-equivalent lineage", () => {
    const baseline = report({
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          questionId: "q1",
        }),
      ],
    });
    const candidate = report({
      maxAdditions: 8,
      runId: "candidate-live",
      topK: 32,
      cases: [
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
        }),
      ],
    });

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/open-domain/smoke-report.json",
          report: baseline,
        },
        candidate: {
          path: "/reports/open-domain/../open-domain/smoke-report.json",
          report: candidate,
        },
      }),
    ).toThrow("baseline and candidate reports must refer to different paths");
  });

  it("rejects paired reports that reuse the same run id", () => {
    const baseline = report({
      maxAdditions: 4,
      runId: "shared-live-run",
      topK: 16,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          questionId: "q1",
        }),
      ],
    });
    const candidate = report({
      maxAdditions: 8,
      runId: "shared-live-run",
      topK: 32,
      cases: [
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
        }),
      ],
    });

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline/smoke-report.json",
          report: baseline,
        },
        candidate: {
          path: "/reports/candidate/smoke-report.json",
          report: candidate,
        },
      }),
    ).toThrow("baseline and candidate reports must use different runIds");
  });

  it("rejects zero-failure live reports with unscored answer rows", () => {
    const baselineQuestion = question({
      answerCorrect: false,
      category: "open_domain",
      evidenceRecall: 1,
      goldEvidenceFullyRetrieved: true,
      questionId: "q1",
    });
    const candidateQuestion = {
      ...baselineQuestion,
      answerCorrect: null,
      generatedAnswer: null,
    };

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: report({
            cases: [baselineQuestion],
            maxAdditions: 4,
            runId: "baseline-live",
            topK: 16,
          }),
        },
        candidate: {
          path: "/reports/candidate.json",
          report: report({
            cases: [candidateQuestion],
            maxAdditions: 8,
            runId: "candidate-live",
            topK: 32,
          }),
        },
      }),
    ).toThrow(
      "zero-failure live-answer row locomo-conv-1::q1 is missing scored answer fields",
    );
  });

  it("rejects malformed row answer token F1 when present", () => {
    const malformedQuestion = {
      ...question({
        answerCorrect: false,
        category: "open_domain",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q1",
      }),
      answerTokenF1: 1.5,
    };

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: report({
            cases: [malformedQuestion],
            maxAdditions: 4,
            runId: "baseline-live",
            topK: 16,
          }),
        },
        candidate: {
          path: "/reports/candidate.json",
          report: report({
            cases: [
              question({
                answerCorrect: false,
                category: "open_domain",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                questionId: "q1",
              }),
            ],
            maxAdditions: 8,
            runId: "candidate-live",
            topK: 32,
          }),
        },
      }),
    ).toThrow(
      "row locomo-conv-1::q1 answerTokenF1 must be a finite number between 0 and 1 or null",
    );
  });

  it("rejects malformed report run ids before emitting replay lineage", () => {
    const rows = [
      question({
        answerCorrect: false,
        category: "open_domain",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q1",
      }),
    ];
    const baseline = report({
      cases: rows,
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
    });

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/candidate.json",
          report: {
            ...report({
              cases: rows,
              maxAdditions: 8,
              runId: "candidate-live",
              topK: 32,
            }),
            runId: 42 as unknown as string,
          },
        },
      }),
    ).toThrow("runId must be a string");

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/candidate.json",
          report: report({
            cases: rows,
            maxAdditions: 8,
            runId: " ",
            topK: 32,
          }),
        },
      }),
    ).toThrow("runId must not be empty");

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/candidate.json",
          report: report({
            cases: rows,
            maxAdditions: 8,
            runId: " candidate-live",
            topK: 32,
          }),
        },
      }),
    ).toThrow("runId must not have leading or trailing whitespace");
  });

  it("rejects malformed selection headers before comparing live reports", () => {
    const rows = [
      question({
        answerCorrect: false,
        category: "open_domain",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q1",
      }),
    ];
    const baseline = report({
      cases: rows,
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
    });
    const candidate = report({
      cases: rows,
      maxAdditions: 8,
      runId: "candidate-live",
      topK: 32,
    });

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            caseIds: "locomo-conv-1" as unknown as string[],
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: {
            ...candidate,
            caseIds: "locomo-conv-1" as unknown as string[],
          },
        },
      }),
    ).toThrow("caseIds must be an array of strings");

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            questionIds: [42] as unknown as string[],
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: {
            ...candidate,
            questionIds: [42] as unknown as string[],
          },
        },
      }),
    ).toThrow("questionIds contains non-string value at index 0");

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            caseIds: ["locomo-conv-1 "],
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: {
            ...candidate,
            caseIds: ["locomo-conv-1 "],
          },
        },
      }),
    ).toThrow("caseIds contains leading or trailing whitespace at index 0");

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            questionCategories: "open_domain" as unknown as LocomoQaCategory[],
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: {
            ...candidate,
            questionCategories: "open_domain" as unknown as LocomoQaCategory[],
          },
        },
      }),
    ).toThrow("questionCategories must be an array of strings or null");
  });

  it("rejects whitespace-padded row identities before matching report headers", () => {
    const rows = [
      question({
        answerCorrect: true,
        caseId: "locomo-conv-1 ",
        category: "open_domain",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q1",
      }),
    ];
    const baseline = report({
      cases: rows,
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
    });
    const candidate = report({
      cases: rows,
      maxAdditions: 8,
      runId: "candidate-live",
      topK: 32,
    });

    expect(() =>
      analyzeLocomoLiveDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: baseline,
        },
        candidate: {
          path: "/reports/candidate.json",
          report: candidate,
        },
      }),
    ).toThrow("row at index 0 caseId must not have leading or trailing whitespace");
  });

  it("allows compared live experiment knobs to differ", () => {
    const cases = [
      question({
        answerCorrect: false,
        category: "open_domain",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q1",
      }),
    ];
    const bm25Candidate = report({
      allowCommonsenseResolution: true,
      answerContextMode: "evidence-pack",
      bm25Ranking: true,
      cases,
      maxAdditions: 8,
      runId: "candidate-live",
      topK: 32,
    });
    bm25Candidate.semanticCandidateEmbeddingSource = "none";
    bm25Candidate.semanticCandidates = {
      enabled: false,
      maxAdditions: null,
      minRelativeScore: null,
      minSimilarity: null,
      topK: null,
    };
    const analysis = analyzeLocomoLiveDelta({
      baseline: {
        path: "/reports/baseline.json",
        report: report({
          answerContextMode: "raw-turns",
          cases,
          maxAdditions: 4,
          runId: "baseline-live",
          topK: 16,
        }),
      },
      candidate: {
        path: "/reports/candidate.json",
        report: bm25Candidate,
      },
    });

    expect(analysis.overall.questionCount).toBe(1);
    expect(analysis.overall.effectiveAnswerPolicyChangedCount).toBe(1);
    expect(analysis.overall.answerContextModeChangedCount).toBe(1);
  });

  it("tracks answer context mode changes separately from answer policy changes", () => {
    const baseline = report({
      answerContextMode: "evidence-pack",
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D9:1"],
          questionId: "q-noisy",
        }),
      ],
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
    });
    baseline.generatedAt = "2026-07-02T00:00:00.000Z";
    baseline.questionIds = ["q-noisy"];
    const candidate = report({
      answerContextMode: "gold-evidence-only-pack",
      cases: [
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D9:1"],
          questionId: "q-noisy",
        }),
      ],
      maxAdditions: 4,
      runId: "candidate-live",
      topK: 16,
    });
    candidate.generatedBy = "scripts/reanswer-phase-65-locomo-report.ts";
    candidate.questionIds = ["q-noisy"];
    candidate.sourceReport = {
      answerContextMode: "evidence-pack",
      generatedAt: baseline.generatedAt,
      path: "/reports/baseline.json",
      retrievalConfig: {
        bm25Ranking: baseline.bm25Ranking,
        semanticCandidateEmbeddingSource:
          baseline.semanticCandidateEmbeddingSource,
        semanticCandidates: { ...baseline.semanticCandidates },
      },
      runId: baseline.runId,
    };
    candidate.reanswerSelection = {
      explicitQuestionIds: ["q-noisy"],
      questionIdFile: "/reports/live-delta.json",
      reanswerJobBuckets: ["noisyFullRecallWrong"],
      reanswerJobCategories: ["open_domain"],
    };

    const analysis = analyzeLocomoLiveDelta({
      baseline: { path: "/reports/baseline.json", report: baseline },
      candidate: { path: "/reports/candidate.json", report: candidate },
    });

    expect(analysis.overall).toMatchObject({
      answerContextModeChangedCount: 1,
      answerContextModeChangedRegressionCount: 0,
      answerContextModeUnchangedCount: 0,
      answerContextModeChangedAnswerChangeCount: 1,
      effectiveAnswerPolicyChangedCount: 0,
      effectiveAnswerPolicyUnchangedCount: 1,
      residualLiveAnswerChangeCount: 0,
    });
    expect(analysis.answerImprovements[0]).toMatchObject({
      answerChangeAttribution: {
        answerContextModeChanged: true,
        answerOutcomeChanged: true,
        effectiveAnswerPolicyChanged: false,
        residualLiveAnswerChange: false,
        retrievalMetricsChanged: false,
      },
      answerContextModeChanged: true,
      baselineAnswerContextMode: "evidence-pack",
      candidateAnswerContextMode: "gold-evidence-only-pack",
      effectiveAnswerPolicyChanged: false,
      questionId: "q-noisy",
    });
  });

  it("separates report-level answer-policy flags from category-scoped effective policy changes", () => {
    const baseline = report({
      cases: [
        question({
          answerCorrect: true,
          category: "multi_hop",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-multi-hop",
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-open-domain",
        }),
        question({
          answerCorrect: true,
          category: "adversarial",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-adversarial",
        }),
      ],
      maxAdditions: 4,
      questionCategories: ["multi_hop", "open_domain", "adversarial"],
      runId: "baseline-live",
      topK: 16,
    });
    const candidate = report({
      allowCommonsenseResolution: true,
      cases: [
        question({
          answerCorrect: false,
          category: "multi_hop",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-multi-hop",
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-open-domain",
        }),
        question({
          answerCorrect: false,
          category: "adversarial",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-adversarial",
        }),
      ],
      maxAdditions: 4,
      questionCategories: ["multi_hop", "open_domain", "adversarial"],
      runId: "candidate-live",
      strictNoEvidenceAbstention: true,
      topK: 16,
    });

    const analysis = analyzeLocomoLiveDelta({
      baseline: { path: "/reports/baseline.json", report: baseline },
      candidate: { path: "/reports/candidate.json", report: candidate },
    });

    expect(analysis.overall).toMatchObject({
      answerContextModeChangedAnswerChangeCount: 0,
      answerContextModeUnchangedAnswerChangeCount: 3,
      effectiveAnswerPolicyChangedCount: 2,
      effectiveAnswerPolicyChangedAnswerChangeCount: 2,
      effectiveAnswerPolicyChangedRegressionCount: 2,
      effectiveAnswerPolicyUnchangedCount: 1,
      effectiveAnswerPolicyUnchangedAnswerChangeCount: 1,
      effectiveAnswerPolicyUnchangedRegressionCount: 1,
      residualLiveAnswerChangeCount: 1,
      retrievalMetricChangedAnswerChangeCount: 0,
    });
    expect(analysis.categories.multi_hop).toMatchObject({
      effectiveAnswerPolicyChangedCount: 0,
      effectiveAnswerPolicyUnchangedRegressionCount: 1,
    });
    expect(analysis.categories.open_domain).toMatchObject({
      effectiveAnswerPolicyChangedCount: 1,
      effectiveAnswerPolicyChangedRegressionCount: 1,
    });
    expect(analysis.categories.adversarial).toMatchObject({
      effectiveAnswerPolicyChangedCount: 1,
      effectiveAnswerPolicyChangedRegressionCount: 1,
    });
    expect(analysis.reanswerJobs).toContainEqual({
      bucket: "answerRegressions",
      categories: ["multi_hop"],
      category: "multi_hop",
      questionCount: 1,
      questionIds: ["q-multi-hop"],
      sourceReportPath: "/reports/candidate.json",
      sourceRunId: "candidate-live",
    });
    expect(analysis.reanswerJobs).toContainEqual({
      bucket: "answerRegressions",
      categories: ["open_domain"],
      category: "open_domain",
      questionCount: 1,
      questionIds: ["q-open-domain"],
      sourceReportPath: "/reports/candidate.json",
      sourceRunId: "candidate-live",
    });
    expect(analysis.reanswerJobs).toContainEqual({
      bucket: "answerRegressions",
      categories: ["adversarial"],
      category: "adversarial",
      questionCount: 1,
      questionIds: ["q-adversarial"],
      sourceReportPath: "/reports/candidate.json",
      sourceRunId: "candidate-live",
    });
    expect(
      analysis.answerRegressions.find(
        (delta) => delta.questionId === "q-multi-hop",
      ),
    ).toMatchObject({
      answerChangeAttribution: {
        answerContextModeChanged: false,
        answerOutcomeChanged: true,
        effectiveAnswerPolicyChanged: false,
        residualLiveAnswerChange: true,
        retrievalMetricsChanged: false,
      },
      baselineEffectiveAnswerPolicy: {
        commonsenseResolution: false,
        strictNoEvidenceAbstention: false,
      },
      candidateEffectiveAnswerPolicy: {
        commonsenseResolution: false,
        strictNoEvidenceAbstention: false,
      },
      effectiveAnswerPolicyChanged: false,
    });
    expect(
      analysis.reanswerJobs.some(
        (job) => job.bucket === "residualLiveAnswerChanges",
      ),
    ).toBe(false);
    const allQueuedQuestionIds = analysis.reanswerJobs.flatMap(
      (job) => job.questionIds,
    );
    expect(new Set(allQueuedQuestionIds).size).toBe(allQueuedQuestionIds.length);
  });

  it("compares a full source report against a reanswer subset report by source lineage", () => {
    const baseline = report({
      answerContextMode: "evidence-pack",
      cases: [
        question({
          answerCorrect: true,
          category: "multi_hop",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q-source-only",
        }),
        question({
          answerCorrect: false,
          answerTokenF1: 0.4,
          category: "multi_hop",
          evidenceRecall: 0.5,
          goldEvidenceFullyRetrieved: false,
          generatedAnswer: "near miss",
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q-near-miss",
        }),
      ],
      maxAdditions: 8,
      questionCategories: ["multi_hop"],
      runId: "source-live",
      topK: 32,
    });
    baseline.generatedAt = "2026-07-02T00:00:00.000Z";
    baseline.questionIds = ["q-source-only", "q-near-miss"];
    const candidate = report({
      answerContextMode: "evidence-pack",
      cases: [
        question({
          answerCorrect: false,
          answerTokenF1: 0.35,
          category: "multi_hop",
          evidenceRecall: 0.5,
          goldEvidenceFullyRetrieved: false,
          generatedAnswer: "still near",
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q-near-miss",
        }),
      ],
      maxAdditions: 8,
      questionCategories: ["multi_hop"],
      runId: "reanswer-live",
      topK: 32,
    });
    candidate.generatedBy = "scripts/reanswer-phase-65-locomo-report.ts";
    candidate.generatedAt = "2026-07-03T00:00:00.000Z";
    candidate.questionIds = ["q-near-miss"];
    candidate.sourceReport = {
      answerContextMode: "evidence-pack",
      generatedAt: baseline.generatedAt,
      path: "/reports/source/smoke-report.json",
      retrievalConfig: {
        bm25Ranking: baseline.bm25Ranking,
        semanticCandidateEmbeddingSource:
          baseline.semanticCandidateEmbeddingSource,
        semanticCandidates: { ...baseline.semanticCandidates },
      },
      runId: baseline.runId,
    };
    candidate.reanswerSelection = {
      explicitQuestionIds: null,
      questionIdFile: "/reports/live-delta.json",
      reanswerJobBuckets: ["answerTokenF1NearMiss"],
      reanswerJobCategories: null,
    };

    const analysis = analyzeLocomoLiveDelta({
      baseline: {
        path: "/reports/source/smoke-report.json",
        report: baseline,
      },
      candidate: {
        path: "/reports/reanswer/smoke-report.json",
        report: candidate,
      },
    });

    expect(analysis.overall).toMatchObject({
      answerTransitions: { sameWrong: 1 },
      baselineCorrectCount: 0,
      candidateCorrectCount: 0,
      questionCount: 1,
    });
    expect(analysis.answerTokenF1NearMisses).toHaveLength(1);
    expect(analysis.answerTokenF1NearMisses[0]).toMatchObject({
      questionId: "q-near-miss",
      baseline: { answerTokenF1: 0.4 },
      candidate: { answerTokenF1: 0.35 },
    });
  });

  it("parses report flags and writes a live-delta artifact", async () => {
    const baselinePath = "/reports/baseline/smoke-report.json";
    const candidatePath = "/reports/candidate/smoke-report.json";
    const baseline = report({
      maxAdditions: 4,
      runId: "baseline-live",
      topK: 16,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q1",
        }),
      ],
    });
    const candidate = report({
      maxAdditions: 8,
      minRelativeScore: 0.8,
      runId: "candidate-live",
      topK: 32,
      cases: [
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
        }),
      ],
    });
    const reads = new Map([
      [baselinePath, JSON.stringify(baseline)],
      [candidatePath, JSON.stringify(candidate)],
    ]);
    const writes: Array<{ contents: string; path: string }> = [];

    const { analysis, outputPath } = await runLocomoLiveDeltaAnalysis(
      [
        "bun",
        "run",
        "scripts/analyze-phase-65-locomo-live-delta.ts",
        "--baseline-report",
        baselinePath,
        "--candidate-report",
        candidatePath,
        "--run-id",
        "locomo-live-delta",
        "--output-path",
        "/reports/delta/live-delta.json",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
        readFile: async (path: string) => {
          const value = reads.get(path);
          if (value === undefined) {
            throw new Error(`Unexpected read: ${path}`);
          }
          return value;
        },
        writeFile: async (path: string, contents: string) => {
          writes.push({ contents, path });
        },
      },
    );

    expect(outputPath).toBe("/reports/delta/live-delta.json");
    expect(outputPath.endsWith(LOCOMO_LIVE_DELTA_FILE_NAME)).toBe(true);
    expect(analysis.outputPath).toBe(outputPath);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toMatchObject({
      overall: { answerTransitions: { improved: 1 }, questionCount: 1 },
      runId: "locomo-live-delta",
    });
  });

  it("backfills missing answer token-F1 from benchmarkSource before writing live-delta artifacts", async () => {
    const baselinePath = "/reports/baseline/smoke-report.json";
    const candidatePath = "/reports/candidate/smoke-report.json";
    const casesPath = "/private/tmp/LOCOMO-full/cases.json";
    const baseline = reportWithoutAnswerTokenF1(
      report({
        maxAdditions: 4,
        runId: "baseline-live",
        topK: 16,
        cases: [
          question({
            answerCorrect: false,
            category: "open_domain",
            evidenceRecall: 0,
            generatedAnswer: "I do not know.",
            goldEvidenceFullyRetrieved: false,
            missingEvidenceTurnIds: ["D1:1"],
            questionId: "q-near-miss",
          }),
        ],
      }),
    );
    const candidate = reportWithoutAnswerTokenF1(
      report({
        maxAdditions: 8,
        minRelativeScore: 0.8,
        runId: "candidate-live",
        topK: 32,
        cases: [
          question({
            answerCorrect: false,
            category: "open_domain",
            evidenceRecall: 1,
            generatedAnswer: "Nintendo Switch",
            goldEvidenceFullyRetrieved: true,
            questionId: "q-near-miss",
          }),
        ],
      }),
    );
    const reads = new Map([
      [baselinePath, JSON.stringify(baseline)],
      [candidatePath, JSON.stringify(candidate)],
      [
        casesPath,
        locomoCasesJson({
          goldAnswer:
            "Nintendo Switch console bought during the birthday shopping trip last spring",
          questionId: "q-near-miss",
        }),
      ],
    ]);
    const writes: Array<{ contents: string; path: string }> = [];

    const { analysis } = await runLocomoLiveDeltaAnalysis(
      [
        "bun",
        "run",
        "scripts/analyze-phase-65-locomo-live-delta.ts",
        "--baseline-report",
        baselinePath,
        "--candidate-report",
        candidatePath,
        "--run-id",
        "locomo-live-delta",
        "--output-path",
        "/reports/delta/live-delta.json",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-03T00:00:00.000Z"),
        readFile: async (path: string) => {
          const value = reads.get(path);
          if (value === undefined) {
            throw new Error(`Unexpected read: ${path}`);
          }
          return value;
        },
        writeFile: async (path: string, contents: string) => {
          writes.push({ contents, path });
        },
      },
    );

    expect(candidate.cases[0]?.answerTokenF1).toBeUndefined();
    expect(analysis.answerTokenF1NearMisses).toHaveLength(1);
    expect(
      analysis.answerTokenF1NearMisses[0]?.candidate.answerTokenF1,
    ).toBeCloseTo(1 / 3);
    expect(analysis.reanswerJobs).toContainEqual(
      expect.objectContaining({
        bucket: "answerTokenF1NearMiss",
        questionIds: ["q-near-miss"],
      }),
    );
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toMatchObject({
      answerTokenF1NearMisses: [
        {
          candidate: {
            answerTokenF1: expect.any(Number),
          },
          questionId: "q-near-miss",
        },
      ],
    });
  });

  it("rejects path-equivalent baseline and candidate reports before reading inputs", async () => {
    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          "/reports/open-domain/smoke-report.json",
          "--candidate-report",
          "/reports/open-domain/../open-domain/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--baseline-report and --candidate-report must refer to different paths",
    );
  });

  it("rejects output paths that would overwrite input reports before reading inputs", async () => {
    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          "/reports/baseline/smoke-report.json",
          "--candidate-report",
          "/reports/candidate/smoke-report.json",
          "--output-path",
          "/reports/candidate/../candidate/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --candidate-report must refer to different paths",
    );
  });

  it("rejects default output paths that would overwrite input reports before reading inputs", async () => {
    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          "/reports/baseline/smoke-report.json",
          "--candidate-report",
          "/reports/candidate/live-delta.json",
          "--run-id",
          "candidate",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --candidate-report must refer to different paths",
    );
  });

  it("rejects output run ids that are not single path segments before reading inputs", async () => {
    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          "/reports/baseline/smoke-report.json",
          "--candidate-report",
          "/reports/candidate/smoke-report.json",
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

  it("rejects output paths that would overwrite backfill benchmark cases before reading them", async () => {
    const baselinePath = "/reports/baseline/smoke-report.json";
    const candidatePath = "/reports/candidate/smoke-report.json";
    const casesPath = "/private/tmp/LOCOMO-full/cases.json";
    const baseline = reportWithoutAnswerTokenF1(
      report({
        cases: [
          question({
            answerCorrect: false,
            category: "open_domain",
            evidenceRecall: 0,
            generatedAnswer: "I do not know.",
            goldEvidenceFullyRetrieved: false,
            questionId: "q-near-miss",
          }),
        ],
        maxAdditions: 4,
        runId: "baseline-live",
        topK: 16,
      }),
    );
    const candidate = reportWithoutAnswerTokenF1(
      report({
        cases: [
          question({
            answerCorrect: false,
            category: "open_domain",
            evidenceRecall: 1,
            generatedAnswer: "Nintendo Switch",
            goldEvidenceFullyRetrieved: true,
            questionId: "q-near-miss",
          }),
        ],
        maxAdditions: 8,
        minRelativeScore: 0.8,
        runId: "candidate-live",
        topK: 32,
      }),
    );

    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          baselinePath,
          "--candidate-report",
          candidatePath,
          "--output-path",
          "/private/tmp/LOCOMO-full/../LOCOMO-full/cases.json",
        ],
        {
          readFile: async (path: string) => {
            if (path === baselinePath) {
              return JSON.stringify(baseline);
            }
            if (path === candidatePath) {
              return JSON.stringify(candidate);
            }
            if (path === casesPath) {
              throw new Error("should not read benchmark cases");
            }
            throw new Error(`Unexpected read: ${path}`);
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and live-delta benchmark cases must refer to different paths",
    );
  });

  it("rejects missing string flag values before reading reports", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read reports");
      },
    };

    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          "/reports/baseline.json",
          "--candidate-report",
          "--run-id",
          "locomo-live-delta",
        ],
        noReads,
      ),
    ).rejects.toThrow("--candidate-report requires a value.");

    await expect(
      runLocomoLiveDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-live-delta.ts",
          "--baseline-report",
          "/reports/baseline.json",
          "--candidate-report",
          "/reports/candidate.json",
          "--output-path",
          "/reports/live-delta.json",
          "--run-id",
          "--unused",
        ],
        noReads,
      ),
    ).rejects.toThrow("--run-id requires a value.");
  });
});
