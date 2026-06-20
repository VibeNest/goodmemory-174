import type { GoodMemory } from "../api/contracts";
import {
  readGoodMemoryIntegrationSupport,
  type AgentEventIngestResult,
} from "../api/integrationSupport";
import { validateAgentInputEvent } from "../agentEvents";
import type { AgentInputEvent } from "./contracts";

export async function ingestAgentInputEvent(
  memory: GoodMemory,
  event: AgentInputEvent,
): Promise<AgentEventIngestResult> {
  const support = readGoodMemoryIntegrationSupport(memory);

  if (!support?.ingestAgentInputEvent) {
    return {
      recorded: false,
      skippedReason: "unsupported_memory",
    };
  }

  return support.ingestAgentInputEvent({
    event: validateAgentInputEvent(event),
  });
}
