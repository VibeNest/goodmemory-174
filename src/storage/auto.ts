import type {
  DocumentStore,
  SessionStore,
  StorageDocument,
  VectorRecord,
  VectorSearchInput,
  VectorSearchResult,
  VectorStore,
} from "./contracts";
import {
  canBootstrapPostgresStorageBackend,
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "./postgres";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "./sqlite";
import type { MemoryScope } from "../domain/scope";
import type {
  SessionBuffer,
  SessionJournal,
  WorkingMemorySnapshot,
} from "../domain/records";

interface AutoStorageConfig {
  postgresUrl?: string;
  sqliteUrl: string;
}

interface ResolvedStorageBackend {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
  vectorStore: VectorStore;
}

function describeAutoStorageProbeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function createAutoDocumentStore(
  resolveBackend: () => Promise<ResolvedStorageBackend>,
): DocumentStore {
  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
      const backend = await resolveBackend();
      return backend.documentStore.set(collection, id, document);
    },

    async get<TDocument extends StorageDocument>(collection: string, id: string) {
      const backend = await resolveBackend();
      return backend.documentStore.get<TDocument>(collection, id);
    },

    async update<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      patch: Partial<TDocument>,
    ) {
      const backend = await resolveBackend();
      return backend.documentStore.update<TDocument>(collection, id, patch);
    },

    async query<TDocument extends StorageDocument>(
      collection: string,
      filter?: Record<string, unknown>,
    ) {
      const backend = await resolveBackend();
      return backend.documentStore.query<TDocument>(collection, filter);
    },

    async delete(collection, id) {
      const backend = await resolveBackend();
      return backend.documentStore.delete(collection, id);
    },
  };
}

function createAutoSessionStore(
  resolveBackend: () => Promise<ResolvedStorageBackend>,
): SessionStore {
  return {
    saveBuffer(scope: MemoryScope, buffer: SessionBuffer) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.saveBuffer(scope, buffer),
      );
    },

    getBuffer(scope: MemoryScope) {
      return resolveBackend().then((backend) => backend.sessionStore.getBuffer(scope));
    },

    deleteBuffersByScope(scope: MemoryScope) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.deleteBuffersByScope(scope),
      );
    },

    saveWorkingMemory(scope: MemoryScope, snapshot: WorkingMemorySnapshot) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.saveWorkingMemory(scope, snapshot),
      );
    },

    getWorkingMemory(scope: MemoryScope) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.getWorkingMemory(scope),
      );
    },

    deleteWorkingMemoryByScope(scope: MemoryScope) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.deleteWorkingMemoryByScope(scope),
      );
    },

    saveJournal(scope: MemoryScope, journal: SessionJournal) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.saveJournal(scope, journal),
      );
    },

    getJournal(scope: MemoryScope) {
      return resolveBackend().then((backend) => backend.sessionStore.getJournal(scope));
    },

    deleteJournalsByScope(scope: MemoryScope) {
      return resolveBackend().then((backend) =>
        backend.sessionStore.deleteJournalsByScope(scope),
      );
    },
  };
}

function createAutoVectorStore(
  resolveBackend: () => Promise<ResolvedStorageBackend>,
): VectorStore {
  return {
    async upsert(collection: string, records: VectorRecord[]) {
      const backend = await resolveBackend();
      return backend.vectorStore.upsert(collection, records);
    },

    async get(collection: string, id: string) {
      const backend = await resolveBackend();
      return backend.vectorStore.get(collection, id);
    },

    async search(
      collection: string,
      queryEmbedding: number[],
      input: VectorSearchInput,
    ): Promise<VectorSearchResult[]> {
      const backend = await resolveBackend();
      return backend.vectorStore.search(collection, queryEmbedding, input);
    },

    async delete(collection: string, id: string) {
      const backend = await resolveBackend();
      return backend.vectorStore.delete(collection, id);
    },
  };
}

export function createAutoStorageAdapters(
  config: AutoStorageConfig,
): {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
  vectorStore: VectorStore;
} {
  let sqliteBackend: ResolvedStorageBackend | null = null;
  let postgresBackend: ResolvedStorageBackend | null = null;
  let resolution: Promise<ResolvedStorageBackend> | null = null;

  function getSQLiteBackend(): ResolvedStorageBackend {
    if (sqliteBackend) {
      return sqliteBackend;
    }

    sqliteBackend = {
      documentStore: createSQLiteDocumentStore(config.sqliteUrl),
      sessionStore: createSQLiteSessionStore(config.sqliteUrl),
      vectorStore: createSQLiteVectorStore(config.sqliteUrl),
    };

    return sqliteBackend;
  }

  function getPostgresBackend(): ResolvedStorageBackend {
    if (!config.postgresUrl) {
      throw new Error("Postgres backend requested without a postgres url.");
    }

    if (postgresBackend) {
      return postgresBackend;
    }

    postgresBackend = {
      documentStore: createPostgresDocumentStore({
        url: config.postgresUrl,
      }),
      sessionStore: createPostgresSessionStore({
        url: config.postgresUrl,
      }),
      vectorStore: createPostgresVectorStore({
        url: config.postgresUrl,
      }),
    };

    return postgresBackend;
  }

  async function resolveBackend(): Promise<ResolvedStorageBackend> {
    if (!resolution) {
      resolution = (async () => {
        if (config.postgresUrl) {
          let usable = false;

          try {
            usable = await canBootstrapPostgresStorageBackend({
              url: config.postgresUrl,
            });
          } catch (error) {
            throw new Error(
              [
                "Auto storage could not establish the configured postgres backend as usable durable authority.",
                "Falling back to sqlite would risk corrupting durable authority.",
                `Underlying error: ${describeAutoStorageProbeError(error)}`,
              ].join(" "),
            );
          }

          if (usable) {
            return getPostgresBackend();
          }
        }

        return getSQLiteBackend();
      })();
    }

    return resolution;
  }

  return {
    documentStore: createAutoDocumentStore(resolveBackend),
    sessionStore: createAutoSessionStore(resolveBackend),
    vectorStore: createAutoVectorStore(resolveBackend),
  };
}
