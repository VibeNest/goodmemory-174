import { describe, expect, it } from "bun:test";

import {
  isC5StageWritebackRequired,
  resolveC5PriorMemoryLineage,
} from "../../scripts/codex-coding-effect/c5-memory-protocol";
describe("Codex coding-effect C5 memory protocol", () => {
  it("uses the complete pre-stage export while requiring prior Stop lineage", () => {
    expect(resolveC5PriorMemoryLineage({
      exportedMemoryIds: ["prior-stop", "host-generated"],
      injectedMemoryIds: ["prior-stop", "host-generated"],
      priorWritebackMemoryIds: ["prior-stop"],
    })).toEqual({
      containsPriorWritebackLineage: true,
      expectedPriorMemoryIds: ["host-generated", "prior-stop"],
      expectedRecalledMemoryIds: ["host-generated", "prior-stop"],
    });

    expect(resolveC5PriorMemoryLineage({
      exportedMemoryIds: ["host-generated"],
      injectedMemoryIds: ["host-generated"],
      priorWritebackMemoryIds: ["prior-stop"],
    }).containsPriorWritebackLineage).toBe(false);
  });

  it("requires only the first writeback needed by a later stage", () => {
    const run = {
      stages: [
        { id: "stage-1", memoryExpectation: "none" },
        { id: "stage-2", memoryExpectation: "required" },
        { id: "stage-3", memoryExpectation: "required" },
      ],
    } as const;

    expect(isC5StageWritebackRequired({
      priorWritebackCommitted: false,
      run,
      stage: run.stages[0]!,
    })).toBe(true);
    expect(isC5StageWritebackRequired({
      priorWritebackCommitted: true,
      run,
      stage: run.stages[1]!,
    })).toBe(false);
  });
});
