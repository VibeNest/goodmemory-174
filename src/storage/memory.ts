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
  VectorRecord,
  VectorSearchInput,
  VectorSearchResult,
  VectorStore,
} from "./contracts";
import {
  matchesFilter,
  shallowMergeDocument,
} from "./contracts";

function clone<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function documentsEqual(left: StorageDocument, right: StorageDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createInMemoryDocumentStore(): DocumentStore {
  const collections = new Map<string, Map<string, StorageDocument>>();

  function getCollection(collection: string): Map<string, StorageDocument> {
    const existing = collections.get(collection);
    if (existing) {
      return existing;
    }

    const created = new Map<string, StorageDocument>();
    collections.set(collection, created);
    return created;
  }

  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
      getCollection(collection).set(id, clone(document));
    },

    async get<TDocument extends StorageDocument>(collection: string, id: string) {
      const document = getCollection(collection).get(id);
      return document ? (clone(document) as TDocument) : null;
    },

    async update<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      patch: Partial<TDocument>,
    ) {
      const documents = getCollection(collection);
      const current = documents.get(id);

      if (!current) {
        throw new Error(`Document not found for update: ${collection}/${id}`);
      }

      documents.set(id, clone(shallowMergeDocument(current, patch)));
    },

    async query<TDocument extends StorageDocument>(
      collection: string,
      filter?: Record<string, unknown>,
    ) {
      return [...getCollection(collection).values()]
        .filter((document) => matchesFilter(document, filter))
        .map((document) => clone(document) as TDocument);
    },

    async writeBatchIfUnchanged(input: ConditionalDocumentWriteBatch) {
      const expectedCollection = getCollection(input.expected.collection);
      const current = expectedCollection.get(input.expected.id);
      if (!current || !documentsEqual(current, input.expected.document)) {
        return false;
      }

      for (const operation of input.set) {
        getCollection(operation.collection).set(
          operation.id,
          clone(operation.document),
        );
      }

      return true;
    },

    async delete(collection, id) {
      getCollection(collection).delete(id);
    },
  };
}

interface SessionStateStore<TValue> {
  set(scope: MemoryScope, value: TValue): Promise<void>;
  get(scope: MemoryScope): Promise<TValue | null>;
  deleteByScope(scope: MemoryScope): Promise<number>;
}

function createScopedMapStore<TValue>(): SessionStateStore<TValue> {
  const records = new Map<string, TValue>();

  return {
    async set(scope, value) {
      records.set(scopeToKey(scope), clone(value));
    },

    async get(scope) {
      const record = records.get(scopeToKey(scope));
      return record ? clone(record) : null;
    },

    async deleteByScope(scope) {
      const normalizedPrefix = scopeToPrefix(scope);
      let deleted = 0;

      for (const key of [...records.keys()]) {
        if (!key.startsWith(normalizedPrefix)) {
          continue;
        }

        records.delete(key);
        deleted += 1;
      }

      return deleted;
    },
  };
}

export function createInMemorySessionStore(): SessionStore {
  const buffers = createScopedMapStore<SessionBuffer>();
  const workingMemory = createScopedMapStore<WorkingMemorySnapshot>();
  const journals = createScopedMapStore<SessionJournal>();

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

function scoreDotProduct(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += left[index]! * right[index]!;
  }

  return score;
}

export function createInMemoryVectorStore(): VectorStore {
  const collections = new Map<string, Map<string, VectorRecord>>();

  function getCollection(collection: string): Map<string, VectorRecord> {
    const existing = collections.get(collection);
    if (existing) {
      return existing;
    }

    const created = new Map<string, VectorRecord>();
    collections.set(collection, created);
    return created;
  }

  return {
    async upsert(collection, records) {
      const vectors = getCollection(collection);

      for (const record of records) {
        vectors.set(record.id, clone(record));
      }
    },

    async get(collection, id) {
      const record = getCollection(collection).get(id);
      return record ? clone(record) : null;
    },

    async search(collection, queryEmbedding, input) {
      const vectors = [...getCollection(collection).values()]
        .filter((record) => matchesFilter(record.metadata, input.filter))
        .map<VectorSearchResult>((record) => ({
          ...clone(record),
          score: scoreDotProduct(record.embedding, queryEmbedding),
        }))
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.id.localeCompare(right.id);
        });

      return vectors.slice(0, input.topK);
    },

    async delete(collection, id) {
      getCollection(collection).delete(id);
    },
  };
}
