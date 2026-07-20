import { describe, expect, it } from "bun:test";
import { createInMemoryDocumentStore } from "../../src/storage/memory";
import {
  createScopeDeletionAwareDocumentStore,
  createScopeDeletionCoordinator,
} from "../../src/storage/scopeDeletion";

describe("scope deletion coordination", () => {
  it("blocks nested-scope runtime records while deletion is in progress", async () => {
    const rawStore = createInMemoryDocumentStore();
    const guardedStore = createScopeDeletionAwareDocumentStore(rawStore);
    const coordinator = createScopeDeletionCoordinator(rawStore);
    const scope = {
      userId: "u-runtime-delete",
      workspaceId: "workspace-a",
      sessionId: "session-a",
    };
    const spill = {
      id: "spill-late",
      scope,
      content: "sensitive runtime spill",
    };

    await coordinator.runExclusive(scope, async () => {
      await expect(
        guardedStore.set("artifact_spills_v1", spill.id, spill),
      ).rejects.toThrow("Memory deletion is in progress");
    });

    expect(await rawStore.get("artifact_spills_v1", spill.id)).toBeNull();
    await guardedStore.set("artifact_spills_v1", spill.id, spill);
    expect(await rawStore.get("artifact_spills_v1", spill.id)).toEqual(spill);
  });
});
