import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
import { createLocalEmbeddingAdapter } from "../../src/embedding/localEmbeddingAdapter";
import { createRecallEngine } from "../../src/recall/engine";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";

// End-to-end proof that the dependency-free local embedding adapter is a usable
// drop-in semantic source for hybrid recall. The two facts are a deliberate
// LEXICAL near-tie ("The current blocker is ... approval"), so the rules/lexical
// hard floor cannot separate them; only the topical word ("deployment" vs
// "vendor") differs. With the local adapter computing both the stored fact
// vectors and the query vector, semantic tie-breaking must surface the
// on-topic fact first.
describe("hybrid recall with the local embedding adapter", () => {
  it("breaks a lexical tie toward the on-topic fact using local semantic scores", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
      vectorStore,
    });
    const embedding = createLocalEmbeddingAdapter();
    const query = "What is the current deployment blocker?";

    const offTopicFact = createFactMemory({
      id: "fact-off-topic",
      userId: "u-1",
      workspaceId: "workspace-a",
      category: "project",
      factKind: "blocker",
      content: "The current blocker is vendor approval.",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const onTopicFact = createFactMemory({
      id: "fact-on-topic",
      userId: "u-1",
      workspaceId: "workspace-a",
      category: "project",
      factKind: "blocker",
      content: "The current blocker is deployment rollout approval.",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const [offTopicEmbedding, onTopicEmbedding] = await embedding.embed([
      offTopicFact.content,
      onTopicFact.content,
    ]);

    const engine = createRecallEngine({
      repositories,
      runtime: sessionStore,
      embedding,
    });

    await repositories.facts.add(offTopicFact);
    await repositories.facts.add(onTopicFact);
    await repositories.vectorIndex!.upsertFactEmbedding([
      {
        id: offTopicFact.id,
        embedding: offTopicEmbedding,
        metadata: { userId: "u-1", workspaceId: "workspace-a", memoryType: "fact" },
        content: offTopicFact.content,
      },
      {
        id: onTopicFact.id,
        embedding: onTopicEmbedding,
        metadata: { userId: "u-1", workspaceId: "workspace-a", memoryType: "fact" },
        content: onTopicFact.content,
      },
    ]);

    const result = await engine.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      query,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });

    expect(result.metadata.routingDecision.strategy).toBe("hybrid");
    expect(
      result.metadata.routingDecision.strategyExplanation.semanticTieBreaking,
    ).toBe(true);
    expect(result.facts[0]?.id).toBe("fact-on-topic");
  });
});
