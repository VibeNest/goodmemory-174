import { normalizeScope } from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import { EVIDENCE_COLLECTION } from "../../evidence/contracts";
import type { EvidenceRecord } from "../../evidence/contracts";
import type {
  ProjectionCapableDocumentStore,
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
  matchesScopeFilter,
  memoryProjectionId,
  recallScopeKey,
  scopeFilter,
  sourceMutationKey,
} from "./shared";

export type EnsureScopeIndexed = RecallProjectionSearchPort["ensureScopeIndexed"];

export function createEnsureScopeIndexed(input: {
  bulkBackfill?: boolean;
  documentStore: ProjectionCapableDocumentStore;
  mutationLock: KeyedMutationLock;
  now: () => string;
  operations: RecallProjectionOperations;
  repairs: RecallProjectionRepairs;
}): EnsureScopeIndexed {
  const { documentStore, mutationLock, now, operations, repairs } = input;
  const verifiedScopeKeys = new Set<string>();

  return async function ensureScopeIndexed(scope: MemoryScope) {
    const normalized = normalizeScope(scope);
    const requestedScopeKey = recallScopeKey(normalized);
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
    const queriedEvidence = await documentStore.query<EvidenceRecord>(
      EVIDENCE_COLLECTION,
      scopeFilter(normalized),
    );
    const evidenceByMemoryId = new Map<string, EvidenceRecord[]>();
    for (const evidence of queriedEvidence.filter((record) =>
      matchesScopeFilter(record, normalized),
    )) {
      for (const memoryId of evidence.linkedMemoryIds) {
        const records = evidenceByMemoryId.get(memoryId) ?? [];
        records.push(evidence);
        evidenceByMemoryId.set(memoryId, records);
      }
    }
    for (const collection of RECALL_PROJECTION_SOURCE_COLLECTIONS) {
      const queriedDocuments = await documentStore.query<StorageDocument>(
        collection,
        collection === "profiles"
          ? { userId: normalized.userId }
          : scopeFilter(normalized),
      );
      const documents = collection === "profiles"
        ? queriedDocuments
        : queriedDocuments.filter((document) =>
            matchesScopeFilter(document as MemoryScope, normalized),
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
          canonicalSources.push({
            collection,
            document,
            evidence: evidenceByMemoryId.get(id) ?? [],
            id,
          });
        }
      }
    }

    if (input.bulkBackfill) {
      // Bulk mode is for isolated eval/backfill runs and assumes canonical
      // sources are not being written concurrently.
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
              false,
              source.evidence,
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

    const queriedProjections = await documentStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      scopeFilter(normalized),
    );
    const projected = queriedProjections.filter((document) =>
      matchesScopeFilter(document, normalized),
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
