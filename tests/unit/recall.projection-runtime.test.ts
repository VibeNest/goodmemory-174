import { describe, expect, it } from "bun:test";

import { createFactMemory } from "../../src/domain/records";
import { scopeToKey } from "../../src/domain/scope";
import {
  ENTITIES_COLLECTION,
  PROJECTION_REPAIRS_COLLECTION,
  RECALL_DOCUMENTS_COLLECTION,
  SCOPE_CATALOG_COLLECTION,
  type ProjectionRepairRecord,
  type RecallIndexDocument,
  type ScopeCatalogProjection,
} from "../../src/recall/projections/contracts";
import { createRecallProjectionRuntime } from "../../src/recall/projections/runtime";
import type {
  DocumentStore,
  StorageDocument,
} from "../../src/storage/contracts";
import { createInMemoryDocumentStore } from "../../src/storage/memory";

const NOW = "2026-07-09T12:00:00.000Z";
const scope = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  agentId: "agent-1",
  sessionId: "session-1",
};

function buildFact(input: {
  content?: string;
  id?: string;
  lifecycle?: "active" | "inactive" | "superseded";
}) {
  return createFactMemory({
    ...scope,
    id: input.id ?? "fact-1",
    category: "project",
    content:
      input.content ??
      "Alice approved the Atlas migration. The rollout starts in Paris.",
    subject: "Atlas migration",
    tags: ["Atlas", "Paris"],
    lifecycle: input.lifecycle ?? "active",
    isActive: (input.lifecycle ?? "active") === "active",
    source: {
      method: "explicit",
      extractedAt: "2026-07-08T12:00:00.000Z",
    },
    validFrom: "2026-07-08T00:00:00.000Z",
    validUntil: "2026-08-08T00:00:00.000Z",
    createdAt: "2026-07-08T12:00:00.000Z",
    updatedAt: "2026-07-08T12:00:00.000Z",
  });
}

function createOneShotProjectionFailureStore(
  inner: DocumentStore,
): DocumentStore {
  let shouldFail = true;

  return {
    set: async <TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) => {
      if (collection === RECALL_DOCUMENTS_COLLECTION && shouldFail) {
        shouldFail = false;
        throw new Error("injected projection failure");
      }
      await inner.set(collection, id, document);
    },
    get: (collection, id) => inner.get(collection, id),
    update: (collection, id, patch) => inner.update(collection, id, patch),
    query: (collection, filter) => inner.query(collection, filter),
    delete: (collection, id) => inner.delete(collection, id),
    writeBatchIfUnchanged: inner.writeBatchIfUnchanged
      ? (input) => inner.writeBatchIfUnchanged!(input)
      : undefined,
  };
}

function createCountedProjectionFailureStore(
  inner: DocumentStore,
  failureCount: number,
): DocumentStore {
  let remainingFailures = failureCount;

  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
      if (
        collection === RECALL_DOCUMENTS_COLLECTION &&
        remainingFailures > 0
      ) {
        remainingFailures -= 1;
        throw new Error("injected counted projection failure");
      }
      await inner.set(collection, id, document);
    },
    get: (collection, id) => inner.get(collection, id),
    update: (collection, id, patch) => inner.update(collection, id, patch),
    query: (collection, filter) => inner.query(collection, filter),
    delete: (collection, id) => inner.delete(collection, id),
    writeBatchIfUnchanged: inner.writeBatchIfUnchanged
      ? (input) => inner.writeBatchIfUnchanged!(input)
      : undefined,
  };
}

function createContentTriggeredProjectionFailureStore(
  inner: DocumentStore,
  trigger: string,
): DocumentStore {
  let shouldFail = true;

  return {
    async set<TDocument extends StorageDocument>(
      collection: string,
      id: string,
      document: TDocument,
    ) {
      if (
        collection === RECALL_DOCUMENTS_COLLECTION &&
        shouldFail &&
        JSON.stringify(document).includes(trigger)
      ) {
        shouldFail = false;
        throw new Error("injected replacement projection failure");
      }
      await inner.set(collection, id, document);
    },
    get: (collection, id) => inner.get(collection, id),
    update: (collection, id, patch) => inner.update(collection, id, patch),
    query: (collection, filter) => inner.query(collection, filter),
    delete: (collection, id) => inner.delete(collection, id),
    writeBatchIfUnchanged: inner.writeBatchIfUnchanged
      ? (input) => inner.writeBatchIfUnchanged!(input)
      : undefined,
  };
}

function createPostCommitReadFailureStore(inner: DocumentStore): DocumentStore {
  let failCanonicalRead = true;

  return {
    set: (collection, id, document) => inner.set(collection, id, document),
    async get<TDocument extends StorageDocument>(collection: string, id: string) {
      if (collection === "facts" && failCanonicalRead) {
        failCanonicalRead = false;
        throw new Error("injected post-commit read failure");
      }
      return inner.get<TDocument>(collection, id);
    },
    update: (collection, id, patch) => inner.update(collection, id, patch),
    query: (collection, filter) => inner.query(collection, filter),
    delete: (collection, id) => inner.delete(collection, id),
    writeBatchIfUnchanged: inner.writeBatchIfUnchanged
      ? (input) => inner.writeBatchIfUnchanged!(input)
      : undefined,
  };
}

function createOneShotProjectionDeleteFailureStore(
  inner: DocumentStore,
): DocumentStore {
  let shouldFail = true;

  return {
    set: (collection, id, document) => inner.set(collection, id, document),
    get: (collection, id) => inner.get(collection, id),
    update: (collection, id, patch) => inner.update(collection, id, patch),
    query: (collection, filter) => inner.query(collection, filter),
    async delete(collection, id) {
      if (collection === RECALL_DOCUMENTS_COLLECTION && shouldFail) {
        shouldFail = false;
        throw new Error("injected projection delete failure");
      }
      await inner.delete(collection, id);
    },
    writeBatchIfUnchanged: inner.writeBatchIfUnchanged
      ? (input) => inner.writeBatchIfUnchanged!(input)
      : undefined,
  };
}

function createDelayedOldProjectionStore(inner: DocumentStore): {
  documentStore: DocumentStore;
  oldProjectionStarted: Promise<void>;
  releaseOldProjection(): void;
  secondCanonicalWriteStarted(): boolean;
} {
  let releaseOldProjection = () => {};
  let signalOldProjectionStarted = () => {};
  let shouldDelayOldProjection = true;
  let secondCanonicalWriteStarted = false;
  const oldProjectionStarted = new Promise<void>((resolve) => {
    signalOldProjectionStarted = resolve;
  });
  const oldProjectionRelease = new Promise<void>((resolve) => {
    releaseOldProjection = resolve;
  });

  return {
    documentStore: {
      async set<TDocument extends StorageDocument>(
        collection: string,
        id: string,
        document: TDocument,
      ) {
        const serialized = JSON.stringify(document);
        if (collection === "facts" && serialized.includes("Lisbon")) {
          secondCanonicalWriteStarted = true;
        }
        if (
          collection === RECALL_DOCUMENTS_COLLECTION &&
          shouldDelayOldProjection &&
          serialized.includes("Berlin")
        ) {
          shouldDelayOldProjection = false;
          signalOldProjectionStarted();
          await oldProjectionRelease;
        }
        await inner.set(collection, id, document);
      },
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      writeBatchIfUnchanged: inner.writeBatchIfUnchanged
        ? (input) => inner.writeBatchIfUnchanged!(input)
        : undefined,
    },
    oldProjectionStarted,
    releaseOldProjection,
    secondCanonicalWriteStarted: () => secondCanonicalWriteStarted,
  };
}

describe("recall projection runtime", () => {
  it("writes versioned multi-granular, entity, and scope projections after a canonical write", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const fact = buildFact({});

    await runtime.documentStore.set("facts", fact.id, fact);

    const documents = await rawStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      { sourceCollection: "facts", sourceMemoryId: fact.id },
    );
    expect(documents.length).toBeGreaterThan(1);
    expect(new Set(documents.map((document) => document.granularity))).toEqual(
      new Set(["memory", "field", "sentence"]),
    );
    expect(
      documents.every(
        (document) =>
          document.schemaVersion === 2 &&
          document.scopeKey === scopeToKey(scope) &&
          document.sourceMemoryId === fact.id &&
          document.effectiveFrom === fact.validFrom &&
          document.effectiveUntil === fact.validUntil &&
          document.provenance.method === "explicit",
      ),
    ).toBe(true);

    const entities = await runtime.queryEntities(scope);
    const alice = entities.find((entity) => entity.canonicalKey === "alice");
    expect(alice?.aliases).toContain("Alice");
    expect(alice?.memoryIds).toContain("facts:fact-1");
    expect(alice?.validFrom).toBe(fact.validFrom);

    const catalogs = await rawStore.query<ScopeCatalogProjection>(
      SCOPE_CATALOG_COLLECTION,
      { scopeKey: scopeToKey(scope) },
    );
    expect(catalogs).toEqual([
      expect.objectContaining({
        ...scope,
        coverage: "partial",
        firstSeenAt: NOW,
        lastSeenAt: NOW,
        schemaVersion: 1,
      }),
    ]);
  });

  it("uses the earliest validity boundary when both validUntil and TTL exist", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const fact = {
      ...buildFact({}),
      expiresAt: "2026-07-20T00:00:00.000Z",
      validUntil: "2026-08-08T00:00:00.000Z",
    };

    await runtime.documentStore.set("facts", fact.id, fact);
    const documents = await runtime.queryDocuments(scope);

    expect(
      documents.every(
        (document) => document.effectiveUntil === fact.expiresAt,
      ),
    ).toBe(true);
  });

  it("splits contiguous CJK sentences into separate projection documents", async () => {
    const runtime = createRecallProjectionRuntime({
      documentStore: createInMemoryDocumentStore(),
      now: () => NOW,
    });
    const fact = buildFact({
      content: "第一句话包含足够多的信息。第二句话也包含足够多的信息！",
    });

    await runtime.documentStore.set("facts", fact.id, fact);
    const sentences = (await runtime.queryDocuments(scope))
      .filter(({ granularity, text }) =>
        granularity === "sentence" && text.includes("句话"),
      )
      .map(({ text }) => text);

    expect(sentences).toEqual([
      "第一句话包含足够多的信息。",
      "第二句话也包含足够多的信息！",
    ]);
  });

  it("caps every projected document and source entity set", async () => {
    const runtime = createRecallProjectionRuntime({
      documentStore: createInMemoryDocumentStore(),
      now: () => NOW,
    });
    const entities = Array.from(
      { length: 180 },
      (_, index) => `Entity${index}`,
    ).join(" ");
    const fact = buildFact({
      id: "fact-large",
      content: `${entities} ${"x".repeat(40_000)}`,
    });

    await runtime.documentStore.set("facts", fact.id, fact);

    const documents = (await runtime.queryDocuments(scope)).filter(
      (document) => document.sourceMemoryId === fact.id,
    );
    expect(documents.every((document) => document.text.length <= 32_000)).toBe(
      true,
    );
    expect(
      new Set(documents.flatMap((document) => document.entityIds)).size,
    ).toBeLessThanOrEqual(128);
  });

  it("keeps projections aligned with a successful conditional revision batch", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const previous = buildFact({ id: "fact-old" });
    await runtime.documentStore.set("facts", previous.id, previous);

    const superseded = {
      ...previous,
      lifecycle: "superseded" as const,
      isActive: false,
      supersededBy: "fact-new",
    };
    const next = buildFact({
      id: "fact-new",
      content: "Alice moved the Atlas rollout from Paris to Lisbon.",
    });
    const committed = await runtime.documentStore.writeBatchIfUnchanged?.({
      expected: {
        collection: "facts",
        id: previous.id,
        document: previous,
      },
      set: [
        { collection: "facts", id: superseded.id, document: superseded },
        { collection: "facts", id: next.id, document: next },
      ],
    });

    expect(committed).toBe(true);
    expect(
      await rawStore.query(RECALL_DOCUMENTS_COLLECTION, {
        sourceMemoryId: previous.id,
      }),
    ).toEqual([]);
    expect(
      await rawStore.query(RECALL_DOCUMENTS_COLLECTION, {
        sourceMemoryId: next.id,
      }),
    ).not.toEqual([]);
  });

  it("removes document projections and entity adjacency after canonical deletion", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const fact = buildFact({});
    await runtime.documentStore.set("facts", fact.id, fact);

    await runtime.documentStore.delete("facts", fact.id);

    expect(
      await rawStore.query(RECALL_DOCUMENTS_COLLECTION, {
        sourceMemoryId: fact.id,
      }),
    ).toEqual([]);
    const entities = await runtime.queryEntities(scope);
    expect(
      entities.every((entity) => !entity.memoryIds.includes("facts:fact-1")),
    ).toBe(true);
  });

  it("preserves canonical success, queues projection failure, and repairs idempotently", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createOneShotProjectionFailureStore(rawStore),
      now: () => NOW,
    });
    const fact = buildFact({});

    await expect(runtime.documentStore.set("facts", fact.id, fact)).resolves.toBe(
      undefined,
    );
    expect(await rawStore.get("facts", fact.id)).toEqual(fact);
    expect(
      await rawStore.query<ProjectionRepairRecord>(
        PROJECTION_REPAIRS_COLLECTION,
        { scopeKey: scopeToKey(scope) },
      ),
    ).toHaveLength(1);

    expect(await runtime.repairPending(scope)).toBe(1);
    expect(await runtime.repairPending(scope)).toBe(0);
    expect(
      await rawStore.query(RECALL_DOCUMENTS_COLLECTION, {
        sourceMemoryId: fact.id,
      }),
    ).not.toEqual([]);
    expect(
      await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {
        scopeKey: scopeToKey(scope),
      }),
    ).toEqual([]);
  });

  it("keeps separate repair markers for consecutive failures on one source", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createCountedProjectionFailureStore(rawStore, 2),
      now: () => NOW,
    });
    const first = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    const second = buildFact({
      content: "Alice approved the Atlas migration in Lisbon.",
    });

    await runtime.documentStore.set("facts", first.id, first);
    await runtime.documentStore.set("facts", second.id, second);

    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION)).toHaveLength(2);
    expect(await runtime.repairPending(scope)).toBe(2);
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION)).toEqual([]);
  });

  it("keeps volatile repair processing inside the requested scope", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createCountedProjectionFailureStore(rawStore, 2),
      now: () => NOW,
    });
    const first = buildFact({ id: "fact-scope-a" });
    const second = {
      ...buildFact({ id: "fact-scope-b" }),
      userId: "user-2",
      tenantId: "tenant-2",
      workspaceId: "workspace-2",
      agentId: "agent-2",
      sessionId: "session-2",
    };

    await runtime.documentStore.set("facts", first.id, first);
    await runtime.documentStore.set("facts", second.id, second);

    expect(await runtime.repairPending(scope)).toBe(1);
    expect(
      await rawStore.query(RECALL_DOCUMENTS_COLLECTION, {
        sourceMemoryId: first.id,
      }),
    ).not.toEqual([]);
    expect(
      await rawStore.query(RECALL_DOCUMENTS_COLLECTION, {
        sourceMemoryId: second.id,
      }),
    ).toEqual([]);
    expect(
      await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {
        userId: second.userId,
      }),
    ).toHaveLength(1);
  });

  it("removes stale entity adjacency when repair follows a mid-replacement failure", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createContentTriggeredProjectionFailureStore(
        rawStore,
        "Lisbon",
      ),
      now: () => NOW,
    });
    const original = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    await runtime.documentStore.set("facts", original.id, original);
    const replacement = buildFact({
      content: "Bob approved the Atlas migration in Lisbon.",
    });

    await runtime.documentStore.set("facts", replacement.id, replacement);
    expect(await runtime.repairPending(scope)).toBe(1);

    const entities = await runtime.queryEntities(scope);
    expect(
      entities.find((entity) => entity.canonicalKey === "alice")?.memoryIds ?? [],
    ).not.toContain("facts:fact-1");
    expect(
      entities.find((entity) => entity.canonicalKey === "bob")?.memoryIds,
    ).toContain("facts:fact-1");
  });

  it("does not report a failed canonical write when only post-commit projection read fails", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createPostCommitReadFailureStore(rawStore),
      now: () => NOW,
    });
    const fact = buildFact({});

    await expect(runtime.documentStore.set("facts", fact.id, fact)).resolves.toBe(
      undefined,
    );
    expect(await rawStore.get("facts", fact.id)).toEqual(fact);
    expect(
      await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {
        scopeKey: scopeToKey(scope),
      }),
    ).toHaveLength(1);
  });

  it("lazily backfills historical canonical records once and marks coverage complete", async () => {
    const rawStore = createInMemoryDocumentStore();
    const historical = buildFact({ id: "fact-historical" });
    await rawStore.set("facts", historical.id, historical);
    let timestamp = NOW;
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => timestamp,
    });

    const first = await runtime.ensureScopeIndexed(scope);
    const firstDocuments = await runtime.queryDocuments(scope);
    expect(first).toMatchObject({ complete: true, indexedSources: 1, skipped: false });
    expect(firstDocuments.some((document) => document.sourceMemoryId === historical.id)).toBe(
      true,
    );
    expect(
      (await runtime.queryEntities(scope)).some(
        (projection) => projection.canonicalKey === "alice",
      ),
    ).toBe(true);
    expect(
      await rawStore.query<ScopeCatalogProjection>(SCOPE_CATALOG_COLLECTION, {
        scopeKey: scopeToKey(scope),
      }),
    ).toEqual([expect.objectContaining({ coverage: "complete" })]);

    timestamp = "2026-07-11T12:00:00.000Z";
    const second = await runtime.ensureScopeIndexed(scope);
    expect(second).toMatchObject({ complete: true, indexedSources: 0, skipped: true });
    expect((await runtime.queryDocuments(scope))[0]?.indexedAt).toBe(
      firstDocuments[0]?.indexedAt,
    );
  });

  it("reuses recall-scope verification across sessions", async () => {
    const rawStore = createInMemoryDocumentStore();
    const historical = buildFact({ id: "fact-shared-recall-scope" });
    await rawStore.set("facts", historical.id, historical);
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });

    await runtime.ensureScopeIndexed(scope);
    const secondSession = await runtime.ensureScopeIndexed({
      ...scope,
      sessionId: "session-2",
    });

    expect(secondSession).toMatchObject({
      complete: true,
      indexedSources: 0,
      skipped: true,
    });
  });

  it("bulk backfill scans projection collections once per scope", async () => {
    const rawStore = createInMemoryDocumentStore();
    for (let index = 0; index < 40; index += 1) {
      const fact = buildFact({
        id: `fact-bulk-${index}`,
        content: `Alice approved Atlas rollout checkpoint ${index} in Paris.`,
      });
      await rawStore.set("facts", fact.id, fact);
    }
    let recallDocumentQueries = 0;
    let entityQueries = 0;
    const countingStore: DocumentStore = {
      set: (collection, id, document) => rawStore.set(collection, id, document),
      get: (collection, id) => rawStore.get(collection, id),
      update: (collection, id, patch) => rawStore.update(collection, id, patch),
      async query(collection, filter) {
        if (collection === RECALL_DOCUMENTS_COLLECTION) {
          recallDocumentQueries += 1;
        } else if (collection === ENTITIES_COLLECTION) {
          entityQueries += 1;
        }
        return rawStore.query(collection, filter);
      },
      delete: (collection, id) => rawStore.delete(collection, id),
      writeBatchIfUnchanged: rawStore.writeBatchIfUnchanged
        ? (input) => rawStore.writeBatchIfUnchanged!(input)
        : undefined,
    };
    const runtime = createRecallProjectionRuntime({
      bulkBackfill: true,
      documentStore: countingStore,
      now: () => NOW,
      writeThrough: false,
    });

    const result = await runtime.ensureScopeIndexed(scope);

    expect(result).toMatchObject({
      complete: true,
      indexedSources: 40,
      skipped: false,
    });
    expect(recallDocumentQueries).toBe(1);
    expect(entityQueries).toBe(1);
  });

  it("does not let a narrow backfill mark the user-wide scope complete", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    await rawStore.set("profiles", scope.userId, {
      userId: scope.userId,
      identity: { displayName: "Projection User" },
    });
    const workspaceOne = buildFact({ id: "fact-workspace-1" });
    const workspaceTwo = {
      ...buildFact({ id: "fact-workspace-2" }),
      workspaceId: "workspace-2",
    };
    await rawStore.set("facts", workspaceOne.id, workspaceOne);
    await rawStore.set("facts", workspaceTwo.id, workspaceTwo);

    await runtime.ensureScopeIndexed(scope);
    const userWide = await runtime.ensureScopeIndexed({ userId: scope.userId });

    expect(userWide.skipped).toBe(false);
    expect(
      (await runtime.queryDocuments({ userId: scope.userId })).some(
        (document) => document.sourceMemoryId === workspaceTwo.id,
      ),
    ).toBe(false);
    expect(
      (await runtime.queryEntities({ userId: scope.userId }))
        .flatMap(({ memoryIds }) => memoryIds)
        .some((memoryId) => memoryId === `facts:${workspaceTwo.id}`),
    ).toBe(false);
  });

  it("invalidates a complete sessionless scope when a session write needs repair", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createContentTriggeredProjectionFailureStore(
        rawStore,
        "Lisbon",
      ),
      now: () => NOW,
    });
    const recallScope = { ...scope, sessionId: undefined };
    const original = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    await runtime.documentStore.set("facts", original.id, original);
    await runtime.ensureScopeIndexed(recallScope);

    await runtime.documentStore.update("facts", original.id, {
      content: "Alice approved the Atlas migration in Lisbon.",
    });

    const catalogBeforeRepair = await rawStore.get<ScopeCatalogProjection>(
      SCOPE_CATALOG_COLLECTION,
      `scope:${scopeToKey(recallScope)}`,
    );
    expect(catalogBeforeRepair?.coverage).toBe("partial");
    const repaired = await runtime.ensureScopeIndexed(recallScope);
    expect(repaired.skipped).toBe(false);
    const documents = await runtime.queryDocuments(recallScope);
    expect(documents.some(({ text }) => text.includes("Lisbon"))).toBe(true);
    expect(documents.every(({ text }) => !text.includes("Berlin"))).toBe(true);
  });

  it("revalidates persisted complete coverage once per runtime", async () => {
    const rawStore = createInMemoryDocumentStore();
    const firstRuntime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const original = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    await firstRuntime.documentStore.set("facts", original.id, original);
    await firstRuntime.ensureScopeIndexed(scope);

    await rawStore.set("facts", original.id, {
      ...original,
      content: "Alice approved the Atlas migration in Lisbon.",
    });
    const restartedRuntime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => "2026-07-12T12:00:00.000Z",
    });

    const revalidated = await restartedRuntime.ensureScopeIndexed(scope);
    const documents = await restartedRuntime.queryDocuments(scope);

    expect(revalidated.skipped).toBe(false);
    expect(documents.every((document) => !document.text.includes("Berlin"))).toBe(
      true,
    );
    expect(documents.some((document) => document.text.includes("Lisbon"))).toBe(
      true,
    );
  });

  it("does not rescan all recall documents once per entity during writes", async () => {
    const rawStore = createInMemoryDocumentStore();
    let recallDocumentQueries = 0;
    const countingStore: DocumentStore = {
      set: (collection, id, document) => rawStore.set(collection, id, document),
      get: (collection, id) => rawStore.get(collection, id),
      update: (collection, id, patch) => rawStore.update(collection, id, patch),
      async query(collection, filter) {
        if (collection === RECALL_DOCUMENTS_COLLECTION) {
          recallDocumentQueries += 1;
        }
        return rawStore.query(collection, filter);
      },
      delete: (collection, id) => rawStore.delete(collection, id),
      writeBatchIfUnchanged: rawStore.writeBatchIfUnchanged
        ? (input) => rawStore.writeBatchIfUnchanged!(input)
        : undefined,
    };
    const runtime = createRecallProjectionRuntime({
      documentStore: countingStore,
      now: () => NOW,
    });

    for (let index = 0; index < 12; index += 1) {
      const fact = buildFact({
        id: `fact-${index}`,
        content: `Person${index} approved Project${index} in City${index}.`,
      });
      await runtime.documentStore.set("facts", fact.id, fact);
    }

    // One targeted old-document lookup per source write is enough. An entity
    // implementation that rescans the full projection once per mention blows
    // this budget immediately and becomes quadratic during corpus ingestion.
    expect(recallDocumentQueries).toBeLessThanOrEqual(12);
  });

  it("preserves both direct adjacencies when two memories share an entity concurrently", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const first = buildFact({
      id: "fact-concurrent-a",
      content: "Alice approved Atlas in Paris.",
    });
    const second = buildFact({
      id: "fact-concurrent-b",
      content: "Alice reviewed Beacon in Lisbon.",
    });

    await Promise.all([
      runtime.documentStore.set("facts", first.id, first),
      runtime.documentStore.set("facts", second.id, second),
    ]);

    const alice = (await runtime.queryEntities(scope)).find(
      (entity) => entity.canonicalKey === "alice",
    );
    expect(alice?.memoryIds).toEqual([
      "facts:fact-concurrent-a",
      "facts:fact-concurrent-b",
    ]);
  });

  it("canonicalizes one entity across sessions in the same recall scope", async () => {
    const runtime = createRecallProjectionRuntime({
      documentStore: createInMemoryDocumentStore(),
      now: () => NOW,
    });
    const first = buildFact({
      id: "fact-session-a",
      content: "Alice approved Atlas in Paris.",
    });
    const second = {
      ...buildFact({
        id: "fact-session-b",
        content: "Alice reviewed Beacon in Lisbon.",
      }),
      sessionId: "session-2",
    };

    await runtime.documentStore.set("facts", first.id, first);
    await runtime.documentStore.set("facts", second.id, second);

    const alices = (await runtime.queryEntities(scope)).filter(
      (entity) => entity.canonicalKey === "alice",
    );
    expect(alices).toHaveLength(1);
    expect(alices[0]?.memoryIds).toEqual([
      "facts:fact-session-a",
      "facts:fact-session-b",
    ]);
    expect(alices[0]?.scopeKey).toBe(
      scopeToKey({ ...scope, sessionId: undefined }),
    );
    expect(alices[0]?.sessionId).toBeUndefined();
  });

  it("serializes projection replacement when the same memory is written concurrently", async () => {
    const rawStore = createInMemoryDocumentStore();
    const delayedStore = createDelayedOldProjectionStore(rawStore);
    const runtime = createRecallProjectionRuntime({
      documentStore: delayedStore.documentStore,
      now: () => NOW,
    });
    const original = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    const replacement = buildFact({
      content: "Alice approved the Atlas migration in Lisbon.",
    });

    const originalWrite = runtime.documentStore.set("facts", original.id, original);
    await delayedStore.oldProjectionStarted;
    const replacementWrite = runtime.documentStore.set(
      "facts",
      replacement.id,
      replacement,
    );
    if (delayedStore.secondCanonicalWriteStarted()) {
      await replacementWrite;
    }
    delayedStore.releaseOldProjection();
    await Promise.all([originalWrite, replacementWrite]);

    const documents = await rawStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      { sourceCollection: "facts", sourceMemoryId: original.id },
    );
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((document) => !document.text.includes("Berlin"))).toBe(
      true,
    );
    expect(documents.some((document) => document.text.includes("Lisbon"))).toBe(
      true,
    );
  });

  it("converges projection replacement across independent runtime instances", async () => {
    const rawStore = createInMemoryDocumentStore();
    const delayedStore = createDelayedOldProjectionStore(rawStore);
    const firstRuntime = createRecallProjectionRuntime({
      documentStore: delayedStore.documentStore,
      now: () => NOW,
    });
    const secondRuntime = createRecallProjectionRuntime({
      documentStore: delayedStore.documentStore,
      now: () => NOW,
    });
    const original = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    const replacement = buildFact({
      content: "Alice approved the Atlas migration in Lisbon.",
    });

    const originalWrite = firstRuntime.documentStore.set(
      "facts",
      original.id,
      original,
    );
    await delayedStore.oldProjectionStarted;
    const replacementWrite = secondRuntime.documentStore.set(
      "facts",
      replacement.id,
      replacement,
    );
    await replacementWrite;
    delayedStore.releaseOldProjection();
    await originalWrite;

    const documents = await rawStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      { sourceCollection: "facts", sourceMemoryId: original.id },
    );
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((document) => !document.text.includes("Berlin"))).toBe(
      true,
    );
    expect(documents.some((document) => document.text.includes("Lisbon"))).toBe(
      true,
    );
  });

  it("converges a stale delete repair to a memory recreated under the same id", async () => {
    const rawStore = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({
      documentStore: createOneShotProjectionDeleteFailureStore(rawStore),
      now: () => NOW,
    });
    const original = buildFact({
      content: "Alice approved the Atlas migration in Berlin.",
    });
    const replacement = buildFact({
      content: "Alice approved the Atlas migration in Lisbon.",
    });

    await runtime.documentStore.set("facts", original.id, original);
    await expect(
      runtime.documentStore.delete("facts", original.id),
    ).rejects.toThrow("projection cleanup is pending");
    await runtime.documentStore.set("facts", replacement.id, replacement);
    expect(await runtime.repairPending(scope)).toBe(1);

    const documents = await rawStore.query<RecallIndexDocument>(
      RECALL_DOCUMENTS_COLLECTION,
      { sourceCollection: "facts", sourceMemoryId: replacement.id },
    );
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((document) => !document.text.includes("Berlin"))).toBe(
      true,
    );
    expect(documents.some((document) => document.text.includes("Lisbon"))).toBe(
      true,
    );
  });
});
