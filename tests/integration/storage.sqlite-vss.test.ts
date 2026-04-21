import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { createSQLiteVectorStore } from "../../src/storage/sqlite";
import type { SQLiteVectorExtensionConfig } from "../../src/storage/sqliteRuntime";
import {
  DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
  detectBundledSQLiteVssRuntime,
} from "../../src/storage/sqliteRuntime";

const SQLITE_VSS_RUNTIME = detectBundledSQLiteVssRuntime();
const maybeDescribe = SQLITE_VSS_RUNTIME ? describe : describe.skip;
const SQLITE_VECTOR_ACCELERATION_OFF = {
  backend: "none",
  mode: "off",
  paths: [],
  searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
} satisfies SQLiteVectorExtensionConfig;

function loadSQLiteVssExtensions(database: Database): void {
  for (const extensionPath of SQLITE_VSS_RUNTIME!.paths) {
    database.loadExtension(extensionPath);
  }
}

maybeDescribe("sqlite-vss indexed local backend", () => {
  it("creates a real vss virtual table and keeps indexed search durable across store instances", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlitevss-${Date.now()}-${Math.random()}.db`,
    );

    try {
      const first = createSQLiteVectorStore(path);
      await first.upsert("facts", [
        {
          id: "fact-1",
          embedding: [0, 1, 0],
          metadata: { userId: "u-1" },
          content: "first",
        },
        {
          id: "fact-2",
          embedding: [1, 0, 0],
          metadata: { userId: "u-1" },
          content: "second",
        },
        {
          id: "fact-3",
          embedding: [0.9, 0.1, 0],
          metadata: { userId: "u-1" },
          content: "third",
        },
      ]);

      const second = createSQLiteVectorStore(path);
      const results = await second.search("facts", [1, 0, 0], {
        topK: 2,
        filter: { userId: "u-1" },
      });

      const db = new Database(path, { strict: true });
      loadSQLiteVssExtensions(db);
      const vssTable = db.query<{ name: string }, []>(
        "select name from sqlite_master where type = 'table' and name = 'vss_vectors_facts_dim_3'",
      ).get();
      const rows = db
        .query<{ rowid: number }, []>("select rowid from vss_vectors_facts_dim_3")
        .all();

      expect(vssTable?.name).toBe("vss_vectors_facts_dim_3");
      expect(rows.length).toBe(3);
      expect(results.map((record) => record.id)).toEqual(["fact-2", "fact-3"]);
    } finally {
      await rm(path, { force: true });
    }
  });

  it("reconciles an existing vss table with durable vectors after fallback writes", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlitevss-reconcile-${Date.now()}-${Math.random()}.db`,
    );

    try {
      const accelerated = createSQLiteVectorStore(path);
      await accelerated.upsert("facts", [
        {
          id: "fact-old",
          embedding: [1, 0, 0],
          metadata: { userId: "u-1" },
          content: "old before fallback",
        },
      ]);
      const initialAcceleratedResults = await accelerated.search("facts", [1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1" },
      });

      const fallback = createSQLiteVectorStore(
        path,
        undefined,
        {
          vectorExtensionConfig: SQLITE_VECTOR_ACCELERATION_OFF,
        },
      );
      await fallback.upsert("facts", [
        {
          id: "fact-old",
          embedding: [0, 1, 0],
          metadata: { userId: "u-1" },
          content: "old after fallback",
        },
        {
          id: "fact-new",
          embedding: [1, 0, 0],
          metadata: { userId: "u-1" },
          content: "new from fallback",
        },
      ]);

      const cachedAcceleratedResults = await accelerated.search("facts", [1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1" },
      });

      const readOnly = createSQLiteVectorStore(path, { readOnly: true });
      const readOnlyResults = await readOnly.search("facts", [1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1" },
      });

      const resumed = createSQLiteVectorStore(path);
      const results = await resumed.search("facts", [1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1" },
      });

      const db = new Database(path, { strict: true });
      loadSQLiteVssExtensions(db);
      const rows = db
        .query<{ rowid: number }, []>("select rowid from vss_vectors_facts_dim_3")
        .all();

      expect(rows.length).toBe(2);
      expect(initialAcceleratedResults.map((record) => record.id)).toEqual([
        "fact-old",
      ]);
      expect(cachedAcceleratedResults.map((record) => record.id)).toEqual([
        "fact-new",
      ]);
      expect(readOnlyResults.map((record) => record.id)).toEqual(["fact-new"]);
      expect(results.map((record) => record.id)).toEqual(["fact-new"]);
    } finally {
      await rm(path, { force: true });
    }
  });

  it("keeps similarly named collections in separate vss indexes", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlitevss-collections-${Date.now()}-${Math.random()}.db`,
    );

    try {
      const store = createSQLiteVectorStore(path);
      await store.upsert("a_b", [
        {
          id: "foreign",
          embedding: [1, 0, 0],
          metadata: { userId: "u-1" },
          content: "foreign collection",
        },
      ]);
      await store.upsert("a-b", [
        {
          id: "target",
          embedding: [0.9, 0.1, 0],
          metadata: { userId: "u-1" },
          content: "target collection",
        },
      ]);

      const results = await store.search("a-b", [1, 0, 0], {
        topK: 1,
        filter: { userId: "u-1" },
      });

      expect(results.map((record) => record.id)).toEqual(["target"]);
    } finally {
      await rm(path, { force: true });
    }
  });
});
