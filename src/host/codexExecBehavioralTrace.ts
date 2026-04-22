import type { BehavioralFirstAction } from "../evolution/behavioralTelemetry";
import {
  type HostBehavioralTrace,
  validateBehavioralTrace,
} from "./behavioralTrace";

export interface CodexExecEventItem {
  aggregated_output?: string;
  command?: string;
  exit_code?: number | null;
  id?: string;
  status?: string;
  text?: string;
  type?: string;
}

export interface CodexExecEvent {
  item?: CodexExecEventItem;
  thread_id?: string;
  type?: string;
  usage?: Record<string, unknown>;
}

export interface CodexExecTurn {
  events: CodexExecEvent[];
  stderr: string;
  stdout: string;
  timedOut?: boolean;
  timeoutMessage?: string;
}

export interface CodexExecRuntimeResolutionInput {
  env?: NodeJS.ProcessEnv;
  processExecPath?: string;
  which?: (binary: string) => string | null | undefined;
}

export interface CodexExecRuntimeResolution {
  codexBinary: string;
  nodeBinary: string;
}

interface CodexCommandExecution {
  aggregatedOutput: string;
  command: string;
  completedEventIndex?: number;
  eventId: string;
  exitCode?: number | null;
  startedEventIndex: number;
  status?: string;
  timedOut: boolean;
}

interface CodexWarningMessage {
  eventIndex: number;
  turnId?: string;
  text: string;
}

interface CodexCommandTraceActionCandidate {
  actionKind: "command" | "tool_call";
  args?: string[];
  command: string;
  evidenceExcerpt?: string;
  eventIndex: number;
  kind: "command";
  name: string;
  outcome: "failure" | "success" | "timeout";
  raw?: string;
  turnId?: string;
}

interface CodexWarningTraceActionCandidate {
  args?: string[];
  eventIndex: number;
  kind: "warning";
  name: string;
  raw?: string;
  turnId?: string;
}

type CodexTraceActionCandidate =
  | CodexCommandTraceActionCandidate
  | CodexWarningTraceActionCandidate;

export interface BuildCodexBehavioralTraceInput {
  cue: string;
  parseCommandAction: (command: string) => BehavioralFirstAction | undefined;
  parseWarningAction: (warningText: string) => BehavioralFirstAction | undefined;
  traceId: string;
  turn: CodexExecTurn;
}

export interface BuildCodexBehavioralTraceResult {
  answer: string;
  trace: HostBehavioralTrace | null;
}

function normalizePathBinary(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCodexExecRuntime(
  input: CodexExecRuntimeResolutionInput = {},
): CodexExecRuntimeResolution {
  const env = input.env ?? process.env;
  const which = input.which ?? Bun.which;
  const codexBinary = normalizePathBinary(env.GOODMEMORY_CODEX_BINARY) ?? which("codex");

  if (!codexBinary) {
    throw new Error(
      [
        "Could not resolve the Codex binary for native host execution.",
        "Set GOODMEMORY_CODEX_BINARY or make `codex` available on PATH.",
      ].join(" "),
    );
  }

  const nodeBinary = normalizePathBinary(env.GOODMEMORY_NODE_BINARY) ??
    normalizePathBinary(input.processExecPath ?? process.execPath);
  if (!nodeBinary) {
    throw new Error(
      [
        "Could not resolve the Node.js binary for native Codex host execution.",
        "Set GOODMEMORY_NODE_BINARY or run the phase from a Node/Bun runtime with process.execPath.",
      ].join(" "),
    );
  }

  return {
    codexBinary,
    nodeBinary,
  };
}

export function parseCodexExecEventLine(line: string): CodexExecEvent | null {
  try {
    return JSON.parse(line) as CodexExecEvent;
  } catch {
    return null;
  }
}

export function unwrapCodexShellCommand(command: string): string {
  const trimmed = command.trim();
  const match = /^\/bin\/(?:ba|z)?sh\s+-lc\s+([\s\S]+)$/u.exec(trimmed);

  if (!match) {
    return trimmed;
  }

  const wrapped = match[1].trim();
  const quoted = /^(['"])([\s\S]+)\1$/u.exec(wrapped);
  const unwrapped = quoted ? quoted[2] : wrapped;

  return unwrapped.replace(/\\"/gu, "\"").trim();
}

function resolveCommandOutcome(
  execution: CodexCommandExecution,
): "failure" | "success" | "timeout" {
  if (execution.timedOut) {
    return "timeout";
  }

  if (execution.status === "completed" && execution.exitCode === 0) {
    return "success";
  }

  return "failure";
}

function collectCodexCommandExecutions(
  turn: CodexExecTurn,
): CodexCommandExecution[] {
  const executions = new Map<string, CodexCommandExecution>();

  for (const [eventIndex, event] of turn.events.entries()) {
    const item = event.item;
    if (!item || item.type !== "command_execution" || !item.id) {
      continue;
    }

    if (event.type === "item.started" && typeof item.command === "string") {
      executions.set(item.id, {
        aggregatedOutput: typeof item.aggregated_output === "string"
          ? item.aggregated_output
          : "",
        command: item.command,
        eventId: item.id,
        exitCode: item.exit_code,
        startedEventIndex: eventIndex,
        status: item.status,
        timedOut: false,
      });
      continue;
    }

    if (event.type !== "item.completed") {
      continue;
    }

    const existing = executions.get(item.id);
    const command = typeof item.command === "string"
      ? item.command
      : existing?.command;
    if (!command) {
      continue;
    }

    executions.set(item.id, {
      aggregatedOutput: typeof item.aggregated_output === "string"
        ? item.aggregated_output
        : (existing?.aggregatedOutput ?? ""),
      command,
      completedEventIndex: eventIndex,
      eventId: item.id,
      exitCode: item.exit_code,
      startedEventIndex: existing?.startedEventIndex ?? eventIndex,
      status: item.status ?? existing?.status,
      timedOut: existing?.timedOut ?? false,
    });
  }

  if (turn.timedOut) {
    for (const execution of executions.values()) {
      if (execution.completedEventIndex === undefined) {
        execution.timedOut = true;
      }
    }
  }

  return [...executions.values()].sort((left, right) =>
    left.startedEventIndex - right.startedEventIndex
  );
}

function collectCodexWarningMessages(turn: CodexExecTurn): CodexWarningMessage[] {
  return turn.events.flatMap((event, eventIndex) => {
    const item = event.item;
    if (
      event.type !== "item.completed" ||
      item?.type !== "agent_message" ||
      typeof item.text !== "string" ||
      item.text.trim().length === 0
    ) {
      return [];
    }

    return [{
      eventIndex,
      text: item.text.trim(),
      ...(typeof item.id === "string" && item.id.trim().length > 0
        ? { turnId: item.id }
        : {}),
    }];
  });
}

function toCommandCandidate(input: {
  execution: CodexCommandExecution;
  parseCommandAction: (command: string) => BehavioralFirstAction | undefined;
  timeoutEvidenceExcerpt?: string;
}): CodexCommandTraceActionCandidate | null {
  const command = unwrapCodexShellCommand(input.execution.command);
  const parsed = input.parseCommandAction(command);
  if (!parsed) {
    return null;
  }

  const outcome = resolveCommandOutcome(input.execution);
  const evidenceExcerpt = outcome === "success"
    ? undefined
    : (
      input.execution.aggregatedOutput.trim() ||
      (outcome === "timeout"
        ? input.timeoutEvidenceExcerpt ?? "Codex host command timed out."
        : undefined)
    );

  return {
    actionKind: parsed.kind === "tool_call" ? "tool_call" : "command",
    ...(parsed.args ? { args: [...parsed.args] } : {}),
    command,
    ...(typeof evidenceExcerpt === "string" ? { evidenceExcerpt } : {}),
    eventIndex: input.execution.startedEventIndex,
    kind: "command",
    name: parsed.name,
    outcome,
    ...(parsed.raw ? { raw: parsed.raw } : {}),
    ...(typeof parsed.raw !== "string" ? { raw: command } : {}),
  };
}

function toWarningCandidate(input: {
  message: CodexWarningMessage;
  parseWarningAction: (warningText: string) => BehavioralFirstAction | undefined;
}): CodexWarningTraceActionCandidate | null {
  const parsed = input.parseWarningAction(input.message.text);
  if (!parsed) {
    return null;
  }

  return {
    ...(parsed.args ? { args: [...parsed.args] } : {}),
    eventIndex: input.message.eventIndex,
    kind: "warning",
    name: parsed.name,
    ...(parsed.raw ? { raw: parsed.raw } : {}),
    ...(typeof input.message.turnId === "string" ? { turnId: input.message.turnId } : {}),
  };
}

export function buildCodexBehavioralTrace(
  input: BuildCodexBehavioralTraceInput,
): BuildCodexBehavioralTraceResult {
  const commandCandidates = collectCodexCommandExecutions(input.turn)
    .map((execution) =>
      toCommandCandidate({
        execution,
        parseCommandAction: input.parseCommandAction,
        ...(typeof input.turn.timeoutMessage === "string"
          ? { timeoutEvidenceExcerpt: input.turn.timeoutMessage }
          : {}),
      })
    )
    .filter((candidate): candidate is CodexCommandTraceActionCandidate => candidate !== null);
  const warningCandidates = collectCodexWarningMessages(input.turn)
    .map((message) =>
      toWarningCandidate({
        message,
        parseWarningAction: input.parseWarningAction,
      })
    )
    .filter((candidate): candidate is CodexWarningTraceActionCandidate => candidate !== null);
  const candidates = [...commandCandidates, ...warningCandidates].sort((left, right) =>
    left.eventIndex - right.eventIndex
  );

  const events: HostBehavioralTrace["events"] = [];
  let correctionTargetStepIndex: number | undefined;

  for (const candidate of candidates) {
    if (candidate.kind === "warning") {
      events.push({
        actionKind: "warning",
        actionName: candidate.name,
        ...(candidate.args ? { args: [...candidate.args] } : {}),
        ...(typeof correctionTargetStepIndex === "number"
          ? { correctionOfStepIndex: correctionTargetStepIndex }
          : {}),
        outcome: correctionTargetStepIndex === undefined ? "success" : "user_corrected",
        outcomeSource: "warning_message",
        ...(candidate.raw ? { raw: candidate.raw } : {}),
        stepIndex: events.length,
        ...(candidate.turnId ? { turnId: candidate.turnId } : {}),
      });
      continue;
    }

    const stepIndex = events.length;
    events.push({
      actionKind: candidate.actionKind,
      actionName: candidate.name,
      ...(candidate.args ? { args: [...candidate.args] } : {}),
      ...(typeof correctionTargetStepIndex === "number"
        ? { correctionOfStepIndex: correctionTargetStepIndex }
        : {}),
      ...(candidate.evidenceExcerpt ? { evidenceExcerpt: candidate.evidenceExcerpt } : {}),
      outcome: candidate.outcome,
      outcomeSource: "host_lifecycle",
      ...(candidate.raw ? { raw: candidate.raw } : {}),
      stepIndex,
    });

    if (
      correctionTargetStepIndex === undefined &&
      (candidate.outcome === "failure" || candidate.outcome === "timeout")
    ) {
      correctionTargetStepIndex = stepIndex;
    }
  }

  if (events.length === 0) {
    return {
      answer: "",
      trace: null,
    };
  }

  return {
    answer: events[0]?.raw ?? "",
    trace: validateBehavioralTrace(
      {
        cue: input.cue,
        events,
        hostKind: "codex",
        traceId: input.traceId,
      },
      "trace",
    ),
  };
}
