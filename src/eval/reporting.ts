import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgeResult, JudgeScores } from "./judge";
import type { EvalAnswerPackage } from "./runners";

export interface JudgedEvalCase {
  caseId: string;
  baseline: EvalAnswerPackage;
  goodmemory: EvalAnswerPackage;
  judge: JudgeResult;
}

export interface EvalSuiteSummary {
  totalCases: number;
  winnerCounts: {
    baseline: number;
    goodmemory: number;
    tie: number;
  };
  goodmemoryAverage: JudgeScores;
  baselineAverage: JudgeScores;
  uplift: JudgeScores;
}

export interface EvalRuntimeMetadata {
  generationMode: "live" | "fallback";
  judgeMode: "live" | "fallback";
}

export type PersistedEvalMode = "live" | "fallback";

function emptyScores(): JudgeScores {
  return {
    identity_understanding: 0,
    history_continuation: 0,
    factual_alignment: 0,
    relevance: 0,
  };
}

function addScores(target: JudgeScores, source: JudgeScores): JudgeScores {
  return {
    identity_understanding:
      target.identity_understanding + source.identity_understanding,
    history_continuation:
      target.history_continuation + source.history_continuation,
    factual_alignment: target.factual_alignment + source.factual_alignment,
    relevance: target.relevance + source.relevance,
    personalization:
      (target.personalization ?? 0) + (source.personalization ?? 0),
  };
}

function divideScores(scores: JudgeScores, divisor: number): JudgeScores {
  return {
    identity_understanding: scores.identity_understanding / divisor,
    history_continuation: scores.history_continuation / divisor,
    factual_alignment: scores.factual_alignment / divisor,
    relevance: scores.relevance / divisor,
    personalization:
      scores.personalization !== undefined
        ? scores.personalization / divisor
        : undefined,
  };
}

function subtractScores(left: JudgeScores, right: JudgeScores): JudgeScores {
  return {
    identity_understanding:
      left.identity_understanding - right.identity_understanding,
    history_continuation:
      left.history_continuation - right.history_continuation,
    factual_alignment: left.factual_alignment - right.factual_alignment,
    relevance: left.relevance - right.relevance,
    personalization:
      left.personalization !== undefined || right.personalization !== undefined
        ? (left.personalization ?? 0) - (right.personalization ?? 0)
        : undefined,
  };
}

function resolveComparativeScores(judge: JudgeResult): {
  baseline: JudgeScores;
  goodmemory: JudgeScores;
} {
  return {
    baseline: judge.baseline_scores ?? judge.scores,
    goodmemory: judge.goodmemory_scores ?? judge.scores,
  };
}

export function aggregateJudgedCases(cases: JudgedEvalCase[]): EvalSuiteSummary {
  const winnerCounts = {
    baseline: 0,
    goodmemory: 0,
    tie: 0,
  };

  let baselineTotal = emptyScores();
  let goodmemoryTotal = emptyScores();

  for (const item of cases) {
    winnerCounts[item.judge.winner] += 1;
    const comparative = resolveComparativeScores(item.judge);
    baselineTotal = addScores(baselineTotal, comparative.baseline);
    goodmemoryTotal = addScores(goodmemoryTotal, comparative.goodmemory);
  }

  const divisor = Math.max(cases.length, 1);
  const baselineAverage = divideScores(baselineTotal, divisor);
  const goodmemoryAverage = divideScores(goodmemoryTotal, divisor);

  return {
    totalCases: cases.length,
    winnerCounts,
    baselineAverage,
    goodmemoryAverage,
    uplift: subtractScores(goodmemoryAverage, baselineAverage),
  };
}

export async function persistEvalArtifacts(input: {
  mode: PersistedEvalMode;
  outputDir: string;
  runId: string;
  summary: EvalSuiteSummary;
  runtime: EvalRuntimeMetadata;
  cases: JudgedEvalCase[];
}): Promise<{ runDirectory: string }> {
  const runDirectory = join(input.outputDir, input.runId);
  const casesDirectory = join(runDirectory, "cases");
  const failuresDirectory = join(runDirectory, "failures");
  const tracesDirectory = join(runDirectory, "traces");

  await mkdir(casesDirectory, { recursive: true });
  await mkdir(failuresDirectory, { recursive: true });
  await mkdir(tracesDirectory, { recursive: true });

  await writeFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(
      {
        mode: input.mode,
        runId: input.runId,
        summary: input.summary,
        runtime: input.runtime,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const failedCases: Array<{
    caseId: string;
    path: string;
    winner: JudgeResult["winner"];
    failureTags: string[];
  }> = [];

  for (const item of input.cases) {
    const caseTraceDirectory = join(tracesDirectory, item.caseId);
    await mkdir(caseTraceDirectory, { recursive: true });

    await writeFile(
      join(casesDirectory, `${item.caseId}.json`),
      `${JSON.stringify(item, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "baseline.json"),
      `${JSON.stringify(item.baseline, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "goodmemory.json"),
      `${JSON.stringify(item.goodmemory, null, 2)}\n`,
      "utf8",
    );
    if (item.goodmemory.retrieved) {
      await writeFile(
        join(caseTraceDirectory, "raw-recall.json"),
        `${JSON.stringify(item.goodmemory.retrieved, null, 2)}\n`,
        "utf8",
      );
    }
    if (item.goodmemory.memoryContext) {
      await writeFile(
        join(caseTraceDirectory, "built-context.md"),
        `${item.goodmemory.memoryContext}\n`,
        "utf8",
      );
    }
    await writeFile(
      join(caseTraceDirectory, "remember-trace.json"),
      `${JSON.stringify(item.goodmemory.trace.rememberEvents, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "feedback-trace.json"),
      `${JSON.stringify(item.goodmemory.trace.feedbackEvents, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "context-build.json"),
      `${JSON.stringify(item.goodmemory.trace.contextBuild, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(caseTraceDirectory, "judge.json"),
      `${JSON.stringify(item.judge, null, 2)}\n`,
      "utf8",
    );

    const failed =
      item.judge.winner !== "goodmemory" || item.judge.failure_tags.length > 0;

    if (!failed) {
      continue;
    }

    await writeFile(
      join(failuresDirectory, `${item.caseId}.json`),
      `${JSON.stringify(item, null, 2)}\n`,
      "utf8",
    );
    failedCases.push({
      caseId: item.caseId,
      path: join(failuresDirectory, `${item.caseId}.json`),
      winner: item.judge.winner,
      failureTags: item.judge.failure_tags,
    });
  }

  await writeFile(
    join(failuresDirectory, "summary.json"),
    `${JSON.stringify(
      {
        mode: input.mode,
        runId: input.runId,
        totalFailures: failedCases.length,
        failedCases,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    runDirectory,
  };
}
