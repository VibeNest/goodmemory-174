import { afterEach } from "bun:test";

import { buildIsolatedTestEnv } from "./test-env-isolation";

const TEST_ENV_BASELINE = buildIsolatedTestEnv(process.env);

function resetProcessEnvToBaseline(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in TEST_ENV_BASELINE)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(TEST_ENV_BASELINE)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

resetProcessEnvToBaseline();

afterEach(() => {
  resetProcessEnvToBaseline();
});
