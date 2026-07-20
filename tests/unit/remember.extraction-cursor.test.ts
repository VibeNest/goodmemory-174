import { describe, expect, it } from "bun:test";

import {
  EXTRACTION_CURSORS_COLLECTION,
  createExtractionCursorStore,
} from "../../src/remember/extractionCursor";
import type { ProjectionCapableDocumentStore } from "../../src/storage/contracts";
import { createInMemoryDocumentStore } from "../../src/storage/memory";

const scope = {
  sessionId: "session-1",
  userId: "user-1",
};

describe("durable extraction cursor", () => {
  it("persists failed attempts without advancing the committed offset", async () => {
    const documentStore = createInMemoryDocumentStore();
    const firstRuntime = createExtractionCursorStore({
      documentStore,
      now: () => "2026-07-20T12:00:00.000Z",
    });

    const failed = await firstRuntime.record({
      errorCode: "assisted_extraction_failed",
      outcome: "failed",
      scope,
      sourceId: "segment-1",
      through: 12,
    });

    expect(failed).toMatchObject({
      committedThrough: 0,
      lastAttempt: {
        attempts: 1,
        errorCode: "assisted_extraction_failed",
        outcome: "failed",
        through: 12,
      },
    });

    const reconstructed = createExtractionCursorStore({
      documentStore,
      now: () => "2026-07-20T12:01:00.000Z",
    });
    expect(await reconstructed.get(scope, "segment-1")).toEqual(failed);
  });

  it("advances only for committed or no-admissible-candidate outcomes", async () => {
    const cursors = createExtractionCursorStore({
      documentStore: createInMemoryDocumentStore(),
      now: () => "2026-07-20T12:00:00.000Z",
    });

    await cursors.record({
      outcome: "failed",
      scope,
      sourceId: "segment-1",
      through: 10,
    });
    const committed = await cursors.record({
      outcome: "committed",
      scope,
      sourceId: "segment-1",
      through: 10,
    });
    const empty = await cursors.record({
      outcome: "no_admissible_candidate",
      scope,
      sourceId: "segment-1",
      through: 24,
    });

    expect(committed.committedThrough).toBe(10);
    expect(empty.committedThrough).toBe(24);
    expect(empty.lastAttempt).toMatchObject({
      attempts: 1,
      outcome: "no_admissible_candidate",
      through: 24,
    });
  });

  it("does not let a stale failed attempt overwrite a newer committed cursor", async () => {
    const inner = createInMemoryDocumentStore();
    let releaseFirstWrite: (() => void) | undefined;
    let firstWriteStarted: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const releaseFirst = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let writes = 0;
    const documentStore: ProjectionCapableDocumentStore = {
      ...inner,
      async writeBatchIfUnchanged(input) {
        writes += 1;
        if (writes === 1) {
          firstWriteStarted?.();
          await releaseFirst;
        }
        return inner.writeBatchIfUnchanged(input);
      },
    };
    const staleRuntime = createExtractionCursorStore({
      documentStore,
      now: () => "2026-07-20T12:00:00.000Z",
    });
    const currentRuntime = createExtractionCursorStore({
      documentStore,
      now: () => "2026-07-20T12:01:00.000Z",
    });

    const stale = staleRuntime.record({
      outcome: "failed",
      scope,
      sourceId: "segment-1",
      through: 10,
    });
    await firstWrite;
    await currentRuntime.record({
      outcome: "committed",
      scope,
      sourceId: "segment-1",
      through: 20,
    });
    releaseFirstWrite?.();
    await stale;

    expect(await currentRuntime.get(scope, "segment-1")).toMatchObject({
      committedThrough: 20,
      lastAttempt: {
        outcome: "committed",
        through: 20,
      },
    });
    expect(
      await documentStore.query(EXTRACTION_CURSORS_COLLECTION),
    ).toHaveLength(1);
  });

  it("lets an older terminal snapshot advance beneath a newer failed attempt", async () => {
    const cursors = createExtractionCursorStore({
      documentStore: createInMemoryDocumentStore(),
      now: () => "2026-07-20T12:00:00.000Z",
    });

    await cursors.record({
      outcome: "failed",
      scope,
      sourceId: "segment-1",
      through: 20,
    });
    const committed = await cursors.record({
      outcome: "committed",
      scope,
      sourceId: "segment-1",
      through: 10,
    });

    expect(committed).toMatchObject({
      committedThrough: 10,
      lastAttempt: {
        outcome: "failed",
        through: 20,
      },
    });
  });
});
