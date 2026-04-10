import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import { createMemorySource } from "../../src/domain/provenance";
import { createEvidenceRecord, EVIDENCE_COLLECTION } from "../../src/evidence/contracts";
import {
  createExperienceRecord,
  createSessionArchive,
  EXPERIENCES_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "../../src/evolution/contracts";
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
    await documentStore.set(
      SESSION_ARCHIVES_COLLECTION,
      "archive-export-s1",
      createSessionArchive({
        id: "archive-export-s1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        summary: "Archive for export session one.",
        unresolvedItems: ["verify prod"],
      }),
    );
    await documentStore.set(
      SESSION_ARCHIVES_COLLECTION,
      "archive-export-s2",
      createSessionArchive({
        id: "archive-export-s2",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        summary: "Archive for export session two.",
        unresolvedItems: ["keep session two"],
      }),
    );
    await documentStore.set(
      EVIDENCE_COLLECTION,
      "evidence-export-s1",
      createEvidenceRecord({
        id: "evidence-export-s1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "conversation_excerpt",
        excerpt: "session-one export evidence",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-04-02T00:00:00.000Z",
          sessionId: "s-1",
        }),
      }),
    );
    await documentStore.set(
      EVIDENCE_COLLECTION,
      "evidence-export-s2",
      createEvidenceRecord({
        id: "evidence-export-s2",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        kind: "conversation_excerpt",
        excerpt: "session-two export evidence",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-04-02T00:00:00.000Z",
          sessionId: "s-2",
        }),
      }),
    );
    await documentStore.set(
      EXPERIENCES_COLLECTION,
      "experience-export-s1",
      createExperienceRecord({
        id: "experience-export-s1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "session_end",
        traceId: "trace-export-s1",
        summary: "session-one export experience",
      }),
    );
    await documentStore.set(
      EXPERIENCES_COLLECTION,
      "experience-export-s2",
      createExperienceRecord({
        id: "experience-export-s2",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        kind: "session_end",
        traceId: "trace-export-s2",
        summary: "session-two export experience",
      }),
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
    expect(durableOnly.durable.archives).toHaveLength(1);
    expect(durableOnly.durable.evidence).toHaveLength(2);
    expect(durableOnly.durable.experiences).toHaveLength(1);
    expect(
      durableOnly.durable.facts.every((fact) => fact.sessionId === "s-1"),
    ).toBe(true);
    expect(durableOnly.durable.archives[0]?.id).toBe("archive-export-s1");
    expect(
      durableOnly.durable.evidence.some((record) => record.id === "evidence-export-s1"),
    ).toBe(true);
    expect(durableOnly.durable.experiences[0]?.id).toBe("experience-export-s1");
    expect(durableOnly.runtime).toBeUndefined();
    expect(globalExport.durable.profile?.identity.name).toBe("Lin");
    expect(globalExport.durable.archives).toHaveLength(2);
    expect(globalExport.durable.evidence).toHaveLength(4);
    expect(globalExport.durable.experiences).toHaveLength(2);
    expect(durableOnly.artifacts.rootPath).toBe(
      ".goodmemory/users/u-1/workspaces/workspace-a/sessions/s-1",
    );
    expect(durableOnly.artifacts.files.map((file) => file.relativePath)).toEqual([
      "user.md",
      "MEMORY.md",
      "session.md",
    ]);
    expect(durableOnly.artifacts.files[1]?.content).toContain(
      "migration rollout is blocked on prod verification.",
    );
    expect(withRuntime.artifacts.files[2]?.content).toContain("Current goal: Finish rollout");
    expect(withRuntime.artifacts.files[2]?.content).toContain(
      "Very large runtime-only payload for session one.",
    );
    const withRuntimeAgain = await memory.exportMemory({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      includeRuntime: true,
    });
    expect(withRuntimeAgain.artifacts).toEqual(withRuntime.artifacts);
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
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-02T00:00:00.000Z",
      sessionId: "s-1",
    });
    await documentStore.set(
      SESSION_ARCHIVES_COLLECTION,
      "archive-s1",
      createSessionArchive({
        id: "archive-s1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        summary: "Scoped archive for session one.",
        unresolvedItems: ["follow the session-one rollout"],
      }),
    );
    await documentStore.set(
      SESSION_ARCHIVES_COLLECTION,
      "archive-s9",
      createSessionArchive({
        id: "archive-s9",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-9",
        summary: "Scoped archive for session nine.",
        unresolvedItems: ["keep session nine"],
      }),
    );
    await documentStore.set(
      EVIDENCE_COLLECTION,
      "evidence-s1",
      createEvidenceRecord({
        id: "evidence-s1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "conversation_excerpt",
        excerpt: "session-one evidence",
        source,
      }),
    );
    await documentStore.set(
      EVIDENCE_COLLECTION,
      "evidence-s9",
      createEvidenceRecord({
        id: "evidence-s9",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-9",
        kind: "conversation_excerpt",
        excerpt: "session-nine evidence",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-04-02T00:00:00.000Z",
          sessionId: "s-9",
        }),
      }),
    );
    await documentStore.set(
      EXPERIENCES_COLLECTION,
      "experience-s1",
      createExperienceRecord({
        id: "experience-s1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "session_end",
        traceId: "trace-s1",
        summary: "session-one experience",
      }),
    );
    await documentStore.set(
      EXPERIENCES_COLLECTION,
      "experience-s9",
      createExperienceRecord({
        id: "experience-s9",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-9",
        kind: "session_end",
        traceId: "trace-s9",
        summary: "session-nine experience",
      }),
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
    expect(result.deleted.archives).toBe(1);
    expect(result.deleted.evidence).toBe(2);
    expect(result.deleted.experiences).toBe(1);
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
    expect(exportedA.artifacts.rootPath).toBe(
      ".goodmemory/users/u-1/workspaces/workspace-a/sessions/s-1",
    );
    expect(exportedOtherSession.artifacts.rootPath).toBe(
      ".goodmemory/users/u-1/workspaces/workspace-a/sessions/s-9",
    );
    expect(await documentStore.get(SESSION_ARCHIVES_COLLECTION, "archive-s1")).toBeNull();
    expect(await documentStore.get(SESSION_ARCHIVES_COLLECTION, "archive-s9")).not.toBeNull();
    expect(await documentStore.get(EVIDENCE_COLLECTION, "evidence-s1")).toBeNull();
    expect(await documentStore.get(EVIDENCE_COLLECTION, "evidence-s9")).not.toBeNull();
    expect(await documentStore.get(EXPERIENCES_COLLECTION, "experience-s1")).toBeNull();
    expect(await documentStore.get(EXPERIENCES_COLLECTION, "experience-s9")).not.toBeNull();
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
