import { describe, expect, it } from "bun:test";

import { resolveGeneralizedFusionBudget } from "../../src/recall/engine";

describe("generalized fusion dynamic budget", () => {
  const base = { maxCandidates: 8, maxTotalFacts: 10 };

  it("keeps the base budget for focused queries", () => {
    expect(resolveGeneralizedFusionBudget({ base, contentTermCount: 4 })).toEqual({
      expanded: false,
      maxCandidates: 8,
      maxTotalFacts: 10,
    });
  });

  it("adds a bounded evidence allowance for multi-constraint queries", () => {
    expect(resolveGeneralizedFusionBudget({ base, contentTermCount: 7 })).toEqual({
      expanded: true,
      maxCandidates: 12,
      maxTotalFacts: 12,
    });
  });

  it("adds the same bounded allowance for concise aggregate queries", () => {
    expect(
      resolveGeneralizedFusionBudget({
        aggregateQuery: true,
        base,
        contentTermCount: 4,
      }),
    ).toEqual({
      expanded: true,
      maxCandidates: 12,
      maxTotalFacts: 12,
    });
  });

  it("does not invent limits when the caller left them unbounded", () => {
    expect(
      resolveGeneralizedFusionBudget({
        base: {},
        contentTermCount: 12,
      }),
    ).toEqual({
      expanded: false,
      maxCandidates: undefined,
      maxTotalFacts: undefined,
    });
  });
});
