import { describe, expect, it } from "bun:test";
import {
  analyzeLocomoRetrievalGap,
  runLocomoRetrievalGapAnalysis,
} from "../../scripts/analyze-phase-65-locomo-retrieval-gap";

const cases = [
  {
    caseId: "c1",
    turns: [
      { diaId: "D1:1", speaker: "Anna", content: "Anna visits the downtown clinic weekly" },
      { diaId: "D1:2", speaker: "Anna", content: "yesterday felt really tiring honestly" },
      { diaId: "D2:1", speaker: "Bob", content: "the dog Max loves long walks" },
      { diaId: "D2:2", speaker: "Bob", content: "the weather outside is nice" },
    ],
    questions: [
      { questionId: "q1", question: "which clinic does Anna attend" },
      { questionId: "q2", question: "what is the dog Max" },
      { questionId: "q3", question: "when is the weather nice" },
    ],
  },
];

function report() {
  return {
    runId: "test-run",
    cases: [
      {
        // gold turn (D1:2) shares no words with the question, but its neighbor
        // D1:1 does -> zero retrieval + neighbor-beats-gold.
        answerCorrect: false,
        caseId: "c1",
        category: "single_hop",
        evidenceRecall: 0,
        evidenceTurnIds: ["D1:2"],
        goldEvidenceFullyRetrieved: false,
        missingEvidenceTurnIds: ["D1:2"],
        noiseTurnIds: [],
        questionId: "q1",
        retrievedTurnIds: [],
      },
      {
        answerCorrect: true,
        caseId: "c1",
        category: "single_hop",
        evidenceRecall: 1,
        evidenceTurnIds: ["D2:1"],
        goldEvidenceFullyRetrieved: true,
        missingEvidenceTurnIds: [],
        noiseTurnIds: [],
        questionId: "q2",
        retrievedTurnIds: ["D2:1"],
      },
      {
        // partial recall but the answer is still wrong.
        answerCorrect: false,
        caseId: "c1",
        category: "temporal",
        evidenceRecall: 0.5,
        evidenceTurnIds: ["D2:2", "D2:1"],
        goldEvidenceFullyRetrieved: false,
        missingEvidenceTurnIds: ["D2:1"],
        noiseTurnIds: [],
        questionId: "q3",
        retrievedTurnIds: ["D2:2"],
      },
    ],
  };
}

describe("LoCoMo retrieval-gap analyzer", () => {
  it("splits retrieval into zero / partial / full and tracks recall-positive wrong answers", () => {
    const analysis = analyzeLocomoRetrievalGap({ cases, report: report() }) as {
      overall: {
        answerVsRecall: { recallPositiveAnswerWrong: number };
        neighborLift: { neighborBeatsGoldShare: number };
        retrieval: {
          fullRetrievalShare: number;
          partialRetrievalShare: number;
          zeroRetrievalShare: number;
        };
        total: number;
      };
    };
    expect(analysis.overall.total).toBe(3);
    expect(analysis.overall.retrieval.zeroRetrievalShare).toBeCloseTo(1 / 3, 4);
    expect(analysis.overall.retrieval.partialRetrievalShare).toBeCloseTo(1 / 3, 4);
    expect(analysis.overall.retrieval.fullRetrievalShare).toBeCloseTo(1 / 3, 4);
    // q3 retrieved some gold but answered wrong.
    expect(analysis.overall.answerVsRecall.recallPositiveAnswerWrong).toBe(1);
    // q1's gold turn shares no question words, but neighbor D1:1 ("clinic") does.
    expect(analysis.overall.neighborLift.neighborBeatsGoldShare).toBeGreaterThan(0);
  });

  it("shows retrieved gold turns out-overlap missed gold turns (lexical-driven recall)", () => {
    const analysis = analyzeLocomoRetrievalGap({ cases, report: report() }) as {
      overall: {
        retrievedVsMissedOverlap: {
          meanMissedGoldOverlap: number;
          meanRetrievedGoldOverlap: number;
        };
      };
    };
    const o = analysis.overall.retrievedVsMissedOverlap;
    expect(o.meanRetrievedGoldOverlap).toBeGreaterThan(o.meanMissedGoldOverlap);
  });

  it("rejects reports that cannot be joined to the cases root", () => {
    expect(() =>
      analyzeLocomoRetrievalGap({
        cases: [],
        report: report(),
      }),
    ).toThrow("references case c1 that is not present");

    expect(() =>
      analyzeLocomoRetrievalGap({
        cases: [
          {
            ...cases[0]!,
            questions: cases[0]!.questions.slice(1),
          },
        ],
        report: report(),
      }),
    ).toThrow("Report question c1:q1 is not present");

    expect(() =>
      analyzeLocomoRetrievalGap({
        cases: [
          {
            ...cases[0]!,
            turns: cases[0]!.turns.filter((turn) => turn.diaId !== "D1:2"),
          },
        ],
        report: report(),
      }),
    ).toThrow("references evidence turn D1:2");
  });

  it("rejects smoke reports whose questionCount does not match cases length", async () => {
    const reportJson = {
      benchmark: "locomo",
      answerContextMode: "raw-turns",
      answerEvaluation: "deferred-to-live-mode",
      benchmarkSource: "/tmp/LOCOMO/cases.json",
      bm25Ranking: false,
      caseCount: 1,
      caseIds: ["c1"],
      cases: report().cases.slice(0, 1),
      categories: [],
      executionFailures: 0,
      externalRoot: "/tmp/LOCOMO",
      generatedAt: "2026-07-03T00:00:00.000Z",
      generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
      ingestMode: "raw-turns",
      license: "CC BY-NC 4.0",
      mode: "retrieval-only",
      phase: "phase-65",
      profilesCompared: ["goodmemory-rules-only"],
      questionCategories: null,
      questionCount: 2,
      resume: false,
      runDirectory: "/reports/truncated",
      runId: "truncated-smoke",
      semanticCandidateEmbeddingSource: "none",
      semanticCandidates: {
        enabled: false,
        maxAdditions: null,
        minRelativeScore: null,
        minSimilarity: null,
        topK: null,
      },
      upstreamAnswerMetricByCategory: {
        single_hop: "f1_token_overlap",
      },
      upstreamSource: "https://github.com/snap-research/locomo",
    };
    const reads = new Map([
      ["/reports/truncated/smoke-report.json", JSON.stringify(reportJson)],
      ["/tmp/LOCOMO/cases.json", JSON.stringify({ cases })],
    ]);

    await expect(
      runLocomoRetrievalGapAnalysis(
        [
          "bun",
          "run",
          "analyze:phase-65-locomo-retrieval-gap",
          "--report",
          "/reports/truncated/smoke-report.json",
          "--cases",
          "/tmp/LOCOMO/cases.json",
        ],
        {
          readFile: async (path: string) => {
            const value = reads.get(path);
            if (value === undefined) {
              throw new Error(`Unexpected read: ${path}`);
            }
            return value;
          },
        },
      ),
    ).rejects.toThrow("questionCount 2 does not match cases length 1");
  });

  it("rejects missing path flag values before reading inputs", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read inputs");
      },
    };

    await expect(
      runLocomoRetrievalGapAnalysis(
        [
          "bun",
          "run",
          "analyze:phase-65-locomo-retrieval-gap",
          "--report",
          "--cases",
          "/tmp/LOCOMO/cases.json",
        ],
        noReads,
      ),
    ).rejects.toThrow("--report requires a value.");

    await expect(
      runLocomoRetrievalGapAnalysis(
        [
          "bun",
          "run",
          "analyze:phase-65-locomo-retrieval-gap",
          "--report",
          "/reports/smoke-report.json",
          "--cases",
          "/tmp/LOCOMO/cases.json",
          "--output-path",
          "--unused",
        ],
        noReads,
      ),
    ).rejects.toThrow("--output-path requires a value.");
  });

  it("rejects output paths that overwrite the source report before reading inputs", async () => {
    await expect(
      runLocomoRetrievalGapAnalysis(
        [
          "bun",
          "run",
          "analyze:phase-65-locomo-retrieval-gap",
          "--report",
          "/reports/source/smoke-report.json",
          "--cases",
          "/tmp/LOCOMO/cases.json",
          "--output-path",
          "/reports/source/../source/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read inputs");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --report must refer to different paths",
    );
  });

  it("rejects output paths that overwrite the cases source before reading inputs", async () => {
    await expect(
      runLocomoRetrievalGapAnalysis(
        [
          "bun",
          "run",
          "analyze:phase-65-locomo-retrieval-gap",
          "--report",
          "/reports/source/smoke-report.json",
          "--cases",
          "/tmp/LOCOMO/cases.json",
          "--output-path",
          "/tmp/LOCOMO/../LOCOMO/cases.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read inputs");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --cases must refer to different paths",
    );
  });
});
