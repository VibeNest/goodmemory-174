import { describe, expect, it } from "bun:test";

import { evaluateMINTEvalSmoke } from "../../scripts/phase-72-minteval";

describe("Phase 72 MINTEval smoke contract", () => {
  it("passes only a non-empty write and recall path with zero failures", () => {
    expect(evaluateMINTEvalSmoke({
      acceptedMemories: 20,
      contextCount: 20,
      executionFailures: 0,
      questionCount: 40,
      recalledMemories: 3,
    })).toEqual({ failures: [], status: "passed" });
  });

  it("does not turn a schema-only load into a successful smoke", () => {
    expect(evaluateMINTEvalSmoke({
      acceptedMemories: 0,
      contextCount: 20,
      executionFailures: 1,
      questionCount: 40,
      recalledMemories: 0,
    })).toEqual({
      failures: [
        "MINTEval smoke executionFailures must be 0",
        "MINTEval smoke must write at least one memory",
        "MINTEval smoke must recall at least one memory",
      ],
      status: "failed",
    });
  });
});
