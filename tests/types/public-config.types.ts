import type {
  GoodMemoryConfig,
  GoodMemoryTraceSink,
  NamedRememberProfileExtractor,
  RememberInput,
  RememberProfile,
} from "../../src";
import { rememberRules } from "../../src";

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

const traceSink: GoodMemoryTraceSink = {
  emit(span) {
    void span.traceId;
    void span.scopeDigest.userIdHash;
    void span.redaction.containsRawUserText;
  },
};

const observabilityConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  observability: {
    scopeDigestSecret: "trusted-public-config-secret",
    traceSink,
  },
};

const lifeCoachProfile: RememberProfile = {
  id: "life-coach",
  when: { agentId: "life-coach" },
  extends: "default",
  rules: [
    rememberRules.fact(/my top priority this quarter is (.+)/i, {
      id: "life-goal-priority",
      category: "goal",
      tags: ["life_coach", "long_term_goal"],
      content: ({ match }) => match[1] ?? "",
    }),
    rememberRules.preference(/please coach me with (.+)/i, {
      id: "life-coaching-style",
      category: "coaching_style",
      value: ({ match }) => match[1] ?? "",
    }),
    rememberRules.predicate({
      id: "life-relationship-context",
      when: ({ message }) => message.content.includes("my sister"),
      kindHint: "fact",
      content: ({ message }) => message.content,
      metadata: {
        category: "relationship_dynamic",
        tags: ["life_coach", "relationship"],
      },
    }),
    rememberRules.mapper({
      id: "life-direct-goal",
      map: (input) => [
        {
          id: "life-direct-goal-1",
          kindHint: "fact",
          explicitness: "explicit",
          content: input.messages[0]?.content ?? "",
          sourceMessageIndex: 0,
          sourceRole: input.messages[0]?.role ?? "user",
          metadata: {
            category: "goal",
            attributes: { source: "host_mapper" },
          },
        },
      ],
    }),
  ],
  extractors: [
    {
      id: "life-coach-values-extractor",
      extractor: {
        async extract() {
          return {
            candidates: [],
            ignoredMessageCount: 0,
          };
        },
      },
    },
  ],
  assistantOutputs: {
    mode: "confirmed_or_verified_only",
  },
};

const namedProfileExtractor: NamedRememberProfileExtractor = {
  id: "life-coach-domain-extractor",
  extractor: {
    async extract() {
      return {
        candidates: [],
        ignoredMessageCount: 0,
      };
    },
  },
};

const rememberConfig: GoodMemoryConfig = {
  storage: { provider: "memory" },
  remember: {
    preset: "default",
    profiles: [lifeCoachProfile],
  },
};

const annotatedRememberInput: RememberInput = {
  scope: { userId: "user-1", agentId: "life-coach" },
  messages: [
    { role: "assistant", content: "A weekly review cadence may help." },
    { role: "user", content: "Yes, let's use that." },
  ],
  annotations: [
    {
      messageIndex: 0,
      remember: "always",
      kindHint: "fact",
      confirmed: true,
      metadataPatch: {
        category: "habit",
        tags: ["life_coach", "weekly_review"],
        attributes: {
          cadence: "weekly",
        },
      },
    },
  ],
};

void defaultConfig;
void minimalConfig;
void testingConfig;
void languageConfig;
void embeddingAdapterConfig;
void assistedExtractorConfig;
void observabilityConfig;
void rememberConfig;
void annotatedRememberInput;
void namedProfileExtractor;

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
