import type { BehavioralFirstAction } from "../evolution/behavioralTelemetry";

export type HostBehavioralActionKind = "command" | "tool_call" | "warning";

export type HostBehavioralOutcome =
  | "failure"
  | "success"
  | "timeout"
  | "user_corrected";

type HostBehavioralOutcomeSource = "host_lifecycle" | "warning_message";

export interface HostBehavioralTraceEvent {
  actionKind: HostBehavioralActionKind;
  actionName: string;
  args?: string[];
  correctionOfStepIndex?: number;
  evidenceExcerpt?: string;
  outcome: HostBehavioralOutcome;
  outcomeSource?: HostBehavioralOutcomeSource;
  raw?: string;
  stepIndex: number;
  turnId?: string;
}

export interface HostBehavioralTrace {
  cue: string;
  events: HostBehavioralTraceEvent[];
  hostKind: "codex";
  traceId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }

  return value;
}

function assertNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }

  return value;
}

function assertActionKind(
  value: unknown,
  path: string,
): HostBehavioralActionKind {
  if (value === "command" || value === "tool_call" || value === "warning") {
    return value;
  }

  throw new Error(`${path} must be command, tool_call, or warning`);
}

function assertOutcome(value: unknown, path: string): HostBehavioralOutcome {
  if (
    value === "failure" ||
    value === "success" ||
    value === "timeout" ||
    value === "user_corrected"
  ) {
    return value;
  }

  throw new Error(`${path} must be failure, success, timeout, or user_corrected`);
}

function assertOutcomeSource(
  value: unknown,
  path: string,
): HostBehavioralOutcomeSource {
  if (value === "host_lifecycle" || value === "warning_message") {
    return value;
  }

  throw new Error(`${path} must be host_lifecycle or warning_message`);
}

export function validateBehavioralTraceEvent(
  value: unknown,
  path = "trace.events[0]",
): HostBehavioralTraceEvent {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const args = value.args;
  if (args !== undefined && (!Array.isArray(args) || args.some((item) => typeof item !== "string"))) {
    throw new Error(`${path}.args must be a string array`);
  }
  const raw = value.raw;
  if (raw !== undefined && typeof raw !== "string") {
    throw new Error(`${path}.raw must be a string`);
  }
  const evidenceExcerpt = value.evidenceExcerpt;
  if (evidenceExcerpt !== undefined && typeof evidenceExcerpt !== "string") {
    throw new Error(`${path}.evidenceExcerpt must be a string`);
  }
  const correctionOfStepIndex = value.correctionOfStepIndex === undefined
    ? undefined
    : assertNonNegativeInteger(
        value.correctionOfStepIndex,
        `${path}.correctionOfStepIndex`,
      );
  const stepIndex = assertNonNegativeInteger(value.stepIndex, `${path}.stepIndex`);
  const outcomeSource = value.outcomeSource === undefined
    ? undefined
    : assertOutcomeSource(value.outcomeSource, `${path}.outcomeSource`);
  const turnId = value.turnId;
  if (turnId !== undefined && typeof turnId !== "string") {
    throw new Error(`${path}.turnId must be a string`);
  }

  return {
    actionKind: assertActionKind(value.actionKind, `${path}.actionKind`),
    actionName: assertString(value.actionName, `${path}.actionName`),
    ...(args ? { args: [...args] } : {}),
    ...(typeof correctionOfStepIndex === "number"
      ? { correctionOfStepIndex }
      : {}),
    ...(typeof evidenceExcerpt === "string" ? { evidenceExcerpt } : {}),
    outcome: assertOutcome(value.outcome, `${path}.outcome`),
    ...(typeof outcomeSource === "string" ? { outcomeSource } : {}),
    ...(typeof raw === "string" && raw.trim().length > 0 ? { raw } : {}),
    stepIndex,
    ...(typeof turnId === "string" && turnId.trim().length > 0 ? { turnId } : {}),
  };
}

export function validateBehavioralTrace(
  value: unknown,
  path = "trace",
): HostBehavioralTrace {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const hostKind = assertString(value.hostKind, `${path}.hostKind`);
  if (hostKind !== "codex") {
    throw new Error(`${path}.hostKind must be codex`);
  }
  const events = value.events;
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`${path}.events must be a non-empty array`);
  }
  const validatedEvents = events.map((event, index) =>
    validateBehavioralTraceEvent(event, `${path}.events[${index}]`),
  );
  const seenStepIndexes = new Map<number, number>();

  for (const [index, event] of validatedEvents.entries()) {
    const existingIndex = seenStepIndexes.get(event.stepIndex);
    if (existingIndex !== undefined) {
      throw new Error(
        `${path}.events[${index}].stepIndex duplicates ${path}.events[${existingIndex}].stepIndex`,
      );
    }
    seenStepIndexes.set(event.stepIndex, index);
  }

  return {
    cue: assertString(value.cue, `${path}.cue`),
    hostKind,
    traceId: assertString(value.traceId, `${path}.traceId`),
    events: validatedEvents,
  };
}

export function extractFirstBehavioralTraceAction(
  trace: HostBehavioralTrace,
): HostBehavioralTraceEvent | undefined {
  let firstAction: HostBehavioralTraceEvent | undefined;

  for (const event of trace.events) {
    if (!firstAction || event.stepIndex < firstAction.stepIndex) {
      firstAction = event;
    }
  }

  return firstAction;
}

export function toBehavioralFirstAction(
  event: HostBehavioralTraceEvent,
): BehavioralFirstAction {
  return {
    kind: event.actionKind,
    name: event.actionName,
    ...(event.args ? { args: [...event.args] } : {}),
    ...(event.raw ? { raw: event.raw } : {}),
  };
}
