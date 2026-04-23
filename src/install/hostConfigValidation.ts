import { resolveWorkspaceId } from "../host/managedFiles";

export type InstalledHostConfigTarget = "claude" | "codex";

export interface InstalledHostRuntimeConfig {
  debug: boolean;
  maxTokens: number;
  retrievalProfile: "coding_agent" | "general_chat";
  storage: {
    provider: "memory" | "postgres" | "sqlite";
    url: string;
  };
  userId: string;
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

  return {
    status: "ok",
    config: {
      debug: parsed.debug === true,
      maxTokens,
      retrievalProfile,
      storage: {
        provider,
        url,
      },
      userId,
    },
  };
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
