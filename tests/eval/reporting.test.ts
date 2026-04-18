import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalAssertionSummary } from "../../src/eval/assertions";
import type { JudgedEvalCase } from "../../src/eval/contracts";
import type { JudgeResult } from "../../src/eval/judge";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
} from "../../src/eval/reporting";
import { createTempWorkspace } from "../../src/testing/utils";

function buildAnswerPackage(
  caseId: string,
  mode: "baseline" | "goodmemory",
  answer: string,
  strategyLabel: "baseline" | "rules-only" | "hybrid" | "llm-assisted" = "baseline",
  resolvedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted",
  candidateInfluencedExecution?: boolean,
  scenarioId = `scenario-${caseId}`,
): EvalAnswerPackage {
  const governedPattern =
    mode === "goodmemory"
      ? {
          id: "feedback-governed-1",
          userId: caseId,
          rule: "Use concise bullet points in summaries.",
          kind: "validated_pattern" as const,
          appliesTo: "general_response",
          confidence: 1,
          evidence: ["evidence-1"],
          source: {
            method: "confirmed" as const,
            extractedAt: "2026-01-01T00:00:00.000Z",
          },
          lifecycle: "active" as const,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }
      : null;

  return {
    mode,
    strategyLabel,
    resolvedStrategyLabel,
    ...(mode === "goodmemory" && candidateInfluencedExecution !== undefined
      ? { candidateInfluencedExecution }
      : {}),
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
            feedback: governedPattern ? [governedPattern] : [],
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
              ...(governedPattern
                ? [
                    {
                      id: governedPattern.id,
                      type: "feedback" as const,
                      reason: "procedural_guidance",
                      sourceMethod: "confirmed" as const,
                    },
                  ]
                : []),
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
      proposalLifecycle:
        mode === "goodmemory"
          ? {
              experienceCount: 4,
              experienceKindCounts: {
                remember: 1,
                feedback: 2,
                verify: 1,
              },
              proposalCount: 2,
              proposalStatusCounts: {
                accepted: 1,
                delayed: 1,
              },
              promotionCount: 2,
              promotionDecisionCounts: {
                accepted: 1,
                delayed: 1,
              },
              proposals: [
                {
                  id: "proposal-1",
                  proposalType: "maintenance_action" as const,
                  status: "accepted" as const,
                  summary: "Re-check stale blocker memory.",
                  rationale: "One verification trace suggests a bounded maintenance follow-up.",
                  modelInfluence: "rules-only" as const,
                  sourceExperienceIds: ["xp-1"],
                  linkedMemoryIds: ["fact-1"],
                  linkedArchiveIds: [],
                  linkedEvidenceIds: ["evidence-1"],
                },
                {
                  id: "proposal-2",
                  proposalType: "procedural_pattern" as const,
                  status: "delayed" as const,
                  summary: "Promote repeated guidance into a pattern.",
                  rationale: "Repeated feedback suggests a reusable pattern.",
                  modelInfluence: "rules-only" as const,
                  sourceExperienceIds: ["xp-2", "xp-3"],
                  linkedMemoryIds: ["feedback-1"],
                  linkedArchiveIds: [],
                  linkedEvidenceIds: [],
                },
              ],
              promotions: [
                {
                  id: "promotion-1",
                  proposalId: "proposal-1",
                  decision: "accepted" as const,
                  summary: "accepted proposal: Re-check stale blocker memory.",
                  rationale: "proposal passed deterministic gates",
                  policyOutcome: "passed" as const,
                  verificationOutcome: "passed" as const,
                  evalOutcome: "passed" as const,
                },
                {
                  id: "promotion-2",
                  proposalId: "proposal-2",
                  decision: "delayed" as const,
                  summary: "delayed proposal: Promote repeated guidance into a pattern.",
                  rationale: "procedural proposal requires later eval review",
                  policyOutcome: "passed" as const,
                  verificationOutcome: "passed" as const,
                  evalOutcome: "review_required" as const,
                },
              ],
            }
          : null,
      maintenanceSummary:
        mode === "goodmemory"
          ? {
              activeValidatedPatternCount: 1,
              compiledValidatedPatternCount: 1,
              supersededFeedbackCount: 1,
              pressuredFactCount: 1,
              demotedFactCount: 1,
              correctionRepairFactCount: 1,
              acceptedProceduralPromotionCount: 1,
            }
          : null,
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
  staleFindings: string[] = [],
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
      passed: staleFindings.length === 0,
      details:
        staleFindings.length === 0
          ? ["absent:docs/stale-runbook.md"]
          : staleFindings.map((finding) => `unexpected:${finding}`),
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
    passed:
      contaminationFindings.length === 0 &&
      updateFindings.length === 0 &&
      staleFindings.length === 0,
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
  blockingFailureTags?: string[],
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
    blocking_failure_tags: blockingFailureTags,
  };
}

function buildCase(input: {
  caseId: string;
  scenarioId?: string;
  strategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  resolvedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  strategyFamily?: "retrieval" | "reviewer" | "maintenance";
  strategyMode?: "observe" | "assist" | "promote";
  promotedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
  candidateInfluencedExecution?: boolean;
  taskFamily: JudgedEvalCase["metadata"]["taskFamily"];
  targetDomain: string;
  memorySourceDomains: string[];
  evaluationSetting: JudgedEvalCase["metadata"]["evaluationSetting"];
  winner: JudgeResult["winner"];
  baselineHistory: number;
  goodmemoryHistory: number;
  failureTags?: string[];
  blockingFailureTags?: string[];
  contaminationFindings?: string[];
  staleFindings?: string[];
  updateFindings?: string[];
  shadow?: {
    strategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
    resolvedStrategyLabel?: "rules-only" | "hybrid" | "llm-assisted";
    candidateInfluencedExecution?: boolean;
  };
}): JudgedEvalCase {
  const result: JudgedEvalCase = {
    caseId: input.caseId,
    metadata: {
      taskFamily: input.taskFamily,
      targetDomain: input.targetDomain,
      memorySourceDomains: input.memorySourceDomains,
      evaluationSetting: input.evaluationSetting,
      strategyLabel: input.strategyLabel ?? "rules-only",
      resolvedStrategyLabel:
        input.resolvedStrategyLabel ?? input.strategyLabel ?? "rules-only",
      strategyFamily: input.strategyFamily,
      strategyMode: input.strategyMode,
      promotedStrategyLabel: input.promotedStrategyLabel,
    },
    baseline: buildAnswerPackage(
      input.caseId,
      "baseline",
      `baseline-${input.caseId}`,
      "baseline",
      undefined,
      undefined,
      input.scenarioId,
    ),
    goodmemory: buildAnswerPackage(
      input.caseId,
      "goodmemory",
      `goodmemory-${input.caseId}`,
      input.strategyLabel ?? "rules-only",
      input.resolvedStrategyLabel ?? input.strategyLabel ?? "rules-only",
      input.candidateInfluencedExecution,
      input.scenarioId,
    ),
    judge: buildJudgeResult(
      input.winner,
      input.baselineHistory,
      input.goodmemoryHistory,
      input.failureTags,
      input.blockingFailureTags,
    ),
    assertions: buildAssertions(
      input.contaminationFindings,
      input.updateFindings,
      input.staleFindings,
    ),
  };

  if (input.shadow) {
    result.shadow = {
      ...buildAnswerPackage(
        `${input.caseId}__shadow`,
        "goodmemory",
        `shadow-${input.caseId}`,
        input.shadow.strategyLabel ?? input.strategyLabel ?? "rules-only",
        input.shadow.resolvedStrategyLabel ??
          input.shadow.strategyLabel ??
          input.resolvedStrategyLabel ??
          input.strategyLabel ??
          "rules-only",
        input.shadow.candidateInfluencedExecution,
        input.scenarioId,
      ),
      strategyFamily: input.strategyFamily,
      strategyMode: "assist",
      promotedStrategyLabel: input.promotedStrategyLabel,
    };
  }

  return result;
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
        updateFindings: ["docs/runbook.md"],
        staleFindings: ["docs/stale-runbook.md"],
      }),
    ]);

    expect(summary.totalCases).toBe(2);
    expect(summary.winnerCounts.goodmemory).toBe(1);
    expect(summary.winnerCounts.baseline).toBe(1);
    expect(summary.goodmemoryAverage.cross_domain_transfer).toBe(7.5);
    expect(summary.uplift.cross_domain_transfer).toBe(2);
    expect(summary.layers.uplift.personalization).toBeGreaterThan(0);
    expect(summary.assertions.contaminationFailures).toBe(1);
    expect(summary.assertions.applicableUpdateCases).toBe(2);
    expect(summary.assertions.updateWinCases).toBe(1);
    expect(summary.assertions.updateWinRate).toBe(0.5);
    expect(summary.assertions.applicableStaleSuppressionCases).toBe(2);
    expect(summary.assertions.staleSuppressionCases).toBe(1);
    expect(summary.assertions.staleSuppressionRate).toBe(0.5);
    expect(summary.assertions.staleMisuseCases).toBe(1);
    expect(summary.assertions.staleMisuseRate).toBe(0.5);
    expect(summary.outcomeLoopSummary?.applicableProceduralReuseCases).toBe(2);
    expect(summary.outcomeLoopSummary?.governedProceduralReuseCases).toBe(2);
    expect(summary.outcomeLoopSummary?.governedProceduralReuseRate).toBe(1);
    expect(summary.outcomeLoopSummary?.acceptedProceduralPromotionCases).toBe(2);
    expect(summary.outcomeLoopSummary?.applicableCorrectionCases).toBe(2);
    expect(summary.outcomeLoopSummary?.correctionWinCases).toBe(1);
    expect(summary.outcomeLoopSummary?.correctionWinRate).toBe(0.5);
    expect(summary.outcomeLoopSummary?.applicableStaleSuppressionCases).toBe(2);
    expect(summary.outcomeLoopSummary?.staleSuppressionCases).toBe(1);
    expect(summary.outcomeLoopSummary?.staleSuppressionRate).toBe(0.5);
    expect(summary.outcomeLoopSummary?.staleMisuseCases).toBe(1);
    expect(summary.outcomeLoopSummary?.staleMisuseRate).toBe(0.5);
    expect(summary.strategySummary.byStrategy["rules-only"]?.totalCases).toBe(2);
    expect(summary.maintenanceSummary?.casesWithProceduralReuse).toBe(2);
    expect(summary.maintenanceSummary?.casesWithCompiledProceduralReuse).toBe(2);
    expect(summary.maintenanceSummary?.casesWithAcceptedProceduralPromotions).toBe(2);
    expect(summary.maintenanceSummary?.casesWithVerificationPressure).toBe(2);
    expect(summary.maintenanceSummary?.averageCompiledValidatedPatterns).toBe(1);
    expect(summary.maintenanceSummary?.averageCorrectionRepairs).toBe(1);
    expect(summary.maintenanceSummary?.averageDemotedFacts).toBe(1);
  });

  it("counts governed procedural reuse only when recall actually returns a confirmed pattern and transfer passes", () => {
    const reusedCase = buildCase({
      caseId: "case-1",
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      winner: "goodmemory",
      baselineHistory: 4,
      goodmemoryHistory: 9,
    });
    const storedButUnusedCase = buildCase({
      caseId: "case-2",
      taskFamily: "preference_continuation",
      targetDomain: "work_ops",
      memorySourceDomains: ["work_ops"],
      evaluationSetting: "single_domain",
      winner: "goodmemory",
      baselineHistory: 4,
      goodmemoryHistory: 9,
    });
    const transferCheck = storedButUnusedCase.assertions.checks.find(
      (check) => check.id === "transfer_signals_present",
    );

    if (!transferCheck || !storedButUnusedCase.goodmemory.retrieved) {
      throw new Error("expected transfer check and retrieved memory for test setup");
    }

    transferCheck.passed = false;
    transferCheck.details = ["missing:concise bullet points"];
    storedButUnusedCase.goodmemory.retrieved.feedback = [];

    const summary = aggregateJudgedCases([reusedCase, storedButUnusedCase]);

    expect(summary.outcomeLoopSummary?.applicableProceduralReuseCases).toBe(2);
    expect(summary.outcomeLoopSummary?.governedProceduralReuseCases).toBe(1);
    expect(summary.outcomeLoopSummary?.governedProceduralReuseRate).toBe(0.5);
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

  it("builds shadow comparison summaries for observe and assist rollout cases", () => {
    const summary = aggregateJudgedCases([
      buildCase({
        caseId: "case-observe",
        scenarioId: "scenario-shadow-1",
        strategyLabel: "hybrid",
        resolvedStrategyLabel: "rules-only",
        strategyFamily: "retrieval",
        strategyMode: "observe",
        promotedStrategyLabel: "rules-only",
        candidateInfluencedExecution: false,
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "goodmemory",
        baselineHistory: 4,
        goodmemoryHistory: 8,
      }),
      buildCase({
        caseId: "case-assist",
        scenarioId: "scenario-shadow-2",
        strategyLabel: "hybrid",
        resolvedStrategyLabel: "hybrid",
        strategyFamily: "retrieval",
        strategyMode: "assist",
        promotedStrategyLabel: "rules-only",
        candidateInfluencedExecution: true,
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

    expect(summary.shadowSummary).toEqual({
      totalCases: 2,
      byFamily: {
        retrieval: 2,
      },
      byMode: {
        observe: 1,
        assist: 1,
      },
      candidateInfluencedCases: 1,
      safeObserveCases: 1,
      unknownObserveCases: 0,
      regressionCases: ["case-assist"],
    });
  });

  it("keeps observe execution safety unknown when the rollout did not emit influence evidence", () => {
    const summary = aggregateJudgedCases([
      buildCase({
        caseId: "case-observe-unknown",
        scenarioId: "scenario-shadow-unknown",
        strategyLabel: "hybrid",
        resolvedStrategyLabel: "rules-only",
        strategyFamily: "retrieval",
        strategyMode: "observe",
        promotedStrategyLabel: "rules-only",
        taskFamily: "preference_continuation",
        targetDomain: "work_ops",
        memorySourceDomains: ["work_ops"],
        evaluationSetting: "single_domain",
        winner: "goodmemory",
        baselineHistory: 4,
        goodmemoryHistory: 8,
      }),
    ]);

    expect(summary.shadowSummary).toEqual({
      totalCases: 1,
      byFamily: {
        retrieval: 1,
      },
      byMode: {
        observe: 1,
      },
      candidateInfluencedCases: 0,
      safeObserveCases: 0,
      unknownObserveCases: 1,
      regressionCases: [],
    });
  });

  it("summarizes per-strategy regressions for dashboard use", () => {
    const executionFailures = [
      {
        caseId: "case-hybrid-execution",
        failureStage: "primary_execution" as const,
        metadata: {
          taskFamily: "preference_continuation" as const,
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain" as const,
          strategyLabel: "hybrid" as const,
          resolvedStrategyLabel: "hybrid" as const,
          strategyFamily: "retrieval" as const,
          strategyMode: "assist" as const,
          promotedStrategyLabel: "rules-only" as const,
        },
        retryLimit: 2,
        attempts: [
          { attempt: 1, error: "timeout" },
          { attempt: 2, error: "timeout" },
        ],
        lastError: "timeout",
      },
    ];
    const summary = aggregateJudgedCases(
      [
        buildCase({
          caseId: "case-rules",
          scenarioId: "scenario-dashboard-1",
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
          caseId: "case-hybrid-regression",
          scenarioId: "scenario-dashboard-2",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "hybrid",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "baseline",
          baselineHistory: 8,
          goodmemoryHistory: 6,
          failureTags: ["goodmemory_wrong_personalization"],
          contaminationFindings: ["leaked stale preference"],
        }),
      ],
      executionFailures,
      {
        generationMode: "fallback",
        judgeMode: "fallback",
        strategyRollout: {
          family: "retrieval",
          mode: "assist",
          promotedStrategyLabel: "rules-only",
        },
      },
    );

    expect(summary.regressionDashboardSummary).toMatchObject({
      totalRegressionCases: 1,
      totalBlockingCases: 2,
      judgedRegressionCases: 1,
      executionFailureCount: 1,
      unattributedExecutionFailureCount: 0,
      gate: {
        family: "retrieval",
        mode: "assist",
        promotedStrategyLabel: "rules-only",
        decision: "delayed",
        outcome: "review_required",
        regressionCaseCount: 0,
      },
    });
    expect(summary.regressionDashboardSummary?.strategyRegressions).toEqual([
      {
        strategyLabel: "hybrid",
        totalCases: 1,
        attemptedCaseCount: 2,
        regressionCaseCount: 1,
        executionFailureCaseCount: 1,
        blockingCaseCount: 2,
        regressionRate: 1,
        blockingRate: 1,
        regressionCases: ["case-hybrid-regression"],
        executionFailureCases: ["case-hybrid-execution"],
      },
      {
        strategyLabel: "rules-only",
        totalCases: 1,
        attemptedCaseCount: 1,
        regressionCaseCount: 0,
        executionFailureCaseCount: 0,
        blockingCaseCount: 0,
        regressionRate: 0,
        blockingRate: 0,
        regressionCases: [],
        executionFailureCases: [],
      },
    ]);
  });

  it("keeps shadow setup execution failures unattributed in the regression dashboard", async () => {
    const workspace = await createTempWorkspace(
      "goodmemory-reporting-shadow-setup-unattributed",
    );

    try {
      const outputDir = join(workspace.root, "reports");
      const executionFailures = [
        {
          caseId: "case-shadow-setup-failure",
          failureStage: "shadow_setup" as const,
          metadata: {
            taskFamily: "preference_continuation" as const,
            targetDomain: "work_ops",
            memorySourceDomains: ["work_ops"],
            evaluationSetting: "single_domain" as const,
            strategyLabel: "hybrid" as const,
            strategyFamily: "retrieval" as const,
            strategyMode: "observe" as const,
            promotedStrategyLabel: "rules-only" as const,
          },
          retryLimit: 1,
          attempts: [{ attempt: 1, error: "shadow-create-error" }],
          lastError: "shadow-create-error",
        },
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-shadow-setup-unattributed",
        cases: [],
        summary: aggregateJudgedCases([], executionFailures),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
        },
        executionFailures,
      });

      const artifact = JSON.parse(
        await readFile(join(result.runDirectory, "regression-dashboard.json"), "utf8"),
      ) as {
        summary: {
          regressionDashboardSummary?: {
            totalRegressionCases: number;
            totalBlockingCases: number;
            executionFailureCount: number;
            unattributedExecutionFailureCount: number;
            strategyRegressions: Array<{ strategyLabel: string }>;
          };
        };
        failureClusters: Array<{
          strategyLabels: string[];
          strategyModes: string[];
          cases: Array<{
            caseId: string;
            failureStage?: string;
            strategyLabel?: string;
            executedStrategyLabel?: string;
          }>;
        }>;
      };

      expect(artifact.summary.regressionDashboardSummary).toMatchObject({
        totalRegressionCases: 0,
        totalBlockingCases: 1,
        executionFailureCount: 1,
        unattributedExecutionFailureCount: 1,
        strategyRegressions: [],
      });
      expect(artifact.failureClusters).toHaveLength(1);
      expect(artifact.failureClusters[0]).toMatchObject({
        strategyLabels: [],
        strategyModes: ["observe"],
      });
      expect(artifact.failureClusters[0]?.cases[0]).toMatchObject({
        caseId: "case-shadow-setup-failure",
        failureStage: "shadow_setup",
        strategyLabel: "hybrid",
      });
      expect(
        artifact.failureClusters[0]?.cases[0]?.executedStrategyLabel,
      ).toBeUndefined();
    } finally {
      await workspace.cleanup();
    }
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
          strategyRollout: {
            family: "retrieval",
            mode: "assist",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        mode: string;
        runId: string;
        summary: {
          regressionDashboardSummary?: Record<string, unknown>;
          outcomeLoopSummary?: {
            governedProceduralReuseRate: number;
          };
          strategySummary?: {
            byStrategy?: Record<string, { totalCases: number }>;
          };
          maintenanceSummary?: {
            casesWithCompiledProceduralReuse: number;
            casesWithProceduralReuse: number;
          };
        };
        runtime: {
          generationAdapter?: string;
          judgeAdapter?: string;
          strategyRollout?: {
            family?: string;
            mode?: string;
            promotedStrategyLabel?: string;
          };
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
        metadata: {
          taskFamily: string;
          strategyFamily?: string;
          strategyMode?: string;
          promotedStrategyLabel?: string;
        };
        assertions: { passed: boolean };
        goodmemory: {
          trace: {
            recallHitCount: number;
            proposalLifecycle?: { proposalCount: number };
            maintenanceSummary?: {
              activeValidatedPatternCount: number;
              compiledValidatedPatternCount: number;
            };
          };
        };
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
      const proposalTrace = JSON.parse(
        await readFile(
          join(result.runDirectory, "traces/case-1/proposal-trace.json"),
          "utf8",
        ),
      ) as {
        proposalCount: number;
        promotionCount: number;
        promotionDecisionCounts: Record<string, number>;
      };

      expect(report.mode).toBe("fallback");
      expect(report.runId).toBe("run-001");
      expect(report.summary.regressionDashboardSummary).toMatchObject({
        totalRegressionCases: 1,
        judgedRegressionCases: 1,
        executionFailureCount: 0,
        strategyRegressions: [
          {
            strategyLabel: "rules-only",
            totalCases: 1,
            regressionCaseCount: 1,
            regressionRate: 1,
            regressionCases: ["case-1"],
          },
        ],
        gate: {
          family: "retrieval",
          mode: "assist",
          promotedStrategyLabel: "rules-only",
          decision: "delayed",
          outcome: "review_required",
          regressionCaseCount: 0,
        },
      });
      expect(report.summary.outcomeLoopSummary?.governedProceduralReuseRate).toBe(1);
      expect(report.summary.strategySummary?.byStrategy?.["rules-only"]?.totalCases).toBe(
        1,
      );
      expect(report.summary.maintenanceSummary?.casesWithProceduralReuse).toBe(1);
      expect(report.summary.maintenanceSummary?.casesWithCompiledProceduralReuse).toBe(1);
      expect(report.runtime.generationAdapter).toBe("fallback");
      expect(report.runtime.judgeAdapter).toBe("fallback");
      expect(report.runtime.strategyRollout).toEqual({
        family: "retrieval",
        mode: "assist",
        promotedStrategyLabel: "rules-only",
      });
      expect(failure.judge.failure_tags).toContain("identity_miss");
      expect(failure.assertions.updateFindings).toContain("docs/runbook.md");
      expect(caseArtifact.metadata.taskFamily).toBe("drift_override_lifelong_update");
      expect(caseArtifact.metadata.strategyFamily).toBeUndefined();
      expect(caseArtifact.metadata.strategyMode).toBeUndefined();
      expect(caseArtifact.metadata.promotedStrategyLabel).toBeUndefined();
      expect(caseArtifact.assertions.passed).toBe(false);
      expect(caseArtifact.goodmemory.trace.recallHitCount).toBe(4);
      expect(caseArtifact.goodmemory.trace.proposalLifecycle?.proposalCount).toBe(2);
      expect(caseArtifact.goodmemory.trace.maintenanceSummary?.activeValidatedPatternCount).toBe(1);
      expect(caseArtifact.goodmemory.trace.maintenanceSummary?.compiledValidatedPatternCount).toBe(
        1,
      );
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
      expect(proposalTrace.proposalCount).toBe(2);
      expect(proposalTrace.promotionCount).toBe(2);
      expect(proposalTrace.promotionDecisionCounts.accepted).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });

  it("persists rollout metadata on case artifacts when a strategy lifecycle mode is present", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-rollout-metadata");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-rollout",
          scenarioId: "scenario-shared-1",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyFamily: "retrieval",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 4,
          goodmemoryHistory: 8,
        }),
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-rollout",
        cases,
        summary: aggregateJudgedCases(cases),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const caseArtifact = JSON.parse(
        await readFile(join(result.runDirectory, "cases/case-rollout.json"), "utf8"),
      ) as {
        metadata: {
          strategyFamily?: string;
          strategyMode?: string;
          promotedStrategyLabel?: string;
        };
      };

      expect(caseArtifact.metadata).toMatchObject({
        strategyFamily: "retrieval",
        strategyMode: "observe",
        promotedStrategyLabel: "rules-only",
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("persists a shadow comparison artifact with distinct baseline and executed traces", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-shadow-comparisons");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-shadow",
          scenarioId: "scenario-shadow-1",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyFamily: "retrieval",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: false,
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 4,
          goodmemoryHistory: 8,
          shadow: {
            strategyLabel: "hybrid",
            resolvedStrategyLabel: "hybrid",
            candidateInfluencedExecution: true,
          },
        }),
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-shadow",
        cases,
        summary: aggregateJudgedCases(cases),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const artifact = JSON.parse(
        await readFile(
          join(result.runDirectory, "shadow-executed-path-comparisons.json"),
          "utf8",
        ),
      ) as {
        comparisonTarget: string;
        totalCases: number;
        comparisons: Array<{
          caseId: string;
          strategyFamily: string;
          strategyMode: string;
          requestedStrategyLabel: string;
          executedStrategyLabel: string;
          shadowResolvedStrategyLabel?: string;
          promotedStrategyLabel?: string;
          comparisonTarget: string;
          executedPathSource: string;
          candidateInfluencedExecution?: boolean;
          artifactPaths: {
            baselineTrace: string;
            executedTrace: string;
            shadowTrace?: string;
            shadowRawRecall?: string;
            rawRecall?: string;
          };
        }>;
      };

      expect(artifact.totalCases).toBe(1);
      expect(artifact.comparisonTarget).toBe("executed-path");
      expect(artifact.comparisons[0]).toMatchObject({
        caseId: "case-shadow",
        strategyFamily: "retrieval",
        strategyMode: "observe",
        requestedStrategyLabel: "hybrid",
        executedStrategyLabel: "rules-only",
        shadowResolvedStrategyLabel: "hybrid",
        promotedStrategyLabel: "rules-only",
        comparisonTarget: "executed-path",
        executedPathSource: "promoted_or_default",
        candidateInfluencedExecution: false,
      });
      expect(artifact.comparisons[0]?.artifactPaths.baselineTrace).toBe(
        "traces/case-shadow/baseline.json",
      );
      expect(artifact.comparisons[0]?.artifactPaths.executedTrace).toBe(
        "traces/case-shadow/goodmemory.json",
      );
      expect(artifact.comparisons[0]?.artifactPaths.shadowTrace).toBe(
        "traces/case-shadow__shadow/shadow.json",
      );
      expect(artifact.comparisons[0]?.artifactPaths.shadowRawRecall).toBe(
        "traces/case-shadow__shadow/shadow-raw-recall.json",
      );
      expect(artifact.comparisons[0]?.artifactPaths.baselineTrace).not.toBe(
        artifact.comparisons[0]?.artifactPaths.executedTrace,
      );
      expect(artifact.comparisons[0]?.artifactPaths.rawRecall).toBe(
        "traces/case-shadow/raw-recall.json",
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("persists a deterministic strategy promotion gate artifact", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-promotion-gate");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-gate",
          scenarioId: "scenario-gate-1",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyFamily: "retrieval",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: false,
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 4,
          goodmemoryHistory: 8,
        }),
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-gate",
        cases,
        summary: aggregateJudgedCases(cases),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        summary?: {
          promotionGate?: {
            mode?: string;
            targetStrategyLabel?: string;
            decision?: string;
            outcome?: string;
          };
        };
      };
      const artifact = JSON.parse(
        await readFile(join(result.runDirectory, "strategy-promotion-gate.json"), "utf8"),
      ) as {
        mode?: string;
        targetStrategyLabel?: string;
        decision?: string;
        outcome?: string;
      };

      expect(report.summary?.promotionGate).toMatchObject({
        mode: "observe",
        targetStrategyLabel: "hybrid",
        decision: "delayed",
        outcome: "review_required",
      });
      expect(artifact).toMatchObject({
        mode: "observe",
        targetStrategyLabel: "hybrid",
        decision: "delayed",
        outcome: "review_required",
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("persists a deterministic public surface decision artifact", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-public-surface");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-surface",
          scenarioId: "scenario-surface-1",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyFamily: "retrieval",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: false,
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 4,
          goodmemoryHistory: 8,
        }),
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-public-surface",
        cases,
        summary: aggregateJudgedCases(cases),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const report = JSON.parse(
        await readFile(join(result.runDirectory, "report.json"), "utf8"),
      ) as {
        summary?: {
          publicSurfaceDecision?: {
            officialCliShape?: {
              evalSubcommandsNested?: boolean;
              memoryCommandsAtRoot?: boolean;
              publicEvolutionNamespace?: boolean;
            };
            evidence?: {
              promotionGateDecision?: string;
              totalRegressionCases?: number;
            };
            surfaces?: Array<{
              surface?: string;
              exposure?: string;
              decision?: string;
            }>;
          };
        };
      };
      const artifact = JSON.parse(
        await readFile(join(result.runDirectory, "public-surface-decision.json"), "utf8"),
      ) as {
        officialCliShape?: {
          evalSubcommandsNested?: boolean;
          memoryCommandsAtRoot?: boolean;
          publicEvolutionNamespace?: boolean;
        };
        evidence?: {
          promotionGateDecision?: string;
          totalRegressionCases?: number;
        };
        surfaces?: Array<{
          surface?: string;
          exposure?: string;
          decision?: string;
        }>;
      };

      expect(report.summary?.publicSurfaceDecision).toMatchObject({
        officialCliShape: {
          evalSubcommandsNested: true,
          memoryCommandsAtRoot: true,
          publicEvolutionNamespace: false,
        },
        evidence: {
          promotionGateDecision: "delayed",
          totalRegressionCases: 0,
        },
      });
      expect(report.summary?.publicSurfaceDecision?.surfaces).toMatchObject([
        {
          surface: "core_config",
          exposure: "public",
          decision: "accepted",
        },
        {
          surface: "eval_artifact_cli",
          exposure: "public",
          decision: "accepted",
        },
        {
          surface: "official_memory_cli",
          exposure: "advanced",
          decision: "delayed",
        },
        {
          surface: "strategy_rollout_config",
          exposure: "internal",
          decision: "delayed",
        },
        {
          surface: "promotion_gate_runtime",
          exposure: "internal",
          decision: "delayed",
        },
        {
          surface: "evolution_namespace",
          exposure: "internal",
          decision: "delayed",
        },
      ]);
      expect(artifact).toMatchObject({
        officialCliShape: {
          evalSubcommandsNested: true,
          memoryCommandsAtRoot: true,
          publicEvolutionNamespace: false,
        },
        evidence: {
          promotionGateDecision: "delayed",
          totalRegressionCases: 0,
        },
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("persists a regression dashboard artifact with failure clusters and raw lineage", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-regression-dashboard");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-cluster-1",
          scenarioId: "scenario-cluster-1",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "hybrid",
          strategyFamily: "retrieval",
          strategyMode: "assist",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: true,
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "baseline",
          baselineHistory: 8,
          goodmemoryHistory: 6,
          failureTags: ["goodmemory_wrong_personalization"],
          contaminationFindings: ["leaked stale preference"],
        }),
        buildCase({
          caseId: "case-cluster-2",
          scenarioId: "scenario-cluster-2",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "hybrid",
          strategyFamily: "retrieval",
          strategyMode: "assist",
          promotedStrategyLabel: "rules-only",
          candidateInfluencedExecution: true,
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "baseline",
          baselineHistory: 8,
          goodmemoryHistory: 6,
          failureTags: ["goodmemory_wrong_personalization"],
          contaminationFindings: ["leaked stale preference"],
        }),
      ];

      const executionFailures = [
        {
          caseId: "case-execution",
          failureStage: "primary_execution" as const,
          metadata: {
            taskFamily: "preference_continuation" as const,
            targetDomain: "work_ops",
            memorySourceDomains: ["work_ops"],
            evaluationSetting: "single_domain" as const,
            strategyLabel: "hybrid" as const,
            resolvedStrategyLabel: "hybrid" as const,
            strategyFamily: "retrieval" as const,
            strategyMode: "assist" as const,
            promotedStrategyLabel: "rules-only" as const,
          },
          retryLimit: 2,
          attempts: [
            { attempt: 1, error: "timeout" },
            { attempt: 2, error: "timeout" },
          ],
          lastError: "timeout",
        },
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-regression-dashboard",
        cases,
        summary: aggregateJudgedCases(cases, executionFailures),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "assist",
            promotedStrategyLabel: "rules-only",
          },
        },
        executionFailures,
      });

      const artifact = JSON.parse(
        await readFile(join(result.runDirectory, "regression-dashboard.json"), "utf8"),
      ) as {
        summary: {
          regressionDashboardSummary?: {
            totalRegressionCases: number;
            totalBlockingCases: number;
            judgedRegressionCases: number;
            executionFailureCount: number;
            unattributedExecutionFailureCount: number;
            strategyRegressions: Array<{
              strategyLabel: string;
              regressionCaseCount: number;
              executionFailureCaseCount: number;
              blockingCaseCount: number;
            }>;
            gate?: {
              decision?: string;
              outcome?: string;
            };
          };
          failureClusterCount?: number;
          promotionGate?: {
            decision?: string;
            outcome?: string;
          } | null;
        };
        failureClusters: Array<{
          clusterId: string;
          kind: string;
          totalCases: number;
          failureTags: string[];
          strategyLabels: string[];
          strategyModes: string[];
          cases: Array<{
            caseId: string;
            artifactPaths: Record<string, string>;
          }>;
        }>;
      };

      expect(artifact.summary.regressionDashboardSummary).toMatchObject({
        totalRegressionCases: 2,
        totalBlockingCases: 3,
        judgedRegressionCases: 2,
        executionFailureCount: 1,
        unattributedExecutionFailureCount: 0,
        strategyRegressions: [
          {
            strategyLabel: "hybrid",
            regressionCaseCount: 2,
            executionFailureCaseCount: 1,
            blockingCaseCount: 3,
          },
        ],
        gate: {
          decision: "delayed",
          outcome: "review_required",
        },
      });
      expect(artifact.summary.failureClusterCount).toBe(2);
      expect(artifact.summary.promotionGate).toMatchObject({
        decision: "delayed",
        outcome: "review_required",
      });
      expect(artifact.failureClusters[0]).toMatchObject({
        clusterId:
          "judged:assertion:non_transfer_signals_absent|assertion:wrong_personalization_absent|goodmemory_wrong_personalization",
        kind: "judged",
        totalCases: 2,
        failureTags: [
          "assertion:non_transfer_signals_absent",
          "assertion:wrong_personalization_absent",
          "goodmemory_wrong_personalization",
        ],
        strategyLabels: ["hybrid"],
        strategyModes: ["assist"],
      });
      expect(artifact.failureClusters[0]?.cases[0]?.artifactPaths).toMatchObject({
        case: "cases/case-cluster-1.json",
        failure: "failures/case-cluster-1.json",
        baselineTrace: "traces/case-cluster-1/baseline.json",
        executedTrace: "traces/case-cluster-1/goodmemory.json",
        rawRecall: "traces/case-cluster-1/raw-recall.json",
        judge: "traces/case-cluster-1/judge.json",
        assertions: "traces/case-cluster-1/assertions.json",
        proposalTrace: "traces/case-cluster-1/proposal-trace.json",
      });
      expect(artifact.failureClusters[1]).toMatchObject({
        clusterId: "execution:execution:retry_exhausted",
        kind: "execution",
        totalCases: 1,
        failureTags: ["execution:retry_exhausted"],
        strategyLabels: ["hybrid"],
        strategyModes: ["assist"],
      });
      expect(artifact.failureClusters[1]?.cases[0]?.artifactPaths).toEqual({
        failure: "failures/case-execution.execution.json",
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("preserves unknown execution influence in shadow comparison artifacts", async () => {
    const workspace = await createTempWorkspace(
      "goodmemory-reporting-shadow-comparisons-unknown",
    );

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-shadow-unknown",
          scenarioId: "scenario-shadow-unknown",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyFamily: "retrieval",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "goodmemory",
          baselineHistory: 4,
          goodmemoryHistory: 8,
        }),
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-shadow-unknown",
        cases,
        summary: aggregateJudgedCases(cases),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const artifact = JSON.parse(
        await readFile(
          join(result.runDirectory, "shadow-executed-path-comparisons.json"),
          "utf8",
        ),
      ) as {
        comparisons: Array<{
          executedPathSource: string;
          candidateInfluencedExecution?: boolean;
        }>;
      };

      expect(artifact.comparisons[0]).toMatchObject({
        executedPathSource: "unknown",
      });
      expect("candidateInfluencedExecution" in (artifact.comparisons[0] ?? {})).toBe(
        false,
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("clusters judged observe-mode failures under the executed strategy label", async () => {
    const workspace = await createTempWorkspace(
      "goodmemory-reporting-observe-failure-cluster",
    );

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-observe-regression",
          scenarioId: "scenario-observe-regression",
          strategyLabel: "hybrid",
          resolvedStrategyLabel: "rules-only",
          strategyFamily: "retrieval",
          strategyMode: "observe",
          promotedStrategyLabel: "rules-only",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "baseline",
          baselineHistory: 8,
          goodmemoryHistory: 6,
          failureTags: ["goodmemory_wrong_personalization"],
        }),
      ];

      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-observe-failure-cluster",
        cases,
        summary: aggregateJudgedCases(cases),
        runtime: {
          generationMode: "fallback",
          judgeMode: "fallback",
          strategyRollout: {
            family: "retrieval",
            mode: "observe",
            promotedStrategyLabel: "rules-only",
          },
        },
      });

      const artifact = JSON.parse(
        await readFile(join(result.runDirectory, "regression-dashboard.json"), "utf8"),
      ) as {
        failureClusters: Array<{
          strategyLabels: string[];
          strategyModes: string[];
          cases: Array<{
            caseId: string;
            strategyLabel?: string;
            executedStrategyLabel?: string;
            resolvedStrategyLabel?: string;
          }>;
        }>;
      };

      expect(artifact.failureClusters).toHaveLength(1);
      expect(artifact.failureClusters[0]).toMatchObject({
        strategyLabels: ["rules-only"],
        strategyModes: ["observe"],
      });
      expect(artifact.failureClusters[0]?.cases[0]).toMatchObject({
        caseId: "case-observe-regression",
        strategyLabel: "hybrid",
        executedStrategyLabel: "rules-only",
        resolvedStrategyLabel: "rules-only",
      });
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

  it("keeps non-blocking GoodMemory diagnostics out of release failures when assertions pass", async () => {
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

      expect(failureSummary.totalFailures).toBe(0);
      expect(failureSummary.failedCases).toHaveLength(0);
    } finally {
      await workspace.cleanup();
    }
  });

  it("uses explicit blocking failure tags when GoodMemory otherwise wins", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-explicit-blocking-tags");

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
          blockingFailureTags: ["goodmemory_internal_thought_leak"],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-002c",
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
      expect(failureSummary.failedCases[0]?.failureTags).toEqual([
        "goodmemory_internal_thought_leak",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });

  it("treats shared blocking defects as release failures even when GoodMemory wins", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-shared-blocking-tags");

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
          failureTags: ["shared_unsafe_recommendation"],
          blockingFailureTags: ["shared_unsafe_recommendation"],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-002d",
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
      expect(failureSummary.failedCases[0]?.failureTags).toEqual([
        "shared_unsafe_recommendation",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });

  it("still marks legacy high-risk GoodMemory defects as failures even without blocking tags", async () => {
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

  it("preserves diagnostic failure tags for baseline losses when blocking tags are empty", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting-baseline-diagnostics");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [
        buildCase({
          caseId: "case-1",
          taskFamily: "preference_continuation",
          targetDomain: "work_ops",
          memorySourceDomains: ["work_ops"],
          evaluationSetting: "single_domain",
          winner: "baseline",
          baselineHistory: 8,
          goodmemoryHistory: 3,
          failureTags: ["goodmemory_missed_update_signal"],
          blockingFailureTags: [],
        }),
      ];

      const summary = aggregateJudgedCases(cases);
      const result = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-004",
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
      expect(failureSummary.failedCases[0]?.failureTags).toEqual([
        "goodmemory_missed_update_signal",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });
});
