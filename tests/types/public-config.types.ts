import type { GoodMemoryConfig } from "../../src";

const minimalConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
};

const testingConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  testing: {
    now: () => new Date(),
  },
};

const languageConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  language: {
    defaultLocale: "zh-CN",
    detection: "auto",
  },
};

void minimalConfig;
void testingConfig;
void languageConfig;

const invalidEmbeddingConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config no longer accepts embedding settings.
  embedding: { provider: "openai", model: "text-embedding-3-small" },
};

const invalidLLMConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config no longer accepts llm settings.
  llm: { provider: "anthropic", model: "claude-sonnet" },
};

const invalidRouterConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config does not expose router tuning.
  router: { strategy: "rules-only" },
};

void invalidEmbeddingConfig;
void invalidLLMConfig;
void invalidRouterConfig;
