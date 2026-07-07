import { describe, expect, it } from "bun:test";

import {
  type EntityUnionDocument,
  selectEntityUnionCandidates,
} from "../../src/recall/factSelection/entityUnion";

// Pool document frequencies (per-document presence):
//   alice -> d1,d2 (2)   skellig -> d1,d3 (2)   2019 -> d1 (1)   bob -> d3 (1)
const POOL: EntityUnionDocument[] = [
  { id: "d1", content: "Alice visited Skellig in 2019" },
  { id: "d2", content: "Alice likes coffee" },
  { id: "d3", content: "Bob visited Skellig" },
  { id: "d4", content: "the weather was nice" },
];

describe("selectEntityUnionCandidates", () => {
  it("returns nothing when the query has no entities", () => {
    const result = selectEntityUnionCandidates({
      documents: POOL,
      maxAdditions: 5,
      query: "how are you doing",
    });
    expect(result.admittedIds).toEqual([]);
  });

  it("admits a fact sharing a RARE entity with the query", () => {
    const result = selectEntityUnionCandidates({
      documents: POOL,
      gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 1 },
      maxAdditions: 5,
      query: "what happened in 2019",
    });
    expect(result.admittedIds).toEqual(["d1"]);
    expect(result.admissions[0]?.rareSharedEntities).toEqual(["2019"]);
  });

  it("does NOT admit on a single shared COMMON (high-frequency) entity", () => {
    // "Alice" appears in 2 of 4 docs -> not rare at rareMaxDf=1; a lone common
    // overlap is below minEntityOverlap=2, so nothing is admitted.
    const result = selectEntityUnionCandidates({
      documents: POOL,
      gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 1 },
      maxAdditions: 5,
      query: "where is Alice",
    });
    expect(result.admittedIds).toEqual([]);
  });

  it("admits on >= minEntityOverlap distinct entities even when none are rare", () => {
    const result = selectEntityUnionCandidates({
      documents: POOL,
      gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 0 },
      maxAdditions: 5,
      query: "Alice Skellig trip",
    });
    expect(result.admittedIds).toContain("d1");
  });

  it("requires a rare entity when requireRareEntity is set", () => {
    const result = selectEntityUnionCandidates({
      documents: POOL,
      gates: {
        minEntityOverlap: 2,
        rareEntityMaxDocFrequency: 0,
        requireRareEntity: true,
      },
      maxAdditions: 5,
      query: "Alice Skellig trip",
    });
    expect(result.admittedIds).toEqual([]);
  });

  it("respects the budget and ranks the rarest, strongest overlap first", () => {
    const result = selectEntityUnionCandidates({
      documents: POOL,
      gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 1 },
      maxAdditions: 1,
      query: "Alice Skellig 2019 Bob",
    });
    // d1 (rare 2019 + 3 shared, rarityScore 2.0) outranks d3 (rare Bob + 2
    // shared, rarityScore 1.5); budget 1 keeps only d1.
    expect(result.admittedIds).toEqual(["d1"]);
  });

  it("skips already-selected ids and never reorders them", () => {
    const result = selectEntityUnionCandidates({
      alreadySelectedIds: new Set(["d1"]),
      documents: POOL,
      gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 1 },
      maxAdditions: 5,
      query: "what happened in 2019",
    });
    expect(result.admittedIds).toEqual([]);
  });

  it("admits nothing when the budget is non-positive", () => {
    const result = selectEntityUnionCandidates({
      documents: POOL,
      maxAdditions: 0,
      query: "what happened in 2019",
    });
    expect(result.admittedIds).toEqual([]);
  });
});
