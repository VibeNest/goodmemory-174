import { describe, expect, it } from "bun:test";

import {
  fuseGeneralizedRecallCandidates,
  selectDynamicFusionBudget,
  type GeneralizedFusionCandidate,
} from "../../src/recall/generalizedFusion";
import type {
  EntityProjection,
  RecallIndexDocument,
  RecallProjectionSourceCollection,
} from "../../src/recall/projections/contracts";

const scope = { userId: "user-1", workspaceId: "workspace-1" };
const scopeKey = "user-1::::workspace-1::::";

function document(input: {
  id: string;
  sourceMemoryId: string;
  text: string;
  entityKeys?: string[];
  sourceCollection?: RecallProjectionSourceCollection;
}): RecallIndexDocument {
  const entityKeys = input.entityKeys ?? [];
  return {
    id: input.id,
    schemaVersion: 2,
    ...scope,
    scopeKey,
    sourceCollection: input.sourceCollection ?? "facts",
    sourceMemoryId: input.sourceMemoryId,
    sourceMemoryType: "fact",
    granularity: "field",
    text: input.text,
    entityIds: entityKeys.map((key) => `entity-${key}`),
    entityMentions: entityKeys.map((key) => ({
      canonicalKey: key,
      entityId: `entity-${key}`,
      surface: key[0]!.toUpperCase() + key.slice(1),
    })),
    provenance: { method: "explicit" },
    indexedAt: "2026-07-10T00:00:00.000Z",
  };
}

function entity(input: {
  key: string;
  memoryIds: string[];
  aliases?: string[];
  description?: string;
}): EntityProjection {
  return {
    id: `entity-${input.key}`,
    schemaVersion: 1,
    ...scope,
    scopeKey,
    canonicalKey: input.key,
    aliases: input.aliases ?? [input.key],
    description: input.description,
    memoryIds: input.memoryIds,
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

describe("generalized recall fusion", () => {
  it("deduplicates multi-granular documents by source memory", () => {
    const result = fuseGeneralizedRecallCandidates({
      query: "Atlas migration Paris",
      documents: [
        document({
          id: "doc-memory",
          sourceMemoryId: "fact-atlas",
          text: "Atlas migration starts in Paris.",
        }),
        document({
          id: "doc-sentence",
          sourceMemoryId: "fact-atlas",
          text: "Paris hosts the Atlas migration.",
        }),
        document({
          id: "doc-noise",
          sourceMemoryId: "fact-noise",
          text: "The quarterly budget was approved.",
        }),
      ],
      entities: [],
      maxCandidates: 8,
    });

    expect(result.candidates.map((candidate) => candidate.sourceMemoryId)).toEqual([
      "fact-atlas",
    ]);
    expect(result.candidates[0]?.channels.lexical?.evidenceDocumentIds).toEqual([
      "doc-memory",
      "doc-sentence",
    ]);
  });

  it("uses lexical, dense, and direct entity adjacency as independent RRF channels", () => {
    const result = fuseGeneralizedRecallCandidates({
      query: "What changed for Atlas?",
      documents: [
        document({
          id: "doc-atlas",
          sourceMemoryId: "fact-atlas",
          text: "Atlas moved from Paris to Lisbon.",
          entityKeys: ["atlas", "paris", "lisbon"],
        }),
        document({
          id: "doc-lexical",
          sourceMemoryId: "fact-lexical",
          text: "Atlas has a generic status update.",
          entityKeys: ["atlas"],
        }),
      ],
      denseCandidates: [
        { sourceCollection: "facts", sourceMemoryId: "fact-atlas", score: 0.9 },
      ],
      entities: [
        entity({
          key: "atlas",
          aliases: ["Atlas"],
          description: "Atlas migration project",
          memoryIds: ["facts:fact-atlas", "facts:fact-lexical"],
        }),
      ],
      maxCandidates: 8,
    });

    expect(result.candidates[0]?.sourceMemoryId).toBe("fact-atlas");
    expect(Object.keys(result.candidates[0]?.channels ?? {}).sort()).toEqual([
      "dense",
      "entity",
      "lexical",
    ]);
    expect(result.candidates[0]?.score).toBeGreaterThan(
      result.candidates[1]?.score ?? 0,
    );
  });

  it("does not expand from a matched entity through a second entity to another memory", () => {
    const result = fuseGeneralizedRecallCandidates({
      query: "Tell me about Atlas",
      documents: [
        document({
          id: "doc-atlas",
          sourceMemoryId: "fact-atlas",
          text: "Migration plan",
        }),
        document({
          id: "doc-lisbon",
          sourceMemoryId: "fact-lisbon",
          text: "Office relocation",
        }),
      ],
      entities: [
        entity({
          key: "atlas",
          memoryIds: ["facts:fact-atlas"],
        }),
        entity({
          key: "lisbon",
          memoryIds: ["facts:fact-atlas", "facts:fact-lisbon"],
        }),
      ],
      maxCandidates: 8,
    });

    expect(result.candidates.map((candidate) => candidate.sourceMemoryId)).toEqual([
      "fact-atlas",
    ]);
  });

  it("does not admit a corpus-wide entity such as a recurring speaker name", () => {
    const documents = Array.from({ length: 20 }, (_, index) =>
      document({
        id: `doc-${index}`,
        sourceMemoryId: `fact-${index}`,
        text: `Unrelated record number ${index}`,
      }),
    );
    const result = fuseGeneralizedRecallCandidates({
      query: "What did Alice decide?",
      documents,
      entities: [
        entity({
          key: "alice",
          aliases: ["Alice"],
          memoryIds: documents.map(
            (projection) => `facts:${projection.sourceMemoryId}`,
          ),
        }),
      ],
      maxCandidates: 8,
    });

    expect(result.candidates).toEqual([]);
  });

  it("matches lowercase multiword aliases without relying on proper-noun extraction", () => {
    const result = fuseGeneralizedRecallCandidates({
      query: "what changed for atlas migration?",
      documents: [
        document({
          id: "doc-atlas",
          sourceMemoryId: "fact-atlas",
          text: "The deployment status changed.",
        }),
      ],
      entities: [
        entity({
          key: "internal-project-key",
          aliases: ["atlas migration"],
          memoryIds: ["facts:fact-atlas"],
        }),
      ],
      maxCandidates: 8,
    });

    expect(result.candidates.map((candidate) => candidate.sourceMemoryId)).toEqual([
      "fact-atlas",
    ]);
    expect(result.candidates[0]?.channels.entity).toBeDefined();
  });

  it("does not treat an unrelated lowercase alias as a query match", () => {
    const result = fuseGeneralizedRecallCandidates({
      query: "what changed for atlas migration?",
      documents: [
        document({
          id: "doc-beacon",
          sourceMemoryId: "fact-beacon",
          text: "Beacon launched yesterday.",
        }),
      ],
      entities: [
        entity({
          key: "internal-project-key",
          aliases: ["beacon rollout"],
          memoryIds: ["facts:fact-beacon"],
        }),
      ],
      maxCandidates: 8,
    });

    expect(result.candidates).toEqual([]);
  });

  it("does not let dense or entity channels readmit a temporally expired source", () => {
    const expired = {
      ...document({
        id: "doc-expired",
        sourceMemoryId: "fact-expired",
        text: "An unrelated archived status.",
      }),
      effectiveUntil: "2026-07-01T00:00:00.000Z",
    };
    const active = document({
      id: "doc-active",
      sourceMemoryId: "fact-active",
      text: "A separate current status.",
    });
    const result = fuseGeneralizedRecallCandidates({
      query: "atlas",
      documents: [expired, active],
      denseCandidates: [
        { sourceCollection: "facts", sourceMemoryId: "fact-expired", score: 1 },
        { sourceCollection: "facts", sourceMemoryId: "fact-active", score: 0.8 },
      ],
      entities: [
        entity({
          key: "atlas",
          memoryIds: ["facts:fact-expired"],
        }),
      ],
      maxCandidates: 8,
      referenceTime: "2026-07-10T00:00:00.000Z",
    });

    expect(result.candidates.map((candidate) => candidate.sourceMemoryId)).toEqual([
      "fact-active",
    ]);
    expect(result.candidates[0]?.channels.dense).toBeDefined();
  });

  it("uses deterministic source identity as the final tie-break", () => {
    const result = fuseGeneralizedRecallCandidates({
      query: "Atlas",
      documents: [],
      denseCandidates: [
        { sourceCollection: "facts", sourceMemoryId: "fact-b", score: 0.8 },
        { sourceCollection: "facts", sourceMemoryId: "fact-a", score: 0.8 },
      ],
      entities: [],
      maxCandidates: 8,
    });

    expect(result.candidates.map((candidate) => candidate.sourceMemoryId)).toEqual([
      "fact-a",
      "fact-b",
    ]);
  });
});

describe("dynamic fusion noise budget", () => {
  function candidate(
    sourceMemoryId: string,
    score: number,
    evidenceStrength: number,
  ): GeneralizedFusionCandidate {
    return {
      sourceCollection: "facts",
      sourceMemoryId,
      score,
      evidenceStrength,
      channels: {
        lexical: {
          evidenceDocumentIds: [`doc-${sourceMemoryId}`],
          rank: 1,
          rawScore: evidenceStrength,
          rrfScore: score,
        },
      },
    };
  }

  it("drops a weak tail instead of always filling the hard cap", () => {
    const selected = selectDynamicFusionBudget(
      [
        candidate("strong-a", 1, 1),
        candidate("strong-b", 0.9, 0.7),
        candidate("weak-a", 0.8, 0.15),
        candidate("weak-b", 0.7, 0.1),
      ],
      { maxCandidates: 8, minRelativeStrength: 0.4 },
    );
    expect(selected.map((entry) => entry.sourceMemoryId)).toEqual([
      "strong-a",
      "strong-b",
    ]);
  });

  it("never exceeds the explicit hard cap", () => {
    const selected = selectDynamicFusionBudget(
      Array.from({ length: 10 }, (_, index) =>
        candidate(`fact-${index}`, 1 - index / 100, 1 - index / 100),
      ),
      { maxCandidates: 3 },
    );
    expect(selected).toHaveLength(3);
  });
});
