const PRESERVED_PREFIXES = ["GOODMEMORY_TEST_"] as const;

function shouldPreserveGoodMemoryEnv(key: string): boolean {
  return PRESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function shouldIsolateTestEnvKey(key: string): boolean {
  return key.startsWith("GOODMEMORY_") && !shouldPreserveGoodMemoryEnv(key);
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
