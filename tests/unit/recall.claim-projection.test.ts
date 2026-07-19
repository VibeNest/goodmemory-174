import { describe, expect, it } from "bun:test";

import { createFactMemory } from "../../src/domain/records";
import {
  CLAIM_PROJECTIONS_COLLECTION,
  CLAIM_PROJECTION_STATUS_COLLECTION,
  PROJECTION_REPAIRS_COLLECTION,
  type AppendClaimProjectionInput,
  type ClaimProjection,
  type ClaimProjectionStatus,
} from "../../src/recall/projections/contracts";
import { createRecallProjectionRuntime } from "../../src/recall/projections/runtime";
import type { DocumentStore, StorageDocument } from "../../src/storage/contracts";
import { createInMemoryDocumentStore } from "../../src/storage/memory";

const NOW = "2026-07-16T12:00:00.000Z";
const scope = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function claimInput(
  objectText: string,
  ingestedAt: string,
): AppendClaimProjectionInput {
  return {
    ...scope,
    sourceMemoryId: "fact-1",
    subject: "Atlas",
    claim: {
      predicateKey: "project.status",
      objectText,
      polarity: "positive",
      modality: "asserted",
    },
    observedAt: "2026-07-15T09:00:00.000Z",
    ingestedAt,
    evidenceIds: [`evidence-${objectText}`],
    sourceMessageIds: [`message-${objectText}`],
    extractorVersion: "extractor-v1",
  };
}

function buildFact() {
  return createFactMemory({
    ...scope,
    id: "fact-1",
    category: "project",
    content: "Atlas is active.",
    subject: "Atlas",
    source: {
      method: "explicit",
      extractedAt: "2026-07-15T09:00:00.000Z",
    },
    validFrom: "2026-07-15T09:00:00.000Z",
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-07-15T09:00:00.000Z",
  });
}

function createOneShotClaimFailureStore(inner: DocumentStore): DocumentStore {
  let fail = true;

  return {
    async set<TDocument extends StorageDocument>(collection: string, id: string, document: TDocument) {
      if (collection === CLAIM_PROJECTIONS_COLLECTION && fail) {
        fail = false;
        throw new Error("injected claim projection failure");
      }
      await inner.set(collection, id, document);
    },
    get: (collection, id) => inner.get(collection, id),
    update: (collection, id, patch) => inner.update(collection, id, patch),
    query: (collection, filter) => inner.query(collection, filter),
    delete: (collection, id) => inner.delete(collection, id),
    queryPage: inner.queryPage
      ? (collection, input) => inner.queryPage!(collection, input)
      : undefined,
    writeBatchIfUnchanged: async (input) => {
      if (
        input.set.some(({ collection }) =>
          collection === CLAIM_PROJECTIONS_COLLECTION
        ) && fail
      ) {
        fail = false;
        throw new Error("injected claim projection failure");
      }
      return inner.writeBatchIfUnchanged!(input);
    },
  };
}

function createBlockedRepairStore(inner: DocumentStore): {
  releaseRepair: () => void;
  repairStarted: Promise<void>;
  store: DocumentStore;
} {
  let fail = true;
  let releaseRepair = () => {};
  let markRepairStarted = () => {};
  const repairStarted = new Promise<void>((resolve) => {
    markRepairStarted = resolve;
  });
  const repairRelease = new Promise<void>((resolve) => {
    releaseRepair = resolve;
  });

  return {
    releaseRepair,
    repairStarted,
    store: {
      async set<TDocument extends StorageDocument>(
        collection: string,
        id: string,
        document: TDocument,
      ) {
        if (collection === CLAIM_PROJECTIONS_COLLECTION) {
          if (fail) {
            fail = false;
            throw new Error("injected claim projection failure");
          }
          markRepairStarted();
          await repairRelease;
        }
        await inner.set(collection, id, document);
      },
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      queryPage: inner.queryPage
        ? (collection, input) => inner.queryPage!(collection, input)
        : undefined,
      writeBatchIfUnchanged: async (input) => {
        if (input.set.some(({ collection }) =>
          collection === CLAIM_PROJECTIONS_COLLECTION
        )) {
          if (fail) {
            fail = false;
            throw new Error("injected claim projection failure");
          }
          markRepairStarted();
          await repairRelease;
        }
        return inner.writeBatchIfUnchanged!(input);
      },
    },
  };
}

function createInterleavedRepairStore(inner: DocumentStore): {
  releaseOldRepair: () => void;
  oldRepairStarted: Promise<void>;
  store: DocumentStore;
} {
  let claimBatchCalls = 0;
  let releaseOldRepair = () => {};
  let markOldRepairStarted = () => {};
  const oldRepairStarted = new Promise<void>((resolve) => {
    markOldRepairStarted = resolve;
  });
  const oldRepairRelease = new Promise<void>((resolve) => {
    releaseOldRepair = resolve;
  });
  return {
    releaseOldRepair,
    oldRepairStarted,
    store: {
      set: (collection, id, document) => inner.set(collection, id, document),
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      queryPage: inner.queryPage
        ? (collection, input) => inner.queryPage!(collection, input)
        : undefined,
      writeBatchIfUnchanged: async (input) => {
        if (input.set.some(({ collection }) =>
          collection === CLAIM_PROJECTIONS_COLLECTION
        )) {
          claimBatchCalls += 1;
          if (claimBatchCalls === 1) {
            throw new Error("injected first claim append failure");
          }
          if (claimBatchCalls === 2) {
            markOldRepairStarted();
            await oldRepairRelease;
          }
        }
        return inner.writeBatchIfUnchanged!(input);
      },
    },
  };
}

function createDelayedFailingAppendStore(inner: DocumentStore): {
  appendStarted: Promise<void>;
  releaseAppend: () => void;
  store: DocumentStore;
} {
  let blockFirstClaimBatch = true;
  let markAppendStarted = () => {};
  let releaseAppend = () => {};
  const appendStarted = new Promise<void>((resolve) => {
    markAppendStarted = resolve;
  });
  const appendRelease = new Promise<void>((resolve) => {
    releaseAppend = resolve;
  });
  return {
    appendStarted,
    releaseAppend,
    store: {
      set: (collection, id, document) => inner.set(collection, id, document),
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      queryPage: inner.queryPage
        ? (collection, input) => inner.queryPage!(collection, input)
        : undefined,
      writeBatchIfUnchanged: async (input) => {
        if (
          blockFirstClaimBatch &&
          input.set.some(({ collection }) =>
            collection === CLAIM_PROJECTIONS_COLLECTION
          )
        ) {
          blockFirstClaimBatch = false;
          markAppendStarted();
          await appendRelease;
          throw new Error("delayed claim append failure");
        }
        return inner.writeBatchIfUnchanged!(input);
      },
    },
  };
}

function createDeleteRepairRaceStore(inner: DocumentStore): {
  deletionStarted: Promise<void>;
  releaseDeletion: () => void;
  store: DocumentStore;
} {
  let failClaim = true;
  let blockDelete = true;
  let markDeletionStarted = () => {};
  let releaseDeletion = () => {};
  const deletionStarted = new Promise<void>((resolve) => {
    markDeletionStarted = resolve;
  });
  const deletionRelease = new Promise<void>((resolve) => {
    releaseDeletion = resolve;
  });
  return {
    deletionStarted,
    releaseDeletion,
    store: {
      set: (collection, id, document) => inner.set(collection, id, document),
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      queryPage: inner.queryPage,
      writeBatchIfUnchanged: async (input) => {
        if (
          failClaim &&
          input.set.some(({ collection }) =>
            collection === CLAIM_PROJECTIONS_COLLECTION
          )
        ) {
          failClaim = false;
          throw new Error("injected claim append failure");
        }
        if (
          blockDelete &&
          input.delete?.some(({ collection, id }) =>
            collection === "facts" && id === "fact-1"
          )
        ) {
          blockDelete = false;
          markDeletionStarted();
          await deletionRelease;
        }
        return inner.writeBatchIfUnchanged!(input);
      },
    },
  };
}

function createBlockedLifecycleStore(inner: DocumentStore): {
  lifecycleStarted: Promise<void>;
  releaseLifecycle: () => void;
  store: DocumentStore;
} {
  let blockLifecycle = true;
  let markLifecycleStarted = () => {};
  let releaseLifecycle = () => {};
  const lifecycleStarted = new Promise<void>((resolve) => {
    markLifecycleStarted = resolve;
  });
  const lifecycleRelease = new Promise<void>((resolve) => {
    releaseLifecycle = resolve;
  });
  return {
    lifecycleStarted,
    releaseLifecycle,
    store: {
      set: (collection, id, document) => inner.set(collection, id, document),
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      queryPage: inner.queryPage,
      writeBatchIfUnchanged: async (input) => {
        const fact = input.expected.document as Partial<ReturnType<typeof buildFact>>;
        if (blockLifecycle && fact.lifecycle === "superseded") {
          blockLifecycle = false;
          markLifecycleStarted();
          await lifecycleRelease;
        }
        return inner.writeBatchIfUnchanged!(input);
      },
    },
  };
}

describe("claim projection runtime", () => {
  it("searches projection text through the document-store query contract", async () => {
    const store = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({ documentStore: store, now: () => NOW });
    const fact = buildFact();
    await runtime.documentStore.set("facts", fact.id, fact);

    const matches = await runtime.searchDocuments(scope, "Atlas active", 2);

    expect(matches).toHaveLength(2);
    expect(matches.every(({ sourceMemoryId }) => sourceMemoryId === fact.id)).toBe(true);
  });

  it("token-scores natural-language queries when an adapter has no native search", async () => {
    const inner = createInMemoryDocumentStore();
    const store: DocumentStore = {
      set: (collection, id, document) => inner.set(collection, id, document),
      get: (collection, id) => inner.get(collection, id),
      update: (collection, id, patch) => inner.update(collection, id, patch),
      query: (collection, filter) => inner.query(collection, filter),
      delete: (collection, id) => inner.delete(collection, id),
      writeBatchIfUnchanged: (input) => inner.writeBatchIfUnchanged(input),
    };
    const runtime = createRecallProjectionRuntime({ documentStore: store });
    const fact = buildFact();
    await runtime.documentStore.set("facts", fact.id, fact);

    const matches = await runtime.searchDocuments(
      scope,
      "What is the current Atlas project status?",
      5,
    );

    expect(matches.some(({ sourceMemoryId }) => sourceMemoryId === fact.id)).toBe(true);
  });

  it("keeps append-only history while exposing only the latest source projection", async () => {
    const store = createInMemoryDocumentStore();
    const fact = buildFact();
    await store.set("facts", fact.id, fact);
    const runtime = createRecallProjectionRuntime({ documentStore: store, now: () => NOW });

    await runtime.appendClaim(claimInput("planned", "2026-07-16T10:00:00.000Z"));
    await runtime.appendClaim(claimInput("completed", "2026-07-16T11:00:00.000Z"));

    const current = await runtime.queryClaims(scope);
    const history = await runtime.queryClaimHistory(scope);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      objectText: "completed",
      polarity: "positive",
      modality: "asserted",
    });
    expect(history.map(({ objectText }) => objectText).sort()).toEqual([
      "completed",
      "planned",
    ]);

    const status = await store.query<ClaimProjectionStatus>(
      CLAIM_PROJECTION_STATUS_COLLECTION,
      { sourceMemoryId: "fact-1" },
    );
    expect(status).toEqual([
      expect.objectContaining({ state: "projected", claimIds: [current[0]!.id] }),
    ]);
  });

  it("backfills old facts with evidence and lets a structured claim replace the current fallback", async () => {
    const store = createInMemoryDocumentStore();
    const fact = buildFact();
    await store.set("facts", fact.id, fact);
    await store.set("evidence", "evidence-1", {
      ...scope,
      id: "evidence-1",
      kind: "conversation_excerpt",
      excerpt: fact.content,
      source: fact.source,
      sourceMessageIds: ["message-1"],
      linkedMemoryIds: [fact.id],
      linkedArchiveIds: [],
      createdAt: fact.createdAt,
    });
    const runtime = createRecallProjectionRuntime({ documentStore: store, now: () => NOW });

    await runtime.ensureScopeIndexed(scope);
    expect(await runtime.queryClaims(scope)).toEqual([
      expect.objectContaining({
        sourceMemoryId: fact.id,
        predicateKey: `fact.unstructured.${fact.id}`,
        objectText: fact.content,
        evidenceIds: ["evidence-1"],
        sourceMessageIds: ["message-1"],
      }),
    ]);

    await runtime.appendClaim(claimInput("active", "2026-07-16T11:00:00.000Z"));

    expect(await runtime.queryClaims(scope)).toEqual([
      expect.objectContaining({ predicateKey: "project.status", objectText: "active" }),
    ]);
    expect(await runtime.queryClaimHistory(scope)).toHaveLength(2);
  });

  it("closes the selected claim when its canonical fact is superseded and erases it on privacy deletion", async () => {
    const store = createInMemoryDocumentStore();
    const runtime = createRecallProjectionRuntime({ documentStore: store, now: () => NOW });
    const fact = buildFact();
    await runtime.documentStore.set("facts", fact.id, fact);
    await runtime.appendClaim(claimInput("active", "2026-07-16T11:00:00.000Z"));

    await runtime.documentStore.set("facts", fact.id, {
      ...fact,
      lifecycle: "superseded",
      isActive: false,
      updatedAt: NOW,
    });

    expect(await runtime.queryClaims(scope)).toEqual([
      expect.objectContaining({ objectText: "active", validUntil: NOW }),
    ]);
    expect(await runtime.queryClaimHistory(scope)).toHaveLength(3);

    await runtime.documentStore.delete("facts", fact.id);
    expect(await store.query<ClaimProjection>(CLAIM_PROJECTIONS_COLLECTION, {})).toEqual([]);
    expect(await store.query<ClaimProjectionStatus>(CLAIM_PROJECTION_STATUS_COLLECTION, {})).toEqual([]);
  });

  it("queues a failed append and replays the exact structured input through repair", async () => {
    const rawStore = createInMemoryDocumentStore();
    const fact = buildFact();
    await rawStore.set("facts", fact.id, fact);
    const runtime = createRecallProjectionRuntime({
      documentStore: createOneShotClaimFailureStore(rawStore),
      now: () => NOW,
    });

    await runtime.appendClaim(claimInput("active", "2026-07-16T11:00:00.000Z"));
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toHaveLength(1);
    expect(await runtime.queryClaims(scope)).toEqual([]);

    expect(await runtime.repairPending(scope)).toBe(1);
    expect(await runtime.queryClaims(scope)).toEqual([
      expect.objectContaining({ predicateKey: "project.status", objectText: "active" }),
    ]);
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toEqual([]);
  });

  it("does not let an older repair replace a newer selected claim", async () => {
    const rawStore = createInMemoryDocumentStore();
    const fact = buildFact();
    await rawStore.set("facts", fact.id, fact);
    const runtime = createRecallProjectionRuntime({
      documentStore: createOneShotClaimFailureStore(rawStore),
      now: () => NOW,
    });

    await runtime.appendClaim(claimInput("planned", "2026-07-16T10:00:00.000Z"));
    await runtime.appendClaim(claimInput("completed", "2026-07-16T11:00:00.000Z"));
    expect(await runtime.queryClaims(scope)).toEqual([
      expect.objectContaining({ objectText: "completed" }),
    ]);

    expect(await runtime.repairPending(scope)).toBe(1);
    expect(await runtime.queryClaims(scope)).toEqual([
      expect.objectContaining({ objectText: "completed" }),
    ]);
  });

  it("discards a pending claim repair after its canonical fact is deleted", async () => {
    const rawStore = createInMemoryDocumentStore();
    const fact = buildFact();
    await rawStore.set("facts", fact.id, fact);
    const runtime = createRecallProjectionRuntime({
      documentStore: createOneShotClaimFailureStore(rawStore),
      now: () => NOW,
    });

    await runtime.appendClaim(claimInput("active", "2026-07-16T11:00:00.000Z"));
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toHaveLength(1);

    await runtime.documentStore.delete("facts", fact.id);
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toEqual([]);
    expect(await runtime.repairPending(scope)).toBe(0);
    expect(await runtime.queryClaims(scope)).toEqual([]);
  });

  it("serializes claim repair with canonical deletion so a fact cannot be revived", async () => {
    const rawStore = createInMemoryDocumentStore();
    const fact = buildFact();
    await rawStore.set("facts", fact.id, fact);
    const blocked = createBlockedRepairStore(rawStore);
    const runtime = createRecallProjectionRuntime({
      documentStore: blocked.store,
      now: () => NOW,
    });

    await runtime.appendClaim(
      claimInput("sensitive-object-text", "2026-07-16T11:00:00.000Z"),
    );
    const repair = runtime.repairPending(scope);
    await blocked.repairStarted;
    const deletion = runtime.documentStore.delete("facts", fact.id);
    blocked.releaseRepair();
    await Promise.all([repair, deletion]);

    expect(await rawStore.get("facts", fact.id)).toBeNull();
    expect(await rawStore.query(CLAIM_PROJECTIONS_COLLECTION, {
      sourceMemoryId: fact.id,
    })).toEqual([]);
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toEqual([]);
  });

  it("does not let a repair in one runtime revive a fact deleted by another runtime", async () => {
    const rawStore = createInMemoryDocumentStore();
    const fact = buildFact();
    await rawStore.set("facts", fact.id, fact);
    const blocked = createBlockedRepairStore(rawStore);
    const repairRuntime = createRecallProjectionRuntime({
      documentStore: blocked.store,
      now: () => NOW,
    });
    const deleteRuntime = createRecallProjectionRuntime({
      documentStore: blocked.store,
      now: () => NOW,
    });

    await repairRuntime.appendClaim(
      claimInput("sensitive-object-text", "2026-07-16T11:00:00.000Z"),
    );
    const repair = repairRuntime.repairPending(scope);
    await blocked.repairStarted;
    await deleteRuntime.documentStore.delete("facts", fact.id);
    blocked.releaseRepair();
    await repair;

    expect(await rawStore.get("facts", fact.id)).toBeNull();
    expect(await rawStore.query(CLAIM_PROJECTIONS_COLLECTION, {
      sourceMemoryId: fact.id,
    })).toEqual([]);
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toEqual([]);
  });

  it("does not let an older repair overwrite a newer status across runtimes", async () => {
    const rawStore = createInMemoryDocumentStore();
    await rawStore.set("facts", "fact-1", buildFact());
    const interleaved = createInterleavedRepairStore(rawStore);
    const oldRuntime = createRecallProjectionRuntime({
      documentStore: interleaved.store,
      now: () => NOW,
    });
    const newRuntime = createRecallProjectionRuntime({
      documentStore: interleaved.store,
      now: () => NOW,
    });
    await oldRuntime.appendClaim(
      claimInput("planned", "2026-07-16T10:00:00.000Z"),
    );
    const oldRepair = oldRuntime.repairPending(scope);
    await interleaved.oldRepairStarted;
    await newRuntime.appendClaim(
      claimInput("completed", "2026-07-16T11:00:00.000Z"),
    );
    interleaved.releaseOldRepair();
    await oldRepair;

    expect(await newRuntime.queryClaims(scope)).toEqual([
      expect.objectContaining({ objectText: "completed" }),
    ]);
  });

  it("does not queue sensitive repair state after a concurrent canonical delete", async () => {
    const rawStore = createInMemoryDocumentStore();
    await rawStore.set("facts", "fact-1", buildFact());
    const delayed = createDelayedFailingAppendStore(rawStore);
    const appendRuntime = createRecallProjectionRuntime({
      documentStore: delayed.store,
      now: () => NOW,
    });
    const deleteRuntime = createRecallProjectionRuntime({
      documentStore: delayed.store,
      now: () => NOW,
    });
    const append = appendRuntime.appendClaim(
      claimInput("sensitive-object-text", "2026-07-16T11:00:00.000Z"),
    );
    await delayed.appendStarted;
    await deleteRuntime.documentStore.delete("facts", "fact-1");
    delayed.releaseAppend();
    await append;

    expect(await rawStore.query(CLAIM_PROJECTION_STATUS_COLLECTION, {})).toEqual([]);
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION, {})).toEqual([]);
  });

  it("atomically removes a repair inserted while another runtime forgets", async () => {
    const rawStore = createInMemoryDocumentStore();
    await rawStore.set("facts", "fact-1", buildFact());
    const raced = createDeleteRepairRaceStore(rawStore);
    const deleteRuntime = createRecallProjectionRuntime({
      documentStore: raced.store,
      now: () => NOW,
    });
    const appendRuntime = createRecallProjectionRuntime({
      documentStore: raced.store,
      now: () => NOW,
    });

    const deletion = deleteRuntime.documentStore.delete("facts", "fact-1");
    await raced.deletionStarted;
    await appendRuntime.appendClaim(
      claimInput("sensitive-object-text", "2026-07-16T11:00:00.000Z"),
    );
    expect(JSON.stringify(await rawStore.query(PROJECTION_REPAIRS_COLLECTION)))
      .toContain("sensitive-object-text");
    raced.releaseDeletion();
    await deletion;

    expect(await rawStore.get("facts", "fact-1")).toBeNull();
    expect(await rawStore.query(PROJECTION_REPAIRS_COLLECTION)).toEqual([]);
  });

  it("does not let a stale lifecycle sync overwrite a newer CAS status", async () => {
    const rawStore = createInMemoryDocumentStore();
    const fact = buildFact();
    await rawStore.set("facts", fact.id, fact);
    const blocked = createBlockedLifecycleStore(rawStore);
    const oldRuntime = createRecallProjectionRuntime({
      documentStore: blocked.store,
      now: () => NOW,
    });
    const newRuntime = createRecallProjectionRuntime({
      documentStore: blocked.store,
      now: () => NOW,
    });
    await oldRuntime.appendClaim(
      claimInput("planned", "2026-07-16T10:00:00.000Z"),
    );
    const staleSync = oldRuntime.documentStore.set("facts", fact.id, {
      ...fact,
      lifecycle: "superseded",
      isActive: false,
      updatedAt: "2026-07-16T10:30:00.000Z",
    });
    await blocked.lifecycleStarted;
    await newRuntime.documentStore.set("facts", fact.id, {
      ...fact,
      updatedAt: "2026-07-16T11:00:00.000Z",
    });
    await newRuntime.appendClaim(
      claimInput("completed", "2026-07-16T11:00:00.000Z"),
    );
    blocked.releaseLifecycle();
    await staleSync;

    expect(await newRuntime.queryClaims(scope)).toEqual([
      expect.objectContaining({ objectText: "completed" }),
    ]);
  });

  it("does not retain an unpersisted volatile repair after deletion and ID reuse", async () => {
    const rawStore = createInMemoryDocumentStore();
    await rawStore.set("facts", "fact-1", buildFact());
    let failClaim = true;
    const store: DocumentStore = {
      set: async (collection, id, document) => {
        if (collection === PROJECTION_REPAIRS_COLLECTION) {
          throw new Error("repair persistence unavailable");
        }
        await rawStore.set(collection, id, document);
      },
      get: (collection, id) => rawStore.get(collection, id),
      update: (collection, id, patch) => rawStore.update(collection, id, patch),
      query: (collection, filter) => rawStore.query(collection, filter),
      delete: (collection, id) => rawStore.delete(collection, id),
      queryPage: rawStore.queryPage,
      writeBatchIfUnchanged: async (input) => {
        if (input.set.some(({ collection }) =>
          collection === PROJECTION_REPAIRS_COLLECTION
        )) {
          throw new Error("repair persistence unavailable");
        }
        if (
          failClaim &&
          input.set.some(({ collection }) =>
            collection === CLAIM_PROJECTIONS_COLLECTION
          )
        ) {
          failClaim = false;
          throw new Error("claim persistence unavailable");
        }
        return rawStore.writeBatchIfUnchanged!(input);
      },
    };
    const runtime = createRecallProjectionRuntime({ documentStore: store, now: () => NOW });

    await expect(runtime.appendClaim(
      claimInput("sensitive-object-text", "2026-07-16T11:00:00.000Z"),
    )).rejects.toThrow("repair persistence unavailable");
    await rawStore.delete("facts", "fact-1");
    await rawStore.set("facts", "fact-1", buildFact());

    expect(await runtime.repairPending(scope)).toBe(0);
    expect(await runtime.queryClaims(scope)).toEqual([]);
  });

  it("rejects a document adapter without atomic conditional batches", () => {
    const inner = createInMemoryDocumentStore();
    const unsupported = {
      delete: inner.delete,
      get: inner.get,
      query: inner.query,
      set: inner.set,
      update: inner.update,
    } as unknown as DocumentStore;

    expect(() => createRecallProjectionRuntime({ documentStore: unsupported }))
      .toThrow("atomic conditional batches");
  });
});
