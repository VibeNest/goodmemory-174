import { describe, expect, it } from "bun:test";
import {
  annotateExtractionResult,
  mergeExtractionResults,
} from "../../src/remember/extraction";

describe("remember extraction helpers", () => {
  it("annotates extraction results with their source strategy", () => {
    const result = annotateExtractionResult(
      {
        candidates: [
          {
            id: "rules-1",
            kindHint: "fact",
            explicitness: "explicit",
            content: "Runtime rollout is blocked on legal review.",
            sourceMessageIndex: 0,
            sourceRole: "user",
          },
        ],
        ignoredMessageCount: 0,
      },
      "rules-only",
    );

    expect(result.candidates[0]?.extractionSources).toEqual(["rules-only"]);
  });

  it("merges duplicate assisted candidates without duplicating them", () => {
    const merged = mergeExtractionResults(
      {
        candidates: [
          {
            id: "rules-1",
            kindHint: "fact",
            explicitness: "explicit",
            content: "Runtime rollout is blocked on legal review.",
            sourceMessageIndex: 0,
            sourceRole: "user",
            extractionSources: ["rules-only"],
          },
        ],
        ignoredMessageCount: 0,
      },
      {
        candidates: [
          {
            id: "llm-1",
            kindHint: "fact",
            explicitness: "explicit",
            content: "Runtime rollout is blocked on legal review.",
            sourceMessageIndex: 0,
            sourceRole: "user",
            extractionSources: ["llm-assisted"],
          },
        ],
        ignoredMessageCount: 0,
      },
    );

    expect(merged.candidates).toHaveLength(1);
    expect(merged.candidates[0]?.extractionSources).toEqual([
      "rules-only",
      "llm-assisted",
    ]);
  });
});
