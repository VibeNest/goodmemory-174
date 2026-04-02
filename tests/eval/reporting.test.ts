import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
): EvalAnswerPackage {
  return {
    mode,
    personaId: caseId,
    scenarioId: `scenario-${caseId}`,
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
              recallTokenCount: 8,
            }
          : null,
    },
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
      identity_understanding: Math.max(7, goodmemoryHistory),
      history_continuation: goodmemoryHistory,
      factual_alignment: 8,
      relevance: 8,
    },
    baseline_scores: {
      identity_understanding: 6,
      history_continuation: baselineHistory,
      factual_alignment: 6,
      relevance: 6,
    },
    goodmemory_scores: {
      identity_understanding: 9,
      history_continuation: goodmemoryHistory,
      factual_alignment: 8,
      relevance: 8,
    },
    reasoning: "comparison complete",
    failure_tags: failureTags,
  };
}

describe("eval reporting", () => {
  it("aggregates suite scores and uplift from judged cases", () => {
    const summary = aggregateJudgedCases([
      {
        caseId: "case-1",
        baseline: buildAnswerPackage("case-1", "baseline", "baseline-1"),
        goodmemory: buildAnswerPackage("case-1", "goodmemory", "goodmemory-1"),
        judge: buildJudgeResult("goodmemory", 4, 9),
      },
      {
        caseId: "case-2",
        baseline: buildAnswerPackage("case-2", "baseline", "baseline-2"),
        goodmemory: buildAnswerPackage("case-2", "goodmemory", "goodmemory-2"),
        judge: buildJudgeResult("baseline", 7, 6, ["missed_open_loop"]),
      },
    ]);

    expect(summary.totalCases).toBe(2);
    expect(summary.winnerCounts.goodmemory).toBe(1);
    expect(summary.winnerCounts.baseline).toBe(1);
    expect(summary.goodmemoryAverage.history_continuation).toBe(7.5);
    expect(summary.uplift.history_continuation).toBe(2);
  });

  it("persists suite report and failure artifacts", async () => {
    const workspace = await createTempWorkspace("goodmemory-reporting");

    try {
      const outputDir = join(workspace.root, "reports");
      const cases = [
        {
          caseId: "case-1",
          baseline: buildAnswerPackage("case-1", "baseline", "baseline-1"),
          goodmemory: buildAnswerPackage("case-1", "goodmemory", "goodmemory-1"),
          judge: buildJudgeResult("baseline", 8, 5, ["identity_miss"]),
        },
      ];
      const summary = aggregateJudgedCases([
        ...cases,
      ]);

      const result = await persistEvalArtifacts({
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
      ) as { runId: string };
      const failure = JSON.parse(
        await readFile(join(result.runDirectory, "failures/case-1.json"), "utf8"),
      ) as { judge: { failure_tags: string[] } };
      const caseArtifact = JSON.parse(
        await readFile(join(result.runDirectory, "cases/case-1.json"), "utf8"),
      ) as { goodmemory: { trace: { recallHitCount: number } } };
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
      };

      expect(report.runId).toBe("run-001");
      expect(failure.judge.failure_tags).toContain("identity_miss");
      expect(caseArtifact.goodmemory.trace.recallHitCount).toBe(4);
      expect(baselineTrace.mode).toBe("baseline");
      expect(baselineTrace.trace.sessionsReplayed).toBe(0);
      expect(goodmemoryTrace.mode).toBe("goodmemory");
      expect(goodmemoryTrace.trace.recallHitCount).toBe(4);
      expect(rawRecall.references[0]?.pointer).toBe("docs/runbook.md");
      expect(rawRecall.hits[0]?.type).toBe("reference");
    } finally {
      await workspace.cleanup();
    }
  });
});
