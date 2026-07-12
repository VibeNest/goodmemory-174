import type { MemoryScope } from "../../domain/scope";
import type {
  ConditionalDocumentWriteBatch,
  DocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import {
  isRecallProjectionSourceCollection,
  type RecallProjectionSourceCollection,
} from "./contracts";
import type { KeyedMutationLock } from "./mutationLock";
import type { RecallProjectionOperations } from "./operations";
import { resolveProjectionScope } from "./projector";
import type { RecallProjectionRepairs } from "./repairs";
import { errorMessage, sourceMutationKey } from "./shared";

export function createProjectionAwareDocumentStore(input: {
  documentStore: DocumentStore;
  mutationLock: KeyedMutationLock;
  now: () => string;
  operations: RecallProjectionOperations;
  repairs: RecallProjectionRepairs;
  writeThrough: boolean;
}): DocumentStore {
  const { documentStore, mutationLock, now, operations, repairs, writeThrough } = input;

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
  ): Promise<void> {
    if (!isRecallProjectionSourceCollection(collection)) {
      return;
    }
    const fallbackScope = fallbackDocument
      ? resolveProjectionScope(fallbackDocument) ?? undefined
      : undefined;
    try {
      await operations.synchronizeUnsafe(
        collection,
        sourceMemoryId,
        fallbackScope,
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

  const decorated: DocumentStore = {
    async set(collection, id, document) {
      if (!isRecallProjectionSourceCollection(collection)) {
        await documentStore.set(collection, id, document);
        return;
      }
      if (!writeThrough) {
        await documentStore.set(collection, id, document);
        await registerScopeAfterCanonicalWrite(collection, id, document);
        return;
      }
      await mutationLock.runExclusive(
        [sourceMutationKey(collection, id)],
        async () => {
          await documentStore.set(collection, id, document);
          await synchronizeAfterCanonicalWrite(collection, id, document);
        },
      );
    },
    get(collection, id) {
      return documentStore.get(collection, id);
    },
    async update(collection, id, patch) {
      if (!isRecallProjectionSourceCollection(collection)) {
        await documentStore.update(collection, id, patch);
        return;
      }
      if (!writeThrough) {
        await documentStore.update(collection, id, patch);
        const updated = await documentStore.get<StorageDocument>(collection, id);
        if (updated) {
          await registerScopeAfterCanonicalWrite(collection, id, updated);
        }
        return;
      }
      await mutationLock.runExclusive(
        [sourceMutationKey(collection, id)],
        async () => {
          const existing = await documentStore.get<StorageDocument>(collection, id);
          await documentStore.update(collection, id, patch);
          await synchronizeAfterCanonicalWrite(
            collection,
            id,
            existing ?? undefined,
          );
        },
      );
    },
    query(collection, filter) {
      return documentStore.query(collection, filter);
    },
    async delete(collection, id) {
      if (!isRecallProjectionSourceCollection(collection)) {
        await documentStore.delete(collection, id);
        return;
      }
      await mutationLock.runExclusive(
        [sourceMutationKey(collection, id)],
        async () => {
          const existing = await documentStore.get<StorageDocument>(collection, id);
          await documentStore.delete(collection, id);
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
  };

  const writeBatchIfUnchanged = documentStore.writeBatchIfUnchanged;
  if (writeBatchIfUnchanged) {
    decorated.writeBatchIfUnchanged = async (
      batch: ConditionalDocumentWriteBatch,
    ): Promise<boolean> => {
      const sources = new Map<
        string,
        {
          collection: RecallProjectionSourceCollection;
          document: StorageDocument;
          id: string;
        }
      >();
      for (const operation of batch.set) {
        if (!isRecallProjectionSourceCollection(operation.collection)) {
          continue;
        }
        sources.set(sourceMutationKey(operation.collection, operation.id), {
          collection: operation.collection,
          document: operation.document,
          id: operation.id,
        });
      }
      if (!writeThrough) {
        const committed = await writeBatchIfUnchanged(batch);
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
      return mutationLock.runExclusive([...sources.keys()], async () => {
        const committed = await writeBatchIfUnchanged(batch);
        if (!committed) {
          return false;
        }
        for (const source of sources.values()) {
          await synchronizeAfterCanonicalWrite(
            source.collection,
            source.id,
            source.document,
          );
        }
        return true;
      });
    };
  }

  if (documentStore.queryPage) {
    decorated.queryPage = (collection, page) =>
      documentStore.queryPage!(collection, page);
  }

  return decorated;
}
