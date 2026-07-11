import type { MemoryScope } from "../../domain/scope";
import type { MemorySourceMethod } from "../../domain/provenance";

export const RECALL_DOCUMENTS_COLLECTION = "recall_documents_v2";
export const ENTITIES_COLLECTION = "entities_v1";
export const SCOPE_CATALOG_COLLECTION = "scope_catalog_v1";
export const PROJECTION_REPAIRS_COLLECTION = "recall_projection_repairs_v1";

export const RECALL_PROJECTION_SOURCE_COLLECTIONS = [
  "profiles",
  "preferences",
  "references",
  "facts",
  "episodes",
  "feedback",
  "session_archives",
] as const;

export type RecallProjectionSourceCollection =
  (typeof RECALL_PROJECTION_SOURCE_COLLECTIONS)[number];

export type RecallDocumentGranularity = "memory" | "field" | "sentence";

export interface RecallEntityMention {
  canonicalKey: string;
  entityId: string;
  surface: string;
}

export interface RecallIndexDocument extends MemoryScope {
  id: string;
  schemaVersion: 2;
  scopeKey: string;
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
  sourceMemoryType: string;
  granularity: RecallDocumentGranularity;
  field?: string;
  text: string;
  entityIds: string[];
  entityMentions: RecallEntityMention[];
  effectiveFrom?: string;
  effectiveUntil?: string;
  provenance: {
    method?: MemorySourceMethod;
    extractedAt?: string;
    sessionId?: string;
    locale?: string;
  };
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  indexedAt: string;
}

export interface EntityProjection extends MemoryScope {
  id: string;
  schemaVersion: 1;
  scopeKey: string;
  canonicalKey: string;
  aliases: string[];
  description?: string;
  memoryIds: string[];
  validFrom?: string;
  validUntil?: string;
  updatedAt: string;
}

export interface EntityAdjacencyProjection extends MemoryScope {
  id: string;
  schemaVersion: 1;
  scopeKey: string;
  entityId: string;
  canonicalKey: string;
  memoryId: string;
  aliases: string[];
  description?: string;
  validFrom?: string;
  validUntil?: string;
  updatedAt: string;
}

export interface ScopeCatalogProjection extends MemoryScope {
  id: string;
  schemaVersion: 1;
  scopeKey: string;
  coverage: "partial" | "complete";
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProjectionRepairRecord extends MemoryScope {
  id: string;
  schemaVersion: 1;
  scopeKey: string;
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  lastError: string;
}

export interface RecallProjectionSearchPort {
  ensureScopeIndexed(scope: MemoryScope): Promise<{
    complete: boolean;
    indexedSources: number;
    skipped: boolean;
  }>;
  queryDocuments(scope: MemoryScope): Promise<RecallIndexDocument[]>;
  queryEntities(scope: MemoryScope): Promise<EntityProjection[]>;
}

export function isRecallProjectionSourceCollection(
  collection: string,
): collection is RecallProjectionSourceCollection {
  return (RECALL_PROJECTION_SOURCE_COLLECTIONS as readonly string[]).includes(
    collection,
  );
}
