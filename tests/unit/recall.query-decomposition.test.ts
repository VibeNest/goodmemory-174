import { describe, expect, it } from "bun:test";
import {
  decomposedRecall,
  splitQueryIntoSubQueries,
} from "../../src/recall/queryDecomposition";

describe("splitQueryIntoSubQueries", () => {
  it("splits a compound question on coordinating conjunctions", () => {
    expect(
      splitQueryIntoSubQueries(
        "What database do I use and which editor did I switch to?",
      ),
    ).toEqual(["What database do I use", "which editor did I switch to"]);
  });

  it("returns [] for a single-part query (no spurious decomposition)", () => {
    expect(splitQueryIntoSubQueries("Where do I live?")).toEqual([]);
    expect(splitQueryIntoSubQueries("")).toEqual([]);
  });

  it("splits across sentence boundaries too", () => {
    expect(
      splitQueryIntoSubQueries("What is my role? What is my current focus?"),
    ).toEqual(["What is my role", "What is my current focus"]);
  });

  it("dedupes and caps to maxSubQueries", () => {
    const result = splitQueryIntoSubQueries(
      "alpha topic and beta topic and alpha topic and gamma topic and delta topic",
      { maxSubQueries: 2 },
    );
    expect(result).toEqual(["alpha topic", "beta topic"]);
  });

  it("drops fragments shorter than minWords", () => {
    // "ok" is a single word, so it is not a sub-query; only the multi-word part
    // survives, which alone is fewer than two parts -> no decomposition.
    expect(splitQueryIntoSubQueries("ok and the build pipeline status")).toEqual(
      [],
    );
  });
});

describe("decomposedRecall", () => {
  it("runs a single recall and skips merge when the query does not decompose", async () => {
    const calls: string[] = [];
    const outcome = await decomposedRecall<string>({
      query: "Where do I live?",
      recall: async (query) => {
        calls.push(query);
        return `r:${query}`;
      },
      merge: () => {
        throw new Error("merge should not be called without decomposition");
      },
    });
    expect(calls).toEqual(["Where do I live?"]);
    expect(outcome.subQueries).toEqual([]);
    expect(outcome.queriesRun).toBe(1);
    expect(outcome.result).toBe("r:Where do I live?");
  });

  it("recalls the original plus each sub-query and merges", async () => {
    const calls: string[] = [];
    const outcome = await decomposedRecall<string>({
      query: "What is A and what is B?",
      decompose: () => ["what is A", "what is B"],
      recall: async (query) => {
        calls.push(query);
        return query;
      },
      merge: (primary, supplementary) =>
        [primary, ...supplementary].join(" | "),
    });
    expect(calls).toEqual([
      "What is A and what is B?",
      "what is A",
      "what is B",
    ]);
    expect(outcome.subQueries).toEqual(["what is A", "what is B"]);
    expect(outcome.queriesRun).toBe(3);
    expect(outcome.result).toBe("What is A and what is B? | what is A | what is B");
  });

  it("drops sub-queries equal to the original and respects maxSubQueries", async () => {
    const calls: string[] = [];
    const outcome = await decomposedRecall<string>({
      query: "q",
      decompose: () => ["q", "sub one", "sub two", "sub three"],
      recall: async (query) => {
        calls.push(query);
        return query;
      },
      merge: (primary, supplementary) => [primary, ...supplementary].join(","),
      options: { maxSubQueries: 2 },
    });
    expect(outcome.subQueries).toEqual(["sub one", "sub two"]);
    expect(calls).toEqual(["q", "sub one", "sub two"]);
    expect(outcome.queriesRun).toBe(3);
  });
});
