import { resolveWorkspaceId } from "../host/managedFiles";

export type InstalledHostConfigTarget = "claude" | "codex";

export interface InstalledHostRuntimeConfig {
  activationMode: InstalledHostActivationMode;
  autoLearn: InstalledHostAutoLearnConfig;
  debug: boolean;
  maxTokens: number;
  providers?: InstalledHostProviderConfig;
  retrievalProfile: "coding_agent" | "general_chat";
  storage: {
    provider: "memory" | "postgres" | "sqlite";
    url: string;
  };
  userId: string;
}

export type InstalledHostActivationMode = "global" | "workspace_opt_in";
export type InstalledHostAutoLearnSource = "session_stop" | "user_prompt";
export type InstalledHostAutoLearnExtractionStrategy =
  | "auto"
  | "llm-assisted"
  | "rules-only";

export interface InstalledHostAutoLearnConfig {
  enabled: boolean;
  extractionStrategy: InstalledHostAutoLearnExtractionStrategy;
  sources: InstalledHostAutoLearnSource[];
}

export interface InstalledHostModelProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  provider: "anthropic" | "openai";
}

export interface InstalledHostEmbeddingProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  provider: "openai";
}

export interface InstalledHostProviderConfig {
  assistedExtractor?: InstalledHostModelProviderConfig;
  embedding?: InstalledHostEmbeddingProviderConfig;
}

export interface WorkspaceHostOptInConfig {
  debug: boolean;
  enabled: boolean;
  maxTokens?: number;
  retrievalProfile?: "coding_agent" | "general_chat";
  workspaceId: string;
}

export const DEFAULT_INSTALLED_HOST_MAX_TOKENS = 256;
export const DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE = "coding_agent";
export const DEFAULT_INSTALLED_HOST_ACTIVATION_MODE = "workspace_opt_in";
export const DEFAULT_INSTALLED_HOST_AUTO_LEARN: InstalledHostAutoLearnConfig = {
  enabled: false,
  extractionStrategy: "auto",
  sources: ["user_prompt", "session_stop"],
};

export function parseInstalledHostRuntimeConfig(
  parsed: unknown,
  host: InstalledHostConfigTarget,
):
  | { config: InstalledHostRuntimeConfig; status: "ok" }
  | { detail: string; status: "invalid" } {
  if (!isRecord(parsed)) {
    return { detail: "root value must be a JSON object", status: "invalid" };
  }
  if (parsed.host !== host) {
    return {
      detail: "host value does not match the managed config target",
      status: "invalid",
    };
  }
  if (parsed.debug !== undefined && typeof parsed.debug !== "boolean") {
    return { detail: "debug must be a boolean", status: "invalid" };
  }

  const activationMode =
    parsed.activationMode === undefined
      ? DEFAULT_INSTALLED_HOST_ACTIVATION_MODE
      : readActivationMode(parsed.activationMode);
  if (activationMode === undefined) {
    return {
      detail: "activationMode must be global or workspace_opt_in",
      status: "invalid",
    };
  }

  const autoLearn = readAutoLearnConfig(parsed.autoLearn);
  if (autoLearn.status === "invalid") {
    return {
      detail: autoLearn.detail,
      status: "invalid",
    };
  }

  const maxTokens =
    parsed.maxTokens === undefined
      ? DEFAULT_INSTALLED_HOST_MAX_TOKENS
      : readPositiveInteger(parsed.maxTokens);
  if (maxTokens === undefined) {
    return { detail: "maxTokens must be a positive integer", status: "invalid" };
  }

  const retrievalProfile =
    parsed.retrievalProfile === undefined
      ? DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE
      : readRetrievalProfile(parsed.retrievalProfile);
  if (retrievalProfile === undefined) {
    return {
      detail: "retrievalProfile must be coding_agent or general_chat",
      status: "invalid",
    };
  }

  const storage = isRecord(parsed.storage) ? parsed.storage : null;
  const provider = readStorageProvider(storage?.provider);
  if (provider === undefined) {
    return {
      detail: "storage.provider must be memory, sqlite, or postgres",
      status: "invalid",
    };
  }

  const url = readStorageUrl(storage);
  if (url === null) {
    return {
      detail: "storage.path or storage.url must be a non-empty string",
      status: "invalid",
    };
  }

  const userId = normalizeText(readOptionalText(parsed, "userId"));
  if (userId === null) {
    return { detail: "userId must be a non-empty string", status: "invalid" };
  }

  const providers = readInstalledHostProviders(parsed.providers);
  if (providers.status === "invalid") {
    return {
      detail: providers.detail,
      status: "invalid",
    };
  }

  return {
    status: "ok",
    config: {
      activationMode,
      autoLearn: autoLearn.config,
      debug: parsed.debug === true,
      maxTokens,
      ...(providers.config ? { providers: providers.config } : {}),
      retrievalProfile,
      storage: {
        provider,
        url,
      },
      userId,
    },
  };
}

function readActivationMode(
  value: unknown,
): InstalledHostActivationMode | undefined {
  return value === "global" || value === "workspace_opt_in" ? value : undefined;
}

function readAutoLearnConfig(
  value: unknown,
):
  | { config: InstalledHostAutoLearnConfig; status: "ok" }
  | { detail: string; status: "invalid" } {
  if (value === undefined) {
    return {
      config: DEFAULT_INSTALLED_HOST_AUTO_LEARN,
      status: "ok",
    };
  }
  if (!isRecord(value)) {
    return { detail: "autoLearn must be a JSON object", status: "invalid" };
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return { detail: "autoLearn.enabled must be a boolean", status: "invalid" };
  }

  const extractionStrategy =
    value.extractionStrategy === undefined
      ? DEFAULT_INSTALLED_HOST_AUTO_LEARN.extractionStrategy
      : readAutoLearnExtractionStrategy(value.extractionStrategy);
  if (extractionStrategy === undefined) {
    return {
      detail: "autoLearn.extractionStrategy must be auto, rules-only, or llm-assisted",
      status: "invalid",
    };
  }

  const sources = readAutoLearnSources(value.sources);
  if (sources === undefined) {
    return {
      detail: "autoLearn.sources must be an array of user_prompt and session_stop",
      status: "invalid",
    };
  }

  return {
    config: {
      enabled: value.enabled === true,
      extractionStrategy,
      sources,
    },
    status: "ok",
  };
}

function readAutoLearnExtractionStrategy(
  value: unknown,
): InstalledHostAutoLearnExtractionStrategy | undefined {
  return value === "auto" || value === "rules-only" || value === "llm-assisted"
    ? value
    : undefined;
}

function readAutoLearnSources(
  value: unknown,
): InstalledHostAutoLearnSource[] | undefined {
  if (value === undefined) {
    return [...DEFAULT_INSTALLED_HOST_AUTO_LEARN.sources];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sources = new Set<InstalledHostAutoLearnSource>();
  for (const candidate of value) {
    if (candidate !== "user_prompt" && candidate !== "session_stop") {
      return undefined;
    }
    sources.add(candidate);
  }

  return sources.size > 0
    ? [...sources]
    : [...DEFAULT_INSTALLED_HOST_AUTO_LEARN.sources];
}

export function parseWorkspaceHostOptInConfig(
  parsed: unknown,
  host: InstalledHostConfigTarget,
  workspaceRoot: string,
):
  | { config: WorkspaceHostOptInConfig; status: "disabled" | "ok" }
  | { detail: string; status: "invalid" } {
  if (!isRecord(parsed)) {
    return { detail: "root value must be a JSON object", status: "invalid" };
  }
  if (parsed.host !== host) {
    return {
      detail: "host value does not match the managed config target",
      status: "invalid",
    };
  }
  if (parsed.enabled !== undefined && typeof parsed.enabled !== "boolean") {
    return { detail: "enabled must be a boolean", status: "invalid" };
  }
  if (parsed.debug !== undefined && typeof parsed.debug !== "boolean") {
    return { detail: "debug must be a boolean", status: "invalid" };
  }

  const maxTokens = readOptionalPositiveInteger(parsed.maxTokens);
  if (parsed.maxTokens !== undefined && maxTokens === undefined) {
    return { detail: "maxTokens must be a positive integer", status: "invalid" };
  }

  const retrievalProfile = readOptionalRetrievalProfile(parsed.retrievalProfile);
  if (parsed.retrievalProfile !== undefined && retrievalProfile === undefined) {
    return {
      detail: "retrievalProfile must be coding_agent or general_chat",
      status: "invalid",
    };
  }

  const enabled = parsed.enabled !== false;
  return {
    status: enabled ? "ok" : "disabled",
    config: {
      debug: parsed.debug === true,
      enabled,
      maxTokens,
      retrievalProfile,
      workspaceId:
        normalizeText(readOptionalText(parsed, "workspaceId")) ??
        resolveWorkspaceId(workspaceRoot, undefined),
    },
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function readOptionalText(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}

export function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  return value === undefined ? undefined : readPositiveInteger(value);
}

export function readRetrievalProfile(
  value: unknown,
): "coding_agent" | "general_chat" | undefined {
  return value === "coding_agent" || value === "general_chat" ? value : undefined;
}

function readOptionalRetrievalProfile(
  value: unknown,
): "coding_agent" | "general_chat" | undefined {
  return value === undefined ? undefined : readRetrievalProfile(value);
}

export function readStorageProvider(
  value: unknown,
): "memory" | "postgres" | "sqlite" | undefined {
  return value === "memory" || value === "postgres" || value === "sqlite"
    ? value
    : undefined;
}

export function readStorageUrl(storage: Record<string, unknown> | null): string | null {
  if (!storage) {
    return null;
  }
  return normalizeText(
    typeof storage.path === "string"
      ? storage.path
      : typeof storage.url === "string"
        ? storage.url
        : undefined,
  );
}

function readInstalledHostProviders(
  value: unknown,
):
  | { config?: InstalledHostProviderConfig; status: "ok" }
  | { detail: string; status: "invalid" } {
  if (value === undefined) {
    return { status: "ok" };
  }
  if (!isRecord(value)) {
    return { detail: "providers must be a JSON object", status: "invalid" };
  }

  const embedding = readEmbeddingProviderConfig(value.embedding);
  if (embedding.status === "invalid") {
    return embedding;
  }

  const assistedExtractor = readModelProviderConfig(
    value.assistedExtractor,
    "providers.assistedExtractor",
  );
  if (assistedExtractor.status === "invalid") {
    return assistedExtractor;
  }

  const config: InstalledHostProviderConfig = {
    ...(embedding.config ? { embedding: embedding.config } : {}),
    ...(assistedExtractor.config
      ? { assistedExtractor: assistedExtractor.config }
      : {}),
  };

  return Object.keys(config).length > 0
    ? { config, status: "ok" }
    : { status: "ok" };
}

function readEmbeddingProviderConfig(
  value: unknown,
):
  | { config?: InstalledHostEmbeddingProviderConfig; status: "ok" }
  | { detail: string; status: "invalid" } {
  const result = readModelProviderConfig(value, "providers.embedding");
  if (result.status === "invalid") {
    return result;
  }
  if (!result.config) {
    return { status: "ok" };
  }
  if (result.config.provider !== "openai") {
    return {
      detail: "providers.embedding.provider must be openai",
      status: "invalid",
    };
  }

  return {
    config: {
      ...result.config,
      provider: "openai",
    },
    status: "ok",
  };
}

function readModelProviderConfig(
  value: unknown,
  field: string,
):
  | { config?: InstalledHostModelProviderConfig; status: "ok" }
  | { detail: string; status: "invalid" } {
  if (value === undefined) {
    return { status: "ok" };
  }
  if (!isRecord(value)) {
    return { detail: `${field} must be a JSON object`, status: "invalid" };
  }

  const provider = readModelProvider(value.provider);
  if (!provider) {
    return {
      detail: `${field}.provider must be openai or anthropic`,
      status: "invalid",
    };
  }

  const model = normalizeText(
    typeof value.model === "string" ? value.model : undefined,
  );
  if (!model) {
    return { detail: `${field}.model must be a non-empty string`, status: "invalid" };
  }

  const apiKey = normalizeText(
    typeof value.apiKey === "string" ? value.apiKey : undefined,
  );
  if (!apiKey) {
    return { detail: `${field}.apiKey must be a non-empty string`, status: "invalid" };
  }

  const baseURL = normalizeText(
    typeof value.baseURL === "string" ? value.baseURL : undefined,
  );

  return {
    config: {
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      model,
      provider,
    },
    status: "ok",
  };
}

function readModelProvider(value: unknown): "anthropic" | "openai" | undefined {
  return value === "anthropic" || value === "openai" ? value : undefined;
}
