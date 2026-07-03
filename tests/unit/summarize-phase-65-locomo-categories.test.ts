import { describe, expect, it } from "bun:test";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import {
  LOCOMO_CATEGORY_SUMMARY_FILE_NAME,
  runLocomoCategorySummary,
  summarizeLocomoCategoryReports,
} from "../../scripts/summarize-phase-65-locomo-categories";
import type { LocomoQaCategory } from "../../src/eval/locomo";

function categorySummary(
  category: LocomoQaCategory,
  input: {
    answerAccuracy: number;
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
        ? input.fullyRetrievedCount === input.questionCount
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
    runId?: string;
  },
): LocomoSmokeReport {
  const categories = [
    categorySummary("single_hop", {
      answerAccuracy: 0,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("multi_hop", {
      answerAccuracy: 0,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("temporal", {
      answerAccuracy: 0,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("open_domain", {
      answerAccuracy: 0,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
    categorySummary("adversarial", {
      answerAccuracy: 0,
      answeredCount: 0,
      averageEvidenceRecall: 0,
      fullyRetrievedCount: 0,
      noiseTurnTotal: 0,
      questionCount: 0,
    }),
  ];
  const index = categories.findIndex((entry) => entry.category === category);
  categories[index] = categorySummary(category, input);

  return {
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: false,
    caseCount: 10,
    caseIds: ["locomo-conv-26"],
    cases: [],
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
    upstreamAnswerMetricByCategory: {},
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
      averageEvidenceRecall: 0.25,
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
    expect(summary.overall.averageEvidenceRecall).toBeCloseTo(0.525, 10);
    expect(summary.overall.fullyRetrievedCount).toBe(12);
    expect(summary.overall.fullyRetrievedShare).toBe(0.6);
    expect(summary.overall.noiseTurnTotal).toBe(18);
    expect(summary.categories.multi_hop.answerCorrectCount).toBe(5);
    expect(summary.categories.open_domain.reportPath).toBe(
      "/reports/open_domain/smoke-report.json",
    );
    expect(summary.claimBoundary).toContain("Research hardening artifact");
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
});
