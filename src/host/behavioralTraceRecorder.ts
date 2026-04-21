import {
  type HostBehavioralActionKind,
  type HostBehavioralOutcome,
  type HostBehavioralTrace,
  type HostBehavioralTraceEvent,
  validateBehavioralTrace,
  validateBehavioralTraceEvent,
} from "./behavioralTrace";

export interface HostBehavioralTraceRecorderEventInput {
  actionKind: HostBehavioralActionKind;
  actionName: string;
  args?: string[];
  correctionOfStepIndex?: number;
  evidenceExcerpt?: string;
  outcome: HostBehavioralOutcome;
  raw?: string;
  turnId?: string;
}

export interface HostBehavioralTraceRecorderCloseResult {
  error?: Error;
  recorded: boolean;
  trace: HostBehavioralTrace | null;
}

export interface HostBehavioralTraceRecorder {
  appendEvent(input: HostBehavioralTraceRecorderEventInput): HostBehavioralTraceEvent;
  close(): Promise<HostBehavioralTraceRecorderCloseResult>;
  snapshot(): HostBehavioralTrace | null;
}

export interface CreateHostBehavioralTraceRecorderInput {
  cue: string;
  hostKind: "codex";
  onClose?: (
    trace: HostBehavioralTrace,
  ) => Promise<{ recorded: boolean }> | { recorded: boolean };
  traceId: string;
}

function buildTrace(input: CreateHostBehavioralTraceRecorderInput & {
  events: HostBehavioralTraceEvent[];
}): HostBehavioralTrace | null {
  if (input.events.length === 0) {
    return null;
  }

  return validateBehavioralTrace(
    {
      cue: input.cue,
      hostKind: input.hostKind,
      traceId: input.traceId,
      events: input.events,
    },
    "trace",
  );
}

function normalizeCloseError(
  error: unknown,
  fallbackMessage: string,
): Error {
  return error instanceof Error
    ? error
    : new Error(fallbackMessage);
}

export function createHostBehavioralTraceRecorder(
  input: CreateHostBehavioralTraceRecorderInput,
): HostBehavioralTraceRecorder {
  const events: HostBehavioralTraceEvent[] = [];
  let closePromise: Promise<HostBehavioralTraceRecorderCloseResult> | null = null;
  let nextStepIndex = 0;

  return {
    appendEvent(eventInput) {
      if (closePromise) {
        throw new Error("behavioral trace recorder is already closed");
      }

      const event = validateBehavioralTraceEvent(
        {
          ...eventInput,
          stepIndex: nextStepIndex,
        },
        "trace.events[0]",
      );

      events.push(event);
      nextStepIndex += 1;

      return event;
    },
    close() {
      if (closePromise) {
        return closePromise;
      }

      closePromise = (async () => {
        let trace: HostBehavioralTrace | null = null;

        try {
          trace = buildTrace({
            ...input,
            events,
          });
        } catch (error) {
          return {
            error: normalizeCloseError(error, "failed to build behavioral trace"),
            recorded: false,
            trace: null,
          };
        }

        if (!trace) {
          return {
            recorded: false,
            trace: null,
          };
        }

        try {
          const result = await input.onClose?.(trace);

          return {
            recorded: result?.recorded ?? false,
            trace,
          };
        } catch (error) {
          return {
            error: normalizeCloseError(error, "failed to record behavioral trace"),
            recorded: false,
            trace,
          };
        }
      })();

      return closePromise;
    },
    snapshot() {
      return buildTrace({
        ...input,
        events,
      });
    },
  };
}
