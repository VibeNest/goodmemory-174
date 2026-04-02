import { describe, expect, it } from "bun:test";
import type {
  DocumentStore,
  SessionStore,
  VectorStore,
} from "../../src/storage/contracts";

type ContractFixture<TStore> = {
  store: TStore;
  cleanup?: () => Promise<void>;
};

type StoreFactory<TStore> = () => ContractFixture<TStore> | Promise<ContractFixture<TStore>>;

export function runDocumentStoreContract(
  suiteName: string,
  createStore: StoreFactory<DocumentStore>,
): void {
  describe(suiteName, () => {
    it("implements document store behavior", async () => {
      const fixture = await createStore();

      try {
        await fixture.store.set("facts", "f-1", {
          id: "f-1",
          userId: "u-1",
          content: "hello",
        });
        expect(await fixture.store.get("facts", "f-1")).toEqual({
          id: "f-1",
          userId: "u-1",
          content: "hello",
        });

        await fixture.store.update("facts", "f-1", { content: "updated" });
        expect(await fixture.store.get("facts", "f-1")).toEqual({
          id: "f-1",
          userId: "u-1",
          content: "updated",
        });

        expect(
          await fixture.store.query("facts", {
            userId: "u-1",
          }),
        ).toHaveLength(1);

        await fixture.store.delete("facts", "f-1");
        expect(await fixture.store.get("facts", "f-1")).toBeNull();
      } finally {
        await fixture.cleanup?.();
      }
    });
  });
}

export function runSessionStoreContract(
  suiteName: string,
  createStore: StoreFactory<SessionStore>,
): void {
  describe(suiteName, () => {
    it("implements session store behavior", async () => {
      const fixture = await createStore();
      const scope = { userId: "u-1", sessionId: "s-1" };
      const buffer = {
        sessionId: "s-1",
        userId: "u-1",
        messages: [],
        summary: null,
        summaryUpToIndex: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastActiveAt: "2026-01-01T00:00:00.000Z",
      };
      const workingMemory = {
        sessionId: "s-1",
        userId: "u-1",
        currentGoal: "finish storage adapter",
        openLoops: ["verify postgres runtime"],
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const journal = {
        sessionId: "s-1",
        userId: "u-1",
        worklog: ["session store contract"],
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      try {
        await fixture.store.saveBuffer(scope, buffer);
        expect(await fixture.store.getBuffer(scope)).toEqual(buffer);

        await fixture.store.saveWorkingMemory(scope, workingMemory);
        expect(await fixture.store.getWorkingMemory(scope)).toEqual(workingMemory);

        await fixture.store.saveJournal(scope, journal);
        expect(await fixture.store.getJournal(scope)).toEqual(journal);
      } finally {
        await fixture.cleanup?.();
      }
    });
  });
}

export function runVectorStoreContract(
  suiteName: string,
  createStore: StoreFactory<VectorStore>,
): void {
  describe(suiteName, () => {
    it("implements vector store behavior", async () => {
      const fixture = await createStore();

      try {
        await fixture.store.upsert("episodes", [
          {
            id: "e-1",
            embedding: [1, 0, 0],
            metadata: { userId: "u-1" },
            content: "robot migration issue",
          },
          {
            id: "e-2",
            embedding: [0, 1, 0],
            metadata: { userId: "u-1" },
            content: "frontend styling preference",
          },
        ]);

        const result = await fixture.store.search("episodes", [1, 0, 0], {
          topK: 1,
          filter: { userId: "u-1" },
        });

        expect(result[0]?.id).toBe("e-1");

        await fixture.store.delete("episodes", "e-1");
        const afterDelete = await fixture.store.search("episodes", [1, 0, 0], {
          topK: 2,
          filter: { userId: "u-1" },
        });

        expect(afterDelete.some((record) => record.id === "e-1")).toBe(false);
      } finally {
        await fixture.cleanup?.();
      }
    });
  });
}
