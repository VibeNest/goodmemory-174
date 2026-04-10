import { describe, expect, it } from "bun:test";
import {
  createExperienceRecord,
  createSessionArchive,
} from "../../src/evolution/contracts";

describe("evolution contracts", () => {
  it("creates session archive records with continuity defaults", () => {
    const archive = createSessionArchive({
      id: "archive-1",
      userId: "u-1",
      sessionId: "s-1",
      summary: "The session closed after narrowing the rollback window and next verification step.",
    });

    expect(archive.sourceSessionIds).toEqual(["s-1"]);
    expect(archive.keyDecisions).toEqual([]);
    expect(archive.unresolvedItems).toEqual([]);
    expect(archive.referencedArtifacts).toEqual([]);
  });

  it("keeps optional normalized transcript, lineage, and scoped metadata", () => {
    const archive = createSessionArchive({
      id: "archive-2",
      userId: "u-1",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agentId: "agent-a",
      sessionId: "s-2",
      summary: "The session ended with a handoff to the runtime migration checklist.",
      normalizedTranscript: "user: check the runtime checklist\nassistant: next step is signoff",
      keyDecisions: ["Use the runtime checklist as the handoff source of truth."],
      unresolvedItems: ["confirm signoff owner"],
      referencedArtifacts: ["session-memory/s-2.md"],
      scopeLineage: ["tenant-a", "workspace-a"],
      locale: "en-US",
      createdAt: "2026-04-10T02:00:00.000Z",
      archivedAt: "2026-04-10T02:05:00.000Z",
    });

    expect(archive.normalizedTranscript).toContain("runtime checklist");
    expect(archive.scopeLineage).toEqual(["tenant-a", "workspace-a"]);
    expect(archive.locale).toBe("en-US");
    expect(archive.archivedAt).toBe("2026-04-10T02:05:00.000Z");
  });

  it("creates experience records with append-only telemetry defaults", () => {
    const experience = createExperienceRecord({
      id: "xp-1",
      userId: "u-1",
      sessionId: "s-1",
      kind: "recall",
      traceId: "trace-1",
      summary: "Recall finished with one policy marker and two durable hits.",
    });

    expect(experience.kind).toBe("recall");
    expect(experience.outcome).toBe("success");
    expect(experience.linkedMemoryIds).toEqual([]);
    expect(experience.linkedEvidenceIds).toEqual([]);
  });
});
