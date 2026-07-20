import { describe, expect, it } from "bun:test";

import { createRememberWriteCoordinator } from "../../src/remember/writeOwnership";
import type {
  ConditionalDocumentWriteBatch,
  ProjectionCapableDocumentStore,
  StorageDocument,
} from "../../src/storage/contracts";
import { createInMemoryDocumentStore } from "../../src/storage/memory";

function batchIds(input: ConditionalDocumentWriteBatch): string[] {
  return [
    input.expected,
    ...(input.unchanged ?? []),
    ...input.set,
    ...(input.delete ?? []),
  ].map(({ id }) => id);
}

describe("remember write ownership", () => {
  it("uses storage-safe marker ids for atomic ownership", async () => {
    const inner = createInMemoryDocumentStore();
    const observedIds: string[] = [];
    const store: ProjectionCapableDocumentStore = {
      ...inner,
      async get<TDocument extends StorageDocument>(
        collection: string,
        id: string,
      ) {
        observedIds.push(id);
        return inner.get<TDocument>(collection, id);
      },
      async writeBatchIfUnchanged(input) {
        observedIds.push(...batchIds(input));
        return inner.writeBatchIfUnchanged(input);
      },
    };
    const coordinator = createRememberWriteCoordinator(store);

    await coordinator.setDocument("facts", "fact:1", { content: "safe" });
    await coordinator.releaseOwnership();

    expect(observedIds.length).toBeGreaterThan(0);
    expect(observedIds.every((id) => !id.includes("\u0000"))).toBe(true);
    expect(await inner.get("facts", "fact:1")).toEqual({ content: "safe" });
  });
});
