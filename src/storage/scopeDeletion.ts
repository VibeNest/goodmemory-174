import { normalizeScope, scopeToKey } from "../domain/scope";
import type { MemoryScope } from "../domain/scope";
import type {
  ProjectionCapableDocumentStore,
  StorageDocument,
} from "./contracts";
import { PROJECTION_BATCH_SEMANTICS } from "./contracts";

export const SCOPE_DELETION_LOCKS_COLLECTION = "scope_deletion_locks_v1";

interface ScopeDeletionLock extends StorageDocument {
  id: string;
  operationId: string;
}

const OPTIONAL_SCOPE_KEYS = [
  "tenantId",
  "workspaceId",
  "agentId",
  "sessionId",
] as const;

function documentScope(document: StorageDocument): MemoryScope | null {
  const outer = document as Partial<MemoryScope> & { scope?: unknown };
  const record = typeof outer.userId === "string"
    ? outer
    : typeof outer.scope === "object" && outer.scope !== null
    ? outer.scope as Partial<MemoryScope>
    : null;
  if (!record) {
    return null;
  }
  if (typeof record.userId !== "string" || record.userId.trim().length === 0) {
    return null;
  }

  return normalizeScope({
    userId: record.userId,
    ...(typeof record.tenantId === "string" ? { tenantId: record.tenantId } : {}),
    ...(typeof record.workspaceId === "string"
      ? { workspaceId: record.workspaceId }
      : {}),
    ...(typeof record.agentId === "string" ? { agentId: record.agentId } : {}),
    ...(typeof record.sessionId === "string" ? { sessionId: record.sessionId } : {}),
  });
}

export function scopeDeletionLockId(scope: MemoryScope): string {
  return scopeToKey(normalizeScope(scope));
}

export function scopeDeletionLockIdsForDocument(
  document: StorageDocument,
): string[] {
  const scope = documentScope(document);
  if (!scope) {
    return [];
  }

  const present = OPTIONAL_SCOPE_KEYS.filter((key) => scope[key] !== undefined);
  const ids = new Set<string>();
  for (let mask = 0; mask < 2 ** present.length; mask += 1) {
    const candidate: MemoryScope = { userId: scope.userId };
    present.forEach((key, index) => {
      if ((mask & (1 << index)) !== 0) {
        candidate[key] = scope[key];
      }
    });
    ids.add(scopeDeletionLockId(candidate));
  }
  return [...ids];
}

export interface ScopeDeletionCoordinator {
  runExclusive<T>(scope: MemoryScope, operation: () => Promise<T>): Promise<T>;
}

export function createScopeDeletionAwareDocumentStore(
  documentStore: ProjectionCapableDocumentStore,
): ProjectionCapableDocumentStore {
  async function activeDeletionLock(
    document: StorageDocument,
  ): Promise<string | null> {
    for (const id of scopeDeletionLockIdsForDocument(document)) {
      if (await documentStore.get(SCOPE_DELETION_LOCKS_COLLECTION, id)) {
        return id;
      }
    }
    return null;
  }

  async function assertScopeWritable(document: StorageDocument): Promise<void> {
    const lockId = await activeDeletionLock(document);
    if (lockId) {
      throw new Error(`Memory deletion is in progress for scope ${lockId}`);
    }
  }

  async function setAndRejectLateDeletion(
    collection: string,
    id: string,
    document: StorageDocument,
  ): Promise<void> {
    await assertScopeWritable(document);
    await documentStore.set(collection, id, document);
    const lockId = await activeDeletionLock(document);
    if (lockId) {
      await documentStore.delete(collection, id);
      throw new Error(`Memory deletion is in progress for scope ${lockId}`);
    }
  }

  return {
    projectionBatchSemantics: PROJECTION_BATCH_SEMANTICS,
    set: setAndRejectLateDeletion,
    get(collection, id) {
      return documentStore.get(collection, id);
    },
    async update(collection, id, patch) {
      const existing = await documentStore.get<StorageDocument>(collection, id);
      if (!existing) {
        await documentStore.update(collection, id, patch);
        return;
      }
      const updated = { ...existing, ...patch };
      await assertScopeWritable(updated);
      await documentStore.update(collection, id, patch);
      const lockId = await activeDeletionLock(updated);
      if (lockId) {
        await documentStore.delete(collection, id);
        throw new Error(`Memory deletion is in progress for scope ${lockId}`);
      }
    },
    query(collection, filter) {
      return documentStore.query(collection, filter);
    },
    ...(documentStore.queryPage
      ? {
          queryPage(collection, input) {
            return documentStore.queryPage!(collection, input);
          },
        }
      : {}),
    ...(documentStore.searchText
      ? {
          searchText(collection, input) {
            return documentStore.searchText!(collection, input);
          },
        }
      : {}),
    async writeBatchIfUnchanged(input) {
      for (const operation of input.set) {
        await assertScopeWritable(operation.document);
      }
      const committed = await documentStore.writeBatchIfUnchanged(input);
      if (!committed) {
        return false;
      }
      let blockedScope: string | null = null;
      for (const operation of input.set) {
        const lockId = await activeDeletionLock(operation.document);
        if (!lockId) {
          continue;
        }
        blockedScope ??= lockId;
        await documentStore.delete(operation.collection, operation.id);
      }
      if (blockedScope) {
        throw new Error(`Memory deletion is in progress for scope ${blockedScope}`);
      }
      return true;
    },
    delete(collection, id) {
      return documentStore.delete(collection, id);
    },
  };
}

export function createScopeDeletionCoordinator(
  documentStore: ProjectionCapableDocumentStore,
): ScopeDeletionCoordinator {
  return {
    async runExclusive<T>(
      scope: MemoryScope,
      operation: () => Promise<T>,
    ): Promise<T> {
      const id = scopeDeletionLockId(scope);
      const lock: ScopeDeletionLock = {
        id,
        operationId: crypto.randomUUID(),
      };
      let acquired = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const existing = await documentStore.get<ScopeDeletionLock>(
          SCOPE_DELETION_LOCKS_COLLECTION,
          id,
        );
        acquired = await documentStore.writeBatchIfUnchanged({
          expected: {
            collection: SCOPE_DELETION_LOCKS_COLLECTION,
            document: existing,
            id,
          },
          set: [{
            collection: SCOPE_DELETION_LOCKS_COLLECTION,
            document: lock,
            id,
          }],
        });
        if (acquired) {
          break;
        }
      }
      if (!acquired) {
        throw new Error(`Memory deletion lock changed repeatedly for scope ${id}`);
      }

      try {
        return await operation();
      } finally {
        await documentStore.writeBatchIfUnchanged({
          expected: {
            collection: SCOPE_DELETION_LOCKS_COLLECTION,
            document: lock,
            id,
          },
          set: [],
          delete: [{ collection: SCOPE_DELETION_LOCKS_COLLECTION, id }],
        });
      }
    },
  };
}
