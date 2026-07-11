import {
  normalizeScope,
  scopeToKey,
} from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import type { DocumentStore } from "../../storage/contracts";
import {
  PROJECTION_REPAIRS_COLLECTION,
} from "./contracts";
import type {
  ProjectionRepairRecord,
  RecallProjectionSourceCollection,
} from "./contracts";
import type { KeyedMutationLock } from "./mutationLock";
import type { RecallProjectionOperations } from "./operations";
import { resolveProjectionScope } from "./projector";
import {
  errorMessage,
  matchesScopeFilter,
  scopeFilter,
  sourceMutationKey,
} from "./shared";

export interface ProjectionRepairInput {
  affectedScopes?: readonly MemoryScope[];
  collection: RecallProjectionSourceCollection;
  error: unknown;
  scope?: MemoryScope;
  sourceMemoryId: string;
}

export interface RecallProjectionRepairs {
  queue(input: ProjectionRepairInput): Promise<void>;
  repairPending(scope: MemoryScope): Promise<number>;
}

function repairId(
  collection: RecallProjectionSourceCollection,
  sourceMemoryId: string,
): string {
  return `${collection}:${sourceMemoryId}:${crypto.randomUUID()}`;
}

export function createRecallProjectionRepairs(input: {
  documentStore: DocumentStore;
  mutationLock: KeyedMutationLock;
  now: () => string;
  operations: RecallProjectionOperations;
}): RecallProjectionRepairs {
  const { documentStore, mutationLock, now, operations } = input;
  const volatileRepairs = new Map<string, ProjectionRepairRecord>();

  async function queue(repairInput: ProjectionRepairInput): Promise<void> {
    const id = repairId(
      repairInput.collection,
      repairInput.sourceMemoryId,
    );
    const scope = repairInput.scope;
    if (!scope) {
      console.error(
        "[goodmemory:recall-projection] projection repair could not be scoped",
        {
          collection: repairInput.collection,
          error: errorMessage(repairInput.error),
          sourceMemoryId: repairInput.sourceMemoryId,
        },
      );
      return;
    }
    const timestamp = now();
    const normalized = normalizeScope(scope);
    const repair: ProjectionRepairRecord = {
      id,
      schemaVersion: 1,
      ...normalized,
      scopeKey: scopeToKey(normalized),
      sourceCollection: repairInput.collection,
      sourceMemoryId: repairInput.sourceMemoryId,
      attempts: 1,
      firstFailedAt: timestamp,
      lastFailedAt: timestamp,
      lastError: errorMessage(repairInput.error),
    };
    volatileRepairs.set(id, repair);
    try {
      await documentStore.set(PROJECTION_REPAIRS_COLLECTION, id, repair);
    } catch (queueError) {
      console.error(
        "[goodmemory:recall-projection] failed to persist projection repair",
        {
          collection: repairInput.collection,
          error: errorMessage(queueError),
          sourceMemoryId: repairInput.sourceMemoryId,
        },
      );
    }
    const affectedScopes = new Map<string, MemoryScope>();
    for (const affected of [normalized, ...(repairInput.affectedScopes ?? [])]) {
      affectedScopes.set(scopeToKey(affected), affected);
    }
    for (const affected of affectedScopes.values()) {
      try {
        await operations.registerScope(affected, timestamp, "partial");
      } catch (catalogError) {
        console.error(
          "[goodmemory:recall-projection] failed to mark projection coverage partial",
          {
            error: errorMessage(catalogError),
            scopeKey: scopeToKey(affected),
          },
        );
      }
    }
  }

  return {
    queue,
    async repairPending(scope) {
      const queried = await documentStore.query<ProjectionRepairRecord>(
        PROJECTION_REPAIRS_COLLECTION,
        scopeFilter(scope),
      );
      const persisted = queried.filter((repair) =>
        matchesScopeFilter(repair, scope),
      );
      const repairs = new Map(
        [
          ...persisted,
          ...[...volatileRepairs.values()].filter((repair) =>
            matchesScopeFilter(repair, scope),
          ),
        ].map((repair) => [repair.id, repair]),
      );
      let repaired = 0;
      for (const repair of [...repairs.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        try {
          await mutationLock.runExclusive(
            [sourceMutationKey(repair.sourceCollection, repair.sourceMemoryId)],
            () =>
              operations.synchronizeUnsafe(
                repair.sourceCollection,
                repair.sourceMemoryId,
                resolveProjectionScope(repair) ?? undefined,
                true,
              ),
          );
          volatileRepairs.delete(repair.id);
          await documentStore.delete(PROJECTION_REPAIRS_COLLECTION, repair.id);
          repaired += 1;
        } catch (error) {
          const timestamp = now();
          const next: ProjectionRepairRecord = {
            ...repair,
            attempts: repair.attempts + 1,
            lastFailedAt: timestamp,
            lastError: errorMessage(error),
          };
          volatileRepairs.set(next.id, next);
          try {
            await documentStore.set(PROJECTION_REPAIRS_COLLECTION, next.id, next);
          } catch (persistError) {
            console.error(
              "[goodmemory:recall-projection] repair retry could not persist state",
              {
                error: errorMessage(persistError),
                repairId: next.id,
              },
            );
          }
        }
      }
      return repaired;
    },
  };
}
