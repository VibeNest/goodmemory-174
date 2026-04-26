import { resolveWorkspaceId } from "../host/managedFiles";

export type InstalledHostConfigTarget = "claude" | "codex";

export interface InstalledHostRuntimeConfig {
  activationMode: InstalledHostActivationMode;
  contextMode: InstalledHostContextMode;
  debug: boolean;
  maxTokens: number;
  providers?: InstalledHostProviderConfig;
  retrievalProfile: "coding_agent" | "general_chat";
  storage: {
    provider: "memory" | "postgres" | "sqlite";
    url: string;
  };
  userId: string;
  writeback: InstalledHostWritebackConfig;
}

export type InstalledHostActivationMode = "global" | "workspace_opt_in";
export type InstalledHostContextMode = "fragment" | "progressive";
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

export type InstalledHostWritebackMode = "off" | "observe" | "selective";
export type InstalledHostWritebackAssistantPolicy =
  | "never"
  | "confirmed"
  | "verified"
  | "confirmed_or_verified";

export interface InstalledHostWritebackConfig {
  allowAssistantOutput: InstalledHostWritebackAssistantPolicy;
  dryRun: boolean;
  maxChars: number;
  maxMessages: number;
  minConfidence: number;
  mode: InstalledHostWritebackMode;
  persistRawTranscript: false;
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
  contextMode?: InstalledHostContextMode;
  debug: boolean;
  enabled: boolean;
  maxTokens?: number;
  retrievalProfile?: "coding_agent" | "general_chat";
  workspaceId: string;
}

export const DEFAULT_INSTALLED_HOST_MAX_TOKENS = 256;
export const DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE = "coding_agent";
export const DEFAULT_INSTALLED_HOST_CONTEXT_MODE: InstalledHostContextMode =
  "fragment";
export const DEFAULT_INSTALLED_HOST_ACTIVATION_MODE = "workspace_opt_in";
export const DEFAULT_INSTALLED_HOST_AUTO_LEARN: InstalledHostAutoLearnConfig = {
  enabled: false,
  extractionStrategy: "auto",
  sources: ["user_prompt", "session_stop"],
};
export const DEFAULT_INSTALLED_HOST_WRITEBACK: InstalledHostWritebackConfig = {
  allowAssistantOutput: "confirmed_or_verified",
  dryRun: false,
  maxChars: 12_000,
  maxMessages: 12,
  minConfidence: 0.7,
  mode: "off",
  persistRawTranscript: false,
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

  const contextMode =
    parsed.contextMode === undefined
      ? DEFAULT_INSTALLED_HOST_CONTEXT_MODE
      : readContextMode(parsed.contextMode);
  if (contextMode === undefined) {
    return {
      detail: "contextMode must be fragment or progressive",
      status: "invalid",
    };
  }

  const writeback = readWritebackConfig({
    legacyAutoLearn: parsed.autoLearn,
    value: parsed.writeback,
  });
  if (writeback.status === "invalid") {
    return {
      detail: writeback.detail,
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
      contextMode,
      debug: parsed.debug === true,
      maxTokens,
      ...(providers.config ? { providers: providers.config } : {}),
      retrievalProfile,
      storage: {
        provider,
        url,
      },
      userId,
      writeback: writeback.config,
    },
  };
}

function readActivationMode(
  value: unknown,
): InstalledHostActivationMode | undefined {
  return value === "global" || value === "workspace_opt_in" ? value : undefined;
}

export function readContextMode(value: unknown): InstalledHostContextMode | undefined {
  return value === "fragment" || value === "progressive" ? value : undefined;
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

export function normalizeInstalledHostWritebackConfig(input: {
  legacyAutoLearn?: unknown;
  value?: unknown;
}): InstalledHostWritebackConfig {
  const parsed = readWritebackConfig(input);
  return parsed.status === "ok" ? parsed.config : DEFAULT_INSTALLED_HOST_WRITEBACK;
}

function readWritebackConfig(input: {
  legacyAutoLearn?: unknown;
  value?: unknown;
}):
  | { config: InstalledHostWritebackConfig; status: "ok" }
  | { detail: string; status: "invalid" } {
  if (input.value === undefined) {
    return {
      config: readLegacyAutoLearnWritebackConfig(input.legacyAutoLearn),
      status: "ok",
    };
  }
  if (!isRecord(input.value)) {
    return { detail: "writeback must be a JSON object", status: "invalid" };
  }

  const mode =
    input.value.mode === undefined
      ? DEFAULT_INSTALLED_HOST_WRITEBACK.mode
      : readWritebackMode(input.value.mode);
  if (mode === undefined) {
    return {
      detail: "writeback.mode must be off, observe, or selective",
      status: "invalid",
    };
  }

  const allowAssistantOutput =
    input.value.allowAssistantOutput === undefined
      ? DEFAULT_INSTALLED_HOST_WRITEBACK.allowAssistantOutput
      : readWritebackAssistantPolicy(input.value.allowAssistantOutput);
  if (allowAssistantOutput === undefined) {
    return {
      detail:
        "writeback.allowAssistantOutput must be never, confirmed, verified, or confirmed_or_verified",
      status: "invalid",
    };
  }

  if (
    input.value.persistRawTranscript !== undefined &&
    input.value.persistRawTranscript !== false
  ) {
    return {
      detail: "writeback.persistRawTranscript must be false",
      status: "invalid",
    };
  }
  if (
    input.value.dryRun !== undefined &&
    typeof input.value.dryRun !== "boolean"
  ) {
    return { detail: "writeback.dryRun must be a boolean", status: "invalid" };
  }

  const maxMessages =
    input.value.maxMessages === undefined
      ? DEFAULT_INSTALLED_HOST_WRITEBACK.maxMessages
      : readPositiveInteger(input.value.maxMessages);
  if (maxMessages === undefined) {
    return {
      detail: "writeback.maxMessages must be a positive integer",
      status: "invalid",
    };
  }

  const maxChars =
    input.value.maxChars === undefined
      ? DEFAULT_INSTALLED_HOST_WRITEBACK.maxChars
      : readPositiveInteger(input.value.maxChars);
  if (maxChars === undefined) {
    return {
      detail: "writeback.maxChars must be a positive integer",
      status: "invalid",
    };
  }

  const minConfidence =
    input.value.minConfidence === undefined
      ? DEFAULT_INSTALLED_HOST_WRITEBACK.minConfidence
      : readConfidence(input.value.minConfidence);
  if (minConfidence === undefined) {
    return {
      detail: "writeback.minConfidence must be a number between 0 and 1",
      status: "invalid",
    };
  }

  return {
    config: {
      allowAssistantOutput,
      dryRun: input.value.dryRun === true,
      maxChars,
      maxMessages,
      minConfidence,
      mode,
      persistRawTranscript: false,
    },
    status: "ok",
  };
}

function readLegacyAutoLearnWritebackConfig(
  value: unknown,
): InstalledHostWritebackConfig {
  const legacy = readAutoLearnConfig(value);
  if (legacy.status === "invalid") {
    return DEFAULT_INSTALLED_HOST_WRITEBACK;
  }

  return {
    ...DEFAULT_INSTALLED_HOST_WRITEBACK,
    mode: legacy.config.enabled ? "selective" : "off",
  };
}

export function readWritebackMode(
  value: unknown,
): InstalledHostWritebackMode | undefined {
  return value === "off" || value === "observe" || value === "selective"
    ? value
    : undefined;
}

function readWritebackAssistantPolicy(
  value: unknown,
): InstalledHostWritebackAssistantPolicy | undefined {
  return value === "never" ||
    value === "confirmed" ||
    value === "verified" ||
    value === "confirmed_or_verified"
    ? value
    : undefined;
}

function readConfidence(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
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

  const contextMode = readOptionalContextMode(parsed.contextMode);
  if (parsed.contextMode !== undefined && contextMode === undefined) {
    return {
      detail: "contextMode must be fragment or progressive",
      status: "invalid",
    };
  }

  const enabled = parsed.enabled !== false;
  return {
    status: enabled ? "ok" : "disabled",
    config: {
      debug: parsed.debug === true,
      enabled,
      contextMode,
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

export function readOptionalContextMode(
  value: unknown,
): InstalledHostContextMode | undefined {
  return value === undefined ? undefined : readContextMode(value);
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
