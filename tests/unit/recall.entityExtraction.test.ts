import { describe, expect, it } from "bun:test";

import {
  buildEntityDocumentFrequency,
  extractEntities,
  extractEntityKeys,
} from "../../src/recall/entityExtraction";

describe("extractEntities", () => {
  it("extracts capitalized proper nouns and skips lower-case common words", () => {
    const entities = extractEntities("Alice visited Paris and enjoyed coffee");
    expect(entities.map((entity) => entity.normalized)).toEqual([
      "alice",
      "paris",
    ]);
    expect(entities.every((entity) => entity.kind === "proper")).toBe(true);
  });

  it("filters sentence-initial question words and auxiliaries via the stoplist", () => {
    // "Where"/"did" lower-case to stop-words; "go"/"in" are not entities.
    const keys = extractEntityKeys("Where did Alice go in 2019?");
    expect([...keys].sort()).toEqual(["2019", "alice"]);
  });

  it("classifies digit-bearing tokens as numeric entities", () => {
    const entities = extractEntities("Alice paid 2019 dollars for room 42");
    const byKey = new Map(entities.map((entity) => [entity.normalized, entity]));
    expect(byKey.get("2019")?.kind).toBe("numeric");
    expect(byKey.get("42")?.kind).toBe("numeric");
    expect(byKey.get("alice")?.kind).toBe("proper");
  });

  it("tokenizes on dots and colons (consistent with the bridge extractor)", () => {
    // The token regex intentionally splits "D11:26"/"v18.15.0" rather than
    // treating them as one entity, matching iterativeRecall's bridge tokens.
    const keys = extractEntityKeys("turn D11:26 upgraded to v18.15.0");
    expect(keys.has("d11")).toBe(true);
    expect(keys.has("v18")).toBe(true);
    expect(keys.has("d11:26")).toBe(false);
  });

  it("strips a trailing possessive and de-duplicates by normalized key", () => {
    const entities = extractEntities("Alice's dog and Alice again");
    expect(entities.map((entity) => entity.normalized)).toEqual(["alice"]);
    // First surface form wins.
    expect(entities[0]?.surface).toBe("Alice's");
  });

  it("returns nothing for text without proper nouns or numbers", () => {
    expect(extractEntities("the quick brown fox jumped")).toEqual([]);
  });
});

describe("buildEntityDocumentFrequency", () => {
  it("counts document presence once per document, not per mention", () => {
    const frequency = buildEntityDocumentFrequency([
      { id: "d1", content: "Alice met Alice near Paris" },
      { id: "d2", content: "Bob visited Paris" },
      { id: "d3", content: "the weather was calm" },
    ]);
    expect(frequency.get("alice")).toBe(1); // repeated in d1 -> counts once
    expect(frequency.get("paris")).toBe(2); // d1 and d2
    expect(frequency.get("bob")).toBe(1);
    expect(frequency.has("weather")).toBe(false); // lower-case, not an entity
  });
});
