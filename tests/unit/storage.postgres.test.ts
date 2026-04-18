import { describe, expect, it } from "bun:test";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "../../src/storage/postgres";

describe("postgres storage adapter", () => {
  it("creates stores lazily without touching the database during construction", () => {
    const store = createPostgresDocumentStore({
      url: "postgres://localhost:5432/goodmemory",
    });

    expect(typeof store.get).toBe("function");
    expect(typeof store.query).toBe("function");
  });

  it("rejects invalid schema identifiers", () => {
    expect(() =>
      createPostgresDocumentStore({
        url: "postgres://localhost:5432/goodmemory",
        schema: "bad-schema",
      }),
    ).toThrow("Invalid Postgres schema");
  });

  it("rejects invalid vector table prefixes", () => {
    expect(() =>
      createPostgresVectorStore({
        url: "postgres://localhost:5432/goodmemory",
        vectorTablePrefix: "bad-prefix",
      }),
    ).toThrow("Invalid Postgres vectorTablePrefix");
  });

  it("rejects an empty postgres url", () => {
    expect(() =>
      createPostgresDocumentStore({
        url: "   ",
      }),
    ).toThrow("Postgres storage requires a non-empty url");
  });

  it("rejects document mutations in read-only mode before touching postgres", async () => {
    const store = createPostgresDocumentStore(
      {
        url: "postgres://localhost:5432/goodmemory",
      },
      {
        readOnly: true,
      },
    );

    await expect(
      store.set("facts", "fact-1", {
        id: "fact-1",
      }),
    ).rejects.toThrow("Postgres document store is read-only in this context.");
    await expect(
      store.update("facts", "fact-1", {
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Postgres document store is read-only in this context.");
    await expect(store.delete("facts", "fact-1")).rejects.toThrow(
      "Postgres document store is read-only in this context.",
    );
  });

  it("rejects session mutations in read-only mode before touching postgres", async () => {
    const store = createPostgresSessionStore(
      {
        url: "postgres://localhost:5432/goodmemory",
      },
      {
        readOnly: true,
      },
    );
    const scope = {
      userId: "u-1",
      workspaceId: "w-1",
      sessionId: "s-1",
    };

    await expect(
      store.saveBuffer(scope, {
        sessionId: "s-1",
        userId: "u-1",
        messages: [],
        summary: null,
        summaryUpToIndex: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastActiveAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Postgres session store is read-only in this context.");
    await expect(store.deleteBuffersByScope(scope)).rejects.toThrow(
      "Postgres session store is read-only in this context.",
    );
  });

  it("rejects vector mutations in read-only mode before touching postgres", async () => {
    const store = createPostgresVectorStore(
      {
        url: "postgres://localhost:5432/goodmemory",
      },
      {
        readOnly: true,
      },
    );

    await expect(
      store.upsert("facts", [
        {
          id: "fact-1",
          embedding: [0.1, 0.2],
          metadata: {},
          content: "fact",
        },
      ]),
    ).rejects.toThrow("Postgres vector store is read-only in this context.");
    await expect(store.delete("facts", "fact-1")).rejects.toThrow(
      "Postgres vector store is read-only in this context.",
    );
  });
});
