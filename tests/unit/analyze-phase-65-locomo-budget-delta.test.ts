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
  const cases: LocomoSmokeReport["cases"] = questionIds.map((questionId) => ({
    answerCorrect: null,
    caseId,
    category: input.category,
    evidenceRecall: input.recall,
    evidenceTurnIds: ["D1:1"],
    generatedAnswer: null,
    goldEvidenceFullyRetrieved: true,
    missingEvidenceTurnIds: [],
    noiseTurnCount: 0,
    noiseTurnIds: [],
    questionId,
    retrievedTurnIds: ["D1:1"],
  }));
  return {
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
    upstreamAnswerMetricByCategory: {},
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
          fullyRetrievedCount: 19,
          maxAdditions: 4,
          noiseTurnTotal: 696,
          questionCount: 96,
          recall: 0.2763991013,
          runId: "open-domain-top16-add4",
          topK: 16,
        }),
      },
      candidate: {
        path: "/reports/open-domain-top32-rel08/smoke-report.json",
        report: report({
          category: "open_domain",
          fullyRetrievedCount: 25,
          maxAdditions: 8,
          minRelativeScore: 0.8,
          noiseTurnTotal: 936,
          questionCount: 96,
          recall: 0.3432393791,
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
      fullyRetrievedDelta: 6,
      questionCount: 96,
    });
    expect(analysis.comparisons[0]?.averageEvidenceRecallDelta).toBeCloseTo(
      0.0668402778,
      10,
    );
    expect(
      analysis.comparisons[0]?.recallDeltaPer100AddedNoiseTurns,
    ).toBeCloseTo(0.02785011575, 10);
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
            recall: 0.6,
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
            recall: 0.6,
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
            recall: 0.6,
            runId: "open-domain-different-questions",
            topK: 32,
          }),
        },
      }),
    ).toThrow("question identity");
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
            recall: 0.3263764801,
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
            recall: 0.3767491208,
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
});
