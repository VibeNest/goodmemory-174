const PRESERVED_PREFIXES = ["GOODMEMORY_TEST_"] as const;

function normalizeEnvKey(key: string): string {
  return key.toUpperCase();
}

function shouldPreserveGoodMemoryEnv(key: string): boolean {
  const normalizedKey = normalizeEnvKey(key);
  return PRESERVED_PREFIXES.some((prefix) =>
    normalizedKey.startsWith(prefix),
  );
}

export function shouldIsolateTestEnvKey(key: string): boolean {
  const normalizedKey = normalizeEnvKey(key);
  return (
    normalizedKey.startsWith("GOODMEMORY_") &&
    !shouldPreserveGoodMemoryEnv(key)
  );
}

export function buildIsolatedTestEnv(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const isolatedEnv = { ...env };

  for (const key of Object.keys(isolatedEnv)) {
    if (shouldIsolateTestEnvKey(key)) {
      delete isolatedEnv[key];
    }
  }

  return isolatedEnv;
}
