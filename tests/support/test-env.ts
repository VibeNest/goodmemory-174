import { afterEach } from "bun:test";

import { buildIsolatedTestEnv } from "./test-env-isolation";

const TEST_ENV_BASELINE = buildIsolatedTestEnv(process.env);

process.env = { ...TEST_ENV_BASELINE };

afterEach(() => {
  process.env = { ...TEST_ENV_BASELINE };
});
