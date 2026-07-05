import { describe, expect, it } from "bun:test";
import {
  LOCOMO_BUDGET_DELTA_FILE_NAME,
  analyzeLocomoBudgetDelta,
  runLocomoBudgetDeltaAnalysis,
} from "../../scripts/analyze-phase-65-locomo-budget-delta";
import type {
  LocomoCategoryRetrievalSummary,
  LocomoSmokeReport,
} from "../../scripts/run-phase-65-locomo-smoke";
import { deriveLocomoMatchMode } from "../../src/eval/locomo";
import type { LocomoQaCategory } from "../../src/eval/locomo";

function summary(input: {
  category: LocomoQaCategory;
  fullyRetrievedCount: number;
  noiseTurnTotal: number;
  questionCount: number;
  recall: number;
}): LocomoCategoryRetrievalSummary {
  return {
    answerAccuracy: null,
    answeredCount: 0,
    averageEvidenceRecall: input.recall,
    category: input.category,
    crossSessionChainReady:
      input.category === "multi_hop"
        ? input.fullyRetrievedCount === input.questionCount
        : null,
    fullyRetrievedCount: input.fullyRetrievedCount,
    noiseTurnTotal: input.noiseTurnTotal,
    questionCount: input.questionCount,
  };
}

function report(input: {
  benchmarkSource?: string;
  bm25Ranking?: boolean;
  caseId?: string;
  category: LocomoQaCategory;
  externalRoot?: string;
  fullyRetrievedCount: number;
  ingestMode?: LocomoSmokeReport["ingestMode"];
  maxAdditions: number;
  minRelativeScore?: number;
  noiseTurnTotal: number;
  questionCount: number;
  questionIds?: string[];
  recall: number;
  runId: string;
  topK: number;
}): LocomoSmokeReport {
  const caseId = input.caseId ?? "locomo-conv-42";
  const questionIds =
    input.questionIds ??
    Array.from({ length: input.questionCount }, (_value, index) => `q${index + 1}`);
  const baseNoiseTurnCount = Math.floor(
    input.noiseTurnTotal / input.questionCount,
  );
  const extraNoiseTurnCount = input.noiseTurnTotal % input.questionCount;
  const cases: LocomoSmokeReport["cases"] = questionIds.map(
    (questionId, index) => {
      const fullyRetrieved = index < input.fullyRetrievedCount;
      const noiseTurnCount =
        baseNoiseTurnCount + (index < extraNoiseTurnCount ? 1 : 0);
      const noiseTurnIds = Array.from(
        { length: noiseTurnCount },
        (_value, noiseIndex) => `D9:${index * 100 + noiseIndex + 1}`,
      );
      return {
        answerCorrect: null,
        caseId,
        category: input.category,
        evidenceRecall: fullyRetrieved ? 1 : 0,
        evidenceTurnIds: fullyRetrieved ? ["D1:1"] : ["D1:2"],
        generatedAnswer: null,
        goldEvidenceFullyRetrieved: fullyRetrieved,
        missingEvidenceTurnIds: fullyRetrieved ? [] : ["D1:2"],
        noiseTurnCount,
        noiseTurnIds,
        questionId,
        retrievedTurnIds: fullyRetrieved ? ["D1:1", ...noiseTurnIds] : noiseTurnIds,
      };
    },
  );
  return {
    answerContextMode: "raw-turns",
    answerEvaluation: "deferred-to-live-mode",
    benchmark: "locomo",
    benchmarkSource: input.benchmarkSource ?? "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: input.bm25Ranking ?? false,
    caseCount: 1,
    caseIds: [caseId],
    cases,
    categories: [
      summary({
        category: input.category,
        fullyRetrievedCount: input.fullyRetrievedCount,
        noiseTurnTotal: input.noiseTurnTotal,
        questionCount: input.questionCount,
        recall: input.recall,
      }),
    ],
    executionFailures: 0,
    externalRoot: input.externalRoot ?? "/private/tmp/LOCOMO-full",
    generatedAt: "2026-07-03T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: input.ingestMode ?? "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "retrieval-only",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: [input.category],
    questionCount: input.questionCount,
    resume: false,
    runDirectory: `/tmp/${input.runId}`,
    runId: input.runId,
    semanticCandidateEmbeddingSource: "provider",
    semanticCandidates: {
      enabled: true,
      maxAdditions: input.maxAdditions,
      minRelativeScore: input.minRelativeScore ?? null,
      minSimilarity: null,
      topK: input.topK,
    },
    upstreamAnswerMetricByCategory: {
      [input.category]: deriveLocomoMatchMode(input.category),
    },
    upstreamSource: "https://github.com/snap-research/locomo",
  };
}

describe("phase-65 LoCoMo candidate-budget delta analyzer", () => {
  it("compares recall gain against added noise for compatible reports", () => {
    const analysis = analyzeLocomoBudgetDelta({
      baseline: {
        path: "/reports/open-domain-top16/smoke-report.json",
        report: report({
          category: "open_domain",
          fullyRetrievedCount: 48,
          maxAdditions: 4,
          noiseTurnTotal: 696,
          questionCount: 96,
          recall: 0.5,
          runId: "open-domain-top16-add4",
          topK: 16,
        }),
      },
      candidate: {
        path: "/reports/open-domain-top32-rel08/smoke-report.json",
        report: report({
          category: "open_domain",
          fullyRetrievedCount: 60,
          maxAdditions: 8,
          minRelativeScore: 0.8,
          noiseTurnTotal: 936,
          questionCount: 96,
          recall: 0.625,
          runId: "open-domain-top32-add8-rel08",
          topK: 32,
        }),
      },
      generatedAt: "2026-07-03T00:00:00.000Z",
      runId: "locomo-budget-delta-open-domain",
    });

    expect(analysis.runId).toBe("locomo-budget-delta-open-domain");
    expect(analysis.claimBoundary).toContain("Research diagnostic");
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.comparisons[0]).toMatchObject({
      addedNoiseTurnTotal: 240,
      category: "open_domain",
      fullyRetrievedDelta: 12,
      questionCount: 96,
    });
    expect(analysis.comparisons[0]?.averageEvidenceRecallDelta).toBeCloseTo(
      0.125,
      10,
    );
    expect(
      analysis.comparisons[0]?.recallDeltaPer100AddedNoiseTurns,
    ).toBeCloseTo(0.052083333333333336, 10);
  });

  it("rejects budget-delta comparisons that reuse the same run id", () => {
    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline/smoke-report.json",
          report: report({
            category: "open_domain",
            fullyRetrievedCount: 48,
            maxAdditions: 4,
            noiseTurnTotal: 696,
            questionCount: 96,
            recall: 0.5,
            runId: "shared-budget-run",
            topK: 16,
          }),
        },
        candidate: {
          path: "/reports/candidate/smoke-report.json",
          report: report({
            category: "open_domain",
            fullyRetrievedCount: 60,
            maxAdditions: 8,
            minRelativeScore: 0.8,
            noiseTurnTotal: 936,
            questionCount: 96,
            recall: 0.625,
            runId: "shared-budget-run",
            topK: 32,
          }),
        },
      }),
    ).toThrow("baseline and candidate reports must use different runIds");
  });

  it("rejects reports with different source roots, retrieval stacks, or question identities", () => {
    const baseline = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 4,
      noiseTurnTotal: 10,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-baseline",
      topK: 16,
    });

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/candidate-other-root.json",
          report: report({
            benchmarkSource: "/private/tmp/LOCOMO-other/cases.json",
            category: "open_domain",
            externalRoot: "/private/tmp/LOCOMO-other",
            fullyRetrievedCount: 1,
            maxAdditions: 8,
            noiseTurnTotal: 12,
            questionCount: 2,
            questionIds: ["q1", "q2"],
            recall: 0.5,
            runId: "open-domain-other-root",
            topK: 32,
          }),
        },
      }),
    ).toThrow("benchmarkSource");

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/candidate-bm25.json",
          report: report({
            bm25Ranking: true,
            category: "open_domain",
            fullyRetrievedCount: 1,
            maxAdditions: 8,
            noiseTurnTotal: 12,
            questionCount: 2,
            questionIds: ["q1", "q2"],
            recall: 0.5,
            runId: "open-domain-bm25",
            topK: 32,
          }),
        },
      }),
    ).toThrow("bm25Ranking");

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/candidate-different-questions.json",
          report: report({
            category: "open_domain",
            fullyRetrievedCount: 1,
            maxAdditions: 8,
            noiseTurnTotal: 12,
            questionCount: 2,
            questionIds: ["q1", "q3"],
            recall: 0.5,
            runId: "open-domain-different-questions",
            topK: 32,
          }),
        },
      }),
    ).toThrow("question identity");
  });

  it("rejects direct self-comparison report inputs with path-equivalent lineage", () => {
    const baseline = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 4,
      noiseTurnTotal: 10,
      questionCount: 2,
      recall: 0.5,
      runId: "open-domain-baseline",
      topK: 16,
    });
    const candidate = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 8,
      noiseTurnTotal: 12,
      questionCount: 2,
      recall: 0.5,
      runId: "open-domain-candidate",
      topK: 32,
    });

    expect(() =>
      analyzeLocomoBudgetDelta({
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

  it("rejects reports whose questionCount does not match cases length", () => {
    const baseline = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 4,
      noiseTurnTotal: 10,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-baseline",
      topK: 16,
    });

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            cases: baseline.cases.slice(0, 1),
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: report({
            category: "open_domain",
            fullyRetrievedCount: 1,
            maxAdditions: 8,
            noiseTurnTotal: 12,
            questionCount: 2,
            questionIds: ["q1", "q2"],
            recall: 0.5,
            runId: "open-domain-candidate",
            topK: 32,
          }),
        },
      }),
    ).toThrow("questionCount 2 does not match cases length 1");
  });

  it("rejects reports whose category summaries do not match cases", () => {
    const baseline = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 4,
      noiseTurnTotal: 10,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-baseline",
      topK: 16,
    });

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                noiseTurnTotal: 9,
              },
            ],
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: report({
            category: "open_domain",
            fullyRetrievedCount: 1,
            maxAdditions: 8,
            noiseTurnTotal: 12,
            questionCount: 2,
            questionIds: ["q1", "q2"],
            recall: 0.5,
            runId: "open-domain-candidate",
            topK: 32,
          }),
        },
      }),
    ).toThrow("category open_domain noiseTurnTotal 9 does not match cases[] 10");
  });

  it("rejects malformed category summary scalar fields before comparing cases", () => {
    const baseline = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 4,
      noiseTurnTotal: 10,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-baseline",
      topK: 16,
    });
    const candidate = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 8,
      noiseTurnTotal: 12,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-candidate",
      topK: 32,
    });

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                category:
                  "open_domain " as unknown as
                    LocomoSmokeReport["categories"][number]["category"],
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category summary at index 0 category must not have leading or trailing whitespace",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                averageEvidenceRecall: "0.5" as unknown as number,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain averageEvidenceRecall must be a finite number",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                averageEvidenceRecall: -0.25,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain averageEvidenceRecall must be a finite number between 0 and 1",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                answeredCount: 0.5,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain answeredCount 0.5 is not a non-negative integer",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                fullyRetrievedCount: "1" as unknown as number,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain fullyRetrievedCount 1 is not a non-negative integer",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                answerAccuracy: "0" as unknown as number,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain answerAccuracy must be a finite number or null",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                answerAccuracy: 1.5,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain answerAccuracy must be a finite number between 0 and 1 or null",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            categories: [
              {
                ...baseline.categories[0]!,
                crossSessionChainReady: "false" as unknown as boolean,
              },
            ],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "category open_domain crossSessionChainReady must be a boolean or null",
    );
  });

  it("rejects malformed retrieval-config metadata before emitting budget deltas", () => {
    const baseline = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 4,
      noiseTurnTotal: 10,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-baseline",
      topK: 16,
    });
    const candidate = report({
      category: "open_domain",
      fullyRetrievedCount: 1,
      maxAdditions: 8,
      noiseTurnTotal: 12,
      questionCount: 2,
      questionIds: ["q1", "q2"],
      recall: 0.5,
      runId: "open-domain-candidate",
      topK: 32,
    });

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            semanticCandidates: "top16" as unknown as LocomoSmokeReport["semanticCandidates"],
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow("semanticCandidates must be an object");

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            semanticCandidates: {
              ...baseline.semanticCandidates,
              enabled: "true" as unknown as boolean,
            },
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow("semanticCandidates.enabled must be a boolean");

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            semanticCandidates: {
              ...baseline.semanticCandidates,
              topK: 0,
            },
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow("semanticCandidates.topK 0 is not a positive integer or null");

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            semanticCandidates: {
              ...baseline.semanticCandidates,
              minRelativeScore: 1.2,
            },
          },
        },
        candidate: { path: "/reports/candidate.json", report: candidate },
      }),
    ).toThrow(
      "semanticCandidates.minRelativeScore must be a finite number between 0 and 1 or null",
    );

    expect(() =>
      analyzeLocomoBudgetDelta({
        baseline: {
          path: "/reports/baseline.json",
          report: {
            ...baseline,
            semanticCandidateEmbeddingSource:
              "provider-ish" as unknown as LocomoSmokeReport["semanticCandidateEmbeddingSource"],
          },
        },
        candidate: {
          path: "/reports/candidate.json",
          report: {
            ...candidate,
            semanticCandidateEmbeddingSource:
              "provider-ish" as unknown as LocomoSmokeReport["semanticCandidateEmbeddingSource"],
          },
        },
      }),
    ).toThrow(
      'semanticCandidateEmbeddingSource "provider-ish" is not supported',
    );
  });

  it("parses report flags and writes a JSON artifact", async () => {
    const baselinePath = "/reports/baseline/smoke-report.json";
    const candidatePath = "/reports/candidate/smoke-report.json";
    const reads = new Map([
      [
        baselinePath,
        JSON.stringify(
          report({
            category: "multi_hop",
            fullyRetrievedCount: 37,
            maxAdditions: 4,
            noiseTurnTotal: 2204,
            questionCount: 282,
            recall: 37 / 282,
            runId: "multi-hop-top16-add4",
            topK: 16,
          }),
        ),
      ],
      [
        candidatePath,
        JSON.stringify(
          report({
            category: "multi_hop",
            fullyRetrievedCount: 42,
            maxAdditions: 8,
            minRelativeScore: 0.8,
            noiseTurnTotal: 2939,
            questionCount: 282,
            recall: 42 / 282,
            runId: "multi-hop-top32-add8-rel08",
            topK: 32,
          }),
        ),
      ],
    ]);
    const writes: Array<{ contents: string; path: string }> = [];

    const { analysis, outputPath } = await runLocomoBudgetDeltaAnalysis(
      [
        "bun",
        "run",
        "scripts/analyze-phase-65-locomo-budget-delta.ts",
        "--baseline-report",
        baselinePath,
        "--candidate-report",
        candidatePath,
        "--run-id",
        "locomo-budget-delta-multi-hop",
        "--output-path",
        "/reports/delta/budget-delta.json",
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

    expect(outputPath).toBe("/reports/delta/budget-delta.json");
    expect(outputPath.endsWith(LOCOMO_BUDGET_DELTA_FILE_NAME)).toBe(true);
    expect(analysis.outputPath).toBe(outputPath);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toMatchObject({
      comparisons: [{ category: "multi_hop", fullyRetrievedDelta: 5 }],
      runId: "locomo-budget-delta-multi-hop",
    });
  });

  it("rejects path-equivalent baseline and candidate reports before reading inputs", async () => {
    await expect(
      runLocomoBudgetDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-budget-delta.ts",
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
      runLocomoBudgetDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-budget-delta.ts",
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
      runLocomoBudgetDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-budget-delta.ts",
          "--baseline-report",
          "/reports/baseline/smoke-report.json",
          "--candidate-report",
          "/reports/candidate/budget-delta.json",
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
      runLocomoBudgetDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-budget-delta.ts",
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

  it("rejects missing string flag values before reading reports", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read reports");
      },
    };

    await expect(
      runLocomoBudgetDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-budget-delta.ts",
          "--baseline-report",
          "--candidate-report",
          "/reports/candidate.json",
        ],
        noReads,
      ),
    ).rejects.toThrow("--baseline-report requires a value.");

    await expect(
      runLocomoBudgetDeltaAnalysis(
        [
          "bun",
          "run",
          "scripts/analyze-phase-65-locomo-budget-delta.ts",
          "--baseline-report",
          "/reports/baseline.json",
          "--candidate-report",
          "/reports/candidate.json",
          "--output-path",
          "--run-id",
          "locomo-budget-delta",
        ],
        noReads,
      ),
    ).rejects.toThrow("--output-path requires a value.");
  });
});
