import type { MemoryScope } from "../../domain/scope";
import {
  EVIDENCE_COLLECTION,
  type EvidenceRecord,
} from "../../evidence/contracts";
import type {
  ConditionalDocumentWriteBatch,
  ProjectionCapableDocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import {
  PROJECTION_BATCH_SEMANTICS,
  shallowMergeDocument,
} from "../../storage/contracts";
import {
  isRecallProjectionSourceCollection,
  type RecallProjectionSourceCollection,
} from "./contracts";
import type { KeyedMutationLock } from "./mutationLock";
import type { RecallProjectionOperations } from "./operations";
import { resolveProjectionScope } from "./projector";
import type { RecallProjectionRepairs } from "./repairs";
import type { ProjectionManifestTracker } from "./manifest";
import {
  errorMessage,
  matchesScopeFilter,
  scopeFilter,
  sourceMutationKey,
} from "./shared";

export function createProjectionAwareDocumentStore(input: {
  documentStore: ProjectionCapableDocumentStore;
  mutationLock: KeyedMutationLock;
  now: () => string;
  operations: RecallProjectionOperations;
  repairs: RecallProjectionRepairs;
  manifests: ProjectionManifestTracker;
  writeThrough: boolean;
}): ProjectionCapableDocumentStore {
  const {
    documentStore,
    manifests,
    mutationLock,
    now,
    operations,
    repairs,
    writeThrough,
  } = input;

  function isProjectionInputCollection(collection: string): boolean {
    return isRecallProjectionSourceCollection(collection) ||
      collection === EVIDENCE_COLLECTION;
  }

  function projectionScopes(
    documents: readonly (StorageDocument | null)[],
  ): MemoryScope[] {
    return documents
      .map((document) =>
        document ? resolveProjectionScope(document) : null
      )
      .filter((candidate): candidate is MemoryScope => candidate !== null);
  }

  async function setProjectionInputAndInvalidate(
    collection: string,
    id: string,
    document: StorageDocument,
  ): Promise<StorageDocument | null> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await documentStore.get<StorageDocument>(collection, id);
      const invalidation = await manifests.prepareInvalidation(
        projectionScopes([existing, document]),
      );
      const committed = await documentStore.writeBatchIfUnchanged({
        expected: { collection, document: existing, id },
        set: [
          { collection, document, id },
          ...invalidation.set,
        ],
        unchanged: invalidation.unchanged,
      });
      if (committed) {
        return existing;
      }
    }
    throw new Error(
      `Projection input changed repeatedly during write: ${collection}/${id}`,
    );
  }

  async function updateProjectionInputAndInvalidate<
    TDocument extends StorageDocument,
  >(
    collection: string,
    id: string,
    patch: Partial<TDocument>,
  ): Promise<{ existing: TDocument; updated: TDocument }> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await documentStore.get<TDocument>(collection, id);
      if (!existing) {
        throw new Error(`Document not found for update: ${collection}/${id}`);
      }
      const updated = shallowMergeDocument(existing, patch);
      const invalidation = await manifests.prepareInvalidation(
        projectionScopes([existing, updated]),
      );
      const committed = await documentStore.writeBatchIfUnchanged({
        expected: { collection, document: existing, id },
        set: [
          { collection, document: updated, id },
          ...invalidation.set,
        ],
        unchanged: invalidation.unchanged,
      });
      if (committed) {
        return { existing, updated };
      }
    }
    throw new Error(
      `Projection input changed repeatedly during update: ${collection}/${id}`,
    );
  }

  async function deleteProjectionInputAndInvalidate(
    collection: string,
    id: string,
  ): Promise<StorageDocument | null> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await documentStore.get<StorageDocument>(collection, id);
      if (!existing) {
        return null;
      }
      const invalidation = await manifests.prepareInvalidation(
        projectionScopes([existing]),
      );
      const committed = await documentStore.writeBatchIfUnchanged({
        delete: [{ collection, id }],
        expected: { collection, document: existing, id },
        set: invalidation.set,
        unchanged: invalidation.unchanged,
      });
      if (committed) {
        return existing;
      }
    }
    throw new Error(
      `Projection input changed repeatedly during deletion: ${collection}/${id}`,
    );
  }

  async function evidenceForFact(
    collection: string,
    sourceMemoryId: string,
    document?: StorageDocument,
  ): Promise<EvidenceRecord[] | undefined> {
    if (collection !== "facts" || !document) {
      return undefined;
    }
    const scope = resolveProjectionScope(document);
    if (!scope) {
      return undefined;
    }
    const evidence = await documentStore.query<EvidenceRecord>(
      EVIDENCE_COLLECTION,
      scopeFilter(scope),
    );
    return evidence.filter((record) =>
      matchesScopeFilter(record, scope) &&
      record.linkedMemoryIds.includes(sourceMemoryId)
    );
  }

  async function registerScopeAfterCanonicalWrite(
    collection: RecallProjectionSourceCollection,
    sourceMemoryId: string,
    document: StorageDocument,
  ): Promise<void> {
    const scope = resolveProjectionScope(document) ?? undefined;
    if (!scope) {
      return;
    }
    try {
      await operations.registerScope(scope, now());
    } catch (error) {
      console.error(
        "[goodmemory:scope-catalog] canonical write committed but scope registration failed",
        {
          collection,
          error: errorMessage(error),
          sourceMemoryId,
        },
      );
      await repairs.queue({
        collection,
        error,
        scope,
        sourceMemoryId,
      });
    }
  }

  async function synchronizeAfterCanonicalWrite(
    collection: string,
    sourceMemoryId: string,
    fallbackDocument?: StorageDocument,
    evidenceDocument = fallbackDocument,
  ): Promise<void> {
    if (!isRecallProjectionSourceCollection(collection)) {
      return;
    }
    const fallbackScope = fallbackDocument
      ? resolveProjectionScope(fallbackDocument) ?? undefined
      : undefined;
    try {
      const evidence = await evidenceForFact(
        collection,
        sourceMemoryId,
        evidenceDocument,
      );
      await operations.synchronizeUnsafe(
        collection,
        sourceMemoryId,
        fallbackScope,
        false,
        evidence,
      );
    } catch (error) {
      console.error(
        "[goodmemory:recall-projection] canonical write committed but projection sync failed",
        {
          collection,
          error: errorMessage(error),
          sourceMemoryId,
        },
      );
      let currentScope: MemoryScope | undefined;
      try {
        const current = await documentStore.get<StorageDocument>(
          collection,
          sourceMemoryId,
        );
        currentScope = current
          ? resolveProjectionScope(current) ?? undefined
          : undefined;
      } catch (readError) {
        console.error(
          "[goodmemory:recall-projection] failed to resolve the current scope for repair",
          {
            collection,
            error: errorMessage(readError),
            sourceMemoryId,
          },
        );
      }
      await repairs.queue({
        affectedScopes: [fallbackScope, currentScope].filter(
          (scope): scope is MemoryScope => scope !== undefined,
        ),
        collection,
        error,
        scope: currentScope ?? fallbackScope,
        sourceMemoryId,
      });
    }
  }

  async function writeConditionalBatch(
    batch: ConditionalDocumentWriteBatch,
  ): Promise<boolean> {
    const projectionOperations = [
      ...batch.set,
      ...(batch.delete ?? []),
    ].filter(({ collection }) => isProjectionInputCollection(collection));
    const tracked = new Map<
      string,
      {
        collection: string;
        document: StorageDocument | null;
        id: string;
      }
    >();
    for (const operation of projectionOperations) {
      const key = sourceMutationKey(operation.collection, operation.id);
      if (tracked.has(key)) {
        continue;
      }
      tracked.set(key, {
        collection: operation.collection,
        document: await documentStore.get<StorageDocument>(
          operation.collection,
          operation.id,
        ),
        id: operation.id,
      });
    }
    const sources = new Map<
      string,
      {
        collection: RecallProjectionSourceCollection;
        document: StorageDocument;
        fallbackDocument?: StorageDocument;
        id: string;
      }
    >();
    for (const operation of batch.set) {
      if (!isRecallProjectionSourceCollection(operation.collection)) continue;
      const existing = tracked.get(
        sourceMutationKey(operation.collection, operation.id),
      );
      sources.set(sourceMutationKey(operation.collection, operation.id), {
        collection: operation.collection,
        document: operation.document,
        ...(existing?.document
          ? { fallbackDocument: existing.document }
          : {}),
        id: operation.id,
      });
    }
    const deletedSources = new Map<
      string,
      {
        collection: RecallProjectionSourceCollection;
        document: StorageDocument;
        id: string;
      }
    >();
    for (const operation of batch.delete ?? []) {
      if (!isRecallProjectionSourceCollection(operation.collection)) {
        continue;
      }
      const document = tracked.get(
        sourceMutationKey(operation.collection, operation.id),
      );
      if (document?.document) {
        deletedSources.set(
          sourceMutationKey(operation.collection, operation.id),
          {
            collection: operation.collection,
            document: document.document,
            id: operation.id,
          },
        );
      }
    }
    const constrained = new Set(
      [batch.expected, ...(batch.unchanged ?? [])].map(({ collection, id }) =>
        sourceMutationKey(collection, id)
      ),
    );
    const trackedUnchanged = [...tracked.entries()]
      .filter(([key]) => !constrained.has(key))
      .map(([, current]) => ({
        collection: current.collection,
        document: current.document,
        id: current.id,
      }));
    let persistedBatch: ConditionalDocumentWriteBatch = {
      ...batch,
      unchanged: [...(batch.unchanged ?? []), ...trackedUnchanged],
    };
    if (manifests.enabled) {
      const invalidation = await manifests.prepareInvalidation([
        ...projectionScopes([...tracked.values()].map(({ document }) => document)),
        ...projectionScopes(
          batch.set
            .filter(({ collection }) => isProjectionInputCollection(collection))
            .map(({ document }) => document),
        ),
      ]);
      persistedBatch = {
        ...persistedBatch,
        set: [...batch.set, ...invalidation.set],
        unchanged: [
          ...(persistedBatch.unchanged ?? []),
          ...invalidation.unchanged,
        ],
      };
    }
    if (!writeThrough) {
      const committed = await documentStore.writeBatchIfUnchanged(persistedBatch);
      if (committed) {
        for (const source of sources.values()) {
          await registerScopeAfterCanonicalWrite(
            source.collection,
            source.id,
            source.document,
          );
        }
      }
      return committed;
    }
    return mutationLock.runExclusive(
      [...new Set([...sources.keys(), ...deletedSources.keys()])],
      async () => {
      const committed = await documentStore.writeBatchIfUnchanged(persistedBatch);
      if (!committed) return false;
      for (const source of sources.values()) {
        await synchronizeAfterCanonicalWrite(
          source.collection,
          source.id,
          source.fallbackDocument,
          source.document,
        );
      }
      for (const source of deletedSources.values()) {
        await synchronizeAfterCanonicalWrite(
          source.collection,
          source.id,
          source.document,
        );
      }
      return true;
    });
  }

  const decorated: ProjectionCapableDocumentStore = {
    projectionBatchSemantics: PROJECTION_BATCH_SEMANTICS,
    async set(collection, id, document) {
      if (collection === EVIDENCE_COLLECTION) {
        if (manifests.enabled) {
          await setProjectionInputAndInvalidate(collection, id, document);
        } else {
          await documentStore.set(collection, id, document);
        }
        return;
      }
      if (!isRecallProjectionSourceCollection(collection)) {
        await documentStore.set(collection, id, document);
        return;
      }
      if (!writeThrough) {
        await setProjectionInputAndInvalidate(collection, id, document);
        await registerScopeAfterCanonicalWrite(collection, id, document);
        return;
      }
      await mutationLock.runExclusive(
        [sourceMutationKey(collection, id)],
        async () => {
          const existing = await setProjectionInputAndInvalidate(
            collection,
            id,
            document,
          );
          await synchronizeAfterCanonicalWrite(
            collection,
            id,
            existing ?? undefined,
            document,
          );
        },
      );
    },
    get(collection, id) {
      return documentStore.get(collection, id);
    },
    async update(collection, id, patch) {
      if (collection === EVIDENCE_COLLECTION) {
        if (manifests.enabled) {
          await updateProjectionInputAndInvalidate(collection, id, patch);
        } else {
          await documentStore.update(collection, id, patch);
        }
        return;
      }
      if (!isRecallProjectionSourceCollection(collection)) {
        await documentStore.update(collection, id, patch);
        return;
      }
      if (!writeThrough) {
        const { updated } = await updateProjectionInputAndInvalidate(
          collection,
          id,
          patch,
        );
        await registerScopeAfterCanonicalWrite(collection, id, updated);
        return;
      }
      await mutationLock.runExclusive(
        [sourceMutationKey(collection, id)],
        async () => {
          const { existing, updated } =
            await updateProjectionInputAndInvalidate(
              collection,
              id,
              patch,
            );
          await synchronizeAfterCanonicalWrite(
            collection,
            id,
            existing,
            updated,
          );
        },
      );
    },
    query(collection, filter) {
      return documentStore.query(collection, filter);
    },
    async delete(collection, id) {
      if (collection === EVIDENCE_COLLECTION) {
        if (manifests.enabled) {
          await deleteProjectionInputAndInvalidate(collection, id);
        } else {
          await documentStore.delete(collection, id);
        }
        return;
      }
      if (!isRecallProjectionSourceCollection(collection)) {
        await documentStore.delete(collection, id);
        return;
      }
      await mutationLock.runExclusive(
        [sourceMutationKey(collection, id)],
        async () => {
          let existing = await documentStore.get<StorageDocument>(collection, id);
          for (let attempt = 0; existing && attempt < 8; attempt += 1) {
            const invalidation = manifests.enabled
              ? await manifests.prepareInvalidation(projectionScopes([existing]))
              : undefined;
            const committed = await repairs.deleteCanonicalAndRepairs(
              collection,
              id,
              existing,
              invalidation,
            );
            if (committed) break;
            existing = await documentStore.get<StorageDocument>(collection, id);
          }
          if (existing && await documentStore.get(collection, id)) {
            throw new Error(
              `Canonical memory changed repeatedly during deletion: ${collection}/${id}`,
            );
          }
          if (!existing) {
            await repairs.discardSource(collection, id);
          }
          const scope = existing
            ? resolveProjectionScope(existing) ?? undefined
            : undefined;
          try {
            await operations.synchronizeUnsafe(collection, id, scope);
          } catch (error) {
            console.error(
              "[goodmemory:recall-projection] canonical delete committed but projection cleanup failed",
              { collection, error: errorMessage(error), sourceMemoryId: id },
            );
            await repairs.queue({
              collection,
              error,
              scope,
              sourceMemoryId: id,
            });
            throw new Error(
              `Canonical memory was deleted, but projection cleanup is pending for ${collection}/${id}: ${errorMessage(error)}`,
              { cause: error },
            );
          }
        },
      );
    },
    writeBatchIfUnchanged: writeConditionalBatch,
  };

  if (documentStore.queryPage) {
    decorated.queryPage = (collection, page) =>
      documentStore.queryPage!(collection, page);
  }

  return decorated;
}
