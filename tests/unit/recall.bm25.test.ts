import { describe, expect, it } from "bun:test";
import { computeBm25Scores } from "../../src/recall/bm25";

describe("computeBm25Scores", () => {
  it("returns an empty map for no documents, no query terms, or no overlap", () => {
    expect(computeBm25Scores("alpha", []).size).toBe(0);
    expect(computeBm25Scores("", [{ id: "a", text: "alpha" }]).size).toBe(0);
    expect(
      computeBm25Scores("zzz", [{ id: "a", text: "alpha beta" }]).size,
    ).toBe(0);
  });

  it("rewards rare (high-IDF) matches over common (low-IDF) matches", () => {
    // "alpha" appears in 4/5 docs (common); "gamma" in 1/5 (rare).
    const scores = computeBm25Scores("alpha gamma", [
      { id: "common", text: "alpha" },
      { id: "rare", text: "gamma" },
      { id: "f1", text: "alpha" },
      { id: "f2", text: "alpha" },
      { id: "f3", text: "alpha" },
    ]);
    expect(scores.get("rare")).toBe(1); // normalized maximum
    expect(scores.get("rare")!).toBeGreaterThan(scores.get("common")!);
  });

  it("penalizes longer documents for the same single term occurrence", () => {
    const scores = computeBm25Scores("needle", [
      { id: "short", text: "needle" },
      {
        id: "long",
        text: "needle filler filler filler filler filler filler filler",
      },
    ]);
    expect(scores.get("short")).toBe(1);
    expect(scores.get("short")!).toBeGreaterThan(scores.get("long")!);
  });

  it("uses the injected tokenizer", () => {
    // A tokenizer that yields no tokens must produce no scores, proving it is used.
    expect(
      computeBm25Scores("alpha", [{ id: "x", text: "alpha" }], {
        tokenize: () => [],
      }).size,
    ).toBe(0);
  });

  it("is deterministic and independent of document order", () => {
    const documents = [
      { id: "a", text: "alpha beta" },
      { id: "b", text: "beta gamma gamma" },
      { id: "c", text: "alpha" },
    ];
    const forward = computeBm25Scores("alpha gamma", documents);
    const reversed = computeBm25Scores("alpha gamma", [...documents].reverse());
    for (const [id, score] of forward) {
      expect(reversed.get(id)).toBeCloseTo(score, 12);
    }
    expect(reversed.size).toBe(forward.size);
  });
});
