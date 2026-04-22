import { describe, expect, it } from "bun:test";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT_PACKAGE_PATH = join(import.meta.dir, "../../");
const RELEASE_TEST_ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: undefined,
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: undefined,
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: undefined,
  GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: undefined,
  GOODMEMORY_EMBEDDING_API_KEY: undefined,
  GOODMEMORY_EMBEDDING_BASE_URL: undefined,
  GOODMEMORY_EMBEDDING_MODEL: undefined,
  GOODMEMORY_EMBEDDING_PROVIDER: undefined,
  GOODMEMORY_JUDGE_API_KEY: undefined,
  GOODMEMORY_JUDGE_BASE_URL: undefined,
  GOODMEMORY_JUDGE_MODEL: undefined,
  GOODMEMORY_JUDGE_PROVIDER: undefined,
  GOODMEMORY_RECALL_ROUTER_API_KEY: undefined,
  GOODMEMORY_RECALL_ROUTER_BASE_URL: undefined,
  GOODMEMORY_RECALL_ROUTER_MODEL: undefined,
  GOODMEMORY_RECALL_ROUTER_PROVIDER: undefined,
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: undefined,
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: undefined,
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: undefined,
  GOODMEMORY_SQLITE_VECTOR_MODE: undefined,
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: undefined,
  GOODMEMORY_STORAGE_PROVIDER: undefined,
  GOODMEMORY_STORAGE_URL: undefined,
  GOODMEMORY_TEST_POSTGRES_URL: undefined,
} as const;

function createChildEnv(
  overrides: Record<string, string | undefined> = {},
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
    } else {
      env[key] = value;
    }
  }

  return env;
}

async function runCommand(input: {
  cmd: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
}): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const childProcess = Bun.spawn({
    cmd: input.cmd,
    cwd: input.cwd,
    env: createChildEnv(input.env),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(childProcess.stdout).text();
  const stderr = await new Response(childProcess.stderr).text();
  const exitCode = await childProcess.exited;

  return {
    exitCode,
    stderr,
    stdout,
  };
}

function extractJsonObject<T>(value: string): T {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Expected JSON output but none was found.");
  }

  return JSON.parse(value.slice(start, end + 1)) as T;
}

async function packReleaseTarball(outputDir: string): Promise<string> {
  const pack = await runCommand({
    cmd: ["bun", "pm", "pack", "--destination", outputDir, "--quiet"],
    cwd: ROOT_PACKAGE_PATH,
  });

  expect(pack.exitCode).toBe(0);
  return pack.stdout.trim().length > 0
    ? pack.stdout.trim()
    : join(outputDir, "goodmemory-0.1.0-rc.1.tgz");
}

describe("node package boundary", () => {
  it("installs from the packed artifact in npm and runs the canonical public library path under Node", async () => {
    const fixtureRoot = join(
      ROOT_PACKAGE_PATH,
      "tests/consumers/reference-package-smoke",
    );
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-node-reference-consumer-"),
    );
    const packOutputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-node-reference-pack-"),
    );

    try {
      const tarballPath = await packReleaseTarball(packOutputDir);
      await cp(fixtureRoot, workspaceRoot, { recursive: true });

      const packageJsonPath = join(workspaceRoot, "package.json");
      const packageJson = await readFile(packageJsonPath, "utf8");
      await writeFile(
        packageJsonPath,
        packageJson.replace(
          "__GOODMEMORY_PACKAGE_SPEC__",
          `file:${tarballPath}`,
        ),
        "utf8",
      );

      const install = await runCommand({
        cmd: ["npm", "install"],
        cwd: workspaceRoot,
      });
      expect(install.exitCode).toBe(0);

      await mkdir(join(workspaceRoot, "node_modules/@types"), { recursive: true });
      await cp(
        join(ROOT_PACKAGE_PATH, "node_modules/@types/node"),
        join(workspaceRoot, "node_modules/@types/node"),
        { recursive: true },
      );

      const smoke = await runCommand({
        cmd: ["npm", "run", "smoke:node"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(smoke.exitCode).toBe(0);
      const smokeJson = extractJsonObject<{
        artifactPaths: string[];
        contextIncludesBlocker: boolean;
        explicitPostgresRememberError?: string;
        explicitPostgresRuntimeInfo?: {
          assistedExtractionEnabled: boolean;
          embeddingEnabled: boolean;
          explicitAdaptersConfigured: boolean;
          explicitStorageConfigured: boolean;
          storage: {
            durability:
              | "conditional"
              | "durable"
              | "ephemeral"
              | "unavailable";
            mode: "auto" | "explicit";
            postgresConfigured: boolean;
            primaryProvider: "memory" | "postgres" | "sqlite";
            unavailableReason?: "runtime_without_builtin_postgres";
          };
        };
        explicitSqliteRememberError?: string;
        explicitSqliteRuntimeInfo?: {
          assistedExtractionEnabled: boolean;
          embeddingEnabled: boolean;
          explicitAdaptersConfigured: boolean;
          explicitStorageConfigured: boolean;
          storage: {
            durability:
              | "conditional"
              | "durable"
              | "ephemeral"
              | "unavailable";
            mode: "auto" | "explicit";
            postgresConfigured: boolean;
            primaryProvider: "memory" | "postgres" | "sqlite";
            sqliteUrl?: string;
            unavailableReason?: "runtime_without_builtin_sqlite";
          };
        };
        ok: boolean;
        recallHitCount: number;
        runtimeInfo?: {
          assistedExtractionEnabled: boolean;
          embeddingEnabled: boolean;
          explicitAdaptersConfigured: boolean;
          explicitStorageConfigured: boolean;
          storage: {
            durability:
              | "conditional"
              | "durable"
              | "ephemeral"
              | "unavailable";
            fallbackReason?: "runtime_without_local_sqlite";
            mode: "auto" | "explicit";
            postgresConfigured: boolean;
            primaryProvider: "memory" | "postgres" | "sqlite";
          };
        };
        validatedFileEditPath?: string;
        validatedToolPayloadShape?: string;
      }>(smoke.stdout);
      expect(smokeJson.ok).toBe(true);
      expect(smokeJson.contextIncludesBlocker).toBe(true);
      expect(smokeJson.recallHitCount).toBeGreaterThan(0);
      expect(smokeJson.explicitSqliteRememberError).toContain(
        "GoodMemory built-in SQLite storage is unavailable in this runtime.",
      );
      expect(smokeJson.explicitPostgresRememberError).toContain(
        "GoodMemory built-in Postgres storage is unavailable in this runtime.",
      );
      expect(smokeJson.artifactPaths).toContain("MEMORY.md");
      expect(smokeJson.validatedToolPayloadShape).toBe("object");
      expect(smokeJson.validatedFileEditPath).toBe(
        "playbooks/consumer-checklist.md",
      );
      expect(smokeJson.runtimeInfo).toEqual({
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
      expect(smokeJson.explicitSqliteRuntimeInfo).toEqual({
        assistedExtractionEnabled: false,
        embeddingEnabled: false,
        explicitAdaptersConfigured: false,
        explicitStorageConfigured: true,
        storage: {
          mode: "explicit",
          primaryProvider: "sqlite",
          durability: "unavailable",
          postgresConfigured: false,
          sqliteUrl: expect.stringContaining("consumer-node.sqlite"),
          unavailableReason: "runtime_without_builtin_sqlite",
        },
      });
      expect(smokeJson.explicitPostgresRuntimeInfo).toEqual({
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

      await expect(
        access(join(workspaceRoot, ".goodmemory/memory.sqlite")),
      ).rejects.toThrow();

      const typeSmoke = await runCommand({
        cmd: [
          join(ROOT_PACKAGE_PATH, "node_modules/.bin/tsc"),
          "-p",
          "tsconfig.json",
          "--noEmit",
        ],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(typeSmoke.exitCode).toBe(0);

      const cliHelp = await runCommand({
        cmd: ["./node_modules/.bin/goodmemory", "--help"],
        cwd: workspaceRoot,
        env: { ...RELEASE_TEST_ENV },
      });
      expect(cliHelp.exitCode).toBe(0);
      expect(cliHelp.stdout).toContain("GoodMemory CLI");
      expect(cliHelp.stdout).toContain("goodmemory <command> [options]");
    } finally {
      await rm(packOutputDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 40_000);
});
