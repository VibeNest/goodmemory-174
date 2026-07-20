import { describe, expect, it } from "bun:test";

import {
  inferExactMcNemar,
  inferPairedMeanDelta,
} from "../../src/eval/phase74PairedInference";

describe("Phase 74 paired inference", () => {
  it("returns a zero paired delta and collapsed interval for identical scores", () => {
    const scores = [
      { caseId: "case-a", value: 0.2 },
      { caseId: "case-b", value: 0.6 },
      { caseId: "case-c", value: 1 },
    ];

    expect(
      inferPairedMeanDelta({
        baseline: scores,
        bootstrapSamples: 500,
        candidate: scores,
        seed: 74,
      }),
    ).toEqual({
      bootstrapSamples: 500,
      caseCount: 3,
      confidenceLevel: 0.95,
      delta: 0,
      lower: 0,
      method: "paired-bootstrap",
      seed: 74,
      upper: 0,
    });
  });

  it("finds an unambiguously positive paired improvement", () => {
    const result = inferPairedMeanDelta({
      baseline: [
        { caseId: "case-a", value: 0.1 },
        { caseId: "case-b", value: 0.4 },
        { caseId: "case-c", value: 0.2 },
        { caseId: "case-d", value: 0.7 },
      ],
      bootstrapSamples: 1_000,
      candidate: [
        { caseId: "case-a", value: 0.3 },
        { caseId: "case-b", value: 0.6 },
        { caseId: "case-c", value: 0.4 },
        { caseId: "case-d", value: 0.9 },
      ],
      seed: 74,
    });

    expect(result.delta).toBeCloseTo(0.2);
    expect(result.lower).toBeCloseTo(0.2);
    expect(result.upper).toBeCloseTo(0.2);
  });

  it("rejects unequal lengths and reordered case identities", () => {
    const baseline = [
      { caseId: "case-a", value: 0 },
      { caseId: "case-b", value: 1 },
    ];

    expect(() =>
      inferPairedMeanDelta({
        baseline,
        candidate: [{ caseId: "case-a", value: 1 }],
      }),
    ).toThrow("paired inputs must have equal lengths");

    expect(() =>
      inferPairedMeanDelta({
        baseline,
        candidate: [
          { caseId: "case-b", value: 1 },
          { caseId: "case-a", value: 0 },
        ],
      }),
    ).toThrow(
      "paired case ID mismatch at index 0: expected case-a, received case-b",
    );
  });

  it("rejects duplicate case IDs instead of inflating the paired sample", () => {
    expect(() => inferPairedMeanDelta({
      baseline: [
        { caseId: "case-a", value: 0 },
        { caseId: "case-a", value: 0 },
      ],
      candidate: [
        { caseId: "case-a", value: 1 },
        { caseId: "case-a", value: 1 },
      ],
    })).toThrow("paired inputs contain duplicate case ID case-a");
  });

  it("reproduces bootstrap intervals for the same seed", () => {
    const input = {
      baseline: [
        { caseId: "case-a", value: 0.1 },
        { caseId: "case-b", value: 0.2 },
        { caseId: "case-c", value: 0.4 },
        { caseId: "case-d", value: 0.5 },
        { caseId: "case-e", value: 0.8 },
      ],
      bootstrapSamples: 750,
      candidate: [
        { caseId: "case-a", value: 0.2 },
        { caseId: "case-b", value: 0.1 },
        { caseId: "case-c", value: 0.8 },
        { caseId: "case-d", value: 0.5 },
        { caseId: "case-e", value: 0.9 },
      ],
      seed: 12_345,
    };

    const first = inferPairedMeanDelta(input);
    const second = inferPairedMeanDelta(input);

    expect(second).toEqual(first);
  });

  it("returns p=1 when binary outcomes have no discordant pairs", () => {
    const result = inferExactMcNemar({
      baseline: [
        { caseId: "case-a", passed: true },
        { caseId: "case-b", passed: false },
      ],
      candidate: [
        { caseId: "case-a", passed: true },
        { caseId: "case-b", passed: false },
      ],
    });

    expect(result).toEqual({
      baselineOnly: 0,
      candidateOnly: 0,
      caseCount: 2,
      discordantCount: 0,
      method: "mcnemar",
      pValue: 1,
    });
  });

  it("computes the exact two-sided McNemar probability and discordant counts", () => {
    const baseline = Array.from({ length: 10 }, (_, index) => ({
      caseId: `case-${index}`,
      passed: index >= 8,
    }));
    const candidate = Array.from({ length: 10 }, (_, index) => ({
      caseId: `case-${index}`,
      passed: true,
    }));

    const result = inferExactMcNemar({ baseline, candidate });

    expect(result).toMatchObject({
      baselineOnly: 0,
      candidateOnly: 8,
      caseCount: 10,
      discordantCount: 8,
      method: "mcnemar",
    });
    expect(result.pValue).toBeCloseTo(0.0078125, 12);
  });

  it("applies the same case alignment contract to binary outcomes", () => {
    expect(() =>
      inferExactMcNemar({
        baseline: [{ caseId: "case-a", passed: false }],
        candidate: [
          { caseId: "case-a", passed: true },
          { caseId: "case-b", passed: true },
        ],
      }),
    ).toThrow("paired inputs must have equal lengths");
  });
});
