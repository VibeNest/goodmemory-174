import { describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createMemorySource } from "../../src/domain/provenance";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import { createSessionArchive } from "../../src/evolution/contracts";
import { createTempWorkspace } from "../../src/testing/utils";
import type { EvalAssertionSummary } from "../../src/eval/assertions";
import {
  persistEvalArtifacts,
  aggregateJudgedCases,
  type JudgedEvalCase,
} from "../../src/eval/reporting";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import type { JudgeResult } from "../../src/eval/judge";
import {
  runCLI,
} from "../../src/cli";

function buildAnswerPackage(
  caseId: string,
  mode: "baseline" | "goodmemory",
): EvalAnswerPackage {
  const source = createMemorySource({
    method: "explicit",
    extractedAt: "2026-01-01T00:00:00.000Z",
    sessionId: "s-0",
  });

  return {
    mode,
    personaId: caseId,
    scenarioId: `scenario-${caseId}`,
    taskFamily: "cross_domain_transfer",
    targetDomain: "shopping",
    memorySourceDomains: ["work_ops", "gaming"],
    evaluationSetting: "cross_domain",
    prompt: "Prompt",
    transcript: "Transcript",
    answer: mode === "goodmemory" ? "goodmemory-answer" : "baseline-answer",
    memoryContext: mode === "goodmemory" ? "## References\n- Runbook" : undefined,
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
                source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
                lifecycle: "active",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            facts: [],
            feedback: [],
            archives: [
              createSessionArchive({
                id: "archive-1",
                userId: caseId,
                sessionId: "s-0",
                summary: "Previous session paused at final verification.",
                createdAt: "2026-01-01T00:00:00.000Z",
                archivedAt: "2026-01-01T00:00:00.000Z",
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-1",
                userId: caseId,
                sessionId: "s-0",
                kind: "conversation_excerpt",
                excerpt: "The user said docs/runbook.md is the source of truth.",
                source,
                linkedMemoryIds: ["ref-1"],
              }),
            ],
            episodes: [],
            workingMemory: null,
            journal: null,
            routingDecision: {
              retrievalProfile: "coding_agent",
              intent: "task_continuation",
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
                "working_memory",
                "session_journal",
                "session_archive",
                "episode",
                "fact",
                "evidence",
                "feedback",
                "profile",
              ],
              requestedSlots: ["reference"],
              supportSlots: ["runtime_continuity"],
              actionDriving: false,
              referenceSeeking: true,
              continuation: true,
            },
            hits: [
              {
                id: "ref-1",
                type: "reference",
                reason: "semantic_reference",
                sourceMethod: "explicit",
                evidenceIds: ["evidence-1"],
              },
              {
                id: "archive-1",
                type: "session_archive",
                reason: "continuation_context",
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
            policyApplied: ["custom_shouldRecall"],
            verificationHints: [
              {
                memoryId: "ref-1",
                memoryType: "reference",
                reason: "stale reference should be re-checked before action",
                evidenceIds: ["evidence-1"],
              },
            ],
            renderedMemoryContext: "## References\n- Runbook",
          }
        : undefined,
    trace: {
      sessionsReplayed: mode === "goodmemory" ? 2 : 0,
      rememberEvents:
        mode === "goodmemory"
          ? [
              {
                sessionId: "s-1",
                replayedTurns: 2,
                accepted: 1,
                rejected: 0,
                events: [
                  {
                    candidateId: "candidate-0",
                    outcome: "written",
                    memoryType: "profile",
                    memoryId: caseId,
                    reason: "explicit_profile_role",
                    sourceMethod: "explicit",
                  },
                  {
                    candidateId: "candidate-1",
                    outcome: "written",
                    memoryType: "reference",
                    memoryId: "ref-1",
                    reason: "explicit_reference",
                    sourceMethod: "explicit",
                  },
                ],
              },
            ]
          : [],
      feedbackEvents: [],
      recallHitCount: mode === "goodmemory" ? 1 : 0,
      verificationHintCount: 0,
      contextBuild:
        mode === "goodmemory"
          ? {
              output: "markdown",
              maxTokens: 160,
              contentLength: 22,
              contextEstimatedTokens: 6,
              packetTokenCountBeforeRender: 12,
            }
          : null,
    },
  };
}

function buildJudgeResult(): JudgeResult {
  return {
    winner: "goodmemory",
    scores: {
      factual_recall: 8,
      preference_consistency: 9,
      cross_domain_transfer: 8,
      contamination_penalty: 9,
      update_correctness: 8,
      personalization_usefulness: 9,
      provenance_explainability: 8,
    },
    baseline_scores: {
      factual_recall: 5,
      preference_consistency: 4,
      cross_domain_transfer: 4,
      contamination_penalty: 5,
      update_correctness: 4,
      personalization_usefulness: 4,
      provenance_explainability: 5,
    },
    goodmemory_scores: {
      factual_recall: 8,
      preference_consistency: 9,
      cross_domain_transfer: 8,
      contamination_penalty: 9,
      update_correctness: 8,
      personalization_usefulness: 9,
      provenance_explainability: 8,
    },
    reasoning: "comparison complete",
    failure_tags: [],
  };
}

function buildAssertions(): EvalAssertionSummary {
  return {
    passed: true,
    totalChecks: 6,
    passedChecks: 6,
    checks: [
      { id: "transfer_signals_present", passed: true, details: ["present:risk-first summaries"] },
      { id: "non_transfer_signals_absent", passed: true, details: ["absent:spoiler-heavy framing"] },
      { id: "update_wins_present", passed: true, details: ["present:docs/runbook.md"] },
      { id: "stale_suppression_absent", passed: true, details: ["absent:docs/stale-runbook.md"] },
      { id: "wrong_personalization_absent", passed: true, details: ["absent:spoiler-heavy framing"] },
      { id: "provenance_explainable", passed: true, details: ["provenance:complete"] },
    ],
    contaminationFindings: [],
    updateFindings: [],
  };
}

function buildCase(caseId: string): JudgedEvalCase {
  return {
    caseId,
    metadata: {
      taskFamily: "cross_domain_transfer",
      targetDomain: "shopping",
      memorySourceDomains: ["work_ops", "gaming"],
      evaluationSetting: "cross_domain",
    },
    baseline: buildAnswerPackage(caseId, "baseline"),
    goodmemory: buildAnswerPackage(caseId, "goodmemory"),
    judge: buildJudgeResult(),
    assertions: buildAssertions(),
  };
}

describe("goodmemory cli", () => {
  it("inspect returns a human-readable case summary", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [buildCase("case-1")];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-001",
        cases,
        summary,
        runtime: { generationMode: "fallback", judgeMode: "fallback" },
      });

      const result = await runCLI([
        "inspect",
        "--run-dir",
        persisted.runDirectory,
        "--case-id",
        "case-1",
      ]);

      expect(result.stdout).toContain("Run Mode: fallback");
      expect(result.stdout).toContain("Runtime: generation=fallback, judge=fallback");
      expect(result.stdout).toContain("Case: case-1");
      expect(result.stdout).toContain("Task Family: cross_domain_transfer");
      expect(result.stdout).toContain("Target Domain: shopping");
      expect(result.stdout).toContain("Winner: goodmemory");
      expect(result.stdout).toContain("References: 1");
      expect(result.stdout).toContain("Archives: 1");
      expect(result.stdout).toContain("Evidence: 1");
      expect(result.stdout).toContain("Assertions: 6/6 passed");
    } finally {
      await workspace.cleanup();
    }
  });

  it("trace returns recall and write details", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [buildCase("case-1")];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-001",
        cases,
        summary,
        runtime: { generationMode: "fallback", judgeMode: "fallback" },
      });

      const result = await runCLI([
        "trace",
        "--run-dir",
        persisted.runDirectory,
        "--case-id",
        "case-1",
      ]);

      expect(result.stdout).toContain("Write Trace");
      expect(result.stdout).toContain("explicit_profile_role");
      expect(result.stdout).toContain("explicit_reference");
      expect(result.stdout).toContain("Recall Hits");
      expect(result.stdout).toContain("semantic_reference");
      expect(result.stdout).toContain("evidence=evidence-1");
      expect(result.stdout).toContain("continuation_context");
      expect(result.stdout).toContain("Router Strategy");
      expect(result.stdout).toContain("rules-only");
      expect(result.stdout).toContain("lexical, runtime, and procedural priors");
      expect(result.stdout).toContain("Policy Applied");
      expect(result.stdout).toContain("custom_shouldRecall");
      expect(result.stdout).toContain("Verification Hints");
      expect(result.stdout).toContain("stale reference should be re-checked before action");
      expect(result.stdout).toContain("Assertions");
      expect(result.stdout).toContain("transfer_signals_present: pass");
    } finally {
      await workspace.cleanup();
    }
  });

  it("trace tolerates legacy runs without assertions artifacts", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-legacy");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases: JudgedEvalCase[] = [buildCase("case-1")];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-001",
        cases,
        summary,
        runtime: { generationMode: "fallback", judgeMode: "fallback" },
      });
      await rm(join(persisted.runDirectory, "traces", "case-1", "assertions.json"));

      const result = await runCLI([
        "trace",
        "--run-dir",
        persisted.runDirectory,
        "--case-id",
        "case-1",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Assertions");
      expect(result.stdout).toContain("unavailable (legacy run)");
    } finally {
      await workspace.cleanup();
    }
  });

  it("export copies a case artifact to a target path", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli");

    try {
      const outputDir = join(workspace.root, "reports");
      const exportPath = join(workspace.root, "exported-case.json");
      const cases: JudgedEvalCase[] = [buildCase("case-1")];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
        mode: "fallback",
        outputDir,
        runId: "run-001",
        cases,
        summary,
        runtime: { generationMode: "fallback", judgeMode: "fallback" },
      });

      const result = await runCLI([
        "export",
        "--run-dir",
        persisted.runDirectory,
        "--case-id",
        "case-1",
        "--output",
        exportPath,
      ]);

      const exported = JSON.parse(await readFile(exportPath, "utf8")) as { caseId: string };

      expect(result.stdout).toContain("Exported case artifact");
      expect(exported.caseId).toBe("case-1");
    } finally {
      await workspace.cleanup();
    }
  });
});
