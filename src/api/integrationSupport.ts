import type { AgentInputEvent, HostAgentEvent } from "../agentEvents";
import type { FeedbackKind } from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { HostActionDecision, HostKind } from "../domain/hostTypes";
import type { LanguageService } from "../language";
import type {
  FeedbackPromotionReceipt,
  FeedbackProposalReceipt,
  GoodMemory,
} from "./contracts";

export const GOODMEMORY_INTEGRATION_SUPPORT = Symbol.for(
  "goodmemory.integration.support",
);

export type AgentEventIngestSkipReason =
  | "duplicate_event"
  | "empty_excerpt"
  | "policy_blocked"
  | "unsupported_memory";

export type AgentEventProposalReceipt = FeedbackProposalReceipt;

export type AgentEventPromotionReceipt = FeedbackPromotionReceipt;

export interface AgentEventCorrectionResult {
  accepted: boolean;
  evidenceIds?: string[];
  kind?: Exclude<FeedbackKind, "validated_pattern">;
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    languagePackId: string;
    languagePackVersion?: string;
    analysisMode: "rules-only";
  };
  proposalReceipts?: AgentEventProposalReceipt[];
  promotionReceipts?: AgentEventPromotionReceipt[];
}

export interface AgentEventIngestResult {
  evidenceId?: string;
  experienceId?: string;
  /**
   * @deprecated Automatic adapter/event user_correction ingestion is proposal-first
   * and does not set this field. It remains only for compatibility with older
   * adapter result shapes.
   */
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
  readonly language: LanguageService;
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
