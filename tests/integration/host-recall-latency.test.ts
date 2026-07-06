import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import { createFactMemory } from "../../src/domain/records";
import { createSQLiteDocumentStore } from "../../src/storage/sqlite";

// Hooks run synchronously before the prompt reaches the model, so installed
// recall has a hard latency budget. This pins the worst realistic shape: a
// 5,000-fact sqlite store on the BM25 hybrid tier (fresh-install default).
// The bound is CI-generous; the point is catching order-of-magnitude
// regressions in the full-scan + BM25 path, not micro-benchmarking.
describe("installed host recall latency", () => {
  it("keeps bm25 hybrid recall over 5k sqlite facts within the hook budget", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gm-latency-"));
    const url = join(dir, "latency.sqlite");

    try {
      const documentStore = createSQLiteDocumentStore(url);
      const scope = { userId: "latency-user", workspaceId: "latency-workspace" };
      const topics = [
        "release pipeline",
        "vendor approval",
        "database migration",
        "frontend bundler",
        "observability stack",
      ];
      for (let index = 0; index < 5_000; index += 1) {
        const topic = topics[index % topics.length];
        const fact = createFactMemory({
          id: `fact-${index}`,
          userId: scope.userId,
          workspaceId: scope.workspaceId,
          category: "project",
          content: `Note ${index}: the ${topic} owner updated step ${index % 97} of the runbook.`,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
        await documentStore.set("facts", fact.id, fact);
      }

      const memory = createGoodMemory({
        adapters: { documentStore },
        retrieval: { bm25Ranking: true },
        storage: { provider: "sqlite", url },
      });

      const startedAt = performance.now();
      const result = await memory.recall({
        query: "who owns the vendor approval runbook",
        retrievalProfile: "coding_agent",
        scope,
      });
      const elapsedMs = performance.now() - startedAt;

      expect(result.metadata.routingDecision.strategy).toBe("hybrid");
      expect(result.facts.length).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(1_500);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
