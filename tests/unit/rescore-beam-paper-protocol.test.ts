import { describe, expect, it } from "bun:test";

import {
  alignBeamEventOrderingItems,
  buildBeamPaperCategorySummary,
  canonicalizeBeamAbility,
  computeBeamEventOrderingTauNorm,
  computeKendallTauB,
} from "../../scripts/rescore-beam-paper-protocol";

describe("BEAM paper protocol rescore", () => {
  it("maps information-extraction subtypes into the upstream ability", () => {
    expect(canonicalizeBeamAbility("event_ordering")).toBe("event_ordering");
    expect(canonicalizeBeamAbility("numerical_precision")).toBe(
      "information_extraction",
    );
    expect(canonicalizeBeamAbility("Timeline Integration")).toBe(
      "information_extraction",
    );
  });

  it("computes Kendall tau-b with the same normalized endpoints as BEAM", () => {
    expect(computeKendallTauB([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(computeKendallTauB([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(
      computeBeamEventOrderingTauNorm({
        alignedSystemItems: ["first", "second", "third"],
        referenceItems: ["first", "second", "third"],
      }),
    ).toBe(1);
    expect(
      computeBeamEventOrderingTauNorm({
        alignedSystemItems: ["third", "second", "first"],
        referenceItems: ["first", "second", "third"],
      }),
    ).toBe(0);
  });

  it("aligns each response line to the first unused equivalent rubric item", async () => {
    const calls: string[] = [];
    const result = await alignBeamEventOrderingItems({
      equivalent: async ({ referenceItem, systemItem }) => {
        calls.push(`${systemItem}->${referenceItem}`);
        return (
          (systemItem === "Beta paraphrase" && referenceItem === "beta") ||
          (systemItem === "Alpha paraphrase" && referenceItem === "alpha")
        );
      },
      referenceItems: ["alpha", "beta", "gamma"],
      systemItems: ["Beta paraphrase", "Alpha paraphrase", "unmatched"],
    });

    expect(result).toEqual(["beta", "alpha", "unmatched"]);
    expect(calls).toEqual([
      "Beta paraphrase->alpha",
      "Beta paraphrase->beta",
      "Alpha paraphrase->alpha",
      "unmatched->gamma",
    ]);
  });

  it("aggregates a frozen single-ability slice without inventing missing abilities", () => {
    expect(
      buildBeamPaperCategorySummary([
        { questionType: "event_ordering", score: 0.25 },
        { questionType: "event_ordering", score: 0.75 },
      ]),
    ).toEqual({
      categories: {
        event_ordering: { meanScore: 0.5, questions: 2 },
      },
      overallMacroByAbility: 0.5,
      overallMicroByQuestion: 0.5,
    });
  });
});
