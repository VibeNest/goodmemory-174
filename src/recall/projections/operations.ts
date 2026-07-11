import { isDeepStrictEqual } from "node:util";
import { normalizeScope, scopeToKey } from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import type {
  DocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import {
  ENTITIES_COLLECTION,
  RECALL_DOCUMENTS_COLLECTION,
  SCOPE_CATALOG_COLLECTION,
} from "./contracts";
import type {
  EntityAdjacencyProjection,
  EntityProjection,
  RecallIndexDocument,
  RecallProjectionSourceCollection,
  ScopeCatalogProjection,
} from "./contracts";
import {
  buildEntityAdjacencyProjections,
  createEntityProjectionIndex,
} from "./entityIndex";
import type { EntityProjectionIndex } from "./entityIndex";
import { buildRecallIndexDocuments, resolveProjectionScope } from "./projector";
import {
  matchesScopeFilter,
  normalizeRecallScope,
  scopeFilter,
} from "./shared";

const MAX_SOURCE_STABILIZATION_ATTEMPTS = 4;

export interface RecallProjectionOperations {
  queryDocuments(scope: MemoryScope): Promise<RecallIndexDocument[]>;
  queryEntities(scope: MemoryScope): Promise<EntityProjection[]>;
  registerScope(
    scope: MemoryScope,
    timestamp: string,
    coverage?: ScopeCatalogProjection["coverage"],
  ): Promise<void>;
  rebuildScopeUnsafe(
    scope: MemoryScope,
    sources: readonly RecallProjectionCanonicalSource[],
  ): Promise<number>;
  synchronizeUnsafe(
    collection: RecallProjectionSourceCollection,
    sourceMemoryId: string,
    fallbackScope?: MemoryScope,
    recoverStaleAdjacency?: boolean,
  ): Promise<void>;
}

export interface RecallProjectionCanonicalSource {
  collection: RecallProjectionSourceCollection;
  document: StorageDocument;
  id: string;
}

export function createRecallProjectionOperations(input: {
  documentStore: DocumentStore;
  now: () => string;
  entityIndex?: EntityProjectionIndex;
}): RecallProjectionOperations {
  const { documentStore, now } = input;
  const entityIndex =
    input.entityIndex ?? createEntityProjectionIndex(documentStore);

  async function removeSourceDocuments(
    collection: RecallProjectionSourceCollection,
    sourceMemoryId: string,
  ): Promise<RecallIndexDocument[]> {
    const existing = await documentStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      { sourceCollection: collection, sourceMemoryId },
    );
    for (const document of existing) {
      await documentStore.delete(RECALL_DOCUMENTS_COLLECTION, document.id);
    }
    return existing;
  }

  async function registerScope(
    scope: MemoryScope,
    timestamp: string,
    coverage?: ScopeCatalogProjection["coverage"],
  ): Promise<void> {
    const normalized = normalizeScope(scope);
    const scopes = new Map<string, MemoryScope>();
    for (const candidate of [normalized, normalizeRecallScope(normalized)]) {
      scopes.set(scopeToKey(candidate), candidate);
    }
    for (const [key, candidate] of scopes) {
      const id = `scope:${key}`;
      const existing = await documentStore.get<ScopeCatalogProjection>(
        SCOPE_CATALOG_COLLECTION,
        id,
      );
      const catalog: ScopeCatalogProjection = {
        id,
        schemaVersion: 1,
        ...candidate,
        scopeKey: key,
        coverage: coverage ?? existing?.coverage ?? "partial",
        firstSeenAt: existing?.firstSeenAt ?? timestamp,
        lastSeenAt: timestamp,
      };
      await documentStore.set(SCOPE_CATALOG_COLLECTION, id, catalog);
    }
  }

  async function updateRemovedSource(input: {
    collection: RecallProjectionSourceCollection;
    existing: RecallIndexDocument[];
    fallbackScope?: MemoryScope;
    recoverStaleAdjacency: boolean;
    sourceMemoryId: string;
    timestamp: string;
  }): Promise<void> {
    const scopes = new Map<string, MemoryScope>();
    if (input.fallbackScope) {
      scopes.set(scopeToKey(input.fallbackScope), input.fallbackScope);
    }
    for (const document of input.existing) {
      const scope = resolveProjectionScope(document);
      if (scope) {
        scopes.set(scopeToKey(scope), scope);
      }
    }
    for (const scope of scopes.values()) {
      await entityIndex.updateForSource({
        collection: input.collection,
        existingDocuments: input.existing,
        newDocuments: [],
        recoverStaleAdjacency: input.recoverStaleAdjacency,
        scope,
        sourceMemoryId: input.sourceMemoryId,
        timestamp: input.timestamp,
      });
    }
  }

  async function replaceSourceSnapshot(input: {
    collection: RecallProjectionSourceCollection;
    document: StorageDocument | null;
    fallbackScope?: MemoryScope;
    recoverStaleAdjacency: boolean;
    sourceMemoryId: string;
    timestamp: string;
  }): Promise<void> {
    const scope = input.document
      ? resolveProjectionScope(input.document) ?? input.fallbackScope
      : input.fallbackScope;
    const existing = await removeSourceDocuments(
      input.collection,
      input.sourceMemoryId,
    );
    if (!input.document || !scope) {
      await updateRemovedSource({
        collection: input.collection,
        existing,
        fallbackScope: scope,
        recoverStaleAdjacency: input.recoverStaleAdjacency,
        sourceMemoryId: input.sourceMemoryId,
        timestamp: input.timestamp,
      });
      return;
    }

    const projections = buildRecallIndexDocuments({
      collection: input.collection,
      document: input.document,
      indexedAt: input.timestamp,
      sourceMemoryId: input.sourceMemoryId,
    });
    for (const projection of projections) {
      await documentStore.set(
        RECALL_DOCUMENTS_COLLECTION,
        projection.id,
        projection,
      );
    }
    await registerScope(scope, input.timestamp);
    await entityIndex.updateForSource({
      collection: input.collection,
      existingDocuments: existing,
      newDocuments: projections,
      recoverStaleAdjacency: input.recoverStaleAdjacency,
      scope,
      sourceMemoryId: input.sourceMemoryId,
      timestamp: input.timestamp,
    });
  }

  return {
    async queryDocuments(scope) {
      const documents = await documentStore.query<RecallIndexDocument>(
        RECALL_DOCUMENTS_COLLECTION,
        scopeFilter(scope),
      );
      return documents.filter((document) => matchesScopeFilter(document, scope));
    },
    queryEntities(scope) {
      return entityIndex.query(scope);
    },
    registerScope,
    async rebuildScopeUnsafe(scope, sources) {
      const timestamp = now();
      const projections = sources.flatMap((source) =>
        buildRecallIndexDocuments({
          collection: source.collection,
          document: source.document,
          indexedAt: timestamp,
          sourceMemoryId: source.id,
        }),
      );
      const edges = buildEntityAdjacencyProjections({
        documents: projections,
        timestamp,
      });
      const [queriedDocuments, queriedEdges] = await Promise.all([
        documentStore.query<RecallIndexDocument>(
          RECALL_DOCUMENTS_COLLECTION,
          scopeFilter(scope),
        ),
        documentStore.query<EntityAdjacencyProjection>(
          ENTITIES_COLLECTION,
          scopeFilter(scope),
        ),
      ]);
      const existingDocuments = queriedDocuments.filter((document) =>
        matchesScopeFilter(document, scope),
      );
      const existingEdges = queriedEdges.filter((edge) =>
        matchesScopeFilter(edge, scope),
      );
      for (const document of existingDocuments) {
        await documentStore.delete(RECALL_DOCUMENTS_COLLECTION, document.id);
      }
      for (const edge of existingEdges) {
        await documentStore.delete(ENTITIES_COLLECTION, edge.id);
      }
      for (const projection of projections) {
        await documentStore.set(
          RECALL_DOCUMENTS_COLLECTION,
          projection.id,
          projection,
        );
      }
      for (const edge of edges) {
        await documentStore.set(ENTITIES_COLLECTION, edge.id, edge);
      }

      const sourceScopes = new Map<string, MemoryScope>();
      for (const source of sources) {
        const sourceScope = resolveProjectionScope(source.document);
        if (sourceScope) {
          sourceScopes.set(scopeToKey(sourceScope), sourceScope);
        }
      }
      for (const sourceScope of sourceScopes.values()) {
        await registerScope(sourceScope, timestamp);
      }
      await registerScope(scope, timestamp, "complete");
      return sources.length;
    },
    async synchronizeUnsafe(
      collection,
      sourceMemoryId,
      fallbackScope,
      recoverStaleAdjacency = false,
    ) {
      let expected = await documentStore.get<StorageDocument>(
        collection,
        sourceMemoryId,
      );
      for (
        let attempt = 0;
        attempt < MAX_SOURCE_STABILIZATION_ATTEMPTS;
        attempt += 1
      ) {
        await replaceSourceSnapshot({
          collection,
          document: expected,
          fallbackScope,
          recoverStaleAdjacency: recoverStaleAdjacency || attempt > 0,
          sourceMemoryId,
          timestamp: now(),
        });
        const current = await documentStore.get<StorageDocument>(
          collection,
          sourceMemoryId,
        );
        if (isDeepStrictEqual(current, expected)) {
          return;
        }
        expected = current;
      }
      throw new Error(
        `Recall projection source did not stabilize after ${MAX_SOURCE_STABILIZATION_ATTEMPTS} attempts: ${collection}/${sourceMemoryId}`,
      );
    },
  };
}
