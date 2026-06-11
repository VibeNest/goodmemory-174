import { describe, expect, it } from "bun:test";
import {
  chunkGatesByFamily,
  classifySingleton,
} from "../../scripts/audit-narrow-gates";

describe("narrow-gate audit logic", () => {
  it("chunks gates by family with the batch size as an upper bound", () => {
    const gates = [
      "preference.a",
      "preference.b",
      "preference.c",
      "aggregate.x",
      "aggregate.y",
      "reasoning.z",
    ];

    const batches = chunkGatesByFamily(gates, 2);

    expect(batches).toEqual([
      ["aggregate.x", "aggregate.y"],
      ["preference.a", "preference.b"],
      ["preference.c"],
      ["reasoning.z"],
    ]);
  });

  it("never mixes families inside a batch", () => {
    const gates = ["a.one", "b.two", "a.three", "b.four", "c.five"];

    for (const batch of chunkGatesByFamily(gates, 10)) {
      const families = new Set(batch.map((id) => id.split(".")[0]));
      expect(families.size).toBe(1);
    }
  });

  it("classifies singleton verdicts by case-delta count", () => {
    expect(
      classifySingleton({
        affectedQuestionIds: [],
        caseDeltaCount: 0,
        gateId: "preference.dead",
      }).status,
    ).toBe("dead");
    expect(
      classifySingleton({
        affectedQuestionIds: ["1:a:1"],
        caseDeltaCount: 1,
        gateId: "preference.single",
      }).status,
    ).toBe("case_fitted");
    expect(
      classifySingleton({
        affectedQuestionIds: ["1:a:1", "2:b:1"],
        caseDeltaCount: 2,
        gateId: "preference.loadBearing",
      }).status,
    ).toBe("load_bearing");
  });
});
