import type {
  SessionBuffer,
  SessionJournal,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";

export type StorageDocument = object;
export type StorageFilter = Record<string, unknown>;

export interface DocumentStore {
  set<TDocument extends StorageDocument>(
    collection: string,
    id: string,
    document: TDocument,
  ): Promise<void>;
  get<TDocument extends StorageDocument>(
    collection: string,
    id: string,
  ): Promise<TDocument | null>;
  update<TDocument extends StorageDocument>(
    collection: string,
    id: string,
    patch: Partial<TDocument>,
  ): Promise<void>;
  query<TDocument extends StorageDocument>(
    collection: string,
    filter?: StorageFilter,
  ): Promise<TDocument[]>;
  delete(collection: string, id: string): Promise<void>;
}

export interface VectorRecord {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content: string;
}

export interface VectorSearchInput {
  topK: number;
  filter?: StorageFilter;
}

export interface VectorSearchResult extends VectorRecord {
  score: number;
}

export interface VectorStore {
  upsert(collection: string, records: VectorRecord[]): Promise<void>;
  search(
    collection: string,
    queryEmbedding: number[],
    input: VectorSearchInput,
  ): Promise<VectorSearchResult[]>;
  delete(collection: string, id: string): Promise<void>;
}

export interface SessionStore {
  saveBuffer(scope: MemoryScope, buffer: SessionBuffer): Promise<void>;
  getBuffer(scope: MemoryScope): Promise<SessionBuffer | null>;
  deleteBuffersByScope(scope: MemoryScope): Promise<number>;
  saveWorkingMemory(
    scope: MemoryScope,
    snapshot: WorkingMemorySnapshot,
  ): Promise<void>;
  getWorkingMemory(scope: MemoryScope): Promise<WorkingMemorySnapshot | null>;
  deleteWorkingMemoryByScope(scope: MemoryScope): Promise<number>;
  saveJournal(scope: MemoryScope, journal: SessionJournal): Promise<void>;
  getJournal(scope: MemoryScope): Promise<SessionJournal | null>;
  deleteJournalsByScope(scope: MemoryScope): Promise<number>;
}

export function matchesFilter(
  document: StorageDocument,
  filter?: StorageFilter,
): boolean {
  if (!filter) {
    return true;
  }

  const record = document as Record<string, unknown>;

  return Object.entries(filter).every(([key, value]) => record[key] === value);
}

export function shallowMergeDocument<TDocument extends StorageDocument>(
  base: TDocument,
  patch: Partial<TDocument>,
): TDocument {
  return {
    ...base,
    ...patch,
  };
}
