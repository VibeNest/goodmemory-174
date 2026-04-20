import type { GoodMemoryConfig } from "../../src";

const defaultConfig: GoodMemoryConfig = {};

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

const embeddingAdapterConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  adapters: {
    embeddingAdapter: {
      async embed(texts) {
        return texts.map(() => [1, 0, 0]);
      },
    },
  },
};

const assistedExtractorConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  adapters: {
    assistedExtractor: {
      async extract() {
        return {
          candidates: [],
          ignoredMessageCount: 0,
        };
      },
    },
  },
};

void defaultConfig;
void minimalConfig;
void testingConfig;
void languageConfig;
void embeddingAdapterConfig;
void assistedExtractorConfig;

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

const invalidEvolutionConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config does not expose evolution internals.
  evolution: { enabled: true },
};

const invalidStrategyRolloutConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config does not expose eval rollout controls.
  strategyRollout: { family: "retrieval", mode: "assist" },
};

const invalidPromotionGateConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config does not expose promotion-gate runtime controls.
  promotionGate: { decision: "accepted" },
};

const invalidEvalConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  // @ts-expect-error GoodMemory core config does not expose eval-only configuration.
  eval: { outputDir: "reports/eval" },
};

void invalidEmbeddingConfig;
void invalidLLMConfig;
void invalidRouterConfig;
void invalidEvolutionConfig;
void invalidStrategyRolloutConfig;
void invalidPromotionGateConfig;
void invalidEvalConfig;
