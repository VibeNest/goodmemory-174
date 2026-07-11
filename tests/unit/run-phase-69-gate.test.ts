import { describe, expect, it } from "bun:test";

import {
  assertPhase69OutputPathIsDistinct,
  evaluatePhase69Gate,
  readLongMemEvalPhase69GateReport,
  readLocomoPhase69GateReport,
  type Phase69GateInput,
} from "../../scripts/run-phase-69-gate";

const generalizedFusionConfig = {
  maxCandidates: 8,
  maxTotalFacts: 10,
  minRelativeStrength: 0.35,
  rrfK: 60,
};
const locomoBenchmarkFingerprint =
  "d134ede9c6e3371ca31f6b9769e3ceeeaebaacaebbc1a4d3548220e9887abc66";
const longMemEvalBenchmarkFingerprint =
  "195fa256c468ff68079f5a05de2572deb47fa2c06b5d48e1d3ad4f3e044a5203";

function longMemEvalRunConfiguration(candidate: boolean) {
  return {
    contextMaxTokens: 4000,
    extractionStrategy: "rules-only" as const,
    generalizedFusion: candidate ? generalizedFusionConfig : null,
    projection: {
      bulkBackfill: true,
      writeThrough: false,
    },
    providerEmbedding: false,
    recallStrategy: candidate ? "hybrid" as const : "rules-only" as const,
  };
}

function input(overrides: {
  locomoTargetDelta?: number;
  locomoProtectionDelta?: number;
  longMemTargetDelta?: number;
  longMemProtectionDelta?: number;
} = {}): Phase69GateInput {
  const locomoTargetDelta = overrides.locomoTargetDelta ?? 0.04;
  const locomoProtectionDelta = overrides.locomoProtectionDelta ?? -0.005;
  const longMemTargetDelta = overrides.longMemTargetDelta ?? 0.035;
  const longMemProtectionDelta = overrides.longMemProtectionDelta ?? -0.005;
  const locomoBaselineCategories = {
    adversarial: { count: 446, noisePerQuestion: 2, recall: 0.6 },
    multi_hop: { count: 282, noisePerQuestion: 2, recall: 0.4 },
    open_domain: { count: 96, noisePerQuestion: 2, recall: 0.5 },
    single_hop: { count: 841, noisePerQuestion: 2, recall: 0.7 },
    temporal: { count: 321, noisePerQuestion: 2, recall: 0.8 },
  };
  const longMemBaselineTypes = {
    "knowledge-update": { count: 78, recall: 0.8 },
    "multi-session": { count: 133, recall: 0.9 },
    "single-session-assistant": { count: 56, recall: 0.92 },
    "single-session-preference": { count: 30, recall: 0.93 },
    "single-session-user": { count: 70, recall: 0.95 },
    "temporal-reasoning": { count: 133, recall: 0.75 },
  };
  const locomoCaseIds = Array.from({ length: 10 }, (_, index) => `case-${index}`);
  const locomoQuestionIds = Array.from(
    { length: 1986 },
    (_, index) => `case-${Math.floor(index / 199)}:q${index}`,
  );
  const longMemQuestionIds = Array.from(
    { length: 500 },
    (_, index) => `longmem-${index}`,
  );

  return {
    locomoBaseline: {
      benchmark: "locomo",
      benchmarkFingerprint: locomoBenchmarkFingerprint,
      benchmarkSource: "/tmp/locomo/cases.json",
      caseIds: locomoCaseIds,
      executionFailures: 0,
      generalizedFusion: false,
      generalizedFusionConfig: null,
      labelFreeIngest: true,
      questionIds: locomoQuestionIds,
      retrievalConfig: {
        bm25Ranking: false,
        corefNormalize: false,
        decompose: false,
        generalizedFusion: false,
        labelFreeIngest: true,
        multiHop: false,
        providerEmbedding: false,
        rerank: false,
        smartFusion: false,
      },
      categories: Object.entries(locomoBaselineCategories).map(
        ([category, value]) => ({
          averageEvidenceRecall: value.recall,
          category,
          noiseTurnTotal: value.count * value.noisePerQuestion,
          questionCount: value.count,
        }),
      ),
    },
    locomoCandidate: {
      benchmark: "locomo",
      benchmarkFingerprint: locomoBenchmarkFingerprint,
      benchmarkSource: "/tmp/locomo/cases.json",
      caseIds: locomoCaseIds,
      executionFailures: 0,
      generalizedFusion: true,
      generalizedFusionConfig,
      labelFreeIngest: true,
      questionIds: locomoQuestionIds,
      retrievalConfig: {
        bm25Ranking: false,
        corefNormalize: false,
        decompose: false,
        generalizedFusion: true,
        labelFreeIngest: true,
        multiHop: false,
        providerEmbedding: false,
        rerank: false,
        smartFusion: false,
      },
      categories: Object.entries(locomoBaselineCategories).map(
        ([category, value]) => ({
          averageEvidenceRecall:
            value.recall +
            (category === "multi_hop" || category === "open_domain"
              ? locomoTargetDelta
              : locomoProtectionDelta),
          category,
          noiseTurnTotal: value.count * (value.noisePerQuestion + 1),
          questionCount: value.count,
        }),
      ),
    },
    longMemEvalBaseline: {
      benchmarkRoot: "/tmp/longmemeval",
      benchmarkFingerprint: longMemEvalBenchmarkFingerprint,
      executionFailures: 0,
      ingestMode: "label-free-raw",
      profile: "goodmemory-rules-only",
      questionIds: longMemQuestionIds,
      runConfiguration: longMemEvalRunConfiguration(false),
      byQuestionType: Object.fromEntries(
        Object.entries(longMemBaselineTypes).map(([questionType, value]) => [
          questionType,
          {
            evidenceCaseCount: value.count,
            evidenceSessionRecall: value.recall,
            wrongSessionTotal: value.count * 2,
          },
        ]),
      ),
    },
    longMemEvalCandidate: {
      benchmarkRoot: "/tmp/longmemeval",
      benchmarkFingerprint: longMemEvalBenchmarkFingerprint,
      executionFailures: 0,
      ingestMode: "label-free-raw",
      profile: "goodmemory-recommended",
      questionIds: longMemQuestionIds,
      runConfiguration: longMemEvalRunConfiguration(true),
      byQuestionType: Object.fromEntries(
        Object.entries(longMemBaselineTypes).map(([questionType, value]) => [
          questionType,
          {
            evidenceCaseCount: value.count,
            evidenceSessionRecall:
              value.recall +
              (questionType === "knowledge-update" ||
              questionType === "temporal-reasoning"
                ? longMemTargetDelta
                : longMemProtectionDelta),
            wrongSessionTotal: value.count * 3,
          },
        ]),
      ),
    },
  };
}

describe("Phase 69 generalized retrieval gate", () => {
  it("rejects an output path that aliases an input report", () => {
    expect(() =>
      assertPhase69OutputPathIsDistinct({
        inputPaths: ["/tmp/phase-69/baseline.json"],
        outputPath: "/tmp/phase-69/nested/../baseline.json",
      }),
    ).toThrow("must differ from every input report path");
  });

  it("passes only when every target and protection slice clears its threshold", () => {
    const result = evaluatePhase69Gate(input());

    expect(result.status).toBe("passed");
    expect(result.failures).toEqual([]);
    expect(result.targets.every((slice) => slice.passed)).toBe(true);
    expect(result.protections.every((slice) => slice.passed)).toBe(true);
  });

  it("fails when even one target improves by less than three points", () => {
    const result = evaluatePhase69Gate(input({ locomoTargetDelta: 0.029 }));

    expect(result.status).toBe("failed");
    expect(result.failures).toContain(
      "LoCoMo multi_hop delta 0.029000 is below 0.030000",
    );
    expect(result.failures).toContain(
      "LoCoMo open_domain delta 0.029000 is below 0.030000",
    );
  });

  it("fails when a protection slice regresses by more than one point", () => {
    const result = evaluatePhase69Gate(
      input({ longMemProtectionDelta: -0.011 }),
    );

    expect(result.status).toBe("failed");
    expect(result.failures.some((failure) => failure.includes("multi-session"))).toBe(
      true,
    );
  });

  it("rejects mismatched populations, execution failures, and wrong profiles", () => {
    const value = input();
    value.locomoCandidate.questionIds = [
      "different-question",
      ...value.locomoCandidate.questionIds.slice(1),
    ];
    value.longMemEvalCandidate.executionFailures = 1;
    value.longMemEvalCandidate.profile = "goodmemory-hybrid";

    const result = evaluatePhase69Gate(value);

    expect(result.status).toBe("failed");
    expect(result.failures).toContain("LoCoMo question populations differ");
    expect(result.failures).toContain(
      "LongMemEval candidate executionFailures must be 0, received 1",
    );
    expect(result.failures).toContain(
      "LongMemEval candidate profile must be goodmemory-recommended",
    );
  });

  it("rejects matching but incomplete benchmark populations", () => {
    const value = input();
    value.locomoBaseline.caseIds = value.locomoBaseline.caseIds.slice(0, 9);
    value.locomoCandidate.caseIds = value.locomoCandidate.caseIds.slice(0, 9);
    value.locomoBaseline.questionIds = value.locomoBaseline.questionIds.slice(0, 100);
    value.locomoCandidate.questionIds = value.locomoCandidate.questionIds.slice(0, 100);
    value.longMemEvalBaseline.questionIds =
      value.longMemEvalBaseline.questionIds.slice(0, 100);
    value.longMemEvalCandidate.questionIds =
      value.longMemEvalCandidate.questionIds.slice(0, 100);

    const result = evaluatePhase69Gate(value);

    expect(result.status).toBe("failed");
    expect(result.failures).toContain(
      "LoCoMo case population must contain 10 cases, received 9",
    );
    expect(result.failures).toContain(
      "LoCoMo question population must contain 1986 questions, received 100",
    );
    expect(result.failures).toContain(
      "LongMemEval question population must contain 500 questions, received 100",
    );
  });

  it("rejects configuration drift, source drift, and excessive noise", () => {
    const value = input();
    value.locomoCandidate.benchmarkFingerprint = "c".repeat(64);
    value.locomoCandidate.retrievalConfig.rerank = true;
    value.locomoBaseline.retrievalConfig.unexpected = false;
    const noisy = value.locomoCandidate.categories.find(
      (category) => category.category === "open_domain",
    )!;
    const baseline = value.locomoBaseline.categories.find(
      (category) => category.category === "open_domain",
    )!;
    noisy.noiseTurnTotal = baseline.noiseTurnTotal + noisy.questionCount * 9;
    value.longMemEvalCandidate.byQuestionType["knowledge-update"]!
      .wrongSessionTotal = 78 * 6;

    const result = evaluatePhase69Gate(value);

    expect(result.status).toBe("failed");
    expect(result.failures).toContain("LoCoMo benchmark fingerprints differ");
    expect(result.failures).toContain(
      "LoCoMo candidate retrievalConfig.rerank must be false",
    );
    expect(result.failures).toContain(
      "LoCoMo baseline retrievalConfig keys must exactly match the Phase 69 contract",
    );
    expect(
      result.failures.some((failure) =>
        failure.includes("open_domain:noise-per-question"),
      ),
    ).toBe(true);
    expect(
      result.failures.some((failure) =>
        failure.includes("knowledge-update:wrong-sessions-per-question"),
      ),
    ).toBe(true);
  });

  it("rejects matching populations whose dataset fingerprints are not pinned", () => {
    const value = input();
    value.locomoBaseline.benchmarkFingerprint = "c".repeat(64);
    value.locomoCandidate.benchmarkFingerprint = "c".repeat(64);
    value.longMemEvalBaseline.benchmarkFingerprint = "d".repeat(64);
    value.longMemEvalCandidate.benchmarkFingerprint = "d".repeat(64);

    const result = evaluatePhase69Gate(value);

    expect(result.status).toBe("failed");
    expect(result.failures).toContain(
      "LoCoMo benchmark fingerprint is not the pinned Phase 69 dataset",
    );
    expect(result.failures).toContain(
      "LongMemEval benchmark fingerprint is not the pinned Phase 69 dataset",
    );
  });

  it("rejects report summaries that disagree with their question rows", () => {
    const value = input();
    const locomoCases = value.locomoBaseline.categories.flatMap((category) =>
      Array.from({ length: category.questionCount }, (_, index) => ({
        caseId: `case-${index % 10}`,
        category: category.category,
        evidenceRecall: category.averageEvidenceRecall,
        noiseTurnCount: category.noiseTurnTotal / category.questionCount,
        questionId: `${category.category}-${index}`,
      })),
    );
    const tamperedLocomoCategories = value.locomoBaseline.categories.map(
      (category, index) =>
        index === 0 ? { ...category, averageEvidenceRecall: 0.99 } : category,
    );

    expect(() =>
      readLocomoPhase69GateReport({
        ...value.locomoBaseline,
        cases: locomoCases,
        categories: tamperedLocomoCategories,
      }),
    ).toThrow("category summary does not match cases");

    const longMemCases = Object.entries(
      value.longMemEvalBaseline.byQuestionType,
    ).flatMap(([questionType, summary]) =>
      Array.from({ length: summary.evidenceCaseCount }, (_, index) => ({
        evidenceSessionRecall: summary.evidenceSessionRecall,
        questionId: `${questionType}-${index}`,
        questionType,
        wrongRecallSessionIds: Array.from(
          {
            length:
              summary.wrongSessionTotal / summary.evidenceCaseCount,
          },
          (_, wrongIndex) => `wrong-${wrongIndex}`,
        ),
      })),
    );
    const tamperedLongMemSummary = {
      byQuestionType: {
        ...value.longMemEvalBaseline.byQuestionType,
        "knowledge-update": {
          evidenceCaseCount: 78,
          evidenceSessionRecall: 0.99,
        },
      },
      executionFailures: 0,
    };

    expect(() =>
      readLongMemEvalPhase69GateReport({
        benchmarkFingerprint:
          value.longMemEvalBaseline.benchmarkFingerprint,
        benchmarkRoot: value.longMemEvalBaseline.benchmarkRoot,
        cases: longMemCases,
        ingestMode: value.longMemEvalBaseline.ingestMode,
        profile: value.longMemEvalBaseline.profile,
        runConfiguration: value.longMemEvalBaseline.runConfiguration,
        summary: tamperedLongMemSummary,
      }),
    ).toThrow("question-type summary does not match cases");
  });

  it("rejects duplicate category summaries and LongMemEval run-config drift", () => {
    const value = input();
    const locomoCases = value.locomoBaseline.categories.flatMap((category) =>
      Array.from({ length: category.questionCount }, (_, index) => ({
        caseId: `case-${index % 10}`,
        category: category.category,
        evidenceRecall: category.averageEvidenceRecall,
        noiseTurnCount: category.noiseTurnTotal / category.questionCount,
        questionId: `${category.category}-${index}`,
      })),
    );
    expect(() =>
      readLocomoPhase69GateReport({
        ...value.locomoBaseline,
        cases: locomoCases,
        categories: [
          ...value.locomoBaseline.categories,
          value.locomoBaseline.categories[0]!,
        ],
      }),
    ).toThrow("duplicate categories");

    value.longMemEvalCandidate.runConfiguration.contextMaxTokens = 5000;
    const result = evaluatePhase69Gate(value);
    expect(result.failures).toContain(
      "LongMemEval candidate runConfiguration is inconsistent",
    );
  });
});
