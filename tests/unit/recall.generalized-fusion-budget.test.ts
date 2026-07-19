import { describe, expect, it } from "bun:test";

import { resolveGeneralizedFusionBudget } from "../../src/recall/engine";
import { createLanguageService } from "../../src/language";
import { buildDeterministicRecallPlan } from "../../src/recall/recallPlan";

describe("generalized fusion dynamic budget", () => {
  const base = { maxCandidates: 8, maxTotalFacts: 10 };
  const scope = { userId: "user-1" };
  const buildPlan = (query: string) =>
    buildDeterministicRecallPlan({
      language: createLanguageService(),
      locale: "en",
      query,
      referenceTime: "2026-07-16T00:00:00.000Z",
      scope,
    });

  it("keeps the base budget for focused queries", () => {
    expect(
      resolveGeneralizedFusionBudget({ base, plan: buildPlan("Where do I live?") }),
    ).toEqual({
      expanded: false,
      maxCandidates: 8,
      maxTotalFacts: 10,
    });
  });

  it("does not expand merely because a query contains seven content terms", () => {
    expect(
      resolveGeneralizedFusionBudget({
        base,
        plan: buildPlan("Explain deployment pipeline ownership details for Atlas production service"),
      }),
    ).toEqual({
      expanded: false,
      maxCandidates: 8,
      maxTotalFacts: 10,
    });
  });

  it("adds a bounded evidence allowance for a planned relation hop", () => {
    expect(
      resolveGeneralizedFusionBudget({
        base,
        plan: buildPlan("What is the goaltender known for?"),
      }),
    ).toEqual({
      expanded: true,
      maxCandidates: 12,
      maxTotalFacts: 12,
    });
  });

  it("adds the same bounded allowance for concise aggregate queries", () => {
    expect(
      resolveGeneralizedFusionBudget({
        base,
        plan: buildPlan("How many projects are current?"),
      }),
    ).toEqual({
      expanded: true,
      maxCandidates: 12,
      maxTotalFacts: 12,
    });
  });

  it("applies the fixed plan caps when the caller left limits unspecified", () => {
    expect(
      resolveGeneralizedFusionBudget({
        base: {},
        plan: buildPlan("Where do I live?"),
      }),
    ).toEqual({
      expanded: false,
      maxCandidates: 32,
      maxTotalFacts: 12,
    });
  });
});
