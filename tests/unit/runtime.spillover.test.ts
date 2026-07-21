import { describe, expect, it } from "bun:test";
import { createInMemoryDocumentStore } from "../../src/storage/memory";
import {
  ARTIFACT_SPILL_PAYLOAD_COLLECTION,
  createArtifactSpilloverService,
} from "../../src/runtime/spillover";
import type { ArtifactSpillPayloadRecord } from "../../src/runtime/spillover";

describe("artifact spillover service", () => {
  it("creates previews for oversized content and persists a spill record", async () => {
    const service = createArtifactSpilloverService({
      documentStore: createInMemoryDocumentStore(),
      previewChars: 24,
    });

    const record = await service.spill(
      { userId: "u-1", sessionId: "s-1" },
      {
        kind: "tool_result",
        sourceId: "tool-1",
        content:
          "This is a very long tool result that should not remain inline in the prompt.",
      },
    );

    expect(record.preview).toBe("This is a very long tool...");
    expect(record.replacementText).toContain("tool_result");
    expect(record.originalBytes).toBeGreaterThan(24);
    expect(record.contentHash).toMatch(/^[a-f0-9]{64}$/u);

    const loaded = await service.getBySource(
      { userId: "u-1", sessionId: "s-1" },
      "tool-1",
    );
    expect(loaded).toEqual(record);
    expect(
      await service.resolve(
        { userId: "u-1", sessionId: "s-1" },
        record.storageUri,
      ),
    ).toBe(
      "This is a very long tool result that should not remain inline in the prompt.",
    );
  });

  it("reuses stable replacement text for the same source in one session lifecycle", async () => {
    const service = createArtifactSpilloverService({
      documentStore: createInMemoryDocumentStore(),
      previewChars: 18,
    });
    const scope = { userId: "u-1", sessionId: "s-1" };

    const first = await service.spill(scope, {
      kind: "retrieval_result",
      sourceId: "search-1",
      content: "First retrieval payload that is too large to inject verbatim.",
    });

    const second = await service.spill(scope, {
      kind: "retrieval_result",
      sourceId: "search-1",
      content: "Updated retrieval payload that should reuse the same replacement token.",
    });

    expect(second.replacementText).toBe(first.replacementText);
    expect(second.id).toBe(first.id);
    expect(second.preview).toBe("Updated retrieval...");
    expect(second.storageUri).not.toBe(first.storageUri);
    expect(await service.resolve(scope, first.storageUri)).toBe(
      "First retrieval payload that is too large to inject verbatim.",
    );
    expect(await service.resolve(scope, second.storageUri)).toBe(
      "Updated retrieval payload that should reuse the same replacement token.",
    );
  });

  it("creates independent replacement tokens across different sessions", async () => {
    const service = createArtifactSpilloverService({
      documentStore: createInMemoryDocumentStore(),
      previewChars: 18,
    });

    const first = await service.spill(
      { userId: "u-1", sessionId: "s-1" },
      {
        kind: "search_result",
        sourceId: "shared-source",
        content: "Session one payload",
      },
    );
    const second = await service.spill(
      { userId: "u-1", sessionId: "s-2" },
      {
        kind: "search_result",
        sourceId: "shared-source",
        content: "Session two payload",
      },
    );

    expect(second.replacementText).not.toBe(first.replacementText);
  });

  it("refuses to replay a payload whose content no longer matches its hash", async () => {
    const documentStore = createInMemoryDocumentStore();
    const service = createArtifactSpilloverService({ documentStore });
    const scope = { userId: "u-1", sessionId: "s-1" };
    const record = await service.spill(scope, {
      kind: "tool_result",
      sourceId: "tool-corrupted",
      content: "Original immutable payload",
    });
    const [payload] = await documentStore.query<ArtifactSpillPayloadRecord>(
      ARTIFACT_SPILL_PAYLOAD_COLLECTION,
    );
    if (!payload) {
      throw new Error("Expected the spill payload to be persisted.");
    }
    await documentStore.set(ARTIFACT_SPILL_PAYLOAD_COLLECTION, payload.id, {
      ...payload,
      content: "Corrupted payload",
    });

    expect(await service.resolve(scope, record.storageUri)).toBeNull();
  });
});
