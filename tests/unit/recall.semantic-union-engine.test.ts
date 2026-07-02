import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
import type { EmbeddingAdapter } from "../../src/embedding/contracts";
import { createRecallEngine } from "../../src/recall/engine";
import type { RecallSemanticCandidatesConfig } from "../../src/recall/engine";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";

// The semantic candidate-generation UNION is the only admission path that can
// surface a fact sharing ZERO tokens with the query: every route/augmenter and
// the zero-retrieval fallback key on lexical-family signals, and the additive
// semanticScore only re-ranks already-admitted candidates. The query and the
// gold fact below are deliberately token-disjoint (stopwords aside), so without
// the union the engine provably returns nothing.
const QUERY = "What helps you relax in the evenings?";
const GOLD_CONTENT = "Marco goes fishing at the lake to destress.";
const NOISE_CONTENT = "Quarterly budget numbers were approved.";

// Fixed-vector stub: the query and the gold fact are near-parallel, the noise
// fact is orthogonal. Deterministic, no provider.
function createFixedEmbeddingAdapter(): EmbeddingAdapter {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        if (text === QUERY) {
          return [1, 0, 0];
        }
        if (text.includes("fishing")) {
          return [0.95, 0.05, 0];
        }
        if (text.includes("music")) {
          return [1, 0, 0];
        }
        return [0, 1, 0];
      });
    },
  };
}

const scope = { userId: "u-1", workspaceId: "workspace-a" };

function makeFact(id: string, content: string) {
  return createFactMemory({
    id,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    category: "personal",
    content,
    source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function buildEngine(input: {
  embedding?: boolean;
  semanticCandidates?: RecallSemanticCandidatesConfig;
  extraFactIds?: string[];
}) {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const vectorStore = createInMemoryVectorStore();
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore,
    vectorStore,
  });
  const embedding = createFixedEmbeddingAdapter();

  const gold = makeFact("fact-gold", GOLD_CONTENT);
  const noise = makeFact("fact-noise", NOISE_CONTENT);
  await repositories.facts.add(gold);
  await repositories.facts.add(noise);
  const [goldEmbedding, noiseEmbedding] = await embedding.embed([
    gold.content,
    noise.content,
  ]);
  const metadata = {
    userId: scope.userId,
    workspaceId: scope.workspaceId,
    memoryType: "fact",
  };
  await repositories.vectorIndex!.upsertFactEmbedding([
    { id: gold.id, embedding: goldEmbedding, metadata, content: gold.content },
    { id: noise.id, embedding: noiseEmbedding, metadata, content: noise.content },
    // Stale vector row: an embedding whose fact no longer exists in the
    // repository. The union must never admit it.
    {
      id: "fact-ghost",
      embedding: [0.99, 0.01, 0],
      metadata,
      content: "ghost",
    },
  ]);

  const engine = createRecallEngine({
    repositories,
    runtime: sessionStore,
    ...(input.embedding === false ? {} : { embedding }),
    ...(input.semanticCandidates
      ? { semanticCandidates: input.semanticCandidates }
      : {}),
  });
  return { engine, repositories, embedding };
}

describe("semantic candidate-generation union (engine)", () => {
  it("admits a zero-lexical-overlap fact with full attribution, skips stale rows and zero-signal candidates", async () => {
    const { engine } = await buildEngine({ semanticCandidates: { topK: 4 } });
    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });

    const ids = result.facts.map((fact) => fact.id);
    expect(ids).toContain("fact-gold");
    // Stale vector row: never admitted.
    expect(ids).not.toContain("fact-ghost");
    // Orthogonal fact has raw score 0 -> zero-signal, never admitted.
    expect(ids).not.toContain("fact-noise");

    const trace = result.metadata.candidateTraces.find(
      (entry) => entry.memoryId === "fact-gold",
    );
    expect(trace?.returned).toBe(true);
    expect(trace?.fallback).toBe("semantic_union");
    expect(trace?.semanticScore ?? 0).toBeGreaterThan(0);

    const hit = result.metadata.hits.find((entry) => entry.id === "fact-gold");
    expect(hit?.reason).toBe("semantic_union");
  });

  it("returns nothing for the same query when the union is off (regression guard)", async () => {
    const { engine } = await buildEngine({});
    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    expect(result.facts.map((fact) => fact.id)).not.toContain("fact-gold");
    const serialized = JSON.stringify(result.metadata.candidateTraces);
    expect(serialized).not.toContain("semantic_union");
    expect(serialized).not.toContain("semanticScore");
  });

  it("applies minSimilarity to the RAW store score", async () => {
    const { engine } = await buildEngine({
      semanticCandidates: { topK: 4, minSimilarity: 0.99 },
    });
    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    // Gold raw score is 0.95 < 0.99, so the floor excludes it.
    expect(result.facts.map((fact) => fact.id)).not.toContain("fact-gold");
  });

  it("treats maxAdditions as the noise budget and does not charge dedup hits against it", async () => {
    const { engine, repositories, embedding } = await buildEngine({
      semanticCandidates: { topK: 4, maxAdditions: 1 },
    });
    // A lexically-admitted fact (shares "helps you relax in the evenings"
    // tokens with the query) that is ALSO the top vector hit: it dedups against
    // the primary selection (consuming no budget), leaving the single budget
    // slot for the zero-overlap gold fact. The query stays generic so no
    // slot-specific early-return path bypasses the union.
    const lexical = makeFact(
      "fact-lexical",
      "Quiet music helps you relax in the evenings.",
    );
    await repositories.facts.add(lexical);
    const [lexicalEmbedding] = await embedding.embed([lexical.content]);
    await repositories.vectorIndex!.upsertFactEmbedding([
      {
        id: lexical.id,
        embedding: lexicalEmbedding,
        metadata: {
          userId: scope.userId,
          workspaceId: scope.workspaceId,
          memoryType: "fact",
        },
        content: lexical.content,
      },
    ]);

    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    const ids = result.facts.map((fact) => fact.id);
    expect(ids.filter((id) => id === "fact-lexical").length).toBe(1);
    const lexicalTrace = result.metadata.candidateTraces.find(
      (entry) => entry.memoryId === "fact-lexical",
    );
    expect(lexicalTrace?.returned).toBe(true);
    expect(lexicalTrace?.fallback).not.toBe("semantic_union");
    // The dedup hit consumed no budget: the gold fact still fits in
    // maxAdditions: 1.
    expect(ids).toContain("fact-gold");
  });

  it("blocks all union admissions with maxAdditions: 0", async () => {
    const { engine } = await buildEngine({
      semanticCandidates: { topK: 4, maxAdditions: 0 },
    });
    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    expect(result.facts.map((fact) => fact.id)).not.toContain("fact-gold");
  });

  it("is a telemetry-visible no-op when the flag is on but no embedding adapter exists", async () => {
    const { engine } = await buildEngine({
      embedding: false,
      semanticCandidates: { topK: 4 },
    });
    const result = await engine.recall({
      scope,
      query: QUERY,
      retrievalProfile: "general_chat",
      strategy: "hybrid",
    });
    expect(result.facts.map((fact) => fact.id)).not.toContain("fact-gold");
    expect(result.metadata.policyApplied).toContain(
      "semantic_candidates_unavailable",
    );
  });
});
