import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import { createArtifactSpilloverService } from "../../src/runtime/spillover";

describe("public governance API", () => {
  it("exports scoped durable memory and optional runtime memory", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "My name is Lin.",
        },
        {
          role: "user",
          content: "Remember that the migration rollout is blocked on prod verification.",
        },
        { role: "assistant", content: "Noted." },
        { role: "user", content: "I prefer bullet points in project summaries." },
      ],
    });
    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content: "Remember that a different rollout is healthy in session two.",
        },
      ],
    });
    await sessionStore.saveWorkingMemory(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      {
        sessionId: "s-1",
        userId: "u-1",
        currentGoal: "Finish rollout",
        openLoops: ["verify prod"],
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    );
    const spillover = createArtifactSpilloverService({
      documentStore,
    });
    await spillover.spill(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      {
        kind: "tool_result",
        sourceId: "tool-1",
        content: "Very large runtime-only payload for session one.",
      },
    );
    await spillover.spill(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      {
        kind: "tool_result",
        sourceId: "tool-2",
        content: "Very large runtime-only payload for session two.",
      },
    );

    const durableOnly = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
    });
    const withRuntime = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      includeRuntime: true,
    });
    const globalExport = await memory.exportMemory({
      scope: { userId: "u-1" },
    });

    expect(durableOnly.durable.profile).toBeNull();
    expect(durableOnly.durable.facts).toHaveLength(1);
    expect(durableOnly.durable.preferences).toHaveLength(1);
    expect(
      durableOnly.durable.facts.every((fact) => fact.sessionId === "s-1"),
    ).toBe(true);
    expect(durableOnly.runtime).toBeUndefined();
    expect(globalExport.durable.profile?.identity.name).toBe("Lin");
    expect(withRuntime.runtime?.workingMemory?.currentGoal).toBe("Finish rollout");
    expect(withRuntime.runtime?.spills).toHaveLength(1);
    expect(withRuntime.runtime?.spills[0]?.sourceId).toBe("tool-1");
  });

  it("deletes all scoped memory without touching other scopes", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [{ role: "user", content: "Remember that workspace A rollout is blocked." }],
    });
    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-9" },
      messages: [{ role: "user", content: "Remember that workspace A session nine needs follow-up." }],
    });
    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-b", sessionId: "s-2" },
      messages: [{ role: "user", content: "Remember that workspace B rollout is healthy." }],
    });
    await sessionStore.saveWorkingMemory(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-9" },
      {
        sessionId: "s-9",
        userId: "u-1",
        currentGoal: "Keep session nine",
        openLoops: ["follow-up"],
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    );
    await sessionStore.saveJournal(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      {
        sessionId: "s-1",
        userId: "u-1",
        worklog: ["A journal entry"],
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    );
    const spillover = createArtifactSpilloverService({
      documentStore,
    });
    await spillover.spill(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      {
        kind: "tool_result",
        sourceId: "tool-a",
        content: "Session one spill payload",
      },
    );
    await spillover.spill(
      { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-9" },
      {
        kind: "tool_result",
        sourceId: "tool-b",
        content: "Session nine spill payload",
      },
    );

    const result = await memory.deleteAllMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
    });
    const recallA = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      query: "How should I answer this user?",
    });
    const recallB = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-b", sessionId: "s-2" },
      query: "How should I answer this user?",
    });
    const recallAOtherSession = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-9" },
      query: "How should I answer this user?",
      retrievalProfile: "coding_agent",
    });
    const exportedA = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      includeRuntime: true,
    });
    const exportedOtherSession = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-9" },
      includeRuntime: true,
    });

    expect(result.deleted.facts).toBe(1);
    expect(result.deleted.journal).toBe(1);
    expect(result.deleted.artifactSpills).toBe(1);
    expect(
      recallA.facts.some((fact) => fact.content.includes("workspace A rollout is blocked")),
    ).toBe(false);
    expect(recallB.facts).toHaveLength(1);
    expect(recallAOtherSession.facts).toHaveLength(1);
    expect(recallAOtherSession.workingMemory?.currentGoal).toBe("Keep session nine");
    expect(recallA.workingMemory).toBeNull();
    expect(recallA.journal).toBeNull();
    expect(exportedA.runtime?.spills).toHaveLength(0);
    expect(exportedOtherSession.runtime?.spills).toHaveLength(1);
  });

  it("returns an empty recall when ignoreMemory is enabled even if data exists", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [{ role: "user", content: "Remember that the rollout is blocked." }],
    });

    const result = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      query: "What do you remember?",
      ignoreMemory: true,
    });

    expect(result.facts).toHaveLength(0);
    expect(result.metadata.hits).toHaveLength(0);
    expect(result.metadata.policyApplied).toContain("ignore_memory");
  });

  it("supports shouldRecall and resolveConflict hooks", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      policy: {
        shouldRecall(record) {
          return record.memoryType !== "reference";
        },
        resolveConflict() {
          return {
            action: "keep_existing",
            reason: "policy_keep_existing",
          };
        },
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Use docs/runbook-v1.md as the source of truth for rollout work.",
        },
      ],
    });
    const correction = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content:
            "Correction: docs/runbook-v2.md is now the source of truth, not docs/runbook-v1.md. Please update that.",
        },
      ],
    });
    const recall = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      query: "Use the remembered runbook to continue the rollout.",
    });

    expect(correction.events.some((event) => event.reason === "policy_keep_existing")).toBe(
      true,
    );
    expect(recall.references).toHaveLength(0);
    expect(recall.metadata.policyApplied).toContain("custom_shouldRecall");
  });

  it("blocks cross-workspace recall by default when workspace is omitted", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [{ role: "user", content: "Remember that workspace A rollout is blocked." }],
    });

    const result = await memory.recall({
      scope: { userId: "u-1", sessionId: "s-1" },
      query: "How should I answer this user?",
    });

    expect(result.facts).toHaveLength(0);
    expect(result.metadata.policyApplied).toContain("default_scope_guard");
  });

  it("blocks cross-tenant recall by default when tenant is omitted", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    await memory.remember({
      scope: {
        userId: "u-1",
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        sessionId: "s-1",
      },
      messages: [{ role: "user", content: "Remember that tenant A rollout is blocked." }],
    });

    const result = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      query: "How should I answer this user?",
    });

    expect(result.facts).toHaveLength(0);
    expect(result.metadata.policyApplied).toContain("default_scope_guard");
  });

  it("does not export or delete the global profile for tenant-scoped governance calls", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    await memory.remember({
      scope: {
        userId: "u-1",
        tenantId: "tenant-a",
        sessionId: "s-1",
      },
      messages: [{ role: "user", content: "My name is Lin." }],
    });

    const tenantScopedExport = await memory.exportMemory({
      scope: { userId: "u-1", tenantId: "tenant-a" },
    });
    const deleteResult = await memory.deleteAllMemory({
      scope: { userId: "u-1", tenantId: "tenant-a" },
    });
    const globalExport = await memory.exportMemory({
      scope: { userId: "u-1" },
    });

    expect(tenantScopedExport.durable.profile).toBeNull();
    expect(deleteResult.deleted.profiles).toBe(0);
    expect(globalExport.durable.profile?.identity.name).toBe("Lin");
  });
});
