import { describe, expect, it } from "bun:test";
import type { LocomoCategoryGapAnalysis } from "../../scripts/analyze-phase-65-locomo-category-gaps";
import {
  LOCOMO_CATEGORY_GAP_ANALYSIS_FILE_NAME,
  analyzeLocomoCategoryGaps,
  runLocomoCategoryGapAnalysis,
} from "../../scripts/analyze-phase-65-locomo-category-gaps";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import { deriveLocomoMatchMode, LOCOMO_QA_CATEGORIES } from "../../src/eval/locomo";
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

function report(
  category: LocomoQaCategory,
  cases: LocomoSmokeReport["cases"],
  overrides: Partial<LocomoSmokeReport> = {},
): LocomoSmokeReport {
  const upstreamAnswerMetricByCategory: Partial<
    Record<LocomoQaCategory, string>
  > = {};
  for (const testCase of cases) {
    if (!LOCOMO_QA_CATEGORIES.includes(testCase.category)) {
      continue;
    }
    upstreamAnswerMetricByCategory[testCase.category] =
      deriveLocomoMatchMode(testCase.category);
  }
  return {
    answerContextMode: "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: false,
    caseCount: 1,
    caseIds: ["locomo-conv-1"],
    cases,
    categories: [],
    executionFailures: 0,
    externalRoot: "/private/tmp/LOCOMO-full",
    generatedAt: "2026-07-02T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "live-answer",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: null,
    questionCount: cases.length,
    resume: false,
    runDirectory: `/tmp/${category}`,
    runId: `run-${category}`,
    semanticCandidateEmbeddingSource: "provider",
    semanticCandidates: {
      enabled: true,
      maxAdditions: 4,
      minRelativeScore: null,
      minSimilarity: null,
      topK: 16,
    },
    upstreamAnswerMetricByCategory,
    upstreamSource: "https://github.com/snap-research/locomo",
    ...overrides,
  };
}

function category(
  analysis: LocomoCategoryGapAnalysis,
  name: LocomoQaCategory,
) {
  const entry = analysis.categories[name];
  if (!entry) {
    throw new Error(`category not found in gap analysis: ${name}`);
  }
  return entry;
}

describe("phase-65 LoCoMo category gap analyzer", () => {
  it("splits wrong answers into retrieval-missing, noisy full-recall, and clean full-recall buckets", () => {
    const analysis = analyzeLocomoCategoryGaps({
      generatedAt: "2026-07-02T02:00:00.000Z",
      reports: [
        {
          path: "/reports/full/smoke-report.json",
          report: report("single_hop", [
            question({
              answerCorrect: true,
              category: "single_hop",
              evidenceRecall: 1,
              goldEvidenceFullyRetrieved: true,
              noiseTurnIds: ["D1:9"],
              questionId: "q1",
            }),
            question({
              answerCorrect: false,
              category: "single_hop",
              evidenceRecall: 1,
              generatedAnswer: "wrong despite all evidence",
              goldEvidenceFullyRetrieved: true,
              noiseTurnIds: ["D1:8", "D1:9"],
              questionId: "q2",
            }),
            question({
              answerCorrect: false,
              category: "single_hop",
              evidenceRecall: 1,
              goldEvidenceFullyRetrieved: true,
              questionId: "q3",
            }),
            question({
              answerCorrect: false,
              category: "single_hop",
              evidenceRecall: 0.5,
              goldEvidenceFullyRetrieved: false,
              missingEvidenceTurnIds: ["D1:2"],
              questionId: "q4",
            }),
            question({
              answerCorrect: false,
              category: "open_domain",
              evidenceRecall: 0,
              goldEvidenceFullyRetrieved: false,
              missingEvidenceTurnIds: ["D1:1"],
              noiseTurnIds: ["D1:7", "D1:8", "D1:9"],
              questionId: "q5",
            }),
          ]),
        },
      ],
      runId: "locomo-category-gaps",
    });

    expect(analysis.generatedBy).toBe(
      "scripts/analyze-phase-65-locomo-category-gaps.ts",
    );
    expect(analysis.overall.questionCount).toBe(5);
    expect(analysis.overall.answerCorrectCount).toBe(1);
    expect(analysis.overall.answerAccuracy).toBe(0.2);
    expect(analysis.sourceReports).toEqual([
      {
        path: "/reports/full/smoke-report.json",
        questionCount: 5,
        runId: "run-single_hop",
      },
    ]);
    expect(analysis.overall.failureBuckets).toEqual({
      fullRecallWrongClean: 1,
      fullRecallWrongNoisy: 1,
      missingEvidenceWrong: 2,
    });
    const singleHop = category(analysis, "single_hop");
    const openDomain = category(analysis, "open_domain");
    expect(singleHop.retrievalBuckets.full.wrong).toBe(2);
    expect(
      singleHop.failureBuckets.fullRecallWrongNoisy,
    ).toBe(1);
    expect(
      singleHop.failureBuckets.fullRecallWrongClean,
    ).toBe(1);
    expect(
      openDomain.failureBuckets.missingEvidenceWrong,
    ).toBe(1);
    expect(analysis.overall.topNoisyWrongQuestions[0]).toMatchObject({
      category: "open_domain",
      noiseTurnCount: 3,
      questionId: "q5",
    });
    expect(analysis.claimBoundary).toContain("Research diagnostic");
  });

  it("rejects direct duplicate normalized report paths before gap analysis", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/category/smoke-report.json",
            report: report("single_hop", [
              question({
                answerCorrect: true,
                category: "single_hop",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                questionId: "single-q1",
              }),
            ]),
          },
          {
            path: "/reports/category/../category/smoke-report.json",
            report: report("temporal", [
              question({
                answerCorrect: false,
                category: "temporal",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D2:9"],
                questionId: "temporal-q1",
              }),
            ]),
          },
        ],
      }),
    ).toThrow("duplicate report path");
  });

  it("rejects reports from different roots or retrieval stacks", () => {
    const baseline = report("single_hop", [
      question({
        answerCorrect: true,
        category: "single_hop",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q1",
      }),
    ]);

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          { path: "/reports/baseline/smoke-report.json", report: baseline },
          {
            path: "/reports/other-root/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q2",
                }),
              ],
              {
                benchmarkSource: "/private/tmp/LOCOMO-other/cases.json",
                externalRoot: "/private/tmp/LOCOMO-other",
              },
            ),
          },
        ],
      }),
    ).toThrow("benchmarkSource");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          { path: "/reports/baseline/smoke-report.json", report: baseline },
          {
            path: "/reports/bm25/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q2",
                }),
              ],
              { bm25Ranking: true },
            ),
          },
        ],
      }),
    ).toThrow("bm25Ranking");
  });

  it("rejects reports whose core arrays are malformed before gap analysis", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-cases/smoke-report.json",
            report: {
              ...report("single_hop", [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ]),
              cases: "q1" as unknown as LocomoSmokeReport["cases"],
            },
          },
        ],
      }),
    ).toThrow("cases must be an array");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-categories/smoke-report.json",
            report: {
              ...report("single_hop", [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ]),
              categories:
                "single_hop" as unknown as LocomoSmokeReport["categories"],
            },
          },
        ],
      }),
    ).toThrow("categories must be an array");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-case-entry/smoke-report.json",
            report: {
              ...report("single_hop", [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ]),
              cases: [null] as unknown as LocomoSmokeReport["cases"],
            },
          },
        ],
      }),
    ).toThrow("cases entry at index 0 must be an object");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-category-entry/smoke-report.json",
            report: {
              ...report("single_hop", [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ]),
              categories: [null] as unknown as LocomoSmokeReport["categories"],
            },
          },
        ],
      }),
    ).toThrow("categories entry at index 0 must be an object");
  });

  it("rejects category summaries whose metrics disagree with cases", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/stale-category-summary/smoke-report.json",
            report: {
              ...report("single_hop", [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ]),
              categories: [
                {
                  answerAccuracy: null,
                  answeredCount: 0,
                  averageEvidenceRecall: 0,
                  category: "open_domain",
                  crossSessionChainReady: null,
                  fullyRetrievedCount: 0,
                  noiseTurnTotal: 0,
                  questionCount: 1,
                },
              ],
            },
          },
        ],
      }),
    ).toThrow("category open_domain questionCount 1 does not match cases[] 0");
  });

  it("rejects reports whose questionCount does not match cases length", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-question-count/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { questionCount: "1" as unknown as number },
            ),
          },
        ],
      }),
    ).toThrow("questionCount 1 is not a non-negative integer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/fractional-question-count/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { questionCount: 1.5 },
            ),
          },
        ],
      }),
    ).toThrow("questionCount 1.5 is not a non-negative integer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/negative-failures/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { executionFailures: -1 },
            ),
          },
        ],
      }),
    ).toThrow("executionFailures -1 is not a non-negative integer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/fractional-failures/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { executionFailures: 0.5 },
            ),
          },
        ],
      }),
    ).toThrow("executionFailures 0.5 is not a non-negative integer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/mismatched/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { questionCount: 2 },
            ),
          },
        ],
      }),
    ).toThrow("questionCount 2 does not match cases length 1");
  });

  it("rejects reports whose caseCount does not match caseIds length", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-case-count/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { caseCount: "1" as unknown as number },
            ),
          },
        ],
      }),
    ).toThrow("caseCount 1 is not a non-negative integer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/negative-case-count/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { caseCount: -1 },
            ),
          },
        ],
      }),
    ).toThrow("caseCount -1 is not a non-negative integer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/mismatched-case-count/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { caseCount: 2 },
            ),
          },
        ],
      }),
    ).toThrow("caseCount 2 does not match caseIds length 1");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/empty-case-ids/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-empty-case-ids",
                }),
              ],
              { caseIds: [] },
            ),
          },
        ],
      }),
    ).toThrow("caseIds must contain at least one value");
  });

  it("rejects reports whose mode and answer evaluation disagree", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/not-locomo/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { benchmark: "beam" } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow('benchmark "beam" is not locomo');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-benchmark/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { benchmark: "locomo " } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow("benchmark must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/wrong-phase/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { phase: "phase-64" } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow('phase "phase-64" is not phase-65');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-phase/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { phase: " phase-65" } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow("phase must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/unknown-mode/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { mode: "hybrid" } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow('mode "hybrid" is not a supported LoCoMo mode');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-mode/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { mode: 42 } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow("mode must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-mode/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { mode: "live-answer " } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow("mode must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-ingest-mode/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              { ingestMode: "raw-turns " } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow("ingestMode must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/unknown-answer-evaluation/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              {
                answerEvaluation: "pending",
              } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow('answerEvaluation "pending" is not supported');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-answer-evaluation/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q0",
                }),
              ],
              {
                answerEvaluation: "scored ",
              } as unknown as Partial<LocomoSmokeReport>,
            ),
          },
        ],
      }),
    ).toThrow("answerEvaluation must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/mismatched-mode/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { answerEvaluation: "scored", mode: "retrieval-only" },
            ),
          },
        ],
      }),
    ).toThrow("is retrieval-only but answerEvaluation is scored");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/retrieval-only-with-answer/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q2",
                }),
              ],
              {
                answerContextMode: "raw-turns",
                answerEvaluation: "deferred-to-live-mode",
                mode: "retrieval-only",
              },
            ),
          },
        ],
      }),
    ).toThrow(
      "retrieval-only row locomo-conv-1::q2 carries scored answer fields",
    );
  });

  it("rejects reports whose row-level scalar fields are malformed", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-case-id/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-case-id-shape",
                }),
                caseId: 42 as unknown as string,
              },
            ]),
          },
        ],
      }),
    ).toThrow("row at index 0 caseId must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-question-id/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-question-id-shape",
                }),
                questionId: "" as unknown as string,
              },
            ]),
          },
        ],
      }),
    ).toThrow("row at index 0 questionId must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-category/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-category-shape",
                }),
                category: "" as unknown as LocomoQaCategory,
              },
            ]),
          },
        ],
      }),
    ).toThrow("row locomo-conv-1::q-category-shape category must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-row-category/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-category-padding",
                }),
                category: "single_hop " as unknown as LocomoQaCategory,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-category-padding category must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-evidence-recall/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-recall-shape",
                }),
                evidenceRecall: "1" as unknown as number,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-recall-shape evidenceRecall must be a finite number",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/out-of-range-evidence-recall/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-recall-range",
                }),
                evidenceRecall: 1.5,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-recall-range evidenceRecall must be a finite number between 0 and 1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-noise-count/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-noise-count-shape",
                }),
                noiseTurnCount: 1.5,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-noise-count-shape noiseTurnCount 1.5 is not a non-negative integer",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-fully-retrieved/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-fully-shape",
                }),
                goldEvidenceFullyRetrieved: "true" as unknown as boolean,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-fully-shape goldEvidenceFullyRetrieved must be a boolean",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-answer-correct/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-answer-correct-shape",
                }),
                answerCorrect: "yes" as unknown as boolean,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-answer-correct-shape answerCorrect must be a boolean or null",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-generated-answer/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-generated-answer-shape",
                }),
                generatedAnswer: 7 as unknown as string,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-generated-answer-shape generatedAnswer must be a string or null",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/empty-generated-answer/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-empty-generated-answer",
                }),
                generatedAnswer: " ",
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-empty-generated-answer generatedAnswer must be a non-empty string",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-generated-answer/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-padded-generated-answer",
                }),
                generatedAnswer: " needle ",
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-padded-generated-answer generatedAnswer must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/zero-failure-missing-answer-fields/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-zero-failure-missing-answer-fields",
                }),
                answerCorrect: null,
                generatedAnswer: null,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "zero-failure live-answer row locomo-conv-1::q-zero-failure-missing-answer-fields is missing scored answer fields",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/partial-answer-fields-missing-answer/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-partial-answer-missing-answer",
                }),
                generatedAnswer: null,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "live-answer row locomo-conv-1::q-partial-answer-missing-answer has partial scored answer fields",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/partial-answer-fields-missing-score/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: false,
                  category: "single_hop",
                  evidenceRecall: 0,
                  goldEvidenceFullyRetrieved: false,
                  questionId: "q-partial-answer-missing-score",
                }),
                answerCorrect: null,
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "live-answer row locomo-conv-1::q-partial-answer-missing-score has partial scored answer fields",
    );
  });

  it("rejects malformed replay lineage metadata before gap analysis", () => {
    const cases = [
      question({
        answerCorrect: true,
        category: "single_hop",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q-lineage-shape",
      }),
    ];
    const reanswerLineage = {
      generatedBy: "scripts/reanswer-phase-65-locomo-report.ts",
      questionIds: ["q-lineage-shape"],
      sourceReport: {
        answerContextMode: "evidence-pack",
        generatedAt: "2026-07-01T00:00:00.000Z",
        path: "/reports/source/smoke-report.json",
        retrievalConfig: {
          bm25Ranking: false,
          semanticCandidateEmbeddingSource: "provider",
          semanticCandidates: {
            enabled: true,
            maxAdditions: 4,
            minRelativeScore: null,
            minSimilarity: null,
            topK: 16,
          },
        },
        runId: "source-run",
      },
      reanswerSelection: {
        explicitQuestionIds: ["q-lineage-shape"],
        questionIdFile: null,
        reanswerJobBuckets: null,
        reanswerJobCategories: null,
      },
    } satisfies Partial<LocomoSmokeReport>;

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-external-root/smoke-report.json",
            report: report("single_hop", cases, {
              externalRoot: " " as unknown as string,
            }),
          },
        ],
      }),
    ).toThrow("externalRoot must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/smoke-with-source-report/smoke-report.json",
            report: report("single_hop", cases, {
              sourceReport: reanswerLineage.sourceReport,
            }),
          },
        ],
      }),
    ).toThrow("smoke report writer must not carry sourceReport lineage");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/smoke-with-reanswer-selection/smoke-report.json",
            report: report("single_hop", cases, {
              reanswerSelection: {
                explicitQuestionIds: ["q-lineage-shape"],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow("smoke report writer must not carry reanswerSelection lineage");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/explicit-only-extra-question/smoke-report.json",
            report: report(
              "single_hop",
              [
                ...cases,
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-lineage-extra",
                }),
              ],
              {
                ...reanswerLineage,
                questionIds: ["q-lineage-shape", "q-lineage-extra"],
                reanswerSelection: {
                  explicitQuestionIds: ["q-lineage-shape"],
                  questionIdFile: null,
                  reanswerJobBuckets: null,
                  reanswerJobCategories: null,
                },
              },
            ),
          },
        ],
      }),
    ).toThrow(
      'reanswerSelection.explicitQuestionIds ["q-lineage-shape"] do not match report questionIds ["q-lineage-shape","q-lineage-extra"] without manifest or job filters',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-source-report/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: "source" as unknown as LocomoSmokeReport["sourceReport"],
            }),
          },
        ],
      }),
    ).toThrow("sourceReport must be an object");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-source-report-path/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                answerContextMode: "evidence-pack",
                generatedAt: "2026-07-02T00:00:00.000Z",
                path: " ",
                retrievalConfig: {
                  bm25Ranking: false,
                  semanticCandidateEmbeddingSource: "provider",
                  semanticCandidates: {
                    enabled: true,
                    maxAdditions: 4,
                    minRelativeScore: null,
                    minSimilarity: null,
                    topK: 16,
                  },
                },
                runId: "source-run",
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.path must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-source-report-path/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                path: "/reports/source/smoke-report.json ",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.path must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-source-report-run-id/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                runId: " source-run",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.runId must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-source-report-generated-at/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                answerContextMode: "evidence-pack",
                generatedAt: "not-a-timestamp",
                path: "/reports/source/smoke-report.json",
                retrievalConfig: {
                  bm25Ranking: false,
                  semanticCandidateEmbeddingSource: "provider",
                  semanticCandidates: {
                    enabled: true,
                    maxAdditions: 4,
                    minRelativeScore: null,
                    minSimilarity: null,
                    topK: 16,
                  },
                },
                runId: "source-run",
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.generatedAt must be an ISO timestamp");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-source-report-generated-at/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                generatedAt: "2026-07-01T00:00:00.000Z ",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.generatedAt must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-future-source-report/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              generatedAt: "2026-07-02T00:00:00.000Z",
              sourceReport: {
                ...reanswerLineage.sourceReport,
                generatedAt: "2026-07-03T00:00:00.000Z",
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.generatedAt must be earlier than report generatedAt");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-same-time-source-report/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              generatedAt: "2026-07-02T00:00:00.000Z",
              sourceReport: {
                ...reanswerLineage.sourceReport,
                generatedAt: "2026-07-02T00:00:00.000Z",
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.generatedAt must be earlier than report generatedAt");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-gold-only-source-report/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                answerContextMode: "gold-evidence-only-pack",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.answerContextMode gold-evidence-only-pack cannot be used as replay source lineage",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-source-answer-context/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                answerContextMode:
                  "evidence-pack " as unknown as NonNullable<
                    LocomoSmokeReport["sourceReport"]
                  >["answerContextMode"],
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.answerContextMode must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-missing-source-answer-context/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                answerContextMode: null,
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.answerContextMode is required for replay source lineage");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-self-source-run/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                runId: "run-single_hop",
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.runId must differ from report runId");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-self-source-path/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                path: "/reports/reanswer-self-source-path/smoke-report.json",
              },
            }),
          },
        ],
      }),
    ).toThrow("sourceReport.path must differ from report path");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-source-report-config/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                answerContextMode: "evidence-pack",
                generatedAt: "2026-07-02T00:00:00.000Z",
                path: "/reports/source/smoke-report.json",
                retrievalConfig: {
                  bm25Ranking: false,
                  semanticCandidateEmbeddingSource: "provider",
                  semanticCandidates: {
                    enabled: true,
                    maxAdditions: -1,
                    minRelativeScore: null,
                    minSimilarity: null,
                    topK: 16,
                  },
                },
                runId: "source-run",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.retrievalConfig.semanticCandidates.maxAdditions -1 is not a non-negative integer",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-source-report-embedding-source/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                retrievalConfig: {
                  ...reanswerLineage.sourceReport.retrievalConfig,
                  semanticCandidateEmbeddingSource:
                    "provider " as unknown as NonNullable<
                      LocomoSmokeReport["sourceReport"]
                    >["retrievalConfig"]["semanticCandidateEmbeddingSource"],
                },
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.retrievalConfig.semanticCandidateEmbeddingSource must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/source-report-semantic-none-enabled/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                retrievalConfig: {
                  ...reanswerLineage.sourceReport.retrievalConfig,
                  semanticCandidateEmbeddingSource: "none",
                },
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.retrievalConfig.semanticCandidates.enabled requires sourceReport.retrievalConfig.semanticCandidateEmbeddingSource other than \"none\"",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/source-report-semantic-disabled-budget/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                retrievalConfig: {
                  ...reanswerLineage.sourceReport.retrievalConfig,
                  semanticCandidates: {
                    enabled: false,
                    maxAdditions: null,
                    minRelativeScore: null,
                    minSimilarity: null,
                    topK: 16,
                  },
                },
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.retrievalConfig.semanticCandidates.topK must be null when sourceReport.retrievalConfig.semanticCandidates.enabled is false",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-source-config-conflict/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                retrievalConfig: {
                  ...reanswerLineage.sourceReport.retrievalConfig,
                  bm25Ranking: true,
                },
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.retrievalConfig.bm25Ranking does not match report bm25Ranking",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-source-semantic-config-conflict/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              sourceReport: {
                ...reanswerLineage.sourceReport,
                retrievalConfig: {
                  ...reanswerLineage.sourceReport.retrievalConfig,
                  semanticCandidates: {
                    ...reanswerLineage.sourceReport.retrievalConfig.semanticCandidates,
                    maxAdditions: 8,
                  },
                },
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "sourceReport.retrievalConfig.semanticCandidates does not match report semanticCandidates",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-missing-selection/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection:
                undefined as unknown as LocomoSmokeReport["reanswerSelection"],
            }),
          },
        ],
      }),
    ).toThrow("reanswer report writer requires reanswerSelection lineage");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-missing-explicit-id/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: ["q-not-selected"],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.explicitQuestionIds contains q-not-selected not present in cases[]",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-reanswer-selection/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: [42] as unknown as string[],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.explicitQuestionIds contains non-string value at index 0",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-reanswer-question/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: ["q-lineage-shape", "q-lineage-shape"],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.explicitQuestionIds contains duplicate value q-lineage-shape",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/empty-reanswer-question-selection/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: [],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.explicitQuestionIds must contain at least one value",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-reanswer-bucket/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: null,
                reanswerJobBuckets: ["answerRegressions", "answerRegressions"],
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.reanswerJobBuckets contains duplicate value answerRegressions",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-filter-without-manifest/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: null,
                reanswerJobBuckets: ["answerRegressions"],
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.questionIdFile is required when reanswer job filters are set",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-manifest-selection-without-file/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              questionIds: ["q-lineage-shape"],
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.questionIdFile is required when report questionIds are set without explicitQuestionIds",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-padded-manifest-path/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              questionIds: ["q-lineage-shape"],
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: " /reports/reanswer-jobs.json",
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.questionIdFile must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-unused-manifest/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              questionIds: null,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: "/reports/reanswer-jobs.json",
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.questionIdFile requires selected questionIds or job filters",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-explicit-selection-without-header/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              questionIds: null,
              reanswerSelection: {
                explicitQuestionIds: ["q-lineage-shape"],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "questionIds is required when reanswerSelection has explicit ids or job filters",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-filter-selection-without-header/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              questionIds: null,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: "/reports/reanswer-jobs.json",
                reanswerJobBuckets: ["answerRegressions"],
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "questionIds is required when reanswerSelection has explicit ids or job filters",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/self-manifest/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: "/reports/self-manifest/smoke-report.json",
                reanswerJobBuckets: ["answerRegressions"],
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow("reanswerSelection.questionIdFile must differ from report path");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-source-as-manifest/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: "/reports/source/smoke-report.json",
                reanswerJobBuckets: ["answerRegressions"],
                reanswerJobCategories: null,
              },
            }),
          },
        ],
      }),
    ).toThrow("reanswerSelection.questionIdFile must differ from sourceReport.path");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-category-filter-overstates-cases/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: "/reports/reanswer-jobs.json",
                reanswerJobBuckets: null,
                reanswerJobCategories: ["open_domain"],
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.reanswerJobCategories excludes case category single_hop for q-lineage-shape",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-explicit-plus-category-filter/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: ["q-lineage-shape"],
                questionIdFile: "/reports/reanswer-jobs.json",
                reanswerJobBuckets: null,
                reanswerJobCategories: ["open_domain"],
              },
            }),
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-reanswer-category/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: ["single_hop", "single_hop"],
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.reanswerJobCategories contains duplicate value single_hop",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-reanswer-selection-category/smoke-report.json",
            report: report("single_hop", cases, {
              ...reanswerLineage,
              reanswerSelection: {
                explicitQuestionIds: null,
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: ["bad-category" as LocomoQaCategory],
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "reanswerSelection.reanswerJobCategories contains unknown category bad-category",
    );
  });

  it("rejects malformed report provenance and policy metadata before gap analysis", () => {
    const cases = [
      question({
        answerCorrect: true,
        category: "single_hop",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "q-report-metadata-shape",
      }),
    ];

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-generated-at/smoke-report.json",
            report: report("single_hop", cases, {
              generatedAt: 42 as unknown as string,
            }),
          },
        ],
      }),
    ).toThrow("generatedAt must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/non-iso-generated-at/smoke-report.json",
            report: report("single_hop", cases, {
              generatedAt: "2026/07/02 00:00:00",
            }),
          },
        ],
      }),
    ).toThrow("generatedAt must be an ISO timestamp");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-generated-at/smoke-report.json",
            report: report("single_hop", cases, {
              generatedAt: " 2026-07-02T00:00:00.000Z",
            }),
          },
        ],
      }),
    ).toThrow("generatedAt must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-generated-by/smoke-report.json",
            report: report("single_hop", cases, {
              generatedBy: "" as unknown as string,
            }),
          },
        ],
      }),
    ).toThrow("generatedBy must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/unsupported-generated-by/smoke-report.json",
            report: report("single_hop", cases, {
              generatedBy: "scripts/hand-written-report.ts",
            }),
          },
        ],
      }),
    ).toThrow(
      'generatedBy "scripts/hand-written-report.ts" is not a supported LoCoMo report writer',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-generated-by/smoke-report.json",
            report: report("single_hop", cases, {
              generatedBy: "scripts/run-phase-65-locomo-smoke.ts ",
            }),
          },
        ],
      }),
    ).toThrow("generatedBy must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-license/smoke-report.json",
            report: report("single_hop", cases, {
              license: " " as unknown as string,
            }),
          },
        ],
      }),
    ).toThrow("license must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/wrong-license/smoke-report.json",
            report: report("single_hop", cases, {
              license: "MIT",
            }),
          },
        ],
      }),
    ).toThrow('license "MIT" is not supported for LoCoMo');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-license/smoke-report.json",
            report: report("single_hop", cases, {
              license: " CC BY-NC 4.0",
            }),
          },
        ],
      }),
    ).toThrow("license must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-run-directory/smoke-report.json",
            report: report("single_hop", cases, {
              runDirectory: "" as unknown as string,
            }),
          },
        ],
      }),
    ).toThrow("runDirectory must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-run-directory/smoke-report.json",
            report: report("single_hop", cases, {
              runDirectory: " /tmp/run-single-hop",
            }),
          },
        ],
      }),
    ).toThrow("runDirectory must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-upstream-source/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamSource: 42 as unknown as string,
            }),
          },
        ],
      }),
    ).toThrow("upstreamSource must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/wrong-upstream-source/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamSource: "https://example.com/locomo",
            }),
          },
        ],
      }),
    ).toThrow(
      'upstreamSource "https://example.com/locomo" is not supported for LoCoMo',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-upstream-source/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamSource: "https://github.com/snap-research/locomo ",
            }),
          },
        ],
      }),
    ).toThrow("upstreamSource must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/synthetic-source-with-external-root/smoke-report.json",
            report: report("single_hop", cases, {
              benchmarkSource: "synthetic-smoke",
              externalRoot: "/private/tmp/LOCOMO-full",
            }),
          },
        ],
      }),
    ).toThrow(
      'benchmarkSource "synthetic-smoke" does not match externalRoot cases file',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-benchmark-source/smoke-report.json",
            report: report("single_hop", cases, {
              benchmarkSource: " /private/tmp/LOCOMO-full/cases.json",
            }),
          },
        ],
      }),
    ).toThrow("benchmarkSource must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-external-root/smoke-report.json",
            report: report("single_hop", cases, {
              externalRoot: "/private/tmp/LOCOMO-full ",
            }),
          },
        ],
      }),
    ).toThrow("externalRoot must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/wrong-external-source/smoke-report.json",
            report: report("single_hop", cases, {
              benchmarkSource: "/private/tmp/LOCOMO-other/cases.json",
              externalRoot: "/private/tmp/LOCOMO-full",
            }),
          },
        ],
      }),
    ).toThrow(
      'benchmarkSource "/private/tmp/LOCOMO-other/cases.json" does not match externalRoot cases file',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-profiles/smoke-report.json",
            report: report("single_hop", cases, {
              profilesCompared: [
                "goodmemory-rules-only",
                "goodmemory-rules-only",
              ],
            }),
          },
        ],
      }),
    ).toThrow("profilesCompared contains duplicate value goodmemory-rules-only");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/empty-profiles/smoke-report.json",
            report: report("single_hop", cases, {
              profilesCompared: [],
            }),
          },
        ],
      }),
    ).toThrow("profilesCompared must contain at least one value");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/unsupported-profile/smoke-report.json",
            report: report("single_hop", cases, {
              profilesCompared: ["goodmemory-hybrid"],
            }),
          },
        ],
      }),
    ).toThrow(
      'profilesCompared ["goodmemory-hybrid"] does not match expected ["goodmemory-rules-only"]',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-resume/smoke-report.json",
            report: report("single_hop", cases, {
              resume: "false" as unknown as boolean,
            }),
          },
        ],
      }),
    ).toThrow("resume must be a boolean");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-answer-context-mode/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode:
                "unsupported" as unknown as LocomoSmokeReport["answerContextMode"],
            }),
          },
        ],
      }),
    ).toThrow('answerContextMode "unsupported" is not supported');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-answer-context-mode-shape/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode:
                42 as unknown as LocomoSmokeReport["answerContextMode"],
            }),
          },
        ],
      }),
    ).toThrow("answerContextMode must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-answer-context-mode/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode:
                "evidence-pack " as unknown as LocomoSmokeReport["answerContextMode"],
            }),
          },
        ],
      }),
    ).toThrow("answerContextMode must not have leading or trailing whitespace");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/missing-answer-context-mode/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode:
                undefined as unknown as LocomoSmokeReport["answerContextMode"],
            }),
          },
        ],
      }),
    ).toThrow("answerContextMode is required");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/smoke-gold-context/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode: "gold-evidence-only-pack",
            }),
          },
        ],
      }),
    ).toThrow("gold-evidence-only-pack");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/retrieval-only-evidence-pack/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode: "evidence-pack",
              answerEvaluation: "deferred-to-live-mode",
              mode: "retrieval-only",
            }),
          },
        ],
      }),
    ).toThrow(
      "retrieval-only reports require answerContextMode raw-turns",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/retrieval-only-recalled-records/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode: "recalled-records",
              answerEvaluation: "deferred-to-live-mode",
              mode: "retrieval-only",
            }),
          },
        ],
      }),
    ).toThrow(
      "retrieval-only reports require answerContextMode raw-turns",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-gold-context/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode: "gold-evidence-only-pack",
              generatedBy: "scripts/reanswer-phase-65-locomo-report.ts",
              sourceReport:
                undefined as unknown as LocomoSmokeReport["sourceReport"],
            }),
          },
        ],
      }),
    ).toThrow("requires sourceReport lineage");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-missing-source/smoke-report.json",
            report: report("single_hop", cases, {
              generatedBy: "scripts/reanswer-phase-65-locomo-report.ts",
              sourceReport:
                undefined as unknown as LocomoSmokeReport["sourceReport"],
            }),
          },
        ],
      }),
    ).toThrow("reanswer report writer requires sourceReport lineage");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/reanswer-raw-context/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode: "raw-turns",
              generatedBy: "scripts/reanswer-phase-65-locomo-report.ts",
              reanswerSelection: {
                explicitQuestionIds: ["q-report-metadata-shape"],
                questionIdFile: null,
                reanswerJobBuckets: null,
                reanswerJobCategories: null,
              },
              sourceReport: {
                answerContextMode: "evidence-pack",
                generatedAt: "2026-07-02T00:00:00.000Z",
                path: "/reports/source/smoke-report.json",
                retrievalConfig: {
                  bm25Ranking: false,
                  semanticCandidateEmbeddingSource: "provider",
                  semanticCandidates: {
                    enabled: true,
                    maxAdditions: 4,
                    minRelativeScore: null,
                    minSimilarity: null,
                    topK: 16,
                  },
                },
                runId: "source-run",
              },
            }),
          },
        ],
      }),
    ).toThrow("reanswer report writer does not support answerContextMode raw-turns");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-commonsense-flag/smoke-report.json",
            report: report("single_hop", cases, {
              allowCommonsenseResolution: "true" as unknown as boolean,
            }),
          },
        ],
      }),
    ).toThrow("allowCommonsenseResolution must be a boolean");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-strict-flag/smoke-report.json",
            report: report("single_hop", cases, {
              strictNoEvidenceAbstention: "false" as unknown as boolean,
            }),
          },
        ],
      }),
    ).toThrow("strictNoEvidenceAbstention must be a boolean");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/retrieval-only-commonsense/smoke-report.json",
            report: report("single_hop", cases, {
              allowCommonsenseResolution: true,
              answerContextMode: "raw-turns",
              answerEvaluation: "deferred-to-live-mode",
              mode: "retrieval-only",
            }),
          },
        ],
      }),
    ).toThrow("allowCommonsenseResolution requires mode live-answer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/retrieval-only-strict/smoke-report.json",
            report: report("single_hop", cases, {
              answerContextMode: "raw-turns",
              answerEvaluation: "deferred-to-live-mode",
              mode: "retrieval-only",
              strictNoEvidenceAbstention: true,
            }),
          },
        ],
      }),
    ).toThrow("strictNoEvidenceAbstention requires mode live-answer");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-embedding-source/smoke-report.json",
            report: report("single_hop", cases, {
              semanticCandidateEmbeddingSource:
                42 as unknown as LocomoSmokeReport["semanticCandidateEmbeddingSource"],
            }),
          },
        ],
      }),
    ).toThrow("semanticCandidateEmbeddingSource must be a non-empty string");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-embedding-source/smoke-report.json",
            report: report("single_hop", cases, {
              semanticCandidateEmbeddingSource:
                "provider " as unknown as LocomoSmokeReport["semanticCandidateEmbeddingSource"],
            }),
          },
        ],
      }),
    ).toThrow(
      "semanticCandidateEmbeddingSource must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/semantic-none-enabled/smoke-report.json",
            report: report("single_hop", cases, {
              semanticCandidateEmbeddingSource: "none",
              semanticCandidates: {
                enabled: true,
                maxAdditions: 4,
                minRelativeScore: null,
                minSimilarity: null,
                topK: 16,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "semanticCandidates.enabled requires semanticCandidateEmbeddingSource other than \"none\"",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/bm25-provider-source/smoke-report.json",
            report: report("single_hop", cases, {
              bm25Ranking: true,
              semanticCandidateEmbeddingSource: "provider",
              semanticCandidates: {
                enabled: false,
                maxAdditions: null,
                minRelativeScore: null,
                minSimilarity: null,
                topK: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      'bm25Ranking true requires semanticCandidateEmbeddingSource "none"',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/semantic-disabled-budget/smoke-report.json",
            report: report("single_hop", cases, {
              semanticCandidates: {
                enabled: false,
                maxAdditions: 4,
                minRelativeScore: null,
                minSimilarity: null,
                topK: null,
              },
            }),
          },
        ],
      }),
    ).toThrow(
      "semanticCandidates.maxAdditions must be null when semanticCandidates.enabled is false",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-upstream-metrics/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory:
                "token-f1" as unknown as LocomoSmokeReport["upstreamAnswerMetricByCategory"],
            }),
          },
        ],
      }),
    ).toThrow("upstreamAnswerMetricByCategory must be an object");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-upstream-metric-value/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                single_hop: 42,
              } as unknown as LocomoSmokeReport["upstreamAnswerMetricByCategory"],
            }),
          },
        ],
      }),
    ).toThrow(
      "upstreamAnswerMetricByCategory.single_hop must be a non-empty string",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-upstream-metric-value/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                single_hop: "f1_token_overlap ",
              } as LocomoSmokeReport["upstreamAnswerMetricByCategory"],
            }),
          },
        ],
      }),
    ).toThrow(
      "upstreamAnswerMetricByCategory.single_hop must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/padded-upstream-metric-category/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                "single_hop ": "f1_token_overlap",
              } as unknown as LocomoSmokeReport["upstreamAnswerMetricByCategory"],
            }),
          },
        ],
      }),
    ).toThrow(
      'upstreamAnswerMetricByCategory category "single_hop " must not have leading or trailing whitespace',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/missing-upstream-metric-category/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {},
            }),
          },
        ],
      }),
    ).toThrow(
      'upstreamAnswerMetricByCategory categories [] do not match cases[] categories ["single_hop"]',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/extra-upstream-metric-category/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                single_hop: "f1_token_overlap",
                temporal: "f1_token_overlap",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      'upstreamAnswerMetricByCategory categories ["single_hop","temporal"] do not match cases[] categories ["single_hop"]',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/wrong-answerable-upstream-metric/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                single_hop: "adversarial_abstention",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      'upstreamAnswerMetricByCategory.single_hop "adversarial_abstention" does not match expected "f1_token_overlap"',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/wrong-adversarial-upstream-metric/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                adversarial: "f1_token_overlap",
              },
            }),
          },
        ],
      }),
    ).toThrow(
      'upstreamAnswerMetricByCategory.adversarial "f1_token_overlap" does not match expected "adversarial_abstention"',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-upstream-metric-category/smoke-report.json",
            report: report("single_hop", cases, {
              upstreamAnswerMetricByCategory: {
                unknown: "exact",
              } as unknown as LocomoSmokeReport["upstreamAnswerMetricByCategory"],
            }),
          },
        ],
      }),
    ).toThrow("upstreamAnswerMetricByCategory contains unknown category unknown");
  });

  it("rejects reports whose row-level retrieval fields disagree", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-evidence-turns/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-shape",
                }),
                evidenceTurnIds: "D1:1" as unknown as string[],
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-shape evidenceTurnIds must be an array of strings",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-retrieved-turns/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-retrieved-shape",
                }),
                retrievedTurnIds: [42] as unknown as string[],
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-retrieved-shape retrievedTurnIds contains non-string value at index 0",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-noise-turns/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: false,
                  category: "single_hop",
                  evidenceRecall: 0,
                  goldEvidenceFullyRetrieved: false,
                  questionId: "q-noise-shape",
                }),
                noiseTurnIds: [" "],
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-noise-shape noiseTurnIds contains empty string at index 0",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/malformed-missing-turns/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: false,
                  category: "single_hop",
                  evidenceRecall: 0,
                  goldEvidenceFullyRetrieved: false,
                  questionId: "q-missing-shape",
                }),
                missingEvidenceTurnIds: [null] as unknown as string[],
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-missing-shape missingEvidenceTurnIds contains non-string value at index 0",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/bad-noise-count/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    noiseTurnIds: ["D1:9"],
                    questionId: "q1",
                  }),
                  noiseTurnCount: 2,
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q1 noiseTurnCount 2 does not match noiseTurnIds length 1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/bad-missing-evidence/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    questionId: "q2",
                  }),
                  missingEvidenceTurnIds: ["D1:2"],
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      'row locomo-conv-1::q2 missingEvidenceTurnIds ["D1:2"] do not match unretrieved evidence turns []',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-evidence-turn/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    questionId: "q3",
                  }),
                  evidenceTurnIds: ["D1:1", "D1:1"],
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q3 evidenceTurnIds contains duplicate turn id D1:1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/noncanonical-evidence-turn/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-noncanonical-evidence-turn",
                }),
                evidenceTurnIds: ["turn-1"],
                retrievedTurnIds: ["turn-1"],
              },
            ]),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-noncanonical-evidence-turn evidenceTurnIds contains non-LoCoMo dia_id turn-1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-retrieved-turn/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    questionId: "q4",
                  }),
                  retrievedTurnIds: ["D1:1", "D1:1"],
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q4 retrievedTurnIds contains duplicate turn id D1:1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-missing-turn/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: false,
                    category: "single_hop",
                    evidenceRecall: 0,
                    goldEvidenceFullyRetrieved: false,
                    questionId: "q-duplicate-missing-turn",
                  }),
                  missingEvidenceTurnIds: ["D1:1", "D1:1"],
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-duplicate-missing-turn missingEvidenceTurnIds contains duplicate turn id D1:1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-noise-turn/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    noiseTurnIds: ["D1:9"],
                    questionId: "q-duplicate-noise-turn",
                  }),
                  noiseTurnIds: ["D1:9", "D1:9"],
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q-duplicate-noise-turn noiseTurnIds contains duplicate turn id D1:9",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/bad-fully-retrieved-flag/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    questionId: "q5",
                  }),
                  goldEvidenceFullyRetrieved: false,
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q5 goldEvidenceFullyRetrieved false does not match unretrieved evidence turns []",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/bad-evidence-recall/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    questionId: "q6",
                  }),
                  evidenceRecall: 0.5,
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      "row locomo-conv-1::q6 evidenceRecall 0.5 does not match retrieved evidence recall 1",
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/bad-noise-ids/smoke-report.json",
            report: report(
              "single_hop",
              [
                {
                  ...question({
                    answerCorrect: true,
                    category: "single_hop",
                    evidenceRecall: 1,
                    goldEvidenceFullyRetrieved: true,
                    noiseTurnIds: ["D1:9"],
                    questionId: "q7",
                  }),
                  retrievedTurnIds: ["D1:1", "D1:8"],
                },
              ],
            ),
          },
        ],
      }),
    ).toThrow(
      'row locomo-conv-1::q7 noiseTurnIds ["D1:9"] do not match retrieved non-evidence turns ["D1:8"]',
    );
  });

  it("rejects reports whose selection headers do not match cases", () => {
    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/mismatched-case-ids/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  caseId: "locomo-conv-2",
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { caseIds: ["locomo-conv-1"] },
            ),
          },
        ],
      }),
    ).toThrow(
      'caseIds ["locomo-conv-1"] does not match cases[] case ids ["locomo-conv-2"]',
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-case-ids/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-duplicate-case-header",
                }),
              ],
              {
                caseCount: 2,
                caseIds: ["locomo-conv-1", "locomo-conv-1"],
              },
            ),
          },
        ],
      }),
    ).toThrow("caseIds contains duplicate value locomo-conv-1");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/mismatched-question-ids/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q1",
                }),
              ],
              { questionIds: ["q2"] },
            ),
          },
        ],
      }),
    ).toThrow('questionIds ["q2"] does not match cases[] question ids ["q1"]');

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/empty-question-ids/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-empty-question-ids",
                }),
              ],
              { questionIds: [] },
            ),
          },
        ],
      }),
    ).toThrow("questionIds must contain at least one value");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/unknown-row-category/smoke-report.json",
            report: report("single_hop", [
              {
                ...question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q3",
                }),
                category: "unknown_category" as unknown as LocomoQaCategory,
              },
            ]),
          },
        ],
      }),
    ).toThrow("row locomo-conv-1::q3 has unknown category unknown_category");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/duplicate-question-category/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q4",
                }),
              ],
              { questionCategories: ["single_hop", "single_hop"] },
            ),
          },
        ],
      }),
    ).toThrow("questionCategories contains duplicate category single_hop");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/empty-question-categories/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q-empty-question-categories",
                }),
              ],
              { questionCategories: [] },
            ),
          },
        ],
      }),
    ).toThrow("questionCategories must contain at least one value");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/unknown-question-category/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q5",
                }),
              ],
              {
                questionCategories: [
                  "single_hop",
                  "unknown_category" as unknown as LocomoQaCategory,
                ],
              },
            ),
          },
        ],
      }),
    ).toThrow("questionCategories contains unknown category unknown_category");

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          {
            path: "/reports/stale-question-category/smoke-report.json",
            report: report(
              "single_hop",
              [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  questionId: "q6",
                }),
              ],
              { questionCategories: ["single_hop", "open_domain"] },
            ),
          },
        ],
      }),
    ).toThrow(
      'questionCategories ["single_hop","open_domain"] does not match cases[] categories ["single_hop"]',
    );
  });

  it("aggregates compatible one-category shards with different category filters", () => {
    const analysis = analyzeLocomoCategoryGaps({
      reports: [
        {
          path: "/reports/single_hop/smoke-report.json",
          report: report(
            "single_hop",
            [
              question({
                answerCorrect: true,
                category: "single_hop",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                questionId: "q1",
              }),
            ],
            {
              caseIds: ["locomo-conv-1"],
              questionCategories: ["single_hop"],
            },
          ),
        },
        {
          path: "/reports/open_domain/smoke-report.json",
          report: report(
            "open_domain",
            [
              question({
                answerCorrect: false,
                caseId: "locomo-conv-2",
                category: "open_domain",
                evidenceRecall: 0,
                goldEvidenceFullyRetrieved: false,
                missingEvidenceTurnIds: ["D1:1"],
                questionId: "q2",
              }),
            ],
            {
              caseIds: ["locomo-conv-2"],
              questionCategories: ["open_domain"],
            },
          ),
        },
      ],
    });

    expect(analysis.overall.questionCount).toBe(2);
    expect(analysis.categories.single_hop?.questionCount).toBe(1);
    expect(analysis.categories.open_domain?.questionCount).toBe(1);
  });

  it("rejects overlapping reports that would double-count a question", () => {
    const first = report(
      "single_hop",
      [
        question({
          answerCorrect: true,
          category: "single_hop",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
        }),
      ],
      { questionCategories: ["single_hop"] },
    );

    expect(() =>
      analyzeLocomoCategoryGaps({
        reports: [
          { path: "/reports/a/smoke-report.json", report: first },
          { path: "/reports/b/smoke-report.json", report: first },
        ],
      }),
    ).toThrow("duplicate question");
  });

  it("parses report flags and writes a category-gap artifact", async () => {
    const reports = [
      {
        path: "/reports/single_hop/smoke-report.json",
        report: report("single_hop", [
          question({
            answerCorrect: true,
            category: "single_hop",
            evidenceRecall: 1,
            goldEvidenceFullyRetrieved: true,
            questionId: "q1",
          }),
        ]),
      },
    ];
    const reads = new Map(
      reports.map(({ path, report: sourceReport }) => [
        path,
        JSON.stringify(sourceReport),
      ]),
    );
    const writes: Array<{ contents: string; path: string }> = [];

    const { analysis, outputPath } = await runLocomoCategoryGapAnalysis(
      [
        "bun",
        "run",
        "scripts/analyze-phase-65-locomo-category-gaps.ts",
        "--report",
        "/reports/single_hop/smoke-report.json",
        "--run-id",
        "locomo-category-gaps",
        "--output-path",
        "/reports/category-gap-analysis.json",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-02T02:00:00.000Z"),
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

    expect(outputPath).toBe("/reports/category-gap-analysis.json");
    expect(analysis.outputPath).toBe("/reports/category-gap-analysis.json");
    expect(outputPath.endsWith(LOCOMO_CATEGORY_GAP_ANALYSIS_FILE_NAME)).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toMatchObject({
      overall: { answerAccuracy: 1, questionCount: 1 },
      runId: "locomo-category-gaps",
    });
  });

  it("rejects empty report path entries before reading gap inputs", async () => {
    await expect(
      runLocomoCategoryGapAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-category-gaps.ts",
          "--report",
          "/reports/single_hop/smoke-report.json,",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--report contains an empty value.");
  });

  it("rejects duplicate report path entries before reading gap inputs", async () => {
    await expect(
      runLocomoCategoryGapAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-category-gaps.ts",
          "--report",
          "/reports/single_hop/smoke-report.json",
          "--report",
          "/reports/single_hop/../single_hop/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--report contains duplicate value /reports/single_hop/../single_hop/smoke-report.json.",
    );
  });

  it("rejects output paths that overwrite a source report before reading gap inputs", async () => {
    await expect(
      runLocomoCategoryGapAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-category-gaps.ts",
          "--report",
          "/reports/single_hop/smoke-report.json",
          "--output-path",
          "/reports/single_hop/../single_hop/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --report must refer to different paths",
    );
  });

  it("rejects missing string flag values before reading gap inputs", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read reports");
      },
    };

    await expect(
      runLocomoCategoryGapAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-category-gaps.ts",
          "--report",
          "/reports/single_hop/smoke-report.json",
          "--output-path",
          "--run-id",
          "locomo-category-gaps",
        ],
        noReads,
      ),
    ).rejects.toThrow("--output-path requires a value.");

    await expect(
      runLocomoCategoryGapAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-category-gaps.ts",
          "--report",
          "/reports/single_hop/smoke-report.json",
          "--output-path",
          "/reports/category-gap-analysis.json",
          "--run-id",
          "--unused",
        ],
        noReads,
      ),
    ).rejects.toThrow("--run-id requires a value.");
  });
});
