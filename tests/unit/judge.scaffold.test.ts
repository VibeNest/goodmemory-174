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
      expectedIdentitySignals: ["Robotics engineer", "Shanghai"],
      expectedHistorySignals: ["migration open after step 2"],
      taskFamily: "drift_override_lifelong_update",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      expectedTransferSignals: ["concise bullet points"],
      expectedNonTransferSignals: ["spoiler-free movie picks"],
      expectedUpdateWins: ["docs/migration-runbook-v2.md"],
      expectedStaleSuppression: ["docs/migration-runbook-v1.md"],
      wrongPersonalizationSignals: ["spoiler-heavy framing"],
      improvementHypothesis:
        "GoodMemory should recover the prior open loop and role without extra user repetition.",
      userSatisfactionHypothesis:
        "The answer should use the latest role and corrected runbook.",
    });

    expect(prompt).toContain("Robotics engineer in Shanghai");
    expect(prompt).toContain("baseline");
    expect(prompt).toContain("goodmemory");
    expect(prompt).toContain("expected improvement hypothesis");
    expect(prompt).toContain("target domain");
    expect(prompt).toContain("expected identity signals");
    expect(prompt).toContain("expected history signals");
    expect(prompt).toContain("expected transfer signals");
    expect(prompt).toContain("Prefix every failure tag with baseline_, goodmemory_, or shared_.");
    expect(prompt).toContain("Do not penalize an answer for refusing to invent unavailable details.");
  });

  it("parses valid judge output", () => {
    const result = parseJudgeResult(
      JSON.stringify({
        winner: "goodmemory",
        scores: {
          factual_recall: 9,
          preference_consistency: 8,
          cross_domain_transfer: 7,
          contamination_penalty: 9,
          update_correctness: 10,
          personalization_usefulness: 9,
          provenance_explainability: 8,
        },
        reasoning: "GoodMemory better continued prior task context.",
        failure_tags: [],
      }),
    );

    expect(result.winner).toBe("goodmemory");
    expect(result.scores.update_correctness).toBe(10);
  });

  it("extracts the JSON object from model output that includes reasoning wrappers", () => {
    const result = parseJudgeResult(
      `<think>
internal reasoning
</think>
{"winner":"goodmemory","scores":{"factual_recall":9,"preference_consistency":8,"cross_domain_transfer":7,"contamination_penalty":9,"update_correctness":10,"personalization_usefulness":8,"provenance_explainability":9},"reasoning":"GoodMemory better continued prior task context.","failure_tags":[]}`,
    );

    expect(result.winner).toBe("goodmemory");
    expect(result.scores.personalization_usefulness).toBe(8);
  });

  it("normalizes grouped failure tags and falls back to comparative scores", () => {
    const result = parseJudgeResult(
      JSON.stringify({
        winner: "goodmemory",
        scores: {
          baseline_overall: 1.2,
          goodmemory_overall: 8,
        },
        baseline_scores: {
          factual_recall: 4,
          preference_consistency: 2,
          cross_domain_transfer: 1,
          contamination_penalty: 3,
          update_correctness: 2,
          personalization_usefulness: 1,
          provenance_explainability: 3,
        },
        goodmemory_scores: {
          factual_recall: 8,
          preference_consistency: 8,
          cross_domain_transfer: 9,
          contamination_penalty: 8,
          update_correctness: 9,
          personalization_usefulness: 6,
          provenance_explainability: 7,
        },
        reasoning: "comparison complete",
        failure_tags: {
          baseline: ["no_memory_use"],
          goodmemory: ["limited_personalization"],
        },
      }),
    );

    expect(result.scores.cross_domain_transfer).toBe(9);
    expect(result.failure_tags).toEqual([
      "baseline:no_memory_use",
      "goodmemory:limited_personalization",
    ]);
  });

  it("rejects malformed or incomplete judge output", () => {
    expect(() => parseJudgeResult("not-json")).toThrow();
    expect(() =>
      parseJudgeResult(
        JSON.stringify({
          winner: "tie",
          scores: {
            factual_recall: 7,
            preference_consistency: 7,
            cross_domain_transfer: 7,
            contamination_penalty: 7,
            update_correctness: 7,
            personalization_usefulness: 7,
          },
          reasoning: "missing provenance explainability",
          failure_tags: [],
        }),
      ),
    ).toThrow("scores must be present");
  });
});
