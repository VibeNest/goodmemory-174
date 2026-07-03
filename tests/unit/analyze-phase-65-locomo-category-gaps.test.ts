import { describe, expect, it } from "bun:test";
import type { LocomoCategoryGapAnalysis } from "../../scripts/analyze-phase-65-locomo-category-gaps";
import {
  LOCOMO_CATEGORY_GAP_ANALYSIS_FILE_NAME,
  analyzeLocomoCategoryGaps,
  runLocomoCategoryGapAnalysis,
} from "../../scripts/analyze-phase-65-locomo-category-gaps";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import type { LocomoQaCategory } from "../../src/eval/locomo";

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
  return {
    answerCorrect: input.answerCorrect,
    caseId: input.caseId ?? "locomo-conv-1",
    category: input.category,
    evidenceRecall: input.evidenceRecall,
    evidenceTurnIds: ["D1:1"],
    generatedAnswer: input.generatedAnswer ?? null,
    goldEvidenceFullyRetrieved: input.goldEvidenceFullyRetrieved,
    missingEvidenceTurnIds: input.missingEvidenceTurnIds ?? [],
    noiseTurnCount: input.noiseTurnIds?.length ?? 0,
    noiseTurnIds: input.noiseTurnIds ?? [],
    questionId: input.questionId,
    retrievedTurnIds: ["D1:1", ...(input.noiseTurnIds ?? [])],
  };
}

function report(
  category: LocomoQaCategory,
  cases: LocomoSmokeReport["cases"],
): LocomoSmokeReport {
  return {
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
    questionCategories: [category],
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
    upstreamAnswerMetricByCategory: {},
    upstreamSource: "https://github.com/snap-research/locomo",
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
          path: "/reports/single_hop/smoke-report.json",
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
          ]),
        },
        {
          path: "/reports/open_domain/smoke-report.json",
          report: report("open_domain", [
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
});
