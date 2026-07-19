import { describe, expect, it } from "bun:test";

import { createLanguageService } from "../../src/language";
import { buildDeterministicRecallPlan } from "../../src/recall/recallPlan";

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
});
