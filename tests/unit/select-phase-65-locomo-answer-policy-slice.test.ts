import { describe, expect, it } from "bun:test";
import {
  LOCOMO_ANSWER_POLICY_SLICE_FILE_NAME,
  runLocomoAnswerPolicySliceSelection,
  selectLocomoAnswerPolicySlice,
  upgradeLocomoAnswerPolicySliceReanswerJobs,
} from "../../scripts/select-phase-65-locomo-answer-policy-slice";
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
  cases: LocomoSmokeReport["cases"];
  questionCategories?: LocomoSmokeReport["questionCategories"];
  runId: string;
}): LocomoSmokeReport {
  const caseIds = [...new Set(input.cases.map((testCase) => testCase.caseId))];
  return {
    allowCommonsenseResolution: false,
    answerContextMode: "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/private/tmp/LOCOMO-full/cases.json",
    bm25Ranking: false,
    caseCount: caseIds.length,
    caseIds,
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
    questionCategories: input.questionCategories ?? null,
    questionCount: input.cases.length,
    questionIds: null,
    resume: false,
    runDirectory: `/tmp/${input.runId}`,
    runId: input.runId,
    semanticCandidateEmbeddingSource: "provider",
    semanticCandidates: {
      enabled: true,
      maxAdditions: 4,
      minRelativeScore: null,
      minSimilarity: null,
      topK: 16,
    },
    strictNoEvidenceAbstention: false,
    upstreamAnswerMetricByCategory: upstreamAnswerMetricByCategory(input.cases),
    upstreamSource: "https://github.com/snap-research/locomo",
  };
}

describe("phase-65 LoCoMo answer-policy slice selector", () => {
  it("selects reproducible risk buckets per category", () => {
    const analysis = selectLocomoAnswerPolicySlice({
      generatedAt: "2026-07-03T12:00:00.000Z",
      perBucket: 1,
      reports: [
        {
          path: "/reports/single/smoke-report.json",
          report: report({
            runId: "single-hop-live",
            cases: [
              question({
                answerCorrect: true,
                category: "single_hop",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D1:9"],
                questionId: "single-correct-low-noise",
              }),
              question({
                answerCorrect: true,
                category: "single_hop",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D1:7", "D1:8", "D1:9"],
                questionId: "single-correct-high-noise",
              }),
              question({
                answerCorrect: false,
                category: "single_hop",
                evidenceRecall: 1,
                generatedAnswer: "wrong with all evidence",
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D1:8", "D1:9"],
                questionId: "single-wrong-full-noisy",
              }),
              question({
                answerCorrect: false,
                category: "single_hop",
                evidenceRecall: 0,
                goldEvidenceFullyRetrieved: false,
                missingEvidenceTurnIds: ["D1:1"],
                noiseTurnIds: ["D1:7"],
                questionId: "single-wrong-missing",
              }),
            ],
          }),
        },
        {
          path: "/reports/temporal/smoke-report.json",
          report: report({
            runId: "temporal-live",
            cases: [
              question({
                answerCorrect: true,
                category: "temporal",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D2:7", "D2:8"],
                questionId: "temporal-correct",
              }),
              question({
                answerCorrect: false,
                category: "temporal",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D2:8"],
                questionId: "temporal-wrong-full-noisy",
              }),
              question({
                answerCorrect: false,
                category: "temporal",
                evidenceRecall: 0.5,
                goldEvidenceFullyRetrieved: false,
                missingEvidenceTurnIds: ["D2:1", "D2:2"],
                questionId: "temporal-wrong-missing",
              }),
            ],
          }),
        },
      ],
      runId: "answer-policy-slice",
    });

    expect(analysis.generatedBy).toBe(
      "scripts/select-phase-65-locomo-answer-policy-slice.ts",
    );
    expect(analysis.overall.selectedQuestionCount).toBe(6);
    expect(analysis.reanswerJobs).toEqual([
      {
        bucket: "baselineCorrectHighNoise",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-correct-high-noise"],
        sourceReportPath: "/reports/single/smoke-report.json",
        sourceRunId: "single-hop-live",
      },
      {
        bucket: "wrongFullRecallNoisy",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-wrong-full-noisy"],
        sourceReportPath: "/reports/single/smoke-report.json",
        sourceRunId: "single-hop-live",
      },
      {
        bucket: "wrongMissingEvidence",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-wrong-missing"],
        sourceReportPath: "/reports/single/smoke-report.json",
        sourceRunId: "single-hop-live",
      },
      {
        bucket: "baselineCorrectHighNoise",
        category: "temporal",
        questionCount: 1,
        questionIds: ["temporal-correct"],
        sourceReportPath: "/reports/temporal/smoke-report.json",
        sourceRunId: "temporal-live",
      },
      {
        bucket: "wrongFullRecallNoisy",
        category: "temporal",
        questionCount: 1,
        questionIds: ["temporal-wrong-full-noisy"],
        sourceReportPath: "/reports/temporal/smoke-report.json",
        sourceRunId: "temporal-live",
      },
      {
        bucket: "wrongMissingEvidence",
        category: "temporal",
        questionCount: 1,
        questionIds: ["temporal-wrong-missing"],
        sourceReportPath: "/reports/temporal/smoke-report.json",
        sourceRunId: "temporal-live",
      },
    ]);
    expect(analysis.categories.single_hop?.buckets).toMatchObject({
      baselineCorrectHighNoise: { selectedCount: 1, availableCount: 2 },
      wrongFullRecallNoisy: { selectedCount: 1, availableCount: 1 },
      wrongMissingEvidence: { selectedCount: 1, availableCount: 1 },
    });
  });

  it("rejects direct duplicate normalized report paths before selecting policy rows", () => {
    expect(() =>
      selectLocomoAnswerPolicySlice({
        reports: [
          {
            path: "/reports/category/smoke-report.json",
            report: report({
              runId: "single-hop-live",
              cases: [
                question({
                  answerCorrect: true,
                  category: "single_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  noiseTurnIds: ["D1:9"],
                  questionId: "single-q1",
                }),
              ],
            }),
          },
          {
            path: "/reports/category/../category/smoke-report.json",
            report: report({
              runId: "temporal-live",
              cases: [
                question({
                  answerCorrect: false,
                  category: "temporal",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  noiseTurnIds: ["D2:9"],
                  questionId: "temporal-q1",
                }),
              ],
            }),
          },
        ],
      }),
    ).toThrow("duplicate report path");
  });

  it("rejects duplicate question identities across reports", () => {
    const duplicate = question({
      answerCorrect: true,
      category: "single_hop",
      evidenceRecall: 1,
      goldEvidenceFullyRetrieved: true,
      questionId: "dup",
    });

    expect(() =>
      selectLocomoAnswerPolicySlice({
        reports: [
          {
            path: "/reports/a/smoke-report.json",
            report: report({ cases: [duplicate], runId: "a" }),
          },
          {
            path: "/reports/b/smoke-report.json",
            report: report({ cases: [duplicate], runId: "b" }),
          },
        ],
      }),
    ).toThrow("duplicate question locomo-conv-1::dup");
  });

  it("rejects unscored live-answer rows before selecting answer-policy queues", () => {
    const unscoredQuestion = {
      ...question({
        answerCorrect: false,
        category: "single_hop",
        evidenceRecall: 1,
        goldEvidenceFullyRetrieved: true,
        questionId: "unscored",
      }),
      answerCorrect: null,
      generatedAnswer: null,
    };

    expect(() =>
      selectLocomoAnswerPolicySlice({
        reports: [
          {
            path: "/reports/unscored/smoke-report.json",
            report: report({
              cases: [unscoredQuestion],
              runId: "unscored-live",
            }),
          },
        ],
      }),
    ).toThrow(
      "zero-failure live-answer row locomo-conv-1::unscored is missing scored answer fields",
    );
  });

  it("splits same-category reanswer jobs by source report provenance", () => {
    const analysis = selectLocomoAnswerPolicySlice({
      generatedAt: "2026-07-03T12:00:00.000Z",
      perBucket: 2,
      reports: [
        {
          path: "/reports/single-a/smoke-report.json",
          report: report({
            runId: "single-hop-live-a",
            cases: [
              question({
                answerCorrect: true,
                caseId: "locomo-conv-a",
                category: "single_hop",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D1:7", "D1:8", "D1:9"],
                questionId: "single-a-high-noise",
              }),
            ],
          }),
        },
        {
          path: "/reports/single-b/smoke-report.json",
          report: report({
            runId: "single-hop-live-b",
            cases: [
              question({
                answerCorrect: true,
                caseId: "locomo-conv-b",
                category: "single_hop",
                evidenceRecall: 1,
                goldEvidenceFullyRetrieved: true,
                noiseTurnIds: ["D2:7", "D2:8"],
                questionId: "single-b-high-noise",
              }),
            ],
          }),
        },
      ],
      runId: "same-category-slice",
    });

    expect(analysis.categories.single_hop?.questionIds).toEqual([
      "single-a-high-noise",
      "single-b-high-noise",
    ]);
    expect(analysis.reanswerJobs).toEqual([
      {
        bucket: "baselineCorrectHighNoise",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-a-high-noise"],
        sourceReportPath: "/reports/single-a/smoke-report.json",
        sourceRunId: "single-hop-live-a",
      },
      {
        bucket: "baselineCorrectHighNoise",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-b-high-noise"],
        sourceReportPath: "/reports/single-b/smoke-report.json",
        sourceRunId: "single-hop-live-b",
      },
    ]);
  });

  it("parses flags and writes a slice artifact", async () => {
    const writes = new Map<string, string>();
    const { analysis, outputPath } = await runLocomoAnswerPolicySliceSelection(
      [
        "bun",
        "run",
        "scripts/select-phase-65-locomo-answer-policy-slice.ts",
        "--report",
        "/reports/source/smoke-report.json",
        "--per-bucket",
        "1",
        "--run-id",
        "slice-run",
        "--output-path",
        "/reports/slice/answer-policy-slice.json",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-03T12:00:00.000Z"),
        readFile: async (path) => {
          if (path !== "/reports/source/smoke-report.json") {
            throw new Error(`unexpected read: ${path}`);
          }
          return JSON.stringify(
            report({
              runId: "source-run",
              cases: [
                question({
                  answerCorrect: true,
                  category: "multi_hop",
                  evidenceRecall: 1,
                  goldEvidenceFullyRetrieved: true,
                  noiseTurnIds: ["D1:9"],
                  questionId: "multi-correct",
                }),
              ],
            }),
          );
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(outputPath).toBe("/reports/slice/answer-policy-slice.json");
    expect(analysis.runId).toBe("slice-run");
    expect(writes.get(outputPath)).toContain(LOCOMO_ANSWER_POLICY_SLICE_FILE_NAME);
  });

  it("upgrades legacy answer-policy slice jobs without re-reading source reports", async () => {
    const legacy = {
      benchmark: "locomo",
      categories: {
        single_hop: {
          buckets: {
            baselineCorrectHighNoise: { availableCount: 2, selectedCount: 1 },
            wrongFullRecallNoisy: { availableCount: 1, selectedCount: 1 },
            wrongMissingEvidence: { availableCount: 1, selectedCount: 1 },
          },
          questionCount: 3,
          questionIds: ["single-correct", "single-noisy", "single-missing"],
          selectedQuestions: [
            {
              bucket: "baselineCorrectHighNoise",
              questionId: "single-correct",
            },
            {
              bucket: "wrongFullRecallNoisy",
              questionId: "single-noisy",
            },
            {
              bucket: "wrongMissingEvidence",
              questionId: "single-missing",
            },
          ],
          sourceReportPath: "/reports/single/smoke-report.json",
          sourceRunId: "single-source",
        },
      },
      claimBoundary:
        "Research diagnostic only; not a public release or benchmark claim.",
      generatedAt: "2026-07-03T00:00:00.000Z",
      generatedBy: "scripts/select-phase-65-locomo-answer-policy-slice.ts",
      outputPath: "/reports/slice/answer-policy-slice.json",
      overall: {
        categoryCount: 1,
        perBucket: 1,
        selectedQuestionCount: 3,
      },
      phase: "phase-65",
      reanswerJobs: [
        {
          category: "single_hop",
          questionCount: 3,
          questionIds: ["single-correct", "single-noisy", "single-missing"],
          sourceReportPath: "/reports/single/smoke-report.json",
          sourceRunId: "single-source",
        },
      ],
      runId: "legacy-answer-policy-slice",
      sourceReports: [
        {
          path: "/reports/single/smoke-report.json",
          questionCount: 3,
          runId: "single-source",
        },
      ],
    };

    const upgraded = upgradeLocomoAnswerPolicySliceReanswerJobs({
      generatedAt: "2026-07-06T12:00:00.000Z",
      outputPath: "/reports/slice/answer-policy-slice.json",
      slice: legacy,
    });

    expect(upgraded.generatedAt).toBe("2026-07-06T12:00:00.000Z");
    expect(upgraded.reanswerJobs).toEqual([
      {
        bucket: "baselineCorrectHighNoise",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-correct"],
        sourceReportPath: "/reports/single/smoke-report.json",
        sourceRunId: "single-source",
      },
      {
        bucket: "wrongFullRecallNoisy",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-noisy"],
        sourceReportPath: "/reports/single/smoke-report.json",
        sourceRunId: "single-source",
      },
      {
        bucket: "wrongMissingEvidence",
        category: "single_hop",
        questionCount: 1,
        questionIds: ["single-missing"],
        sourceReportPath: "/reports/single/smoke-report.json",
        sourceRunId: "single-source",
      },
    ]);
  });

  it("writes an upgraded existing answer-policy slice in place", async () => {
    const writes = new Map<string, string>();
    const { analysis, outputPath } = await runLocomoAnswerPolicySliceSelection(
      [
        "bun",
        "run",
        "scripts/select-phase-65-locomo-answer-policy-slice.ts",
        "--existing-slice",
        "/reports/slice/answer-policy-slice.json",
      ],
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-07-06T12:00:00.000Z"),
        readFile: async (path) => {
          if (path !== "/reports/slice/answer-policy-slice.json") {
            throw new Error(`unexpected read: ${path}`);
          }
          return JSON.stringify({
            benchmark: "locomo",
            categories: {
              temporal: {
                questionCount: 1,
                questionIds: ["temporal-noisy"],
                selectedQuestions: [
                  {
                    bucket: "wrongFullRecallNoisy",
                    questionId: "temporal-noisy",
                    sourceReportPath: "/reports/temporal/smoke-report.json",
                    sourceRunId: "temporal-source",
                  },
                ],
              },
            },
            generatedAt: "2026-07-03T00:00:00.000Z",
            generatedBy: "scripts/select-phase-65-locomo-answer-policy-slice.ts",
            overall: {
              categoryCount: 1,
              perBucket: 1,
              selectedQuestionCount: 1,
            },
            phase: "phase-65",
            reanswerJobs: [
              {
                category: "temporal",
                questionCount: 1,
                questionIds: ["temporal-noisy"],
                sourceReportPath: "/reports/temporal/smoke-report.json",
                sourceRunId: "temporal-source",
              },
            ],
            runId: "legacy-slice",
          });
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(outputPath).toBe("/reports/slice/answer-policy-slice.json");
    expect(analysis.reanswerJobs).toEqual([
      {
        bucket: "wrongFullRecallNoisy",
        category: "temporal",
        questionCount: 1,
        questionIds: ["temporal-noisy"],
        sourceReportPath: "/reports/temporal/smoke-report.json",
        sourceRunId: "temporal-source",
      },
    ]);
    expect(writes.get(outputPath)).toContain("\"bucket\": \"wrongFullRecallNoisy\"");
  });

  it("rejects existing-slice upgrades when source lineage is missing", () => {
    expect(() =>
      upgradeLocomoAnswerPolicySliceReanswerJobs({
        slice: {
          benchmark: "locomo",
          categories: {
            multi_hop: {
              questionCount: 1,
              questionIds: ["multi-q1"],
              selectedQuestions: [
                {
                  bucket: "wrongMissingEvidence",
                  questionId: "multi-q1",
                },
              ],
            },
          },
          phase: "phase-65",
          runId: "legacy-slice",
        },
      }),
    ).toThrow("missing sourceReportPath/sourceRunId");
  });

  it("rejects existing-slice mode combined with source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--existing-slice",
          "/reports/slice/answer-policy-slice.json",
          "--report",
          "/reports/source/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--existing-slice cannot be combined with --report.");
  });

  it("rejects non-integer per-bucket flag values", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection([
        "bun",
        "run",
        "scripts/select-phase-65-locomo-answer-policy-slice.ts",
        "--report",
        "/reports/source/smoke-report.json",
        "--per-bucket",
        "2x",
      ]),
    ).rejects.toThrow("--per-bucket must be a positive integer.");
  });

  it("rejects non-canonical per-bucket flag values before reading source reports", async () => {
    for (const value of ["1e2", "2.0"]) {
      await expect(
        runLocomoAnswerPolicySliceSelection(
          [
            "bun",
            "run",
            "scripts/select-phase-65-locomo-answer-policy-slice.ts",
            "--report",
            "/reports/source/smoke-report.json",
            "--per-bucket",
            value,
          ],
          {
            readFile: async () => {
              throw new Error("should not read reports");
            },
          },
        ),
      ).rejects.toThrow("--per-bucket must be a positive integer.");
    }
  });

  it("rejects missing per-bucket flag values before reading source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source/smoke-report.json",
          "--per-bucket",
          "--run-id",
          "slice-run",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--per-bucket requires a value.");
  });

  it("rejects empty report path entries before reading source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source-a/smoke-report.json,,/reports/source-b/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow("--report contains an empty value.");
  });

  it("rejects whitespace-padded report path entries before reading source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source-a/smoke-report.json, /reports/source-b/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--report contains whitespace-padded value /reports/source-b/smoke-report.json.",
    );
  });

  it("rejects duplicate report path entries before reading source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source-a/smoke-report.json",
          "--report",
          "/reports/source-a/../source-a/smoke-report.json",
        ],
        {
          readFile: async () => {
            throw new Error("should not read reports");
          },
        },
      ),
    ).rejects.toThrow(
      "--report contains duplicate value /reports/source-a/../source-a/smoke-report.json.",
    );
  });

  it("rejects output paths that overwrite a source report before reading source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source/smoke-report.json",
          "--output-path",
          "/reports/source/../source/smoke-report.json",
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

  it("rejects output run ids that are not single path segments before reading source reports", async () => {
    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source/smoke-report.json",
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

  it("rejects missing string flag values before reading source reports", async () => {
    const noReads = {
      readFile: async (_path: string): Promise<string> => {
        throw new Error("should not read reports");
      },
    };

    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source/smoke-report.json",
          "--output-path",
          "--run-id",
          "locomo-answer-policy-slice",
        ],
        noReads,
      ),
    ).rejects.toThrow("--output-path requires a value.");

    await expect(
      runLocomoAnswerPolicySliceSelection(
        [
          "bun",
          "run",
          "scripts/select-phase-65-locomo-answer-policy-slice.ts",
          "--report",
          "/reports/source/smoke-report.json",
          "--output-path",
          "/reports/answer-policy-slice.json",
          "--run-id",
          "--unused",
        ],
        noReads,
      ),
    ).rejects.toThrow("--run-id requires a value.");
  });
});
