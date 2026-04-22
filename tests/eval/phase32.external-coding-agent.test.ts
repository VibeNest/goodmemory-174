import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../../src";
import { ingestAgentInputEvent } from "../../src/ai-sdk";
import { ingestHostAgentEvent } from "../../src/host";

async function createEventBackedCodingAgentContext() {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    sessionStore,
    now: () => "2026-04-22T00:00:00.000Z",
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });
  const scope = {
    userId: "phase32-user",
    workspaceId: "phase32-workspace",
    sessionId: "phase32-session",
  } as const;

  await runtime.startSession(scope);
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Close phase 32 rollout",
    openLoops: ["lock eval slice"],
  });
  await runtime.updateSessionJournal(scope, {
    currentState: "Closeout draft in review.",
    appendWorklog: ["Bootstrap path passed."],
  });

  for (const [index, eventId] of ["correction-1"].entries()) {
    await ingestAgentInputEvent(memory, {
      surface: "ai-sdk",
      kind: "user_correction",
      eventId,
      runId: "phase32-run",
      turnId: `turn-${index + 1}`,
      sequence: index,
      occurredAt: `2026-04-22T00:00:0${index}.000Z`,
      hostKind: "generic",
      scope,
      correction: "Use bullet points.",
      retrievalProfile: "coding_agent",
    });
  }
  await ingestHostAgentEvent(memory, {
    surface: "host",
    kind: "verify_result",
    eventId: "verify-1",
    runId: "phase32-run",
    turnId: "turn-4",
    sequence: 3,
      occurredAt: "2026-04-22T00:00:03.000Z",
      hostKind: "codex",
      scope,
    checkName: "phase32-closeout-review",
    outcome: "failed",
    summary: "Verification failed: draft missed bullets.",
  });

  const recall = await memory.recall({
    scope,
    query: "Continue phase 32 and avoid the previous summary mistake.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: 104,
  });

  return {
    memory,
    context,
    recall,
  };
}

async function createTextOnlyCodingAgentContext() {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    sessionStore,
    now: () => "2026-04-22T00:00:00.000Z",
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });
  const scope = {
    userId: "phase32-user",
    workspaceId: "phase32-workspace",
    sessionId: "phase32-session",
  } as const;

  await runtime.startSession(scope);
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Close phase 32 rollout",
    openLoops: ["lock eval slice"],
  });
  await runtime.updateSessionJournal(scope, {
    currentState: "Closeout draft in review.",
    appendWorklog: ["Bootstrap path passed."],
  });
  await memory.feedback({
    scope,
    signal: "Use bullet points.",
  });

  const recall = await memory.recall({
    scope,
    query: "Continue phase 32 and avoid the previous summary mistake.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: 104,
  });

  return {
    context,
    recall,
  };
}

async function createNoMemoryCodingAgentContext() {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
  });
  const scope = {
    userId: "phase32-user",
    workspaceId: "phase32-workspace",
    sessionId: "phase32-session",
  } as const;

  const recall = await memory.recall({
    scope,
    query: "Continue phase 32 and avoid the previous summary mistake.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: 104,
  });

  return {
    context,
    recall,
  };
}

function scoreCodingAgentContext(content: string): number {
    return [
    "Use bullet points.",
    "Close phase 32 rollout",
    "lock eval slice",
    "Verification:",
  ].reduce((score, needle) => score + (content.includes(needle) ? 1 : 0), 0);
}

describe("phase 32 external coding-agent deterministic baselines", () => {
  it("keeps the event-backed public path at least as strong as text-only and clearly above no-memory", async () => {
    const eventBacked = await createEventBackedCodingAgentContext();
    const textOnly = await createTextOnlyCodingAgentContext();
    const noMemory = await createNoMemoryCodingAgentContext();

    const eventScore = scoreCodingAgentContext(eventBacked.context.content);
    const textOnlyScore = scoreCodingAgentContext(textOnly.context.content);
    const noMemoryScore = scoreCodingAgentContext(noMemory.context.content);

    expect(eventBacked.recall.feedback.length).toBeGreaterThan(0);
    expect(
      eventBacked.recall.feedback.some((record) => record.rule === "Use bullet points."),
    ).toBe(true);
    expect(eventBacked.context.content).toContain("## Procedural Memory");
    expect(eventBacked.context.content).toContain("## Working Memory");
    expect(eventBacked.context.content).toContain("## Session Journal");
    expect(eventBacked.context.content).toContain("## Evidence");
    expect(
      eventBacked.context.content.match(/- Correction: Use bullet points\./g)?.length ?? 0,
    ).toBe(1);
    expect(eventBacked.context.estimatedTokens).toBeLessThanOrEqual(88);

    expect(eventScore).toBeGreaterThan(textOnlyScore);
    expect(eventScore).toBeGreaterThan(noMemoryScore);
    expect(textOnlyScore).toBeGreaterThan(noMemoryScore);
    expect(eventBacked.context.content).toContain("Verification:");
    expect(textOnly.context.content).not.toContain("Verification:");
    expect(noMemory.context.content.trim()).toBe("");
  });

  it("keeps coding-agent context output stable after recall serialization", async () => {
    const eventBacked = await createEventBackedCodingAgentContext();
    const serializedRecall = JSON.parse(
      JSON.stringify(eventBacked.recall),
    ) as typeof eventBacked.recall;
    const rebuilt = await eventBacked.memory.buildContext({
      recall: serializedRecall,
      output: "markdown",
      maxTokens: 104,
    });

    expect(rebuilt.content).toBe(eventBacked.context.content);
  });
});
