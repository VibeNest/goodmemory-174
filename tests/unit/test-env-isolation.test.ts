import { describe, expect, it } from "bun:test";

import {
  buildIsolatedTestEnv,
  shouldIsolateTestEnvKey,
} from "../support/test-env-isolation";

describe("test env isolation", () => {
  it("isolates ambient GoodMemory runtime env while preserving test-gated env", () => {
    const isolated = buildIsolatedTestEnv({
      GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "extractor-key",
      GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
      GOODMEMORY_EVAL_API_KEY: "eval-key",
      GOODMEMORY_JUDGE_API_KEY: "judge-key",
      GOODMEMORY_RECALL_ROUTER_API_KEY: "router-key",
      GOODMEMORY_SQLITE_VECTOR_MODE: "require",
      GOODMEMORY_STORAGE_PROVIDER: "postgres",
      GOODMEMORY_STORAGE_URL: "postgres://runtime/goodmemory",
      GOODMEMORY_TEST_CUSTOM_FLAG: "keep-me",
      GOODMEMORY_TEST_POSTGRES_URL: "postgres://test/goodmemory_test",
      PATH: "/usr/bin",
    });

    expect(isolated.GOODMEMORY_STORAGE_PROVIDER).toBeUndefined();
    expect(isolated.GOODMEMORY_STORAGE_URL).toBeUndefined();
    expect(isolated.GOODMEMORY_EMBEDDING_API_KEY).toBeUndefined();
    expect(isolated.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY).toBeUndefined();
    expect(isolated.GOODMEMORY_RECALL_ROUTER_API_KEY).toBeUndefined();
    expect(isolated.GOODMEMORY_EVAL_API_KEY).toBeUndefined();
    expect(isolated.GOODMEMORY_JUDGE_API_KEY).toBeUndefined();
    expect(isolated.GOODMEMORY_SQLITE_VECTOR_MODE).toBeUndefined();
    expect(isolated.GOODMEMORY_TEST_POSTGRES_URL).toBe(
      "postgres://test/goodmemory_test",
    );
    expect(isolated.GOODMEMORY_TEST_CUSTOM_FLAG).toBe("keep-me");
    expect(isolated.PATH).toBe("/usr/bin");
  });

  it("treats non-test GoodMemory env as isolated by default", () => {
    expect(shouldIsolateTestEnvKey("GOODMEMORY_STORAGE_URL")).toBe(true);
    expect(shouldIsolateTestEnvKey("GOODMEMORY_SQLITE_VECTOR_MODE")).toBe(true);
    expect(shouldIsolateTestEnvKey("GOODMEMORY_FUTURE_FLAG")).toBe(true);
    expect(shouldIsolateTestEnvKey("GOODMEMORY_TEST_POSTGRES_URL")).toBe(false);
    expect(shouldIsolateTestEnvKey("PATH")).toBe(false);
  });
});
