import { describe, expect, it } from "bun:test";
import { createEvidenceRecord } from "../../src/evidence/contracts";

describe("evidence contracts", () => {
  it("creates selective evidence records with stable defaults", () => {
    const evidence = createEvidenceRecord({
      id: "ev-1",
      userId: "u-1",
      kind: "conversation_excerpt",
      excerpt: "The user confirmed the migration rollback window is Friday night.",
      source: {
        method: "explicit",
        extractedAt: "2026-04-10T00:00:00.000Z",
        sessionId: "s-1",
      },
      linkedMemoryIds: ["fact-1"],
    });

    expect(evidence.kind).toBe("conversation_excerpt");
    expect(evidence.linkedMemoryIds).toEqual(["fact-1"]);
    expect(evidence.linkedArchiveIds).toEqual([]);
    expect(evidence.createdAt).toBe("2026-04-10T00:00:00.000Z");
  });

  it("keeps optional archive links, source metadata, and scope fields", () => {
    const evidence = createEvidenceRecord({
      id: "ev-2",
      userId: "u-1",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      agentId: "agent-a",
      sessionId: "s-2",
      kind: "verification_result",
      excerpt: "Verification showed the previous rollout checklist was stale.",
      source: {
        method: "confirmed",
        extractedAt: "2026-04-10T01:00:00.000Z",
        locale: "zh-CN",
      },
      linkedArchiveIds: ["archive-1"],
      sourceUri: "docs/checklists/runtime.md",
      sourceMessageIds: ["m-1", "m-2"],
    });

    expect(evidence.linkedMemoryIds).toEqual([]);
    expect(evidence.linkedArchiveIds).toEqual(["archive-1"]);
    expect(evidence.sourceUri).toBe("docs/checklists/runtime.md");
    expect(evidence.sourceMessageIds).toEqual(["m-1", "m-2"]);
    expect(evidence.workspaceId).toBe("workspace-a");
  });
});
