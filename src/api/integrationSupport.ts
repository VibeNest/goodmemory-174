import type { AgentInputEvent, HostAgentEvent } from "../agentEvents";
import type { GoodMemory } from "./contracts";

export const GOODMEMORY_INTEGRATION_SUPPORT = Symbol.for(
  "goodmemory.integration.support",
);

export type AgentEventIngestSkipReason =
  | "duplicate_event"
  | "empty_excerpt"
  | "policy_blocked"
  | "unsupported_memory";

export interface AgentEventIngestResult {
  evidenceId?: string;
  experienceId?: string;
  feedbackMemoryId?: string;
  recorded: boolean;
  skippedReason?: AgentEventIngestSkipReason;
}

export interface GoodMemoryIntegrationSupport {
  ingestAgentInputEvent(
    input: { event: AgentInputEvent },
  ): Promise<AgentEventIngestResult>;
  ingestHostAgentEvent(
    input: { event: HostAgentEvent },
  ): Promise<AgentEventIngestResult>;
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
