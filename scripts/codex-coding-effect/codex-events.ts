export interface CodexEvent {
  data: Record<string, unknown>;
  sourceEventIndex: number;
  type: string;
}

export interface CodexFailureEvent {
  message: string;
  sourceEventIndex: number;
  type: string;
}

export interface NormalizedCodexCommand {
  command: string;
  exitCode: number | null;
  sourceEventIndex: number;
  status: string;
}

export interface NormalizedCodexFileChange {
  kind: string;
  path: string;
  sourceEventIndex: number;
}

export interface NormalizedCodexUsage {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface NormalizedCodexEvents {
  commands: NormalizedCodexCommand[];
  fileChanges: NormalizedCodexFileChange[];
  finalMessage: string | null;
  finalMessageEventIndex: number | null;
  threadId: string | null;
  threadStartedEventIndex: number | null;
  usage: NormalizedCodexUsage | null;
  usageEventIndex: number | null;
}

export function parseCodexJsonl(raw: string): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const [lineIndex, line] of raw.split(/\r?\n/u).entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`invalid Codex JSONL at line ${lineIndex + 1}`);
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      throw new Error(`invalid Codex event shape at line ${lineIndex + 1}`);
    }
    events.push({
      data: parsed,
      sourceEventIndex: events.length,
      type: parsed.type,
    });
  }
  return events;
}

export function normalizeCodexEvents(
  events: readonly CodexEvent[],
): NormalizedCodexEvents {
  const commands: NormalizedCodexCommand[] = [];
  const fileChanges: NormalizedCodexFileChange[] = [];
  let finalMessage: string | null = null;
  let finalMessageEventIndex: number | null = null;
  let threadId: string | null = null;
  let threadStartedEventIndex: number | null = null;
  let usage: NormalizedCodexUsage | null = null;
  let usageEventIndex: number | null = null;

  for (const event of events) {
    if (
      event.type === "thread.started" &&
      typeof event.data.thread_id === "string"
    ) {
      threadId = event.data.thread_id;
      threadStartedEventIndex = event.sourceEventIndex;
      continue;
    }

    if (event.type === "turn.completed" && isRecord(event.data.usage)) {
      const inputTokens = numberValue(event.data.usage.input_tokens);
      const cachedInputTokens = numberValue(
        event.data.usage.cached_input_tokens,
      );
      const outputTokens = numberValue(event.data.usage.output_tokens);
      if (
        inputTokens !== null &&
        cachedInputTokens !== null &&
        outputTokens !== null
      ) {
        usage = { cachedInputTokens, inputTokens, outputTokens };
        usageEventIndex = event.sourceEventIndex;
      }
      continue;
    }

    if (event.type !== "item.completed" || !isRecord(event.data.item)) {
      continue;
    }
    const item = event.data.item;
    if (
      item.type === "command_execution" &&
      typeof item.command === "string"
    ) {
      commands.push({
        command: item.command,
        exitCode: numberValue(item.exit_code),
        sourceEventIndex: event.sourceEventIndex,
        status: typeof item.status === "string" ? item.status : "unknown",
      });
      continue;
    }
    if (item.type === "file_change" && Array.isArray(item.changes)) {
      for (const change of item.changes) {
        if (
          isRecord(change) &&
          typeof change.kind === "string" &&
          typeof change.path === "string"
        ) {
          fileChanges.push({
            kind: change.kind,
            path: change.path,
            sourceEventIndex: event.sourceEventIndex,
          });
        }
      }
      continue;
    }
    if (item.type === "agent_message" && typeof item.text === "string") {
      finalMessage = item.text;
      finalMessageEventIndex = event.sourceEventIndex;
    }
  }

  return {
    commands,
    fileChanges,
    finalMessage,
    finalMessageEventIndex,
    threadId,
    threadStartedEventIndex,
    usage,
    usageEventIndex,
  };
}

export function extractCodexFailureEvents(
  events: readonly CodexEvent[],
): CodexFailureEvent[] {
  return events.flatMap((event) => {
    if (!/(?:failed|error)/iu.test(event.type)) {
      return [];
    }
    const error = isRecord(event.data.error) ? event.data.error : null;
    const message = typeof error?.message === "string"
      ? error.message
      : typeof event.data.error === "string"
      ? event.data.error
      : typeof event.data.message === "string"
      ? event.data.message
      : event.type;
    return [{
      message: message.replace(/\s+/gu, " ").trim().slice(0, 1_000),
      sourceEventIndex: event.sourceEventIndex,
      type: event.type,
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
