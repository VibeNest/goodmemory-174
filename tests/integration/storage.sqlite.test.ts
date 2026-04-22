import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
