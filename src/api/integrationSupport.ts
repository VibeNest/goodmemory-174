import type { AgentInputEvent, HostAgentEvent } from "../agentEvents";
import type { MemoryScope } from "../domain/scope";
import type {
  LearningProposalStatus,
  LearningProposalType,
  PromotionDecision,
} from "../evolution/contracts";
import type { HostActionDecision, HostKind } from "../host/contracts";
import type { FeedbackResult, GoodMemory } from "./contracts";

export const GOODMEMORY_INTEGRATION_SUPPORT = Symbol.for(
  "goodmemory.integration.support",
);

export type AgentEventIngestSkipReason =
  | "duplicate_event"
  | "empty_excerpt"
  | "policy_blocked"
  | "unsupported_memory";

export interface AgentEventProposalReceipt {
  proposalId: string;
  proposalType: LearningProposalType;
  status: LearningProposalStatus;
}

export interface AgentEventPromotionReceipt {
  decision: PromotionDecision;
  promotionId: string;
  proposalId: string;
}

export interface AgentEventFeedbackResult extends FeedbackResult {
  proposalReceipts?: AgentEventProposalReceipt[];
  promotionReceipts?: AgentEventPromotionReceipt[];
}

export interface AgentEventIngestResult {
  evidenceId?: string;
  experienceId?: string;
  feedbackMemoryId?: string;
  proposalReceipts?: AgentEventProposalReceipt[];
  promotionReceipts?: AgentEventPromotionReceipt[];
  recorded: boolean;
  skippedReason?: AgentEventIngestSkipReason;
}

export type HostActionAssessmentRecordSkipReason = "unsupported_memory";

export interface HostActionAssessmentRecordInput {
  actionId: string;
  actionKind: "command" | "file_edit" | "tool_call";
  actionSummary: string;
  attemptId?: string;
  decision: HostActionDecision;
  guidance: string[];
  hostKind: HostKind;
  matchedEvidenceIds: string[];
  matchedMemoryIds: string[];
  occurredAt: string;
  policyApplied: string[];
  reason: string;
  recommendedFirstStepSummary?: string;
  requiredPreconditions: string[];
  runId?: string;
  scope: MemoryScope;
  turnId: string;
}

export interface HostActionAssessmentRecordResult {
  experienceId?: string;
  recorded: boolean;
  skippedReason?: HostActionAssessmentRecordSkipReason;
}

export interface GoodMemoryIntegrationSupport {
  ingestAgentInputEvent(
    input: { event: AgentInputEvent },
  ): Promise<AgentEventIngestResult>;
  ingestHostAgentEvent(
    input: { event: HostAgentEvent },
  ): Promise<AgentEventIngestResult>;
  recordHostActionAssessment(
    input: { assessment: HostActionAssessmentRecordInput },
  ): Promise<HostActionAssessmentRecordResult>;
}

type IntegrationAwareGoodMemory = GoodMemory & {
  [GOODMEMORY_INTEGRATION_SUPPORT]?: GoodMemoryIntegrationSupport;
};

export function attachGoodMemoryIntegrationSupport(
  memory: GoodMemory,
  support: GoodMemoryIntegrationSupport,
): GoodMemory {
  (memory as IntegrationAwareGoodMemory)[GOODMEMORY_INTEGRATION_SUPPORT] = support;
  return memory;
}

export function readGoodMemoryIntegrationSupport(
  memory: GoodMemory,
): GoodMemoryIntegrationSupport | undefined {
  return (memory as IntegrationAwareGoodMemory)[GOODMEMORY_INTEGRATION_SUPPORT];
}
