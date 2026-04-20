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
import {
  DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
  applySQLiteCustomLibrary,
  loadSQLiteVectorExtension,
  resolveSQLiteCustomLibraryConfig,
  resolveSQLiteVectorExtensionConfig,
  type SQLiteCustomLibraryConfig,
  type SQLiteVectorExtensionConfig,
} from "./sqliteRuntime";

type SQLiteBindingValue = string | number | boolean | null;

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

interface SQLiteVectorSearchRow extends VectorRow {
  score: number;
}

interface SQLiteVectorStoreDependencies {
  loadVectorExtension?: typeof loadSQLiteVectorExtension;
  vectorExtensionConfig?: SQLiteVectorExtensionConfig;
  runExtensionSearch?: (input: {
    collection: string;
    config: SQLiteVectorExtensionConfig;
    database: Database;
    filter?: Record<string, unknown>;
    queryEmbedding: number[];
    topK: number;
  }) => VectorSearchResult[] | null;
}

let sqliteCustomLibraryConfig: SQLiteCustomLibraryConfig | null = null;
let sqliteVectorExtensionConfig: SQLiteVectorExtensionConfig | null = null;

function ensureSQLiteCustomLibraryConfigured(): SQLiteCustomLibraryConfig {
  if (!sqliteCustomLibraryConfig) {
    sqliteCustomLibraryConfig = resolveSQLiteCustomLibraryConfig();
    applySQLiteCustomLibrary(sqliteCustomLibraryConfig, Database);
  }

  return sqliteCustomLibraryConfig;
}

function ensureSQLiteVectorExtensionConfigured(): SQLiteVectorExtensionConfig {
  if (!sqliteVectorExtensionConfig) {
    sqliteVectorExtensionConfig = resolveSQLiteVectorExtensionConfig();
  }

  return sqliteVectorExtensionConfig;
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
  ensureSQLiteCustomLibraryConfigured();
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

function canUseSQLiteJsonFilterValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function createSQLiteJsonFilterClause(input: {
  alias: string;
  keyParameterIndex: number;
  value: SQLiteBindingValue;
  valueParameterIndex?: number;
}): string {
  const { alias, keyParameterIndex, value, valueParameterIndex } = input;
  const clausePrefix = `EXISTS (
        SELECT 1
        FROM json_each(metadata_json) AS ${alias}
        WHERE ${alias}.key = ?${keyParameterIndex}`;

  if (value === null) {
    return `${clausePrefix}
          AND ${alias}.type = 'null'
      )`;
  }

  if (typeof value === "boolean") {
    return `${clausePrefix}
          AND ${alias}.type = '${value ? "true" : "false"}'
      )`;
  }

  if (typeof value === "number") {
    return `${clausePrefix}
          AND ${alias}.type IN ('integer', 'real')
          AND ${alias}.atom = ?${valueParameterIndex}
      )`;
  }

  return `${clausePrefix}
          AND ${alias}.type = 'text'
          AND ${alias}.atom = ?${valueParameterIndex}
      )`;
}

function searchSQLiteVectorsWithExtension(input: {
  collection: string;
  config: SQLiteVectorExtensionConfig;
  database: Database;
  filter?: Record<string, unknown>;
  queryEmbedding: number[];
  topK: number;
}): VectorSearchResult[] | null {
  const { collection, config, database, filter, queryEmbedding, topK } = input;
  if (config.mode === "off" || !config.paths?.length) {
    return null;
  }

  const values: SQLiteBindingValue[] = [collection, JSON.stringify(queryEmbedding)];
  const filterClauses: string[] = [];

  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (!canUseSQLiteJsonFilterValue(value)) {
        return null;
      }

      values.push(key);
      const keyParameterIndex = values.length;
      const alias = `metadata_filter_${filterClauses.length + 1}`;

      if (value === null || typeof value === "boolean") {
        filterClauses.push(
          createSQLiteJsonFilterClause({
            alias,
            keyParameterIndex,
            value,
          }),
        );
        continue;
      }

      values.push(value);
      filterClauses.push(
        createSQLiteJsonFilterClause({
          alias,
          keyParameterIndex,
          value,
          valueParameterIndex: values.length,
        }),
      );
    }
  }

  values.push(topK);
  const whereClauses = ["collection = ?1", ...filterClauses];
  const searchStatement = database.query<SQLiteVectorSearchRow, SQLiteBindingValue[]>(
    `SELECT
        id,
        embedding_json,
        metadata_json,
        content,
        ${(config.searchFunction || DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION)}(embedding_json, ?2) AS score
      FROM vectors
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY score DESC, id ASC
      LIMIT ?${values.length}`,
  );

  return searchStatement.all(...values).map((row) => ({
    id: row.id,
    embedding: parseJson<number[]>(row.embedding_json),
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    content: row.content,
    score: Number(row.score),
  }));
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
  dependencies?: SQLiteVectorStoreDependencies,
): VectorStore {
  const vectorExtensionConfig =
    dependencies?.vectorExtensionConfig ?? ensureSQLiteVectorExtensionConfigured();
  const database = createDatabase(path, options);
  if (!options?.readOnly) {
    ensureVectorSchema(database);
  }
  (dependencies?.loadVectorExtension ?? loadSQLiteVectorExtension)(
    vectorExtensionConfig,
    database,
  );
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

      if (vectorExtensionConfig.mode !== "off" && vectorExtensionConfig.paths?.length) {
        try {
          const extensionResults = (
            dependencies?.runExtensionSearch ?? searchSQLiteVectorsWithExtension
          )({
            collection,
            config: vectorExtensionConfig,
            database,
            filter: input.filter,
            queryEmbedding,
            topK: input.topK,
          });

          if (extensionResults !== null) {
            return extensionResults;
          }

          if (vectorExtensionConfig.mode === "require") {
            throw new Error(
              "SQLite vector extension search could not satisfy the current query without durable fallback.",
            );
          }
        } catch (error) {
          if (vectorExtensionConfig.mode === "require") {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
              `Failed to execute SQLite vector extension search for ${collection}: ${message}`,
            );
          }
        }
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
