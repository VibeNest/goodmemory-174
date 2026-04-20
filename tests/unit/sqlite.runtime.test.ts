import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";
import {
  applySQLiteCustomLibrary,
  loadSQLiteVectorExtension,
  resolveSQLiteRuntimeConfig,
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
        entryPoint: undefined,
        mode: "off",
        path: undefined,
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
        entryPoint: undefined,
        mode: "prefer",
        path: "/opt/sqlite/vector.dylib",
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
});

describe("sqlite runtime hooks", () => {
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

  it("still validates vector runtime config through the public vector store factory", () => {
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

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH is required",
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
          mode: "prefer",
          path: "/opt/sqlite/vector.dylib",
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

  it("throws a descriptive error when vector extension load fails in require mode", () => {
    expect(() =>
      loadSQLiteVectorExtension(
        {
          mode: "require",
          path: "/opt/sqlite/vector.dylib",
          entryPoint: "sqlite3_vector_init",
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
