import type { MemoryScope } from "../../domain/scope";
import type { DocumentStore } from "../../storage/contracts";
import { createEnsureScopeIndexed } from "./backfill";
import type { RecallProjectionSearchPort } from "./contracts";
import { createKeyedMutationLock } from "./mutationLock";
import { createRecallProjectionOperations } from "./operations";
import { createRecallProjectionRepairs } from "./repairs";
import { createProjectionAwareDocumentStore } from "./storeDecorator";

export interface RecallProjectionRuntime extends RecallProjectionSearchPort {
  documentStore: DocumentStore;
  repairPending(scope: MemoryScope): Promise<number>;
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
  const now = config.now ?? (() => new Date().toISOString());
  const mutationLock = createKeyedMutationLock();
  const operations = createRecallProjectionOperations({
    documentStore: config.documentStore,
    now,
  });
  const repairs = createRecallProjectionRepairs({
    documentStore: config.documentStore,
    mutationLock,
    now,
    operations,
  });
  const ensureScopeIndexed = createEnsureScopeIndexed({
    bulkBackfill: config.bulkBackfill,
    documentStore: config.documentStore,
    mutationLock,
    now,
    operations,
    repairs,
  });

  return {
    documentStore: createProjectionAwareDocumentStore({
      documentStore: config.documentStore,
      mutationLock,
      operations,
      repairs,
      writeThrough: config.writeThrough ?? true,
    }),
    ensureScopeIndexed,
    queryDocuments(scope) {
      return operations.queryDocuments(scope);
    },
    queryEntities(scope) {
      return operations.queryEntities(scope);
    },
    repairPending(scope) {
      return repairs.repairPending(scope);
    },
  };
}
