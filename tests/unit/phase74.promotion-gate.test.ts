import { describe, expect, it } from "bun:test";

import { evaluatePhase74PromotionGate } from "../../src/eval/phase74PromotionGate";
import type { Phase74PromotionGateInput } from "../../src/eval/phase74PromotionGate";

function passingInput(): Phase74PromotionGateInput {
  return {
    evidenceBoundary: {
      goldAware: false,
      protocolReader: false,
      seenCasesOnly: false,
    },
    families: [
      {
        delta: 0.03,
        family: "longmemeval",
        inference: {
          confidenceLevel: 0.95,
          lower: -0.001,
          method: "paired-bootstrap",
          upper: 0.061,
        },
        runIds: ["lme-run-1", "lme-run-2", "lme-run-3"],
      },
      {
        delta: 0.01,
        family: "locomo",
        inference: {
          confidenceLevel: 0.95,
          lower: 0.001,
          method: "paired-bootstrap",
          upper: 0.019,
        },
        runIds: ["locomo-run-1", "locomo-run-2", "locomo-run-3"],
      },
    ],
    operations: {
      baselineP95LatencyMs: 1_000,
      candidateP95LatencyMs: 1_250,
      executionFailures: 0,
      modelUsage: {
        accountingVersion: "phase74-model-usage-v1",
        baseline: {
          answerGenerationCaseCount: 3,
          caseIdsSha256: "same-case-cohort",
          completeRequestCount: 6,
          logicalCaseCount: 3,
          missingRequestCount: 0,
          partialRequestCount: 0,
          operationCounts: {
            answer_generation: 3,
            embedding: 3,
          },
          requestCount: 6,
          totalTokens: 3_000,
          unobservedCaseIds: [],
        },
        candidate: {
          answerGenerationCaseCount: 3,
          caseIdsSha256: "same-case-cohort",
          completeRequestCount: 12,
          logicalCaseCount: 3,
          missingRequestCount: 0,
          partialRequestCount: 0,
          operationCounts: {
            answer_generation: 3,
            embedding: 3,
            reranker_pointwise: 6,
          },
          requestCount: 12,
          totalTokens: 3_450,
          unobservedCaseIds: [],
        },
        costBoundary: "full-product",
      },
      renderedContextMaxTokens: 6_000,
    },
    protections: [
      { delta: -0.01, name: "beam" },
      { delta: 0, name: "memory-agent-bench" },
    ],
    safety: {
      abstentionAccuracyDelta: 0,
      hallucinationRateDelta: 0,
      privacyPassRateDelta: 0,
      updateCorrectnessDelta: 0,
    },
  };
}

describe("Phase 74 generalized-memory promotion gate", () => {
  it("passes only with two independent improving families and every release guard", () => {
    const result = evaluatePhase74PromotionGate(passingInput());

    expect(result.status).toBe("passed");
    expect(result.failures).toEqual([]);
    expect(result.qualifyingFamilies).toEqual({
      primary: "longmemeval",
      secondary: "locomo",
    });
    expect(result.thresholds).toMatchObject({
      maxAverageModelTokenIncreaseRatio: 0.15,
      maxP95LatencyIncreaseRatio: 0.25,
      maxProtectionRegression: 0.01,
      maxRenderedContextTokens: 6_000,
      minIndependentRuns: 3,
      minPrimaryFamilyDelta: 0.03,
      minSecondaryFamilyDelta: 0.01,
    });
  });

  it("rejects fewer than three independent runs and duplicate run identities", () => {
    const input = passingInput();
    input.families[0]!.runIds = ["run-1", "run-2"];
    input.families[1]!.runIds = ["run-1", "run-1", "run-2", "run-3"];

    const result = evaluatePhase74PromotionGate(input);

    expect(result.status).toBe("failed");
    expect(result.failures).toContain(
      "longmemeval must contain at least 3 independent runs, received 2",
    );
    expect(result.failures).toContain("locomo contains duplicate run identities");
  });

  it("requires distinct primary and statistically positive secondary families", () => {
    const input = passingInput();
    input.families[1]!.inference.lower = 0;

    let result = evaluatePhase74PromotionGate(input);
    expect(result.status).toBe("failed");
    expect(result.qualifyingFamilies.primary).toBe("longmemeval");
    expect(result.failures).not.toContain(
      "no family improved by at least 0.03",
    );
    expect(result.failures).toContain(
      "no distinct secondary family improved by at least 0.01 with a 95% confidence lower bound above 0",
    );

    input.families[1]!.delta = 0.009;
    input.families[1]!.inference = {
      confidenceLevel: 0.95,
      lower: 0.001,
      method: "paired-bootstrap",
      upper: 0.02,
    };
    result = evaluatePhase74PromotionGate(input);
    expect(result.failures).toContain(
      "no distinct secondary family improved by at least 0.01 with a 95% confidence lower bound above 0",
    );
  });

  it("rejects duplicate families and invalid confidence evidence", () => {
    const input = passingInput();
    input.families.push({
      ...input.families[1]!,
      inference: {
        confidenceLevel: 0.9,
        lower: 0.02,
        method: "paired-bootstrap",
        upper: 0.01,
      },
    });

    const result = evaluatePhase74PromotionGate(input);

    expect(result.failures).toContain("benchmark families must be unique");
    expect(result.failures).toContain(
      "locomo confidence evidence must use a 0.95 confidence level",
    );
    expect(result.failures).toContain(
      "locomo confidence interval must contain its observed delta",
    );
  });

  it("does not treat a McNemar p-value as the required confidence interval", () => {
    const input = passingInput();
    input.families[1]!.inference = {
      confidenceLevel: 0.95,
      lower: 0.001,
      method: "mcnemar",
      upper: 0.019,
    } as never;

    expect(evaluatePhase74PromotionGate(input).failures).toContain(
      "locomo promotion confidence evidence must use paired-bootstrap",
    );
  });

  it("rejects missing or regressed protection evidence", () => {
    const noProtections = passingInput();
    noProtections.protections = [];
    expect(evaluatePhase74PromotionGate(noProtections).failures).toContain(
      "at least one protection set is required",
    );

    const regressed = passingInput();
    regressed.protections[0]!.delta = -0.010_001;
    expect(evaluatePhase74PromotionGate(regressed).failures).toContain(
      "beam regressed by more than 0.01",
    );
  });

  it("enforces rendered-context, token, latency, and zero-failure limits", () => {
    const input = passingInput();
    input.operations = {
      baselineP95LatencyMs: 1_000,
      candidateP95LatencyMs: 1_251,
      executionFailures: 1,
      modelUsage: {
        ...input.operations.modelUsage,
        candidate: {
          ...input.operations.modelUsage.candidate,
          totalTokens: 3_451,
        },
      },
      renderedContextMaxTokens: 6_001,
    };

    const result = evaluatePhase74PromotionGate(input);

    expect(result.failures).toContain(
      "rendered context exceeded 6000 tokens",
    );
    expect(result.failures).toContain(
      "average model tokens increased by more than 15%",
    );
    expect(result.failures).toContain("p95 latency increased by more than 25%");
    expect(result.failures).toContain(
      "executionFailures must be 0, received 1",
    );
  });

  it("fails closed when usage evidence is absent, partial, or internally inconsistent", () => {
    const absent = passingInput();
    absent.operations.modelUsage = undefined as never;
    expect(evaluatePhase74PromotionGate(absent).failures).toContain(
      "complete model usage evidence is required",
    );

    const partial = passingInput();
    partial.operations.modelUsage.candidate = {
      ...partial.operations.modelUsage.candidate,
      completeRequestCount: 10,
      missingRequestCount: 1,
      partialRequestCount: 1,
    };
    expect(evaluatePhase74PromotionGate(partial).failures).toContain(
      "candidate model usage contains incomplete requests",
    );

    const inconsistent = passingInput();
    inconsistent.operations.modelUsage.baseline = {
      ...inconsistent.operations.modelUsage.baseline,
      requestCount: 7,
    };
    expect(evaluatePhase74PromotionGate(inconsistent).failures).toContain(
      "baseline model usage request counts are inconsistent",
    );
  });

  it("does not allow zero-request or zero-token evidence to masquerade as free model usage", () => {
    const input = passingInput();
    input.operations.modelUsage.baseline = {
      answerGenerationCaseCount: 3,
      caseIdsSha256: "same-case-cohort",
      completeRequestCount: 0,
      logicalCaseCount: 3,
      missingRequestCount: 0,
      partialRequestCount: 0,
      operationCounts: {},
      requestCount: 0,
      totalTokens: 0,
      unobservedCaseIds: [],
    };

    const failures = evaluatePhase74PromotionGate(input).failures;
    expect(failures).toContain(
      "baseline model usage must contain at least one complete request",
    );
    expect(failures).toContain(
      "baseline model usage totalTokens must be greater than 0",
    );
  });

  it("requires identical case digests, full-product cost, and answer coverage", () => {
    const input = passingInput();
    input.operations.modelUsage.candidate.caseIdsSha256 = "different-cases";
    input.operations.modelUsage.costBoundary = "reader-only" as never;
    input.operations.modelUsage.candidate.answerGenerationCaseCount = 2;
    input.operations.modelUsage.candidate.operationCounts = {
      embedding: 12,
    };

    const failures = evaluatePhase74PromotionGate(input).failures;
    expect(failures).toContain(
      "baseline and candidate model usage must cover the identical case cohort",
    );
    expect(failures).toContain(
      "model usage costBoundary must be full-product",
    );
    expect(failures).toContain(
      "candidate model usage must contain answer generation for every logical case",
    );
  });

  it("rejects a branch with cases that failed before model usage was observed", () => {
    const input = passingInput();
    input.operations.modelUsage.baseline.unobservedCaseIds = ["case-2"];

    expect(evaluatePhase74PromotionGate(input).failures).toContain(
      "baseline model usage has unobserved logical cases",
    );
  });

  it("rejects any safety regression", () => {
    const input = passingInput();
    input.safety = {
      abstentionAccuracyDelta: -0.001,
      hallucinationRateDelta: 0.001,
      privacyPassRateDelta: -0.001,
      updateCorrectnessDelta: -0.001,
    };

    const result = evaluatePhase74PromotionGate(input);

    expect(result.failures).toContain("hallucination rate regressed");
    expect(result.failures).toContain("update correctness regressed");
    expect(result.failures).toContain("abstention accuracy regressed");
    expect(result.failures).toContain("privacy pass rate regressed");
  });

  it("rejects protocol-reader, gold-aware, and seen-only evidence", () => {
    const input = passingInput();
    input.evidenceBoundary = {
      goldAware: true,
      protocolReader: true,
      seenCasesOnly: true,
    };

    const result = evaluatePhase74PromotionGate(input);

    expect(result.failures).toContain(
      "protocol-reader results cannot authorize product promotion",
    );
    expect(result.failures).toContain(
      "gold-aware results cannot authorize product promotion",
    );
    expect(result.failures).toContain(
      "seen-case-only results cannot authorize product promotion",
    );
  });
});
