import type { MarkdownArtifactBundle } from "../src";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createMemoryRepositories,
  createRuntimeContextService,
} from "../src";
import { createRuntimeSalvageHooks } from "../src/evolution/salvage";

export async function runCodingAgentExample(): Promise<{
  artifacts: MarkdownArtifactBundle;
  memoryContext: string;
  answer: string;
  salvageProposalSummaries: string[];
}> {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore,
  });
  const runtime = createRuntimeContextService({
    sessionStore,
    archiveStore: repositories.archives,
    salvageHooks: createRuntimeSalvageHooks({
      repositories,
      now: () => "2026-04-02T00:00:00.000Z",
    }),
    now: () => "2026-04-02T00:00:00.000Z",
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
    userId: "agent-user",
    sessionId: "agent-s1",
    workspaceId: "example-agent",
  } as const;

  await runtime.startSession(scope);
  await runtime.appendToSession(scope, {
    role: "user",
    content: "Outline the rollback checklist before deploy.",
  });
  await runtime.appendToSession(scope, {
    role: "assistant",
    content: "Use the rollback checklist before deploy.",
  });
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Finish recall engine",
    openLoops: ["wire buildContext output"],
    temporaryDecisions: ["Use the rollback checklist before deploy."],
  });
  await runtime.updateSessionJournal(scope, {
    currentState: "Phase 6 in progress",
    appendWorklog: ["Recall router implemented."],
  });
  await runtime.appendToSession(scope, {
    role: "user",
    content: "Continue the recall engine implementation.",
  });
  await memory.feedback({
    scope,
    signal: "Please keep coding task updates concise and action-oriented.",
  });

  const recall = await memory.recall({
    scope,
    query: "Continue the coding task from last time.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: 200,
  });
  const exported = await memory.exportMemory({
    scope,
    includeRuntime: true,
  });

  return {
    artifacts: exported.artifacts,
    memoryContext: context.content,
    answer:
      "Next step: Finish recall engine, then wire buildContext output before closing the open loop on wire buildContext output.",
    salvageProposalSummaries: exported.durable.proposals.map(
      (proposal) => proposal.summary,
    ),
  };
}

if (import.meta.main) {
  const result = await runCodingAgentExample();
  console.log(JSON.stringify(result, null, 2));
}
