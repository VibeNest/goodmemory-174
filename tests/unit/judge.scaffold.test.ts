import { describe, expect, it } from "bun:test";
import {
  buildJudgePrompt,
  parseJudgeResult,
} from "../../src/eval/judge";

describe("judge scaffold", () => {
  it("builds a stable judge prompt", () => {
    const prompt = buildJudgePrompt({
      personaSummary: "Robotics engineer in Shanghai",
      userPrompt: "Can you continue the migration task?",
      baselineAnswer: "I need more context.",
      goodMemoryAnswer: "Last time we left the migration open after step 2.",
      improvementHypothesis:
        "GoodMemory should recover the prior open loop and role without extra user repetition.",
    });

    expect(prompt).toContain("Robotics engineer in Shanghai");
    expect(prompt).toContain("baseline");
    expect(prompt).toContain("goodmemory");
    expect(prompt).toContain("expected improvement hypothesis");
  });

  it("parses valid judge output", () => {
    const result = parseJudgeResult(
      JSON.stringify({
        winner: "goodmemory",
        scores: {
          identity_understanding: 9,
          history_continuation: 10,
          factual_alignment: 9,
          relevance: 9,
        },
        reasoning: "GoodMemory better continued prior task context.",
        failure_tags: [],
      }),
    );

    expect(result.winner).toBe("goodmemory");
    expect(result.scores.history_continuation).toBe(10);
  });

  it("rejects malformed or incomplete judge output", () => {
    expect(() => parseJudgeResult("not-json")).toThrow();
    expect(() =>
      parseJudgeResult(
        JSON.stringify({
          winner: "tie",
          scores: {
            identity_understanding: 7,
            history_continuation: 7,
            factual_alignment: 7,
          },
          reasoning: "missing relevance",
          failure_tags: [],
        }),
      ),
    ).toThrow("scores.relevance must be a number");
  });
});
