import { describe, expect, it } from "bun:test";

import {
  evaluatePhase72ReleaseGate,
  type Phase72ReleaseMetrics,
} from "../../scripts/run-phase-72-release-gate";

const passingMetrics: Phase72ReleaseMetrics = {
  beam: {
    evidenceRecall: 0.8276290064,
    executionFailures: 0,
    officialJudgeFailures: 0,
    officialPaperScore: 0.7510180808,
    officialRubricItems: 1051,
    officialUnifiedScore: 0.7650987103,
    publicReferenceScore: 0.49,
    strictBinaryGateEligible: false,
    strictBinaryScore: 0.62,
    totalQuestions: 400,
  },
  halumem: {
    baseline: {
      extractionF1: 0.8615384615,
      questionAnsweringAccuracy: 0.7777777778,
      updateAccuracy: 0.625,
    },
    baselineExecutionFailures: 0,
    goodmemory: {
      extractionF1: 0.9309950438,
      questionAnsweringAccuracy: 0.8888888889,
      updateAccuracy: 0.75,
    },
    goodmemoryExecutionFailures: 0,
  },
  implicitMemBench: {
    executionFailures: 0,
    score: 0.6923666667,
  },
  locomo: {
    executionFailures: 0,
    officialJudgeFailures: 0,
    officialScore: 0.8707792208,
    openDomainScore: 0.6145833333,
    strictScore: 0.6298701299,
  },
  longMemEval: {
    executionFailures: 0,
    officialJudgeFailures: 0,
    officialScore: 0.924,
    strictScore: 0.72,
  },
  memoryAgentBench: {
    conflictResolutionExecutionFailures: 0,
    conflictResolutionScore: 0.9589041096,
    testTimeLearningExecutionFailures: 0,
    testTimeLearningScore: 0.9333333333,
  },
  minteval: {
    executionFailures: 0,
    passed: true,
    scored: false,
  },
  memgym: {
    goodmemoryExecutionFailures: 0,
    goodmemoryScore: 1,
    noMemoryExecutionFailures: 0,
    noMemoryScore: 0.125,
  },
};

describe("Phase 72 release gate", () => {
  it("passes the accepted generalized benchmark evidence", () => {
    const result = evaluatePhase72ReleaseGate(passingMetrics);

    expect(result.passed).toBeTrue();
    expect(result.blockers).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      actual: 0.62,
      id: "beam-strict-binary-stretch",
      note: "diagnostic because the frozen event-ordering integrity audit is not eligible for a strict hard gate",
      target: 0.72,
    });
  });

  it("keeps the strict BEAM threshold hard when the dataset audit is eligible", () => {
    const result = evaluatePhase72ReleaseGate({
      ...passingMetrics,
      beam: {
        ...passingMetrics.beam,
        strictBinaryGateEligible: true,
      },
    });

    expect(result.passed).toBeFalse();
    expect(result.blockers).toContain(
      "beam-strict-binary: expected >= 0.72, got 0.62",
    );
  });

  it("rejects a BEAM score that does not beat the same-protocol public reference", () => {
    const result = evaluatePhase72ReleaseGate({
      ...passingMetrics,
      beam: {
        ...passingMetrics.beam,
        officialUnifiedScore: 0.48,
      },
    });

    expect(result.passed).toBeFalse();
    expect(result.blockers).toContain(
      "beam-official-vs-public-reference: expected >= 0.49, got 0.48",
    );
  });

  it("rejects regression on any unchanged benchmark threshold", () => {
    const result = evaluatePhase72ReleaseGate({
      ...passingMetrics,
      locomo: {
        ...passingMetrics.locomo,
        openDomainScore: 0.59,
      },
    });

    expect(result.passed).toBeFalse();
    expect(result.blockers).toContain(
      "locomo-open-domain: expected >= 0.6, got 0.59",
    );
  });
});
