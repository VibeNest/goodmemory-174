import { describe, expect, it } from "bun:test";
import {
  canBootstrapPostgresStorageBackend,
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
  probeReadOnlyPostgresStorageBackend,
} from "../../src/storage/postgres";

describe("postgres storage adapter", () => {
  it("creates stores lazily without touching the database during construction", () => {
    const store = createPostgresDocumentStore({
      url: "postgres://localhost:5432/goodmemory",
    });

    expect(typeof store.get).toBe("function");
    expect(typeof store.query).toBe("function");
  });

  it("rejects invalid schema identifiers", () => {
    expect(() =>
      createPostgresDocumentStore({
        url: "postgres://localhost:5432/goodmemory",
        schema: "bad-schema",
      }),
    ).toThrow("Invalid Postgres schema");
  });

  it("rejects invalid vector table prefixes", () => {
    expect(() =>
      createPostgresVectorStore({
        url: "postgres://localhost:5432/goodmemory",
        vectorTablePrefix: "bad-prefix",
      }),
    ).toThrow("Invalid Postgres vectorTablePrefix");
  });

  it("rejects an empty postgres url", () => {
    expect(() =>
      createPostgresDocumentStore({
        url: "   ",
      }),
    ).toThrow("Postgres storage requires a non-empty url");
  });

  it("treats missing pgvector support as an unusable auto target", async () => {
    const ensuredUrls: string[] = [];

    await expect(
      canBootstrapPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => "missing",
          ensureStorageBackend: async (config) => {
            ensuredUrls.push(config.url);
          },
        },
      ),
    ).resolves.toBe(false);

    expect(ensuredUrls).toEqual([]);
  });

  it("requires backend bootstrap before declaring a postgres auto target usable", async () => {
    const calls: string[] = [];

    await expect(
      canBootstrapPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => {
            calls.push("status");
            return "available";
          },
          ensureStorageBackend: async () => {
            calls.push("ensure");
          },
        },
      ),
    ).resolves.toBe(true);

    expect(calls).toEqual(["status", "ensure"]);
  });

  it("surfaces bootstrap failures even when pgvector is advertised", async () => {
    await expect(
      canBootstrapPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => "installed",
          ensureStorageBackend: async () => {
            throw new Error("permission denied for schema public");
          },
        },
      ),
    ).rejects.toThrow("permission denied for schema public");
  });

  it("treats missing pgvector support as an unusable read-only postgres target", async () => {
    const hasExistingCalls: string[] = [];

    await expect(
      probeReadOnlyPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => "missing",
          hasExistingStorageBackend: async () => {
            hasExistingCalls.push("existing");
            return true;
          },
        },
      ),
    ).resolves.toBe("unusable");

    expect(hasExistingCalls).toEqual([]);
  });

  it("treats an installed existing backend as readable in read-only mode", async () => {
    await expect(
      probeReadOnlyPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => "installed",
          hasExistingStorageBackend: async () => true,
        },
      ),
    ).resolves.toBe("readable");
  });

  it("treats an advertised but uninstalled vector extension as inconclusive in read-only mode", async () => {
    await expect(
      probeReadOnlyPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => "available",
          hasExistingStorageBackend: async () => true,
        },
      ),
    ).resolves.toBe("inconclusive");
  });

  it("treats a partially initialized backend as inconclusive in read-only mode", async () => {
    await expect(
      probeReadOnlyPostgresStorageBackend(
        {
          url: "postgres://localhost:5432/goodmemory",
        },
        {
          getVectorExtensionStatus: async () => "installed",
          hasExistingStorageBackend: async () => false,
        },
      ),
    ).resolves.toBe("inconclusive");
  });

  it("rejects document mutations in read-only mode before touching postgres", async () => {
    const store = createPostgresDocumentStore(
      {
        url: "postgres://localhost:5432/goodmemory",
      },
      {
        readOnly: true,
      },
    );

    await expect(
      store.set("facts", "fact-1", {
        id: "fact-1",
      }),
    ).rejects.toThrow("Postgres document store is read-only in this context.");
    await expect(
      store.update("facts", "fact-1", {
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Postgres document store is read-only in this context.");
    await expect(store.delete("facts", "fact-1")).rejects.toThrow(
      "Postgres document store is read-only in this context.",
    );
  });

  it("rejects session mutations in read-only mode before touching postgres", async () => {
    const store = createPostgresSessionStore(
      {
        url: "postgres://localhost:5432/goodmemory",
      },
      {
        readOnly: true,
      },
    );
    const scope = {
      userId: "u-1",
      workspaceId: "w-1",
      sessionId: "s-1",
    };

    await expect(
      store.saveBuffer(scope, {
        sessionId: "s-1",
        userId: "u-1",
        messages: [],
        summary: null,
        summaryUpToIndex: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastActiveAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Postgres session store is read-only in this context.");
    await expect(store.deleteBuffersByScope(scope)).rejects.toThrow(
      "Postgres session store is read-only in this context.",
    );
  });

  it("rejects vector mutations in read-only mode before touching postgres", async () => {
    const store = createPostgresVectorStore(
      {
        url: "postgres://localhost:5432/goodmemory",
      },
      {
        readOnly: true,
      },
    );

    await expect(
      store.upsert("facts", [
        {
          id: "fact-1",
          embedding: [0.1, 0.2],
          metadata: {},
          content: "fact",
        },
      ]),
    ).rejects.toThrow("Postgres vector store is read-only in this context.");
    await expect(store.delete("facts", "fact-1")).rejects.toThrow(
      "Postgres vector store is read-only in this context.",
    );
  });
});
