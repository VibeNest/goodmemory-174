import { describe, expect, it } from "bun:test";

import {
  createEpisodeMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import type { EmbeddingAdapter } from "../../src/embedding/contracts";
import { createSessionArchive } from "../../src/evolution/contracts";
import {
  createRecallEngine,
  resolveActiveGeneralizedFusionConfig,
} from "../../src/recall/engine";
import { createRecallProjectionRuntime } from "../../src/recall/projections/runtime";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";

const QUERY = "What helps you relax in the evenings?";
const scope = { userId: "user-1", workspaceId: "workspace-1" };

function createFixedEmbeddingAdapter(): EmbeddingAdapter {
  return {
    async embed(texts) {
      return texts.map((text) => {
        if (text === QUERY) {
          return [1, 0, 0];
        }
        if (text.toLowerCase().includes("fishing")) {
          return [0.95, 0.05, 0];
        }
        return [0, 1, 0];
      });
    },
  };
}

describe("generalized fusion through the recall engine", () => {
  it("uses the wider fusion budget only when reranking is enabled", () => {
    const base = { maxCandidates: 8, maxTotalFacts: 10 };
    const reranking = { maxCandidates: 20, maxTotalFacts: 20 };

    expect(
      resolveActiveGeneralizedFusionConfig({
        base,
        rerank: true,
        reranking,
      }),
    ).toBe(reranking);
    expect(
      resolveActiveGeneralizedFusionConfig({
        base,
        rerank: false,
        reranking,
      }),
    ).toBe(base);
  });

  it("admits a fused dense candidate with generalized attribution and no parallel semantic bypass", async () => {
    const rawStore = createInMemoryDocumentStore();
    const projectionIndex = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => "2026-07-10T00:00:00.000Z",
    });
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore: projectionIndex.documentStore,
      sessionStore,
      vectorStore: createInMemoryVectorStore(),
    });
    const embedding = createFixedEmbeddingAdapter();
    const fact = createFactMemory({
      id: "fact-gold",
      ...scope,
      category: "personal",
      content: "Marco goes fishing at the lake to destress.",
      source: { method: "explicit", extractedAt: "2026-07-09T00:00:00.000Z" },
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z",
    });
    await repositories.facts.add(fact);
    const [factEmbedding] = await embedding.embed([fact.content]);
    await repositories.vectorIndex!.upsertFactEmbedding([
      {
        id: fact.id,
        embedding: factEmbedding,
        metadata: { ...scope, memoryType: "fact" },
        content: fact.content,
      },
    ]);
    const engine = createRecallEngine({
      repositories,
      runtime: sessionStore,
      embedding,
      autoStrategyBias: "hybrid",
      semanticCandidates: { topK: 4 },
      generalizedFusion: { maxCandidates: 4 },
      projectionIndex,
    });

    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
    });

    expect(result.facts.map((candidate) => candidate.id)).toContain(fact.id);
    const trace = result.metadata.candidateTraces.find(
      (candidate) => candidate.memoryId === fact.id,
    );
    expect(trace?.fallback).toBe("generalized_fusion");
    expect(result.metadata.hits.find((hit) => hit.id === fact.id)?.reason).toBe(
      "generalized_fusion",
    );
    expect(JSON.stringify(result.metadata)).not.toContain('"fallback":"semantic_union"');
  });

  it("keeps provider dense candidates separate from BM25 additive scores", async () => {
    const rawStore = createInMemoryDocumentStore();
    const projectionIndex = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => "2026-07-10T00:00:00.000Z",
    });
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore: projectionIndex.documentStore,
      sessionStore,
      vectorStore: createInMemoryVectorStore(),
    });
    const embedding = createFixedEmbeddingAdapter();
    const lexical = createFactMemory({
      id: "fact-lexical",
      ...scope,
      category: "personal",
      content: "Evenings are relaxing and calm.",
      source: { method: "explicit", extractedAt: "2026-07-09T00:00:00.000Z" },
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z",
    });
    const dense = createFactMemory({
      id: "fact-dense",
      ...scope,
      category: "personal",
      content: "Marco goes fishing at the lake to destress.",
      source: { method: "explicit", extractedAt: "2026-07-09T00:00:00.000Z" },
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z",
    });
    await repositories.facts.add(lexical);
    await repositories.facts.add(dense);
    const embeddings = await embedding.embed([lexical.content, dense.content]);
    await repositories.vectorIndex!.upsertFactEmbedding([
      {
        id: lexical.id,
        embedding: embeddings[0]!,
        metadata: { ...scope, memoryType: "fact" },
        content: lexical.content,
      },
      {
        id: dense.id,
        embedding: embeddings[1]!,
        metadata: { ...scope, memoryType: "fact" },
        content: dense.content,
      },
    ]);
    const engine = createRecallEngine({
      repositories,
      runtime: sessionStore,
      embedding,
      autoStrategyBias: "hybrid",
      bm25Ranking: true,
      semanticCandidates: { topK: 4 },
      generalizedFusion: { maxCandidates: 4 },
      projectionIndex,
    });

    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
    });

    expect(result.facts.map((candidate) => candidate.id)).toContain(dense.id);
    expect(
      result.metadata.candidateTraces.find(
        (candidate) => candidate.memoryId === dense.id,
      )?.fallback,
    ).toBe("generalized_fusion");
  });

  it("admits projected references, episodes, and archives through content lanes", async () => {
    const rawStore = createInMemoryDocumentStore();
    const projectionIndex = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => "2026-07-10T00:00:00.000Z",
    });
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore: projectionIndex.documentStore,
      sessionStore,
    });
    await repositories.references.add(
      createReferenceMemory({
        id: "reference-nebula",
        ...scope,
        title: "Operations note",
        pointer: "docs/internal.txt",
        attributes: { program: "Nebula escalation checklist" },
        source: { method: "explicit", extractedAt: "2026-07-09T00:00:00.000Z" },
      }),
    );
    await repositories.episodes.add(
      createEpisodeMemory({
        id: "episode-nebula",
        ...scope,
        summary: "The planning session ended with one follow-up.",
        unresolvedItems: ["Approve the Nebula escalation checklist."],
        createdAt: "2026-07-09T00:00:00.000Z",
      }),
    );
    await repositories.archives.add(
      createSessionArchive({
        id: "archive-nebula",
        ...scope,
        sessionId: "session-previous",
        summary: "The Nebula escalation checklist still needs approval.",
        archivedAt: "2026-07-09T00:00:00.000Z",
      }),
    );
    const engine = createRecallEngine({
      repositories,
      runtime: sessionStore,
      autoStrategyBias: "hybrid",
      generalizedFusion: { maxCandidates: 8 },
      projectionIndex,
    });

    const result = await engine.recall({
      scope,
      query: "Where is the Nebula escalation checklist and what needs approval?",
      retrievalProfile: "general_chat",
    });

    expect(result.references.map(({ id }) => id)).toContain("reference-nebula");
    expect(result.episodes.map(({ id }) => id)).toContain("episode-nebula");
    expect(result.archives.map(({ id }) => id)).toContain("archive-nebula");
    for (const id of [
      "reference-nebula",
      "episode-nebula",
      "archive-nebula",
    ]) {
      expect(
        result.metadata.candidateTraces.find(({ memoryId }) => memoryId === id)
          ?.fallback,
      ).toBe("generalized_fusion");
    }
  });

  it("feeds provider dense reference and episode channels into generalized fusion", async () => {
    const rawStore = createInMemoryDocumentStore();
    const projectionIndex = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => "2026-07-10T00:00:00.000Z",
    });
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore: projectionIndex.documentStore,
      sessionStore,
      vectorStore: createInMemoryVectorStore(),
    });
    const embedding = createFixedEmbeddingAdapter();
    const reference = createReferenceMemory({
      id: "reference-dense",
      ...scope,
      title: "Fishing permit archive",
      pointer: "vault/permit.txt",
      source: { method: "explicit", extractedAt: "2026-07-09T00:00:00.000Z" },
    });
    const episode = createEpisodeMemory({
      id: "episode-dense",
      ...scope,
      summary: "Marco went fishing at a quiet lake.",
      createdAt: "2026-07-09T00:00:00.000Z",
    });
    await repositories.references.add(reference);
    await repositories.episodes.add(episode);
    const [referenceEmbedding, episodeEmbedding] = await embedding.embed([
      `${reference.title} ${reference.pointer}`,
      episode.summary,
    ]);
    await repositories.vectorIndex!.upsertReferenceEmbedding([
      {
        content: reference.title,
        embedding: referenceEmbedding!,
        id: reference.id,
        metadata: { ...scope, memoryType: "reference" },
      },
    ]);
    await repositories.vectorIndex!.upsertEpisodeEmbedding([
      {
        content: episode.summary,
        embedding: episodeEmbedding!,
        id: episode.id,
        metadata: { ...scope, memoryType: "episode" },
      },
    ]);
    const engine = createRecallEngine({
      repositories,
      runtime: sessionStore,
      embedding,
      autoStrategyBias: "hybrid",
      generalizedFusion: { maxCandidates: 8, maxTotalFacts: 10 },
      projectionIndex,
    });

    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
    });

    for (const id of [reference.id, episode.id]) {
      expect(
        result.metadata.candidateTraces.find(({ memoryId }) => memoryId === id)
          ?.fallback,
      ).toBe("generalized_fusion");
    }
    expect(result.metadata.retrievalTrace?.fusionRuns).toEqual([
      expect.objectContaining({
        status: "applied",
        candidates: expect.arrayContaining([
          expect.objectContaining({
            sourceCollection: "references",
            sourceMemoryId: reference.id,
            selected: true,
            channels: expect.objectContaining({
              dense: expect.objectContaining({ rank: expect.any(Number) }),
            }),
          }),
        ]),
      }),
    ]);
  });
});
