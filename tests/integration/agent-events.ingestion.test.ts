import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../../src";
import { ingestAgentInputEvent } from "../../src/ai-sdk";
import { EXPERIENCES_COLLECTION } from "../../src/evolution/contracts";
import { ingestHostAgentEvent } from "../../src/host";
import type { DocumentStore } from "../../src/storage/contracts";

function createExperienceFailingOnceDocumentStore(): DocumentStore {
  const store = createInMemoryDocumentStore();
  let failed = false;

  return {
    ...store,
    async set(collection, id, document) {
      if (!failed && collection === EXPERIENCES_COLLECTION) {
        failed = true;
        throw new Error("experience repository unavailable");
      }

      await store.set(collection, id, document);
    },
  };
}

function createFeedbackFailingOnceDocumentStore(): DocumentStore {
  const store = createInMemoryDocumentStore();
  let failed = false;

  return {
    ...store,
    async set(collection, id, document) {
      if (!failed && collection === "feedback") {
        failed = true;
        throw new Error("feedback repository unavailable");
      }

      await store.set(collection, id, document);
    },
  };
}

describe("agent event ingestion", () => {
  it("persists selective tool-result evidence and experience and dedupes by event id", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;

    const first = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "tool_result",
      eventId: "event-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope,
      toolName: "QuickCheck",
      outcome: "timeout",
      excerpt: "QuickCheck timed out while probing the endpoint.",
    });
    const duplicate = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "tool_result",
      eventId: "event-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope,
      toolName: "QuickCheck",
      outcome: "timeout",
      excerpt: "QuickCheck timed out while probing the endpoint.",
    });
    const exported = await memory.exportMemory({ scope });

    expect(first.recorded).toBe(true);
    expect(first.evidenceId).toStartWith("agent_event.evidence.");
    expect(first.evidenceId).toContain("event=event-1");
    expect(first.experienceId).toStartWith("agent_event.experience.");
    expect(first.experienceId).toContain("event=event-1");
    expect(duplicate).toEqual({
      recorded: false,
      skippedReason: "duplicate_event",
    });
    expect(exported.durable.evidence).toHaveLength(1);
    expect(exported.durable.evidence[0]?.kind).toBe("tool_result_excerpt");
    expect(exported.durable.evidence[0]?.excerpt).toContain("QuickCheck timed out");
    expect(exported.durable.experiences).toHaveLength(1);
    expect(exported.durable.experiences[0]?.traceId).toBe("event-1");
    expect(exported.durable.experiences[0]?.kind).toBe("maintenance");
    expect(exported.durable.experiences[0]?.policyApplied).toContain("agent_event");
    expect(exported.durable.experiences[0]?.policyApplied).toContain(
      "agent_event.kind=tool_result",
    );
  });

  it("keeps event-backed persistence isolated across scopes even when event ids match", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const firstScope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;
    const secondScope = {
      userId: "u-2",
      workspaceId: "workspace-b",
      sessionId: "s-2",
    } as const;

    const first = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "tool_result",
      eventId: "shared-event",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: firstScope,
      toolName: "QuickCheck",
      outcome: "failure",
      excerpt: "Workspace A failed the quick check.",
    });
    const second = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "tool_result",
      eventId: "shared-event",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: secondScope,
      toolName: "QuickCheck",
      outcome: "failure",
      excerpt: "Workspace B failed the quick check.",
    });
    const exportedFirst = await memory.exportMemory({ scope: firstScope });
    const exportedSecond = await memory.exportMemory({ scope: secondScope });

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(true);
    expect(first.evidenceId).toBeDefined();
    expect(second.evidenceId).toBeDefined();
    expect(first.evidenceId).not.toBe(second.evidenceId);
    expect(first.experienceId).not.toBe(second.experienceId);
    expect(exportedFirst.durable.evidence).toHaveLength(1);
    expect(exportedFirst.durable.evidence[0]?.excerpt).toContain("Workspace A");
    expect(exportedFirst.durable.experiences).toHaveLength(1);
    expect(exportedSecond.durable.evidence).toHaveLength(1);
    expect(exportedSecond.durable.evidence[0]?.excerpt).toContain("Workspace B");
    expect(exportedSecond.durable.experiences).toHaveLength(1);
  });

  it("fails closed and lets a retry fill missing artifacts after experience storage errors", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createExperienceFailingOnceDocumentStore(),
      },
    });
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;
    const event = {
      surface: "host",
      kind: "tool_result",
      eventId: "event-retry",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope,
      toolName: "QuickCheck",
      outcome: "timeout",
      excerpt: "QuickCheck timed out while probing the endpoint.",
    } as const;

    await expect(ingestHostAgentEvent(memory, event)).rejects.toThrow(
      "experience repository unavailable",
    );

    const retry = await ingestHostAgentEvent(memory, event);
    const exported = await memory.exportMemory({ scope });

    expect(retry.recorded).toBe(true);
    expect(exported.durable.evidence).toHaveLength(1);
    expect(exported.durable.experiences).toHaveLength(1);
    expect(exported.durable.experiences[0]?.linkedEvidenceIds).toEqual([
      retry.evidenceId!,
    ]);
  });

  it("applies redaction and shouldRemember before persisting event excerpts", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      policy: {
        redact(candidate) {
          return {
            ...candidate,
            content: candidate.content.replaceAll("SECRET", "[redacted]"),
          };
        },
        shouldRemember(candidate) {
          return !candidate.content.includes("skip me");
        },
      },
    });
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;

    const kept = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "tool_result",
      eventId: "event-keep",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope,
      toolName: "QuickCheck",
      outcome: "failure",
      excerpt: "SECRET token leaked in tool output",
    });
    const blocked = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "file_edit",
      eventId: "event-block",
      runId: "run-1",
      turnId: "turn-2",
      sequence: 1,
      occurredAt: "2026-04-22T00:00:01.000Z",
      hostKind: "codex",
      scope,
      operation: "update",
      relativePath: "src/secret.txt",
      summary: "skip me from event persistence",
    });
    const exported = await memory.exportMemory({ scope });

    expect(kept.recorded).toBe(true);
    expect(blocked).toEqual({
      recorded: false,
      skippedReason: "policy_blocked",
    });
    expect(exported.durable.evidence).toHaveLength(1);
    expect(exported.durable.evidence[0]?.excerpt).toContain("[redacted]");
    expect(exported.durable.evidence[0]?.excerpt).not.toContain("SECRET");
  });

  it("bounds durable experience summaries so large host payloads do not become transcript dumps", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;
    const rawPayload = `${"DeepAnalyzer --trace ".repeat(24)}TAIL_SENTINEL`;

    const result = await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "tool_call",
      eventId: "event-large-tool-call",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope,
      toolName: "DeepAnalyzer",
      raw: rawPayload,
    });
    const exported = await memory.exportMemory({ scope });

    expect(result.recorded).toBe(true);
    expect(exported.durable.evidence).toHaveLength(0);
    expect(exported.durable.experiences).toHaveLength(1);
    expect(exported.durable.experiences[0]?.summary.length).toBeLessThanOrEqual(280);
    expect(exported.durable.experiences[0]?.summary).toContain(
      "Host host invoked DeepAnalyzer:",
    );
    expect(exported.durable.experiences[0]?.summary).not.toContain("TAIL_SENTINEL");
  });

  it("routes repeated user correction events through feedback and proposal compilation", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;

    for (const [index, eventId] of ["event-1", "event-2", "event-3"].entries()) {
      const result = await ingestAgentInputEvent(memory, {
        surface: "ai-sdk",
        kind: "user_correction",
        eventId,
        runId: "run-1",
        turnId: `turn-${index + 1}`,
        sequence: index,
        occurredAt: `2026-04-22T00:00:0${index}.000Z`,
        hostKind: "generic",
        scope,
        correction: "Use bullet points in summaries.",
      });

      expect(result.recorded).toBe(true);
      expect(result.feedbackMemoryId).toBeDefined();
    }

    const exported = await memory.exportMemory({
      scope: {
        userId: "u-1",
        workspaceId: "workspace-a",
      },
    });

    expect(
      exported.durable.feedback.some(
        (record) =>
          record.kind === "validated_pattern" &&
          record.rule.includes("Use bullet points in summaries."),
      ),
    ).toBe(true);
    expect(
      exported.durable.proposals.some(
        (proposal) => proposal.proposalType === "procedural_pattern",
      ),
    ).toBe(true);
    expect(
      exported.durable.experiences.filter((record) => record.kind === "feedback"),
    ).toHaveLength(3);
    expect(
      exported.durable.evidence.filter((record) => record.kind === "correction_context"),
    ).toHaveLength(3);
  });

  it("retries user correction feedback after evidence-only partial persistence", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createFeedbackFailingOnceDocumentStore(),
      },
    });
    const scope = {
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;
    const event = {
      surface: "ai-sdk",
      kind: "user_correction",
      eventId: "event-feedback-retry",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "generic",
      scope,
      correction: "Use bullet points in summaries.",
    } as const;

    await expect(ingestAgentInputEvent(memory, event)).rejects.toThrow(
      "feedback repository unavailable",
    );

    const retry = await ingestAgentInputEvent(memory, event);
    const duplicate = await ingestAgentInputEvent(memory, event);
    const exported = await memory.exportMemory({ scope });

    expect(retry.recorded).toBe(true);
    expect(retry.evidenceId).toBeDefined();
    expect(retry.feedbackMemoryId).toBeDefined();
    expect(duplicate).toEqual({
      recorded: false,
      skippedReason: "duplicate_event",
    });
    expect(
      exported.durable.evidence.filter((record) => record.kind === "correction_context"),
    ).toHaveLength(1);
    expect(exported.durable.feedback).toHaveLength(1);
    expect(exported.durable.feedback[0]?.rule).toContain(
      "Use bullet points in summaries.",
    );
  });

  it("feeds event-backed validated patterns into coding-agent recall and context assembly", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const runtime = createRuntimeContextService({
      sessionStore,
      archiveStore: createRuntimeArchiveStore({ documentStore }),
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
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    } as const;

    await runtime.startSession(scope);
    await runtime.updateWorkingMemory(scope, {
      currentGoal: "Finish the rollout note",
      openLoops: ["capture the handoff summary"],
    });
    await runtime.updateSessionJournal(scope, {
      currentState: "Preparing the final coding handoff.",
      appendWorklog: ["Validated the rollout note format."],
    });

    for (const [index, eventId] of ["event-1", "event-2", "event-3"].entries()) {
      await ingestAgentInputEvent(memory, {
        surface: "ai-sdk",
        kind: "user_correction",
        eventId,
        runId: "run-1",
        turnId: `turn-${index + 1}`,
        sequence: index,
        occurredAt: `2026-04-22T00:00:0${index}.000Z`,
        hostKind: "generic",
        scope,
        correction: "Use bullet points in summaries.",
      });
    }

    const recall = await memory.recall({
      scope,
      query: "Continue the coding task from last time.",
      retrievalProfile: "coding_agent",
    });
    const context = await memory.buildContext({
      recall,
      output: "markdown",
      maxTokens: 220,
    });

    expect(
      recall.feedback.some(
        (record) =>
          record.kind === "validated_pattern" &&
          record.rule.includes("Use bullet points in summaries."),
      ),
    ).toBe(true);
    expect(
      recall.evidence.some(
        (record) =>
          record.kind === "correction_context" &&
          record.excerpt.includes("Use bullet points in summaries."),
      ),
    ).toBe(true);
    expect(recall.workingMemory?.currentGoal).toBe("Finish the rollout note");
    expect(recall.workingMemory?.openLoops).toContain("capture the handoff summary");
    expect(context.content).toContain("Use bullet points in summaries.");
    expect(context.content).toContain("Finish the rollout note");
    expect(context.content).toContain("capture the handoff summary");
    expect(context.content).toContain("## Evidence");
  });

  it("returns unsupported_memory when helper is used with a non-goodmemory object", async () => {
    const result = await ingestAgentInputEvent(
      {
        async recall() {
          throw new Error("not implemented");
        },
        async buildContext() {
          throw new Error("not implemented");
        },
        async remember() {
          throw new Error("not implemented");
        },
        async forget() {
          throw new Error("not implemented");
        },
        async exportMemory() {
          throw new Error("not implemented");
        },
        async deleteAllMemory() {
          throw new Error("not implemented");
        },
        async feedback() {
          throw new Error("not implemented");
        },
        async runMaintenance() {
          throw new Error("not implemented");
        },
      } as never,
      {
        surface: "ai-sdk",
        kind: "task_transition",
        eventId: "event-unsupported",
        runId: "run-1",
        turnId: "turn-1",
        sequence: 0,
        occurredAt: "2026-04-22T00:00:00.000Z",
        hostKind: "generic",
        scope: {
          userId: "u-1",
        },
        nextState: "review",
        summary: "Move to review.",
      },
    );

    expect(result).toEqual({
      recorded: false,
      skippedReason: "unsupported_memory",
    });
  });
});
