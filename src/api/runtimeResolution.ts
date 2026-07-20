import { resolve } from "node:path";
import type { AISDKModelConfig } from "../provider/ai-sdk-runtime";
import { isModelProviderId } from "../provider/model-provider";
import {
  resolveGoodMemoryRetrievalRuntime,
  type ResolvedGoodMemoryRetrieval,
} from "./retrievalPreset";
import type {
  GoodMemoryConfig,
  GoodMemoryEmbeddingProviderConfig,
  GoodMemoryExtractionProviderConfig,
  GoodMemoryRerankingProviderConfig,
  StorageConfig,
} from "./contracts";

export const DEFAULT_SQLITE_STORAGE_PATH = ".goodmemory/memory.sqlite";
const STORAGE_PROVIDER_ENV = "GOODMEMORY_STORAGE_PROVIDER";
const STORAGE_URL_ENV = "GOODMEMORY_STORAGE_URL";
const EMBEDDING_ENV_PREFIX = "GOODMEMORY_EMBEDDING";
const ASSISTED_EXTRACTOR_ENV_PREFIX = "GOODMEMORY_ASSISTED_EXTRACTOR";

type EnvironmentMap = Record<string, string | undefined>;
type ExplicitProvider = NonNullable<StorageConfig["provider"]>;

export interface GoodMemoryRuntimeCapabilitiesInput {
  builtInPostgres?: boolean;
  builtInSQLite?: boolean;
  localDefaultSQLite?: boolean;
}

export interface GoodMemoryRuntimeCapabilities {
  builtInPostgres: boolean;
  builtInSQLite: boolean;
  localDefaultSQLite: boolean;
}

export type GoodMemoryStorageAdapterOverride =
  | "documentStore"
  | "sessionStore"
  | "vectorStore";

interface ResolvedStorageSource {
  provider?: ExplicitProvider;
  url?: string;
}

export type ResolvedStorageConfig =
  | {
      provider: "memory";
    }
  | {
      provider: "sqlite";
      url: string;
    }
  | {
      provider: "postgres";
      url: string;
    };

export type StoragePlan =
  | {
      mode: "explicit";
      storage: ResolvedStorageConfig;
    }
  | {
      mode: "auto";
      postgresUrl?: string;
      sqliteUrl: string;
    }
  | {
      mode: "auto";
      fallbackProvider: "memory";
      postgresUrl?: string;
    };

export interface GoodMemoryRuntimeResolution {
  assistedExtractionEnabled: boolean;
  assistedExtractorModelConfig: AISDKModelConfig | null;
  embeddingEnabled: boolean;
  embeddingModelConfig: AISDKModelConfig | null;
  rerankerModelConfig: AISDKModelConfig | null;
  rerankingEnabled: boolean;
  providerRerankingStrategy?: "listwise" | "pointwise";
  explicitAdaptersConfigured: boolean;
  explicitStorageConfigured: boolean;
  // Effective write-time extraction mode: the raw config predicate, plus the
  // recommended preset's conversational flip when an extractor model resolves.
  extractionMode: "conversational" | "default";
  // Retrieval config after preset expansion (passthrough by reference when no
  // preset is set); the engine consumes this, never the raw config.
  retrieval: ResolvedGoodMemoryRetrieval;
  runtimeCapabilities: GoodMemoryRuntimeCapabilities;
  storageAdapterOverrides: GoodMemoryStorageAdapterOverride[];
  storagePlan: StoragePlan;
}

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasExplicitStorageConfigured(storage: StorageConfig | undefined): boolean {
  return (
    storage?.provider !== undefined || normalizeNonEmpty(storage?.url) !== undefined
  );
}

function hasExplicitAdaptersConfigured(
  adapters: GoodMemoryConfig["adapters"] | undefined,
): boolean {
  return Boolean(
    adapters?.assistedExtractor ||
      adapters?.documentStore ||
      adapters?.embeddingAdapter ||
      adapters?.reranker ||
      adapters?.recallPlanner ||
      adapters?.sessionStore ||
      adapters?.vectorStore,
  );
}

function resolveStorageAdapterOverrides(
  adapters: GoodMemoryConfig["adapters"] | undefined,
): GoodMemoryStorageAdapterOverride[] {
  const overrides: GoodMemoryStorageAdapterOverride[] = [];

  if (adapters?.documentStore) {
    overrides.push("documentStore");
  }

  if (adapters?.sessionStore) {
    overrides.push("sessionStore");
  }

  if (adapters?.vectorStore) {
    overrides.push("vectorStore");
  }

  return overrides;
}

function resolveExplicitProvider(
  rawProvider: StorageConfig["provider"] | string | undefined,
): ExplicitProvider | undefined {
  const provider = rawProvider;
  if (
    provider === undefined ||
    provider === "memory" ||
    provider === "sqlite" ||
    provider === "postgres"
  ) {
    return provider;
  }

  throw new Error(
    `Unsupported storage provider: ${provider}. Expected memory|sqlite|postgres.`,
  );
}

function resolveStorageSource(
  storage: StorageConfig | undefined,
  env: EnvironmentMap,
): ResolvedStorageSource {
  const explicitUrl = normalizeNonEmpty(storage?.url);
  if (storage?.provider !== undefined || explicitUrl !== undefined) {
    return {
      provider: resolveExplicitProvider(storage?.provider),
      url: explicitUrl,
    };
  }

  return {
    provider: resolveExplicitProvider(normalizeNonEmpty(env[STORAGE_PROVIDER_ENV])),
    url: normalizeNonEmpty(env[STORAGE_URL_ENV]),
  };
}

function supportsBuiltInSQLiteRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

function supportsBuiltInPostgresRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

function resolveRuntimeCapabilities(
  input: GoodMemoryRuntimeCapabilitiesInput | undefined,
): GoodMemoryRuntimeCapabilities {
  const builtInSQLite =
    input?.builtInSQLite ??
    input?.localDefaultSQLite ??
    supportsBuiltInSQLiteRuntime();
  const builtInPostgres =
    input?.builtInPostgres ??
    supportsBuiltInPostgresRuntime();
  const localDefaultSQLite =
    input?.localDefaultSQLite ??
    builtInSQLite;

  return {
    builtInPostgres,
    builtInSQLite,
    localDefaultSQLite,
  };
}

function isPostgresConnectionString(value: string): boolean {
  return /^(?:postgres|postgresql):\/\//i.test(value.trim());
}

function resolveSQLiteStorageUrl(
  rawPath: string | undefined,
  cwd = process.cwd(),
): string {
  const normalized = normalizeNonEmpty(rawPath);
  if (!normalized) {
    return resolve(cwd, DEFAULT_SQLITE_STORAGE_PATH);
  }

  return normalized === ":memory:" ? normalized : resolve(cwd, normalized);
}

export function resolveStoragePlan(input: {
  storage?: StorageConfig;
  env?: EnvironmentMap;
  cwd?: string;
  runtimeCapabilities?: GoodMemoryRuntimeCapabilitiesInput;
}): StoragePlan {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
  const localDefaultSQLite = resolveRuntimeCapabilities(
    input.runtimeCapabilities,
  ).localDefaultSQLite;
  const resolvedSource = resolveStorageSource(input.storage, env);
  const explicitProvider = resolvedSource.provider;
  const configuredUrl = resolvedSource.url;

  if (explicitProvider === "memory") {
    return {
      mode: "explicit",
      storage: {
        provider: "memory",
      },
    };
  }

  if (explicitProvider === "sqlite") {
    return {
      mode: "explicit",
      storage: {
        provider: "sqlite",
        url: resolveSQLiteStorageUrl(configuredUrl, cwd),
      },
    };
  }

  if (explicitProvider === "postgres") {
    if (!configuredUrl) {
      throw new Error(
        "Postgres storage provider requires storage.url to be configured.",
      );
    }

    return {
      mode: "explicit",
      storage: {
        provider: "postgres",
        url: configuredUrl,
      },
    };
  }

  if (configuredUrl && isPostgresConnectionString(configuredUrl)) {
    if (!localDefaultSQLite) {
      return {
        mode: "auto",
        fallbackProvider: "memory",
        postgresUrl: configuredUrl,
      };
    }

    return {
      mode: "auto",
      postgresUrl: configuredUrl,
      sqliteUrl: resolveSQLiteStorageUrl(undefined, cwd),
    };
  }

  if (!configuredUrl && !localDefaultSQLite) {
    return {
      mode: "auto",
      fallbackProvider: "memory",
      postgresUrl: undefined,
    };
  }

  return {
    mode: "auto",
    postgresUrl: undefined,
    sqliteUrl: resolveSQLiteStorageUrl(configuredUrl, cwd),
  };
}

export function resolveGoodMemoryRuntimeResolution(input: {
  config: Pick<GoodMemoryConfig, "adapters" | "providers" | "retrieval" | "storage">;
  env?: EnvironmentMap;
  cwd?: string;
  runtimeCapabilities?: GoodMemoryRuntimeCapabilitiesInput;
}): GoodMemoryRuntimeResolution {
  const env = input.env ?? process.env;
  const runtimeCapabilities = resolveRuntimeCapabilities(input.runtimeCapabilities);
  const embeddingModelConfig = input.config.adapters?.embeddingAdapter
    ? null
    : resolveEmbeddingModelConfigFromProviderConfig(
        input.config.providers?.embedding,
      ) ?? resolveEmbeddingModelConfigFromEnv(env);
  const assistedExtractorModelConfig = input.config.adapters?.assistedExtractor
    ? null
    : resolveAssistedExtractorModelConfigFromProviderConfig(
        input.config.providers?.extraction,
      ) ?? resolveAssistedExtractorModelConfigFromEnv(env);
  const rerankerModelConfig = input.config.adapters?.reranker
    ? null
    : resolveRerankerModelConfigFromProviderConfig(
        input.config.providers?.reranking,
      );
  const embeddingEnabled = Boolean(
    input.config.adapters?.embeddingAdapter || embeddingModelConfig,
  );
  const retrievalRuntime = resolveGoodMemoryRetrievalRuntime({
    adapters: input.config.adapters,
    assistedExtractorModelConfigured: Boolean(assistedExtractorModelConfig),
    embeddingEnabled,
    extraction: input.config.providers?.extraction,
    providerRerankerConfigured: Boolean(rerankerModelConfig),
    retrieval: input.config.retrieval,
  });

  return {
    assistedExtractionEnabled: Boolean(
      input.config.adapters?.assistedExtractor || assistedExtractorModelConfig,
    ),
    assistedExtractorModelConfig,
    embeddingEnabled,
    embeddingModelConfig,
    rerankerModelConfig,
    rerankingEnabled: Boolean(
      input.config.adapters?.reranker || rerankerModelConfig,
    ),
    ...(retrievalRuntime.providerRerankingStrategy
      ? {
          providerRerankingStrategy:
            retrievalRuntime.providerRerankingStrategy,
        }
      : {}),
    extractionMode: retrievalRuntime.extractionMode,
    retrieval: retrievalRuntime.retrieval,
    explicitAdaptersConfigured: hasExplicitAdaptersConfigured(input.config.adapters),
    explicitStorageConfigured: hasExplicitStorageConfigured(input.config.storage),
    runtimeCapabilities,
    storageAdapterOverrides: resolveStorageAdapterOverrides(input.config.adapters),
    storagePlan: resolveStoragePlan({
      storage: input.config.storage,
      env,
      cwd: input.cwd,
      runtimeCapabilities,
    }),
  };
}

function resolveRerankerModelConfigFromProviderConfig(
  config: GoodMemoryRerankingProviderConfig | undefined,
): AISDKModelConfig | null {
  if (!config) {
    return null;
  }

  const provider = normalizeNonEmpty(config.provider);
  const model = normalizeNonEmpty(config.model);
  const apiKey = normalizeNonEmpty(config.apiKey);
  const baseURL = normalizeNonEmpty(config.baseURL);
  const missingFields = [
    !provider ? "provider" : null,
    !model ? "model" : null,
    !apiKey ? "apiKey" : null,
  ].filter(Boolean) as string[];

  if (missingFields.length > 0 || !provider || !model || !apiKey) {
    throw new Error(
      `Missing required providers.reranking configuration fields: ${missingFields.join(", ")}`,
    );
  }

  if (!isModelProviderId(provider)) {
    throw new Error(
      `Unsupported reranking provider: ${provider}. Expected one of openai|anthropic.`,
    );
  }

  return {
    apiKey,
    baseURL,
    model,
    provider,
  };
}

function resolveEmbeddingModelConfigFromProviderConfig(
  config: GoodMemoryEmbeddingProviderConfig | undefined,
): AISDKModelConfig | null {
  if (!config) {
    return null;
  }

  const provider = normalizeNonEmpty(config.provider);
  const model = normalizeNonEmpty(config.model);
  const apiKey = normalizeNonEmpty(config.apiKey);
  const baseURL = normalizeNonEmpty(config.baseURL);
  const missingFields = [
    !provider ? "provider" : null,
    !model ? "model" : null,
    !apiKey ? "apiKey" : null,
  ].filter(Boolean) as string[];

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required providers.embedding configuration fields: ${missingFields.join(", ")}`,
    );
  }

  if (!provider || !model || !apiKey) {
    throw new Error(
      `Missing required providers.embedding configuration fields: ${missingFields.join(", ")}`,
    );
  }

  if (!isModelProviderId(provider)) {
    throw new Error(
      `Unsupported embedding provider: ${provider}. Expected one of openai.`,
    );
  }

  if (provider !== "openai") {
    throw new Error(
      `Unsupported embedding provider: ${provider}. GoodMemory currently supports openai embeddings only.`,
    );
  }

  return {
    provider,
    model,
    apiKey,
    baseURL,
  };
}

function resolveAssistedExtractorModelConfigFromProviderConfig(
  config: GoodMemoryExtractionProviderConfig | undefined,
): AISDKModelConfig | null {
  if (!config) {
    return null;
  }

  const provider = normalizeNonEmpty(config.provider);
  const model = normalizeNonEmpty(config.model);
  const apiKey = normalizeNonEmpty(config.apiKey);
  const baseURL = normalizeNonEmpty(config.baseURL);
  const missingFields = [
    !provider ? "provider" : null,
    !model ? "model" : null,
    !apiKey ? "apiKey" : null,
  ].filter(Boolean) as string[];

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required providers.extraction configuration fields: ${missingFields.join(", ")}`,
    );
  }

  if (!provider || !model || !apiKey) {
    throw new Error(
      `Missing required providers.extraction configuration fields: ${missingFields.join(", ")}`,
    );
  }

  if (!isModelProviderId(provider)) {
    throw new Error(
      `Unsupported extraction provider: ${provider}. Expected one of openai|anthropic.`,
    );
  }

  return {
    provider,
    model,
    apiKey,
    baseURL,
  };
}

export function resolveEmbeddingModelConfigFromEnv(
  env: EnvironmentMap = process.env,
): AISDKModelConfig | null {
  const provider = normalizeNonEmpty(env[`${EMBEDDING_ENV_PREFIX}_PROVIDER`]);
  const model = normalizeNonEmpty(env[`${EMBEDDING_ENV_PREFIX}_MODEL`]);
  const apiKey = normalizeNonEmpty(env[`${EMBEDDING_ENV_PREFIX}_API_KEY`]);
  const baseURL = normalizeNonEmpty(env[`${EMBEDDING_ENV_PREFIX}_BASE_URL`]);
  const anyConfigured = Boolean(provider || model || apiKey || baseURL);

  if (!anyConfigured) {
    return null;
  }

  const missingVars = [
    !provider ? `${EMBEDDING_ENV_PREFIX}_PROVIDER` : null,
    !model ? `${EMBEDDING_ENV_PREFIX}_MODEL` : null,
    !apiKey ? `${EMBEDDING_ENV_PREFIX}_API_KEY` : null,
  ].filter(Boolean) as string[];

  if (missingVars.length > 0) {
    // A base URL with a missing key usually means a local OpenAI-compatible
    // endpoint (Ollama ignores the key, but the variable stays required).
    const localEndpointHint =
      baseURL && missingVars.length === 1 && !apiKey
        ? " (local OpenAI-compatible endpoints such as Ollama accept any placeholder value, e.g. GOODMEMORY_EMBEDDING_API_KEY=ollama)"
        : "";
    throw new Error(
      `Missing required ${EMBEDDING_ENV_PREFIX} environment variables: ${missingVars.join(", ")}${localEndpointHint}`,
    );
  }

  if (!provider || !model || !apiKey) {
    throw new Error(
      `Missing required ${EMBEDDING_ENV_PREFIX} environment variables: ${missingVars.join(", ")}`,
    );
  }

  if (!isModelProviderId(provider)) {
    throw new Error(
      `Unsupported embedding provider: ${provider}. Expected one of openai.`,
    );
  }

  if (provider !== "openai") {
    throw new Error(
      `Unsupported embedding provider: ${provider}. GoodMemory currently supports openai embeddings only.`,
    );
  }

  const resolvedProvider = provider;
  const resolvedModel = model;
  const resolvedApiKey = apiKey;

  return {
    provider: resolvedProvider,
    model: resolvedModel,
    apiKey: resolvedApiKey,
    baseURL,
  };
}

export function resolveAssistedExtractorModelConfigFromEnv(
  env: EnvironmentMap = process.env,
): AISDKModelConfig | null {
  const provider = normalizeNonEmpty(
    env[`${ASSISTED_EXTRACTOR_ENV_PREFIX}_PROVIDER`],
  );
  const model = normalizeNonEmpty(env[`${ASSISTED_EXTRACTOR_ENV_PREFIX}_MODEL`]);
  const apiKey = normalizeNonEmpty(
    env[`${ASSISTED_EXTRACTOR_ENV_PREFIX}_API_KEY`],
  );
  const baseURL = normalizeNonEmpty(
    env[`${ASSISTED_EXTRACTOR_ENV_PREFIX}_BASE_URL`],
  );
  const anyConfigured = Boolean(provider || model || apiKey || baseURL);

  if (!anyConfigured) {
    return null;
  }

  const missingVars = [
    !provider ? `${ASSISTED_EXTRACTOR_ENV_PREFIX}_PROVIDER` : null,
    !model ? `${ASSISTED_EXTRACTOR_ENV_PREFIX}_MODEL` : null,
    !apiKey ? `${ASSISTED_EXTRACTOR_ENV_PREFIX}_API_KEY` : null,
  ].filter(Boolean) as string[];

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required ${ASSISTED_EXTRACTOR_ENV_PREFIX} environment variables: ${missingVars.join(", ")}`,
    );
  }

  if (!provider || !model || !apiKey) {
    throw new Error(
      `Missing required ${ASSISTED_EXTRACTOR_ENV_PREFIX} environment variables: ${missingVars.join(", ")}`,
    );
  }

  if (!isModelProviderId(provider)) {
    throw new Error(
      `Unsupported assisted extractor provider: ${provider}. Expected one of openai|anthropic.`,
    );
  }

  return {
    provider,
    model,
    apiKey,
    baseURL,
  };
}
