import { afterEach, describe, expect, it } from "bun:test";
import {
  __resetNarrowGateDisablesForTest,
  listRegisteredNarrowGateIds,
  narrowGate,
} from "../../src/recall/narrowGates";
import { isSleekNeutralSneakerPreferenceQuery } from "../../src/recall/selectors/sourceOrderRules/preferenceRules";
// Side-effect import: loads the full selection module graph so every wrapped
// narrow gate registers before the census assertions run.
import "../../src/recall/selection";

const SNEAKER_QUERY =
  "Can you suggest sneakers I might like to buy as a new pair? Please recommend options I might like.";

describe("narrow gate registry", () => {
  afterEach(() => {
    delete process.env.GOODMEMORY_DISABLED_NARROW_GATES;
    __resetNarrowGateDisablesForTest();
  });

  it("is a pass-through when the disable variable is unset", () => {
    expect(isSleekNeutralSneakerPreferenceQuery(SNEAKER_QUERY)).toBe(true);
    expect(isSleekNeutralSneakerPreferenceQuery("unrelated question")).toBe(false);
  });

  it("forces a disabled gate to false without touching other gates", () => {
    process.env.GOODMEMORY_DISABLED_NARROW_GATES =
      "preference.sleekNeutralSneaker, preference.morningSelfCare";
    __resetNarrowGateDisablesForTest();

    expect(isSleekNeutralSneakerPreferenceQuery(SNEAKER_QUERY)).toBe(false);

    delete process.env.GOODMEMORY_DISABLED_NARROW_GATES;
    __resetNarrowGateDisablesForTest();
    expect(isSleekNeutralSneakerPreferenceQuery(SNEAKER_QUERY)).toBe(true);
  });

  it("registers unique well-formed ids", () => {
    const ids = listRegisteredNarrowGateIds();

    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/);
    }
  });

  it("rejects malformed and duplicate ids", () => {
    expect(() => narrowGate("BadId", () => true)).toThrow(
      /must match <family>\.<name>/,
    );

    const probeId = "test.duplicateProbe";
    narrowGate(probeId, () => true);
    expect(() => narrowGate(probeId, () => true)).toThrow(/registered twice/);
  });
});
