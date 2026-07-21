import { describe, expect, it } from "bun:test";

import type { DocumentStore } from "../../src/storage/contracts";
import { createInMemoryDocumentStore } from "../../src/storage/memory";
import { createSQLiteDocumentStore } from "../../src/storage/sqlite";
import { buildPostgresDocumentSearchTerms } from "../../src/storage/textSearch";

interface SearchDocument {
  id: string;
  searchText?: string;
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

  it("uses a locale-neutral case fold without segmenting analyzer terms", () => {
    expect(buildPostgresDocumentSearchTerms("東京 ZOR ı")).toEqual({
      substrings: ["%東京%", "%zor%", "%ı%"],
      tsQuery: "東京 | zor | ı",
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

    it("searches caller-tokenized Japanese and Traditional Chinese terms", async () => {
      const store = createStore();
      await store.set<SearchDocument>("recall_documents_v2", "cjk-1", {
        id: "cjk-1",
        searchText: "東京 旅行 計画",
        text: "東京への旅行計画を立てる。",
        userId: "u-cjk",
      });
      await store.set<SearchDocument>("recall_documents_v2", "cjk-2", {
        id: "cjk-2",
        searchText: "東京 東京 東京 計画",
        text: "東京旅行の計画を更新する。",
        userId: "u-cjk",
      });
      await store.set<SearchDocument>("recall_documents_v2", "cjk-3", {
        id: "cjk-3",
        searchText: "偏好 繁體 中文 回覆",
        text: "偏好繁體中文回覆。",
        userId: "u-cjk",
      });

      await expect(store.searchText!<SearchDocument>("recall_documents_v2", {
        field: "searchText",
        filter: { userId: "u-cjk" },
        limit: 1,
        query: "東京 計画",
      })).resolves.toEqual([
        expect.objectContaining({ id: "cjk-2" }),
      ]);
      await expect(store.searchText!<SearchDocument>("recall_documents_v2", {
        field: "searchText",
        filter: { userId: "u-cjk" },
        limit: 2,
        query: "繁體 回覆",
      })).resolves.toEqual([
        expect.objectContaining({ id: "cjk-3" }),
      ]);
    });

    it("does not segment raw continuous CJK queries inside storage", async () => {
      const store = createStore();
      await store.set<SearchDocument>("recall_documents_v2", "cjk-1", {
        id: "cjk-1",
        searchText: "東京 旅行 計画 偏好 繁體 中文 回覆",
        text: "東京旅行と偏好繁體中文回覆。",
        userId: "u-cjk",
      });

      await expect(store.searchText!("recall_documents_v2", {
        field: "searchText",
        limit: 2,
        query: "東京旅行",
      })).resolves.toEqual([]);
      await expect(store.searchText!("recall_documents_v2", {
        field: "searchText",
        limit: 2,
        query: "繁體中文",
      })).resolves.toEqual([]);
    });
  });
}
