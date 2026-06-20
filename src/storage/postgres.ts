import { SQL } from "bun";
import type {
  SessionBuffer,
  SessionJournal,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey, scopeToPrefix } from "../domain/scope";
import type {
  ConditionalDocumentWriteBatch,
  DocumentStore,
  SessionStore,
  StorageDocument,
  StorageFilter,
  VectorSearchResult,
  VectorStore,
} from "./contracts";

export interface PostgresStorageConfig {
  url: string;
  schema?: string;
  vectorTablePrefix?: string;
}

export type PostgresVectorExtensionStatus =
  | "available"
  | "installed"
  | "missing";

export type ReadOnlyPostgresStorageProbeResult =
  | "readable"
  | "unusable"
  | "inconclusive";

export interface PostgresStorageBootstrapDependencies {
  ensureStorageBackend?: (config: PostgresStorageConfig) => Promise<void>;
  getVectorExtensionStatus?: (
    config: PostgresStorageConfig,
  ) => Promise<PostgresVectorExtensionStatus>;
}

export interface ReadOnlyPostgresStorageProbeDependencies {
  getVectorExtensionStatus?: (
    config: PostgresStorageConfig,
  ) => Promise<PostgresVectorExtensionStatus>;
  hasExistingStorageBackend?: (config: PostgresStorageConfig) => Promise<boolean>;
}

interface PostgresStoreOptions {
  readOnly?: boolean;
}

type SessionStateKind = "buffer" | "working_memory" | "journal";

interface DocumentRow {
  document_json: string;
}

interface SessionRow {
  payload_json: string;
}

interface VectorRow {
  id: string;
  embedding_json: string;
  metadata_json: string;
  content: string;
  score: number;
}

interface PostgresRuntime {
  sql: SQL;
  schema: string;
  documentTable: string;
  sessionStateTable: string;
  vectorTable: string;
  hasDocumentStore(): Promise<boolean>;
  hasSessionStore(): Promise<boolean>;
  hasVectorStore(): Promise<boolean>;
  ensureDocumentStore(): Promise<void>;
  ensureSessionStore(): Promise<void>;
  ensureVectorStore(): Promise<void>;
}

const DEFAULT_SCHEMA = "public";
const DEFAULT_VECTOR_TABLE_PREFIX = "gm";
const DOCUMENT_TABLE_NAME = "gm_documents";
const SESSION_STATE_TABLE_NAME = "gm_session_state";
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const runtimeCache = new Map<string, PostgresRuntime>();

function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  if (trimmed.length === 0) {
    throw new Error("Postgres storage requires a non-empty url");
  }

  return trimmed;
}

function validateIdentifier(value: string, label: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `Invalid Postgres ${label}: ${value}. Use only letters, digits, and underscores, and start with a letter or underscore.`,
    );
  }

  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value}"`;
}

function qualifyTable(schema: string, tableName: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function bindJson(value: unknown): string {
  return serializeJson(value);
}

function parseJson<TValue>(value: unknown): TValue {
  if (typeof value !== "string") {
    return value as TValue;
  }

  const parsed = JSON.parse(value) as unknown;

  if (typeof parsed !== "string") {
    return parsed as TValue;
  }

  try {
    return JSON.parse(parsed) as TValue;
  } catch {
    return parsed as TValue;
  }
}

function hasFilter(filter?: StorageFilter): filter is StorageFilter {
  return Boolean(filter && Object.keys(filter).length > 0);
}

function buildJsonbFilterClause(
  column: string,
  filter: StorageFilter | undefined,
  values: unknown[],
): string {
  if (!hasFilter(filter)) {
    return "";
  }

  values.push(bindJson(filter));
  return ` AND ${column} @> $${values.length}::text::jsonb`;
}

function serializePgArray(values: number[]): string {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Postgres vector embeddings must contain only finite numbers");
  }

  return `{${values.join(",")}}`;
}

function serializeVectorLiteral(values: number[]): string {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Postgres vector embeddings must contain only finite numbers");
  }

  return `[${values.join(",")}]`;
}

function createInitializer(action: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | null = null;

  return async () => {
    if (!pending) {
      pending = action().catch((error) => {
        pending = null;
        throw error;
      });
    }

    await pending;
  };
}

function createReadOnlyMutationError(store: string): Error {
  return new Error(`Postgres ${store} store is read-only in this context.`);
}

async function relationExists(sql: SQL, relationName: string): Promise<boolean> {
  const rows = await sql.unsafe<Array<{ oid: string | null }>>(
    "SELECT to_regclass($1)::text AS oid",
    [relationName],
  );

  return rows[0]?.oid !== null && rows[0]?.oid !== undefined;
}

function createRuntime(config: PostgresStorageConfig): PostgresRuntime {
  const url = normalizeUrl(config.url);
  const schema = validateIdentifier(config.schema ?? DEFAULT_SCHEMA, "schema");
  const vectorTablePrefix = validateIdentifier(
    config.vectorTablePrefix ?? DEFAULT_VECTOR_TABLE_PREFIX,
    "vectorTablePrefix",
  );
  const vectorTableName = `${vectorTablePrefix}_vectors`;
  const cacheKey = serializeJson({
    url,
    schema,
    vectorTablePrefix,
  });
  const cached = runtimeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const sql = new SQL(url, { prepare: false });
  const quotedSchema = quoteIdentifier(schema);
  const documentTable = qualifyTable(schema, DOCUMENT_TABLE_NAME);
  const sessionStateTable = qualifyTable(schema, SESSION_STATE_TABLE_NAME);
  const vectorTable = qualifyTable(schema, vectorTableName);
  const documentRelationName = `${schema}.${DOCUMENT_TABLE_NAME}`;
  const sessionStateRelationName = `${schema}.${SESSION_STATE_TABLE_NAME}`;
  const vectorRelationName = `${schema}.${vectorTableName}`;

  const ensureSchema = createInitializer(async () => {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
  });

  const runtime: PostgresRuntime = {
    sql,
    schema,
    documentTable,
    sessionStateTable,
    vectorTable,
    hasDocumentStore: () => relationExists(sql, documentRelationName),
    hasSessionStore: () => relationExists(sql, sessionStateRelationName),
    hasVectorStore: () => relationExists(sql, vectorRelationName),
    ensureDocumentStore: createInitializer(async () => {
      await ensureSchema();
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${documentTable} (
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          document JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (collection, id)
        )
      `);
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS ${quoteIdentifier("gm_documents_collection_idx")}
        ON ${documentTable} (collection)
      `);
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS ${quoteIdentifier("gm_documents_document_gin_idx")}
        ON ${documentTable} USING GIN (document)
      `);
    }),
    ensureSessionStore: createInitializer(async () => {
      await ensureSchema();
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${sessionStateTable} (
          scope_key TEXT NOT NULL,
          state_kind TEXT NOT NULL,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (scope_key, state_kind)
        )
      `);
    }),
    ensureVectorStore: createInitializer(async () => {
      await ensureSchema();
      await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${vectorTable} (
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          embedding DOUBLE PRECISION[] NOT NULL,
          metadata JSONB NOT NULL,
          content TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (collection, id)
        )
      `);
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${vectorTableName}_collection_idx`)}
        ON ${vectorTable} (collection)
      `);
      await sql.unsafe(`
        CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${vectorTableName}_metadata_gin_idx`)}
        ON ${vectorTable} USING GIN (metadata)
      `);
    }),
  };

  runtimeCache.set(cacheKey, runtime);
  return runtime;
}

function createPostgresSessionStateStore<TValue>(
  runtime: PostgresRuntime,
  stateKind: SessionStateKind,
  options?: PostgresStoreOptions,
): {
  set(scope: MemoryScope, value: TValue): Promise<void>;
  get(scope: MemoryScope): Promise<TValue | null>;
  deleteByScope(scope: MemoryScope): Promise<number>;
} {
  return {
    async set(scope, value) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("session");
      }

      await runtime.ensureSessionStore();
      await runtime.sql.unsafe(
        `
          INSERT INTO ${runtime.sessionStateTable} (
            scope_key,
            state_kind,
            payload,
            updated_at
          ) VALUES (
            $1,
            $2,
            $3::text::jsonb,
            NOW()
          )
          ON CONFLICT (scope_key, state_kind)
          DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        `,
        [scopeToKey(scope), stateKind, bindJson(value)],
      );
    },

    async get(scope) {
      if (options?.readOnly && !(await runtime.hasSessionStore())) {
        return null;
      }

      if (!options?.readOnly) {
        await runtime.ensureSessionStore();
      }
      const rows = await runtime.sql.unsafe<SessionRow[]>(
        `
          SELECT payload::text AS payload_json
          FROM ${runtime.sessionStateTable}
          WHERE scope_key = $1 AND state_kind = $2
        `,
        [scopeToKey(scope), stateKind],
      );
      const row = rows[0];

      return row ? parseJson<TValue>(row.payload_json) : null;
    },

    async deleteByScope(scope) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("session");
      }

      await runtime.ensureSessionStore();

      if (scope.sessionId !== undefined) {
        const rows = await runtime.sql.unsafe<Array<{ count: number }>>(
          `
            DELETE FROM ${runtime.sessionStateTable}
            WHERE scope_key = $1 AND state_kind = $2
            RETURNING 1 AS count
          `,
          [scopeToKey(scope), stateKind],
        );
        return rows.length;
      }

      const rows = await runtime.sql.unsafe<Array<{ count: number }>>(
        `
          DELETE FROM ${runtime.sessionStateTable}
          WHERE scope_key LIKE $1 AND state_kind = $2
          RETURNING 1 AS count
        `,
        [`${scopeToPrefix(scope)}%`, stateKind],
      );
      return rows.length;
    },
  };
}

export function createPostgresDocumentStore(
  config: PostgresStorageConfig,
  options?: PostgresStoreOptions,
): DocumentStore {
  const runtime = createRuntime(config);

  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("document");
      }

      await runtime.ensureDocumentStore();
      await runtime.sql.unsafe(
        `
          INSERT INTO ${runtime.documentTable} (
            collection,
            id,
            document,
            created_at,
            updated_at
          ) VALUES (
            $1,
            $2,
            $3::text::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (collection, id)
          DO UPDATE SET
            document = EXCLUDED.document,
            updated_at = EXCLUDED.updated_at
        `,
        [collection, id, bindJson(document)],
      );
    },

    async get<TDocument extends StorageDocument>(collection: string, id: string) {
      if (options?.readOnly && !(await runtime.hasDocumentStore())) {
        return null;
      }

      if (!options?.readOnly) {
        await runtime.ensureDocumentStore();
      }
      const rows = await runtime.sql.unsafe<DocumentRow[]>(
        `
          SELECT document::text AS document_json
          FROM ${runtime.documentTable}
          WHERE collection = $1 AND id = $2
        `,
        [collection, id],
      );
      const row = rows[0];

      return row ? parseJson<TDocument>(row.document_json) : null;
    },

    async update<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      patch: Partial<TDocument>,
    ) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("document");
      }

      await runtime.ensureDocumentStore();
      const rows = await runtime.sql.unsafe<Array<{ id: string }>>(
        `
          UPDATE ${runtime.documentTable}
          SET
            document = document || $3::text::jsonb,
            updated_at = NOW()
          WHERE collection = $1 AND id = $2
          RETURNING id
        `,
        [collection, id, bindJson(patch)],
      );

      if (rows.length === 0) {
        throw new Error(`Document not found for update: ${collection}/${id}`);
      }
    },

    async query<TDocument extends StorageDocument>(
      collection: string,
      filter?: Record<string, unknown>,
    ) {
      if (options?.readOnly && !(await runtime.hasDocumentStore())) {
        return [];
      }

      if (!options?.readOnly) {
        await runtime.ensureDocumentStore();
      }
      const values: unknown[] = [collection];
      const filterClause = buildJsonbFilterClause("document", filter, values);
      const rows = await runtime.sql.unsafe<DocumentRow[]>(
        `
          SELECT document::text AS document_json
          FROM ${runtime.documentTable}
          WHERE collection = $1${filterClause}
          ORDER BY id ASC
        `,
        values,
      );

      return rows.map((row) => parseJson<TDocument>(row.document_json));
    },

    async writeBatchIfUnchanged(input: ConditionalDocumentWriteBatch) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("document");
      }

      await runtime.ensureDocumentStore();

      return runtime.sql.begin(async (tx) => {
        const expectedRows = await tx.unsafe<Array<{ id: string }>>(
          `
            SELECT id
            FROM ${runtime.documentTable}
            WHERE collection = $1
              AND id = $2
              AND document = $3::text::jsonb
            FOR UPDATE
          `,
          [
            input.expected.collection,
            input.expected.id,
            bindJson(input.expected.document),
          ],
        );

        if (expectedRows.length === 0) {
          return false;
        }

        for (const operation of input.set) {
          await tx.unsafe(
            `
              INSERT INTO ${runtime.documentTable} (
                collection,
                id,
                document,
                created_at,
                updated_at
              ) VALUES (
                $1,
                $2,
                $3::text::jsonb,
                NOW(),
                NOW()
              )
              ON CONFLICT (collection, id)
              DO UPDATE SET
                document = EXCLUDED.document,
                updated_at = EXCLUDED.updated_at
            `,
            [
              operation.collection,
              operation.id,
              bindJson(operation.document),
            ],
          );
        }

        return true;
      });
    },

    async delete(collection, id) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("document");
      }

      await runtime.ensureDocumentStore();
      await runtime.sql.unsafe(
        `
          DELETE FROM ${runtime.documentTable}
          WHERE collection = $1 AND id = $2
        `,
        [collection, id],
      );
    },
  };
}

export function createPostgresSessionStore(
  config: PostgresStorageConfig,
  options?: PostgresStoreOptions,
): SessionStore {
  const runtime = createRuntime(config);
  const buffers = createPostgresSessionStateStore<SessionBuffer>(
    runtime,
    "buffer",
    options,
  );
  const workingMemory = createPostgresSessionStateStore<WorkingMemorySnapshot>(
    runtime,
    "working_memory",
    options,
  );
  const journals = createPostgresSessionStateStore<SessionJournal>(
    runtime,
    "journal",
    options,
  );

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

export function createPostgresVectorStore(
  config: PostgresStorageConfig,
  options?: PostgresStoreOptions,
): VectorStore {
  const runtime = createRuntime(config);

  return {
    async upsert(collection, records) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("vector");
      }

      await runtime.ensureVectorStore();

      await runtime.sql.begin(async (tx) => {
        for (const record of records) {
          await tx.unsafe(
            `
              INSERT INTO ${runtime.vectorTable} (
                collection,
                id,
                embedding,
                metadata,
                content,
                updated_at
              ) VALUES (
                $1,
                $2,
                $3::double precision[],
                $4::text::jsonb,
                $5,
                NOW()
              )
              ON CONFLICT (collection, id)
              DO UPDATE SET
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata,
                content = EXCLUDED.content,
                updated_at = EXCLUDED.updated_at
            `,
            [
              collection,
              record.id,
              serializePgArray(record.embedding),
              bindJson(record.metadata),
              record.content,
            ],
          );
        }
      });
    },

    async get(collection, id) {
      if (options?.readOnly && !(await runtime.hasVectorStore())) {
        return null;
      }

      if (!options?.readOnly) {
        await runtime.ensureVectorStore();
      }

      const rows = await runtime.sql.unsafe<VectorRow[]>(
        `
          SELECT
            id,
            array_to_json(embedding)::text AS embedding_json,
            metadata::text AS metadata_json,
            content,
            0 AS score
          FROM ${runtime.vectorTable}
          WHERE collection = $1 AND id = $2
          LIMIT 1
        `,
        [collection, id],
      );
      const row = rows[0];

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

      if (options?.readOnly && !(await runtime.hasVectorStore())) {
        return [];
      }

      if (!options?.readOnly) {
        await runtime.ensureVectorStore();
      }

      const values: unknown[] = [collection];
      const metadataClause = buildJsonbFilterClause("metadata", input.filter, values);
      values.push(serializeVectorLiteral(queryEmbedding));
      const vectorIndex = values.length;
      values.push(input.topK);
      const limitIndex = values.length;

      const rows = await runtime.sql.unsafe<VectorRow[]>(
        `
          SELECT
            id,
            array_to_json(embedding)::text AS embedding_json,
            metadata::text AS metadata_json,
            content,
            ((embedding::vector <#> $${vectorIndex}::vector) * -1) AS score
          FROM ${runtime.vectorTable}
          WHERE collection = $1${metadataClause}
          ORDER BY embedding::vector <#> $${vectorIndex}::vector ASC, id ASC
          LIMIT $${limitIndex}
        `,
        values,
      );

      return rows.map<VectorSearchResult>((row) => ({
        id: row.id,
        embedding: parseJson<number[]>(row.embedding_json),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json),
        content: row.content,
        score: Number(row.score),
      }));
    },

    async delete(collection, id) {
      if (options?.readOnly) {
        throw createReadOnlyMutationError("vector");
      }

      await runtime.ensureVectorStore();
      await runtime.sql.unsafe(
        `
          DELETE FROM ${runtime.vectorTable}
          WHERE collection = $1 AND id = $2
        `,
        [collection, id],
      );
    },
  };
}

export async function getPostgresVectorExtensionStatus(
  config: PostgresStorageConfig,
): Promise<PostgresVectorExtensionStatus> {
  const runtime = createRuntime(config);
  const rows = await runtime.sql.unsafe<
    Array<{ available: boolean; installed: boolean }>
  >(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'vector'
        ) AS installed,
        EXISTS (
          SELECT 1
          FROM pg_available_extensions
          WHERE name = 'vector'
        ) AS available
    `,
  );

  if (rows[0]?.installed) {
    return "installed";
  }

  if (rows[0]?.available) {
    return "available";
  }

  return "missing";
}

export async function ensurePostgresStorageBackend(
  config: PostgresStorageConfig,
): Promise<void> {
  const runtime = createRuntime(config);
  await runtime.ensureDocumentStore();
  await runtime.ensureSessionStore();
  await runtime.ensureVectorStore();
}

async function hasExistingPostgresStorageBackend(
  config: PostgresStorageConfig,
): Promise<boolean> {
  const runtime = createRuntime(config);
  const [hasDocumentStore, hasSessionStore, hasVectorStore] = await Promise.all([
    runtime.hasDocumentStore(),
    runtime.hasSessionStore(),
    runtime.hasVectorStore(),
  ]);

  return hasDocumentStore && hasSessionStore && hasVectorStore;
}

export async function probeReadOnlyPostgresStorageBackend(
  config: PostgresStorageConfig,
  dependencies?: ReadOnlyPostgresStorageProbeDependencies,
): Promise<ReadOnlyPostgresStorageProbeResult> {
  const getVectorExtensionStatus =
    dependencies?.getVectorExtensionStatus ?? getPostgresVectorExtensionStatus;
  const hasExistingStorageBackend =
    dependencies?.hasExistingStorageBackend ?? hasExistingPostgresStorageBackend;
  const status = await getVectorExtensionStatus(config);

  if (status === "missing") {
    return "unusable";
  }

  if (status !== "installed") {
    return "inconclusive";
  }

  return (await hasExistingStorageBackend(config))
    ? "readable"
    : "inconclusive";
}

export async function canBootstrapPostgresStorageBackend(
  config: PostgresStorageConfig,
  dependencies?: PostgresStorageBootstrapDependencies,
): Promise<boolean> {
  const getVectorExtensionStatus =
    dependencies?.getVectorExtensionStatus ?? getPostgresVectorExtensionStatus;
  const ensureStorageBackend =
    dependencies?.ensureStorageBackend ?? ensurePostgresStorageBackend;
  const status = await getVectorExtensionStatus(config);

  if (status === "missing") {
    return false;
  }

  await ensureStorageBackend(config);
  return true;
}
