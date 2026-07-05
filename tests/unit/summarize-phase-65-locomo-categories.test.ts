import { describe, expect, it } from "bun:test";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import {
  LOCOMO_CATEGORY_SUMMARY_FILE_NAME,
  runLocomoCategorySummary,
  summarizeLocomoCategoryReports,
} from "../../scripts/summarize-phase-65-locomo-categories";
import { deriveLocomoMatchMode } from "../../src/eval/locomo";
import type { LocomoQaCategory } from "../../src/eval/locomo";

function categorySummary(
  category: LocomoQaCategory,
  input: {
    answerAccuracy: number | null;
    answeredCount: number;
    averageEvidenceRecall: number;
    fullyRetrievedCount: number;
    noiseTurnTotal: number;
    questionCount: number;
  },
): LocomoSmokeReport["categories"][number] {
  return {
    answerAccuracy: input.answerAccuracy,
    answeredCount: input.answeredCount,
    averageEvidenceRecall: input.averageEvidenceRecall,
    category,
    crossSessionChainReady:
      category === "multi_hop"
        ? input.questionCount > 0 &&
          input.fullyRetrievedCount === input.questionCount
        : null,
    fullyRetrievedCount: input.fullyRetrievedCount,
    noiseTurnTotal: input.noiseTurnTotal,
    questionCount: input.questionCount,
  };
}

function report(
  category: LocomoQaCategory,
  input: {
    answerAccuracy: number;
    answeredCount: number;
    averageEvidenceRecall: number;
    executionFailures?: number;
    fullyRetrievedCount: number;
    noiseTurnTotal: number;
    questionCount: number;
    questionIds?: string[];
    runId?: string;
  },
): LocomoSmokeReport {
  const categories = [
    categorySummary("single_hop", {
      answerAccuracy: null,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("multi_hop", {
      answerAccuracy: null,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("temporal", {
      answerAccuracy: null,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("open_domain", {
      answerAccuracy: null,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("adversarial", {
      answerAccuracy: null,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
  ];
  const index = categories.findIndex((entry) => entry.category === category);
  categories[index] = categorySummary(category, input);
  const correctCount =
    input.answerAccuracy === null
      ? 0
      : Math.round(input.answerAccuracy * input.answeredCount);
  const baseNoiseTurnCount = Math.floor(
    input.noiseTurnTotal / input.questionCount,
  );
  const extraNoiseTurnCount = input.noiseTurnTotal % input.questionCount;
  const cases = Array.from(
    { length: input.questionCount },
    (_value, index): LocomoSmokeReport["cases"][number] => {
      const fullyRetrieved = index < input.fullyRetrievedCount;
      const noiseTurnCount =
        baseNoiseTurnCount + (index < extraNoiseTurnCount ? 1 : 0);
      const noiseTurnIds = Array.from(
        { length: noiseTurnCount },
        (_noiseValue, noiseIndex) => `D9:${index * 100 + noiseIndex + 1}`,
      );
      return {
        answerCorrect:
          index >= input.answeredCount ? null : index < correctCount,
        caseId: "locomo-conv-26",
        category,
        evidenceRecall: fullyRetrieved ? 1 : 0,
        evidenceTurnIds: fullyRetrieved ? ["D1:1"] : ["D1:2"],
        generatedAnswer: index < input.answeredCount ? "answer" : null,
        goldEvidenceFullyRetrieved: fullyRetrieved,
        missingEvidenceTurnIds: fullyRetrieved ? [] : ["D1:2"],
        noiseTurnCount,
        noiseTurnIds,
        questionId: `q${index + 1}`,
        retrievedTurnIds: fullyRetrieved ? ["D1:1", ...noiseTurnIds] : noiseTurnIds,
      };
    },
  );
  const caseIds = [...new Set(cases.map((testCase) => testCase.caseId))];

  return {
    answerContextMode: "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: false,
    caseCount: caseIds.length,
    caseIds,
    cases,
    categories,
    executionFailures: input.executionFailures ?? 0,
    externalRoot: "/private/tmp/LOCOMO-full",
    generatedAt: "2026-07-02T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "live-answer",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: [category],
    questionIds: input.questionIds ?? null,
    questionCount: input.questionCount,
    resume: false,
    runDirectory: `/tmp/${category}`,
    runId: input.runId ?? `run-${category}`,
    semanticCandidateEmbeddingSource: "provider",
    semanticCandidates: {
      enabled: true,
      maxAdditions: 4,
      minRelativeScore: null,
      minSimilarity: null,
      topK: 16,
    },
    upstreamAnswerMetricByCategory: {
      [category]: deriveLocomoMatchMode(category),
    },
    upstreamSource: "https://github.com/snap-research/locomo",
  };
}

const fullReports = [
  {
    path: "/reports/single_hop/smoke-report.json",
    report: report("single_hop", {
      answerAccuracy: 0.5,
      answeredCount: 4,
      averageEvidenceRecall: 0.5,
      fullyRetrievedCount: 2,
      noiseTurnTotal: 3,
      questionCount: 4,
    }),
  },
  {
    path: "/reports/multi_hop/smoke-report.json",
    report: report("multi_hop", {
      answerAccuracy: 5 / 6,
      answeredCount: 6,
      averageEvidenceRecall: 0.5,
      fullyRetrievedCount: 3,
      noiseTurnTotal: 8,
      questionCount: 6,
    }),
  },
  {
    path: "/reports/temporal/smoke-report.json",
    report: report("temporal", {
      answerAccuracy: 0.8,
      answeredCount: 5,
      averageEvidenceRecall: 0.8,
      fullyRetrievedCount: 4,
      noiseTurnTotal: 1,
      questionCount: 5,
    }),
  },
  {
    path: "/reports/open_domain/smoke-report.json",
    report: report("open_domain", {
      answerAccuracy: 1 / 3,
      answeredCount: 3,
      averageEvidenceRecall: 1 / 3,
      fullyRetrievedCount: 1,
      noiseTurnTotal: 6,
      questionCount: 3,
    }),
  },
  {
    path: "/reports/adversarial/smoke-report.json",
    report: report("adversarial", {
      answerAccuracy: 1,
      answeredCount: 2,
      averageEvidenceRecall: 1,
      fullyRetrievedCount: 2,
      noiseTurnTotal: 0,
      questionCount: 2,
    }),
  },
];

describe("phase-65 LoCoMo category summarizer", () => {
  it("assembles five category shards into one weighted full-root matrix", () => {
    const summary = summarizeLocomoCategoryReports({
      generatedAt: "2026-07-02T01:00:00.000Z",
      reports: fullReports,
      runId: "locomo-category-matrix",
    });

    expect(summary.phase).toBe("phase-65");
    expect(summary.benchmark).toBe("locomo");
    expect(summary.generatedBy).toBe(
      "scripts/summarize-phase-65-locomo-categories.ts",
    );
    expect(summary.runId).toBe("locomo-category-matrix");
    expect(summary.requiredCategories).toEqual([
      "single_hop",
      "multi_hop",
      "temporal",
      "open_domain",
      "adversarial",
    ]);
    expect(summary.overall.questionCount).toBe(20);
    expect(summary.overall.answeredCount).toBe(20);
    expect(summary.overall.answerCorrectCount).toBe(14);
    expect(summary.overall.answerAccuracy).toBe(0.7);
    expect(summary.overall.averageEvidenceRecall).toBeCloseTo(0.6, 10);
    expect(summary.overall.fullyRetrievedCount).toBe(12);
    expect(summary.overall.fullyRetrievedShare).toBe(0.6);
    expect(summary.overall.noiseTurnTotal).toBe(18);
    expect(summary.sourceReports).toEqual([
      {
        category: "single_hop",
        path: "/reports/single_hop/smoke-report.json",
        questionCount: 4,
        runId: "run-single_hop",
      },
      {
        category: "multi_hop",
        path: "/reports/multi_hop/smoke-report.json",
        questionCount: 6,
        runId: "run-multi_hop",
      },
      {
        category: "temporal",
        path: "/reports/temporal/smoke-report.json",
        questionCount: 5,
        runId: "run-temporal",
      },
      {
        category: "open_domain",
        path: "/reports/open_domain/smoke-report.json",
        questionCount: 3,
        runId: "run-open_domain",
      },
      {
        category: "adversarial",
        path: "/reports/adversarial/smoke-report.json",
        questionCount: 2,
        runId: "run-adversarial",
      },
    ]);
    expect(summary.categories.multi_hop.answerCorrectCount).toBe(5);
    expect(summary.categories.open_domain.reportPath).toBe(
      "/reports/open_domain/smoke-report.json",
    );
    expect(summary.claimBoundary).toContain("Research hardening artifact");
  });

  it("rejects direct duplicate normalized report paths before summary assembly", () => {
    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          {
            path: "/reports/category/smoke-report.json",
            report: report("single_hop", {
              answerAccuracy: 1,
              answeredCount: 1,
              averageEvidenceRecall: 1,
              fullyRetrievedCount: 1,
              noiseTurnTotal: 0,
              questionCount: 1,
              runId: "single-hop-live",
            }),
          },
          {
            path: "/reports/category/../category/smoke-report.json",
            report: report("multi_hop", {
              answerAccuracy: 1,
              answeredCount: 1,
              averageEvidenceRecall: 1,
              fullyRetrievedCount: 1,
              noiseTurnTotal: 0,
              questionCount: 1,
              runId: "multi-hop-live",
            }),
          },
        ],
        requiredCategories: ["single_hop", "multi_hop"],
      }),
    ).toThrow("duplicate report path");
  });

  it("rejects incomplete or failed category assemblies", () => {
    expect(() =>
      summarizeLocomoCategoryReports({
        reports: fullReports.slice(0, 4),
        runId: "missing-adversarial",
      }),
    ).toThrow("Missing LoCoMo category shard(s): adversarial.");

    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          ...fullReports.slice(0, 4),
          {
            path: "/reports/adversarial/smoke-report.json",
            report: report("adversarial", {
              answerAccuracy: 1,
              answeredCount: 2,
              averageEvidenceRecall: 1,
              executionFailures: 1,
              fullyRetrievedCount: 2,
              noiseTurnTotal: 0,
              questionCount: 2,
            }),
          },
        ],
        runId: "failed-adversarial",
      }),
    ).toThrow("has 1 execution failure(s)");
  });

  it("rejects malformed executionFailures headers before summary assembly", () => {
    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          {
            path: "/reports/single_hop-malformed-failures/smoke-report.json",
            report: {
              ...fullReports[0]!.report,
              executionFailures: "0" as unknown as number,
            },
          },
          ...fullReports.slice(1),
        ],
        runId: "malformed-execution-failures",
      }),
    ).toThrow("executionFailures 0 is not a non-negative integer");
  });

  it("rejects category shards from a different source root or retrieval stack", () => {
    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          fullReports[0]!,
          {
            path: "/reports/multi_hop/smoke-report.json",
            report: {
              ...fullReports[1]!.report,
              benchmarkSource: "/private/tmp/LOCOMO-other/cases.json",
              externalRoot: "/private/tmp/LOCOMO-other",
            },
          },
          ...fullReports.slice(2),
        ],
        runId: "mixed-root",
      }),
    ).toThrow("benchmarkSource");

    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          fullReports[0]!,
          {
            path: "/reports/multi_hop/smoke-report.json",
            report: {
              ...fullReports[1]!.report,
              bm25Ranking: true,
            },
          },
          ...fullReports.slice(2),
        ],
        runId: "mixed-ranking-stack",
      }),
    ).toThrow("bm25Ranking");
  });

  it("rejects question-id partial shards instead of labeling them category matrix shards", () => {
    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          {
            path: "/reports/single_hop-partial/smoke-report.json",
            report: report("single_hop", {
              answerAccuracy: 1,
              answeredCount: 1,
              averageEvidenceRecall: 1,
              fullyRetrievedCount: 1,
              noiseTurnTotal: 0,
              questionCount: 1,
              questionIds: ["q1"],
            }),
          },
          ...fullReports.slice(1),
        ],
        runId: "partial-shard",
      }),
    ).toThrow("questionIds");
  });

  it("rejects category shards whose questionCount does not match cases length", () => {
    const mismatched = report("single_hop", {
      answerAccuracy: 1,
      answeredCount: 2,
      averageEvidenceRecall: 1,
      fullyRetrievedCount: 2,
      noiseTurnTotal: 0,
      questionCount: 2,
    });

    expect(() =>
      summarizeLocomoCategoryReports({
        reports: [
          {
            path: "/reports/single_hop-mismatched/smoke-report.json",
            report: {
              ...mismatched,
              cases: mismatched.cases.slice(0, 1),
            },
          },
          ...fullReports.slice(1),
        ],
        runId: "mismatched-single-hop",
      }),
    ).toThrow("questionCount 2 does not match cases length 1");
  });

  it("parses repeated report flags and writes the summary artifact", async () => {
    const reads = new Map(
      fullReports.map(({ path, report: sourceReport }) => [
        path,
        JSON.stringify(sourceReport),
      ]),
    );
    const writes: Array<{ contents: string; path: string }> = [];

    const { outputPath, summary } = await runLocomoCategorySummary(
      [
        "bun",
        "run",
        "scripts/summarize-phase-65-locomo-categories.ts",
        "--report",
        "/reports/single_hop/smoke-report.json,/reports/multi_hop/smoke-report.json",
        "--report",
        "/reports/temporal/smoke-report.json",
        "--report",
        "/reports/open_domain/smoke-report.json",
        "--report",
        "/reports/adversarial/smoke-report.json",
        "--run-id",
        "locomo-category-matrix",
        "--output-path",
        "/reports/category-summary.json",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-02T01:00:00.000Z"),
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

    expect(outputPath).toBe("/reports/category-summary.json");
    expect(summary.outputPath).toBe("/reports/category-summary.json");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe("/reports/category-summary.json");
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toMatchObject({
      overall: { answerAccuracy: 0.7, questionCount: 20 },
      runId: "locomo-category-matrix",
    });
    expect(outputPath.endsWith(LOCOMO_CATEGORY_SUMMARY_FILE_NAME)).toBe(true);
  });

  it("rejects empty report path entries before assembling the summary", async () => {
    await expect(
      runLocomoCategorySummary(
        [
          "bun",
          "run",
          "scripts/summarize-phase-65-locomo-categories.ts",
          "--report",
          "/reports/single_hop/smoke-report.json,,/reports/multi_hop/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--report contains an empty value.");
  });

  it("rejects duplicate report path entries before assembling the summary", async () => {
    await expect(
      runLocomoCategorySummary(
        [
          "bun",
          "run",
          "scripts/summarize-phase-65-locomo-categories.ts",
          "--report",
          "/reports/single_hop/smoke-report.json,/reports/single_hop/../single_hop/smoke-report.json",
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

  it("rejects output paths that overwrite a source report before reading summary inputs", async () => {
    await expect(
      runLocomoCategorySummary(
        [
          "bun",
          "run",
          "scripts/summarize-phase-65-locomo-categories.ts",
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

  it("rejects missing string flag values before reading summary inputs", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read reports");
      },
    };

    await expect(
      runLocomoCategorySummary(
        [
          "bun",
          "run",
          "scripts/summarize-phase-65-locomo-categories.ts",
          "--report",
          "/reports/single_hop/smoke-report.json",
          "--output-path",
          "--run-id",
          "locomo-category-summary",
        ],
        noReads,
      ),
    ).rejects.toThrow("--output-path requires a value.");

    await expect(
      runLocomoCategorySummary(
        [
          "bun",
          "run",
          "scripts/summarize-phase-65-locomo-categories.ts",
          "--report",
          "/reports/single_hop/smoke-report.json",
          "--output-path",
          "/reports/category-summary.json",
          "--run-id",
          "--unused",
        ],
        noReads,
      ),
    ).rejects.toThrow("--run-id requires a value.");
  });
});
