import { describe, expect, it } from "bun:test";
import {
  findAffirmedSignals,
  findNegatedSignals,
} from "../../src/eval/signalMatching";

describe("eval signal matching", () => {
  it("treats 'not a <signal>' identity denials as negated instead of affirmed", () => {
    const text = "You are not a robotics engineer.";

    expect(findAffirmedSignals(["robotics engineer"], text)).toEqual([]);
    expect(findNegatedSignals(["robotics engineer"], text)).toEqual([
      "robotics engineer",
    ]);
  });

  it("treats article-based contractions as negated identity signals", () => {
    const text = "You aren't a robotics engineer anymore.";

    expect(findAffirmedSignals(["robotics engineer"], text)).toEqual([]);
    expect(findNegatedSignals(["robotics engineer"], text)).toEqual([
      "robotics engineer",
    ]);
  });

  it("treats contraction-based lifecycle denials as negated identity signals", () => {
    const text = "You're no longer a robotics engineer.";

    expect(findAffirmedSignals(["robotics engineer"], text)).toEqual([]);
    expect(findNegatedSignals(["robotics engineer"], text)).toEqual([
      "robotics engineer",
    ]);
  });
});
