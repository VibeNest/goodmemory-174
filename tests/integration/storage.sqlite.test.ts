import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
} from "../../src/storage/sqlite";
import {
  runDocumentStoreContract,
  runSessionStoreContract,
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
