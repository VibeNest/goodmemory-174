import type {
  AgentEventIngestResult as AISDKAgentEventIngestResult,
  AgentEventStructuredValue,
  AgentInputEvent,
} from "../../src/ai-sdk";
import {
  validateAgentInputEvent,
} from "../../src/ai-sdk";
import type {
  AgentEventIngestResult as HostAgentEventIngestResult,
  HostAgentEvent,
} from "../../src/host";
import {
  validateHostAgentEvent,
} from "../../src/host";
import type { GoodMemoryIntegrationSupport } from "../../src/api/integrationSupport";

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

const aiCorrectionEvent: AgentInputEvent = {
  surface: "ai-sdk",
  kind: "user_correction",
  correction: "Use short paragraphs.",
  retrievalProfile: "general_chat",
  eventId: "event-3",
  runId: "run-2",
  turnId: "turn-2",
  sequence: 2,
  occurredAt: "2026-04-22T00:00:02.000Z",
  hostKind: "codex",
  scope: {
    userId: "u-1",
  },
};

const hostCorrectionEvent: HostAgentEvent = {
  surface: "host",
  kind: "user_correction",
  correction: "Run verification first.",
  eventId: "event-4",
  runId: "run-3",
  turnId: "turn-3",
  sequence: 3,
  occurredAt: "2026-04-22T00:00:03.000Z",
  hostKind: "codex",
  scope: {
    userId: "u-1",
  },
};

void validateAgentInputEvent(aiEvent);
void validateHostAgentEvent(hostEvent);
void validateAgentInputEvent(aiCorrectionEvent);
void validateHostAgentEvent(hostCorrectionEvent);

const aiCorrectionIngestResult: AISDKAgentEventIngestResult = {
  evidenceId: "evidence-1",
  proposalReceipts: [{
    proposalId: "proposal-1",
    proposalType: "procedural_pattern",
    status: "accepted",
  }],
  promotionReceipts: [{
    decision: "accepted",
    promotionId: "promotion-1",
    proposalId: "proposal-1",
  }],
  recorded: true,
};

const hostCorrectionIngestResult: HostAgentEventIngestResult = {
  evidenceId: "evidence-2",
  proposalReceipts: [{
    proposalId: "proposal-2",
    proposalType: "procedural_pattern",
    status: "accepted",
  }],
  promotionReceipts: [{
    decision: "accepted",
    promotionId: "promotion-2",
    proposalId: "proposal-2",
  }],
  recorded: true,
};

void aiCorrectionIngestResult.feedbackMemoryId;
void aiCorrectionIngestResult.proposalReceipts;
void aiCorrectionIngestResult.promotionReceipts;
void hostCorrectionIngestResult.feedbackMemoryId;
void hostCorrectionIngestResult.proposalReceipts;
void hostCorrectionIngestResult.promotionReceipts;

// @ts-expect-error adapter ingestion must not expose a new direct active feedback memory field.
void aiCorrectionIngestResult.activeFeedbackMemoryId;

async function assertIntegrationSupportReturnTypes(
  support: GoodMemoryIntegrationSupport,
) {
  const result = await support.ingestAgentInputEvent({ event: aiCorrectionEvent });

  void result.evidenceId;
  void result.proposalReceipts;
  void result.promotionReceipts;
  void result.feedbackMemoryId;

  // @ts-expect-error integration support must not expose direct active feedback memory writes.
  void result.activeFeedbackMemoryId;
}

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

// @ts-expect-error ai-sdk user_correction must declare retrievalProfile.
const invalidAiCorrectionEvent: AgentInputEvent = {
  surface: "ai-sdk",
  kind: "user_correction",
  correction: "Use short paragraphs.",
  eventId: "event-invalid",
  runId: "run-invalid",
  turnId: "turn-invalid",
  sequence: 4,
  occurredAt: "2026-04-22T00:00:04.000Z",
  hostKind: "codex",
  scope: {
    userId: "u-1",
  },
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
void aiCorrectionEvent;
void hostCorrectionEvent;
void invalidAiCorrectionEvent;
void legacyArgsEvent;
void rootValidateAgentInputEvent;
void rootValidateHostAgentEvent;
void assertIntegrationSupportReturnTypes;
