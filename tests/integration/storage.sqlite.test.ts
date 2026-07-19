import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGoodMemory } from "../../src";
import {
  CLAIM_PROJECTIONS_COLLECTION,
  CLAIM_PROJECTION_STATUS_COLLECTION,
  PROJECTION_REPAIRS_COLLECTION,
} from "../../src/recall/projections/contracts";
import type { DocumentStore } from "../../src/storage/contracts";
import { createInMemorySessionStore } from "../../src/storage/memory";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "../../src/storage/sqlite";
import {
  runDocumentStoreContract,
  runSessionStoreContract,
  runVectorStoreContract,
} from "./storage.contract";

runDocumentStoreContract("sqlite document store contract", () => {
  const path = join(tmpdir(), `goodmemory-sqlite-${Date.now()}-${Math.random()}.db`);

  return {
    store: createSQLiteDocumentStore(path),
    cleanup: () => rm(path, { force: true }),
  };
});

runSessionStoreContract("sqlite session store contract", () => {
  const path = join(
    tmpdir(),
    `goodmemory-sqlite-session-${Date.now()}-${Math.random()}.db`,
  );

  return {
    store: createSQLiteSessionStore(path),
    cleanup: () => rm(path, { force: true }),
  };
});

runVectorStoreContract("sqlite vector store contract", () => {
  const path = join(tmpdir(), `goodmemory-sqlite-vector-${Date.now()}-${Math.random()}.db`);

  return {
    store: createSQLiteVectorStore(path),
    cleanup: () => rm(path, { force: true }),
  };
});

describe("sqlite vector store read-only mode", () => {
  it("rejects vector mutations when opened read-only", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlite-vector-readonly-${Date.now()}-${Math.random()}.db`,
    );

    try {
      const writable = createSQLiteVectorStore(path);
      await writable.upsert("vectors", [
        {
          id: "vector-1",
          embedding: [1, 0, 0],
          metadata: { userId: "u-1" },
          content: "first",
        },
      ]);

      const readOnly = createSQLiteVectorStore(path, { readOnly: true });

      await expect(
        readOnly.upsert("vectors", [
          {
            id: "vector-2",
            embedding: [0, 1, 0],
            metadata: { userId: "u-1" },
            content: "second",
          },
        ]),
      ).rejects.toThrow("read-only");
      await expect(readOnly.delete("vectors", "vector-1")).rejects.toThrow(
        "read-only",
      );
      await expect(readOnly.get("vectors", "vector-1")).resolves.toMatchObject({
        id: "vector-1",
      });
    } finally {
      await rm(path, { force: true });
    }
  });
});

describe("sqlite document conditional batches", () => {
  it("surfaces write contention instead of reporting a CAS mismatch", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlite-contention-${Date.now()}-${Math.random()}.db`,
    );
    let blocker: Database | undefined;
    try {
      const store = createSQLiteDocumentStore(path);
      const expected = { id: "fact-1", content: "before" };
      await store.set("facts", expected.id, expected);
      blocker = new Database(path, { strict: true });
      blocker.exec("BEGIN IMMEDIATE");

      await expect(store.writeBatchIfUnchanged({
        expected: {
          collection: "facts",
          document: expected,
          id: expected.id,
        },
        set: [{
          collection: "facts",
          document: { ...expected, content: "after" },
          id: expected.id,
        }],
      })).rejects.toThrow();
      expect(await store.get("facts", expected.id)).toEqual(expected);
    } finally {
      try {
        blocker?.exec("ROLLBACK");
      } finally {
        blocker?.close();
      }
      await rm(path, { force: true });
    }
  });

  it("rejects remember and rolls back canonical data when busy blocks projection repair", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlite-projection-contention-${Date.now()}-${Math.random()}.db`,
    );
    let blocker: Database | undefined;
    try {
      const inner = createSQLiteDocumentStore(path);
      const store: DocumentStore = {
        set: async (collection, id, document) => {
          await inner.set(collection, id, document);
          if (collection === "facts" && !blocker) {
            blocker = new Database(path, { strict: true });
            blocker.exec("BEGIN IMMEDIATE");
          }
        },
        get: (collection, id) => inner.get(collection, id),
        update: (collection, id, patch) => inner.update(collection, id, patch),
        query: (collection, filter) => inner.query(collection, filter),
        delete: (collection, id) => inner.delete(collection, id),
        writeBatchIfUnchanged: async (input) => {
          try {
            return await inner.writeBatchIfUnchanged(input);
          } catch (error) {
            blocker?.exec("ROLLBACK");
            blocker?.close();
            blocker = undefined;
            throw error;
          }
        },
      };
      const memory = createGoodMemory({
        adapters: {
          documentStore: store,
          sessionStore: createInMemorySessionStore(),
        },
        retrieval: { preset: "recommended" },
        storage: { provider: "memory" },
      });

      await expect(memory.remember({
        scope: { userId: "busy-user", sessionId: "busy-session" },
        messages: [{
          role: "user",
          content: "Remember that Atlas status is blocked.",
        }],
      })).rejects.toThrow();

      expect(await inner.query("facts")).toEqual([]);
      expect(await inner.query(CLAIM_PROJECTIONS_COLLECTION)).toEqual([]);
      expect(await inner.query(CLAIM_PROJECTION_STATUS_COLLECTION)).toEqual([]);
      expect(await inner.query(PROJECTION_REPAIRS_COLLECTION)).toEqual([]);
    } finally {
      try {
        blocker?.exec("ROLLBACK");
      } finally {
        blocker?.close();
      }
      await rm(path, { force: true });
    }
  });
});

describe("sqlite session store read-only mode", () => {
  it("treats missing session tables as empty runtime state", async () => {
    const path = join(
      tmpdir(),
      `goodmemory-sqlite-session-readonly-${Date.now()}-${Math.random()}.db`,
    );

    try {
      const documentStore = createSQLiteDocumentStore(path);
      await documentStore.set("documents", "doc-1", {
        content: "durable only",
      });

      const readOnly = createSQLiteSessionStore(path, { readOnly: true });
      const scope = {
        userId: "u-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
      };

      await expect(readOnly.getBuffer(scope)).resolves.toBeNull();
      await expect(readOnly.getWorkingMemory(scope)).resolves.toBeNull();
      await expect(readOnly.getJournal(scope)).resolves.toBeNull();
    } finally {
      await rm(path, { force: true });
    }
  });
});
