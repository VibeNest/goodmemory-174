import { describe, expect, it } from "bun:test";

import { createLanguageService } from "../../src/language";
import {
  buildDeterministicRecallPlan,
  resolveRecallPlan,
} from "../../src/recall/recallPlan";

const scope = { userId: "user-1", workspaceId: "workspace-1" };
const referenceTime = "2026-07-16T00:00:00.000Z";

function plan(query: string, locale = "en") {
  return buildDeterministicRecallPlan({
    language: createLanguageService(),
    locale,
    query,
    referenceTime,
    scope,
  });
}

describe("deterministic recall plan", () => {
  it("uses fixed global candidate, selection, and rendered-context limits", () => {
    expect(plan("Where do I live?")).toMatchObject({
      maxRenderedTokens: 6_000,
      preRankLimit: 32,
      selectedLimit: 12,
    });
  });

  it("plans Chinese multi-facet queries without whitespace token assumptions", () => {
    const result = plan("我用什么数据库以及后来换成了哪个编辑器？", "zh-CN");

    expect(result.facets).toEqual([
      "我用什么数据库",
      "后来换成了哪个编辑器",
    ]);
    expect(result.aggregation).toBe("change");
    expect(result.uncertainty).toBe("high");
  });

  it("does not reinterpret a commercial partner query as a relationship facet", () => {
    const result = plan("Which partner API did Acme use?");

    expect(result.facets).toEqual([]);
    expect(result.entities).toEqual(["acme"]);
  });

  it("derives aggregation, temporal needs, and multi-hop depth from the query", () => {
    const currentCount = plan("How many current projects does Acme have?");
    expect(currentCount.aggregation).toBe("count");
    expect(currentCount.temporalConstraints).toEqual([
      { kind: "current", referenceTime },
    ]);
    expect(currentCount.evidenceNeeds).toContain("aggregation");

    const relation = plan("What is the goaltender known for?");
    expect(relation.maxHops).toBe(2);
    expect(relation.evidenceNeeds).toContain("relation");
  });

  it("uses an explicit query date as the before/after boundary", () => {
    expect(plan("2025 年以前的状态是什么？", "zh-CN").temporalConstraints).toEqual([
      { kind: "before", referenceTime: "2025-01-01T00:00:00.000Z" },
    ]);
    expect(plan("What changed after 2025-06-01?").temporalConstraints).toEqual([
      { kind: "after", referenceTime: "2025-06-01T00:00:00.000Z" },
    ]);
  });

  it("resolves month-name, quarter, season, and relative anchors deterministically", () => {
    // Month name + year anchors to the month start.
    expect(plan("What changed after May 2026?").temporalConstraints).toEqual([
      { kind: "after", referenceTime: "2026-05-01T00:00:00.000Z" },
    ]);
    // Month name + day + year anchors to the day.
    expect(
      plan("What happened before March 5, 2026?").temporalConstraints,
    ).toEqual([
      { kind: "before", referenceTime: "2026-03-05T00:00:00.000Z" },
    ]);
    // A bare month resolves to its most recent occurrence at or before the
    // reference time (reference is 2026-07-16).
    expect(plan("What did we ship after May?").temporalConstraints).toEqual([
      { kind: "after", referenceTime: "2026-05-01T00:00:00.000Z" },
    ]);
    // "last <month>" after the reference month rolls to the previous year.
    expect(
      plan("What happened after last September?").temporalConstraints,
    ).toEqual([
      { kind: "after", referenceTime: "2025-09-01T00:00:00.000Z" },
    ]);
    // Quarters anchor to the quarter start.
    expect(plan("What shipped after Q2 2026?").temporalConstraints).toEqual([
      { kind: "after", referenceTime: "2026-04-01T00:00:00.000Z" },
    ]);
    // Seasons use fixed northern-hemisphere calendar starts.
    expect(
      plan("What was planned before summer 2026?").temporalConstraints,
    ).toEqual([
      { kind: "before", referenceTime: "2026-06-01T00:00:00.000Z" },
    ]);
    // Relative offsets resolve against the reference time at day precision.
    expect(plan("What changed after last week?").temporalConstraints).toEqual([
      { kind: "after", referenceTime: "2026-07-09T00:00:00.000Z" },
    ]);
    expect(
      plan("What happened before 3 days ago?").temporalConstraints,
    ).toEqual([
      { kind: "before", referenceTime: "2026-07-13T00:00:00.000Z" },
    ]);
    // Chinese year + numeric month.
    expect(
      plan("2026年5月之后有什么变化？", "zh-CN").temporalConstraints,
    ).toEqual([
      { kind: "after", referenceTime: "2026-05-01T00:00:00.000Z" },
    ]);
    // The modal verb "may" is not a month.
    expect(
      plan("What may change after the release?").temporalConstraints,
    ).toEqual([
      { kind: "after", referenceTime },
    ]);
  });

  it("lets an optional query-only assistant refine the plan without changing fixed budgets", async () => {
    const result = await resolveRecallPlan({
      input: {
        locale: "zh-CN",
        query: "告诉我这两个项目现在的状态",
        referenceTime,
        scope,
      },
      assistant: {
        async plan(input) {
          expect(Object.keys(input).sort()).toEqual([
            "deterministicPlan",
            "locale",
            "query",
            "referenceTime",
            "scope",
          ]);
          return {
            ...input.deterministicPlan,
            entities: ["Atlas", "Beacon"],
            facets: ["Atlas 现在的状态", "Beacon 现在的状态"],
            maxHops: 2,
            preRankLimit: 999,
            selectedLimit: 999,
            maxRenderedTokens: 999_999,
          };
        },
      },
    });

    expect(result.assistantApplied).toBe(true);
    expect(result.plan).toMatchObject({
      entities: ["Atlas", "Beacon"],
      facets: ["Atlas 现在的状态", "Beacon 现在的状态"],
      maxHops: 1,
      preRankLimit: 32,
      selectedLimit: 12,
      maxRenderedTokens: 6_000,
    });
  });

  it("does not spend a provider call on a low-uncertainty single-intent plan", async () => {
    let calls = 0;
    const input = {
      query: "What specific themes are explored in Joanna's new book?",
      referenceTime,
      scope,
    };

    const result = await resolveRecallPlan({
      input,
      assistant: {
        async plan() {
          calls += 1;
          return {
            facets: ["book", "themes"],
            maxHops: 2,
          };
        },
      },
    });

    expect(calls).toBe(0);
    expect(result).toEqual({
      assistantApplied: false,
      plan: buildDeterministicRecallPlan(input),
    });
  });

  it("admits only entity-anchored facets and preserves deterministic capabilities", async () => {
    const result = await resolveRecallPlan({
      input: {
        query: "What database do I use and which editor did I switch to?",
        referenceTime,
        scope,
      },
      assistant: {
        async plan() {
          return {
            entities: ["Atlas", "Beacon"],
            evidenceNeeds: [],
            facets: ["database", "Atlas current status", "themes"],
            maxHops: 3,
            planes: [],
            temporalConstraints: [
              { kind: "current", referenceTime },
            ],
          };
        },
      },
    });

    expect(result.assistantApplied).toBe(true);
    expect(result.plan.entities).toEqual(["Atlas", "Beacon"]);
    expect(result.plan.facets).toEqual([
      "What database do I use",
      "which editor did I switch to",
      "Atlas current status",
    ]);
    expect(result.plan.temporalConstraints).toEqual([]);
    expect(result.plan.evidenceNeeds).toEqual(
      expect.arrayContaining(["direct", "aggregation", "multi_facet", "temporal"]),
    );
    expect(result.plan.planes).toEqual(
      expect.arrayContaining(["semantic", "episodic"]),
    );
    expect(result.plan.maxHops).toBe(1);
  });

  it("falls back to the deterministic plan when the optional assistant fails", async () => {
    const input = {
      query: "What database do I use and which editor did I switch to?",
      referenceTime,
      scope,
    };
    const result = await resolveRecallPlan({
      input,
      assistant: {
        async plan() {
          throw new Error("provider unavailable");
        },
      },
    });

    expect(result).toEqual({
      assistantApplied: false,
      fallbackReason: "assistant_error",
      plan: buildDeterministicRecallPlan(input),
    });
  });
});
