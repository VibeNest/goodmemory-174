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

  it("preserves trace metadata when duplicate candidates merge", () => {
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
            profileId: "life-coach",
            presetId: "default",
            ruleIds: ["life-goal-priority"],
            annotation: {
              remember: "always",
              reason: "host marked this turn durable",
            },
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
            extractorIds: ["life-coach:extractor-1"],
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
    expect(merged.candidates[0]?.extractorIds).toEqual([
      "life-coach:extractor-1",
    ]);
    expect(merged.candidates[0]?.profileId).toBe("life-coach");
    expect(merged.candidates[0]?.presetId).toBe("default");
    expect(merged.candidates[0]?.ruleIds).toEqual(["life-goal-priority"]);
    expect(merged.candidates[0]?.annotation).toEqual({
      remember: "always",
      reason: "host marked this turn durable",
    });
  });

  it("uses stable metadata semantics when merging duplicate candidates", () => {
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
            metadata: {
              attributes: { b: 2, a: 1 },
              category: "goal",
              tags: ["planning", "life_coach"],
            },
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
            metadata: {
              category: "goal",
              tags: ["life_coach", "planning"],
              attributes: { a: 1, b: 2 },
            },
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
