import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createEpisodeMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";

describe("recall verification hints", () => {
  it("exposes verification hints in recall metadata for stale action-driving facts", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
    });

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2025-01-01T00:00:00.000Z" },
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
    );

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
      testing: {
        now: () => new Date("2026-04-02T00:00:00.000Z"),
      },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      query: "Proceed with the migration plan using the remembered status.",
      retrievalProfile: "general_chat",
    });

    expect(result.metadata.verificationHints).toHaveLength(1);
    expect(result.metadata.verificationHints?.[0]?.memoryId).toBe("fact-1");
  });

  it("exposes verification hints for stale references while keeping slot-specific queries from pulling generic episodes", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
    });

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        title: "Runbook",
        pointer: "docs/runbook.md",
        source: { method: "explicit", extractedAt: "2025-12-01T00:00:00.000Z" },
        createdAt: "2025-12-01T00:00:00.000Z",
        updatedAt: "2025-12-01T00:00:00.000Z",
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "ep-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        summary: "Previous rollout used the old checklist and manual verification.",
        topics: ["rollout", "workflow"],
        keyDecisions: [],
        unresolvedItems: [],
        importance: 0.8,
        confidence: 0.9,
        createdAt: "2025-12-15T00:00:00.000Z",
      }),
    );

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
      testing: {
        now: () => new Date("2026-04-02T00:00:00.000Z"),
      },
    });

    const result = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      query: "Use the remembered runbook and workflow to execute the rollout.",
      retrievalProfile: "general_chat",
    });

    expect(result.metadata.verificationHints.map((hint) => hint.memoryType)).toEqual([
      "reference",
    ]);
    expect(result.episodes).toHaveLength(0);
  });
});
