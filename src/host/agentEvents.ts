import type { GoodMemory } from "../api/contracts";
import {
  readGoodMemoryIntegrationSupport,
  type AgentEventIngestResult,
} from "../api/integrationSupport";
import { validateHostAgentEvent } from "../agentEvents";
import type { HostAgentEvent } from "./contracts";

export async function ingestHostAgentEvent(
  memory: GoodMemory,
  event: HostAgentEvent,
): Promise<AgentEventIngestResult> {
  const support = readGoodMemoryIntegrationSupport(memory);

  if (!support?.ingestHostAgentEvent) {
    return {
      recorded: false,
      skippedReason: "unsupported_memory",
    };
  }

  return support.ingestHostAgentEvent({
    event: validateHostAgentEvent(event),
  });
}
