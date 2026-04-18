import { describe, expect, it } from "bun:test";
import type { ExportMemoryResult } from "../../src";
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
              kind: "session",
              relativePath: "playbooks/incident.md",
              sessionId: "s-1",
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

    expect(result.artifacts.map((artifact) => artifact.artifactType)).toEqual([
      "playbook",
    ]);
  });

  it("fails fast on unsupported or not-yet-implemented writes", async () => {
    const adapter = createHostAdapter({
      id: "claude-authoritative",
      hostKind: "claude",
      mode: "file-authoritative",
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
