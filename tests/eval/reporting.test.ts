import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalAssertionSummary } from "../../src/eval/assertions";
import type { JudgeResult } from "../../src/eval/judge";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
  type JudgedEvalCase,
} from "../../src/eval/reporting";
import { createTempWorkspace } from "../../src/testing/utils";

function buildAnswerPackage(
  caseId: string,
  mode: "baseline" | "goodmemory",
  answer: string,
  strategyLabel: "baseline" | "rules-only" | "hybrid" | "llm-assisted" = "baseline",
  resolvedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted",
  scenarioId = `scenario-${caseId}`,
): EvalAnswerPackage {
  return {
    mode,
    strategyLabel,
    resolvedStrategyLabel,
    personaId: caseId,
    scenarioId,
    taskFamily: "preference_continuation",
    targetDomain: "work_ops",
    memorySourceDomains: ["work_ops"],
    evaluationSetting: "single_domain",
    prompt: "Prompt",
    transcript: "Transcript",
    memoryContext: mode === "goodmemory" ? "## Context" : undefined,
    answer,
    retrieved:
      mode === "goodmemory"
        ? {
            profile: null,
            preferences: [],
            references: [
              {
                id: "ref-1",
                userId: caseId,
                title: "Runbook",
                pointer: "docs/runbook.md",
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
            facts: [],
            feedback: [],
            archives: [],
            evidence: [],
            episodes: [],
            workingMemory: null,
            journal: null,
            routingDecision: {
              retrievalProfile: "general_chat",
              intent: "general_assistance",
              strategy: "rules-only",
              strategyExplanation: {
                requestedStrategy: "rules-only",
                resolvedStrategy: "rules-only",
                summary:
                  "rules-only default keeps lexical, runtime, and procedural priors as the hard floor.",
                hardFloor: "lexical_runtime_procedural_priors",
                semanticTieBreaking: false,
                llmRefinement: false,
              },
              sourcePriorities: [
                "profile",
                "feedback",
                "fact",
                "episode",
                "working_memory",
                "session_journal",
              ],
              requestedSlots: ["reference"],
              supportSlots: [],
              actionDriving: false,
              referenceSeeking: true,
              continuation: false,
            },
            hits: [
              {
                id: "ref-1",
                type: "reference",
                reason: "semantic_reference",
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
                  "slot=reference, intentScore=1.00, lexicalScore=0.86, fallback=none",
                intentScore: 1,
                lexicalScore: 0.86,
                freshnessScore: 1,
                explicitnessScore: 1,
                fallback: "none",
              },
            ],
            policyApplied: [],
            verificationHints: [],
            renderedMemoryContext: "## Context",
          }
        : undefined,
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
              contentLength: 10,
              contextEstimatedTokens: 3,
              packetTokenCountBeforeRender: 8,
            }
          : null,
    },
  };
}

function buildAssertions(
  contaminationFindings: string[] = [],
  updateFindings: string[] = [],
): EvalAssertionSummary {
  const checks = [
    {
      id: "transfer_signals_present" as const,
      passed: true,
      details: ["present:concise bullet points"],
    },
    {
      id: "non_transfer_signals_absent" as const,
      passed: contaminationFindings.length === 0,
      details:
        contaminationFindings.length === 0
          ? ["absent:spoiler-heavy framing"]
          : contaminationFindings.map((finding) => `unexpected:${finding}`),
    },
    {
      id: "update_wins_present" as const,
      passed: updateFindings.length === 0,
      details:
        updateFindings.length === 0
          ? ["present:docs/runbook.md"]
          : updateFindings.map((finding) => `missing:${finding}`),
    },
    {
      id: "stale_suppression_absent" as const,
      passed: true,
      details: ["absent:docs/stale-runbook.md"],
    },
    {
      id: "wrong_personalization_absent" as const,
      passed: contaminationFindings.length === 0,
      details:
        contaminationFindings.length === 0
          ? ["absent:spoiler-heavy framing"]
          : contaminationFindings.map((finding) => `unexpected:${finding}`),
    },
    {
      id: "provenance_explainable" as const,
      passed: true,
      details: ["provenance:complete"],
    },
  ];

  return {
    passed: contaminationFindings.length === 0 && updateFindings.length === 0,
    totalChecks: checks.length,
    passedChecks: checks.filter((check) => check.passed).length,
    checks,
    contaminationFindings,
    updateFindings,
  };
}

function buildJudgeResult(
  winner: JudgeResult["winner"],
  baselineHistory: number,
  goodmemoryHistory: number,
  failureTags: string[] = [],
): JudgeResult {
  return {
    winner,
    scores: {
      factual_recall: 8,
      preference_consistency: Math.max(7, goodmemoryHistory),
      cross_domain_transfer: goodmemoryHistory,
      contamination_penalty: 8,
      update_correctness: 8,
      personalization_usefulness: 8,
      provenance_explainability: 7,
    },
    baseline_scores: {
      factual_recall: 6,
      preference_consistency: baselineHistory,
      cross_domain_transfer: baselineHistory,
      contamination_penalty: 6,
      update_correctness: 6,
      personalization_usefulness: 6,
      provenance_explainability: 6,
    },
    goodmemory_scores: {
      factual_recall: 8,
      preference_consistency: Math.max(7, goodmemoryHistory),
      cross_domain_transfer: goodmemoryHistory,
      contamination_penalty: 8,
      update_correctness: 8,
      personalization_usefulness: 8,
      provenance_explainability: 7,
    },
    reasoning: "comparison complete",
    failure_tags: failureTags,
  };
}

function buildCase(input: {
  caseId: string;
  scenarioId?: string;
  strategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  resolvedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  taskFamily: JudgedEvalCase["metadata"]["taskFamily"];
  targetDomain: string;
  memorySourceDomains: string[];
  evaluationSetting: JudgedEvalCase["metadata"]["evaluationSetting"];
  winner: JudgeResult["winner"];
  baselineHistory: number;
  goodmemoryHistory: number;
  failureTags?: string[];
  contaminationFindings?: string[];
  updateFindings?: string[];
}): JudgedEvalCase {
  return {
    caseId: input.caseId,
    metadata: {
      taskFamily: input.taskFamily,
      targetDomain: input.targetDomain,
      memorySourceDomains: input.memorySourceDomains,
      evaluationSetting: input.evaluationSetting,
      strategyLabel: input.strategyLabel ?? "rules-only",
      resolvedStrategyLabel:
        input.resolvedStrategyLabel ?? input.strategyLabel ?? "rules-only",
    },
    baseline: buildAnswerPackage(
      input.caseId,
      "baseline",
      `baseline-${input.caseId}`,
      "baseline",
      undefined,
      input.scenarioId,
    ),
    goodmemory: buildAnswerPackage(
      input.caseId,
      "goodmemory",
      `goodmemory-${input.caseId}`,
      input.strategyLabel ?? "rules-only",
      input.resolvedStrategyLabel ?? input.strategyLabel ?? "rules-only",
      input.scenarioId,
    ),
    judge: buildJudgeResult(
      input.winner,
      input.baselineHistory,
      input.goodmemoryHistory,
      input.failureTags,
    ),
    assertions: buildAssertions(
      input.contaminationFindings,
      input.updateFindings,
    ),
  };
}

describe("eval reporting", () => {
  it("aggregates suite scores and uplift from judged cases", () => {
    const summary = aggregateJudgedCases([
      buildCase({
        caseId: "case-1",
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "goodmemory",
        baselineHistory: 4,
        goodmemoryHistory: 9,
      }),
      buildCase({
        caseId: "case-2",
        taskFamily: "cross_domain_suppression",
        targetDomain: "shopping",
        memorySourceDomains: ["work_ops", "gaming"],
        evaluationSetting: "cross_domain",
        winner: "baseline",
        baselineHistory: 7,
        goodmemoryHistory: 6,
        failureTags: ["missed_open_loop"],
        contaminationFindings: ["spoiler-heavy framing"],
      }),
    ]);

    expect(summary.totalCases).toBe(2);
    expect(summary.winnerCounts.goodmemory).toBe(1);
    expect(summary.winnerCounts.baseline).toBe(1);
    expect(summary.goodmemoryAverage.cross_domain_transfer).toBe(7.5);
    expect(summary.uplift.cross_domain_transfer).toBe(2);
    expect(summary.layers.uplift.personalization).toBeGreaterThan(0);
    expect(summary.assertions.contaminationFailures).toBe(1);
    expect(summary.strategySummary.byStrategy["rules-only"]?.totalCases).toBe(2);
  });

  it("builds strategy summaries and comparison slices from multi-strategy cases", () => {
    const summary = aggregateJudgedCases([
      buildCase({
        caseId: "case-1__rules-only",
        scenarioId: "scenario-shared-1",
        strategyLabel: "rules-only",
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "goodmemory",
        baselineHistory: 4,
        goodmemoryHistory: 8,
      }),
      buildCase({
        caseId: "case-1__hybrid",
        scenarioId: "scenario-shared-1",
        strategyLabel: "hybrid",
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "baseline",
        baselineHistory: 8,
        goodmemoryHistory: 6,
        failureTags: ["missed_open_loop"],
      }),
    ]);

    expect(summary.strategySummary.byStrategy["rules-only"]?.totalCases).toBe(1);
    expect(summary.strategySummary.byStrategy["hybrid"]?.totalCases).toBe(1);
    expect(summary.strategySummary.byStrategy["hybrid"]?.regressionCases).toContain(
      "case-1__hybrid",
    );
    expect(summary.strategySummary.embeddingImpact?.strategiesCompared).toEqual([
      "rules-only",
      "hybrid",
    ]);
    expect(summary.strategySummary.embeddingImpact?.consistentScenarioCoverage).toBe(
      true,
    );
    expect(summary.strategySummary.embeddingImpact?.uniqueScenarios).toBe(1);
    expect(summary.strategySummary.routerImpact?.strategiesCompared).toEqual([
      "rules-only",
      "hybrid",
    ]);
  });

  it("buckets strategy summaries by resolved strategy instead of requested strategy", () => {
    const summary = aggregateJudgedCases([
      buildCase({
        caseId: "case-1__rules-only",
        scenarioId: "scenario-shared-1",
        strategyLabel: "rules-only",
        resolvedStrategyLabel: "rules-only",
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "goodmemory",
        baselineHistory: 4,
        goodmemoryHistory: 8,
      }),
      buildCase({
        caseId: "case-1__hybrid",
        scenarioId: "scenario-shared-1",
        strategyLabel: "hybrid",
        resolvedStrategyLabel: "rules-only",
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "goodmemory",
        baselineHistory: 4,
        goodmemoryHistory: 7,
      }),
    ]);

    expect(summary.strategySummary.byStrategy["rules-only"]?.totalCases).toBe(2);
    expect(summary.strategySummary.byStrategy["rules-only"]?.uniqueScenarios).toBe(1);
    expect(summary.strategySummary.byStrategy["hybrid"]).toBeUndefined();
    expect(summary.strategySummary.embeddingImpact).toBeNull();
    expect(summary.strategySummary.routerImpact).toBeNull();
  });

  it("persists suite report and failure artifacts", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-1",
          taskFamily: "drift_override_lifelong_update",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "baseline",
          baselineHistory: 8,
          goodmemoryHistory: 5,
          failureTags: ["identity_miss"],
          updateFindings: ["docs/runbook.md"],
        }),
      ];
      const summary = aggregateJudgedCases(cases);

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-001",
        cases,
        summary,
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        mode: string;
        runId: string;
        summary: {
          strategySummary?: {
            byStrategy?: Record<string, { totalCases: number }>;
          };
        };
        runtime: {
          generationLayer?: string;
          judgeLayer?: string;
        };
      };
      const failure = JSON.parse(
        await readFile(join(result.runDirectory, "failures/case-1.json"), "utf8"),
      ) as {
        judge: { failure_tags: string[] };
        assertions: { updateFindings: string[] };
      };
      const caseArtifact = JSON.parse(
        await readFile(join(result.runDirectory, "cases/case-1.json"), "utf8"),
      ) as {
        metadata: { taskFamily: string };
        assertions: { passed: boolean };
        goodmemory: { trace: { recallHitCount: number } };
      };
      const baselineTrace = JSON.parse(
        await readFile(
          join(result.runDirectory, "traces/case-1/baseline.json"),
          "utf8",
        ),
      ) as { mode: string; trace: { sessionsReplayed: number } };
      const goodmemoryTrace = JSON.parse(
        await readFile(
          join(result.runDirectory, "traces/case-1/goodmemory.json"),
          "utf8",
        ),
      ) as { mode: string; trace: { recallHitCount: number } };
      const rawRecall = JSON.parse(
        await readFile(
          join(result.runDirectory, "traces/case-1/raw-recall.json"),
          "utf8",
        ),
      ) as {
        references: Array<{ pointer: string }>;
        hits: Array<{ type: string }>;
        candidateTraces?: Array<{ memoryId: string }>;
        routingDecision?: {
          strategy?: string;
          strategyExplanation?: { summary?: string };
        };
      };
      const assertions = JSON.parse(
        await readFile(
          join(result.runDirectory, "traces/case-1/assertions.json"),
          "utf8",
        ),
      ) as { updateFindings: string[] };

      expect(report.mode).toBe("fallback");
      expect(report.runId).toBe("run-001");
      expect(report.summary.strategySummary?.byStrategy?.["rules-only"]?.totalCases).toBe(
        1,
      );
      expect(report.runtime.generationLayer).toBe("fallback");
      expect(report.runtime.judgeLayer).toBe("fallback");
      expect(failure.judge.failure_tags).toContain("identity_miss");
      expect(failure.assertions.updateFindings).toContain("docs/runbook.md");
      expect(caseArtifact.metadata.taskFamily).toBe("drift_override_lifelong_update");
      expect(caseArtifact.assertions.passed).toBe(false);
      expect(caseArtifact.goodmemory.trace.recallHitCount).toBe(4);
      expect(baselineTrace.mode).toBe("baseline");
      expect(baselineTrace.trace.sessionsReplayed).toBe(0);
      expect(goodmemoryTrace.mode).toBe("goodmemory");
      expect(goodmemoryTrace.trace.recallHitCount).toBe(4);
      expect(rawRecall.references[0]?.pointer).toBe("docs/runbook.md");
      expect(rawRecall.hits[0]?.type).toBe("reference");
      expect(rawRecall.candidateTraces?.[0]?.memoryId).toBe("ref-1");
      expect(rawRecall.routingDecision?.strategy).toBe("rules-only");
      expect(rawRecall.routingDecision?.strategyExplanation?.summary).toContain(
        "rules-only",
      );
      expect(assertions.updateFindings).toContain("docs/runbook.md");
    } finally {
      await workspace.cleanup();
    }
  });

  it("does not mark baseline-only judge tags as release failures when GoodMemory wins", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-baseline-tags");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-1",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 3,
          goodmemoryHistory: 9,
          failureTags: ["baseline_underused_history"],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-002",
        cases,
        summary,
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
      });
      const failureSummary = JSON.parse(
        await readFile(
          join(result.runDirectory, "failures/summary.json"),
          "utf8",
        ),
      ) as {
        totalFailures: number;
        failedCases: Array<{ failureTags: string[] }>;
      };

      expect(failureSummary.totalFailures).toBe(0);
      expect(failureSummary.failedCases).toHaveLength(0);
    } finally {
      await workspace.cleanup();
    }
  });

  it("does not mark shared judge observations as release failures when assertions pass", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-shared-tags");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-1",
          taskFamily: "cross_domain_transfer",
          targetDomain: "shopping",
          memorySourceDomains: ["food", "finance"],
          evaluationSetting: "cross_domain",
          winner: "goodmemory",
          baselineHistory: 3,
          goodmemoryHistory: 9,
          failureTags: ["shared_missing_location_signal"],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-002a",
        cases,
        summary,
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
      });
      const failureSummary = JSON.parse(
        await readFile(
          join(result.runDirectory, "failures/summary.json"),
          "utf8",
        ),
      ) as {
        totalFailures: number;
        failedCases: Array<{ failureTags: string[] }>;
      };

      expect(failureSummary.totalFailures).toBe(0);
      expect(failureSummary.failedCases).toHaveLength(0);
    } finally {
      await workspace.cleanup();
    }
  });

  it("treats grouped-parser style goodmemory tags as blocking failures", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-grouped-tags");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-1",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 3,
          goodmemoryHistory: 9,
          failureTags: ["goodmemory:limited_personalization"],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-002b",
        cases,
        summary,
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
      });
      const failureSummary = JSON.parse(
        await readFile(
          join(result.runDirectory, "failures/summary.json"),
          "utf8",
        ),
      ) as {
        totalFailures: number;
        failedCases: Array<{ failureTags: string[] }>;
      };

      expect(failureSummary.totalFailures).toBe(1);
      expect(failureSummary.failedCases[0]?.failureTags).toContain(
        "goodmemory:limited_personalization",
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("still marks explicit GoodMemory judge defects as failures even when GoodMemory wins", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-goodmemory-tags");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-1",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 3,
          goodmemoryHistory: 9,
          failureTags: ["goodmemory_internal_thought_leak"],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-003",
        cases,
        summary,
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
      });
      const failureSummary = JSON.parse(
        await readFile(
          join(result.runDirectory, "failures/summary.json"),
          "utf8",
        ),
      ) as {
        totalFailures: number;
        failedCases: Array<{ failureTags: string[] }>;
      };

      expect(failureSummary.totalFailures).toBe(1);
      expect(failureSummary.failedCases[0]?.failureTags).toContain(
        "goodmemory_internal_thought_leak",
      );
    } finally {
      await workspace.cleanup();
    }
  });
});
