import { describe, expect, it } from "bun:test";
import {
  DEFAULT_SQLITE_STORAGE_PATH,
  resolveEmbeddingModelConfigFromEnv,
  resolveStoragePlan,
} from "../../src/api/runtimeResolution";

describe("runtime resolution", () => {
  it("defaults to local sqlite when no explicit storage is provided", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
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

  it("plans postgres-first auto mode when a postgres connection string is provided without an explicit provider", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
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
    });

    expect(plan).toEqual({
      mode: "auto",
      postgresUrl: "postgres://env-host/goodmemory",
      sqliteUrl: "/workspace/project/.goodmemory/memory.sqlite",
    });
  });

  it("treats a non-postgres url without an explicit provider as a sqlite path override", () => {
    const plan = resolveStoragePlan({
      cwd: "/workspace/project",
      env: {},
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
});
