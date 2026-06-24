import { describe, expect, it } from "bun:test";
import {
  applyReranking,
  createLexicalCoverageReranker,
  type Reranker,
} from "../../src/recall/reranker";

const fakeReranker = (scores: Record<string, number>): Reranker => ({
  async rerank({ documents }) {
    return documents
      .filter((document) => document.id in scores)
      .map((document) => ({ id: document.id, score: scores[document.id] }));
  },
});

describe("applyReranking", () => {
  it("reorders items by the reranker's scores", async () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = await applyReranking({
      items,
      query: "q",
      reranker: fakeReranker({ a: 0.1, b: 0.9, c: 0.5 }),
      getText: (item) => item.id,
    });
    expect(result.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("only reranks the topK window and leaves the tail in place", async () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const result = await applyReranking({
      items,
      query: "q",
      reranker: fakeReranker({ a: 0.1, b: 0.9 }),
      getText: (item) => item.id,
      topK: 2,
    });
    // Window [a,b] reranked -> [b,a]; tail [c,d] unchanged.
    expect(result.map((item) => item.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("keeps unscored window items in stable original order at the end", async () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = await applyReranking({
      items,
      query: "q",
      reranker: fakeReranker({ b: 0.9 }),
      getText: (item) => item.id,
    });
    expect(result.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("returns a single item unchanged", async () => {
    const result = await applyReranking({
      items: [{ id: "only" }],
      query: "q",
      reranker: fakeReranker({}),
      getText: (item) => item.id,
    });
    expect(result.map((item) => item.id)).toEqual(["only"]);
  });
});

describe("createLexicalCoverageReranker", () => {
  it("scores higher query-term coverage above lower coverage", async () => {
    const reranker = createLexicalCoverageReranker();
    const scores = await reranker.rerank({
      query: "alpha beta gamma",
      documents: [
        { id: "all", text: "alpha beta gamma here" },
        { id: "one", text: "alpha only" },
        { id: "none", text: "unrelated words" },
      ],
    });
    const byId = new Map(scores.map((score) => [score.id, score.score]));
    expect(byId.get("all")!).toBeGreaterThan(byId.get("one")!);
    expect(byId.get("one")!).toBeGreaterThan(byId.get("none")!);
    expect(byId.get("none")).toBe(0);
  });

  it("adds an exact-phrase bonus", async () => {
    const reranker = createLexicalCoverageReranker();
    const scores = await reranker.rerank({
      query: "dark mode",
      documents: [
        { id: "phrase", text: "I enabled dark mode yesterday" },
        { id: "scattered", text: "mode of the dark room" },
      ],
    });
    const byId = new Map(scores.map((score) => [score.id, score.score]));
    // Both cover all terms; the exact-phrase doc wins via the bonus.
    expect(byId.get("phrase")!).toBeGreaterThan(byId.get("scattered")!);
  });
});
