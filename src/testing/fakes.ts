import type {
  MemoryScope,
} from "../index";
import { scopeToPrefix } from "../domain/scope";

export interface FakeLLMRequest {
  purpose: string;
  prompt: string;
}

export interface FakeLLMResponse {
  content: string;
}

export function createFakeLLMAdapter(responses: FakeLLMResponse[] = []) {
  const queue = [...responses];

  return {
    async complete(_request: FakeLLMRequest): Promise<FakeLLMResponse> {
      if (queue.length === 0) {
        throw new Error("No fake LLM response configured");
      }

      return queue.shift()!;
    },
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function createFakeEmbeddingAdapter() {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const hash = hashString(text);
        return [hash % 997, (hash >> 3) % 997, (hash >> 7) % 997];
      });
    },
  };
}

export function createFakeDocumentStore() {
  const collections = new Map<string, Map<string, unknown>>();

  const getCollection = (name: string): Map<string, unknown> => {
    let collection = collections.get(name);
    if (!collection) {
      collection = new Map<string, unknown>();
      collections.set(name, collection);
    }
    return collection;
  };

  return {
    async get<T>(collection: string, id: string): Promise<T | null> {
      return (getCollection(collection).get(id) as T | undefined) ?? null;
    },
    async set<T>(collection: string, id: string, doc: T): Promise<void> {
      getCollection(collection).set(id, doc);
    },
    async update<T>(
      collection: string,
      id: string,
      partial: Partial<T>,
    ): Promise<void> {
      const current = (getCollection(collection).get(id) as Record<string, unknown> | undefined) ?? {};
      getCollection(collection).set(id, { ...current, ...partial });
    },
    async delete(collection: string, id: string): Promise<void> {
      getCollection(collection).delete(id);
    },
    async query<T>(collection: string): Promise<T[]> {
      return Array.from(getCollection(collection).values()) as T[];
    },
  };
}

function scopeKey(scope: MemoryScope): string {
  return [
    scope.userId,
    scope.tenantId ?? "",
    scope.workspaceId ?? "",
    scope.agentId ?? "",
    scope.sessionId ?? "",
  ].join("::");
}

export function createFakeSessionStore() {
  const buffers = new Map<string, unknown>();
  const workingMemory = new Map<string, unknown>();
  const journals = new Map<string, unknown>();
  const deleteByScope = (store: Map<string, unknown>, scope: MemoryScope) => {
    const prefix = scope.sessionId ? scopeKey(scope) : scopeToPrefix(scope);
    let deleted = 0;

    for (const key of [...store.keys()]) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      store.delete(key);
      deleted += 1;
    }

    return deleted;
  };

  return {
    async getBuffer<T>(scope: MemoryScope): Promise<T | null> {
      return (buffers.get(scopeKey(scope)) as T | undefined) ?? null;
    },
    async saveBuffer<T>(scope: MemoryScope, buffer: T): Promise<void> {
      buffers.set(scopeKey(scope), buffer);
    },
    async deleteBuffersByScope(scope: MemoryScope): Promise<number> {
      return deleteByScope(buffers, scope);
    },
    async getWorkingMemory<T>(scope: MemoryScope): Promise<T | null> {
      return (workingMemory.get(scopeKey(scope)) as T | undefined) ?? null;
    },
    async saveWorkingMemory<T>(scope: MemoryScope, snapshot: T): Promise<void> {
      workingMemory.set(scopeKey(scope), snapshot);
    },
    async deleteWorkingMemoryByScope(scope: MemoryScope): Promise<number> {
      return deleteByScope(workingMemory, scope);
    },
    async getJournal<T>(scope: MemoryScope): Promise<T | null> {
      return (journals.get(scopeKey(scope)) as T | undefined) ?? null;
    },
    async saveJournal<T>(scope: MemoryScope, journal: T): Promise<void> {
      journals.set(scopeKey(scope), journal);
    },
    async deleteJournalsByScope(scope: MemoryScope): Promise<number> {
      return deleteByScope(journals, scope);
    },
  };
}
