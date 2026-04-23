import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createFactMemory,
  createFeedbackMemory,
  createGoodMemory,
  createReferenceMemory,
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createUserProfile,
} from "../../src";
import { createMemorySource } from "../../src/domain/provenance";
import {
  createEvidenceRecord,
  EVIDENCE_COLLECTION,
} from "../../src/evidence/contracts";
import { createSessionArchive } from "../../src/evolution/contracts";
import type { EvalAssertionSummary } from "../../src/eval/assertions";
import type { JudgedEvalCase } from "../../src/eval/contracts";
import type { JudgeResult } from "../../src/eval/judge";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
} from "../../src/eval/reporting";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import { createInMemoryVectorStore } from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";
import { createTempWorkspace } from "../../src/testing/utils";
import { resolveStorageConfig, runCLI } from "../../src/cli";

const TEXT_DECODER = new TextDecoder();

async function withCwd<T>(cwd: string, callback: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await callback();
  } finally {
    process.chdir(previous);
  }
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function runBunScript(input: {
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  scriptPath: string;
  stdin?: string;
}): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const stdin = input.stdin;
  const childProcess = Bun.spawn({
    cmd: ["bun", input.scriptPath, ...(input.args ?? [])],
    cwd: input.cwd,
    env: {
      ...process.env,
      ...(input.env ?? {}),
    },
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    if (!childProcess.stdin) {
      throw new Error("bun test helper expected a writable stdin pipe");
    }
    childProcess.stdin.write(stdin);
    childProcess.stdin.end();
  }
  const stdout = await new Response(childProcess.stdout).text();
  const stderr = await new Response(childProcess.stderr).text();
  const exitCode = await childProcess.exited;

  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function packCurrentPackage(input: {
  outputDir: string;
  packageRoot: string;
}): Promise<string> {
  await rm(input.outputDir, { force: true, recursive: true });
  await mkdir(input.outputDir, { recursive: true });

  const pack = Bun.spawnSync({
    cmd: ["bun", "pm", "pack", "--destination", input.outputDir, "--quiet"],
    cwd: input.packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (pack.exitCode !== 0) {
    throw new Error(
      [
        "Failed to pack the current GoodMemory package for an installed-package CLI test.",
        TEXT_DECODER.decode(pack.stderr).trim(),
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    );
  }

  const stdout = TEXT_DECODER.decode(pack.stdout).trim();
  if (stdout.length === 0) {
    throw new Error("Expected bun pm pack to print the generated tarball path.");
  }

  return stdout.includes("/") ? stdout : join(input.outputDir, stdout);
}

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
  const documentStore = createSQLiteDocumentStore(sqlitePath);
  const sessionStore = createSQLiteSessionStore(sqlitePath);
  const vectorStore = createInMemoryVectorStore();
  const memory = createGoodMemory({
    adapters: {
      documentStore,
      sessionStore,
      vectorStore,
    },
    storage: {
      provider: "sqlite",
      url: sqlitePath,
    },
  });
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore,
    vectorStore,
  });
  const scope = {
    userId: "cli-user",
    workspaceId: "workspace-a",
    sessionId: "session-1",
  };
  const timestamp = "2026-01-01T00:00:00.000Z";
  const source = createMemorySource({
    method: "explicit",
    extractedAt: timestamp,
    sessionId: scope.sessionId,
  });

  await repositories.profiles.upsert(
    createUserProfile({
      userId: scope.userId,
      activeContext: {
        currentProjects: ["release quality program"],
        goals: [],
      },
      createdAt: timestamp,
      identity: {
        location: "Austin, USA",
        name: "Felix",
        role: "climate policy advisor",
      },
      updatedAt: timestamp,
    }),
  );
  await repositories.facts.add(
    createFactMemory({
      id: "fact-blocker",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      sessionId: scope.sessionId,
      category: "project",
      content:
        "The current blocker is vendor approval for release quality program.",
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  await repositories.references.add(
    createReferenceMemory({
      id: "ref-runbook",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      sessionId: scope.sessionId,
      title: "release-quality-runbook.md",
      pointer: "docs/release-quality-runbook.md",
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  await repositories.feedback.upsert(
    createFeedbackMemory({
      id: "feedback-style",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      sessionId: scope.sessionId,
      kind: "do",
      rule: "Use concise bullet points in summaries.",
      source,
      updatedAt: timestamp,
    }),
  );

  return {
    memory,
    scope,
  };
}

async function seedCodexActionPolicyMemory(input: {
  rule: string;
  evidenceExcerpt: string;
  sessionId: string;
  sqlitePath: string;
  userId: string;
  workspaceId: string;
  why?: string;
}) {
  await mkdir(dirname(input.sqlitePath), { recursive: true });
  const documentStore = createSQLiteDocumentStore(input.sqlitePath);
  const sessionStore = createSQLiteSessionStore(input.sqlitePath);
  const memory = createGoodMemory({
    adapters: {
      documentStore,
      sessionStore,
    },
    storage: {
      provider: "sqlite",
      url: input.sqlitePath,
    },
  });
  const source = createMemorySource({
    method: "explicit",
    extractedAt: "2026-04-22T00:00:00.000Z",
    sessionId: input.sessionId,
  });
  const scope = {
    userId: input.userId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
  };

  await documentStore.set(
    "feedback",
    "feedback-policy-1",
    createFeedbackMemory({
      id: "feedback-policy-1",
      userId: input.userId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      kind: "validated_pattern",
      appliesTo: "coding_agent",
      rule: input.rule,
      ...(input.why ? { why: input.why } : {}),
      evidence: ["evidence-policy-1"],
      source,
    }),
  );
  await documentStore.set(
    EVIDENCE_COLLECTION,
    "evidence-policy-1",
    createEvidenceRecord({
      id: "evidence-policy-1",
      userId: input.userId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      kind: input.evidenceExcerpt.includes("blocked")
        ? "verification_result"
        : "correction_context",
      excerpt: input.evidenceExcerpt,
      source,
      sourceMessageIds: ["message-policy-1"],
    }),
  );

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

describe("goodmemory cli help and routing", () => {
  it("returns root help for no args and --help", async () => {
    const noArgs = await runCLI([]);
    const help = await runCLI(["--help"]);

    for (const result of [noArgs, help]) {
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("GoodMemory CLI");
      expect(result.stdout).toContain("remember        Write durable memory through the public API");
      expect(result.stdout).toContain("feedback        Write explicit feedback or correction through the public API");
      expect(result.stdout).toContain(
        "forget          Delete one durable memory record or clear a scoped target",
      );
      expect(result.stdout).toContain("inspect         Inspect scope-bounded memory");
      expect(result.stdout).toContain(
        "install         Install managed global GoodMemory host config for Codex or Claude Code",
      );
      expect(result.stdout).toContain(
        "enable          Enable repo-local GoodMemory host opt-in for Codex or Claude Code",
      );
      expect(result.stdout).toContain(
        "mcp             Run the installed GoodMemory MCP server",
      );
      expect(result.stdout).toContain("codex           Codex bootstrap and installed hook commands");
      expect(result.stdout).toContain("claude          Claude Code bootstrap and installed hook commands");
      expect(result.stdout).toContain("goodmemory eval --help");
      expect(result.stdout).toContain("goodmemory install --help");
      expect(result.stdout).toContain("goodmemory mcp --help");
      expect(result.stderr).toBe("");
    }
  });

  it("returns eval namespace help for bare eval and eval --help", async () => {
    const bareEval = await runCLI(["eval"]);
    const evalHelp = await runCLI(["eval", "--help"]);

    for (const result of [bareEval, evalHelp]) {
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("GoodMemory Eval CLI");
      expect(result.stdout).toContain("inspect       Summarize one eval case");
      expect(result.stdout).toContain("export-case   Copy one eval case artifact");
      expect(result.stderr).toBe("");
    }
  });

  it("returns subcommand help before validating required flags", async () => {
    const inspect = await runCLI(["inspect", "--help"]);
    const remember = await runCLI(["remember", "--help"]);
    const feedback = await runCLI(["feedback", "--help"]);
    const forget = await runCLI(["forget", "--help"]);
    const trace = await runCLI(["trace", "--help"]);
    const stats = await runCLI(["stats", "--help"]);
    const exportMemory = await runCLI(["export-memory", "--help"]);
    const evalInspect = await runCLI(["eval", "inspect", "--help"]);
    const install = await runCLI(["install", "--help"]);
    const installCodex = await runCLI(["install", "codex", "--help"]);
    const uninstall = await runCLI(["uninstall", "--help"]);
    const enable = await runCLI(["enable", "--help"]);
    const disable = await runCLI(["disable", "--help"]);
    const mcp = await runCLI(["mcp", "--help"]);
    const mcpServe = await runCLI(["mcp", "serve", "--help"]);
    const codex = await runCLI(["codex", "--help"]);
    const codexBootstrap = await runCLI(["codex", "bootstrap", "--help"]);
    const codexHook = await runCLI(["codex", "hook", "--help"]);
    const claude = await runCLI(["claude", "--help"]);
    const claudeBootstrap = await runCLI(["claude", "bootstrap", "--help"]);
    const claudeHook = await runCLI(["claude", "hook", "--help"]);

    expect(remember.exitCode).toBe(0);
    expect(remember.stdout).toContain("GoodMemory Remember");
    expect(remember.stdout).toContain("--message <text>");
    expect(remember.stdout).toContain("--host <codex|claude>");
    expect(feedback.exitCode).toBe(0);
    expect(feedback.stdout).toContain("GoodMemory Feedback");
    expect(feedback.stdout).toContain("--signal <text>");
    expect(forget.exitCode).toBe(0);
    expect(forget.stdout).toContain("GoodMemory Forget");
    expect(forget.stdout).toContain("--memory-id <id>");
    expect(forget.stdout).toContain("--all");
    expect(forget.stdout).toContain(
      "--memory-id <id>        Delete one durable memory record. Use either this or --all",
    );
    expect(forget.stdout).toContain(
      "--all                  Delete the full durable scope. Use either this or --memory-id",
    );
    expect(inspect.exitCode).toBe(0);
    expect(inspect.stdout).toContain("GoodMemory Inspect");
    expect(inspect.stdout).toContain("--user-id <id>");
    expect(trace.exitCode).toBe(0);
    expect(trace.stdout).toContain("GoodMemory Trace");
    expect(trace.stdout).toContain("--ignore-memory");
    expect(trace.stdout).toContain("--strategy <auto|rules-only|hybrid|llm-assisted>");
    expect(stats.exitCode).toBe(0);
    expect(stats.stdout).toContain("GoodMemory Stats");
    expect(exportMemory.exitCode).toBe(0);
    expect(exportMemory.stdout).toContain("GoodMemory Export Memory");
    expect(exportMemory.stdout).toContain("--output <path>");
    expect(evalInspect.exitCode).toBe(0);
    expect(evalInspect.stdout).toContain("GoodMemory Eval Inspect");
    expect(evalInspect.stdout).toContain("--run-dir <path>");
    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("GoodMemory Install CLI");
    expect(install.stdout).toContain("goodmemory install <codex|claude>");
    expect(installCodex.exitCode).toBe(0);
    expect(installCodex.stdout).toContain("--memory-path <path>");
    expect(uninstall.exitCode).toBe(0);
    expect(uninstall.stdout).toContain("GoodMemory Uninstall CLI");
    expect(enable.exitCode).toBe(0);
    expect(enable.stdout).toContain("GoodMemory Enable CLI");
    expect(enable.stdout).toContain("--workspace-root <path>");
    expect(disable.exitCode).toBe(0);
    expect(disable.stdout).toContain("GoodMemory Disable CLI");
    expect(mcp.exitCode).toBe(0);
    expect(mcp.stdout).toContain("GoodMemory MCP CLI");
    expect(mcp.stdout).toContain("goodmemory mcp serve --help");
    expect(mcpServe.exitCode).toBe(0);
    expect(mcpServe.stdout).toContain("GoodMemory MCP Serve");
    expect(mcpServe.stdout).toContain("--host <codex|claude>");
    expect(codex.exitCode).toBe(0);
    expect(codex.stdout).toContain("GoodMemory Codex CLI");
    expect(codex.stdout).toContain("goodmemory codex hook --help");
    expect(codexBootstrap.exitCode).toBe(0);
    expect(codexBootstrap.stdout).toContain("GoodMemory Codex Bootstrap");
    expect(codexBootstrap.stdout).toContain("--workspace-root <path>");
    expect(codexHook.exitCode).toBe(0);
    expect(codexHook.stdout).toContain("GoodMemory Codex Hook");
    expect(codexHook.stdout).toContain("session-start");
    expect(claude.exitCode).toBe(0);
    expect(claude.stdout).toContain("GoodMemory Claude CLI");
    expect(claude.stdout).toContain("goodmemory claude hook --help");
    expect(claudeBootstrap.exitCode).toBe(0);
    expect(claudeBootstrap.stdout).toContain("GoodMemory Claude Bootstrap");
    expect(claudeBootstrap.stdout).toContain("--workspace-root <path>");
    expect(claudeHook.exitCode).toBe(0);
    expect(claudeHook.stdout).toContain("GoodMemory Claude Hook");
    expect(claudeHook.stdout).toContain("user-prompt-submit");
  });

  it("returns help hints for unknown root and eval commands", async () => {
    const unknownRoot = await runCLI(["unknown"]);
    const unknownEval = await runCLI(["eval", "unknown"]);
    const unknownInstall = await runCLI(["install", "unknown"]);
    const unknownMcp = await runCLI(["mcp", "unknown"]);
    const unknownCodex = await runCLI(["codex", "unknown"]);
    const unknownClaude = await runCLI(["claude", "unknown"]);

    expect(unknownRoot.exitCode).toBe(1);
    expect(unknownRoot.stderr).toContain("Unknown command: unknown.");
    expect(unknownRoot.stderr).toContain("goodmemory --help");
    expect(unknownEval.exitCode).toBe(1);
    expect(unknownEval.stderr).toContain("Unknown eval command: unknown.");
    expect(unknownEval.stderr).toContain("goodmemory eval --help");
    expect(unknownInstall.exitCode).toBe(1);
    expect(unknownInstall.stderr).toContain("Unknown host target: unknown.");
    expect(unknownMcp.exitCode).toBe(1);
    expect(unknownMcp.stderr).toContain("Unknown MCP command: unknown.");
    expect(unknownMcp.stderr).toContain("goodmemory mcp --help");
    expect(unknownCodex.exitCode).toBe(1);
    expect(unknownCodex.stderr).toContain("Unknown Codex command: unknown.");
    expect(unknownCodex.stderr).toContain("goodmemory codex --help");
    expect(unknownClaude.exitCode).toBe(1);
    expect(unknownClaude.stderr).toContain("Unknown Claude command: unknown.");
    expect(unknownClaude.stderr).toContain("goodmemory claude --help");
  });
});

describe("goodmemory cli host bootstrap", () => {
  it("bootstraps Codex wiring idempotently without creating canonical memory state", async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-bootstrap");

    try {
      await writeFile(join(workspace.root, "AGENTS.md"), "# Existing Workspace Notes\n", "utf8");

      const first = await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );

      expect(first.exitCode).toBe(0);
      const payload = JSON.parse(first.stdout) as {
        changes: Array<{
          action: "created" | "unchanged" | "updated";
          relativePath: string;
        }>;
        host: string;
        workspaceId: string;
      };
      expect(payload.host).toBe("codex");
      expect(payload.workspaceId).toBe("codex-workspace");
      expect(
        payload.changes.map(({ action, relativePath }) => ({
          action,
          relativePath,
        })),
      ).toEqual([
        { action: "updated", relativePath: "AGENTS.md" },
        {
          action: "created",
          relativePath: ".goodmemory/bootstrap/codex-export.mjs",
        },
        {
          action: "created",
          relativePath: ".goodmemory/bootstrap/codex-action.mjs",
        },
        {
          action: "created",
          relativePath: ".codex/hooks.json",
        },
        {
          action: "created",
          relativePath: ".codex/config.toml",
        },
        {
          action: "created",
          relativePath: "codex/rules/goodmemory.rules",
        },
      ]);

      const agents = await readFile(join(workspace.root, "AGENTS.md"), "utf8");
      expect(agents).toContain("# Existing Workspace Notes");
      expect(agents).toContain("## GoodMemory Codex Bootstrap");
      expect(agents).toContain(
        "bun ./.goodmemory/bootstrap/codex-export.mjs --session-id <session-id>",
      );
      expect(agents).toContain(
        'bun ./.goodmemory/bootstrap/codex-action.mjs --session-id <session-id> --command "<command>"',
      );
      expect(agents).toContain(".goodmemory/hosts/codex/session-memory/current.md");
      expect(agents).toContain(".codex/hooks.json");
      expect(agents).toContain("./codex/rules/goodmemory.rules");
      expect(agents).toContain("canonical enforced path");
      expect(agents).toContain("parity scaffolds");
      expect(
        agents.match(/GOODMEMORY-BOOTSTRAP:CODEX START/g)?.length ?? 0,
      ).toBe(1);

      const script = await readFile(
        join(workspace.root, ".goodmemory/bootstrap/codex-export.mjs"),
        "utf8",
      );
      expect(script).toContain('from "goodmemory"');
      expect(script).toContain('from "goodmemory/host"');
      expect(script).toContain("session-memory/current.md");
      expect(script).not.toContain('"codex-active"');
      expect(script).not.toContain("../src");
      expect(script).not.toContain("../../src");
      const actionScript = await readFile(
        join(workspace.root, ".goodmemory/bootstrap/codex-action.mjs"),
        "utf8",
      );
      expect(actionScript).toContain('from "goodmemory"');
      expect(actionScript).toContain('from "goodmemory/host"');
      expect(actionScript).toContain("resolveHostActionExecutionPlan");
      expect(actionScript).not.toContain("../src");
      expect(actionScript).not.toContain("../../src");
      const hooksConfig = await readFile(join(workspace.root, ".codex/hooks.json"), "utf8");
      expect(hooksConfig).toContain("PreToolUse");
      expect(hooksConfig).toContain("codex-action.mjs");
      const hooksToml = await readFile(join(workspace.root, ".codex/config.toml"), "utf8");
      expect(hooksToml).toContain("[features]");
      expect(hooksToml).toContain("codex_hooks = true");
      const rulesFile = await readFile(
        join(workspace.root, "codex/rules/goodmemory.rules"),
        "utf8",
      );
      expect(rulesFile).toContain('pattern = ["deploy"]');
      expect(rulesFile).toContain('pattern = ["DeepAnalyzer"]');
      expect(rulesFile).toContain('pattern = ["rm", "-rf"]');

      let storageExists = true;
      try {
        await access(join(workspace.root, ".goodmemory", "memory.sqlite"));
      } catch {
        storageExists = false;
      }
      expect(storageExists).toBe(false);

      const second = await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      const secondPayload = JSON.parse(second.stdout) as typeof payload;
      expect(
        secondPayload.changes.map(({ action, relativePath }) => ({
          action,
          relativePath,
        })),
      ).toEqual([
        { action: "unchanged", relativePath: "AGENTS.md" },
        {
          action: "unchanged",
          relativePath: ".goodmemory/bootstrap/codex-export.mjs",
        },
        {
          action: "unchanged",
          relativePath: ".goodmemory/bootstrap/codex-action.mjs",
        },
        {
          action: "unchanged",
          relativePath: ".codex/hooks.json",
        },
        {
          action: "unchanged",
          relativePath: ".codex/config.toml",
        },
        {
          action: "unchanged",
          relativePath: "codex/rules/goodmemory.rules",
        },
      ]);

      const updatedAgents = await readFile(join(workspace.root, "AGENTS.md"), "utf8");
      expect(
        updatedAgents.match(/GOODMEMORY-BOOTSTRAP:CODEX START/g)?.length ?? 0,
      ).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });

  it("merges existing repo-local Codex hook and feature config instead of replacing them", async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-bootstrap-merge");

    try {
      await writeFile(
        join(workspace.root, "AGENTS.md"),
        "# Existing Workspace Notes\n",
        "utf8",
      );
      await mkdir(join(workspace.root, ".codex"), { recursive: true });
      await writeFile(
        join(workspace.root, ".codex/hooks.json"),
        JSON.stringify(
          {
            hooks: {
              PostToolUse: [
                {
                  matcher: "Write",
                  hooks: [
                    {
                      type: "command",
                      command: "echo after-write",
                      statusMessage: "after write",
                    },
                  ],
                },
              ],
              PreToolUse: [
                {
                  matcher: "Bash",
                  hooks: [
                    {
                      type: "command",
                      command: "echo existing-bash-hook",
                      statusMessage: "keep existing bash hook",
                    },
                  ],
                },
              ],
            },
            repo: {
              preserve: true,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspace.root, ".codex/config.toml"),
        [
          "[features]",
          "experimental_feature = true",
          "",
          "[profiles.default]",
          'sandbox = "workspace-write"',
          "",
        ].join("\n"),
        "utf8",
      );

      const first = await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      expect(first.exitCode).toBe(0);

      const hooksConfig = JSON.parse(
        await readFile(join(workspace.root, ".codex/hooks.json"), "utf8"),
      ) as {
        hooks: Record<string, Array<{ hooks?: Array<{ command?: string }>; matcher?: string }>>;
        repo?: { preserve?: boolean };
      };
      expect(hooksConfig.repo?.preserve).toBe(true);
      expect(hooksConfig.hooks.PostToolUse).toHaveLength(1);
      const bashHooks = hooksConfig.hooks.PreToolUse.find(
        (entry) => entry.matcher === "Bash",
      )?.hooks;
      expect(bashHooks?.some((hook) => hook.command === "echo existing-bash-hook")).toBe(true);
      expect(
        bashHooks?.some((hook) => hook.command?.includes("codex-action.mjs")),
      ).toBe(true);

      const hooksToml = await readFile(join(workspace.root, ".codex/config.toml"), "utf8");
      expect(hooksToml).toContain("[features]");
      expect(hooksToml).toContain("experimental_feature = true");
      expect(hooksToml).toContain("codex_hooks = true");
      expect(hooksToml).toContain("[profiles.default]");
      expect(hooksToml).toContain('sandbox = "workspace-write"');

      const second = await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      expect(second.exitCode).toBe(0);
      const payload = JSON.parse(second.stdout) as {
        changes: Array<{
          action: "created" | "unchanged" | "updated";
          path: string;
          relativePath: string;
        }>;
      };
      expect(
        payload.changes.find((change) => change.relativePath === ".codex/hooks.json"),
      ).toMatchObject({
        action: "unchanged",
        relativePath: ".codex/hooks.json",
      });
      expect(
        payload.changes.find((change) => change.relativePath === ".codex/config.toml"),
      ).toMatchObject({
        action: "unchanged",
        relativePath: ".codex/config.toml",
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("requires an explicit session id for generated Codex exports", async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-bootstrap-session-required");

    try {
      await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );

      const result = await runBunScript({
        cwd: workspace.root,
        scriptPath: join(workspace.root, ".goodmemory/bootstrap/codex-export.mjs"),
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "Codex export requires --session-id <session-id> to target a real session handoff.",
      );
      await expect(
        access(join(workspace.root, ".goodmemory/hosts/codex/export-manifest.json")),
      ).rejects.toThrow();
    } finally {
      await workspace.cleanup();
    }
  });

  it("anchors generated Codex exports to the bootstrapped workspace root", async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-bootstrap-anchor");
    const caller = await createTempWorkspace("goodmemory-codex-bootstrap-caller");

    try {
      await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "workspace-a",
          "--json",
        ]),
      );
      const { scope } = await seedSQLiteMemory(
        join(workspace.root, ".goodmemory", "memory.sqlite"),
      );

      const result = await runBunScript({
        args: ["--session-id", scope.sessionId],
        cwd: caller.root,
        scriptPath: join(workspace.root, ".goodmemory/bootstrap/codex-export.mjs"),
      });

      expect(result.exitCode).toBe(0);

      const manifest = JSON.parse(
        await readFile(
          join(workspace.root, ".goodmemory/hosts/codex/export-manifest.json"),
          "utf8",
        ),
      ) as {
        artifacts: Array<{
          relativePath?: string;
        }>;
        outputRoot: string;
        scope: {
          sessionId?: string;
          workspaceId?: string;
        };
      };
      expect(manifest.outputRoot).toEndWith("/.goodmemory/hosts/codex");
      expect(manifest.outputRoot).toContain(
        (workspace.root.split("/").at(-1) ?? "goodmemory-codex-bootstrap-anchor"),
      );
      expect(manifest.scope.workspaceId).toBe("workspace-a");
      expect(manifest.scope.sessionId).toBe(scope.sessionId);

      await expect(
        access(join(caller.root, ".goodmemory/hosts/codex/export-manifest.json")),
      ).rejects.toThrow();
    } finally {
      await caller.cleanup();
      await workspace.cleanup();
    }
  });

  it(
    "generated Codex pre-tool-use hook blocks risky Bash commands and routes them to the action gate",
    async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-hook-policy");
    const sessionId = "consumer-session";
    const packageRoot = join(import.meta.dir, "../..");
    const tarballPath = await packCurrentPackage({
      outputDir: join(workspace.root, ".pack"),
      packageRoot,
    });

    try {
      await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      await writeFile(
        join(workspace.root, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-codex-hook-policy",
            private: true,
            dependencies: {
              goodmemory: `file:${tarballPath}`,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      const install = Bun.spawnSync({
        cmd: ["bun", "install"],
        cwd: workspace.root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(install.exitCode).toBe(0);
      await seedCodexActionPolicyMemory({
        sqlitePath: join(workspace.root, ".goodmemory", "memory.sqlite"),
        sessionId,
        userId: "codex-user",
        workspaceId: "codex-workspace",
        rule: "Before deploy production, run QuickCheck first.",
        evidenceExcerpt:
          "Production deploy was blocked until QuickCheck ran first.",
      });

      const result = await runBunScript({
        args: ["--hook-pre-tool-use"],
        cwd: workspace.root,
        scriptPath: join(workspace.root, ".goodmemory/bootstrap/codex-action.mjs"),
        stdin: JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: sessionId,
          turn_id: "turn-hook-1",
          tool_name: "Bash",
          tool_input: {
            command: "deploy production",
          },
        }),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
      const payload = JSON.parse(result.stdout) as {
        hookSpecificOutput: {
          hookEventName: string;
          permissionDecision: string;
          permissionDecisionReason: string;
        };
      };
      expect(payload.hookSpecificOutput.hookEventName).toBe("PreToolUse");
      expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(payload.hookSpecificOutput.permissionDecisionReason).toContain(
        'bun ./.goodmemory/bootstrap/codex-action.mjs --session-id',
      );
      expect(payload.hookSpecificOutput.permissionDecisionReason).toContain(
        "--command 'deploy production'",
      );
    } finally {
      await workspace.cleanup();
    }
    },
    20_000,
  );

  it(
    "generated Codex action gate rewrites risky commands to the recommended first step and records lineage",
    async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-action-gate");
    const sessionId = "consumer-session";
    const sqlitePath = join(workspace.root, ".goodmemory", "memory.sqlite");
    const toolsDir = join(workspace.root, "tools");
    const packageRoot = join(import.meta.dir, "../..");
    const tarballPath = await packCurrentPackage({
      outputDir: join(workspace.root, ".pack"),
      packageRoot,
    });

    try {
      await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      await writeFile(
        join(workspace.root, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-codex-action-gate",
            private: true,
            dependencies: {
              goodmemory: `file:${tarballPath}`,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      const install = Bun.spawnSync({
        cmd: ["bun", "install"],
        cwd: workspace.root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(install.exitCode).toBe(0);
      const { memory, scope } = await seedCodexActionPolicyMemory({
        sqlitePath,
        sessionId,
        userId: "codex-user",
        workspaceId: "codex-workspace",
        rule: "Before deploy production, run QuickCheck first.",
        evidenceExcerpt:
          "Production deploy was blocked until QuickCheck ran first.",
      });

      await mkdir(toolsDir, { recursive: true });
      await writeFile(
        join(toolsDir, "QuickCheck"),
        [
          "#!/usr/bin/env sh",
          `echo quickcheck >> ${JSON.stringify(join(workspace.root, "quickcheck.log"))}`,
        ].join("\n"),
        "utf8",
      );
      await chmod(join(toolsDir, "QuickCheck"), 0o755);
      await writeFile(
        join(toolsDir, "deploy"),
        [
          "#!/usr/bin/env sh",
          `echo deploy >> ${JSON.stringify(join(workspace.root, "deploy.log"))}`,
        ].join("\n"),
        "utf8",
      );
      await chmod(join(toolsDir, "deploy"), 0o755);

      const result = await runBunScript({
        args: [
          "--session-id",
          sessionId,
          "--turn-id",
          "turn-action-1",
          "--command",
          "./tools/deploy production",
          "--json",
        ],
        cwd: workspace.root,
        scriptPath: join(workspace.root, ".goodmemory/bootstrap/codex-action.mjs"),
      });

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        actionId: string;
        decision: string;
        executed: boolean;
        executedStep: string;
        originalActionDeferred: boolean;
        realizedEventParentId: string;
        rewritten: boolean;
      };
      expect(payload.decision).toBe("review_required");
      expect(payload.executed).toBe(true);
      expect(payload.executedStep).toBe("./tools/QuickCheck");
      expect(payload.rewritten).toBe(true);
      expect(payload.originalActionDeferred).toBe(true);
      expect(payload.realizedEventParentId).toBe(payload.actionId);
      const quickCheckExecuted = await access(join(workspace.root, "quickcheck.log"))
        .then(() => true)
        .catch(() => false);
      const deployExecuted = await access(join(workspace.root, "deploy.log"))
        .then(() => true)
        .catch(() => false);
      expect(quickCheckExecuted).toBe(true);
      expect(deployExecuted).toBe(false);

      const exported = await memory.exportMemory({
        scope,
        includeRuntime: true,
      });
      expect(
        exported.durable.experiences.some(
          (record) => record.traceId === payload.actionId,
        ),
      ).toBe(true);
      expect(
        exported.durable.experiences.some(
          (record) =>
            Array.isArray(record.sourceTraceIds) &&
            record.sourceTraceIds.includes(payload.actionId) &&
            record.traceId !== payload.actionId,
        ),
      ).toBe(true);
      expect(
        exported.durable.evidence.some(
          (record) => record.kind === "tool_result_excerpt",
        ),
      ).toBe(true);
    } finally {
      await workspace.cleanup();
    }
    },
    20_000,
  );

  it(
    "generated Codex action gate ignores arbitrary SHELL executables and still runs bridged commands on a supported shell",
    async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-action-gate-shell");
    const packageRoot = join(import.meta.dir, "../..");
    const stubShellPath = join(workspace.root, "fake-shell");
    const tarballPath = await packCurrentPackage({
      outputDir: join(workspace.root, ".pack"),
      packageRoot,
    });

    try {
      await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      await writeFile(
        join(workspace.root, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-codex-action-gate-shell",
            private: true,
            dependencies: {
              goodmemory: `file:${tarballPath}`,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      const install = Bun.spawnSync({
        cmd: ["bun", "install"],
        cwd: workspace.root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(install.exitCode).toBe(0);

      await writeFile(
        stubShellPath,
        [
          "#!/usr/bin/env sh",
          "exit 0",
        ].join("\n"),
        "utf8",
      );
      await chmod(stubShellPath, 0o755);

      const result = await runBunScript({
        args: [
          "--session-id",
          "consumer-session",
          "--command",
          "echo hi > proof.txt",
          "--json",
        ],
        cwd: workspace.root,
        env: {
          SHELL: stubShellPath,
        },
        scriptPath: join(workspace.root, ".goodmemory/bootstrap/codex-action.mjs"),
      });

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        executed: boolean;
        exitCode: number;
        rewritten: boolean;
      };
      expect(payload.executed).toBe(true);
      expect(payload.exitCode).toBe(0);
      expect(payload.rewritten).toBe(false);
      expect(await readFile(join(workspace.root, "proof.txt"), "utf8")).toBe("hi\n");
    } finally {
      await workspace.cleanup();
    }
    },
    20_000,
  );

  it(
    "generated Codex action gate fails closed when the rewritten first step is not executable on the shell bridge",
    async () => {
    const workspace = await createTempWorkspace("goodmemory-codex-action-gate-fail-closed");
    const sessionId = "consumer-session";
    const sqlitePath = join(workspace.root, ".goodmemory", "memory.sqlite");
    const packageRoot = join(import.meta.dir, "../..");
    const tarballPath = await packCurrentPackage({
      outputDir: join(workspace.root, ".pack"),
      packageRoot,
    });

    try {
      await withCwd(workspace.root, async () =>
        runCLI([
          "codex",
          "bootstrap",
          "--user-id",
          "codex-user",
          "--workspace-id",
          "codex-workspace",
          "--json",
        ]),
      );
      await writeFile(
        join(workspace.root, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-codex-action-gate-fail-closed",
            private: true,
            dependencies: {
              goodmemory: `file:${tarballPath}`,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      const install = Bun.spawnSync({
        cmd: ["bun", "install"],
        cwd: workspace.root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(install.exitCode).toBe(0);
      await seedCodexActionPolicyMemory({
        sqlitePath,
        sessionId,
        userId: "codex-user",
        workspaceId: "codex-workspace",
        rule: "Rather than DeepAnalyzer, use QuickCheck first.",
        evidenceExcerpt:
          "DeepAnalyzer detailed scan failed because QuickCheck had not run first.",
      });

      const result = await runBunScript({
        args: [
          "--session-id",
          sessionId,
          "--turn-id",
          "turn-action-fail-closed",
          "--command",
          "DeepAnalyzer --detailed",
          "--json",
        ],
        cwd: workspace.root,
        scriptPath: join(workspace.root, ".goodmemory/bootstrap/codex-action.mjs"),
      });

      expect(result.exitCode).toBe(2);
      const payload = JSON.parse(result.stdout) as {
        decision: string;
        executed: boolean;
        recommendedFirstStep?: string;
        rewritten: boolean;
      };
      expect(payload.decision).toBe("review_required");
      expect(payload.executed).toBe(false);
      expect(payload.recommendedFirstStep).toBe("run QuickCheck first");
      expect(payload.rewritten).toBe(true);
      const quickCheckExecuted = await access(join(workspace.root, "quickcheck.log"))
        .then(() => true)
        .catch(() => false);
      expect(quickCheckExecuted).toBe(false);
    } finally {
      await workspace.cleanup();
    }
    },
    20_000,
  );

  it("bootstraps Claude wiring with a derived workspace id", async () => {
    const workspace = await createTempWorkspace("goodmemory-claude-bootstrap");

    try {
      const result = await withCwd(workspace.root, async () =>
        runCLI(["claude", "bootstrap", "--user-id", "claude-user", "--json"]),
      );

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        changes: Array<{
          action: "created" | "unchanged" | "updated";
          relativePath: string;
        }>;
        host: string;
        workspaceId: string;
      };
      const expectedWorkspaceId =
        workspace.root.split("/").at(-1) ?? "goodmemory-claude-bootstrap";
      expect(payload.host).toBe("claude");
      expect(payload.workspaceId).toBe(expectedWorkspaceId);
      expect(
        payload.changes.map(({ action, relativePath }) => ({
          action,
          relativePath,
        })),
      ).toEqual([
        { action: "created", relativePath: "CLAUDE.md" },
        {
          action: "created",
          relativePath: ".goodmemory/bootstrap/claude-export.mjs",
        },
      ]);

      const instructions = await readFile(join(workspace.root, "CLAUDE.md"), "utf8");
      expect(instructions).toContain("## GoodMemory Claude Code Bootstrap");
      expect(instructions).toContain("bun ./.goodmemory/bootstrap/claude-export.mjs");
      expect(instructions).toContain(".goodmemory/hosts/claude/user.md");
      expect(
        instructions.match(/GOODMEMORY-BOOTSTRAP:CLAUDE START/g)?.length ?? 0,
      ).toBe(1);

      const script = await readFile(
        join(workspace.root, ".goodmemory/bootstrap/claude-export.mjs"),
        "utf8",
      );
      expect(script).toContain('from "goodmemory"');
      expect(script).toContain('from "goodmemory/host"');
      expect(script).not.toContain('"claude-active"');
      expect(script).toContain('readTextFlag(flags, "session-id")');
      expect(script).not.toContain("../src");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("goodmemory cli installed host config", () => {
  it("installs and uninstalls Codex global middleware config idempotently", async () => {
    const home = await createTempWorkspace("goodmemory-codex-install-home");

    try {
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          const first = await runCLI([
            "install",
            "codex",
            "--user-id",
            "codex-user",
            "--json",
          ]);
          expect(first.exitCode).toBe(0);
          const firstPayload = JSON.parse(first.stdout) as {
            changes: Array<{
              action: "created" | "unchanged" | "updated";
              relativePath: string;
            }>;
            configPath: string;
            host: string;
            memoryPath: string;
            userId: string;
          };
          expect(firstPayload.host).toBe("codex");
          expect(firstPayload.userId).toBe("codex-user");
          expect(firstPayload.memoryPath).toBe(join(home.root, ".goodmemory/memory.sqlite"));
          expect(
            firstPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            {
              action: "created",
              relativePath: "codex.json",
            },
            {
              action: "created",
              relativePath: ".codex/config.toml",
            },
          ]);

          const config = JSON.parse(
            await readFile(join(home.root, ".goodmemory/codex.json"), "utf8"),
          ) as {
            host: string;
            storage: { path: string; provider: string };
            userId: string;
          };
          expect(config.host).toBe("codex");
          expect(config.userId).toBe("codex-user");
          expect(config.storage.path).toBe(join(home.root, ".goodmemory/memory.sqlite"));
          expect(
            await readFile(join(home.root, ".codex/config.toml"), "utf8"),
          ).toContain('command = "goodmemory-mcp"');

          const second = await runCLI([
            "install",
            "codex",
            "--user-id",
            "codex-user",
            "--json",
          ]);
          expect(second.exitCode).toBe(0);
          const secondPayload = JSON.parse(second.stdout) as {
            changes: Array<{
              action: "created" | "unchanged" | "updated";
              relativePath: string;
            }>;
          };
          expect(
            secondPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            {
              action: "unchanged",
              relativePath: "codex.json",
            },
            {
              action: "unchanged",
              relativePath: ".codex/config.toml",
            },
          ]);

          const uninstall = await runCLI(["uninstall", "codex", "--json"]);
          expect(uninstall.exitCode).toBe(0);
          const uninstallPayload = JSON.parse(uninstall.stdout) as {
            changes: Array<{
              action: "deleted" | "unchanged";
              relativePath: string;
            }>;
          };
          expect(
            uninstallPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            {
              action: "deleted",
              relativePath: "codex.json",
            },
            {
              action: "deleted",
              relativePath: ".codex/config.toml",
            },
          ]);
          await expect(access(join(home.root, ".goodmemory/codex.json"))).rejects.toThrow();
          await expect(access(join(home.root, ".codex/config.toml"))).rejects.toThrow();
        },
      );
    } finally {
      await home.cleanup();
    }
  });

  it("requires a matching global install before enabling repo-local opt-in", async () => {
    const home = await createTempWorkspace("goodmemory-codex-enable-home");
    const workspace = await createTempWorkspace("goodmemory-codex-enable-missing-install");

    try {
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          const result = await runCLI([
            "enable",
            "codex",
            "--workspace-root",
            workspace.root,
            "--json",
          ]);

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("Run 'goodmemory install codex' first");
        },
      );
    } finally {
      await home.cleanup();
      await workspace.cleanup();
    }
  });

  it("enables and disables Codex repo opt-in without losing existing repo notes", async () => {
    const home = await createTempWorkspace("goodmemory-codex-enable-home");
    const workspace = await createTempWorkspace("goodmemory-codex-enable");
    const originalInstructions = "\n# Existing Notes\n\n";

    try {
      await writeFile(join(workspace.root, "AGENTS.md"), originalInstructions, "utf8");

      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          const install = await runCLI([
            "install",
            "codex",
            "--user-id",
            "codex-user",
            "--json",
          ]);
          expect(install.exitCode).toBe(0);

          const first = await runCLI([
            "enable",
            "codex",
            "--workspace-id",
            "codex-workspace",
            "--workspace-root",
            workspace.root,
            "--json",
          ]);
          expect(first.exitCode).toBe(0);
          const firstPayload = JSON.parse(first.stdout) as {
            changes: Array<{
              action: "created" | "unchanged" | "updated";
              relativePath: string;
            }>;
            host: string;
            workspaceId: string;
          };
          expect(firstPayload.host).toBe("codex");
          expect(firstPayload.workspaceId).toBe("codex-workspace");
          expect(
            firstPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            { action: "created", relativePath: ".goodmemory/codex.json" },
            { action: "updated", relativePath: "AGENTS.md" },
          ]);

          const firstConfig = JSON.parse(
            await readFile(join(workspace.root, ".goodmemory/codex.json"), "utf8"),
          ) as {
            enabled: boolean;
            workspaceId: string;
          };
          expect(firstConfig.enabled).toBe(true);
          expect(firstConfig.workspaceId).toBe("codex-workspace");
          expect(await readFile(join(workspace.root, "AGENTS.md"), "utf8")).toContain(
            "GOODMEMORY-INSTALL:CODEX START",
          );

          const second = await runCLI([
            "enable",
            "codex",
            "--workspace-id",
            "codex-workspace",
            "--workspace-root",
            workspace.root,
            "--json",
          ]);
          expect(second.exitCode).toBe(0);
          const secondPayload = JSON.parse(second.stdout) as {
            changes: Array<{
              action: "created" | "unchanged" | "updated";
              relativePath: string;
            }>;
          };
          expect(
            secondPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            { action: "unchanged", relativePath: ".goodmemory/codex.json" },
            { action: "unchanged", relativePath: "AGENTS.md" },
          ]);

          const disable = await runCLI([
            "disable",
            "codex",
            "--workspace-root",
            workspace.root,
            "--json",
          ]);
          expect(disable.exitCode).toBe(0);
          const disablePayload = JSON.parse(disable.stdout) as {
            changes: Array<{
              action: "deleted" | "unchanged" | "updated";
              relativePath: string;
            }>;
          };
          expect(
            disablePayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            { action: "updated", relativePath: ".goodmemory/codex.json" },
            { action: "updated", relativePath: "AGENTS.md" },
          ]);
          const disabledConfig = JSON.parse(
            await readFile(join(workspace.root, ".goodmemory/codex.json"), "utf8"),
          ) as {
            enabled: boolean;
            workspaceId: string;
          };
          expect(disabledConfig.enabled).toBe(false);
          expect(disabledConfig.workspaceId).toBe("codex-workspace");
          expect(await readFile(join(workspace.root, "AGENTS.md"), "utf8")).toBe(
            originalInstructions,
          );
        },
      );
    } finally {
      await home.cleanup();
      await workspace.cleanup();
    }
  });

  it("installs Claude global config and keeps disable/uninstall parity", async () => {
    const home = await createTempWorkspace("goodmemory-claude-install-home");
    const workspace = await createTempWorkspace("goodmemory-claude-enable");

    try {
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          const install = await runCLI([
            "install",
            "claude",
            "--user-id",
            "claude-user",
            "--json",
          ]);
          expect(install.exitCode).toBe(0);
          const installPayload = JSON.parse(install.stdout) as {
            changes: Array<{
              action: "created" | "unchanged" | "updated";
              relativePath: string;
            }>;
            host: string;
          };
          expect(installPayload.host).toBe("claude");
          expect(
            installPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            {
              action: "created",
              relativePath: "claude.json",
            },
            {
              action: "created",
              relativePath: ".claude.json",
            },
          ]);
        },
      );
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          const enable = await runCLI([
            "enable",
            "claude",
            "--workspace-root",
            workspace.root,
            "--json",
          ]);
          expect(enable.exitCode).toBe(0);
          const enablePayload = JSON.parse(enable.stdout) as {
            changes: Array<{
              action: "created" | "unchanged" | "updated";
              relativePath: string;
            }>;
            host: string;
          };
          expect(enablePayload.host).toBe("claude");
          expect(
            enablePayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            { action: "created", relativePath: ".goodmemory/claude.json" },
            { action: "created", relativePath: "CLAUDE.md" },
          ]);
          expect(await readFile(join(workspace.root, "CLAUDE.md"), "utf8")).toContain(
            "GOODMEMORY-INSTALL:CLAUDE START",
          );

          const disable = await runCLI([
            "disable",
            "claude",
            "--workspace-root",
            workspace.root,
            "--json",
          ]);
          expect(disable.exitCode).toBe(0);
          const disablePayload = JSON.parse(disable.stdout) as {
            changes: Array<{
              action: "deleted" | "unchanged" | "updated";
              relativePath: string;
            }>;
          };
          expect(
            disablePayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            { action: "updated", relativePath: ".goodmemory/claude.json" },
            { action: "deleted", relativePath: "CLAUDE.md" },
          ]);

          const uninstall = await runCLI(["uninstall", "claude", "--json"]);
          expect(uninstall.exitCode).toBe(0);
          const uninstallPayload = JSON.parse(uninstall.stdout) as {
            changes: Array<{
              action: "deleted" | "unchanged" | "updated";
              relativePath: string;
            }>;
          };
          expect(
            uninstallPayload.changes.map(({ action, relativePath }) => ({
              action,
              relativePath,
            })),
          ).toEqual([
            { action: "deleted", relativePath: "claude.json" },
            { action: "deleted", relativePath: ".claude.json" },
          ]);
        },
      );
    } finally {
      await home.cleanup();
      await workspace.cleanup();
    }
  });

  it("runs the Codex user-prompt-submit hook and emits additionalContext JSON", async () => {
    const home = await createTempWorkspace("goodmemory-codex-hook-home");
    const workspace = await createTempWorkspace("goodmemory-codex-hook-runtime");
    const cliScript = join(import.meta.dir, "../../scripts/goodmemory-cli.ts");

    try {
      await mkdir(join(home.root, ".goodmemory"), { recursive: true });
      await mkdir(join(workspace.root, ".goodmemory"), { recursive: true });
      await writeFile(
        join(home.root, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: false,
            host: "codex",
            maxTokens: 512,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(home.root, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "cli-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspace.root, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            enabled: true,
            host: "codex",
            version: 1,
            workspaceId: "workspace-a",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await seedSQLiteMemory(join(home.root, ".goodmemory/memory.sqlite"));

      const result = await runBunScript({
        args: ["codex", "hook", "user-prompt-submit"],
        cwd: workspace.root,
        env: {
          GOODMEMORY_HOME: home.root,
        },
        scriptPath: cliScript,
        stdin: JSON.stringify({
          cwd: workspace.root,
          hook_event_name: "UserPromptSubmit",
          prompt: "Check the release runbook before editing files.",
          session_id: "hook-session-1",
          turn_id: "turn-hook-1",
        }),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
      const payload = JSON.parse(result.stdout) as {
        hookSpecificOutput: {
          additionalContext: string;
          hookEventName: string;
        };
      };
      expect(payload.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
      expect(payload.hookSpecificOutput.additionalContext).toContain(
        "Developer memory notes",
      );
      expect(payload.hookSpecificOutput.additionalContext).toContain(
        "release quality program",
      );
    } finally {
      await home.cleanup();
      await workspace.cleanup();
    }
  });

  it("runs the Claude session-start hook fail-open with a debug systemMessage when the repo is disabled", async () => {
    const home = await createTempWorkspace("goodmemory-claude-hook-home");
    const workspace = await createTempWorkspace("goodmemory-claude-hook-runtime");
    const cliScript = join(import.meta.dir, "../../scripts/goodmemory-cli.ts");

    try {
      await mkdir(join(home.root, ".goodmemory"), { recursive: true });
      await mkdir(join(workspace.root, ".goodmemory"), { recursive: true });
      await writeFile(
        join(home.root, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            debug: true,
            host: "claude",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(home.root, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "cli-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspace.root, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            debug: true,
            enabled: false,
            host: "claude",
            version: 1,
            workspaceId: "workspace-a",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await runBunScript({
        args: ["claude", "hook", "session-start"],
        cwd: workspace.root,
        env: {
          GOODMEMORY_HOME: home.root,
        },
        scriptPath: cliScript,
        stdin: JSON.stringify({
          cwd: workspace.root,
          hook_event_name: "SessionStart",
          session_id: "hook-session-2",
          source: "startup",
        }),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("");
      const payload = JSON.parse(result.stdout) as { systemMessage: string };
      expect(payload.systemMessage).toBe(
        "GoodMemory claude session-start hook skipped: disabled.",
      );
    } finally {
      await home.cleanup();
      await workspace.cleanup();
    }
  });

  it("fails open when hook stdin is malformed JSON", async () => {
    const workspace = await createTempWorkspace("goodmemory-hook-invalid-stdin");
    const cliScript = join(import.meta.dir, "../../scripts/goodmemory-cli.ts");

    try {
      const result = await runBunScript({
        args: ["codex", "hook", "session-start"],
        cwd: workspace.root,
        scriptPath: cliScript,
        stdin: "{invalid",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
      expect(result.stderr.trim()).toBe("");
    } finally {
      await workspace.cleanup();
    }
  });

  it("fails open when hook stdin is empty", async () => {
    const workspace = await createTempWorkspace("goodmemory-hook-empty-stdin");
    const cliScript = join(import.meta.dir, "../../scripts/goodmemory-cli.ts");

    try {
      const result = await runBunScript({
        args: ["codex", "hook", "session-start"],
        cwd: workspace.root,
        scriptPath: cliScript,
        stdin: "",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
      expect(result.stderr.trim()).toBe("");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("goodmemory cli root commands", () => {
  it("uses a non-mutating postgres probe for read-only auto storage", async () => {
    const calls: string[] = [];

    const storage = await resolveStorageConfig(
      {
        "storage-url": "postgres://localhost:5432/goodmemory",
      },
      {
        readOnlyStorage: true,
      },
      {
        canBootstrapPostgresStorageBackend: async () => {
          calls.push("bootstrap");
          return true;
        },
        probeReadOnlyPostgresStorageBackend: async () => {
          calls.push("read");
          return "readable";
        },
        pathExists: async () => false,
      },
    );

    expect(storage).toEqual({
      provider: "postgres",
      url: "postgres://localhost:5432/goodmemory",
      displayValue: "configured",
    });
    expect(calls).toEqual(["read"]);
  });

  it("uses the bootstrap probe for writable auto postgres resolution", async () => {
    const calls: string[] = [];

    const storage = await resolveStorageConfig(
      {
        "storage-url": "postgres://localhost:5432/goodmemory",
      },
      undefined,
      {
        canBootstrapPostgresStorageBackend: async () => {
          calls.push("bootstrap");
          return true;
        },
        probeReadOnlyPostgresStorageBackend: async () => {
          calls.push("read");
          return "readable";
        },
        mkdir: async () => undefined,
        pathExists: async () => false,
      },
    );

    expect(storage).toEqual({
      provider: "postgres",
      url: "postgres://localhost:5432/goodmemory",
      displayValue: "configured",
    });
    expect(calls).toEqual(["bootstrap"]);
  });

  it("reports read-only postgres probe failures without bootstrapping durable state", async () => {
    await expect(
      resolveStorageConfig(
        {
          "storage-url": "postgres://localhost:5432/goodmemory",
        },
        {
          readOnlyStorage: true,
        },
        {
          canBootstrapPostgresStorageBackend: async () => true,
          probeReadOnlyPostgresStorageBackend: async () => {
            throw new Error("permission denied");
          },
          pathExists: async () => false,
        },
      ),
    ).rejects.toThrow("without mutating durable authority");
  });

  it("fails closed when the read-only postgres probe is inconclusive", async () => {
    const calls: string[] = [];

    await expect(
      resolveStorageConfig(
        {
          "storage-url": "postgres://localhost:5432/goodmemory",
        },
        {
          readOnlyStorage: true,
        },
        {
          canBootstrapPostgresStorageBackend: async () => {
            calls.push("bootstrap");
            return true;
          },
          probeReadOnlyPostgresStorageBackend: async () => {
            calls.push("read");
            return "inconclusive";
          },
          pathExists: async () => {
            calls.push("sqlite");
            return true;
          },
        },
      ),
    ).rejects.toThrow("without mutating durable authority");

    expect(calls).toEqual(["read"]);
  });

  it("allows sqlite fallback when the read-only postgres probe proves postgres is unusable", async () => {
    const calls: string[] = [];

    const storage = await resolveStorageConfig(
      {
        "storage-url": "postgres://localhost:5432/goodmemory",
      },
      {
        readOnlyStorage: true,
      },
      {
        canBootstrapPostgresStorageBackend: async () => {
          calls.push("bootstrap");
          return true;
        },
        probeReadOnlyPostgresStorageBackend: async () => {
          calls.push("read");
          return "unusable";
        },
        pathExists: async () => {
          calls.push("sqlite");
          return true;
        },
      },
    );

    expect(storage.provider).toBe("sqlite");
    expect(calls).toEqual(["read", "sqlite"]);
  });

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

  it("trace supports ignore-memory for read-only policy diagnostics", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-trace-ignore-memory");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      const { scope } = await seedSQLiteMemory(sqlitePath);

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
        "--ignore-memory",
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Storage: memory (ignored (--ignore-memory))");
      expect(result.stdout).toContain("Hits");
      expect(result.stdout).toContain("Returned Candidate Traces");
      expect(result.stdout).toContain("Suppressed Candidate Traces");
      expect(result.stdout).toContain("Policy Applied");
      expect(result.stdout).toContain("- ignore_memory");
      expect(result.stdout).toContain("- none");
    } finally {
      await workspace.cleanup();
    }
  });

  it("trace exposes structured diagnostics with --json", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-root-trace-json");

    try {
      const sqlitePath = join(workspace.root, "memory.sqlite");
      const { scope } = await seedSQLiteMemory(sqlitePath);

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
        "--json",
        "--storage-provider",
        "sqlite",
        "--storage-url",
        sqlitePath,
      ]);

      const payload = JSON.parse(result.stdout) as {
        candidateTraceCount: number;
        candidateTraces: unknown[];
        hits: unknown[];
        policyApplied: string[];
        routingDecision: {
          strategy: string;
        };
        verificationHints: unknown[];
      };

      expect(result.exitCode).toBe(0);
      expect(payload.routingDecision.strategy).toBe("rules-only");
      expect(payload.hits.length).toBeGreaterThan(0);
      expect(payload.candidateTraces.length).toBeGreaterThan(0);
      expect(payload.candidateTraceCount).toBe(payload.candidateTraces.length);
      expect(payload.verificationHints.length).toBeGreaterThan(0);
      expect(Array.isArray(payload.policyApplied)).toBe(true);
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

  it("remember writes durable memory through explicit scope flags and default sqlite storage", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-remember-default-sqlite");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const result = await runCLI([
        "remember",
        "--user-id",
        "write-user",
        "--workspace-id",
        "workspace-a",
        "--session-id",
        "write-session",
        "--message",
        "Remember that the deploy is blocked on smoke verification.",
        "--json",
      ]);
      const payload = JSON.parse(result.stdout) as {
        accepted: number;
        scope: {
          sessionId?: string;
          userId: string;
          workspaceId?: string;
        };
        storage: {
          provider: string;
        };
      };

      expect(result.exitCode).toBe(0);
      expect(payload.accepted).toBeGreaterThan(0);
      expect(payload.scope).toEqual({
        sessionId: "write-session",
        userId: "write-user",
        workspaceId: "workspace-a",
      });
      expect(payload.storage.provider).toBe("sqlite");

      const stats = await runCLI([
        "stats",
        "--user-id",
        "write-user",
        "--workspace-id",
        "workspace-a",
        "--session-id",
        "write-session",
        "--json",
      ]);
      const statsPayload = JSON.parse(stats.stdout) as {
        counts: {
          facts: number;
        };
      };

      expect(stats.exitCode).toBe(0);
      expect(statsPayload.counts.facts).toBeGreaterThan(0);
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });

  it("feedback derives installed-host defaults and is recalled through the host hook path", async () => {
    const home = await createTempWorkspace("goodmemory-feedback-host-home");
    const workspace = await createTempWorkspace("goodmemory-feedback-host-workspace");
    const cliScript = join(import.meta.dir, "../../scripts/goodmemory-cli.ts");

    try {
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          expect(
            (await runCLI([
              "install",
              "codex",
              "--user-id",
              "codex-user",
            ])).exitCode,
          ).toBe(0);
          expect(
            (await runCLI([
              "enable",
              "codex",
              "--workspace-id",
              "workspace-a",
              "--workspace-root",
              workspace.root,
            ])).exitCode,
          ).toBe(0);

          const feedback = await runCLI([
            "feedback",
            "--host",
            "codex",
            "--workspace-root",
            workspace.root,
            "--session-id",
            "write-session",
            "--signal",
            "Use short next-step bullets in coding summaries.",
            "--json",
          ]);
          const payload = JSON.parse(feedback.stdout) as {
            accepted: boolean;
            kind?: string;
            memoryId?: string;
            scope: {
              agentId?: string;
              sessionId?: string;
              userId: string;
              workspaceId?: string;
            };
            storage: {
              provider: string;
            };
          };

          expect(feedback.exitCode).toBe(0);
          expect(payload.accepted).toBe(true);
          expect(payload.kind).toBeDefined();
          expect(payload.memoryId).toBeDefined();
          expect(payload.scope).toEqual({
            agentId: "codex",
            sessionId: "write-session",
            userId: "codex-user",
            workspaceId: "workspace-a",
          });
          expect(payload.storage.provider).toBe("sqlite");

          const hook = await runBunScript({
            args: ["codex", "hook", "user-prompt-submit"],
            cwd: workspace.root,
            env: {
              GOODMEMORY_HOME: home.root,
            },
            scriptPath: cliScript,
            stdin: JSON.stringify({
              cwd: workspace.root,
              prompt: "Summarize what style I prefer before you answer.",
              session_id: "write-session",
            }),
          });

          expect(hook.exitCode).toBe(0);
          expect(hook.stderr.trim()).toBe("");
          expect(hook.stdout).toContain("Use short next-step bullets in coding summaries.");
        },
      );
    } finally {
      await workspace.cleanup();
      await home.cleanup();
    }
  });

  it("host-derived write commands require repo opt-in before using installed-host defaults", async () => {
    const home = await createTempWorkspace("goodmemory-write-host-missing-enable-home");
    const workspace = await createTempWorkspace("goodmemory-write-host-missing-enable-workspace");

    try {
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          expect(
            (await runCLI([
              "install",
              "codex",
              "--user-id",
              "codex-user",
            ])).exitCode,
          ).toBe(0);

          const result = await runCLI([
            "feedback",
            "--host",
            "codex",
            "--workspace-root",
            workspace.root,
            "--session-id",
            "write-session",
            "--signal",
            "Use short next-step bullets in coding summaries.",
          ]);

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("Run 'goodmemory enable codex --workspace-root");
        },
      );
    } finally {
      await workspace.cleanup();
      await home.cleanup();
    }
  });

  it("forget removes a host-derived memory id from the installed-host storage path", async () => {
    const home = await createTempWorkspace("goodmemory-forget-host-home");
    const workspace = await createTempWorkspace("goodmemory-forget-host-workspace");

    try {
      await withEnv(
        {
          GOODMEMORY_HOME: home.root,
        },
        async () => {
          expect(
            (await runCLI([
              "install",
              "codex",
              "--user-id",
              "codex-user",
            ])).exitCode,
          ).toBe(0);
          expect(
            (await runCLI([
              "enable",
              "codex",
              "--workspace-id",
              "workspace-a",
              "--workspace-root",
              workspace.root,
            ])).exitCode,
          ).toBe(0);

          const feedback = await runCLI([
            "feedback",
            "--host",
            "codex",
            "--workspace-root",
            workspace.root,
            "--workspace-id",
            "workspace-a",
            "--session-id",
            "write-session",
            "--signal",
            "Use numbered checklists for deploy updates.",
            "--json",
          ]);
          const feedbackPayload = JSON.parse(feedback.stdout) as {
            memoryId?: string;
          };

          expect(feedback.exitCode).toBe(0);
          expect(feedbackPayload.memoryId).toBeDefined();

          const forgotten = await runCLI([
            "forget",
            "--host",
            "codex",
            "--workspace-root",
            workspace.root,
            "--workspace-id",
            "workspace-a",
            "--session-id",
            "write-session",
            "--memory-id",
            String(feedbackPayload.memoryId),
            "--json",
          ]);
          const forgottenPayload = JSON.parse(forgotten.stdout) as {
            forgotten: boolean;
            scope: {
              agentId?: string;
              sessionId?: string;
              userId: string;
              workspaceId?: string;
            };
          };

          expect(forgotten.exitCode).toBe(0);
          expect(forgottenPayload.forgotten).toBe(true);
          expect(forgottenPayload.scope).toEqual({
            agentId: "codex",
            sessionId: "write-session",
            userId: "codex-user",
            workspaceId: "workspace-a",
          });

          const stats = await runCLI([
            "stats",
            "--user-id",
            "codex-user",
            "--workspace-id",
            "workspace-a",
            "--agent-id",
            "codex",
            "--session-id",
            "write-session",
            "--storage-provider",
            "sqlite",
            "--storage-url",
            join(home.root, ".goodmemory", "memory.sqlite"),
            "--json",
          ]);
          const statsPayload = JSON.parse(stats.stdout) as {
            counts: {
              feedback: number;
            };
          };

          expect(stats.exitCode).toBe(0);
          expect(statsPayload.counts.feedback).toBe(0);
        },
      );
    } finally {
      await workspace.cleanup();
      await home.cleanup();
    }
  });

  it("forget supports deleting a full scoped target with --all", async () => {
    const workspace = await createTempWorkspace("goodmemory-forget-all");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      expect(
        (
          await runCLI([
            "remember",
            "--user-id",
            "forget-user",
            "--workspace-id",
            "workspace-a",
            "--session-id",
            "forget-session",
            "--message",
            "Remember that the deploy is blocked on smoke verification.",
          ])
        ).exitCode,
      ).toBe(0);
      expect(
        (
          await runCLI([
            "feedback",
            "--user-id",
            "forget-user",
            "--workspace-id",
            "workspace-a",
            "--session-id",
            "forget-session",
            "--signal",
            "Keep coding summaries short and list explicit next steps.",
          ])
        ).exitCode,
      ).toBe(0);

      const forgotten = await runCLI([
        "forget",
        "--all",
        "--user-id",
        "forget-user",
        "--workspace-id",
        "workspace-a",
        "--session-id",
        "forget-session",
        "--json",
      ]);
      const forgottenPayload = JSON.parse(forgotten.stdout) as {
        deleted: {
          facts: number;
          feedback: number;
        };
      };

      expect(forgotten.exitCode).toBe(0);
      expect(forgottenPayload.deleted.facts).toBeGreaterThan(0);
      expect(forgottenPayload.deleted.feedback).toBeGreaterThan(0);

      const stats = await runCLI([
        "stats",
        "--user-id",
        "forget-user",
        "--workspace-id",
        "workspace-a",
        "--session-id",
        "forget-session",
        "--json",
      ]);
      const statsPayload = JSON.parse(stats.stdout) as {
        counts: {
          facts: number;
          feedback: number;
        };
      };

      expect(stats.exitCode).toBe(0);
      expect(statsPayload.counts.facts).toBe(0);
      expect(statsPayload.counts.feedback).toBe(0);
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

  it("trace --ignore-memory bypasses default sqlite resolution in an empty workspace", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli-trace-ignore-memory-missing-store");
    const previousCwd = process.cwd();

    try {
      process.chdir(workspace.root);

      const result = await runCLI([
        "trace",
        "--user-id",
        "review-user",
        "--query",
        "What should I do next?",
        "--ignore-memory",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Storage: memory (ignored (--ignore-memory))");
      expect(result.stdout).toContain("Policy Applied");
      expect(result.stdout).toContain("- ignore_memory");
      await expect(
        access(join(workspace.root, ".goodmemory", "memory.sqlite")),
      ).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
      await workspace.cleanup();
    }
  });
});
