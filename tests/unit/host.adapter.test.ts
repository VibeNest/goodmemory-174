import { describe, expect, it } from "bun:test";
import type {
  ArtifactSpillRecord,
  ExportMemoryResult,
} from "../../src";
import {
  createInMemoryDocumentStore,
  createFeedbackMemory,
  createMemorySource,
  createReferenceMemory,
  createSessionJournal,
  createWorkingMemorySnapshot,
} from "../../src";
import { createHostAdapter } from "../../src/host";
import type { HostArtifactType } from "../../src/host";

function createExportResult(
  extraFiles: ExportMemoryResult["artifacts"]["files"] = [],
): ExportMemoryResult {
  return {
    artifacts: {
      rootPath: ".goodmemory/users/u-1/workspaces/ws-1/sessions/s-1",
      files: [
        {
          kind: "memory",
          relativePath: "MEMORY.md",
          content: "# MEMORY",
        },
        {
          kind: "user",
          relativePath: "user.md",
          content: "# User Memory",
        },
        {
          kind: "session",
          relativePath: "session.md",
          sessionId: "s-1",
          content: "# Session Memory: s-1",
        },
        ...extraFiles,
      ],
    },
    scope: {
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
    },
    exportedAt: "2026-04-19T00:00:00.000Z",
    durable: {
      profile: null,
      preferences: [],
      references: [],
      facts: [],
      feedback: [],
      episodes: [],
      archives: [],
      evidence: [],
      experiences: [],
      proposals: [],
      promotions: [],
    },
    runtime: {
      workingMemory: null,
      journal: null,
      spills: [],
    },
  };
}

function createCodingAgentExportResult(currentGoal: string): ExportMemoryResult {
  const source = createMemorySource({
    method: "explicit",
    extractedAt: "2026-04-19T00:00:00.000Z",
    sessionId: "s-1",
  });
  const spill: ArtifactSpillRecord = {
    id: "spill-1",
    scope: {
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
    },
    kind: "tool_result",
    sourceId: "tool-1",
    preview: "Rollback checklist excerpt",
    replacementText: "[spill-1]",
    storageUri: "memory://spill-1",
    originalBytes: 256,
    createdAt: "2026-04-19T00:00:00.000Z",
  };

  return {
    ...createExportResult(),
    durable: {
      ...createExportResult().durable,
      references: [
        createReferenceMemory({
          id: "ref-1",
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
          title: "Runtime runbook",
          pointer: "docs/runtime-runbook.md",
          source,
          updatedAt: "2026-04-19T00:00:00.000Z",
          createdAt: "2026-04-19T00:00:00.000Z",
        }),
      ],
      feedback: [
        createFeedbackMemory({
          id: "feedback-1",
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
          rule: "Keep coding task updates concise and action-oriented.",
          kind: "validated_pattern",
          source,
          updatedAt: "2026-04-19T00:00:00.000Z",
        }),
      ],
    },
    runtime: {
      workingMemory: createWorkingMemorySnapshot({
        sessionId: "s-1",
        userId: "u-1",
        currentGoal,
        openLoops: ["wire buildContext output"],
        temporaryDecisions: ["Use the rollback checklist before deploy."],
        constraints: ["Keep context budget under control."],
        updatedAt: "2026-04-19T00:00:00.000Z",
      }),
      journal: createSessionJournal({
        sessionId: "s-1",
        userId: "u-1",
        currentState: "Recall router implemented.",
        filesAndFunctions: ["src/recall/engine.ts", "src/recall/contextBuilder.ts"],
        workflow: ["Verify the rollback checklist", "Wire buildContext output"],
        keyResults: ["Recall router implemented."],
        worklog: ["Checked the rollback checklist."],
        updatedAt: "2026-04-19T00:00:00.000Z",
      }),
      spills: [spill],
    },
  };
}

describe("host adapter contract", () => {
  it("declares explicit file-assisted capabilities and filters readable artifact types", async () => {
    const adapter = createHostAdapter({
      id: "codex-readonly",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult();
        },
      },
      readableArtifactTypes: ["memory_index", "session_memory"],
    });

    expect(adapter.capabilities.mode).toBe("file-assisted");
    expect(adapter.capabilities.readableArtifactTypes).toEqual([
      "memory_index",
      "session_memory",
    ]);
    expect(adapter.capabilities.writableArtifactTypes).toEqual([]);

    const result = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(result.artifacts.map((artifact) => artifact.artifactType)).toEqual([
      "memory_index",
      "session_memory",
    ]);
    expect(result.artifacts.every((artifact) => artifact.writable === false)).toBeTrue();
  });

  it("freezes negotiated capabilities so hosts cannot widen file-assisted boundaries at runtime", async () => {
    const adapter = createHostAdapter({
      id: "codex-frozen",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult();
        },
      },
      readableArtifactTypes: ["memory_index"],
    });

    expect(Object.isFrozen(adapter)).toBeTrue();
    expect(Object.isFrozen(adapter.capabilities)).toBeTrue();
    expect(Object.isFrozen(adapter.capabilities.readableArtifactTypes)).toBeTrue();
    expect(Object.isFrozen(adapter.capabilities.writableArtifactTypes)).toBeTrue();

    expect(() =>
      (adapter.capabilities.readableArtifactTypes as HostArtifactType[]).push(
        "user_memory",
      ),
    ).toThrow();

    const result = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(result.artifacts.map((artifact) => artifact.artifactType)).toEqual([
      "memory_index",
    ]);

    await expect(
      adapter.writeArtifact({
        scope: {
          userId: "u-1",
          workspaceId: "ws-1",
        },
        artifactType: "user_memory",
        relativePath: "user.md",
        content: "# User Memory",
      }),
    ).rejects.toThrow("does not allow writes for artifact type user_memory");
  });

  it("rejects invalid writable capability negotiation during adapter creation", () => {
    const documentStore = createInMemoryDocumentStore();

    expect(() =>
      createHostAdapter({
        id: "claude-invalid-mode",
        mode: "file-assisted",
        writableArtifactTypes: ["user_memory"],
        memory: {
          async exportMemory() {
            return createExportResult();
          },
        },
      }),
    ).toThrow("file-assisted adapters cannot declare writable artifact types");

    expect(() =>
      createHostAdapter({
        id: "claude-invalid-subset",
        mode: "file-authoritative",
        documentStore,
        readableArtifactTypes: ["memory_index"],
        writableArtifactTypes: ["user_memory"],
        memory: {
          async exportMemory() {
            return createExportResult();
          },
        },
      }),
    ).toThrow("writable artifact types must be a subset of readable artifact types");
  });

  it("rejects readable capability claims that the configured export surface cannot supply", () => {
    expect(() =>
      createHostAdapter({
        id: "codex-unsupported-playbook",
        readableArtifactTypes: ["playbook"],
        supportedReadableArtifactTypes: ["memory_index", "user_memory", "session_memory"],
        memory: {
          async exportMemory() {
            return createExportResult();
          },
        },
      }),
    ).toThrow(
      "readable artifact types must be supported by the configured export surface",
    );
  });

  it("allows future artifact types only when the export surface opts into them explicitly", async () => {
    const adapter = createHostAdapter({
      id: "codex-playbook",
      readableArtifactTypes: ["playbook"],
      supportedReadableArtifactTypes: ["memory_index", "user_memory", "session_memory", "playbook"],
      memory: {
        async exportMemory() {
          return createExportResult([
            {
              kind: "playbook",
              relativePath: "playbooks/incident.md",
              content: "# Incident Playbook",
            },
            {
              kind: "playbook",
              relativePath: "playbooks/incident.prompt.md",
              content: "# Prompt Snippet: Incident Playbook",
            },
            {
              kind: "playbook",
              relativePath: "playbooks/incident.skill.md",
              content: "# Skill Snippet: Incident Playbook",
            },
          ]);
        },
      },
    });

    const result = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(result.artifacts.map((artifact) => artifact.artifactType)).toEqual([
      "playbook",
      "playbook",
      "playbook",
    ]);
    expect(result.artifacts.map((artifact) => artifact.relativePath)).toEqual([
      "playbooks/incident.md",
      "playbooks/incident.prompt.md",
      "playbooks/incident.skill.md",
    ]);
  });

  it("supports playbook artifacts through the default file-assisted readable surface", async () => {
    const adapter = createHostAdapter({
      id: "codex-playbook-default-surface",
      readableArtifactTypes: ["playbook"],
      memory: {
        async exportMemory() {
          return createExportResult([
            {
              kind: "playbook",
              relativePath: "playbooks/incident.md",
              content: "# Incident Playbook",
            },
          ]);
        },
      },
    });

    const result = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(result.artifacts.map((artifact) => artifact.artifactType)).toEqual(["playbook"]);
    expect(result.artifacts[0]?.relativePath).toBe("playbooks/incident.md");
  });

  it("exposes archive recap artifacts through the host read path", async () => {
    const adapter = createHostAdapter({
      id: "codex-archive",
      readableArtifactTypes: ["archive_recap"],
      memory: {
        async exportMemory() {
          return createExportResult([
            {
              kind: "archive",
              relativePath: "archive/2026/04/s-1.md",
              sessionId: "s-1",
              content: "# Archive Recap: s-1",
            },
          ]);
        },
      },
    });

    const result = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
      },
    });

    expect(result.artifacts.map((artifact) => artifact.artifactType)).toEqual([
      "archive_recap",
    ]);
    expect(result.artifacts[0]?.relativePath).toBe("archive/2026/04/s-1.md");
  });

  it("maps session artifacts into handoff files and refreshes them from runtime state", async () => {
    let currentGoal = "Finish recall engine";

    const adapter = createHostAdapter({
      id: "codex-session-handoff",
      hostKind: "codex",
      readableArtifactTypes: ["session_memory"],
      memory: {
        async exportMemory() {
          return createCodingAgentExportResult(currentGoal);
        },
      },
    });

    const first = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(first.artifacts).toHaveLength(1);
    expect(first.artifacts[0]?.relativePath).toBe("session-memory/s-1.md");
    expect(first.artifacts[0]?.content).toContain("# Session Handoff: s-1");
    expect(first.artifacts[0]?.content).toContain("## Current Goal");
    expect(first.artifacts[0]?.content).toContain("Finish recall engine");
    expect(first.artifacts[0]?.content).toContain("## Open Loops");
    expect(first.artifacts[0]?.content).toContain("wire buildContext output");
    expect(first.artifacts[0]?.content).toContain("## Recent Decisions");
    expect(first.artifacts[0]?.content).toContain("Use the rollback checklist before deploy.");
    expect(first.artifacts[0]?.content).toContain("## Key Files");
    expect(first.artifacts[0]?.content).toContain("src/recall/engine.ts");
    expect(first.artifacts[0]?.content).toContain("docs/runtime-runbook.md");
    expect(first.artifacts[0]?.content).toContain("## Procedural Memory");
    expect(first.artifacts[0]?.content).toContain(
      "Keep coding task updates concise and action-oriented.",
    );
    expect(first.artifacts[0]?.content).toContain("## Artifact Spills");
    expect(first.artifacts[0]?.content).toContain("Rollback checklist excerpt");

    currentGoal = "Ship host adapter";

    const second = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(second.artifacts[0]?.content).toContain("Ship host adapter");
    expect(second.artifacts[0]?.content).not.toContain("Finish recall engine");
  });

  it("keeps session handoff projections limited to active references and procedural memory", async () => {
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-19T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-session-handoff-active-only",
      hostKind: "codex",
      readableArtifactTypes: ["session_memory"],
      memory: {
        async exportMemory() {
          return {
            ...createExportResult(),
            durable: {
              ...createExportResult().durable,
              references: [
                createReferenceMemory({
                  id: "ref-active",
                  userId: "u-1",
                  workspaceId: "ws-1",
                  sessionId: "s-1",
                  title: "Runtime runbook",
                  pointer: "docs/runtime-runbook.md",
                  source,
                  updatedAt: "2026-04-19T00:00:00.000Z",
                  createdAt: "2026-04-19T00:00:00.000Z",
                }),
                createReferenceMemory({
                  id: "ref-superseded",
                  userId: "u-1",
                  workspaceId: "ws-1",
                  sessionId: "s-1",
                  title: "Old runtime runbook",
                  pointer: "docs/runtime-runbook-v1.md",
                  source,
                  lifecycle: "superseded",
                  updatedAt: "2026-04-19T00:00:00.000Z",
                  createdAt: "2026-04-19T00:00:00.000Z",
                }),
              ],
              feedback: [
                createFeedbackMemory({
                  id: "feedback-active",
                  userId: "u-1",
                  workspaceId: "ws-1",
                  sessionId: "s-1",
                  rule: "Use pnpm.",
                  kind: "validated_pattern",
                  source,
                  updatedAt: "2026-04-19T00:00:00.000Z",
                }),
                createFeedbackMemory({
                  id: "feedback-superseded",
                  userId: "u-1",
                  workspaceId: "ws-1",
                  sessionId: "s-1",
                  rule: "Use npm.",
                  kind: "validated_pattern",
                  source,
                  lifecycle: "superseded",
                  supersededBy: "feedback-active",
                  updatedAt: "2026-04-19T00:00:00.000Z",
                }),
                createFeedbackMemory({
                  id: "feedback-inactive",
                  userId: "u-1",
                  workspaceId: "ws-1",
                  sessionId: "s-1",
                  rule: "Use yarn.",
                  kind: "validated_pattern",
                  source,
                  lifecycle: "inactive",
                  updatedAt: "2026-04-19T00:00:00.000Z",
                }),
              ],
            },
          };
        },
      },
    });

    const result = await adapter.readArtifacts({
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      includeRuntime: true,
    });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.content).toContain("Use pnpm.");
    expect(result.artifacts[0]?.content).not.toContain("Use npm.");
    expect(result.artifacts[0]?.content).not.toContain("Use yarn.");
    expect(result.artifacts[0]?.content).toContain("docs/runtime-runbook.md");
    expect(result.artifacts[0]?.content).not.toContain("docs/runtime-runbook-v1.md");
  });

  it("fails fast on unsupported or not-yet-implemented writes", async () => {
    const documentStore = createInMemoryDocumentStore();
    const adapter = createHostAdapter({
      id: "claude-authoritative",
      hostKind: "claude",
      mode: "file-authoritative",
      documentStore,
      readableArtifactTypes: ["user_memory"],
      writableArtifactTypes: ["user_memory"],
      memory: {
        async exportMemory() {
          return createExportResult();
        },
      },
    });

    await expect(
      adapter.writeArtifact({
        scope: {
          userId: "u-1",
          workspaceId: "ws-1",
        },
        artifactType: "playbook",
        relativePath: "playbooks/incident.md",
        content: "# Incident Playbook",
      }),
    ).rejects.toThrow("does not allow writes for artifact type playbook");

    await expect(
      adapter.writeArtifact({
        scope: {
          userId: "u-1",
          workspaceId: "ws-1",
        },
        artifactType: "user_memory",
        relativePath: "user.md",
        content: "# User Memory",
      }),
    ).rejects.toThrow("Structured delta writeback is not implemented yet");
  });
});
