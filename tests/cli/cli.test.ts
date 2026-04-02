import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace } from "../../src/testing/utils";
import { persistEvalArtifacts, aggregateJudgedCases } from "../../src/eval/reporting";
import type { EvalAnswerPackage } from "../../src/eval/runners";
import type { JudgeResult } from "../../src/eval/judge";
import {
  runCLI,
} from "../../src/cli";

function buildAnswerPackage(
  caseId: string,
  mode: "baseline" | "goodmemory",
): EvalAnswerPackage {
  return {
    mode,
    personaId: caseId,
    scenarioId: `scenario-${caseId}`,
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
            episodes: [],
            workingMemory: null,
            journal: null,
            hits: [
              {
                id: "ref-1",
                type: "reference",
                reason: "semantic_reference",
                sourceMethod: "explicit",
              },
            ],
            verificationHints: [],
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
              recallTokenCount: 12,
            }
          : null,
    },
  };
}

function buildJudgeResult(): JudgeResult {
  return {
    winner: "goodmemory",
    scores: {
      identity_understanding: 9,
      history_continuation: 9,
      factual_alignment: 8,
      relevance: 9,
    },
    baseline_scores: {
      identity_understanding: 4,
      history_continuation: 4,
      factual_alignment: 5,
      relevance: 5,
    },
    goodmemory_scores: {
      identity_understanding: 9,
      history_continuation: 9,
      factual_alignment: 8,
      relevance: 9,
    },
    reasoning: "comparison complete",
    failure_tags: [],
  };
}

describe("goodmemory cli", () => {
  it("inspect returns a human-readable case summary", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases = [
        {
          caseId: "case-1",
          baseline: buildAnswerPackage("case-1", "baseline"),
          goodmemory: buildAnswerPackage("case-1", "goodmemory"),
          judge: buildJudgeResult(),
        },
      ];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
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

      expect(result.stdout).toContain("Case: case-1");
      expect(result.stdout).toContain("Winner: goodmemory");
      expect(result.stdout).toContain("References: 1");
    } finally {
      await workspace.cleanup();
    }
  });

  it("trace returns recall and write details", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases = [
        {
          caseId: "case-1",
          baseline: buildAnswerPackage("case-1", "baseline"),
          goodmemory: buildAnswerPackage("case-1", "goodmemory"),
          judge: buildJudgeResult(),
        },
      ];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
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
      expect(result.stdout).toContain("explicit_reference");
      expect(result.stdout).toContain("Recall Hits");
      expect(result.stdout).toContain("semantic_reference");
    } finally {
      await workspace.cleanup();
    }
  });

  it("export copies a case artifact to a target path", async () => {
    const workspace = await createTempWorkspace("goodmemory-cli");

    try {
      const outputDir = join(workspace.root, "reports");
      const exportPath = join(workspace.root, "exported-case.json");
      const cases = [
        {
          caseId: "case-1",
          baseline: buildAnswerPackage("case-1", "baseline"),
          goodmemory: buildAnswerPackage("case-1", "goodmemory"),
          judge: buildJudgeResult(),
        },
      ];
      const summary = aggregateJudgedCases(cases);
      const persisted = await persistEvalArtifacts({
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
