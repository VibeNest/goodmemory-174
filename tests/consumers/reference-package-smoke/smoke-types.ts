import type {
  AgentEventStructuredValue,
  AgentInputEvent,
} from "goodmemory/ai-sdk";
import {
  validateAgentInputEvent,
} from "goodmemory/ai-sdk";
import type { HostAgentEvent } from "goodmemory/host";
import {
  validateHostAgentEvent,
} from "goodmemory/host";

const toolPayload: AgentEventStructuredValue = {
  checks: ["network"],
  dryRun: true,
  metadata: {
    limit: 2,
  },
};

const aiEvent = {
  surface: "ai-sdk",
  kind: "tool_call",
  eventId: "consumer-event-1",
  runId: "consumer-run-1",
  turnId: "consumer-turn-1",
  sequence: 0,
  occurredAt: "2026-04-22T00:00:00.000Z",
  hostKind: "codex",
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s1",
  },
  toolName: "QuickCheck",
  payload: toolPayload,
} satisfies AgentInputEvent;

const hostEvent = {
  surface: "host",
  kind: "file_edit",
  eventId: "consumer-event-2",
  attemptId: "consumer-attempt-1",
  turnId: "consumer-turn-1",
  sequence: 1,
  occurredAt: "2026-04-22T00:00:01.000Z",
  parentEventId: "consumer-event-1",
  hostKind: "claude",
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s1",
  },
  operation: "update",
  relativePath: "playbooks/consumer-checklist.md",
  summary: "Capture the installed-package smoke edit shape.",
} satisfies HostAgentEvent;

void validateAgentInputEvent(aiEvent);
void validateHostAgentEvent(hostEvent);

const legacyArgsEvent: AgentInputEvent = {
  surface: "ai-sdk",
  kind: "tool_call",
  eventId: "legacy-event",
  runId: "legacy-run",
  turnId: "legacy-turn",
  sequence: 2,
  occurredAt: "2026-04-22T00:00:02.000Z",
  hostKind: "codex",
  scope: {
    userId: "consumer-user",
  },
  toolName: "QuickCheck",
  // @ts-expect-error tool_call payload is adapter-neutral rather than CLI-shaped args.
  args: ["--network"],
};

// @ts-expect-error Root barrel must not export adapter-level agent input events.
type RootAgentInputEvent = import("goodmemory").AgentInputEvent;

// @ts-expect-error Root barrel must not export host-level agent events.
type RootHostAgentEvent = import("goodmemory").HostAgentEvent;

// @ts-expect-error Root barrel must not export runtime validation helpers for adapter events.
const rootValidateAgentInputEvent = import("goodmemory").validateAgentInputEvent;

// @ts-expect-error Root barrel must not export runtime validation helpers for host events.
const rootValidateHostAgentEvent = import("goodmemory").validateHostAgentEvent;

void legacyArgsEvent;
void (0 as unknown as RootAgentInputEvent);
void (0 as unknown as RootHostAgentEvent);
void rootValidateAgentInputEvent;
void rootValidateHostAgentEvent;
