import type { MemoryScope } from "../domain/scope";
import {
  normalizeText,
  readOptionalText,
} from "./hostConfigValidation";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
  type InstalledHostContextDependencies,
} from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";

export type InstalledHostHookCommand = "session-start" | "user-prompt-submit";

export interface InstalledHostHookDependencies
  extends InstalledHostContextDependencies {}

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

const MAX_HOOK_CONTEXT_CHARS = 10_000;

export async function executeInstalledHostHook(
  input: InstalledHostHookExecutionInput,
  dependencies: InstalledHostHookDependencies = {},
): Promise<InstalledHostHookExecutionResult> {
  const resolved = await resolveInstalledHostContext(
    {
      cwd: readOptionalText(input.payload, "cwd"),
      homeRoot: input.homeRoot,
      host: input.host,
      sessionId: readOptionalText(input.payload, "session_id"),
    },
    dependencies,
  );
  if (resolved.status !== "ok") {
    return buildHookSkipResult({
      debug: resolved.debug,
      host: input.host,
      reason: resolved.status,
      command: input.command,
    });
  }

  const query = deriveHookQuery(input.command, input.payload);
  if (!query) {
    return buildHookSkipResult({
      debug: resolved.context.debug,
      host: input.host,
      reason: "empty_prompt",
      command: input.command,
    });
  }

  const context = resolved.context;

  try {
    const memory = createInstalledHostMemory(context, dependencies);
    const recall = await memory.recall({
      scope: context.scope,
      query,
      retrievalProfile: context.retrievalProfile,
    });
    const builtContext = await memory.buildContext({
      recall,
      output: "developer_prompt_fragment",
      maxTokens: resolved.context.maxTokens,
    });
    const fragment = normalizeText(builtContext.content);
    if (!fragment) {
      return buildHookSkipResult({
        debug: resolved.context.debug,
        host: input.host,
        reason: "empty_context",
        command: input.command,
        maxTokens: resolved.context.maxTokens,
        query,
        scope: resolved.context.scope,
      });
    }

    const boundedContext = clampText(fragment, MAX_HOOK_CONTEXT_CHARS);
    return {
      applied: true,
      context: boundedContext,
      maxTokens: resolved.context.maxTokens,
      output: {
        hookSpecificOutput: {
          hookEventName: mapHookEventName(input.command),
          additionalContext: boundedContext,
        },
      },
      query,
      reason: "applied",
      scope: resolved.context.scope,
    };
  } catch {
    return buildHookSkipResult({
      debug: resolved.context.debug,
      host: input.host,
      reason: "recall_failed",
      command: input.command,
      maxTokens: resolved.context.maxTokens,
      query,
      scope: resolved.context.scope,
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

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
