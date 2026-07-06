import type { GoodMemory } from "./contracts";
import type { GoodMemoryRetrievalPresetStatus } from "./retrievalPreset";
import {
  type GoodMemoryRuntimeResolution,
  resolveGoodMemoryRuntimeResolution,
} from "./runtimeResolution";

export type GoodMemoryStorageRuntimeInfo =
  | {
      mode: "adapter";
      primaryProvider: "adapter";
      durability: "adapter_defined";
      overriddenStores: GoodMemoryRuntimeResolution["storageAdapterOverrides"];
    }
  | {
      mode: "explicit";
      primaryProvider: "memory";
      durability: "ephemeral";
      postgresConfigured: false;
    }
  | {
      mode: "explicit";
      primaryProvider: "sqlite";
      durability: "unavailable";
      postgresConfigured: false;
      sqliteUrl: string;
      unavailableReason: "runtime_without_builtin_sqlite";
    }
  | {
      mode: "explicit";
      primaryProvider: "sqlite";
      durability: "durable";
      postgresConfigured: false;
      sqliteUrl: string;
    }
  | {
      mode: "explicit";
      primaryProvider: "postgres";
      durability: "unavailable";
      postgresConfigured: true;
      unavailableReason: "runtime_without_builtin_postgres";
    }
  | {
      mode: "explicit";
      primaryProvider: "postgres";
      durability: "durable";
      postgresConfigured: true;
    }
  | {
      mode: "auto";
      primaryProvider: "sqlite";
      durability: "unavailable";
      postgresConfigured: false;
      sqliteUrl: string;
      unavailableReason: "runtime_without_builtin_sqlite";
    }
  | {
      mode: "auto";
      primaryProvider: "sqlite";
      durability: "durable";
      postgresConfigured: false;
      sqliteUrl: string;
    }
  | {
      mode: "auto";
      primaryProvider: "postgres";
      fallbackProvider: "sqlite";
      durability: "durable";
      postgresConfigured: true;
      sqliteUrl: string;
    }
  | {
      mode: "auto";
      primaryProvider: "memory";
      durability: "ephemeral";
      fallbackReason: "runtime_without_local_sqlite";
      postgresConfigured: false;
    }
  | {
      mode: "auto";
      primaryProvider: "postgres";
      fallbackProvider: "memory";
      durability: "conditional";
      fallbackReason: "runtime_without_local_sqlite";
      postgresConfigured: true;
    };

export interface GoodMemoryRuntimeInfo {
  assistedExtractionEnabled: boolean;
  embeddingEnabled: boolean;
  explicitAdaptersConfigured: boolean;
  explicitStorageConfigured: boolean;
  // Present exactly when retrieval.preset was requested; `extraction` reports
  // whether the write-time half of the profile engaged.
  retrievalPreset?: GoodMemoryRetrievalPresetStatus;
  storage: GoodMemoryStorageRuntimeInfo;
}

const GOODMEMORY_RUNTIME_INFO = Symbol.for("goodmemory.runtime.info");

type RuntimeAwareGoodMemory = GoodMemory & {
  [GOODMEMORY_RUNTIME_INFO]?: GoodMemoryRuntimeInfo;
};

function resolveStorageRuntimeInfo(
  resolution: GoodMemoryRuntimeResolution,
): GoodMemoryStorageRuntimeInfo {
  const { runtimeCapabilities, storageAdapterOverrides, storagePlan } = resolution;

  if (storageAdapterOverrides.length > 0) {
    return {
      mode: "adapter",
      primaryProvider: "adapter",
      durability: "adapter_defined",
      overriddenStores: [...storageAdapterOverrides],
    };
  }

  if (storagePlan.mode === "explicit") {
    if (storagePlan.storage.provider === "memory") {
      return {
        mode: "explicit",
        primaryProvider: "memory",
        durability: "ephemeral",
        postgresConfigured: false,
      };
    }

    if (storagePlan.storage.provider === "sqlite") {
      if (!runtimeCapabilities.builtInSQLite) {
        return {
          mode: "explicit",
          primaryProvider: "sqlite",
          durability: "unavailable",
          postgresConfigured: false,
          sqliteUrl: storagePlan.storage.url,
          unavailableReason: "runtime_without_builtin_sqlite",
        };
      }

      return {
        mode: "explicit",
        primaryProvider: "sqlite",
        durability: "durable",
        postgresConfigured: false,
        sqliteUrl: storagePlan.storage.url,
      };
    }

    if (!runtimeCapabilities.builtInPostgres) {
      return {
        mode: "explicit",
        primaryProvider: "postgres",
        durability: "unavailable",
        postgresConfigured: true,
        unavailableReason: "runtime_without_builtin_postgres",
      };
    }

    return {
      mode: "explicit",
      primaryProvider: "postgres",
      durability: "durable",
      postgresConfigured: true,
    };
  }

  if ("sqliteUrl" in storagePlan) {
    if (!storagePlan.postgresUrl && !runtimeCapabilities.builtInSQLite) {
      return {
        mode: "auto",
        primaryProvider: "sqlite",
        durability: "unavailable",
        postgresConfigured: false,
        sqliteUrl: storagePlan.sqliteUrl,
        unavailableReason: "runtime_without_builtin_sqlite",
      };
    }

    if (storagePlan.postgresUrl) {
      return {
        mode: "auto",
        primaryProvider: "postgres",
        fallbackProvider: "sqlite",
        durability: "durable",
        postgresConfigured: true,
        sqliteUrl: storagePlan.sqliteUrl,
      };
    }

    return {
      mode: "auto",
      primaryProvider: "sqlite",
      durability: "durable",
      postgresConfigured: false,
      sqliteUrl: storagePlan.sqliteUrl,
    };
  }

  if (storagePlan.postgresUrl) {
    return {
      mode: "auto",
      primaryProvider: "postgres",
      fallbackProvider: "memory",
      durability: "conditional",
      fallbackReason: "runtime_without_local_sqlite",
      postgresConfigured: true,
    };
  }

  return {
    mode: "auto",
    primaryProvider: "memory",
    durability: "ephemeral",
    fallbackReason: "runtime_without_local_sqlite",
    postgresConfigured: false,
  };
}

export function buildGoodMemoryRuntimeInfo(
  resolution: GoodMemoryRuntimeResolution,
): GoodMemoryRuntimeInfo {
  return {
    assistedExtractionEnabled: resolution.assistedExtractionEnabled,
    embeddingEnabled: resolution.embeddingEnabled,
    explicitAdaptersConfigured: resolution.explicitAdaptersConfigured,
    explicitStorageConfigured: resolution.explicitStorageConfigured,
    ...(resolution.retrieval.preset
      ? { retrievalPreset: resolution.retrieval.preset }
      : {}),
    storage: resolveStorageRuntimeInfo(resolution),
  };
}

export function resolveGoodMemoryRuntimeInfo(
  input: Parameters<typeof resolveGoodMemoryRuntimeResolution>[0],
): GoodMemoryRuntimeInfo {
  return buildGoodMemoryRuntimeInfo(resolveGoodMemoryRuntimeResolution(input));
}

export function attachGoodMemoryRuntimeInfo(
  memory: GoodMemory,
  runtimeInfo: GoodMemoryRuntimeInfo,
): GoodMemory {
  (memory as RuntimeAwareGoodMemory)[GOODMEMORY_RUNTIME_INFO] = runtimeInfo;
  return memory;
}

export function inspectGoodMemoryRuntime(
  memory: GoodMemory,
): GoodMemoryRuntimeInfo | undefined {
  return (memory as RuntimeAwareGoodMemory)[GOODMEMORY_RUNTIME_INFO];
}
