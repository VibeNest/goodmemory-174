import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createGoodMemory } from "../../src";
import { createMemorySource } from "../../src/domain/provenance";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import { createSessionArchive } from "../../src/evolution/contracts";
import type { EvalAssertionSummary } from "../../src/eval/assertions";
import type { JudgedEvalCase } from "../../src/eval/contracts";
import type { JudgeResult } from "../../src/eval/judge";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
} from "../../src/eval/reporting";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import { createTempWorkspace } from "../../src/testing/utils";
import { runCLI } from "../../src/cli";

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
    strategyLabel: mode === "goodmemory" ? "rules-only" : "baseline",
    resolvedStrategyLabel: mode === "goodmemory" ? "rules-only" : undefined,
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
      strategyLabel: "rules-only",
      resolvedStrategyLabel: "rules-only",
    },
    baseline: buildAnswerPackage(caseId, "baseline"),
    goodmemory: buildAnswerPackage(caseId, "goodmemory"),
    judge: buildJudgeResult(),
    assertions: buildAssertions(),
  };
}

async function seedSQLiteMemory(sqlitePath: string) {
  await mkdir(dirname(sqlitePath), { recursive: true });
  const memory = createGoodMemory({
    storage: {
      provider: "sqlite",
      url: sqlitePath,
    },
  });
  const scope = {
    userId: "cli-user",
    workspaceId: "workspace-a",
    sessionId: "session-1",
  };

  await memory.remember({
    scope,
    messages: [
      {
        role: "user",
        content: "Remember that my name is Felix.",
      },
      {
        role: "user",
        content: "Remember that I'm a climate policy advisor in Austin, USA.",
      },
      {
        role: "user",
        content:
          "Remember that the current blocker is vendor approval for release quality program.",
      },
      {
        role: "user",
        content:
          "Use docs/release-quality-runbook.md as the source of truth for release quality program.",
      },
    ],
  });
  await memory.feedback({
    scope,
    signal: "Use concise bullet points in summaries.",
  });

  return {
    memory,
    scope,
  };
}

function hasSQLiteTable(sqlitePath: string, tableName: string): boolean {
  const database = new Database(sqlitePath, {
    readonly: true,
    create: false,
    strict: true,
  });

  try {
    const row = database.query<{ name: string }, [string]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1`,
    ).get(tableName);

    return row !== null && row !== undefined;
  } finally {
    database.close();
  }
}

function dropSQLiteTable(sqlitePath: string, tableName: string): void {
  const database = new Database(sqlitePath, {
    strict: true,
  });

  try {
    database.exec(`DROP TABLE IF EXISTS ${tableName}`);
  } finally {
    database.close();
  }
}

describe("goodmemory cli eval commands", () => {
  it("eval inspect returns a human-readable case summary", async () => {
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
        "eval",
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
      expect(result.stdout).toContain("Experience Records: 4");
      expect(result.stdout).toContain("Proposals: 2 (accepted=1, delayed=1)");
      expect(result.stdout).toContain("Promotions: 2 (accepted=1, delayed=1)");
      expect(result.stdout).toContain("Assertions: 6/6 passed");
    } finally {
      await workspace.cleanup();
    }
  });

  it("eval trace returns recall and write details", async () => {
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
        "eval",
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
      expect(result.stdout).toContain("Proposal Lifecycle");
      expect(result.stdout).toContain("maintenance_action / accepted");
      expect(result.stdout).toContain("procedural_pattern / delayed");
      expect(result.stdout).toContain("Promotion Decisions");
      expect(result.stdout).toContain("proposal-2 -> delayed");
      expect(result.stdout).toContain("eval=review_required");
      expect(result.stdout).toContain("Assertions");
      expect(result.stdout).toContain("transfer_signals_present: pass");
    } finally {
      await workspace.cleanup();
    }
  });

  it("eval trace tolerates legacy runs without assertions artifacts", async () => {
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
        "eval",
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

  it("eval export-case copies a case artifact to a target path", async () => {
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
        "eval",
        "export-case",
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

describe("goodmemory cli root commands", () => {
  it("inspect summarizes scoped memory from sqlite storage", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-inspect");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      await seedSQLiteMemory(sqlitePath);

      const result = await runCLI([
        "inspect",
        "--user-id",
        "cli-user",
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Scope: user=cli-user");
      expect(result.stdout).toContain(`Storage: sqlite (${sqlitePath})`);
      expect(result.stdout).toContain("Profile: present");
      expect(result.stdout).toContain("Top Facts");
      expect(result.stdout).toContain("vendor approval for release quality program");
      expect(result.stdout).toContain("Top References");
      expect(result.stdout).toContain("docs/release-quality-runbook.md");
      expect(result.stdout).toContain("Top Feedback");
      expect(result.stdout).toContain("Use concise bullet points in summaries.");
    } finally {
      await workspace.cleanup();
    }
  });

  it("inspect does not create a vectors table in read-only sqlite mode", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-inspect-read-only");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      await seedSQLiteMemory(sqlitePath);
      dropSQLiteTable(sqlitePath, "vectors");

      expect(hasSQLiteTable(sqlitePath, "vectors")).toBe(false);

      const result = await runCLI([
        "inspect",
        "--user-id",
        "cli-user",
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(hasSQLiteTable(sqlitePath, "vectors")).toBe(false);
    } finally {
      await workspace.cleanup();
    }
  });

  it("inspect hides superseded references from the top summary", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-inspect-superseded");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      const { memory, scope } = await seedSQLiteMemory(sqlitePath);

      await memory.remember({
        scope,
        messages: [
          {
            role: "user",
            content:
              "Correction: docs/release-quality-runbook-v2.md is now the source of truth, not docs/release-quality-runbook.md. Please update that.",
          },
        ],
      });

      const result = await runCLI([
        "inspect",
        "--user-id",
        scope.userId,
        "--workspace-id",
        scope.workspaceId!,
        "--session-id",
        scope.sessionId!,
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Top References");
      expect(result.stdout).toContain("docs/release-quality-runbook-v2.md");
      expect(result.stdout).not.toContain(
        "- release-quality-runbook.md -> docs/release-quality-runbook.md",
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("trace uses a non-mutating recall diagnostic path", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-trace");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      const { memory, scope } = await seedSQLiteMemory(sqlitePath);
      const before = await memory.exportMemory({
        scope,
      });
      const blockerFact = before.durable.facts.find((record) =>
        record.content.includes("vendor approval"),
      );
      const feedback = before.durable.feedback.find((record) =>
        record.rule.includes("concise bullet points"),
      );

      const result = await runCLI([
        "trace",
        "--user-id",
        scope.userId,
        "--workspace-id",
        scope.workspaceId!,
        "--session-id",
        scope.sessionId!,
        "--query",
        "Which runbook is the source of truth and what is the blocker?",
        "--strategy",
        "rules-only",
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      const after = await memory.exportMemory({
        scope,
      });
      const blockerFactAfter = after.durable.facts.find((record) =>
        record.content.includes("vendor approval"),
      );
      const feedbackAfter = after.durable.feedback.find((record) =>
        record.rule.includes("concise bullet points"),
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Routing Decision");
      expect(result.stdout).toContain("requested strategy: rules-only");
      expect(result.stdout).toContain("resolved strategy: rules-only");
      expect(result.stdout).toContain("Hits");
      expect(result.stdout).toContain("Returned Candidate Traces");
      expect(result.stdout).toContain("Suppressed Candidate Traces");
      expect(blockerFactAfter?.accessCount).toBe(blockerFact?.accessCount);
      expect(blockerFactAfter?.lastAccessedAt).toBe(blockerFact?.lastAccessedAt);
      expect(feedbackAfter?.lastUsedAt).toBe(feedback?.lastUsedAt);
      expect(after.durable.experiences).toHaveLength(before.durable.experiences.length);
      expect(after.durable.proposals).toHaveLength(before.durable.proposals.length);
      expect(after.durable.promotions).toHaveLength(before.durable.promotions.length);
    } finally {
      await workspace.cleanup();
    }
  });

  it("stats reports scope-bounded counts and backend metadata", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-stats");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      await seedSQLiteMemory(sqlitePath);

      const result = await runCLI([
        "stats",
        "--user-id",
        "cli-user",
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Storage Provider: sqlite");
      expect(result.stdout).toContain(`Storage Location: ${sqlitePath}`);
      expect(result.stdout).toContain("Profile Records: 1");
      expect(result.stdout).toContain("References: 1");
      expect(result.stdout).toContain("Facts: 1");
      expect(result.stdout).toContain("Feedback: 1");
    } finally {
      await workspace.cleanup();
    }
  });

  it("export-memory writes json and markdown artifacts", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-export");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      const { scope } = await seedSQLiteMemory(sqlitePath);
      const outputPath = join(workspace.root, "memory-export");

      const result = await runCLI([
        "export-memory",
        "--user-id",
        scope.userId,
        "--workspace-id",
        scope.workspaceId!,
        "--session-id",
        scope.sessionId!,
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
        "--output",
        outputPath,
      ]);

      const exported = JSON.parse(
        await readFile(join(outputPath, "memory-export.json"), "utf8"),
      ) as { scope: { userId: string } };
      const memoryArtifact = await readFile(
        join(
          outputPath,
          ".goodmemory",
          "users",
          scope.userId,
          "workspaces",
          scope.workspaceId!,
          "sessions",
          scope.sessionId!,
          "MEMORY.md",
        ),
        "utf8",
      );
      const userArtifact = await readFile(
        join(
          outputPath,
          ".goodmemory",
          "users",
          scope.userId,
          "workspaces",
          scope.workspaceId!,
          "sessions",
          scope.sessionId!,
          "user.md",
        ),
        "utf8",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Exported memory snapshot");
      expect(exported.scope.userId).toBe(scope.userId);
      expect(memoryArtifact).toContain("# MEMORY");
      expect(memoryArtifact).toContain("release quality program");
      expect(userArtifact).toContain("User Memory");
    } finally {
      await workspace.cleanup();
    }
  });

  it("defaults sqlite storage to the cwd .goodmemory path", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-default-sqlite");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);
      await seedSQLiteMemory(join(workspace.root, ".goodmemory", "memory.sqlite"));

      const result = await runCLI([
        "stats",
        "--user-id",
        "cli-user",
        "--workspace-id",
        "workspace-a",
        "--session-id",
        "session-1",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Storage Location: ");
      expect(result.stdout).toContain(
        join(".goodmemory", "memory.sqlite"),
      );
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });

  for (const command of ["inspect", "stats"] as const) {
    it(`${command} does not create default sqlite storage when the cwd store is missing`, async () => {
      const workspace = await createTempWorkspace(`goodmemory-cli-${command}-missing-store`);
      const previousCwd = process.cwd();

      try {
        process.chdir(workspace.root);

        const result = await runCLI([
          command,
          "--user-id",
          "review-user",
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          "Read-only CLI commands require an existing sqlite database",
        );
        await expect(
          access(join(workspace.root, ".goodmemory", "memory.sqlite")),
        ).rejects.toThrow();
      } finally {
        process.chdir(previousCwd);
        await workspace.cleanup();
      }
    });
  }

  it("trace does not create default sqlite storage when the cwd store is missing", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-trace-missing-store");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const result = await runCLI([
        "trace",
        "--user-id",
        "review-user",
        "--query",
        "What should I do next?",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "Read-only CLI commands require an existing sqlite database",
      );
      await expect(
        access(join(workspace.root, ".goodmemory", "memory.sqlite")),
      ).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });
});
