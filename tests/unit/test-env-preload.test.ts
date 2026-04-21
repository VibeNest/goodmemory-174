import { expect, test } from "bun:test";

const BASELINE_TEST_POSTGRES_URL = process.env.GOODMEMORY_TEST_POSTGRES_URL;

test.serial("allows runtime GoodMemory env inside a test", () => {
  process.env.GOODMEMORY_STORAGE_URL = "postgres://runtime/should-not-leak";
  process.env.GOODMEMORY_EVAL_API_KEY = "eval-key";
  process.env.GOODMEMORY_TEST_POSTGRES_URL = "postgres://override/should-reset";

  expect(process.env.GOODMEMORY_STORAGE_URL).toBe(
    "postgres://runtime/should-not-leak",
  );
  expect(process.env.GOODMEMORY_EVAL_API_KEY).toBe("eval-key");
  expect(process.env.GOODMEMORY_TEST_POSTGRES_URL).toBe(
    "postgres://override/should-reset",
  );
});

test.serial("restores the preload baseline for the next test", () => {
  expect(process.env.GOODMEMORY_STORAGE_URL).toBeUndefined();
  expect(process.env.GOODMEMORY_EVAL_API_KEY).toBeUndefined();
  expect(process.env.GOODMEMORY_TEST_POSTGRES_URL).toBe(
    BASELINE_TEST_POSTGRES_URL,
  );
});
