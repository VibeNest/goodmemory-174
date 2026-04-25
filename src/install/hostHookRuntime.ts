import type { MemoryScope } from "../domain/scope";
import type { RecallResult } from "../api/contracts";
import {
  normalizeText,
  readOptionalText,
} from "./hostConfigValidation";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
} from "./hostExecutionContext";
import type { InstalledHostContextDependencies } from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";
import { recordInstalledHostWritebackRecallHits } from "./hostWritebackAuditRuntime";
import { executeInstalledHostWriteback } from "./hostWritebackRuntime";
import type { InstalledHostWritebackResult } from "./hostWritebackRuntime";

export type InstalledHostHookCommand =
  | "session-start"
  | "session-stop"
  | "user-prompt-submit";

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
    | "recall_failed"
    | "writeback_failed"
    | "writeback_written";
  scope: MemoryScope | null;
  writeback: InstalledHostHookWritebackResult;
}

export interface InstalledHostHookWritebackResult {
  candidateCount: number;
  attempted: boolean;
  mode?: InstalledHostWritebackResult["mode"];
  reason:
    | "disabled"
    | "duplicate"
    | "empty_content"
    | "failed"
    | "no_candidates"
    | "observed"
    | "source_disabled"
    | "written";
  wrote: boolean;
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

  if (input.command === "session-stop") {
    const writeback = await executeInstalledHostWriteback(
      {
        command: "session-end",
        homeRoot: input.homeRoot,
        host: input.host,
        payload: input.payload,
      },
      dependencies,
    );

    return {
      applied: false,
      context: null,
      output: null,
      query: null,
      reason:
        writeback.reason === "written"
          ? "writeback_written"
          : writeback.reason === "write_failed" ||
              writeback.reason === "audit_failed"
            ? "writeback_failed"
            : "empty_context",
      scope: resolved.context.scope,
      writeback: summarizeHookWriteback(writeback),
    };
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
    await recordInstalledHostWritebackRecallHits({
      homeRoot: input.homeRoot,
      host: input.host,
      recalledRecordIds: collectRecallRecordIds(recall),
      scope: context.scope,
      sessionId: context.scope.sessionId,
    }).catch(() => undefined);

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
      writeback: {
        attempted: false,
        candidateCount: 0,
        reason: "source_disabled",
        wrote: false,
      },
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
    writeback: {
      attempted: false,
      candidateCount: 0,
      reason: "disabled",
      wrote: false,
    },
  };
}

function deriveHookQuery(
  command: InstalledHostHookCommand,
  payload: Record<string, unknown>,
): string | null {
  if (command === "user-prompt-submit") {
    return normalizeText(readOptionalText(payload, "prompt"));
  }

  if (command === "session-stop") {
    return null;
  }

  const source = normalizeText(readOptionalText(payload, "source")) ?? "startup";
  return source === "resume"
    ? "What continuity, active context, and open loops should I resume for this coding session?"
    : "What active context, continuity, and open loops should I know at the start of this coding session?";
}

function mapHookEventName(
  command: InstalledHostHookCommand,
): "SessionStart" | "Stop" | "UserPromptSubmit" {
  if (command === "session-start") {
    return "SessionStart";
  }
  return command === "session-stop" ? "Stop" : "UserPromptSubmit";
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function collectRecallRecordIds(recall: RecallResult): string[] {
  const ids = new Set<string>();
  for (const record of [
    ...recall.preferences,
    ...recall.references,
    ...recall.facts,
    ...recall.feedback,
    ...recall.evidence,
    ...recall.episodes,
    ...recall.archives,
  ]) {
    ids.add(record.id);
  }
  for (const hit of recall.metadata.hits) {
    ids.add(hit.id);
    for (const evidenceId of hit.evidenceIds ?? []) {
      ids.add(evidenceId);
    }
  }
  for (const trace of recall.metadata.candidateTraces) {
    if (!trace.returned) {
      continue;
    }
    ids.add(trace.memoryId);
    for (const evidenceId of trace.evidenceIds ?? []) {
      ids.add(evidenceId);
    }
  }
  return [...ids];
}

function summarizeHookWriteback(
  result: InstalledHostWritebackResult,
): InstalledHostHookWritebackResult {
  if (result.reason === "disabled") {
    return {
      attempted: false,
      candidateCount: 0,
      mode: result.mode,
      reason: "disabled",
      wrote: false,
    };
  }
  if (result.reason === "empty_transcript") {
    return {
      attempted: false,
      candidateCount: 0,
      mode: result.mode,
      reason: "empty_content",
      wrote: false,
    };
  }
  if (result.reason === "write_failed" || result.reason === "audit_failed") {
    return {
      attempted: true,
      candidateCount: result.candidates.length,
      mode: result.mode,
      reason: "failed",
      wrote: result.wrote,
    };
  }

  return {
    attempted: result.applied,
    candidateCount: result.candidates.length,
    mode: result.mode,
    reason:
      result.reason === "written"
        ? "written"
        : result.reason === "observed"
          ? "observed"
          : result.reason === "no_candidates"
            ? "no_candidates"
            : "source_disabled",
    wrote: result.wrote,
  };
}
