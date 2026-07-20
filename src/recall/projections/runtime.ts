import type { MemoryScope } from "../../domain/scope";
import {
  createScopeDeletionAwareDocumentStore,
  createScopeDeletionCoordinator,
  type ScopeDeletionCoordinator,
} from "../../storage/scopeDeletion";
import {
  isProjectionCapableDocumentStore,
  type DocumentStore,
  type ProjectionCapableDocumentStore,
} from "../../storage/contracts";
import { createEnsureScopeIndexed } from "./backfill";
import type {
  ClaimProjectionWritePort,
  RecallProjectionSearchPort,
} from "./contracts";
import { createKeyedMutationLock } from "./mutationLock";
import { createRecallProjectionOperations } from "./operations";
import { createRecallProjectionRepairs } from "./repairs";
import { createProjectionAwareDocumentStore } from "./storeDecorator";
import { errorMessage, sourceMutationKey } from "./shared";

export interface RecallProjectionRuntime extends
  ClaimProjectionWritePort,
  RecallProjectionSearchPort {
  documentStore: ProjectionCapableDocumentStore;
  repairPending(scope: MemoryScope): Promise<number>;
  scopeDeletion: ScopeDeletionCoordinator;
}

export interface RecallProjectionRuntimeConfig {
  bulkBackfill?: boolean;
  documentStore: DocumentStore;
  now?: () => string;
  writeThrough?: boolean;
}

export function createRecallProjectionRuntime(
  config: RecallProjectionRuntimeConfig,
): RecallProjectionRuntime {
  if (!isProjectionCapableDocumentStore(config.documentStore)) {
    throw new Error(
      "Recall projection requires document-store atomic conditional batches.",
    );
  }
  const rawDocumentStore = config.documentStore;
  const documentStore = createScopeDeletionAwareDocumentStore(rawDocumentStore);
  const now = config.now ?? (() => new Date().toISOString());
  const mutationLock = createKeyedMutationLock();
  const operations = createRecallProjectionOperations({
    documentStore,
    now,
  });
  const repairs = createRecallProjectionRepairs({
    documentStore,
    mutationLock,
    now,
    operations,
  });
  const ensureScopeIndexed = createEnsureScopeIndexed({
    bulkBackfill: config.bulkBackfill,
    documentStore,
    mutationLock,
    now,
    operations,
    repairs,
  });

  return {
    documentStore: createProjectionAwareDocumentStore({
      documentStore,
      mutationLock,
      now,
      operations,
      repairs,
      writeThrough: config.writeThrough ?? true,
    }),
    scopeDeletion: createScopeDeletionCoordinator(rawDocumentStore),
    ensureScopeIndexed,
    async appendClaim(claimInput) {
      await mutationLock.runExclusive(
        [sourceMutationKey("facts", claimInput.sourceMemoryId)],
        async () => {
          try {
            await operations.appendClaimUnsafe(claimInput);
          } catch (error) {
            console.error(
              "[goodmemory:claim-projection] structured claim append failed; queued for repair",
              {
                error: errorMessage(error),
                extractorVersion: claimInput.extractorVersion,
                predicateKey: claimInput.claim.predicateKey,
                sourceMemoryId: claimInput.sourceMemoryId,
              },
            );
            try {
              await operations.markClaimFailed(claimInput, error);
            } catch (statusError) {
              console.error(
                "[goodmemory:claim-projection] failed to persist projection failure status",
                {
                  error: errorMessage(statusError),
                  sourceMemoryId: claimInput.sourceMemoryId,
                },
              );
            }
            await repairs.queue({
              claimInput,
              collection: "facts",
              error,
              scope: claimInput,
              sourceMemoryId: claimInput.sourceMemoryId,
              target: "claim",
            });
          }
        },
      );
    },
    queryClaims(scope) {
      return operations.queryClaims(scope);
    },
    queryClaimsBySourceMemoryIds(scope, sourceMemoryIds) {
      return operations.queryClaimsBySourceMemoryIds(scope, sourceMemoryIds);
    },
    queryClaimHistory(scope) {
      return operations.queryClaimHistory(scope);
    },
    queryDocuments(scope) {
      return operations.queryDocuments(scope);
    },
    searchDocuments(scope, query, limit) {
      return operations.searchDocuments(scope, query, limit);
    },
    searchEntities(scope, query, limit) {
      return operations.searchEntities(scope, query, limit);
    },
    searchClaims(scope, query, limit, history) {
      return operations.searchClaims(scope, query, limit, history);
    },
    queryEntities(scope) {
      return operations.queryEntities(scope);
    },
    repairPending(scope) {
      return repairs.repairPending(scope);
    },
  };
}
