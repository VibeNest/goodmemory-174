import { SQL } from "bun";
import type {
  SessionBuffer,
  SessionJournal,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey } from "../domain/scope";
import type {
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

function parseJson<TValue>(value: string): TValue {
  return JSON.parse(value) as TValue;
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

  values.push(filter);
  return ` AND ${column} @> $${values.length}::jsonb`;
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

  const sql = new SQL(url);
  const quotedSchema = quoteIdentifier(schema);
  const documentTable = qualifyTable(schema, DOCUMENT_TABLE_NAME);
  const sessionStateTable = qualifyTable(schema, SESSION_STATE_TABLE_NAME);
  const vectorTable = qualifyTable(schema, vectorTableName);

  const ensureSchema = createInitializer(async () => {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
  });

  const runtime: PostgresRuntime = {
    sql,
    schema,
    documentTable,
    sessionStateTable,
    vectorTable,
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
): {
  set(scope: MemoryScope, value: TValue): Promise<void>;
  get(scope: MemoryScope): Promise<TValue | null>;
} {
  return {
    async set(scope, value) {
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
            $3::jsonb,
            NOW()
          )
          ON CONFLICT (scope_key, state_kind)
          DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        `,
        [scopeToKey(scope), stateKind, value],
      );
    },

    async get(scope) {
      await runtime.ensureSessionStore();
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
  };
}

export function createPostgresDocumentStore(
  config: PostgresStorageConfig,
): DocumentStore {
  const runtime = createRuntime(config);

  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
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
            $3::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (collection, id)
          DO UPDATE SET
            document = EXCLUDED.document,
            updated_at = EXCLUDED.updated_at
        `,
        [collection, id, document],
      );
    },

    async get<TDocument extends StorageDocument>(collection: string, id: string) {
      await runtime.ensureDocumentStore();
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
      await runtime.ensureDocumentStore();
      const rows = await runtime.sql.unsafe<Array<{ id: string }>>(
        `
          UPDATE ${runtime.documentTable}
          SET
            document = document || $3::jsonb,
            updated_at = NOW()
          WHERE collection = $1 AND id = $2
          RETURNING id
        `,
        [collection, id, patch],
      );

      if (rows.length === 0) {
        throw new Error(`Document not found for update: ${collection}/${id}`);
      }
    },

    async query<TDocument extends StorageDocument>(
      collection: string,
      filter?: Record<string, unknown>,
    ) {
      await runtime.ensureDocumentStore();
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

    async delete(collection, id) {
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
): SessionStore {
  const runtime = createRuntime(config);
  const buffers = createPostgresSessionStateStore<SessionBuffer>(runtime, "buffer");
  const workingMemory = createPostgresSessionStateStore<WorkingMemorySnapshot>(
    runtime,
    "working_memory",
  );
  const journals = createPostgresSessionStateStore<SessionJournal>(runtime, "journal");

  return {
    saveBuffer(scope, buffer) {
      return buffers.set(scope, buffer);
    },

    getBuffer(scope) {
      return buffers.get(scope);
    },

    saveWorkingMemory(scope, snapshot) {
      return workingMemory.set(scope, snapshot);
    },

    getWorkingMemory(scope) {
      return workingMemory.get(scope);
    },

    saveJournal(scope, journal) {
      return journals.set(scope, journal);
    },

    getJournal(scope) {
      return journals.get(scope);
    },
  };
}

export function createPostgresVectorStore(
  config: PostgresStorageConfig,
): VectorStore {
  const runtime = createRuntime(config);

  return {
    async upsert(collection, records) {
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
                $4::jsonb,
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
              record.metadata,
              record.content,
            ],
          );
        }
      });
    },

    async search(collection, queryEmbedding, input) {
      await runtime.ensureVectorStore();

      if (input.topK <= 0 || queryEmbedding.length === 0) {
        return [];
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
