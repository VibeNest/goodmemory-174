import { createHash } from "node:crypto";

import {
  isProjectionCapableDocumentStore,
  type ConditionalDocumentWriteBatch,
  type DocumentStore,
  type ProjectionCapableDocumentStore,
  type StorageDocument,
} from "../storage/contracts";
import type { RollbackAction } from "./contracts";

const REMEMBER_WRITE_OWNERS_COLLECTION = "remember_write_owners_v1";
const MAX_WRITE_CONFLICT_RETRIES = 8;

interface RememberWriteOwner extends StorageDocument {
  operationId: string;
  writeId: string;
}

export interface RememberWriteCoordinator {
  deleteDocument(collection: string, id: string): Promise<void>;
  releaseOwnership(): Promise<void>;
  rollbackActions: RollbackAction[];
  setDocument<TDocument extends object>(
    collection: string,
    id: string,
    document: TDocument,
  ): Promise<void>;
}

export function createRememberWriteCoordinator(
  documentStore: DocumentStore,
): RememberWriteCoordinator {
  const atomicStore: ProjectionCapableDocumentStore | null =
    isProjectionCapableDocumentStore(documentStore) ? documentStore : null;
  const operationId = crypto.randomUUID();
  const ownedMarkers = new Map<string, RememberWriteOwner>();
  const rollbackActions: RollbackAction[] = [];

  const ownerId = (collection: string, id: string): string =>
    `owner_${createHash("sha256")
      .update(collection)
      .update("\u0000")
      .update(id)
      .digest("hex")}`;

  async function commitOwnedBatch(
    id: string,
    owner: RememberWriteOwner,
    batch: ConditionalDocumentWriteBatch,
    rollback: RollbackAction,
  ): Promise<boolean> {
    if (!atomicStore) {
      return false;
    }

    const recordOwnership = (): void => {
      ownedMarkers.set(id, owner);
      rollbackActions.push(rollback);
    };
    try {
      const committed = await atomicStore.writeBatchIfUnchanged(batch);
      if (committed) {
        recordOwnership();
      }
      return committed;
    } catch (error) {
      const current = await atomicStore.get<RememberWriteOwner>(
        REMEMBER_WRITE_OWNERS_COLLECTION,
        id,
      );
      if (current?.writeId === owner.writeId) {
        recordOwnership();
      }
      throw error;
    }
  }

  return {
    rollbackActions,
    async setDocument(collection, id, document) {
      if (!atomicStore) {
        await documentStore.set(collection, id, document);
        return;
      }

      const markerId = ownerId(collection, id);
      const owner: RememberWriteOwner = {
        operationId,
        writeId: crypto.randomUUID(),
      };
      for (let attempt = 0; attempt < MAX_WRITE_CONFLICT_RETRIES; attempt += 1) {
        const [previous, previousOwner] = await Promise.all([
          atomicStore.get<StorageDocument>(collection, id),
          atomicStore.get<RememberWriteOwner>(
            REMEMBER_WRITE_OWNERS_COLLECTION,
            markerId,
          ),
        ]);
        const committed = await commitOwnedBatch(
          markerId,
          owner,
          {
            expected: { collection, document: previous, id },
            unchanged: [{
              collection: REMEMBER_WRITE_OWNERS_COLLECTION,
              document: previousOwner,
              id: markerId,
            }],
            set: [
              { collection, document, id },
              {
                collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                document: owner,
                id: markerId,
              },
            ],
          },
          async () => {
            await atomicStore.writeBatchIfUnchanged({
              expected: {
                collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                document: owner,
                id: markerId,
              },
              unchanged: [{ collection, document, id }],
              set: [
                ...(previous ? [{ collection, document: previous, id }] : []),
                ...(previousOwner
                  ? [{
                      collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                      document: previousOwner,
                      id: markerId,
                    }]
                  : []),
              ],
              delete: [
                ...(!previous ? [{ collection, id }] : []),
                ...(!previousOwner
                  ? [{
                      collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                      id: markerId,
                    }]
                  : []),
              ],
            });
          },
        );
        if (committed) {
          return;
        }
      }

      throw new Error(`Remember write changed repeatedly: ${collection}/${id}`);
    },
    async deleteDocument(collection, id) {
      if (!atomicStore) {
        await documentStore.delete(collection, id);
        return;
      }

      const markerId = ownerId(collection, id);
      const owner: RememberWriteOwner = {
        operationId,
        writeId: crypto.randomUUID(),
      };
      for (let attempt = 0; attempt < MAX_WRITE_CONFLICT_RETRIES; attempt += 1) {
        const [previous, previousOwner] = await Promise.all([
          atomicStore.get<StorageDocument>(collection, id),
          atomicStore.get<RememberWriteOwner>(
            REMEMBER_WRITE_OWNERS_COLLECTION,
            markerId,
          ),
        ]);
        if (!previous) {
          return;
        }
        const committed = await commitOwnedBatch(
          markerId,
          owner,
          {
            expected: { collection, document: previous, id },
            unchanged: [{
              collection: REMEMBER_WRITE_OWNERS_COLLECTION,
              document: previousOwner,
              id: markerId,
            }],
            set: [{
              collection: REMEMBER_WRITE_OWNERS_COLLECTION,
              document: owner,
              id: markerId,
            }],
            delete: [{ collection, id }],
          },
          async () => {
            await atomicStore.writeBatchIfUnchanged({
              expected: {
                collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                document: owner,
                id: markerId,
              },
              unchanged: [{ collection, document: null, id }],
              set: [
                { collection, document: previous, id },
                ...(previousOwner
                  ? [{
                      collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                      document: previousOwner,
                      id: markerId,
                    }]
                  : []),
              ],
              ...(!previousOwner
                ? {
                    delete: [{
                      collection: REMEMBER_WRITE_OWNERS_COLLECTION,
                      id: markerId,
                    }],
                  }
                : {}),
            });
          },
        );
        if (committed) {
          return;
        }
      }

      throw new Error(`Remember delete changed repeatedly: ${collection}/${id}`);
    },
    async releaseOwnership() {
      if (!atomicStore) {
        return;
      }
      for (const [id, owner] of ownedMarkers) {
        try {
          await atomicStore.writeBatchIfUnchanged({
            expected: {
              collection: REMEMBER_WRITE_OWNERS_COLLECTION,
              document: owner,
              id,
            },
            set: [],
            delete: [{ collection: REMEMBER_WRITE_OWNERS_COLLECTION, id }],
          });
        } catch (error) {
          console.error("[goodmemory:remember] failed to release write ownership", {
            error: error instanceof Error ? error.message : String(error),
            ownerId: id,
          });
        }
      }
    },
  };
}
