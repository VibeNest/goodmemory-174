import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  SessionBuffer,
  SessionJournal,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey, scopeToPrefix } from "../domain/scope";
import type {
  DocumentStore,
  SessionStore,
  StorageDocument,
  VectorRecord,
  VectorSearchResult,
  VectorStore,
} from "./contracts";
import {
  matchesFilter,
  shallowMergeDocument,
} from "./contracts";

interface DocumentRow {
  json: string;
}

interface SessionRow {
  json: string;
}

interface VectorRow {
  id: string;
  content: string;
  embedding_json: string;
  metadata_json: string;
}

interface SQLiteStoreOptions {
  readOnly?: boolean;
}

function ensureParentDirectory(path: string, options?: SQLiteStoreOptions): void {
  if (options?.readOnly || path === ":memory:") {
    return;
  }

  mkdirSync(dirname(path), {
    recursive: true,
  });
}

function createDatabase(
  path: string,
  options?: SQLiteStoreOptions,
): Database {
  ensureParentDirectory(path, options);
  return new Database(path, {
    create: options?.readOnly ? false : true,
    readonly: options?.readOnly ?? false,
    strict: true,
  });
}

function ensureDocumentSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      json TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);
}

function ensureSessionSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_buffers (
      scope_key TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_working_memory (
      scope_key TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_journals (
      scope_key TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
  `);
}

function ensureVectorSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);
}

function parseJson<TValue>(json: string): TValue {
  return JSON.parse(json) as TValue;
}

function hasTable(database: Database, tableName: string): boolean {
  const row = database.query<{ name: string }, [string]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1`,
  ).get(tableName);

  return row !== null && row !== undefined;
}

function createReadOnlyMutationError(store: string): Error {
  return new Error(`SQLite ${store} store is read-only in this context.`);
}

function scoreDotProduct(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += left[index]! * right[index]!;
  }

  return score;
}

export function createSQLiteDocumentStore(
  path: string,
  options?: SQLiteStoreOptions,
): DocumentStore {
  const database = createDatabase(path, options);
  if (!options?.readOnly) {
    ensureDocumentSchema(database);
  }

  const upsertStatement = database.query(
    `INSERT INTO documents (collection, id, json)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(collection, id) DO UPDATE SET json = excluded.json`,
  );
  const getStatement = database.query<DocumentRow, [string, string]>(
    `SELECT json FROM documents WHERE collection = ?1 AND id = ?2`,
  );
  const listStatement = database.query<DocumentRow, [string]>(
    `SELECT json FROM documents WHERE collection = ?1`,
  );
  const deleteStatement = database.query(
    `DELETE FROM documents WHERE collection = ?1 AND id = ?2`,
  );

  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
      upsertStatement.run(collection, id, JSON.stringify(document));
    },

    async get<TDocument extends StorageDocument>(collection: string, id: string) {
      const row = getStatement.get(collection, id);
      return row ? (parseJson(row.json) as TDocument) : null;
    },

    async update<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      patch: Partial<TDocument>,
    ) {
      const current = await this.get(collection, id);

      if (!current) {
        throw new Error(`Document not found for update: ${collection}/${id}`);
      }

      await this.set(collection, id, shallowMergeDocument(current, patch));
    },

    async query<TDocument extends StorageDocument>(
      collection: string,
      filter?: Record<string, unknown>,
    ) {
      const rows = listStatement.all(collection);

      return rows
        .map((row) => parseJson<TDocument>(row.json))
        .filter((document) => matchesFilter(document, filter));
    },

    async delete(collection, id) {
      deleteStatement.run(collection, id);
    },
  };
}

function createSQLiteScopedStore<TValue>(
  database: Database,
  tableName: "session_buffers" | "session_working_memory" | "session_journals",
): {
  set(scope: MemoryScope, value: TValue): Promise<void>;
  get(scope: MemoryScope): Promise<TValue | null>;
  deleteByScope(scope: MemoryScope): Promise<number>;
} {
  const upsertStatement = database.query(
    `INSERT INTO ${tableName} (scope_key, json)
     VALUES (?1, ?2)
     ON CONFLICT(scope_key) DO UPDATE SET json = excluded.json`,
  );
  const getStatement = database.query<SessionRow, [string]>(
    `SELECT json FROM ${tableName} WHERE scope_key = ?1`,
  );
  const deleteExactStatement = database.query(
    `DELETE FROM ${tableName} WHERE scope_key = ?1`,
  );
  const deletePrefixStatement = database.query(
    `DELETE FROM ${tableName} WHERE scope_key LIKE ?1`,
  );

  return {
    async set(scope, value) {
      upsertStatement.run(scopeToKey(scope), JSON.stringify(value));
    },

    async get(scope) {
      const row = getStatement.get(scopeToKey(scope));
      return row ? parseJson<TValue>(row.json) : null;
    },

    async deleteByScope(scope) {
      if (scope.sessionId !== undefined) {
        const result = deleteExactStatement.run(scopeToKey(scope));
        return Number(result.changes ?? 0);
      }

      const result = deletePrefixStatement.run(`${scopeToPrefix(scope)}%`);
      return Number(result.changes ?? 0);
    },
  };
}

export function createSQLiteSessionStore(
  path: string,
  options?: SQLiteStoreOptions,
): SessionStore {
  const database = createDatabase(path, options);
  if (!options?.readOnly) {
    ensureSessionSchema(database);
  }

  const buffers = createSQLiteScopedStore<SessionBuffer>(database, "session_buffers");
  const workingMemory = createSQLiteScopedStore<WorkingMemorySnapshot>(
    database,
    "session_working_memory",
  );
  const journals = createSQLiteScopedStore<SessionJournal>(database, "session_journals");

  return {
    saveBuffer(scope, buffer) {
      return buffers.set(scope, buffer);
    },

    getBuffer(scope) {
      return buffers.get(scope);
    },

    deleteBuffersByScope(scope) {
      return buffers.deleteByScope(scope);
    },

    saveWorkingMemory(scope, snapshot) {
      return workingMemory.set(scope, snapshot);
    },

    getWorkingMemory(scope) {
      return workingMemory.get(scope);
    },

    deleteWorkingMemoryByScope(scope) {
      return workingMemory.deleteByScope(scope);
    },

    saveJournal(scope, journal) {
      return journals.set(scope, journal);
    },

    getJournal(scope) {
      return journals.get(scope);
    },

    deleteJournalsByScope(scope) {
      return journals.deleteByScope(scope);
    },
  };
}

export function createSQLiteVectorStore(
  path: string,
  options?: SQLiteStoreOptions,
): VectorStore {
  const database = createDatabase(path, options);
  if (!options?.readOnly) {
    ensureVectorSchema(database);
  }
  const hasVectorTable = !options?.readOnly || hasTable(database, "vectors");

  const upsertStatement = options?.readOnly
    ? null
    : database.query(
        `INSERT INTO vectors (
            collection,
            id,
            embedding_json,
            metadata_json,
            content
          ) VALUES (?1, ?2, ?3, ?4, ?5)
          ON CONFLICT(collection, id) DO UPDATE SET
            embedding_json = excluded.embedding_json,
            metadata_json = excluded.metadata_json,
            content = excluded.content`,
      );
  const getStatement = hasVectorTable
    ? database.query<VectorRow, [string, string]>(
        `SELECT id, embedding_json, metadata_json, content
         FROM vectors
         WHERE collection = ?1 AND id = ?2`,
      )
    : null;
  const listStatement = hasVectorTable
    ? database.query<VectorRow, [string]>(
        `SELECT id, embedding_json, metadata_json, content
         FROM vectors
         WHERE collection = ?1`,
      )
    : null;
  const deleteStatement = options?.readOnly
    ? null
    : database.query(
        `DELETE FROM vectors WHERE collection = ?1 AND id = ?2`,
      );

  return {
    async upsert(collection, records) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("vector");
      }

      for (const record of records) {
        upsertStatement!.run(
          collection,
          record.id,
          JSON.stringify(record.embedding),
          JSON.stringify(record.metadata),
          record.content,
        );
      }
    },

    async get(collection, id) {
      if (!hasVectorTable) {
        return null;
      }

      const row = getStatement!.get(collection, id);
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        embedding: parseJson<number[]>(row.embedding_json),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        content: row.content,
      };
    },

    async search(collection, queryEmbedding, input) {
      if (input.topK <= 0 || queryEmbedding.length === 0) {
        return [];
      }

      if (!hasVectorTable) {
        return [];
      }

      return listStatement!
        .all(collection)
        .map<VectorSearchResult>((row) => {
          const embedding = parseJson<number[]>(row.embedding_json);
          const metadata = parseJson<Record<string, unknown>>(row.metadata_json);
          return {
            id: row.id,
            embedding,
            metadata,
            content: row.content,
            score: scoreDotProduct(embedding, queryEmbedding),
          };
        })
        .filter((record) => matchesFilter(record.metadata, input.filter))
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.id.localeCompare(right.id);
        })
        .slice(0, input.topK);
    },

    async delete(collection, id) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("vector");
      }

      deleteStatement!.run(collection, id);
    },
  };
}
