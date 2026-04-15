import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import { createMemorySource } from "../../src/domain/provenance";
import { createGoodMemory } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("recall outcome scoring", () => {
  it("boosts evidence-backed fact candidates and exposes outcome attribution in traces", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
      testing: {
        now: () => new Date("2026-01-10T00:00:00.000Z"),
      },
    });

    await documentStore.set(
      "facts",
      "fact-weak",
      createFactMemory({
        id: "fact-weak",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "facts",
      "fact-strong",
      createFactMemory({
        id: "fact-strong",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
        accessCount: 4,
        lastAccessedAt: "2026-01-09T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-01-09T00:00:00.000Z",
      sessionId: "s-1",
    });
    await documentStore.set(
      "evidence",
      "evidence-1",
      createEvidenceRecord({
        id: "evidence-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "conversation_excerpt",
        excerpt: "The user reconfirmed the blocker in the latest check-in.",
        source,
        linkedMemoryIds: ["fact-strong"],
      }),
    );
    await documentStore.set(
      "evidence",
      "evidence-2",
      createEvidenceRecord({
        id: "evidence-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "verification_result",
        excerpt: "Verification still points to the same blocker.",
        source,
        linkedMemoryIds: ["fact-strong"],
      }),
    );

    const result = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      query: "What is the blocker right now?",
      retrievalProfile: "coding_agent",
    });

    expect(result.facts[0]?.id).toBe("fact-strong");
    const trace = result.metadata.candidateTraces.find((entry) => entry.memoryId === "fact-strong");
    expect(trace?.evidenceScore).toBeGreaterThan(0);
    expect(trace?.usageScore).toBeGreaterThan(0);
    expect(trace?.whyReturned).toContain("outcomeScore=");
  });
});
