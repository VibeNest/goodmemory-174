import { describe, expect, it } from "bun:test";
import {
  createPostgresDocumentStore,
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
});
