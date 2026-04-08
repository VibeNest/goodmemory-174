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
    taskFamily: "preference_continuation",
    targetDomain: "work_ops",
    memorySourceDomains: ["work_ops"],
    evaluationSetting: "single_domain",
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
            factual_recall: 9,
            preference_consistency: 9,
            cross_domain_transfer: 8,
            contamination_penalty: 9,
            update_correctness: 9,
            personalization_usefulness: 9,
            provenance_explainability: 8,
          },
          baseline_scores: {
            factual_recall: 6,
            preference_consistency: 4,
            cross_domain_transfer: 4,
            contamination_penalty: 5,
            update_correctness: 4,
            personalization_usefulness: 4,
            provenance_explainability: 5,
          },
          goodmemory_scores: {
            factual_recall: 9,
            preference_consistency: 9,
            cross_domain_transfer: 8,
            contamination_penalty: 9,
            update_correctness: 9,
            personalization_usefulness: 9,
            provenance_explainability: 8,
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
    expect(result.goodmemory_scores?.update_correctness).toBe(9);
    expect(result.baseline_scores?.preference_consistency).toBe(4);
    expect(result.reasoning).toContain("corrected runbook");
  });
});
