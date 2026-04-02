import { describe, expect, it } from "bun:test";
import {
  createDeterministicMemoryExtractor,
} from "../../src/remember/deterministicExtractor";

describe("deterministic memory extractor", () => {
  it("separates explicit facts, profile updates, and procedural feedback", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        { role: "user", content: "My name is Lin." },
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
        {
          role: "user",
          content: "Please keep answers concise and action-oriented.",
        },
        { role: "user", content: "Hi" },
      ],
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.kindHint)).toEqual([
      "profile",
      "fact",
      "feedback",
    ]);
    expect(result.candidates.map((candidate) => candidate.explicitness)).toEqual([
      "explicit",
      "explicit",
      "explicit",
    ]);
    expect(result.candidates[0]?.content).toBe("Lin");
    expect(result.candidates[1]?.content).toBe(
      "the robot workflow is blocked on prod migration.",
    );
    expect(result.candidates[2]?.metadata?.feedbackKind).toBe("do");
  });

  it("extracts lower-confidence inferred facts from future-useful user context", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "The robot workflow is still failing in production after the migration.",
        },
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.kindHint).toBe("fact");
    expect(result.candidates[0]?.explicitness).toBe("inferred");
  });

  it("does not treat arbitrary long user messages as durable facts", async () => {
    const extractor = createDeterministicMemoryExtractor();

    const result = await extractor.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content:
            "I spent most of the afternoon reading articles and drinking coffee while thinking about unrelated ideas.",
        },
      ],
    });

    expect(result.candidates).toHaveLength(0);
  });
});
