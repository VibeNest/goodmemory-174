import { resolve } from "node:path";
import type { AISDKModelConfig } from "../provider/ai-sdk-runtime";
import { isModelProviderId } from "../provider/model-provider";
import type { GoodMemoryConfig, StorageConfig } from "./contracts";

export const DEFAULT_SQLITE_STORAGE_PATH = ".goodmemory/memory.sqlite";
export const STORAGE_PROVIDER_ENV = "GOODMEMORY_STORAGE_PROVIDER";
export const STORAGE_URL_ENV = "GOODMEMORY_STORAGE_URL";
const EMBEDDING_ENV_PREFIX = "GOODMEMORY_EMBEDDING";
const ASSISTED_EXTRACTOR_ENV_PREFIX = "GOODMEMORY_ASSISTED_EXTRACTOR";

type EnvironmentMap = Record<string, string | undefined>;
type ExplicitProvider = NonNullable<StorageConfig["provider"]>;

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
    };

export interface GoodMemoryRuntimeResolution {
  assistedExtractionEnabled: boolean;
  assistedExtractorModelConfig: AISDKModelConfig | null;
  embeddingEnabled: boolean;
  embeddingModelConfig: AISDKModelConfig | null;
  explicitAdaptersConfigured: boolean;
  explicitStorageConfigured: boolean;
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
      adapters?.sessionStore ||
      adapters?.vectorStore,
  );
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

export function isPostgresConnectionString(value: string): boolean {
  return /^(?:postgres|postgresql):\/\//i.test(value.trim());
}

export function resolveSQLiteStorageUrl(
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
}): StoragePlan {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? process.cwd();
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
    return {
      mode: "auto",
      postgresUrl: configuredUrl,
      sqliteUrl: resolveSQLiteStorageUrl(undefined, cwd),
    };
  }

  return {
    mode: "auto",
    postgresUrl: undefined,
    sqliteUrl: resolveSQLiteStorageUrl(configuredUrl, cwd),
  };
}

export function resolveGoodMemoryRuntimeResolution(input: {
  config: Pick<GoodMemoryConfig, "adapters" | "storage">;
  env?: EnvironmentMap;
  cwd?: string;
}): GoodMemoryRuntimeResolution {
  const env = input.env ?? process.env;
  const embeddingModelConfig = input.config.adapters?.embeddingAdapter
    ? null
    : resolveEmbeddingModelConfigFromEnv(env);
  const assistedExtractorModelConfig = input.config.adapters?.assistedExtractor
    ? null
    : resolveAssistedExtractorModelConfigFromEnv(env);

  return {
    assistedExtractionEnabled: Boolean(
      input.config.adapters?.assistedExtractor || assistedExtractorModelConfig,
    ),
    assistedExtractorModelConfig,
    embeddingEnabled: Boolean(
      input.config.adapters?.embeddingAdapter || embeddingModelConfig,
    ),
    embeddingModelConfig,
    explicitAdaptersConfigured: hasExplicitAdaptersConfigured(input.config.adapters),
    explicitStorageConfigured: hasExplicitStorageConfigured(input.config.storage),
    storagePlan: resolveStoragePlan({
      storage: input.config.storage,
      env,
      cwd: input.cwd,
    }),
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
    throw new Error(
      `Missing required ${EMBEDDING_ENV_PREFIX} environment variables: ${missingVars.join(", ")}`,
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
