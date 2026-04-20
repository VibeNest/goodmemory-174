import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { EvalSuiteSummary, JudgedEvalCase } from "../../src/eval/contracts";
import {
  PHASE_27_CONTINUATION_OPEN_LOOP_SCENARIO_IDS,
  PHASE_27_FALLBACK_SCENARIO_IDS,
  PHASE_27_IDENTITY_BACKGROUND_SCENARIO_IDS,
  PHASE_27_REPEATED_CORRECTION_SCENARIO_IDS,
} from "../../src/eval/phase27";
import type { ScenarioFixture } from "../../src/eval/dataset";
import {
  parsePhase27EvalCliOptions,
  resolvePhase27FallbackOutputDir,
  runPhase27FallbackEval,
} from "../../scripts/run-phase-27-eval";

function buildJudgeScores() {
  return {
    factual_recall: 0,
    preference_consistency: 0,
    cross_domain_transfer: 0,
    contamination_penalty: 0,
    update_correctness: 0,
    personalization_usefulness: 0,
    provenance_explainability: 0,
  };
}

function buildSummary(
  totalCases: number,
): EvalSuiteSummary {
  return {
    totalCases,
    completedCases: totalCases,
    executionFailures: 0,
    winnerCounts: {
      baseline: 1,
      goodmemory: totalCases - 2,
      tie: 1,
    },
    baselineAverage: buildJudgeScores(),
    goodmemoryAverage: buildJudgeScores(),
    uplift: buildJudgeScores(),
    layers: {
      baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
      goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
      uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
    },
    assertions: {
      totalCases,
      passingCases: totalCases,
      passRate: 1,
      totalChecks: totalCases,
      passingChecks: totalCases,
      checkPassRate: 1,
      applicableStaleSuppressionCases: 0,
      applicableUpdateCases: 0,
      contaminationFailures: 0,
      staleMisuseCases: 0,
      staleMisuseRate: 0,
      staleSuppressionCases: 0,
      staleSuppressionRate: 0,
      updateWinCases: 0,
      updateWinRate: 0,
      updateFailures: 0,
    },
    strategySummary: {
      byStrategy: {
        "rules-only": {
          totalCases,
          uniqueScenarios: totalCases,
          winnerCounts: {
            baseline: 1,
            goodmemory: totalCases - 2,
            tie: 1,
          },
          uplift: buildJudgeScores(),
          regressionCases: [],
        },
      },
      embeddingImpact: null,
      routerImpact: null,
    },
  };
}

function buildScenarioFixture(
  scenarioId: string,
): ScenarioFixture {
  const isCorrection = PHASE_27_REPEATED_CORRECTION_SCENARIO_IDS.includes(
    scenarioId as (typeof PHASE_27_REPEATED_CORRECTION_SCENARIO_IDS)[number],
  );
  const isIdentity = PHASE_27_IDENTITY_BACKGROUND_SCENARIO_IDS.includes(
    scenarioId as (typeof PHASE_27_IDENTITY_BACKGROUND_SCENARIO_IDS)[number],
  );

  return {
    scenario_id: scenarioId,
    persona_id: "phase27-test-persona",
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
        session_id: `${scenarioId}-s1`,
        objective: "Replay prior history.",
        turns: [
          {
            role: "user",
            content: "Remember the corrected runbook and current role.",
          },
          {
            role: "assistant",
            content: "Understood.",
          },
        ],
      },
      {
        session_id: `${scenarioId}-s2`,
        objective: "Ask the final prompt.",
        turns: [
          {
            role: "user",
            content: "What should we continue next?",
          },
          {
            role: "assistant",
            content: "I need remembered context to answer.",
          },
        ],
      },
    ],
    evaluation: {
      prompt: "What should we continue next?",
      rubric_focus: ["identity_background", "history_open_loop"],
      expected_identity_signals: isIdentity
        ? ["data scientist", "Singapore"]
        : ["data scientist"],
      expected_history_signals: ["final verification"],
      expected_transfer_signals: ["final verification"],
      expected_non_transfer_signals: [],
      expected_update_wins: isCorrection ? ["docs/current-runbook.md"] : [],
      expected_stale_suppression: isCorrection ? ["docs/old-runbook.md"] : [],
      wrong_personalization_signals: [],
      improvement_hypothesis: "GoodMemory should beat baseline on remembered continuity.",
      user_satisfaction_hypothesis: "The answer should resume from the corrected state.",
    },
    feedback_signals: [],
  };
}

function buildCase(
  scenarioId: string,
  winner: "baseline" | "goodmemory" | "tie",
  baselineAnswer: string,
  goodmemoryAnswer: string,
): JudgedEvalCase {
  return {
    caseId: scenarioId,
    metadata: {
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      strategyLabel: "rules-only",
    },
    baseline: {
      mode: "baseline",
      strategyLabel: "baseline",
      personaId: "phase27-test-persona",
      scenarioId,
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      prompt: "What should we continue next?",
      transcript: "user: What should we continue next?",
      answer: baselineAnswer,
      trace: {
        sessionsReplayed: 0,
        rememberEvents: [],
        feedbackEvents: [],
        recallHitCount: 0,
        verificationHintCount: 0,
        proposalLifecycle: null,
        maintenanceSummary: null,
        contextBuild: null,
      },
    },
    goodmemory: {
      mode: "goodmemory",
      strategyLabel: "rules-only",
      personaId: "phase27-test-persona",
      scenarioId,
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      prompt: "What should we continue next?",
      transcript: "user: What should we continue next?",
      memoryContext: "Confirmed from memory:\n- data scientist\n- final verification",
      answer: goodmemoryAnswer,
      trace: {
        sessionsReplayed: 1,
        rememberEvents: [],
        feedbackEvents: [],
        recallHitCount: 1,
        verificationHintCount: 0,
        proposalLifecycle: null,
        maintenanceSummary: null,
        contextBuild: null,
      },
    },
    judge: {
      winner,
      scores: buildJudgeScores(),
      baseline_scores: buildJudgeScores(),
      goodmemory_scores: buildJudgeScores(),
      reasoning: "test",
      failure_tags: [],
      blocking_failure_tags: [],
    },
    assertions: {
      passed: true,
      totalChecks: 1,
      passedChecks: 1,
      checks: [],
      contaminationFindings: [],
      updateFindings: [],
    },
  };
}

describe("run-phase-27 eval script", () => {
  it("resolves the dedicated fallback output directory", () => {
    expect(resolvePhase27FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-27",
    );
  });

  it("parses phase-27 cli flags", () => {
    expect(
      parsePhase27EvalCliOptions([
        "bun",
        "scripts/run-phase-27-eval.ts",
        "--run-id",
        "phase27-run",
        "--output-dir",
        "/tmp/out",
        "--limit",
        "5",
        "--scenario-id",
        "scenario-medium-13-role-slot",
        "--scenario-id=scenario-medium-13-reference-slot",
      ]),
    ).toEqual({
      limit: 5,
      outputDir: "/tmp/out",
      runId: "phase27-run",
      scenarioIds: [
        "scenario-medium-13-role-slot",
        "scenario-medium-13-reference-slot",
      ],
    });
  });

  it("runs the deterministic phase-27 eval with curated scenarios and thresholded adoption metrics", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const calls: Array<Record<string, unknown>> = [];
    const scenarioIds = [...PHASE_27_FALLBACK_SCENARIO_IDS];
    const scenarios = scenarioIds.map(buildScenarioFixture);
    const cases: JudgedEvalCase[] = [
      ...PHASE_27_IDENTITY_BACKGROUND_SCENARIO_IDS.map((scenarioId, index) =>
        buildCase(
          scenarioId,
          index < 2 ? "goodmemory" : "tie",
          "I need more context before I can answer reliably.",
          "data scientist Singapore final verification",
        )),
      ...PHASE_27_CONTINUATION_OPEN_LOOP_SCENARIO_IDS.map((scenarioId, index) =>
        buildCase(
          scenarioId,
          index < 4 ? "goodmemory" : index === 4 ? "baseline" : "tie",
          "I need more context before I can answer reliably.",
          "final verification",
        )),
      ...PHASE_27_REPEATED_CORRECTION_SCENARIO_IDS.map((scenarioId, index) =>
        buildCase(
          scenarioId,
          index < 3 ? "goodmemory" : "tie",
          "docs/old-runbook.md",
          "docs/current-runbook.md",
        )),
    ];

    const report = await runPhase27FallbackEval(
      {
        runId: "phase27-run",
      },
      {
        ensureDir: async () => undefined,
        loadScenarios: async () => scenarios,
        now: () => "2026-04-21T12:00:00.000Z",
        runCodexHandoffFamily: async () => ({
          cases: [
            { caseId: "handoff-1", details: "passed", passed: true },
            { caseId: "handoff-2", details: "passed", passed: true },
            { caseId: "handoff-3", details: "passed", passed: true },
          ],
          passed: true,
          passedCases: 3,
          requiredCases: 3,
          successRate: 1,
          threshold: "All 3 Codex handoff/resume cases must pass.",
          totalCases: 3,
        }),
        runSuite: async (input) => {
          calls.push({
            createMemory: typeof input.createMemory,
            mode: input.mode,
            outputDir: input.outputDir,
            rememberExtractionStrategy: input.rememberExtractionStrategy,
            runId: input.runId,
            runtime: input.runtime,
            scenarioIds: input.scenarioIds,
            strategies: input.strategies,
          });

          return {
            mode: "fallback",
            runId: input.runId ?? "suite",
            runDirectory: join(String(input.outputDir), String(input.runId ?? "suite")),
            summary: buildSummary(cases.length),
            runtime: input.runtime!,
            cases,
          };
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.summary.accepted).toBeTrue();
    expect(report.metrics.identityBackground.goodmemoryWins).toBe(2);
    expect(report.metrics.continuationOpenLoop.passed).toBeTrue();
    expect(report.metrics.repeatedCorrectionRate.improvement).toBe(1);
    expect(report.metrics.hostHandoffResumeSuccessRate.successRate).toBe(1);
    expect(calls[0]?.mode).toBe("fallback");
    expect(calls[0]?.runId).toBe("suite");
    expect(calls[0]?.createMemory).toBe("function");
    expect(calls[0]?.scenarioIds).toEqual(scenarioIds);
    expect(calls[0]?.strategies).toEqual(["rules-only"]);
    expect(calls[0]?.rememberExtractionStrategy).toBe("auto");
    expect(calls[0]?.outputDir).toBe(
      "/Users/hjqcan/Documents/GoodMomery/reports/eval/fallback/phase-27/phase27-run",
    );
    expect((calls[0]?.runtime as { memoryBackend?: string })?.memoryBackend).toBe("sqlite");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/Users/hjqcan/Documents/GoodMomery/reports/eval/fallback/phase-27/phase27-run/report.json",
    );
    expect(writes[0]?.content).toContain("\"accepted\": true");
  });
});
