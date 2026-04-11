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
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import { createFakeEmbeddingAdapter } from "../../src/testing/fakes";

describe("public forget API", () => {
  it("deletes a stored memory record by id", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
      ],
    });

    const stored = await documentStore.query<{ id: string }>("facts", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    const forgotten = await memory.forget({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      memoryId: String(stored[0]?.id),
    });

    expect(forgotten.forgotten).toBe(true);
    expect(
      await documentStore.query("facts", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(0);
  });

  it("deletes vector embeddings alongside forgettable durable memory", async () => {
    const documentStore = createInMemoryDocumentStore();
    const vectorStore = createInMemoryVectorStore();
    const embeddingAdapter = createFakeEmbeddingAdapter();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
        vectorStore,
        embeddingAdapter,
      },
    });
    const scope = { userId: "u-vector", workspaceId: "workspace-a", sessionId: "s-1" } as const;

    await memory.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
      ],
    });

    const stored = await documentStore.query<{ id: string; content: string }>("facts", {
      userId: "u-vector",
      workspaceId: "workspace-a",
    });
    const [embedding] = await embeddingAdapter.embed([String(stored[0]?.content)]);

    expect(
      await vectorStore.search("facts", embedding, {
        topK: 1,
        filter: { userId: "u-vector", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(1);

    await memory.forget({
      scope: { userId: "u-vector", workspaceId: "workspace-a" },
      memoryId: String(stored[0]?.id),
    });

    expect(
      await vectorStore.search("facts", embedding, {
        topK: 1,
        filter: { userId: "u-vector", workspaceId: "workspace-a" },
      }),
    ).toHaveLength(0);
  });

  it("returns false when the requested memory id does not exist", async () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    const result = await memory.forget({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      memoryId: "missing-memory",
    });

    expect(result.forgotten).toBe(false);
  });

  it("does not delete memory outside the requested scope", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
      ],
    });

    const stored = await documentStore.query<{ id: string }>("facts", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    const result = await memory.forget({
      scope: { userId: "u-1", workspaceId: "workspace-b" },
      memoryId: String(stored[0]?.id),
    });

    expect(result.forgotten).toBe(false);
    expect(
      await documentStore.query("facts", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("deletes session archives, evidence, and experiences by id", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" };
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-10T00:00:00.000Z",
      sessionId: "s-1",
    });
    await documentStore.set(
      SESSION_ARCHIVES_COLLECTION,
      "archive-1",
      createSessionArchive({
        id: "archive-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        summary: "Archive handoff summary.",
        unresolvedItems: ["confirm rollback owner"],
      }),
    );
    await documentStore.set(
      EVIDENCE_COLLECTION,
      "evidence-1",
      createEvidenceRecord({
        id: "evidence-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "conversation_excerpt",
        excerpt: "Need to confirm rollback owner before rollout resumes.",
        source,
      }),
    );
    await documentStore.set(
      EXPERIENCES_COLLECTION,
      "experience-1",
      createExperienceRecord({
        id: "experience-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "session_end",
        traceId: "trace-1",
        summary: "Archived one unresolved rollback task.",
      }),
    );

    expect(
      await memory.forget({
        scope,
        memoryId: "archive-1",
      }),
    ).toEqual({ forgotten: true });
    expect(
      await memory.forget({
        scope,
        memoryId: "evidence-1",
      }),
    ).toEqual({ forgotten: true });
    expect(
      await memory.forget({
        scope,
        memoryId: "experience-1",
      }),
    ).toEqual({ forgotten: true });

    expect(await documentStore.get(SESSION_ARCHIVES_COLLECTION, "archive-1")).toBeNull();
    expect(await documentStore.get(EVIDENCE_COLLECTION, "evidence-1")).toBeNull();
    expect(await documentStore.get(EXPERIENCES_COLLECTION, "experience-1")).toBeNull();
  });
});
