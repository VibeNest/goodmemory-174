import { describe, expect, it } from "bun:test";
import {
  LOCOMO_LIVE_DELTA_FILE_NAME,
  analyzeLocomoLiveDelta,
  runLocomoLiveDeltaAnalysis,
} from "../../scripts/analyze-phase-65-locomo-live-delta";
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
    retrievedTurnIds: [
      ...(input.goldEvidenceFullyRetrieved ? ["D1:1"] : []),
      ...(input.noiseTurnIds ?? []),
    ],
  };
}

function report(input: {
  cases: LocomoSmokeReport["cases"];
  maxAdditions: number;
  minRelativeScore?: number;
  runId: string;
  topK: number;
}): LocomoSmokeReport {
  return {
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: false,
    caseCount: 1,
    caseIds: ["locomo-conv-1"],
    cases: input.cases,
    categories: [],
    executionFailures: 0,
    externalRoot: "/private/tmp/LOCOMO-full",
    generatedAt: "2026-07-03T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "live-answer",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: ["open_domain"],
    questionCount: input.cases.length,
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
    expect(analysis.topUnconvertedRetrievalGains[0]).toMatchObject({
      answerTransition: "sameWrong",
      evidenceRecallDelta: 1,
      questionId: "q1",
      retrievalTransition: "zero->full",
    });
    expect(analysis.answerRegressions[0]).toMatchObject({
      answerTransition: "regressed",
      questionId: "q3",
    });
    expect(analysis.categories.open_domain?.questionCount).toBe(4);
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
});
