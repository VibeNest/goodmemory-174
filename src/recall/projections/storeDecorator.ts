import type {
  ConditionalDocumentWriteBatch,
  DocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import { isRecallProjectionSourceCollection } from "./contracts";
import type { KeyedMutationLock } from "./mutationLock";
import type { RecallProjectionOperations } from "./operations";
import { resolveProjectionScope } from "./projector";
import type { RecallProjectionRepairs } from "./repairs";
import { errorMessage, sourceMutationKey } from "./shared";

export function createProjectionAwareDocumentStore(input: {
  documentStore: DocumentStore;
  mutationLock: KeyedMutationLock;
  operations: RecallProjectionOperations;
  repairs: RecallProjectionRepairs;
  writeThrough: boolean;
}): DocumentStore {
  const { documentStore, mutationLock, operations, repairs, writeThrough } = input;

  async function synchronizeAfterCanonicalWrite(
    collection: string,
    sourceMemoryId: string,
    fallbackDocument?: StorageDocument,
  ): Promise<void> {
    if (!isRecallProjectionSourceCollection(collection)) {
      return;
    }
    const scope = fallbackDocument
      ? resolveProjectionScope(fallbackDocument) ?? undefined
      : undefined;
    try {
      await operations.synchronizeUnsafe(collection, sourceMemoryId, scope);
    } catch (error) {
      console.error(
        "[goodmemory:recall-projection] canonical write committed but projection sync failed",
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

  const decorated: DocumentStore = {
    async set(collection, id, document) {
      if (!writeThrough || !isRecallProjectionSourceCollection(collection)) {
        await documentStore.set(collection, id, document);
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
      if (!writeThrough || !isRecallProjectionSourceCollection(collection)) {
        await documentStore.update(collection, id, patch);
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

  if (documentStore.writeBatchIfUnchanged) {
    decorated.writeBatchIfUnchanged = async (
      batch: ConditionalDocumentWriteBatch,
    ): Promise<boolean> => {
      if (!writeThrough) {
        return documentStore.writeBatchIfUnchanged!(batch);
      }
      const sources = new Map<
        string,
        { collection: string; document: StorageDocument; id: string }
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
      return mutationLock.runExclusive([...sources.keys()], async () => {
        const committed = await documentStore.writeBatchIfUnchanged!(batch);
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

  return decorated;
}
