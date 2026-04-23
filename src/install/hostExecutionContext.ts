import { resolve } from "node:path";
import { createGoodMemory } from "../api/createGoodMemory";
import type {
  GoodMemory,
  GoodMemoryConfig,
} from "../api/contracts";
import { normalizeScope } from "../domain/scope";
import type { MemoryScope } from "../domain/scope";
import {
  DEFAULT_INSTALLED_HOST_MAX_TOKENS,
  DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE,
} from "./hostConfigValidation";
import type { InstalledHostKind } from "./hostInstall";
import {
  readInstalledHostDebug,
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
  debug: boolean;
  host: InstalledHostKind;
  maxTokens: number;
  retrievalProfile: "coding_agent" | "general_chat";
  scope: MemoryScope;
  storage: GoodMemoryConfig["storage"];
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
  const repoConfig = await readWorkspaceHostOptInConfig(
    input.host,
    workspaceRoot,
    dependencies,
  );
  if (repoConfig.status !== "ok") {
    const globalDebug =
      repoConfig.status === "disabled"
        ? await readInstalledHostDebug(input.host, input.homeRoot, dependencies)
        : false;
    return {
      debug:
        (repoConfig.status === "disabled" ? repoConfig.config.debug : false) ||
        globalDebug,
      status:
        repoConfig.status === "disabled"
          ? "disabled"
          : repoConfig.status === "invalid"
            ? "invalid_repo_config"
            : "missing_repo_config",
      workspaceRoot,
    };
  }

  const globalConfig = await readInstalledHostRuntimeConfig(
    input.host,
    input.homeRoot,
    dependencies,
  );
  if (globalConfig.status !== "ok") {
    return {
      debug: repoConfig.config.debug,
      status:
        globalConfig.status === "invalid"
          ? "invalid_global_config"
          : "missing_global_config",
      workspaceRoot,
    };
  }

  return {
    status: "ok",
    context: {
      debug: globalConfig.config.debug || repoConfig.config.debug,
      host: input.host,
      maxTokens:
        input.maxTokens ??
        repoConfig.config.maxTokens ??
        globalConfig.config.maxTokens ??
        DEFAULT_INSTALLED_HOST_MAX_TOKENS,
      retrievalProfile:
        input.retrievalProfile ??
        repoConfig.config.retrievalProfile ??
        globalConfig.config.retrievalProfile ??
        DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE,
      scope: normalizeScope({
        agentId: input.host,
        sessionId: input.sessionId,
        userId: globalConfig.config.userId,
        workspaceId: repoConfig.config.workspaceId,
      }),
      storage: {
        provider: globalConfig.config.storage.provider,
        url: globalConfig.config.storage.url,
      },
      workspaceRoot,
    },
  };
}

export function createInstalledHostMemory(
  context: InstalledHostResolvedContext,
  dependencies: InstalledHostContextDependencies = {},
): GoodMemory {
  return (dependencies.createMemory ?? createGoodMemory)({
    storage: context.storage,
  });
}
