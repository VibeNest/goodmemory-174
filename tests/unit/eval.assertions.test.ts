import { describe, expect, it } from "bun:test";
import { evaluateScenarioAssertions } from "../../src/eval/assertions";
import type { ScenarioFixture } from "../../src/eval/dataset";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import {
  createFactMemory,
  createPreferenceMemory,
} from "../../src/domain/records";

function buildScenario(): ScenarioFixture {
  return {
    scenario_id: "scenario-test",
    persona_id: "persona-test",
    lifecycle_bucket: "complex",
    task_family: "drift_override_lifelong_update",
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
    sessions: [],
    evaluation: {
      prompt: "Confirm the latest runbook and blocker.",
      rubric_focus: ["identity_background", "history_open_loop"],
      expected_identity_signals: ["robotics engineer"],
      expected_history_signals: [
        "docs/runbook-v2.md",
        "vendor approval",
      ],
      expected_transfer_signals: ["concise bullet points"],
      expected_non_transfer_signals: ["spoiler-heavy framing"],
      expected_update_wins: ["docs/runbook-v2.md", "vendor approval"],
      expected_stale_suppression: ["docs/runbook-v1.md"],
      wrong_personalization_signals: ["spoiler-heavy framing"],
      improvement_hypothesis:
        "GoodMemory should recover the updated runbook and blocker.",
      user_satisfaction_hypothesis:
        "The answer should reflect the newest project state without stale leakage.",
    },
  };
}

function buildGoodmemoryAnswer(): EvalAnswerPackage {
  return {
    mode: "goodmemory",
    strategyLabel: "rules-only",
    resolvedStrategyLabel: "rules-only",
    personaId: "persona-test",
    scenarioId: "scenario-test",
    taskFamily: "drift_override_lifelong_update",
    targetDomain: "work_ops",
    memorySourceDomains: ["work_ops"],
    evaluationSetting: "single_domain",
    prompt: "Confirm the latest runbook and blocker.",
    transcript: "user: Confirm the latest runbook and blocker.",
    answer: "Confirmed from memory:\n## References\n- Runbook (docs/runbook-v2.md)\n\n## Facts\n- vendor approval",
    memoryContext:
      "## Profile\nLin - robotics engineer\n\n## Preferences\n- response_style: concise bullet points\n\n## References\n- Runbook (docs/runbook-v2.md)\n\n## Facts\n- vendor approval",
    retrieved: {
      profile: {
        userId: "persona-test",
        identity: {
          name: "Lin",
          role: "robotics engineer",
        },
        expertise: {
          primarySkills: [],
          domains: [],
        },
        activeContext: {
          goals: [],
          currentProjects: [],
        },
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      preferences: [
        createPreferenceMemory({
          id: "pref-1",
          userId: "persona-test",
          category: "response_style",
          value: "concise bullet points",
          confidence: 1,
          source: {
            method: "explicit",
            extractedAt: "2026-01-01T00:00:00.000Z",
          },
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      references: [
        {
          id: "ref-1",
          userId: "persona-test",
          title: "Runbook",
          pointer: "docs/runbook-v2.md",
          confidence: 1,
          source: {
            method: "explicit",
            extractedAt: "2026-01-01T00:00:00.000Z",
          },
          lifecycle: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      facts: [
        createFactMemory({
          id: "fact-1",
          userId: "persona-test",
          content: "vendor approval",
          category: "project",
          confidence: 1,
          source: {
            method: "explicit",
            extractedAt: "2026-01-01T00:00:00.000Z",
          },
          lifecycle: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      feedback: [],
      archives: [],
      evidence: [],
      episodes: [
        {
          id: "episode-1",
          userId: "persona-test",
          summary:
            "Earlier the user temporarily pointed at docs/runbook-v1.md before correcting it.",
          keyDecisions: [],
          unresolvedItems: [],
          topics: ["runbook"],
          importance: 1,
          confidence: 0.7,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      workingMemory: null,
      journal: null,
      hits: [
        {
          id: "ref-1",
          type: "reference",
          reason: "semantic_reference",
          sourceMethod: "explicit",
        },
        {
          id: "fact-1",
          type: "fact",
          reason: "scope_match",
          sourceMethod: "explicit",
        },
      ],
      candidateTraces: [
        {
          memoryId: "ref-1",
          memoryType: "reference",
          slot: "reference",
          returned: true,
          whyReturned:
            "slot=reference, intentScore=1.00, lexicalScore=0.80, fallback=none",
          intentScore: 1,
          lexicalScore: 0.8,
          freshnessScore: 1,
          explicitnessScore: 1,
          fallback: "none",
        },
        {
          memoryId: "fact-1",
          memoryType: "fact",
          slot: "blocker",
          returned: true,
          whyReturned:
            "slot=blocker, intentScore=0.92, lexicalScore=0.78, fallback=none",
          intentScore: 0.92,
          lexicalScore: 0.78,
          freshnessScore: 1,
          explicitnessScore: 1,
          fallback: "none",
        },
      ],
      verificationHints: [],
      policyApplied: [],
      renderedMemoryContext:
        "## References\n- Runbook (docs/runbook-v2.md)\n\n## Facts\n- vendor approval",
    },
    trace: {
      sessionsReplayed: 3,
      rememberEvents: [
        {
          sessionId: "s1",
          replayedTurns: 2,
          accepted: 2,
          rejected: 0,
          events: [
            {
              candidateId: "candidate-0",
              outcome: "written",
              memoryType: "reference",
              memoryId: "ref-1",
              reason: "explicit_reference",
              sourceMethod: "explicit",
            },
          ],
        },
      ],
      feedbackEvents: [],
      recallHitCount: 2,
      verificationHintCount: 0,
      contextBuild: {
        output: "markdown",
        maxTokens: 160,
        contentLength: 120,
        contextEstimatedTokens: 30,
        packetTokenCountBeforeRender: 24,
      },
    },
  };
}

describe("eval assertions", () => {
  it("does not treat historical episode summaries as surfaced stale memory", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = [
      "Confirmed from memory:",
      "- source of truth: docs/runbook-v2.md",
      "- corrected reference: not docs/runbook-v1.md",
      "- superseded reference: docs/runbook-v1.md",
      "- docs/runbook-v1.md is superseded",
      "- blocker: vendor approval",
    ].join("\n");

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "stale_suppression_absent")?.passed,
    ).toBe(true);
  });

  it("does not fail stale suppression for direct negation phrasing", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = "Use docs/runbook-v2.md, not docs/runbook-v1.md. Vendor approval is still the blocker.";

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "stale_suppression_absent")?.passed,
    ).toBe(true);
  });

  it("does not fail stale suppression for common do-not-use phrasing", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = "I will not use docs/runbook-v1.md. Use docs/runbook-v2.md. Vendor approval is still the blocker.";

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "stale_suppression_absent")?.passed,
    ).toBe(true);
  });

  it("does not fail stale suppression for Chinese source-of-truth corrections", () => {
    const answer = buildGoodmemoryAnswer();
    answer.memoryContext = [
      "## Profile",
      "Lin - robotics engineer",
      "",
      "## Preferences",
      "- response_style: concise bullet points",
      "",
      "## References",
      "- Runbook (docs/runbook-v2.md)",
      "",
      "## Facts",
      "- vendor approval",
      "",
      "## Evidence",
      "- 现在以 docs/runbook-v2.md 为准，不再以 docs/runbook-v1.md 为准。",
    ].join("\n");
    answer.answer = [
      "根据已提供的记忆上下文，现在以 docs/runbook-v2.md 为准。",
      "之前的版本已不再作为当前依据。",
      "Vendor approval is still the blocker.",
    ].join(" ");

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(result.passed).toBe(true);
    expect(
      result.checks.find((check) => check.id === "stale_suppression_absent")?.passed,
    ).toBe(true);
  });

  it("still fails stale suppression when an unrelated negation appears nearby", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = "No longer blocked. Use docs/runbook-v2.md and docs/runbook-v1.md for the next step.";

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "stale_suppression_absent")?.passed,
    ).toBe(false);
  });

  it("does not fail stale suppression when the stale reference is marked as now outdated", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = [
      "Use docs/runbook-v2.md.",
      "docs/runbook-v1.md is now outdated.",
      "Vendor approval is still the blocker.",
    ].join(" ");

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "stale_suppression_absent")?.passed,
    ).toBe(true);
  });

  it("does not count negated required signals as present", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = [
      "I will not use concise bullet points.",
      "Do not use docs/runbook-v2.md.",
      "Vendor approval is still the blocker.",
    ].join(" ");

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "transfer_signals_present")?.passed,
    ).toBe(false);
    expect(
      result.checks.find((check) => check.id === "update_wins_present")?.passed,
    ).toBe(false);
  });

  it("fails contradictory required signals even when the same signal is also affirmed", () => {
    const answer = buildGoodmemoryAnswer();
    answer.answer = [
      "Use concise bullet points.",
      "Do not use concise bullet points.",
      "Use docs/runbook-v2.md.",
      "Do not use docs/runbook-v2.md.",
      "Vendor approval is still the blocker.",
    ].join(" ");

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(result.passed).toBe(false);
    expect(
      result.checks.find((check) => check.id === "transfer_signals_present"),
    ).toMatchObject({
      passed: false,
      details: expect.arrayContaining(["conflicted:concise bullet points"]),
    });
    expect(
      result.checks.find((check) => check.id === "update_wins_present"),
    ).toMatchObject({
      passed: false,
      details: expect.arrayContaining(["conflicted:docs/runbook-v2.md"]),
    });
    expect(result.updateFindings).toContain("conflicted:docs/runbook-v2.md");
  });

  it("does not treat unsurfaced raw retrieved memory as contamination", () => {
    const answer = buildGoodmemoryAnswer();
    answer.retrieved!.preferences.push(
      createPreferenceMemory({
        id: "pref-dirty",
        userId: "persona-test",
        category: "response_style",
        value: "spoiler-heavy framing",
        confidence: 1,
        source: {
          method: "explicit",
          extractedAt: "2026-01-01T00:00:00.000Z",
        },
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "non_transfer_signals_absent")?.passed,
    ).toBe(true);
    expect(
      result.checks.find((check) => check.id === "wrong_personalization_absent")?.passed,
    ).toBe(true);
  });

  it("fails provenance explainability when recall hits and write events lack reasons", () => {
    const answer = buildGoodmemoryAnswer();
    answer.retrieved!.hits = [
      {
        id: "ref-1",
        type: "reference",
        reason: "",
      },
    ];
    answer.trace.rememberEvents[0]!.events = [
      {
        candidateId: "candidate-0",
        outcome: "written",
        memoryType: "reference",
        memoryId: "ref-1",
        reason: "",
        sourceMethod: "explicit",
      },
    ];

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(result.passed).toBe(false);
    expect(
      result.checks.find((check) => check.id === "provenance_explainable")?.passed,
    ).toBe(false);
  });

  it("fails provenance when retrieved hits are missing candidate traces", () => {
    const answer = buildGoodmemoryAnswer();
    if (!answer.retrieved) {
      throw new Error("expected retrieved payload");
    }

    answer.retrieved.candidateTraces = [];

    const result = evaluateScenarioAssertions({
      scenario: buildScenario(),
      goodmemory: answer,
    });

    expect(
      result.checks.find((check) => check.id === "provenance_explainable"),
    ).toEqual({
      id: "provenance_explainable",
      passed: false,
      details: ["missing_candidate_trace_for_hit:reference:ref-1", "missing_candidate_trace_for_hit:fact:fact-1"],
    });
  });
});
