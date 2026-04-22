import type {
  AgentEventStructuredValue,
  AgentInputEvent,
} from "../../src/ai-sdk";
import {
  validateAgentInputEvent,
} from "../../src/ai-sdk";
import type { HostAgentEvent } from "../../src/host";
import {
  validateHostAgentEvent,
} from "../../src/host";

const aiPayload: AgentEventStructuredValue = {
  checks: ["network"],
  dryRun: true,
  metadata: {
    limit: 2,
  },
};

const aiEvent: AgentInputEvent = {
  surface: "ai-sdk",
  kind: "tool_call",
  eventId: "event-1",
  runId: "run-1",
  turnId: "turn-1",
  sequence: 0,
  occurredAt: "2026-04-22T00:00:00.000Z",
  hostKind: "codex",
  scope: {
    userId: "u-1",
    workspaceId: "ws-1",
    sessionId: "s-1",
  },
  toolName: "QuickCheck",
  payload: aiPayload,
};

const hostEvent: HostAgentEvent = {
  surface: "host",
  kind: "tool_result",
  eventId: "event-2",
  attemptId: "attempt-1",
  turnId: "turn-1",
  sequence: 1,
  occurredAt: "2026-04-22T00:00:01.000Z",
  parentEventId: "event-1",
  hostKind: "claude",
  scope: {
    userId: "u-1",
    workspaceId: "ws-1",
    sessionId: "s-1",
  },
  toolName: "QuickCheck",
  outcome: "success",
  excerpt: "Reachability confirmed.",
};

void validateAgentInputEvent(aiEvent);
void validateHostAgentEvent(hostEvent);

const legacyArgsEvent: AgentInputEvent = {
  surface: "ai-sdk",
  kind: "tool_call",
  eventId: "event-legacy",
  runId: "run-legacy",
  turnId: "turn-legacy",
  sequence: 2,
  occurredAt: "2026-04-22T00:00:02.000Z",
  hostKind: "codex",
  scope: {
    userId: "u-1",
  },
  toolName: "QuickCheck",
  // @ts-expect-error tool_call no longer exposes CLI-shaped args on the public adapter contract.
  args: ["--network"],
};

// @ts-expect-error Root barrel must not export adapter-level agent input events.
type RootAgentInputEvent = import("../../src").AgentInputEvent;

// @ts-expect-error Root barrel must not export host-level agent events.
type RootHostAgentEvent = import("../../src").HostAgentEvent;

// @ts-expect-error Root barrel must not export runtime validation helpers for adapter events.
const rootValidateAgentInputEvent = import("../../src").validateAgentInputEvent;

// @ts-expect-error Root barrel must not export runtime validation helpers for host events.
const rootValidateHostAgentEvent = import("../../src").validateHostAgentEvent;

void (0 as unknown as RootAgentInputEvent);
void (0 as unknown as RootHostAgentEvent);
void legacyArgsEvent;
void rootValidateAgentInputEvent;
void rootValidateHostAgentEvent;
