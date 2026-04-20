import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL_DEFAULT_RUNTIME_ENV_KEYS = [
  "GOODMEMORY_STORAGE_PROVIDER",
  "GOODMEMORY_STORAGE_URL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH",
  "GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH",
  "GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT",
  "GOODMEMORY_SQLITE_VECTOR_MODE",
  "GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION",
] as const;

export async function withLocalDefaultRuntime<T>(
  prefix: string,
  run: () => Promise<T>,
): Promise<T> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const previousCwd = process.cwd();
  const previousEnv = new Map<string, string | undefined>();

  try {
    for (const key of LOCAL_DEFAULT_RUNTIME_ENV_KEYS) {
      previousEnv.set(key, process.env[key]);
      delete process.env[key];
    }

    process.chdir(workspaceRoot);
    return await run();
  } finally {
    process.chdir(previousCwd);

    for (const key of LOCAL_DEFAULT_RUNTIME_ENV_KEYS) {
      const previousValue = previousEnv.get(key);
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }

    await rm(workspaceRoot, { recursive: true, force: true });
  }
}
