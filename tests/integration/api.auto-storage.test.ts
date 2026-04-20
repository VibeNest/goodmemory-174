import { describe, expect, it } from "bun:test";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import { createFactMemory } from "../../src/domain/records";
import { createMemorySource } from "../../src/domain/provenance";
import { createMemoryRepositories } from "../../src/storage/repositories";
import {
  createSQLiteDocumentStore,
  createSQLiteVectorStore,
} from "../../src/storage/sqlite";
import { createTempWorkspace } from "../../src/testing/utils";

function createFakeEmbeddingAdapter(embeddingByText: Map<string, number[]>) {
  return {
    async embed(texts: string[]) {
      return texts.map((text) => embeddingByText.get(text) ?? [0, 0, 0]);
    },
  };
}

describe("auto storage runtime", () => {
  it("defaults to a durable cwd sqlite database when storage is omitted", async () => {
    const workspace = await createTempWorkspace("goodmemory-auto-storage-default");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const memory = createGoodMemory({});
      await memory.remember({
        scope: {
          userId: "auto-user",
          sessionId: "session-1",
        },
        messages: [
          {
            role: "user",
            content: "Remember that my name is Avery.",
          },
        ],
      });

      await expect(
        access(join(workspace.root, ".goodmemory", "memory.sqlite")),
      ).resolves.toBeNull();
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });

  it("reuses the default sqlite database across memory instances", async () => {
    const workspace = await createTempWorkspace("goodmemory-auto-storage-reuse");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const first = createGoodMemory({});
      const scope = {
        userId: "auto-user",
        sessionId: "session-1",
      };
      await first.remember({
        scope,
        messages: [
          {
            role: "user",
            content: "Remember that my favorite editor theme is high contrast.",
          },
        ],
      });

      const second = createGoodMemory({});
      const exported = await second.exportMemory({
        scope,
      });

      expect(
        exported.durable.preferences.some((record) =>
          JSON.stringify(record.value).includes("high contrast"),
        ) ||
          exported.durable.facts.some((record) =>
            record.content.includes("high contrast"),
          ),
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });

  it("supports durable local hybrid retrieval when storage is omitted and an embedding adapter is provided", async () => {
    const workspace = await createTempWorkspace("goodmemory-auto-storage-hybrid");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const sqlitePath = join(workspace.root, ".goodmemory", "memory.sqlite");
      const documentStore = createSQLiteDocumentStore(sqlitePath);
      const vectorStore = createSQLiteVectorStore(sqlitePath);
      const repositories = createMemoryRepositories({
        documentStore,
        sessionStore: {
          async saveBuffer() {},
          async getBuffer() {
            return null;
          },
          async deleteBuffersByScope() {
            return 0;
          },
          async saveWorkingMemory() {},
          async getWorkingMemory() {
            return null;
          },
          async deleteWorkingMemoryByScope() {
            return 0;
          },
          async saveJournal() {},
          async getJournal() {
            return null;
          },
          async deleteJournalsByScope() {
            return 0;
          },
        },
        vectorStore,
      });
      const scope = {
        userId: "auto-user",
        workspaceId: "workspace-a",
      };
      const query = "What is the current blocker?";
      const wrongFact = createFactMemory({
        id: "fact-wrong",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "project",
        factKind: "blocker",
        content: "The current blocker is vendor approval for the runtime dashboard.",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-01-01T00:00:00.000Z",
        }),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const rightFact = createFactMemory({
        id: "fact-right",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        category: "project",
        factKind: "blocker",
        content: "The current blocker is service account rotation for migration rollout.",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-01-01T00:00:00.000Z",
        }),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const embeddingByText = new Map<string, number[]>([
        [query, [1, 0, 0]],
        [wrongFact.content, [0, 1, 0]],
        [rightFact.content, [1, 0, 0]],
      ]);
      const adapters = {
        embeddingAdapter: createFakeEmbeddingAdapter(embeddingByText),
      };

      await repositories.facts.add(wrongFact);
      await repositories.facts.add(rightFact);
      await repositories.vectorIndex!.upsertFactEmbedding([
        {
          id: wrongFact.id,
          embedding: embeddingByText.get(wrongFact.content)!,
          metadata: {
            userId: scope.userId,
            workspaceId: scope.workspaceId,
            memoryType: "fact",
          },
          content: wrongFact.content,
        },
        {
          id: rightFact.id,
          embedding: embeddingByText.get(rightFact.content)!,
          metadata: {
            userId: scope.userId,
            workspaceId: scope.workspaceId,
            memoryType: "fact",
          },
          content: rightFact.content,
        },
      ]);

      const second = createGoodMemory({
        adapters,
      });
      const recall = await second.recall({
        scope,
        query,
        strategy: "hybrid",
      });

      expect(
        recall.facts.some((fact) => fact.id === rightFact.id),
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });

  it("defaults explicit sqlite without a url to the cwd sqlite database", async () => {
    const workspace = await createTempWorkspace("goodmemory-explicit-sqlite-default");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const memory = createGoodMemory({
        storage: {
          provider: "sqlite",
        },
      });

      await memory.remember({
        scope: {
          userId: "sqlite-user",
          sessionId: "session-1",
        },
        messages: [
          {
            role: "user",
            content: "Remember that I prefer release checklists over freeform notes.",
          },
        ],
      });

      await expect(
        access(join(workspace.root, ".goodmemory", "memory.sqlite")),
      ).resolves.toBeNull();
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });

  it("does not fall back to local sqlite when configured postgres auto storage cannot be reached", async () => {
    const workspace = await createTempWorkspace("goodmemory-auto-storage-postgres-error");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const memory = createGoodMemory({
        storage: {
          url: "postgres://127.0.0.1:1/goodmemory",
        },
      });

      await expect(
        memory.remember({
          scope: {
            userId: "auto-user",
            sessionId: "session-1",
          },
          messages: [
            {
              role: "user",
              content: "Remember that durable memory should stay in postgres.",
            },
          ],
        }),
      ).rejects.toThrow(/configured postgres backend/i);

      await expect(
        access(join(workspace.root, ".goodmemory", "memory.sqlite")),
      ).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });
});
