import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
  normalizeText,
  parseInstalledHostRuntimeConfig,
  parseWorkspaceHostOptInConfig,
  readOptionalText,
} from "./hostConfigValidation";
import type { InstalledHostKind } from "./hostInstall";

export type InstalledHostHookCommand = "session-start" | "user-prompt-submit";

export interface InstalledHostHookDependencies {
  createMemory?: (config: GoodMemoryConfig) => GoodMemory;
  readFile?: (path: string) => Promise<string>;
}

export interface InstalledHostHookExecutionInput {
  command: InstalledHostHookCommand;
  host: InstalledHostKind;
  homeRoot?: string;
  payload: Record<string, unknown>;
}

export interface InstalledHostHookExecutionResult {
  applied: boolean;
  context: string | null;
  maxTokens?: number;
  output: Record<string, unknown> | null;
  query: string | null;
  reason:
    | "applied"
    | "disabled"
    | "empty_context"
    | "empty_prompt"
    | "invalid_global_config"
    | "invalid_repo_config"
    | "missing_global_config"
    | "missing_repo_config"
    | "recall_failed";
  scope: MemoryScope | null;
}

const DEFAULT_MAX_TOKENS = DEFAULT_INSTALLED_HOST_MAX_TOKENS;
const DEFAULT_RETRIEVAL_PROFILE = DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE;
const MAX_HOOK_CONTEXT_CHARS = 10_000;

export async function executeInstalledHostHook(
  input: InstalledHostHookExecutionInput,
  dependencies: InstalledHostHookDependencies = {},
): Promise<InstalledHostHookExecutionResult> {
  const workspaceRoot = resolve(readOptionalText(input.payload, "cwd") ?? ".");
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
    return buildHookSkipResult({
      debug:
        (repoConfig.status === "disabled" ? repoConfig.config.debug : false) ||
        globalDebug,
      host: input.host,
      reason:
        repoConfig.status === "missing"
          ? "missing_repo_config"
          : repoConfig.status === "invalid"
            ? "invalid_repo_config"
            : "disabled",
      command: input.command,
    });
  }

  const globalConfig = await readInstalledHostRuntimeConfig(
    input.host,
    input.homeRoot,
    dependencies,
  );
  if (globalConfig.status !== "ok") {
    return buildHookSkipResult({
      debug: repoConfig.config.debug,
      host: input.host,
      reason:
        globalConfig.status === "missing"
          ? "missing_global_config"
          : "invalid_global_config",
      command: input.command,
    });
  }

  const query = deriveHookQuery(input.command, input.payload);
  if (!query) {
    return buildHookSkipResult({
      debug: globalConfig.config.debug || repoConfig.config.debug,
      host: input.host,
      reason: "empty_prompt",
      command: input.command,
    });
  }

  const retrievalProfile =
    repoConfig.config.retrievalProfile ??
    globalConfig.config.retrievalProfile ??
    DEFAULT_RETRIEVAL_PROFILE;
  const maxTokens =
    repoConfig.config.maxTokens ??
    globalConfig.config.maxTokens ??
    DEFAULT_MAX_TOKENS;
  const scope = normalizeScope({
    userId: globalConfig.config.userId,
    workspaceId: repoConfig.config.workspaceId,
    agentId: input.host,
    sessionId: readOptionalText(input.payload, "session_id"),
  });

  try {
    const memory = (dependencies.createMemory ?? createGoodMemory)({
      storage: {
        provider: globalConfig.config.storage.provider,
        url: globalConfig.config.storage.url,
      },
    });
    const recall = await memory.recall({
      scope,
      query,
      retrievalProfile,
    });
    const context = await memory.buildContext({
      recall,
      output: "developer_prompt_fragment",
      maxTokens,
    });
    const fragment = normalizeText(context.content);
    if (!fragment) {
      return buildHookSkipResult({
        debug: globalConfig.config.debug || repoConfig.config.debug,
        host: input.host,
        reason: "empty_context",
        command: input.command,
        maxTokens,
        query,
        scope,
      });
    }

    const boundedContext = clampText(fragment, MAX_HOOK_CONTEXT_CHARS);
    return {
      applied: true,
      context: boundedContext,
      maxTokens,
      output: {
        hookSpecificOutput: {
          hookEventName: mapHookEventName(input.command),
          additionalContext: boundedContext,
        },
      },
      query,
      reason: "applied",
      scope,
    };
  } catch {
    return buildHookSkipResult({
      debug: globalConfig.config.debug || repoConfig.config.debug,
      host: input.host,
      reason: "recall_failed",
      command: input.command,
      maxTokens,
      query,
      scope,
    });
  }
}

function buildHookSkipResult(input: {
  command: InstalledHostHookCommand;
  debug: boolean;
  host: InstalledHostKind;
  maxTokens?: number;
  query?: string | null;
  reason: InstalledHostHookExecutionResult["reason"];
  scope?: MemoryScope | null;
}): InstalledHostHookExecutionResult {
  return {
    applied: false,
    context: null,
    maxTokens: input.maxTokens,
    output: input.debug
      ? {
          systemMessage: `GoodMemory ${input.host} ${input.command} hook skipped: ${input.reason}.`,
        }
      : null,
    query: input.query ?? null,
    reason: input.reason,
    scope: input.scope ?? null,
  };
}

function deriveHookQuery(
  command: InstalledHostHookCommand,
  payload: Record<string, unknown>,
): string | null {
  if (command === "user-prompt-submit") {
    return normalizeText(readOptionalText(payload, "prompt"));
  }

  const source = normalizeText(readOptionalText(payload, "source")) ?? "startup";
  return source === "resume"
    ? "What continuity, active context, and open loops should I resume for this coding session?"
    : "What active context, continuity, and open loops should I know at the start of this coding session?";
}

function mapHookEventName(command: InstalledHostHookCommand): "SessionStart" | "UserPromptSubmit" {
  return command === "session-start" ? "SessionStart" : "UserPromptSubmit";
}

async function readInstalledHostRuntimeConfig(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  dependencies: InstalledHostHookDependencies,
): Promise<
  | ReturnType<typeof parseInstalledHostRuntimeConfig>
  | { status: "invalid" | "missing" }
> {
  const text = await readFileIfPresent(
    join(resolveInstallRoot(homeRoot), `${host}.json`),
    dependencies,
  );
  if (text === null || text.trim().length === 0) {
    return { status: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "invalid" };
  }
  return parseInstalledHostRuntimeConfig(parsed, host);
}

async function readInstalledHostDebug(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  dependencies: InstalledHostHookDependencies,
): Promise<boolean> {
  const config = await readInstalledHostRuntimeConfig(host, homeRoot, dependencies);
  return config.status === "ok" ? config.config.debug : false;
}

async function readWorkspaceHostOptInConfig(
  host: InstalledHostKind,
  workspaceRoot: string,
  dependencies: InstalledHostHookDependencies,
): Promise<
  | ReturnType<typeof parseWorkspaceHostOptInConfig>
  | { status: "invalid" | "missing" }
> {
  const text = await readFileIfPresent(
    join(workspaceRoot, ".goodmemory", `${host}.json`),
    dependencies,
  );
  if (text === null || text.trim().length === 0) {
    return { status: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "invalid" };
  }
  return parseWorkspaceHostOptInConfig(parsed, host, workspaceRoot);
}

function resolveInstallRoot(homeRoot: string | undefined): string {
  const resolvedHome = resolve(
    homeRoot ?? process.env.GOODMEMORY_HOME ?? homedir(),
  );
  return join(resolvedHome, ".goodmemory");
}

async function readFileIfPresent(
  path: string,
  dependencies: InstalledHostHookDependencies,
): Promise<string | null> {
  try {
    return await (dependencies.readFile ?? defaultReadFile)(path);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function defaultReadFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
