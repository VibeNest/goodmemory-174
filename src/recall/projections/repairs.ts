import {
  normalizeScope,
  scopeToKey,
} from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import {
  isActiveMemoryLifecycle,
  type FactMemory,
} from "../../domain/records";
import type {
  ProjectionCapableDocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import {
  PROJECTION_REPAIRS_COLLECTION,
  CLAIM_PROJECTION_STATUS_COLLECTION,
} from "./contracts";
import type {
  AppendClaimProjectionInput,
  ClaimProjectionStatus,
  ProjectionRepairRecord,
  RecallProjectionSourceCollection,
} from "./contracts";
import { buildClaimProjectionStatusId } from "./claims";
import type { KeyedMutationLock } from "./mutationLock";
import type { ProjectionManifestMutation } from "./manifest";
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
  target?: "recall" | "claim";
  claimInput?: AppendClaimProjectionInput;
}

export interface RecallProjectionRepairs {
  deleteCanonicalAndRepairs(
    collection: RecallProjectionSourceCollection,
    sourceMemoryId: string,
    canonical: StorageDocument,
    manifestMutation?: ProjectionManifestMutation,
  ): Promise<boolean>;
  discardSource(
    collection: RecallProjectionSourceCollection,
    sourceMemoryId: string,
  ): Promise<void>;
  queue(input: ProjectionRepairInput): Promise<void>;
  repairPending(scope: MemoryScope): Promise<number>;
}

function repairId(
  collection: RecallProjectionSourceCollection,
  sourceMemoryId: string,
  target: "recall" | "claim" = "recall",
): string {
  return `${collection}:${sourceMemoryId}:${target}`;
}

export function createRecallProjectionRepairs(input: {
  documentStore: ProjectionCapableDocumentStore;
  mutationLock: KeyedMutationLock;
  now: () => string;
  operations: RecallProjectionOperations;
}): RecallProjectionRepairs {
  const { documentStore, mutationLock, now, operations } = input;

  async function queue(repairInput: ProjectionRepairInput): Promise<void> {
    const id = repairId(
      repairInput.collection,
      repairInput.sourceMemoryId,
      repairInput.target,
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
    const canonical = await documentStore.get<StorageDocument>(
      repairInput.collection,
      repairInput.sourceMemoryId,
    );
    const canonicalScope = canonical
      ? resolveProjectionScope(canonical)
      : null;
    if (!canonical || !canonicalScope) {
      if (repairInput.target === "claim" || repairInput.claimInput) return;
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
        target: "recall",
      };
      await documentStore.set(PROJECTION_REPAIRS_COLLECTION, id, repair);
      return;
    }
    if (repairInput.target === "claim") {
      if (!matchesScopeFilter(canonicalScope, normalized)) return;
      const fact = canonical as FactMemory;
      if (!isActiveMemoryLifecycle(fact) || fact.isActive === false) return;
    }
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
      target: repairInput.target,
      claimInput: repairInput.claimInput,
    };
    const existing = await documentStore.get<ProjectionRepairRecord>(
      PROJECTION_REPAIRS_COLLECTION,
      id,
    );
    const committed = await documentStore.writeBatchIfUnchanged({
      expected: {
        collection: repairInput.collection,
        document: canonical,
        id: repairInput.sourceMemoryId,
      },
      set: [{
        collection: PROJECTION_REPAIRS_COLLECTION,
        document: repair,
        id,
      }],
      unchanged: [{
        collection: PROJECTION_REPAIRS_COLLECTION,
        document: existing,
        id,
      }],
    });
    if (!committed) return;
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
    async deleteCanonicalAndRepairs(
      collection,
      sourceMemoryId,
      canonical,
      manifestMutation,
    ) {
      const persisted = await documentStore.query<ProjectionRepairRecord>(
        PROJECTION_REPAIRS_COLLECTION,
        { sourceCollection: collection, sourceMemoryId },
      );
      const repairs = new Map<string, ProjectionRepairRecord | null>(
        persisted.map((repair) => [repair.id, repair]),
      );
      for (const target of ["recall", "claim"] as const) {
        const id = repairId(collection, sourceMemoryId, target);
        if (!repairs.has(id)) {
          repairs.set(id, null);
        }
      }
      return documentStore.writeBatchIfUnchanged({
        delete: [
          { collection, id: sourceMemoryId },
          ...[...repairs.keys()].map((id) => ({
            collection: PROJECTION_REPAIRS_COLLECTION,
            id,
          })),
        ],
        expected: { collection, document: canonical, id: sourceMemoryId },
        set: manifestMutation?.set ?? [],
        unchanged: [
          ...[...repairs].map(([id, repair]) => ({
            collection: PROJECTION_REPAIRS_COLLECTION,
            document: repair,
            id,
          })),
          ...(manifestMutation?.unchanged ?? []),
        ],
      });
    },
    async discardSource(collection, sourceMemoryId) {
      const persisted = await documentStore.query<ProjectionRepairRecord>(
        PROJECTION_REPAIRS_COLLECTION,
        { sourceCollection: collection, sourceMemoryId },
      );
      for (const repair of persisted) {
        await documentStore.delete(PROJECTION_REPAIRS_COLLECTION, repair.id);
      }
    },
    queue,
    async repairPending(scope) {
      const queried = await documentStore.query<ProjectionRepairRecord>(
        PROJECTION_REPAIRS_COLLECTION,
        scopeFilter(scope),
      );
      const persisted = queried.filter((repair) =>
        matchesScopeFilter(repair, scope),
      );
      let repaired = 0;
      for (const repair of [...persisted].sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        try {
          await mutationLock.runExclusive(
            [sourceMutationKey(repair.sourceCollection, repair.sourceMemoryId)],
            async () => {
              if (repair.target === "claim" && repair.claimInput) {
                const canonical = await documentStore.get<StorageDocument>(
                  repair.sourceCollection,
                  repair.sourceMemoryId,
                );
                const fact = canonical as FactMemory | null;
                if (
                  !fact ||
                  !matchesScopeFilter(fact, repair.claimInput) ||
                  !isActiveMemoryLifecycle(fact) ||
                  fact.isActive === false
                ) {
                  await operations.synchronizeUnsafe(
                    repair.sourceCollection,
                    repair.sourceMemoryId,
                    resolveProjectionScope(repair) ?? undefined,
                    true,
                  );
                } else {
                  await operations.appendClaimUnsafe(repair.claimInput);
                }
                const status = await documentStore.get<ClaimProjectionStatus>(
                  CLAIM_PROJECTION_STATUS_COLLECTION,
                  buildClaimProjectionStatusId(
                    repair.claimInput,
                    repair.sourceMemoryId,
                  ),
                );
                if (status?.state === "failed") {
                  throw new Error(
                    `Claim repair ${repair.id} did not resolve its failed status.`,
                  );
                }
                return;
              }
              await operations.synchronizeUnsafe(
                repair.sourceCollection,
                repair.sourceMemoryId,
                resolveProjectionScope(repair) ?? undefined,
                true,
              );
            },
          );
          const consumed = await documentStore.writeBatchIfUnchanged({
            delete: [{ collection: PROJECTION_REPAIRS_COLLECTION, id: repair.id }],
            expected: {
              collection: PROJECTION_REPAIRS_COLLECTION,
              document: repair,
              id: repair.id,
            },
            set: [],
          });
          if (consumed) repaired += 1;
        } catch (error) {
          const timestamp = now();
          const next: ProjectionRepairRecord = {
            ...repair,
            attempts: repair.attempts + 1,
            lastFailedAt: timestamp,
            lastError: errorMessage(error),
          };
          try {
            const canonical = await documentStore.get<StorageDocument>(
              repair.sourceCollection,
              repair.sourceMemoryId,
            );
            if (!canonical) {
              await documentStore.writeBatchIfUnchanged({
                delete: [{ collection: PROJECTION_REPAIRS_COLLECTION, id: repair.id }],
                expected: {
                  collection: PROJECTION_REPAIRS_COLLECTION,
                  document: repair,
                  id: repair.id,
                },
                set: [],
              });
              continue;
            }
            const committed = await documentStore.writeBatchIfUnchanged({
              expected: {
                collection: repair.sourceCollection,
                document: canonical,
                id: repair.sourceMemoryId,
              },
              set: [{
                collection: PROJECTION_REPAIRS_COLLECTION,
                document: next,
                id: next.id,
              }],
              unchanged: [{
                collection: PROJECTION_REPAIRS_COLLECTION,
                document: repair,
                id: repair.id,
              }],
            });
            if (!committed) continue;
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
