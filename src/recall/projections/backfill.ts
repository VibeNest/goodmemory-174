import {
  normalizeScope,
  scopeToKey,
} from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import type {
  DocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import {
  RECALL_DOCUMENTS_COLLECTION,
  RECALL_PROJECTION_SOURCE_COLLECTIONS,
  SCOPE_CATALOG_COLLECTION,
} from "./contracts";
import type {
  RecallIndexDocument,
  RecallProjectionSearchPort,
  RecallProjectionSourceCollection,
  ScopeCatalogProjection,
} from "./contracts";
import type { KeyedMutationLock } from "./mutationLock";
import type { RecallProjectionOperations } from "./operations";
import type { RecallProjectionCanonicalSource } from "./operations";
import { resolveProjectionScope } from "./projector";
import type { RecallProjectionRepairs } from "./repairs";
import {
  errorMessage,
  memoryProjectionId,
  scopeFilter,
  sourceMutationKey,
} from "./shared";

export type EnsureScopeIndexed = RecallProjectionSearchPort["ensureScopeIndexed"];

export function createEnsureScopeIndexed(input: {
  bulkBackfill?: boolean;
  documentStore: DocumentStore;
  mutationLock: KeyedMutationLock;
  now: () => string;
  operations: RecallProjectionOperations;
  repairs: RecallProjectionRepairs;
}): EnsureScopeIndexed {
  const { documentStore, mutationLock, now, operations, repairs } = input;
  const verifiedScopeKeys = new Set<string>();

  return async function ensureScopeIndexed(scope: MemoryScope) {
    const normalized = normalizeScope(scope);
    const requestedScopeKey = scopeToKey(normalized);
    const requestedCatalog = await documentStore.get<ScopeCatalogProjection>(
      SCOPE_CATALOG_COLLECTION,
      `scope:${requestedScopeKey}`,
    );
    if (
      requestedCatalog?.coverage === "complete" &&
      verifiedScopeKeys.has(requestedScopeKey)
    ) {
      return { complete: true, indexedSources: 0, skipped: true };
    }

    const canonicalSources: RecallProjectionCanonicalSource[] = [];
    for (const collection of RECALL_PROJECTION_SOURCE_COLLECTIONS) {
      const documents = await documentStore.query<StorageDocument>(
        collection,
        collection === "profiles"
          ? { userId: normalized.userId }
          : scopeFilter(normalized),
      );
      for (const document of documents) {
        const record = document as Record<string, unknown>;
        const id =
          collection === "profiles"
            ? typeof record.userId === "string"
              ? record.userId
              : undefined
            : typeof record.id === "string"
              ? record.id
              : undefined;
        if (id) {
          canonicalSources.push({ collection, document, id });
        }
      }
    }

    if (input.bulkBackfill) {
      try {
        const indexedSources = await operations.rebuildScopeUnsafe(
          normalized,
          canonicalSources,
        );
        verifiedScopeKeys.add(requestedScopeKey);
        return { complete: true, indexedSources, skipped: false };
      } catch (error) {
        console.error(
          "[goodmemory:recall-projection] bulk scope backfill failed; retrying incrementally",
          {
            error: errorMessage(error),
            scopeKey: requestedScopeKey,
          },
        );
      }
    }

    const canonicalKeys = new Set(
      canonicalSources.map((source) =>
        memoryProjectionId(source.collection, source.id),
      ),
    );
    let complete = true;
    let indexedSources = 0;
    for (const source of canonicalSources) {
      const sourceScope = resolveProjectionScope(source.document);
      try {
        await mutationLock.runExclusive(
          [sourceMutationKey(source.collection, source.id)],
          () =>
            operations.synchronizeUnsafe(
              source.collection,
              source.id,
              sourceScope ?? undefined,
            ),
        );
        indexedSources += 1;
      } catch (error) {
        complete = false;
        console.error(
          "[goodmemory:recall-projection] lazy scope backfill failed",
          {
            collection: source.collection,
            error: errorMessage(error),
            sourceMemoryId: source.id,
          },
        );
        await repairs.queue({
          collection: source.collection,
          error,
          scope: sourceScope ?? normalized,
          sourceMemoryId: source.id,
        });
      }
    }

    const projected = await documentStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      scopeFilter(normalized),
    );
    const projectedSources = new Map<
      string,
      {
        collection: RecallProjectionSourceCollection;
        id: string;
        scope?: MemoryScope;
      }
    >();
    for (const document of projected) {
      const key = memoryProjectionId(
        document.sourceCollection,
        document.sourceMemoryId,
      );
      if (!projectedSources.has(key)) {
        projectedSources.set(key, {
          collection: document.sourceCollection,
          id: document.sourceMemoryId,
          scope: resolveProjectionScope(document) ?? undefined,
        });
      }
    }
    for (const [key, source] of projectedSources) {
      if (canonicalKeys.has(key)) {
        continue;
      }
      try {
        await mutationLock.runExclusive(
          [sourceMutationKey(source.collection, source.id)],
          () =>
            operations.synchronizeUnsafe(
              source.collection,
              source.id,
              source.scope,
              true,
            ),
        );
      } catch (error) {
        complete = false;
        await repairs.queue({
          collection: source.collection,
          error,
          scope: source.scope ?? normalized,
          sourceMemoryId: source.id,
        });
      }
    }

    if (complete) {
      const timestamp = now();
      await operations.registerScope(normalized, timestamp, "complete");
      verifiedScopeKeys.add(requestedScopeKey);
    } else {
      verifiedScopeKeys.delete(requestedScopeKey);
    }
    return { complete, indexedSources, skipped: false };
  };
}
