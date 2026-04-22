import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src/api/createGoodMemory";
import {
  inspectGoodMemoryRuntime,
  resolveGoodMemoryRuntimeInfo,
} from "../../src/api/runtimeInfo";
import {
  DEFAULT_SQLITE_STORAGE_PATH,
  resolveAssistedExtractorModelConfigFromEnv,
  resolveEmbeddingModelConfigFromEnv,
  resolveGoodMemoryRuntimeResolution,
  resolveStoragePlan,
} from "../../src/api/runtimeResolution";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";

describe("runtime resolution", () => {
  it("defaults to local sqlite when no explicit storage is provided", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
      runtimeCapabilities: {
        localDefaultSQLite: true,
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: undefined,
      sqliteUrl: "/workspace/project/.goodmemory/memory.sqlite",
    });
  });

  it("keeps explicit memory storage authoritative", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {
        GOODMEMORY_STORAGE_PROVIDER: "postgres",
        GOODMEMORY_STORAGE_URL: "postgres://env-host/goodmemory",
      },
      storage: {
        provider: "memory",
      },
    });

    expect(plan).toEqual({
      mode: "explicit",
      storage: {
        provider: "memory",
      },
    });
  });

  it("keeps explicit sqlite storage authoritative", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {
        GOODMEMORY_STORAGE_PROVIDER: "postgres",
        GOODMEMORY_STORAGE_URL: "postgres://env-host/goodmemory",
      },
      storage: {
        provider: "sqlite",
        url: "./state/local.db",
      },
    });

    expect(plan).toEqual({
      mode: "explicit",
      storage: {
        provider: "sqlite",
        url: "/workspace/project/state/local.db",
      },
    });
  });

  it("does not inherit an env url when explicit sqlite storage omits one", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {
        GOODMEMORY_STORAGE_PROVIDER: "postgres",
        GOODMEMORY_STORAGE_URL: "postgres://env-host/goodmemory",
      },
      storage: {
        provider: "sqlite",
      },
    });

    expect(plan).toEqual({
      mode: "explicit",
      storage: {
        provider: "sqlite",
        url: "/workspace/project/.goodmemory/memory.sqlite",
      },
    });
  });

  it("requires a url for explicit postgres storage", () => {
    expect(() =>
      resolveStoragePlan({
        cwd: "/workspace/project",
        env: {},
        storage: {
          provider: "postgres",
        },
      }),
    ).toThrow("Postgres storage provider requires storage.url");
  });

  it("does not inherit an env url when explicit postgres storage omits one", () => {
    expect(() =>
      resolveStoragePlan({
        cwd: "/workspace/project",
        env: {
          GOODMEMORY_STORAGE_URL: "postgres://env-host/goodmemory",
        },
        storage: {
          provider: "postgres",
        },
      }),
    ).toThrow("Postgres storage provider requires storage.url");
  });

  it("plans postgres-first auto mode when a postgres connection string is provided without an explicit provider", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
      runtimeCapabilities: {
        localDefaultSQLite: true,
      },
      storage: {
        url: "postgres://localhost:5432/goodmemory",
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: "postgres://localhost:5432/goodmemory",
      sqliteUrl: "/workspace/project/.goodmemory/memory.sqlite",
    });
  });

  it("accepts env-provided postgres auto mode when no explicit provider exists", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {
        GOODMEMORY_STORAGE_URL: "postgres://env-host/goodmemory",
      },
      runtimeCapabilities: {
        localDefaultSQLite: true,
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: "postgres://env-host/goodmemory",
      sqliteUrl: "/workspace/project/.goodmemory/memory.sqlite",
    });
  });

  it("does not inherit an env provider when an explicit sqlite url is provided", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {
        GOODMEMORY_STORAGE_PROVIDER: "postgres",
      },
      runtimeCapabilities: {
        localDefaultSQLite: true,
      },
      storage: {
        url: "./custom/local-memory.db",
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: undefined,
      sqliteUrl: "/workspace/project/custom/local-memory.db",
    });
  });

  it("treats a non-postgres url without an explicit provider as a sqlite path override", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
      runtimeCapabilities: {
        localDefaultSQLite: true,
      },
      storage: {
        url: "./custom/local-memory.db",
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: undefined,
      sqliteUrl: "/workspace/project/custom/local-memory.db",
    });
  });

  it("exports the canonical default sqlite path constant", () => {
    expect(DEFAULT_SQLITE_STORAGE_PATH).toBe(".goodmemory/memory.sqlite");
  });

  it("derives the shared public default runtime contract from the same resolver used by createGoodMemory", () => {
    expect(
      resolveGoodMemoryRuntimeResolution({
        config: {},
        cwd: "/workspace/project",
        env: {},
        runtimeCapabilities: {
          localDefaultSQLite: true,
        },
      }),
    ).toEqual({
      assistedExtractionEnabled: false,
      assistedExtractorModelConfig: null,
      embeddingEnabled: false,
      embeddingModelConfig: null,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: false,
      runtimeCapabilities: {
        builtInPostgres: true,
        builtInSQLite: true,
        localDefaultSQLite: true,
      },
      storageAdapterOverrides: [],
      storagePlan: {
        mode: "auto",
        postgresUrl: undefined,
        sqliteUrl: "/workspace/project/.goodmemory/memory.sqlite",
      },
    });
  });

  it("falls back to in-memory auto storage when the runtime lacks the local sqlite default", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
      runtimeCapabilities: {
        localDefaultSQLite: false,
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      fallbackProvider: "memory",
      postgresUrl: undefined,
    });
  });

  it("keeps an explicit local sqlite path authoritative even when the runtime lacks the sqlite default", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
      runtimeCapabilities: {
        localDefaultSQLite: false,
      },
      storage: {
        url: "./custom/local-memory.db",
      },
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: undefined,
      sqliteUrl: "/workspace/project/custom/local-memory.db",
    });
  });

  it("uses in-memory fallback for the shared runtime resolution when local sqlite is unavailable", () => {
    expect(
      resolveGoodMemoryRuntimeResolution({
        config: {},
        cwd: "/workspace/project",
        env: {},
        runtimeCapabilities: {
          localDefaultSQLite: false,
        },
      }),
    ).toEqual({
      assistedExtractionEnabled: false,
      assistedExtractorModelConfig: null,
      embeddingEnabled: false,
      embeddingModelConfig: null,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: false,
      runtimeCapabilities: {
        builtInPostgres: true,
        builtInSQLite: false,
        localDefaultSQLite: false,
      },
      storageAdapterOverrides: [],
      storagePlan: {
        mode: "auto",
        fallbackProvider: "memory",
        postgresUrl: undefined,
      },
    });
  });

  it("makes the zero-config Node-style memory fallback observable", () => {
    expect(
      resolveGoodMemoryRuntimeInfo({
        config: {},
        cwd: "/workspace/project",
        env: {},
        runtimeCapabilities: {
          localDefaultSQLite: false,
        },
      }),
    ).toEqual({
      assistedExtractionEnabled: false,
      embeddingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: false,
      storage: {
        mode: "auto",
        primaryProvider: "memory",
        durability: "ephemeral",
        fallbackReason: "runtime_without_local_sqlite",
        postgresConfigured: false,
      },
    });
  });

  it("marks explicit sqlite storage as unavailable when the runtime lacks the built-in sqlite adapter", () => {
    expect(
      resolveGoodMemoryRuntimeInfo({
        config: {
          storage: {
            provider: "sqlite",
            url: "./state/local.db",
          },
        },
        cwd: "/workspace/project",
        env: {},
        runtimeCapabilities: {
          builtInSQLite: false,
          localDefaultSQLite: false,
        },
      }),
    ).toEqual({
      assistedExtractionEnabled: false,
      embeddingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: true,
      storage: {
        mode: "explicit",
        primaryProvider: "sqlite",
        durability: "unavailable",
        postgresConfigured: false,
        sqliteUrl: "/workspace/project/state/local.db",
        unavailableReason: "runtime_without_builtin_sqlite",
      },
    });
  });

  it("marks an explicit sqlite path override as unavailable when the runtime lacks the built-in sqlite adapter", () => {
    expect(
      resolveGoodMemoryRuntimeInfo({
        config: {
          storage: {
            url: "./state/local.db",
          },
        },
        cwd: "/workspace/project",
        env: {},
        runtimeCapabilities: {
          builtInSQLite: false,
          localDefaultSQLite: false,
        },
      }),
    ).toEqual({
      assistedExtractionEnabled: false,
      embeddingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: true,
      storage: {
        mode: "auto",
        primaryProvider: "sqlite",
        durability: "unavailable",
        postgresConfigured: false,
        sqliteUrl: "/workspace/project/state/local.db",
        unavailableReason: "runtime_without_builtin_sqlite",
      },
    });
  });

  it("marks explicit postgres storage as unavailable when the runtime lacks the built-in postgres adapter", () => {
    expect(
      resolveGoodMemoryRuntimeInfo({
        config: {
          storage: {
            provider: "postgres",
            url: "postgres://localhost:5432/goodmemory",
          },
        },
        cwd: "/workspace/project",
        env: {},
        runtimeCapabilities: {
          builtInPostgres: false,
          builtInSQLite: false,
          localDefaultSQLite: false,
        },
      }),
    ).toEqual({
      assistedExtractionEnabled: false,
      embeddingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: true,
      storage: {
        mode: "explicit",
        primaryProvider: "postgres",
        durability: "unavailable",
        postgresConfigured: true,
        unavailableReason: "runtime_without_builtin_postgres",
      },
    });
  });

  it("reports adapter-defined storage when storage adapters override the built-in plan", () => {
    const memory = createGoodMemory({
      storage: {
        provider: "sqlite",
        url: "./state/local.db",
      },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
        vectorStore: createInMemoryVectorStore(),
      },
    });

    expect(inspectGoodMemoryRuntime(memory)).toEqual({
      assistedExtractionEnabled: false,
      embeddingEnabled: false,
      explicitAdaptersConfigured: true,
      explicitStorageConfigured: true,
      storage: {
        mode: "adapter",
        primaryProvider: "adapter",
        durability: "adapter_defined",
        overriddenStores: ["documentStore", "sessionStore", "vectorStore"],
      },
    });
  });

  it("attaches runtime info to created memory instances", () => {
    const memory = createGoodMemory({
      storage: {
        provider: "memory",
      },
    });

    expect(inspectGoodMemoryRuntime(memory)).toEqual({
      assistedExtractionEnabled: false,
      embeddingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: true,
      storage: {
        mode: "explicit",
        primaryProvider: "memory",
        durability: "ephemeral",
        postgresConfigured: false,
      },
    });
  });

  it("returns null when embedding env vars are absent", () => {
    expect(resolveEmbeddingModelConfigFromEnv({})).toBeNull();
  });

  it("parses embedding env vars when fully configured", () => {
    expect(
      resolveEmbeddingModelConfigFromEnv({
        GOODMEMORY_EMBEDDING_PROVIDER: "openai",
        GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
        GOODMEMORY_EMBEDDING_API_KEY: "secret",
        GOODMEMORY_EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1",
      }),
    ).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
      apiKey: "secret",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("rejects partial embedding env configuration", () => {
    expect(() =>
      resolveEmbeddingModelConfigFromEnv({
        GOODMEMORY_EMBEDDING_PROVIDER: "openai",
        GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
      }),
    ).toThrow("Missing required GOODMEMORY_EMBEDDING environment variables");
  });

  it("rejects unsupported embedding providers", () => {
    expect(() =>
      resolveEmbeddingModelConfigFromEnv({
        GOODMEMORY_EMBEDDING_PROVIDER: "anthropic",
        GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
        GOODMEMORY_EMBEDDING_API_KEY: "secret",
      }),
    ).toThrow("Unsupported embedding provider");
  });

  it("returns null when assisted extractor env vars are absent", () => {
    expect(resolveAssistedExtractorModelConfigFromEnv({})).toBeNull();
  });

  it("parses assisted extractor env vars when fully configured", () => {
    expect(
      resolveAssistedExtractorModelConfigFromEnv({
        GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "openai",
        GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "gpt-4o-mini",
        GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "secret",
        GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: "https://openrouter.ai/api/v1",
      }),
    ).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "secret",
      baseURL: "https://openrouter.ai/api/v1",
    });
  });

  it("rejects partial assisted extractor env configuration", () => {
    expect(() =>
      resolveAssistedExtractorModelConfigFromEnv({
        GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "openai",
        GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "gpt-4o-mini",
      }),
    ).toThrow(
      "Missing required GOODMEMORY_ASSISTED_EXTRACTOR environment variables",
    );
  });
});
