import { describe, expect, it } from "bun:test";
import {
  createFakeDocumentStore,
  createFakeEmbeddingAdapter,
  createFakeLLMAdapter,
  createFakeSessionStore,
} from "../../src/testing/fakes";

describe("fake adapters", () => {
  it("returns predefined LLM responses", async () => {
    const llm = createFakeLLMAdapter([
      { content: "first" },
      { content: "second" },
    ]);

    expect((await llm.complete({ purpose: "test", prompt: "a" })).content).toBe(
      "first",
    );
    expect((await llm.complete({ purpose: "test", prompt: "b" })).content).toBe(
      "second",
    );
  });

  it("returns deterministic embeddings", async () => {
    const embedding = createFakeEmbeddingAdapter();
    const vectors = await embedding.embed(["alpha", "alpha", "beta"]);

    expect(vectors[0]).toEqual(vectors[1]);
    expect(vectors[0]).not.toEqual(vectors[2]);
  });

  it("persists predictable document records", async () => {
    const store = createFakeDocumentStore();

    await store.set("facts", "f-1", { id: "f-1", content: "hello" });
    expect(
      await store.get<{ id: string; content: string }>("facts", "f-1"),
    ).toEqual({
      id: "f-1",
      content: "hello",
    });
  });

  it("persists session state", async () => {
    const store = createFakeSessionStore();
    const scope = { userId: "u-1", sessionId: "s-1" };

    await store.saveBuffer(scope, {
      sessionId: "s-1",
      userId: "u-1",
      messages: [],
      summary: null,
      summaryUpToIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastActiveAt: "2026-01-01T00:00:00.000Z",
    });

    expect(await store.getBuffer(scope)).toBeDefined();
  });
});
