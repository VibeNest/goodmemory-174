import {
  normalizeCodexEvents,
  parseCodexJsonl,
} from "./codex-events";
import type {
  CodexEvent,
  NormalizedCodexEvents,
} from "./codex-events";
import type { CodexCodingEffectLogger } from "./logging";
import { runBoundaryProcess } from "./process";

export type CodexRunStatus =
  | "completed"
  | "event-parse-failed"
  | "missing-final-message"
  | "non-zero-exit"
  | "not-started"
  | "spawn-failed"
  | "timed-out";

export interface CodexRunRequest {
  args: readonly string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  executable: string;
  logger?: CodexCodingEffectLogger;
  timeoutMs: number;
}

export interface CodexRunResult {
  durationMs: number;
  eventParseError?: string;
  events: CodexEvent[];
  exitCode: number | null;
  normalized: NormalizedCodexEvents | null;
  status: CodexRunStatus;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

export async function runCodexProcess(
  request: CodexRunRequest,
): Promise<CodexRunResult> {
  request.logger?.("codex_process_started", {
    argumentCount: request.args.length,
    executable: request.executable,
  });
  const processResult = await runBoundaryProcess(request);
  const processStatus = processResult.spawnError !== undefined
    ? "spawn-failed"
    : processResult.timedOut
    ? "timed-out"
    : null;

  request.logger?.("codex_process_exited", {
    durationMs: processResult.durationMs,
    exitCode: processResult.exitCode,
    status: processStatus ?? "exited",
    timedOut: processResult.timedOut,
  });

  if (processStatus !== null) {
    return {
      durationMs: processResult.durationMs,
      events: [],
      exitCode: processResult.exitCode,
      normalized: null,
      status: processStatus,
      stderr: processResult.stderr,
      stdout: processResult.stdout,
      timedOut: processResult.timedOut,
    };
  }

  let events: CodexEvent[];
  let normalized: NormalizedCodexEvents;
  try {
    events = parseCodexJsonl(processResult.stdout);
    normalized = normalizeCodexEvents(events);
  } catch (error) {
    const eventParseError = error instanceof Error ? error.message : String(error);
    request.logger?.("codex_event_parse_failed", { error: eventParseError });
    return {
      durationMs: processResult.durationMs,
      eventParseError,
      events: [],
      exitCode: processResult.exitCode,
      normalized: null,
      status: processResult.exitCode === 0
        ? "event-parse-failed"
        : "non-zero-exit",
      stderr: processResult.stderr,
      stdout: processResult.stdout,
      timedOut: false,
    };
  }

  const status: CodexRunStatus = processResult.exitCode !== 0
    ? "non-zero-exit"
    : normalized.finalMessage === null
    ? "missing-final-message"
    : "completed";
  return {
    durationMs: processResult.durationMs,
    events,
    exitCode: processResult.exitCode,
    normalized,
    status,
    stderr: processResult.stderr,
    stdout: processResult.stdout,
    timedOut: false,
  };
}
