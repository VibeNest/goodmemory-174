import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
  applySQLiteCustomLibrary,
  detectBundledSQLiteVssRuntime,
  loadSQLiteVectorExtension,
  resolveSQLiteRuntimeConfig,
  resolveSQLiteRuntimeResolution,
} from "../../src/storage/sqliteRuntime";

interface ChildProcessResult {
  output: string;
  status: number | null;
}

function createChildEnv(
  overrides: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
      continue;
    }

    env[key] = value;
  }

  return env;
}

function runFactoryScript(
  source: string,
  envOverrides: Record<string, string | undefined> = {},
): ChildProcessResult {
  const result = spawnSync(process.execPath, ["-e", source], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: createChildEnv(envOverrides),
  });

  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
  };
}

describe("sqlite runtime config", () => {
  it("defaults vector extension mode to off when no env vars are configured", () => {
    expect(resolveSQLiteRuntimeConfig({})).toEqual({
      customLibraryPath: undefined,
      vectorExtension: {
        backend: "none",
        entryPoint: undefined,
        mode: "off",
        path: undefined,
        paths: [],
        searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
      },
    });
  });

  it("treats an extension path without an explicit mode as prefer", () => {
    expect(
      resolveSQLiteRuntimeConfig({
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "/opt/sqlite/vector.dylib",
      }),
    ).toEqual({
      customLibraryPath: undefined,
      vectorExtension: {
        backend: "sql-function",
        entryPoint: undefined,
        mode: "prefer",
        path: "/opt/sqlite/vector.dylib",
        paths: ["/opt/sqlite/vector.dylib"],
        searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
      },
    });
  });

  it("supports comma-separated extension load paths", () => {
    expect(
      resolveSQLiteRuntimeConfig({
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH:
          "/opt/sqlite/vector0.dylib, /opt/sqlite/vss0.dylib",
      }),
    ).toEqual({
      customLibraryPath: undefined,
      vectorExtension: {
        backend: "sql-function",
        entryPoint: undefined,
        mode: "prefer",
        path: "/opt/sqlite/vector0.dylib, /opt/sqlite/vss0.dylib",
        paths: [
          "/opt/sqlite/vector0.dylib",
          "/opt/sqlite/vss0.dylib",
        ],
        searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
      },
    });
  });

  it("rejects invalid vector extension modes", () => {
    expect(() =>
      resolveSQLiteRuntimeConfig({
        GOODMEMORY_SQLITE_VECTOR_MODE: "invalid",
      }),
    ).toThrow("Unsupported GOODMEMORY_SQLITE_VECTOR_MODE");
  });

  it("requires an extension path when vector mode is prefer or require", () => {
    expect(() =>
      resolveSQLiteRuntimeConfig({
        GOODMEMORY_SQLITE_VECTOR_MODE: "require",
      }),
    ).toThrow("GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH is required");
  });

  it("auto-detects the canonical sqlite-vss runtime when manual env paths are absent", () => {
    const resolution = resolveSQLiteRuntimeResolution(
      {},
      {
        detectBundledSQLiteVssRuntime: () => ({
          customLibraryPath: "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
          paths: [
            "/opt/sqlite/vector0.dylib",
            "/opt/sqlite/vss0.dylib",
          ],
        }),
      },
    );

    expect(resolution).toMatchObject({
      config: {
        customLibraryPath: "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
        vectorExtension: {
          backend: "sqlite-vss",
          mode: "prefer",
          path: "/opt/sqlite/vector0.dylib,/opt/sqlite/vss0.dylib",
          paths: [
            "/opt/sqlite/vector0.dylib",
            "/opt/sqlite/vss0.dylib",
          ],
        },
      },
      diagnostics: {
        available: true,
        backend: "sqlite-vss",
        source: "bundled-sqlite-vss",
      },
    });
  });

  it("keeps acceleration disabled when vector mode is explicitly off even if the canonical runtime is available", () => {
    const resolution = resolveSQLiteRuntimeResolution(
      {
        GOODMEMORY_SQLITE_VECTOR_MODE: "off",
      },
      {
        detectBundledSQLiteVssRuntime: () => ({
          customLibraryPath: "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
          paths: [
            "/opt/sqlite/vector0.dylib",
            "/opt/sqlite/vss0.dylib",
          ],
        }),
      },
    );

    expect(resolution).toMatchObject({
      config: {
        customLibraryPath: undefined,
        vectorExtension: {
          backend: "none",
          mode: "off",
          path: undefined,
          paths: [],
        },
      },
      diagnostics: {
        available: true,
        backend: "none",
        source: "disabled",
      },
    });
  });

  it("keeps explicit extension paths authoritative over bundled sqlite-vss detection", () => {
    const resolution = resolveSQLiteRuntimeResolution(
      {
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "/opt/sqlite/manual-vss0.dylib",
      },
      {
        detectBundledSQLiteVssRuntime: () => ({
          customLibraryPath: "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
          paths: [
            "/opt/sqlite/vector0.dylib",
            "/opt/sqlite/vss0.dylib",
          ],
        }),
      },
    );

    expect(resolution).toMatchObject({
      config: {
        customLibraryPath: undefined,
        vectorExtension: {
          backend: "sql-function",
          mode: "prefer",
          path: "/opt/sqlite/manual-vss0.dylib",
          paths: ["/opt/sqlite/manual-vss0.dylib"],
        },
      },
      diagnostics: {
        backend: "sql-function",
        source: "env",
      },
    });
  });

  it("reports acceleration as unavailable when require mode is requested and no canonical runtime is detected", () => {
    const resolution = resolveSQLiteRuntimeResolution(
      {
        GOODMEMORY_SQLITE_VECTOR_MODE: "require",
      },
      {
        detectBundledSQLiteVssRuntime: () => null,
      },
    );

    expect(resolution).toMatchObject({
      config: {
        vectorExtension: {
          backend: "none",
          mode: "off",
        },
      },
      diagnostics: {
        available: false,
        backend: "none",
        requestedMode: "require",
        source: "unavailable",
      },
    });
  });
});

describe("sqlite runtime hooks", () => {
  it("detects the bundled sqlite-vss runtime on supported machines when the assets are present", () => {
    const runtime = detectBundledSQLiteVssRuntime();

    if (!runtime) {
      expect(runtime).toBeNull();
      return;
    }

    expect(runtime.customLibraryPath).toContain("sqlite");
    expect(runtime.paths).toHaveLength(2);
    expect(runtime.paths[0]).toContain("vector0");
    expect(runtime.paths[1]).toContain("vss0");
  });

  it("keeps vector bootstrap out of document and session store factories", () => {
    const result = runFactoryScript(
      `
        import {
          createSQLiteDocumentStore,
          createSQLiteSessionStore,
        } from "./src/storage/sqlite";

        try {
          createSQLiteDocumentStore(":memory:");
          createSQLiteSessionStore(":memory:");
          console.log("ok");
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      `,
      {
        GOODMEMORY_SQLITE_VECTOR_MODE: "require",
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
      },
    );

    expect(result.status).toBe(0);
    expect(result.output).toContain("ok");
  });

  it("uses a real sqlite-vss virtual table on supported runtimes when manual env paths are absent", () => {
    const result = runFactoryScript(
      `
        import { Database } from "bun:sqlite";
        import { mkdtempSync } from "node:fs";
        import { tmpdir } from "node:os";
        import { join } from "node:path";
        import { createSQLiteVectorStore } from "./src/storage/sqlite";

        const root = mkdtempSync(join(tmpdir(), "goodmemory-phase28-"));
        const path = join(root, "memory.sqlite");
        const store = createSQLiteVectorStore(path);
        await store.upsert("facts", [
          {
            id: "fact-1",
            embedding: [0, 1, 0],
            metadata: { userId: "u-1" },
            content: "first",
          },
          {
            id: "fact-2",
            embedding: [1, 0, 0],
            metadata: { userId: "u-1" },
            content: "second",
          },
        ]);
        const results = await store.search("facts", [1, 0, 0], {
          topK: 1,
          filter: { userId: "u-1" },
        });
        const db = new Database(path, { strict: true });
        const table = db.query(
          "select name from sqlite_master where type = 'table' and name = 'vss_vectors_facts_dim_3'",
        ).get();
        console.log(JSON.stringify({
          accelerated: Boolean(table),
          resultId: results[0]?.id ?? null,
        }));
      `,
      {
        GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: undefined,
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: undefined,
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
        GOODMEMORY_SQLITE_VECTOR_MODE: undefined,
        GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: undefined,
      },
    );

    if (!result.output.includes("accelerated")) {
      expect(result.status).toBe(1);
      return;
    }

    expect(result.status).toBe(0);
    expect(result.output).toContain('"accelerated":true');
    expect(result.output).toContain('"resultId":"fact-2"');
  });

  it("uses the canonical sqlite-vss runtime through the public vector store factory when require mode is set on supported machines", () => {
    const result = runFactoryScript(
      `
        import { createSQLiteVectorStore } from "./src/storage/sqlite";

        try {
          createSQLiteVectorStore(":memory:");
          console.log("ok");
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      `,
      {
        GOODMEMORY_SQLITE_VECTOR_MODE: "require",
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
      },
    );

    if (detectBundledSQLiteVssRuntime()) {
      expect(result.status).toBe(0);
      expect(result.output).toContain("ok");
      return;
    }

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "SQLite vector acceleration was requested",
    );
  });

  it("applies a custom sqlite library before the first database is opened", () => {
    const result = runFactoryScript(
      `
        import { createSQLiteDocumentStore } from "./src/storage/sqlite";

        try {
          createSQLiteDocumentStore(":memory:");
          console.log("ok");
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      `,
      {
        GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "/tmp/does-not-exist.dylib",
        GOODMEMORY_SQLITE_VECTOR_MODE: undefined,
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
        GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: undefined,
      },
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("dlopen(");
    expect(result.output).not.toContain("SQLite already loaded");
  });

  it("applies a custom sqlite library path when configured", () => {
    const calls: string[] = [];

    applySQLiteCustomLibrary(
      {
        customLibraryPath: "/opt/homebrew/lib/libsqlite3.dylib",
      },
      {
        setCustomSQLite(path: string) {
          calls.push(path);
          return true;
        },
      },
    );

    expect(calls).toEqual(["/opt/homebrew/lib/libsqlite3.dylib"]);
  });

  it("swallows vector extension load failures in prefer mode", () => {
    const calls: Array<{ entryPoint?: string; path: string }> = [];

    expect(() =>
      loadSQLiteVectorExtension(
        {
          backend: "sql-function",
          mode: "prefer",
          path: "/opt/sqlite/vector.dylib",
          paths: ["/opt/sqlite/vector.dylib"],
          searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
        },
        {
          loadExtension(path: string, entryPoint?: string) {
            calls.push({ path, entryPoint });
            throw new Error("missing binary");
          },
        },
      ),
    ).not.toThrow();
    expect(calls).toEqual([
        {
          path: "/opt/sqlite/vector.dylib",
        },
      ]);
  });

  it("loads multiple extensions in order when configured", () => {
    const calls: Array<{ entryPoint?: string; path: string }> = [];

    loadSQLiteVectorExtension(
      {
        backend: "sql-function",
        mode: "prefer",
        path: "/opt/sqlite/vector0.dylib, /opt/sqlite/vss0.dylib",
        paths: [
          "/opt/sqlite/vector0.dylib",
          "/opt/sqlite/vss0.dylib",
        ],
        searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
      },
      {
        loadExtension(path: string, entryPoint?: string) {
          calls.push({ path, entryPoint });
        },
      },
    );

    expect(calls).toEqual([
      { path: "/opt/sqlite/vector0.dylib", entryPoint: undefined },
      { path: "/opt/sqlite/vss0.dylib", entryPoint: undefined },
    ]);
  });

  it("throws a descriptive error when vector extension load fails in require mode", () => {
    expect(() =>
      loadSQLiteVectorExtension(
        {
          backend: "sql-function",
          mode: "require",
          path: "/opt/sqlite/vector.dylib",
          paths: ["/opt/sqlite/vector.dylib"],
          entryPoint: "sqlite3_vector_init",
          searchFunction: DEFAULT_SQLITE_VECTOR_SEARCH_FUNCTION,
        },
        {
          loadExtension() {
            throw new Error("missing binary");
          },
        },
      ),
    ).toThrow("Failed to load SQLite vector extension");
  });
});
