import { resolve } from "node:path";
import { createGoodMemory } from "../api/createGoodMemory";
import type {
  GoodMemory,
  GoodMemoryConfig,
} from "../api/contracts";
import { normalizeScope } from "../domain/scope";
import type { MemoryScope } from "../domain/scope";
import { resolveWorkspaceId } from "../host/managedFiles";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
} from "../provider/layer";
import {
  DEFAULT_INSTALLED_HOST_MAX_TOKENS,
  DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE,
} from "./hostConfigValidation";
import type {
  InstalledHostActivationMode,
  InstalledHostProviderConfig,
  InstalledHostWritebackConfig,
  WorkspaceHostOptInConfig,
} from "./hostConfigValidation";
import type { InstalledHostKind } from "./hostInstall";
import {
  readInstalledHostRuntimeConfig,
  readWorkspaceHostOptInConfig,
  type InstalledHostRuntimeConfigDependencies,
} from "./hostRuntimeConfig";

export interface InstalledHostContextDependencies
  extends InstalledHostRuntimeConfigDependencies {
  createMemory?: (config: GoodMemoryConfig) => GoodMemory;
}

export interface InstalledHostContextInput {
  cwd?: string;
  homeRoot?: string;
  host: InstalledHostKind;
  maxTokens?: number;
  retrievalProfile?: "coding_agent" | "general_chat";
  sessionId?: string;
}

export interface InstalledHostResolvedContext {
  activationMode: InstalledHostActivationMode;
  debug: boolean;
  host: InstalledHostKind;
  maxTokens: number;
  providers?: InstalledHostProviderConfig;
  retrievalProfile: "coding_agent" | "general_chat";
  scope: MemoryScope;
  storage: GoodMemoryConfig["storage"];
  writeback: InstalledHostWritebackConfig;
  workspaceRoot: string;
}

export type InstalledHostContextResolution =
  | {
      context: InstalledHostResolvedContext;
      status: "ok";
    }
  | {
      debug: boolean;
      status:
        | "disabled"
        | "invalid_global_config"
        | "invalid_repo_config"
        | "missing_global_config"
        | "missing_repo_config";
      workspaceRoot: string;
    };

export async function resolveInstalledHostContext(
  input: InstalledHostContextInput,
  dependencies: InstalledHostContextDependencies = {},
): Promise<InstalledHostContextResolution> {
  const workspaceRoot = resolve(input.cwd ?? ".");
  const globalConfig = await readInstalledHostRuntimeConfig(
    input.host,
    input.homeRoot,
    dependencies,
  );
  if (globalConfig.status !== "ok") {
    return {
      debug: false,
      status:
        globalConfig.status === "invalid"
          ? "invalid_global_config"
          : "missing_global_config",
      workspaceRoot,
    };
  }

  const repoConfig = await readWorkspaceHostOptInConfig(
    input.host,
    workspaceRoot,
    dependencies,
  );
  if (repoConfig.status === "invalid") {
    return {
      debug: globalConfig.config.debug,
      status: "invalid_repo_config",
      workspaceRoot,
    };
  }
  if (repoConfig.status === "disabled") {
    return {
      debug: repoConfig.config.debug || globalConfig.config.debug,
      status: "disabled",
      workspaceRoot,
    };
  }
  if (
    repoConfig.status === "missing" &&
    globalConfig.config.activationMode !== "global"
  ) {
    return {
      debug: globalConfig.config.debug,
      status: "missing_repo_config",
      workspaceRoot,
    };
  }

  const workspaceConfig =
    repoConfig.status === "ok"
      ? repoConfig.config
      : createGlobalWorkspaceConfig(workspaceRoot);

  return {
    status: "ok",
    context: {
      activationMode: globalConfig.config.activationMode,
      debug: globalConfig.config.debug || workspaceConfig.debug,
      host: input.host,
      maxTokens:
        input.maxTokens ??
        workspaceConfig.maxTokens ??
        globalConfig.config.maxTokens ??
        DEFAULT_INSTALLED_HOST_MAX_TOKENS,
      retrievalProfile:
        input.retrievalProfile ??
        workspaceConfig.retrievalProfile ??
        globalConfig.config.retrievalProfile ??
        DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE,
      ...(globalConfig.config.providers
        ? { providers: globalConfig.config.providers }
        : {}),
      scope: normalizeScope({
        agentId: input.host,
        sessionId: input.sessionId,
        userId: globalConfig.config.userId,
        workspaceId: workspaceConfig.workspaceId,
      }),
      storage: {
        provider: globalConfig.config.storage.provider,
        url: globalConfig.config.storage.url,
      },
      writeback: globalConfig.config.writeback,
      workspaceRoot,
    },
  };
}

function createGlobalWorkspaceConfig(workspaceRoot: string): WorkspaceHostOptInConfig {
  return {
    debug: false,
    enabled: true,
    workspaceId: resolveWorkspaceId(workspaceRoot, undefined),
  };
}

export function createInstalledHostMemory(
  context: InstalledHostResolvedContext,
  dependencies: InstalledHostContextDependencies = {},
): GoodMemory {
  const adapters = buildInstalledHostProviderAdapters(context.providers);
  return (dependencies.createMemory ?? createGoodMemory)({
    ...(adapters ? { adapters } : {}),
    remember: {
      preset: "coding_agent",
      profiles: [
        {
          assistantOutputs: {
            mode: mapWritebackAssistantPolicy(context.writeback.allowAssistantOutput),
          },
          extends: "coding_agent",
          id: `installed-host-${context.host}-writeback`,
          when: {
            agentId: context.host,
          },
        },
      ],
    },
    storage: context.storage,
  });
}

function mapWritebackAssistantPolicy(
  policy: InstalledHostWritebackConfig["allowAssistantOutput"],
):
  | "confirmed_only"
  | "confirmed_or_verified_only"
  | "ignore"
  | "verified_only" {
  if (policy === "confirmed") {
    return "confirmed_only";
  }
  if (policy === "verified") {
    return "verified_only";
  }
  if (policy === "confirmed_or_verified") {
    return "confirmed_or_verified_only";
  }

  return "ignore";
}

function buildInstalledHostProviderAdapters(
  providers: InstalledHostProviderConfig | undefined,
): GoodMemoryConfig["adapters"] | undefined {
  if (!providers?.embedding && !providers?.assistedExtractor) {
    return undefined;
  }

  return {
    ...(providers.embedding
      ? {
          embeddingAdapter: createProviderEmbeddingAdapter({
            model: providers.embedding,
          }),
        }
      : {}),
    ...(providers.assistedExtractor
      ? {
          assistedExtractor: createProviderMemoryExtractor({
            model: providers.assistedExtractor,
          }),
        }
      : {}),
  };
}
