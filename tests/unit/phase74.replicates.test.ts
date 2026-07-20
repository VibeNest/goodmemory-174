import { describe, expect, it } from "bun:test";

import {
  aggregatePhase74Replicates,
  type Phase74ReplicateComparison,
} from "../../src/eval/phase74Replicates";

function replicate(
  replicate: 1 | 2 | 3,
  candidateOffset: number,
  experimentIdentityHash = "experiment-hash",
  runId = `run-${replicate}`,
) {
  const comparison: Phase74ReplicateComparison = {
    baselineArm: "claim-temporal-off",
    benchmark: "locomo",
    candidateArm: "claim-temporal-on",
    selectedCaseIdsSha256: "a".repeat(64),
    stage: "E2",
  };
  return {
    baseline: [
      { caseId: "conversation-a/q1", clusterId: "conversation-a", passed: false, value: 0.2 },
      { caseId: "conversation-a/q2", clusterId: "conversation-a", passed: true, value: 0.6 },
      { caseId: "conversation-b/q1", clusterId: "conversation-b", passed: false, value: 0.4 },
    ],
    candidate: [
      { caseId: "conversation-a/q1", clusterId: "conversation-a", passed: true, value: 0.2 + candidateOffset },
      { caseId: "conversation-a/q2", clusterId: "conversation-a", passed: true, value: 0.6 + candidateOffset },
      { caseId: "conversation-b/q1", clusterId: "conversation-b", passed: true, value: 0.4 + candidateOffset },
    ],
    comparison,
    experimentIdentityHash,
    identityHash: `identity-${runId}`,
    replicate,
    runId,
  };
}

describe("Phase 74 replicate aggregation", () => {
  it("hierarchically bootstraps independent runs and conversation clusters", () => {
    const result = aggregatePhase74Replicates({
      bootstrapSamples: 500,
      runs: [replicate(1, 0.1), replicate(2, 0.2), replicate(3, 0.3)],
      seed: 74,
    });

    expect(result.caseCount).toBe(3);
    expect(result.clusterCount).toBe(2);
    expect(result.inference.caseCount).toBe(3);
    expect(result.inference.delta).toBeCloseTo(0.2);
    expect(result.inference.replicateCount).toBe(3);
    expect(result.inference.samplingUnit).toBe("replicate-and-cluster");
    expect(result.mcnemarByReplicate).toHaveLength(3);
    expect(result.mcnemarByReplicate.map(({ inference }) =>
      inference.caseCount
    )).toEqual([3, 3, 3]);
  });

  it("keeps the LoCoMo headline delta question-weighted while bootstrapping clusters", () => {
    const unequalClusters = (replicateId: 1 | 2 | 3) => {
      const run = replicate(replicateId, 0);
      run.baseline = [
        { caseId: "conversation-a/q1", clusterId: "conversation-a", passed: false, value: 0 },
        { caseId: "conversation-a/q2", clusterId: "conversation-a", passed: false, value: 0 },
        { caseId: "conversation-a/q3", clusterId: "conversation-a", passed: false, value: 0 },
        { caseId: "conversation-b/q1", clusterId: "conversation-b", passed: false, value: 0 },
      ];
      run.candidate = [
        { caseId: "conversation-a/q1", clusterId: "conversation-a", passed: false, value: 0 },
        { caseId: "conversation-a/q2", clusterId: "conversation-a", passed: false, value: 0 },
        { caseId: "conversation-a/q3", clusterId: "conversation-a", passed: false, value: 0 },
        { caseId: "conversation-b/q1", clusterId: "conversation-b", passed: true, value: 1 },
      ];
      return run;
    };

    const result = aggregatePhase74Replicates({
      bootstrapSamples: 500,
      runs: [unequalClusters(1), unequalClusters(2), unequalClusters(3)],
      seed: 74,
    });

    expect(result.inference.delta).toBeCloseTo(0.25);
    expect(result.inference.caseCount).toBe(4);
    expect(result.replicateDeltas).toEqual([0.25, 0.25, 0.25]);
  });

  it("does not hide one negative independent run behind an averaged case bootstrap", () => {
    const result = aggregatePhase74Replicates({
      bootstrapSamples: 5_000,
      runs: [replicate(1, 0.2), replicate(2, 0.2), replicate(3, -0.1)],
      seed: 74,
    });

    expect(result.inference.delta).toBeCloseTo(0.1);
    expect(result.inference.lower).toBeLessThanOrEqual(0);
    expect(result.replicateDeltas[0]).toBeCloseTo(0.2);
    expect(result.replicateDeltas[1]).toBeCloseTo(0.2);
    expect(result.replicateDeltas[2]).toBeCloseTo(-0.1);
  });

  it("rejects missing/duplicate replicates, identity drift, and case population drift", () => {
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), replicate(2, 0.1)],
    })).toThrow("replicates 1, 2, and 3 exactly once");
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), replicate(1, 0.1), replicate(3, 0.1)],
    })).toThrow("replicates 1, 2, and 3 exactly once");
    expect(() => aggregatePhase74Replicates({
      runs: [
        replicate(1, 0.1),
        replicate(2, 0.1, "drifted"),
        replicate(3, 0.1),
      ],
    })).toThrow("experiment identity drift");
    const drifted = replicate(3, 0.1);
    drifted.candidate = drifted.candidate.slice(0, 2);
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), replicate(2, 0.1), drifted],
    })).toThrow("paired inputs must have equal lengths");
  });

  it("rejects reused run IDs and run identity hashes across replicates", () => {
    expect(() => aggregatePhase74Replicates({
      runs: [
        replicate(1, 0.1, "experiment-hash", "same-run"),
        replicate(2, 0.1, "experiment-hash", "same-run"),
        replicate(3, 0.1),
      ],
    })).toThrow("replicate run IDs must be unique");

    const second = replicate(2, 0.1);
    second.identityHash = "identity-run-1";
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), second, replicate(3, 0.1)],
    })).toThrow("replicate run identity hashes must be unique");
  });

  it("rejects stage, arm, benchmark, or selected-population comparison drift", () => {
    const stageDrift = replicate(2, 0.1);
    stageDrift.comparison = {
      ...stageDrift.comparison,
      baselineArm: "recall-plan-off",
      candidateArm: "recall-plan-deterministic",
      stage: "E3",
    };
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), stageDrift, replicate(3, 0.1)],
    })).toThrow("replicate comparison identity drift");

    const benchmarkDrift = replicate(2, 0.1);
    benchmarkDrift.comparison = {
      ...benchmarkDrift.comparison,
      benchmark: "longmemeval",
    };
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), benchmarkDrift, replicate(3, 0.1)],
    })).toThrow("replicate comparison identity drift");

    const populationDrift = replicate(2, 0.1);
    populationDrift.comparison = {
      ...populationDrift.comparison,
      selectedCaseIdsSha256: "b".repeat(64),
    };
    expect(() => aggregatePhase74Replicates({
      runs: [replicate(1, 0.1), populationDrift, replicate(3, 0.1)],
    })).toThrow("replicate comparison identity drift");
  });
});
