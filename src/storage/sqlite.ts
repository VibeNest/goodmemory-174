import { Database } from "bun:sqlite";
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

interface SQLiteStoreOptions {
  readOnly?: boolean;
}

function createDatabase(
  path: string,
  options?: SQLiteStoreOptions,
): Database {
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

function parseJson<TValue>(json: string): TValue {
  return JSON.parse(json) as TValue;
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
