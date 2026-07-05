import { describe, expect, it } from "bun:test";
import {
  LOCOMO_CANDIDATE_ADMISSION_SLICE_FILE_NAME,
  runLocomoCandidateAdmissionSliceSelection,
  selectLocomoCandidateAdmissionSlice,
} from "../../scripts/select-phase-65-locomo-candidate-admission-slice";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";
import { deriveLocomoMatchMode } from "../../src/eval/locomo";
import type { LocomoQaCategory } from "../../src/eval/locomo";

function question(input: {
  answerCorrect?: boolean | null;
  caseId?: string;
  category: LocomoQaCategory;
  evidenceRecall: number;
  evidenceTurnIds?: string[];
  generatedAnswer?: string;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnIds?: string[];
  noiseTurnIds?: string[];
  questionId: string;
  retrievedTurnIds?: string[];
}): LocomoSmokeReport["cases"][number] {
  const evidenceTurnIds = input.evidenceTurnIds ?? ["D1:1"];
  const retrievedTurnIds =
    input.retrievedTurnIds ??
    [
      ...(input.goldEvidenceFullyRetrieved ? evidenceTurnIds : []),
      ...(input.noiseTurnIds ?? []),
    ];
  const missingEvidenceTurnIds =
    input.missingEvidenceTurnIds ??
    evidenceTurnIds.filter((turnId) => !retrievedTurnIds.includes(turnId));
  const answerCorrect = input.answerCorrect ?? false;
  return {
    answerCorrect,
    caseId: input.caseId ?? "locomo-conv-1",
    category: input.category,
    evidenceRecall: input.evidenceRecall,
    evidenceTurnIds,
    generatedAnswer:
      input.generatedAnswer ??
      (answerCorrect === null ? null : answerCorrect ? "correct" : "incorrect"),
    goldEvidenceFullyRetrieved: input.goldEvidenceFullyRetrieved,
    missingEvidenceTurnIds,
    noiseTurnCount: input.noiseTurnIds?.length ?? 0,
    noiseTurnIds: input.noiseTurnIds ?? [],
    questionId: input.questionId,
    retrievedTurnIds,
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
  bm25Ranking?: boolean;
  cases: LocomoSmokeReport["cases"];
  maxAdditions: number;
  minRelativeScore?: number;
  questionCategories?: LocomoSmokeReport["questionCategories"];
  runId: string;
  topK: number;
}): LocomoSmokeReport {
  return {
    allowCommonsenseResolution: false,
    answerContextMode: "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: input.bm25Ranking ?? false,
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
    questionCategories: input.questionCategories ?? ["open_domain"],
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
    strictNoEvidenceAbstention: false,
    upstreamAnswerMetricByCategory: upstreamAnswerMetricByCategory(input.cases),
    upstreamSource: "https://github.com/snap-research/locomo",
  };
}

describe("phase-65 LoCoMo candidate-admission selector", () => {
  it("selects targeted retrieval-gain, still-missing, and noisy full-recall rows", () => {
    const baseline = report({
      maxAdditions: 4,
      runId: "baseline-top16-add4",
      topK: 16,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          evidenceTurnIds: ["D1:1"],
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q-full-gain",
          retrievedTurnIds: [],
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0.25,
          evidenceTurnIds: ["D1:2", "D2:2", "D3:2", "D4:2"],
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D2:2", "D3:2", "D4:2"],
          questionId: "q-partial",
          retrievedTurnIds: ["D1:2"],
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          evidenceTurnIds: ["D1:3", "D2:3"],
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:3", "D2:3"],
          questionId: "q-stubborn",
          retrievedTurnIds: [],
        }),
        question({
          answerCorrect: true,
          category: "open_domain",
          evidenceRecall: 1,
          evidenceTurnIds: ["D1:4"],
          goldEvidenceFullyRetrieved: true,
          questionId: "q-noisy",
          retrievedTurnIds: ["D1:4"],
        }),
      ],
    });
    const candidate = report({
      maxAdditions: 8,
      minRelativeScore: 0.8,
      runId: "candidate-top32-add8-rel08",
      topK: 32,
      cases: [
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          evidenceTurnIds: ["D1:1"],
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D1:9"],
          questionId: "q-full-gain",
          retrievedTurnIds: ["D1:1", "D1:9"],
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0.75,
          evidenceTurnIds: ["D1:2", "D2:2", "D3:2", "D4:2"],
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D4:2"],
          noiseTurnIds: ["D5:2"],
          questionId: "q-partial",
          retrievedTurnIds: ["D1:2", "D2:2", "D3:2", "D5:2"],
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 0,
          evidenceTurnIds: ["D1:3", "D2:3"],
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:3", "D2:3"],
          questionId: "q-stubborn",
          retrievedTurnIds: [],
        }),
        question({
          answerCorrect: false,
          category: "open_domain",
          evidenceRecall: 1,
          evidenceTurnIds: ["D1:4"],
          goldEvidenceFullyRetrieved: true,
          noiseTurnIds: ["D1:7", "D1:8", "D1:9"],
          questionId: "q-noisy",
          retrievedTurnIds: ["D1:4", "D1:7", "D1:8", "D1:9"],
        }),
      ],
    });

    const analysis = selectLocomoCandidateAdmissionSlice({
      baseline: { path: "/reports/baseline.json", report: baseline },
      candidate: { path: "/reports/candidate.json", report: candidate },
      generatedAt: "2026-07-03T00:00:00.000Z",
      perBucket: 1,
      runId: "locomo-candidate-admission-slice",
    });

    expect(analysis.generatedBy).toBe(
      "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
    );
    expect(analysis.claimBoundary).toContain("Research diagnostic");
    expect(analysis.overall.selectedQuestionCount).toBe(4);
    expect(analysis.overall.bucketCounts).toMatchObject({
      candidateFullRetrievalGain: { availableCount: 1, selectedCount: 1 },
      noisyFullRecallWrong: { availableCount: 2, selectedCount: 1 },
      partialRetrievalGainStillMissing: { availableCount: 1, selectedCount: 1 },
      stubbornMissingEvidence: { availableCount: 1, selectedCount: 1 },
    });
    expect(analysis.sourceReports).toEqual([
      {
        path: "/reports/candidate.json",
        questionCount: 4,
        runId: "candidate-top32-add8-rel08",
      },
    ]);
    expect(analysis.repairJobs).toEqual([
      {
        category: "open_domain",
        questionCount: 4,
        questionIds: ["q-full-gain", "q-partial", "q-stubborn", "q-noisy"],
      },
    ]);
    expect(analysis.reanswerJobs).toEqual([
      {
        bucket: "noisyFullRecallWrong",
        category: "open_domain",
        questionCount: 2,
        questionIds: ["q-full-gain", "q-noisy"],
        sourceReportPath: "/reports/candidate.json",
        sourceRunId: "candidate-top32-add8-rel08",
      },
    ]);
    const selected = analysis.categories.open_domain?.selectedQuestions ?? [];
    expect(selected.map((question) => [question.bucket, question.questionId]))
      .toEqual([
        ["candidateFullRetrievalGain", "q-full-gain"],
        ["partialRetrievalGainStillMissing", "q-partial"],
        ["stubbornMissingEvidence", "q-stubborn"],
        ["noisyFullRecallWrong", "q-noisy"],
      ]);
    expect(selected[0]).toMatchObject({
      answerTransition: "sameWrong",
      evidenceRecallDelta: 1,
      newlyIntroducedNoiseTurnIds: ["D1:9"],
      newlyRetrievedEvidenceTurnIds: ["D1:1"],
      noiseTurnDelta: 1,
    });
    expect(selected[1]).toMatchObject({
      candidate: { missingEvidenceTurnCount: 1 },
      newlyRetrievedEvidenceTurnIds: ["D2:2", "D3:2"],
    });
    expect(selected[3]).toMatchObject({
      answerTransition: "regressed",
      bucket: "noisyFullRecallWrong",
      noiseTurnDelta: 3,
    });
  });

  it("rejects incompatible reports and question identity mismatches", () => {
    const baseline = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          questionId: "q1",
        }),
      ],
      maxAdditions: 4,
      runId: "baseline",
      topK: 16,
    });
    const candidate = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
        }),
      ],
      maxAdditions: 8,
      runId: "candidate",
      topK: 32,
    });

    expect(() =>
      selectLocomoCandidateAdmissionSlice({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/incompatible.json",
          report: { ...candidate, bm25Ranking: true },
        },
      }),
    ).toThrow("bm25Ranking");

    expect(() =>
      selectLocomoCandidateAdmissionSlice({
        baseline: { path: "/reports/baseline.json", report: baseline },
        candidate: {
          path: "/reports/missing.json",
          report: {
            ...candidate,
            cases: [
              question({
                category: "open_domain",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                questionId: "q2",
              }),
            ],
          },
        },
      }),
    ).toThrow("missing question");
  });

  it("rejects direct self-comparison report inputs with path-equivalent lineage", () => {
    const baseline = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          questionId: "q1",
          retrievedTurnIds: [],
        }),
      ],
      maxAdditions: 4,
      runId: "baseline",
      topK: 16,
    });
    const candidate = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
          retrievedTurnIds: ["D1:1"],
        }),
      ],
      maxAdditions: 8,
      runId: "candidate",
      topK: 32,
    });

    expect(() =>
      selectLocomoCandidateAdmissionSlice({
        baseline: {
          path: "/reports/open-domain/smoke-report.json",
          report: baseline,
        },
        candidate: {
          path: "/reports/open-domain/../open-domain/smoke-report.json",
          report: candidate,
        },
        perBucket: 1,
      }),
    ).toThrow("baseline and candidate reports must refer to different paths");
  });

  it("rejects candidate-admission comparisons that reuse the same run id", () => {
    const baseline = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q1",
          retrievedTurnIds: [],
        }),
      ],
      maxAdditions: 4,
      runId: "shared-candidate-admission-run",
      topK: 16,
    });
    const candidate = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
          retrievedTurnIds: ["D1:1"],
        }),
      ],
      maxAdditions: 8,
      runId: "shared-candidate-admission-run",
      topK: 32,
    });

    expect(() =>
      selectLocomoCandidateAdmissionSlice({
        baseline: {
          path: "/reports/baseline/smoke-report.json",
          report: baseline,
        },
        candidate: {
          path: "/reports/candidate/smoke-report.json",
          report: candidate,
        },
        perBucket: 1,
      }),
    ).toThrow("baseline and candidate reports must use different runIds");
  });

  it("parses report flags and writes a candidate-admission artifact", async () => {
    const baselinePath = "/reports/baseline/smoke-report.json";
    const candidatePath = "/reports/candidate/smoke-report.json";
    const baseline = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 0,
          goldEvidenceFullyRetrieved: false,
          missingEvidenceTurnIds: ["D1:1"],
          questionId: "q1",
          retrievedTurnIds: [],
        }),
      ],
      maxAdditions: 4,
      runId: "baseline",
      topK: 16,
    });
    const candidate = report({
      cases: [
        question({
          category: "open_domain",
          evidenceRecall: 1,
          goldEvidenceFullyRetrieved: true,
          questionId: "q1",
          retrievedTurnIds: ["D1:1"],
        }),
      ],
      maxAdditions: 8,
      runId: "candidate",
      topK: 32,
    });
    const reads = new Map([
      [baselinePath, JSON.stringify(baseline)],
      [candidatePath, JSON.stringify(candidate)],
    ]);
    const writes: Array<{ contents: string; path: string }> = [];

    const { analysis, outputPath } =
      await runLocomoCandidateAdmissionSliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
          "--baseline-report",
          baselinePath,
          "--candidate-report",
          candidatePath,
          "--per-bucket",
          "2",
          "--run-id",
          "locomo-candidate-admission-slice",
          "--output-path",
          "/reports/candidate-admission-slice.json",
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

    expect(outputPath).toBe("/reports/candidate-admission-slice.json");
    expect(outputPath.endsWith(LOCOMO_CANDIDATE_ADMISSION_SLICE_FILE_NAME)).toBe(
      true,
    );
    expect(analysis.outputPath).toBe(outputPath);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.contents ?? "{}")).toMatchObject({
      overall: { perBucket: 2, selectedQuestionCount: 1 },
      repairJobs: [{ category: "open_domain", questionCount: 1 }],
      reanswerJobs: [],
      runId: "locomo-candidate-admission-slice",
    });
  });

  it("rejects non-integer per-bucket flag values", async () => {
    await expect(
      runLocomoCandidateAdmissionSliceSelection([
        "bun",
        "run",
        "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
        "--baseline-report",
        "/reports/baseline.json",
        "--candidate-report",
        "/reports/candidate.json",
        "--per-bucket",
        "2x",
      ]),
    ).rejects.toThrow("--per-bucket must be a positive integer.");
  });

  it("rejects missing per-bucket flag values before reading reports", async () => {
    await expect(
      runLocomoCandidateAdmissionSliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
          "--baseline-report",
          "/reports/baseline.json",
          "--candidate-report",
          "/reports/candidate.json",
          "--per-bucket",
          "--run-id",
          "locomo-candidate-admission-slice",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--per-bucket requires a value.");
  });

  it("rejects path-equivalent baseline and candidate reports before reading inputs", async () => {
    await expect(
      runLocomoCandidateAdmissionSliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
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
      runLocomoCandidateAdmissionSliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
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

  it("rejects missing string flag values before reading reports", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read reports");
      },
    };

    await expect(
      runLocomoCandidateAdmissionSliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
          "--baseline-report",
          "--candidate-report",
          "/reports/candidate.json",
        ],
        noReads,
      ),
    ).rejects.toThrow("--baseline-report requires a value.");

    await expect(
      runLocomoCandidateAdmissionSliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-candidate-admission-slice.ts",
          "--baseline-report",
          "/reports/baseline.json",
          "--candidate-report",
          "/reports/candidate.json",
          "--output-path",
          "--run-id",
          "locomo-candidate-admission-slice",
        ],
        noReads,
      ),
    ).rejects.toThrow("--output-path requires a value.");
  });
});
