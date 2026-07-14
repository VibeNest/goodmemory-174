import { describe, expect, it } from "bun:test";

import {
  evaluateMemGymComparison,
  summarizeMemGymProfile,
  type MemGymCaseResult,
} from "../../scripts/phase-72-memgym";

function result(input: {
  caseId: string;
  executionFailure?: string;
  recalled: number;
  total: number;
}): MemGymCaseResult {
  return {
    answer: input.executionFailure ? "" : "answer",
    caseId: input.caseId,
    confidence: input.executionFailure ? 0 : 0.8,
    executionFailure: input.executionFailure,
    factDecisions: Array.from({ length: input.total }, (_, index) => ({
      confidence: 0.9,
      factId: `fact-${index}`,
      recalled: index < input.recalled,
    })),
    profile: "goodmemory",
    sourcesUsed: [],
  };
}

describe("Phase 72 MemGym protocol", () => {
  it("uses the upstream majority-linked-fact rule for QA success", () => {
    const summary = summarizeMemGymProfile([
      result({ caseId: "one", recalled: 1, total: 1 }),
      result({ caseId: "two", recalled: 1, total: 2 }),
      result({ caseId: "three", recalled: 1, total: 3 }),
    ]);

    expect(summary).toEqual({
      caseCount: 3,
      correctCases: 2,
      executionFailures: 0,
      factRecall: 3 / 6,
      qaAccuracy: 2 / 3,
    });
  });

  it("counts failed cases without treating them as valid answers", () => {
    expect(summarizeMemGymProfile([
      result({ caseId: "ok", recalled: 1, total: 1 }),
      result({
        caseId: "failed",
        executionFailure: "answer timeout",
        recalled: 0,
        total: 2,
      }),
    ])).toMatchObject({
      caseCount: 2,
      correctCases: 1,
      executionFailures: 1,
      qaAccuracy: 0.5,
    });
  });

  it("requires zero failures and at least a five-point no-memory lift", () => {
    expect(evaluateMemGymComparison({
      goodmemory: {
        caseCount: 16,
        correctCases: 11,
        executionFailures: 0,
        factRecall: 0.7,
        qaAccuracy: 0.6875,
      },
      noMemory: {
        caseCount: 16,
        correctCases: 9,
        executionFailures: 0,
        factRecall: 0.55,
        qaAccuracy: 0.5625,
      },
    })).toEqual({
      delta: 0.125,
      failures: [],
      status: "passed",
    });

    expect(evaluateMemGymComparison({
      goodmemory: {
        caseCount: 16,
        correctCases: 10,
        executionFailures: 1,
        factRecall: 0.6,
        qaAccuracy: 0.625,
      },
      noMemory: {
        caseCount: 16,
        correctCases: 10,
        executionFailures: 0,
        factRecall: 0.6,
        qaAccuracy: 0.625,
      },
    })).toMatchObject({
      status: "failed",
      failures: [
        "MemGym executionFailures must be 0",
        "GoodMemory MemGym QA accuracy must beat no-memory by at least 0.05",
      ],
    });
  });
});
