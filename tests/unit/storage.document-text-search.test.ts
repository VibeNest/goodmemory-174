import { describe, expect, it } from "bun:test";

import type { DocumentStore } from "../../src/storage/contracts";
import { createInMemoryDocumentStore } from "../../src/storage/memory";
import { createSQLiteDocumentStore } from "../../src/storage/sqlite";
import { buildPostgresDocumentSearchTerms } from "../../src/storage/textSearch";

interface SearchDocument {
  id: string;
  text: string;
  userId: string;
}

describe("postgres document text search terms", () => {
  it("builds token-OR full-text and substring terms", () => {
    expect(buildPostgresDocumentSearchTerms("PostgreSQL durable")).toEqual({
      substrings: ["%postgresql%", "%durable%"],
      tsQuery: "postgresql | durable",
    });
  });
});

async function seed(store: DocumentStore): Promise<void> {
  await store.set<SearchDocument>("recall_documents_v2", "d-1", {
    id: "d-1",
    text: "The project uses PostgreSQL for durable storage.",
    userId: "u-1",
  });
  await store.set<SearchDocument>("recall_documents_v2", "d-2", {
    id: "d-2",
    text: "PostgreSQL PostgreSQL backs the reporting database.",
    userId: "u-1",
  });
  await store.set<SearchDocument>("recall_documents_v2", "d-3", {
    id: "d-3",
    text: "PostgreSQL belongs to another user.",
    userId: "u-2",
  });
}

for (const [name, createStore] of [
  ["memory", createInMemoryDocumentStore],
  ["sqlite", () => createSQLiteDocumentStore(":memory:")],
] as const) {
  describe(`${name} document text search`, () => {
    it("ranks matching documents inside the requested filter and limit", async () => {
      const store = createStore();
      await seed(store);

      const results = await store.searchText!<SearchDocument>("recall_documents_v2", {
        field: "text",
        filter: { userId: "u-1" },
        limit: 1,
        query: "PostgreSQL database",
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("d-2");
      expect(results[0]?.document.userId).toBe("u-1");
      expect(results[0]?.score).toBeGreaterThan(0);
    });

    it("returns no candidates for a query with no searchable terms", async () => {
      const store = createStore();
      await seed(store);

      expect(
        await store.searchText!("recall_documents_v2", {
          field: "text",
          limit: 4,
          query: "   ",
        }),
      ).toEqual([]);
    });
  });
}
