import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  listPersonaSpecs,
  listScenarioFixtures,
  loadScenarioFixture,
  summarizeScenarioDataset,
  validateScenarioDatasetLinks,
  validateScenarioFixture,
} from "../../src/eval/dataset";

describe("scenario dataset", () => {
  it("loads and validates a scenario fixture", async () => {
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );

    expect(scenario.persona_id).toBe("medium-01");
    expect(scenario.required_phenomena).toContain("stale_info");
    expect(scenario.task_family).toBeDefined();
    expect(scenario.domain.length).toBeGreaterThan(0);
    expect(scenario.memory_source_domains.length).toBeGreaterThan(0);
  });

  it("links replay fixtures to personas and covers key phenomena", async () => {
    const personas = await listPersonaSpecs(
      join(import.meta.dir, "../../fixtures/personas/eval"),
    );
    const scenarios = await listScenarioFixtures(
      join(import.meta.dir, "../../fixtures/scenarios/eval"),
    );

    const summary = summarizeScenarioDataset(scenarios);

    expect(scenarios).toHaveLength(40);
    expect(summary.coveredPhenomena).toEqual([
      "confirmation",
      "correction",
      "historical_task_continuation",
      "identity_reveal",
      "open_loop",
      "stale_info",
    ]);
    expect(summary.coveredTaskFamilies).toEqual([
      "cross_domain_suppression",
      "cross_domain_transfer",
      "drift_override_lifelong_update",
      "preference_continuation",
    ]);
    expect(summary.coveredEvaluationSettings).toEqual([
      "cross_domain",
      "single_domain",
    ]);
    expect(summary.coveredDomains.length).toBeGreaterThanOrEqual(12);
    expect(
      scenarios.some(
        (scenario) =>
          scenario.task_family === "preference_continuation" &&
          scenario.evaluation_setting === "single_domain" &&
          scenario.sessions.length >= 5,
      ),
    ).toBe(true);
    expect(
      scenarios.some(
        (scenario) =>
          scenario.task_family === "drift_override_lifelong_update" &&
          scenario.sessions.length >= 5,
      ),
    ).toBe(true);
    expect(
      scenarios.some(
        (scenario) =>
          scenario.evaluation_setting === "cross_domain" &&
          scenario.sessions.some((session) =>
            session.turns.some((turn) =>
              turn.content.includes("This is unrelated to the current"),
            ),
          ),
      ),
    ).toBe(true);
    expect(() => validateScenarioDatasetLinks(personas, scenarios)).not.toThrow();
  });

  it("rejects scenarios missing improvement hypotheses or bucket richness", () => {
    expect(() =>
      validateScenarioFixture({
        scenario_id: "scenario-invalid-medium",
        persona_id: "medium-01",
        lifecycle_bucket: "medium",
        task_family: "preference_continuation",
        domain: "work_ops",
        memory_source_domains: ["work_ops"],
        evaluation_setting: "single_domain",
        required_phenomena: [
          "identity_reveal",
          "historical_task_continuation",
          "open_loop",
          "correction",
          "confirmation",
          "stale_info",
        ],
        sessions: [
          {
            session_id: "s-1",
            objective: "too short",
            turns: [
              { role: "user", content: "Remember that I am a robotics engineer." },
              { role: "assistant", content: "Noted." },
            ],
          },
        ],
        evaluation: {
          prompt: "Confirm my role.",
          rubric_focus: ["identity_background"],
          expected_identity_signals: ["Robotics engineer"],
          expected_history_signals: ["migration rollout"],
          expected_transfer_signals: ["concise bullet points"],
          expected_non_transfer_signals: ["spoiler-heavy framing"],
          expected_update_wins: ["docs/runbook-v2.md"],
          expected_stale_suppression: ["docs/runbook-v1.md"],
          wrong_personalization_signals: ["spoiler-heavy framing"],
          improvement_hypothesis: "",
          user_satisfaction_hypothesis: "memory should improve personalization",
        },
      }),
    ).toThrow();
  });

  it("rejects feedback signals that point at unknown sessions", () => {
    expect(() =>
      validateScenarioFixture({
        scenario_id: "scenario-invalid-feedback",
        persona_id: "medium-01",
        lifecycle_bucket: "medium",
        task_family: "cross_domain_transfer",
        domain: "shopping",
        memory_source_domains: ["work_ops", "gaming"],
        evaluation_setting: "cross_domain",
        required_phenomena: [
          "identity_reveal",
          "historical_task_continuation",
          "open_loop",
          "correction",
          "confirmation",
          "stale_info",
        ],
        sessions: [
          {
            session_id: "s-1",
            objective: "identity",
            turns: [
              { role: "user", content: "My name is Lin." },
              { role: "assistant", content: "Noted." },
              { role: "user", content: "Remember that I lead migration rollout." },
              { role: "assistant", content: "Captured." },
            ],
          },
          {
            session_id: "s-2",
            objective: "reference",
            turns: [
              { role: "user", content: "Use docs/runbook-v1.md as the source of truth." },
              { role: "assistant", content: "Okay." },
              { role: "user", content: "Remember that the open loop is final verification." },
              { role: "assistant", content: "Captured." },
            ],
          },
          {
            session_id: "s-3",
            objective: "correction",
            turns: [
              { role: "user", content: "Correction: docs/runbook-v2.md is now the source of truth, not docs/runbook-v1.md. Please update that." },
              { role: "assistant", content: "Updated." },
              { role: "user", content: "Please confirm my role and the updated runbook." },
              { role: "assistant", content: "I can do that once I have context." },
            ],
          },
        ],
        feedback_signals: [
          {
            session_id: "missing-session",
            signal: "Keep using concise bullets.",
          },
        ],
        evaluation: {
          prompt: "Please confirm my role and the updated runbook.",
          rubric_focus: ["identity_background", "history_open_loop"],
          expected_identity_signals: ["Lin"],
          expected_history_signals: ["docs/runbook-v2.md", "final verification"],
          expected_transfer_signals: ["concise bullet points"],
          expected_non_transfer_signals: ["spoiler-heavy framing"],
          expected_update_wins: ["docs/runbook-v2.md"],
          expected_stale_suppression: ["docs/runbook-v1.md"],
          wrong_personalization_signals: ["spoiler-heavy framing"],
          improvement_hypothesis:
            "GoodMemory should recover the corrected runbook and user identity.",
          user_satisfaction_hypothesis:
            "memory should help transfer stable preferences without contamination",
        },
      }),
    ).toThrow("must reference a known session");
  });
});
