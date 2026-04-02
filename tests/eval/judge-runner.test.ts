import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createFakeLLMAdapter } from "../../src/testing/fakes";
import {
  loadPersonaSpec,
  loadScenarioFixture,
} from "../../src/eval/dataset";
import {
  runJudgeComparison,
} from "../../src/eval/judge";
import type { EvalAnswerPackage } from "../../src/eval/runners";

function buildAnswerPackage(
  mode: "baseline" | "goodmemory",
  answer: string,
): EvalAnswerPackage {
  return {
    mode,
    personaId: "medium-01",
    scenarioId: "scenario-medium-01",
    prompt: "Please confirm the updated runbook, my role, and the open loop.",
    transcript: "user: ...",
    memoryContext: mode === "goodmemory" ? "## References\n- runbook" : undefined,
    answer,
    trace: {
      sessionsReplayed: mode === "goodmemory" ? 3 : 0,
      rememberEvents: [],
      feedbackEvents: [],
      recallHitCount: mode === "goodmemory" ? 4 : 0,
      verificationHintCount: 0,
      contextBuild:
        mode === "goodmemory"
          ? {
              output: "markdown",
              maxTokens: 160,
              contentLength: 22,
              recallTokenCount: 18,
            }
          : null,
    },
  };
}

describe("judge runner", () => {
  it("runs the judge model and parses comparative scores", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const judge = createFakeLLMAdapter([
      {
        content: JSON.stringify({
          winner: "goodmemory",
          scores: {
            identity_understanding: 9,
            history_continuation: 9,
            factual_alignment: 8,
            relevance: 9,
          },
          baseline_scores: {
            identity_understanding: 5,
            history_continuation: 4,
            factual_alignment: 6,
            relevance: 6,
          },
          goodmemory_scores: {
            identity_understanding: 9,
            history_continuation: 9,
            factual_alignment: 8,
            relevance: 9,
          },
          reasoning: "GoodMemory used the corrected runbook and open loop.",
          failure_tags: [],
        }),
      },
    ]);

    const result = await runJudgeComparison({
      persona,
      scenario,
      baseline: buildAnswerPackage("baseline", "I need more context."),
      goodmemory: buildAnswerPackage(
        "goodmemory",
        "You are a robotics engineer and the updated runbook is v2.",
      ),
      judge,
    });

    expect(result.winner).toBe("goodmemory");
    expect(result.goodmemory_scores?.history_continuation).toBe(9);
    expect(result.baseline_scores?.history_continuation).toBe(4);
    expect(result.reasoning).toContain("corrected runbook");
  });
});
