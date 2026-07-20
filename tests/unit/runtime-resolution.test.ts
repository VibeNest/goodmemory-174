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
      rerankerModelConfig: null,
      rerankingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: false,
      extractionMode: "default",
      retrieval: {
        bm25Ranking: undefined,
        semanticCandidates: undefined,
      },
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
      rerankerModelConfig: null,
      rerankingEnabled: false,
      explicitAdaptersConfigured: false,
      explicitStorageConfigured: false,
      extractionMode: "default",
      retrieval: {
        bm25Ranking: undefined,
        semanticCandidates: undefined,
      },
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

  it("expands the recommended retrieval preset through the shared resolution", () => {
    const embeddingAdapter = { embed: async () => [[0, 1]] };
    const resolution = resolveGoodMemoryRuntimeResolution({
      config: {
        adapters: { embeddingAdapter },
        retrieval: { preset: "recommended" },
      },
      env: {},
    });

    expect(resolution.retrieval.autoStrategyBias).toBe("hybrid");
    expect(resolution.retrieval.generalizedFusion).toEqual({
      maxCandidates: 8,
      maxTotalFacts: 10,
    });
    expect(resolution.retrieval.semanticCandidates).toEqual({ topK: 16 });
    expect(resolution.retrieval.preset).toEqual({
      active: true,
      extraction: "unavailable",
      requested: "recommended",
    });
    // No preset ⇒ raw config objects pass through by reference.
    const semanticCandidates = { topK: 8 };
    const passthrough = resolveGoodMemoryRuntimeResolution({
      config: { retrieval: { semanticCandidates } },
      env: {},
    });
    expect(passthrough.retrieval.semanticCandidates).toBe(semanticCandidates);
    expect(passthrough.retrieval.preset).toBeUndefined();
  });

  it("hints at the Ollama placeholder key when only API_KEY is missing with a base URL", () => {
    let message = "";
    try {
      resolveEmbeddingModelConfigFromEnv({
        GOODMEMORY_EMBEDDING_BASE_URL: "http://localhost:11434/v1",
        GOODMEMORY_EMBEDDING_MODEL: "nomic-embed-text",
        GOODMEMORY_EMBEDDING_PROVIDER: "openai",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("GOODMEMORY_EMBEDDING_API_KEY");
    expect(message).toContain("Ollama");
    expect(message).toContain("placeholder");

    // Without a base URL the message is unchanged (no local-endpoint hint).
    let plainMessage = "";
    try {
      resolveEmbeddingModelConfigFromEnv({
        GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
        GOODMEMORY_EMBEDDING_PROVIDER: "openai",
      });
    } catch (error) {
      plainMessage = (error as Error).message;
    }
    expect(plainMessage).toContain("GOODMEMORY_EMBEDDING_API_KEY");
    expect(plainMessage).not.toContain("Ollama");
  });

  it("keeps the recommended preset local when no embedding resolves", () => {
    const resolution = resolveGoodMemoryRuntimeResolution({
      config: { retrieval: { preset: "recommended" } },
      env: {},
    });
    expect(resolution.embeddingEnabled).toBe(false);
    expect(resolution.retrieval.generalizedFusion).toEqual({
      maxCandidates: 8,
      maxTotalFacts: 10,
    });
    expect(resolution.retrieval.semanticCandidates).toBeUndefined();
  });

  it("reports the retrieval preset through runtime info exactly when requested", () => {
    const embeddingAdapter = { embed: async () => [[0, 1]] };
    const withPreset = resolveGoodMemoryRuntimeInfo({
      config: {
        adapters: { embeddingAdapter },
        retrieval: { preset: "recommended" },
      },
      env: {},
    });
    expect(withPreset.retrievalPreset).toEqual({
      active: true,
      extraction: "unavailable",
      requested: "recommended",
    });

    const withoutPreset = resolveGoodMemoryRuntimeInfo({ config: {}, env: {} });
    expect(withoutPreset.retrievalPreset).toBeUndefined();
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

  it("prefers public provider facade config over provider env vars", () => {
    expect(
      resolveGoodMemoryRuntimeResolution({
        config: {
          providers: {
            embedding: {
              provider: "openai",
              model: "text-embedding-3-small",
              apiKey: "explicit-embedding-key",
              baseURL: "https://explicit-embedding.test/v1",
            },
            extraction: {
              provider: "anthropic",
              model: "claude-3-5-haiku-latest",
              apiKey: "explicit-extractor-key",
              baseURL: "https://explicit-extractor.test/v1",
            },
          },
        },
        env: {
          GOODMEMORY_EMBEDDING_PROVIDER: "openai",
          GOODMEMORY_EMBEDDING_MODEL: "env-embedding",
          GOODMEMORY_EMBEDDING_API_KEY: "env-embedding-key",
          GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "openai",
          GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "env-extractor",
          GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "env-extractor-key",
        },
        cwd: "/workspace/project",
        runtimeCapabilities: {
          localDefaultSQLite: true,
        },
      }),
    ).toMatchObject({
      assistedExtractionEnabled: true,
      assistedExtractorModelConfig: {
        provider: "anthropic",
        model: "claude-3-5-haiku-latest",
        apiKey: "explicit-extractor-key",
        baseURL: "https://explicit-extractor.test/v1",
      },
      embeddingEnabled: true,
      embeddingModelConfig: {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "explicit-embedding-key",
        baseURL: "https://explicit-embedding.test/v1",
      },
    });
  });

  it("keeps direct adapters authoritative over provider facade config", () => {
    expect(
      resolveGoodMemoryRuntimeResolution({
        config: {
          providers: {
            embedding: {
              provider: "openai",
              model: "text-embedding-3-small",
              apiKey: "provider-key",
            },
            extraction: {
              provider: "openai",
              model: "gpt-4o-mini",
              apiKey: "provider-key",
            },
          },
          adapters: {
            embeddingAdapter: {
              async embed(texts) {
                return texts.map(() => [1, 0, 0]);
              },
            },
            assistedExtractor: {
              async extract() {
                return {
                  candidates: [],
                  ignoredMessageCount: 0,
                };
              },
            },
          },
        },
        env: {},
        cwd: "/workspace/project",
        runtimeCapabilities: {
          localDefaultSQLite: true,
        },
      }),
    ).toMatchObject({
      assistedExtractionEnabled: true,
      assistedExtractorModelConfig: null,
      embeddingEnabled: true,
      embeddingModelConfig: null,
      explicitAdaptersConfigured: true,
    });
  });

  it("resolves provider reranking unless an explicit reranker adapter wins", () => {
    const provider = {
      provider: "openai" as const,
      model: "gpt-5.6-terra",
      apiKey: "reranker-key",
      baseURL: "https://ai.gurkiai.com/v1",
    };
    const resolved = resolveGoodMemoryRuntimeResolution({
      config: { providers: { reranking: provider } },
      env: {},
    });
    const overridden = resolveGoodMemoryRuntimeResolution({
      config: {
        providers: { reranking: provider },
        adapters: {
          reranker: {
            async rerank() {
              return [];
            },
          },
        },
      },
      env: {},
    });

    expect(resolved.rerankingEnabled).toBe(true);
    expect(resolved.rerankerModelConfig).toEqual(provider);
    expect(overridden.rerankingEnabled).toBe(true);
    expect(overridden.rerankerModelConfig).toBeNull();
    expect(overridden.explicitAdaptersConfigured).toBe(true);
  });

  it("reports a query-only recall planner as an explicit runtime adapter", () => {
    const resolved = resolveGoodMemoryRuntimeResolution({
      config: {
        adapters: {
          recallPlanner: {
            async plan() {
              return {};
            },
          },
        },
      },
      env: {},
    });

    expect(resolved.explicitAdaptersConfigured).toBe(true);
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

  it("rejects unsupported provider facade embedding providers", () => {
    expect(() =>
      resolveGoodMemoryRuntimeResolution({
        config: {
          providers: {
            embedding: {
              provider: "anthropic",
              model: "text-embedding-3-small",
              apiKey: "secret",
            } as never,
          },
        },
        env: {},
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
