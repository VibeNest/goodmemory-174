import type { HostArtifact } from "../src/host";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../src";
import { createHostAdapter } from "../src/host";

export async function runCodexHandoffExample(): Promise<{
  artifacts: HostArtifact[];
  nextStep: string;
}> {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    sessionStore,
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    now: () => "2026-04-19T00:00:00.000Z",
    maxBufferedMessages: 2,
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });

  const scope = {
    userId: "codex-user",
    sessionId: "agent-s1",
    workspaceId: "codex-workspace",
  } as const;

  await runtime.startSession(scope);
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Finish recall engine",
    openLoops: ["wire buildContext output"],
    temporaryDecisions: ["Reuse the runtime runbook before deploy."],
  });
  await runtime.updateSessionJournal(scope, {
    currentState: "Recall router implemented.",
    filesAndFunctions: ["src/recall/engine.ts", "src/recall/contextBuilder.ts"],
    workflow: ["Verify the runtime runbook", "Wire buildContext output"],
    appendWorklog: ["Confirmed the recall router path."],
  });
  await memory.feedback({
    scope,
    signal: "Keep coding task updates concise and action-oriented.",
  });

  const adapter = createHostAdapter({
    id: "codex-handoff",
    hostKind: "codex",
    memory,
    readableArtifactTypes: ["session_memory"],
  });
  const result = await adapter.readArtifacts({
    scope,
    includeRuntime: true,
  });

  return {
    artifacts: result.artifacts,
    nextStep:
      "Next step: Finish recall engine, then wire buildContext output before closing the open loop.",
  };
}

if (import.meta.main) {
  const result = await runCodexHandoffExample();
  console.log(JSON.stringify(result, null, 2));
}
