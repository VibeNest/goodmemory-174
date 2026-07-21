#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { BeamCase } from "../src/eval/beam";
import {
  buildOfficialRescoreRunIdentity,
  buildOfficialRescoreSourceInputFingerprints,
  readOfficialRescoreRubricProgressRows,
  serializeOfficialRescoreRubricProgressRow,
} from "./rescore-official-protocols";
import type {
  OfficialRescoreRubricProgressRow,
  OfficialRescoreSourceInputFingerprint,
} from "./rescore-official-protocols";
import {
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  flattenPhase63BeamCases,
  readPhase63BeamRows,
} from "./run-phase-63-beam-recall-diagnostic";
import {
  applyPhase63BeamAnswerOperationGuardrails,
  buildPhase63BeamEvidencePackContext,
} from "./run-phase-63-beam-live-slice";
import {
  PHASE72_ANSWER_GATEWAY,
  PHASE72_INDEPENDENT_JUDGE_MODEL,
} from "./phase-72-external-contracts";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const GENERATED_BY = "scripts/prepare-phase-72-beam-stored-retry.ts";

export interface Phase72BeamStoredRetryCase {
  hypothesis: string;
  questionId: string;
  questionType: string;
}

interface Phase72BeamStoredRetrySourceCase extends Phase72BeamStoredRetryCase {
  retrievedChatIds: number[];
}

export interface Phase72BeamStoredRetryReport {
  benchmark: "BEAM-100K";
  cases: Phase72BeamStoredRetryCase[];
  claimBoundary: string;
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  retryMerge: {
    replacements: Array<{
      questionId: string;
      retryHypothesis: string;
      sourceHypothesis: string;
    }>;
    sourceReportPath: string;
  };
  runId: string;
}

export interface Phase72BeamStoredRetryOptions {
  benchmarkRoot: string;
  officialRunId: string;
  outputDir: string;
  questionIds: string[];
  rubricsPath: string;
  runId: string;
  sourceOfficialDir: string;
  sourceReport: string;
}

interface BeamRubricEntry {
  question: string;
  rubric: string[];
}

interface SourceOfficialSummary {
  judgeFailures: number;
  judgeModel: string;
  sourceInputFingerprints: {
    reportPath?: OfficialRescoreSourceInputFingerprint;
  };
  sourceInputs: {
    reportPath?: string;
  };
}

export function buildPhase72BeamStoredRetryReport(input: {
  generatedAt: string;
  replacements: ReadonlyMap<string, string>;
  runId: string;
  sourceCases: readonly Phase72BeamStoredRetryCase[];
  sourceReportPath: string;
}): Phase72BeamStoredRetryReport {
  if (input.replacements.size === 0) {
    throw new Error("BEAM stored retry requires at least one replacement.");
  }
  const sourceById = uniqueCasesById(input.sourceCases, "source");
  for (const questionId of input.replacements.keys()) {
    if (!sourceById.has(questionId)) {
      throw new Error(`BEAM stored retry target ${questionId} is missing.`);
    }
  }
  const replacements: Phase72BeamStoredRetryReport["retryMerge"]["replacements"] = [];
  const cases = input.sourceCases.map((sourceCase) => {
    const retryHypothesis = input.replacements.get(sourceCase.questionId);
    if (retryHypothesis === undefined) {
      return { ...sourceCase };
    }
    if (retryHypothesis === sourceCase.hypothesis) {
      throw new Error(
        `BEAM stored retry target ${sourceCase.questionId} did not change.`,
      );
    }
    replacements.push({
      questionId: sourceCase.questionId,
      retryHypothesis,
      sourceHypothesis: sourceCase.hypothesis,
    });
    return {
      ...sourceCase,
      hypothesis: retryHypothesis,
    };
  });
  return {
    benchmark: "BEAM-100K",
    cases,
    claimBoundary:
      "Stored-retrieval answer retry after a generic answer guardrail; internal research evidence until the official rescore and public claim gates pass.",
    generatedAt: input.generatedAt,
    generatedBy: GENERATED_BY,
    retryMerge: {
      replacements,
      sourceReportPath: resolve(input.sourceReportPath),
    },
    runId: input.runId,
  };
}

export function selectPhase72BeamReusableJudgeRows(input: {
  retryCases: readonly Phase72BeamStoredRetryCase[];
  rubrics: Readonly<Record<string, readonly string[]>>;
  sourceCases: readonly Phase72BeamStoredRetryCase[];
  sourceRows: readonly OfficialRescoreRubricProgressRow[];
  targetQuestionIds: ReadonlySet<string>;
}): OfficialRescoreRubricProgressRow[] {
  if (input.targetQuestionIds.size === 0) {
    throw new Error("BEAM stored retry target question IDs must not be empty.");
  }
  const sourceById = uniqueCasesById(input.sourceCases, "source");
  const retryById = uniqueCasesById(input.retryCases, "retry");
  if (sourceById.size !== retryById.size) {
    throw new Error("BEAM stored retry source and retry case counts differ.");
  }
  for (const [questionId, sourceCase] of sourceById) {
    const retryCase = retryById.get(questionId);
    if (!retryCase || retryCase.questionType !== sourceCase.questionType) {
      throw new Error(`BEAM stored retry identity changed for ${questionId}.`);
    }
    const isTarget = input.targetQuestionIds.has(questionId);
    if (!isTarget && retryCase.hypothesis !== sourceCase.hypothesis) {
      throw new Error(`BEAM stored retry non-target answer changed for ${questionId}.`);
    }
    if (isTarget && retryCase.hypothesis === sourceCase.hypothesis) {
      throw new Error(`BEAM stored retry target ${questionId} did not change.`);
    }
  }
  for (const questionId of input.targetQuestionIds) {
    if (!sourceById.has(questionId)) {
      throw new Error(`BEAM stored retry target ${questionId} is missing.`);
    }
  }

  const expectedKeys = new Set<string>();
  for (const sourceCase of input.sourceCases) {
    const rubric = input.rubrics[sourceCase.questionId];
    if (!rubric || rubric.length === 0) {
      throw new Error(`BEAM stored retry rubric is missing for ${sourceCase.questionId}.`);
    }
    rubric.forEach((_, index) => {
      expectedKeys.add(`${sourceCase.questionId}#${index}`);
    });
  }
  const sourceKeys = new Set(input.sourceRows.map((row) => row.key));
  if (
    sourceKeys.size !== expectedKeys.size ||
    [...expectedKeys].some((key) => !sourceKeys.has(key))
  ) {
    throw new Error(
      "BEAM stored retry source judge progress does not exactly cover the source report.",
    );
  }
  for (const row of input.sourceRows) {
    if (!row.key.startsWith(`${row.questionId}#`)) {
      throw new Error(`BEAM stored retry judge row identity is invalid: ${row.key}.`);
    }
  }
  return input.sourceRows.filter(
    (row) => !input.targetQuestionIds.has(row.questionId),
  );
}

export function parsePhase72BeamStoredRetryOptions(
  argv: readonly string[],
): Phase72BeamStoredRetryOptions {
  const questionIds = requiredFlag(argv, "--question-ids").split(",");
  if (
    questionIds.some((questionId) => questionId.length === 0 || questionId.trim() !== questionId) ||
    new Set(questionIds).size !== questionIds.length
  ) {
    throw new Error("--question-ids must contain unique, non-empty question IDs.");
  }
  return {
    benchmarkRoot: requiredFlag(argv, "--benchmark-root"),
    officialRunId: requiredPathSegmentFlag(argv, "--official-run-id"),
    outputDir: requiredFlag(argv, "--output-dir"),
    questionIds,
    rubricsPath: requiredFlag(argv, "--rubrics"),
    runId: requiredPathSegmentFlag(argv, "--run-id"),
    sourceOfficialDir: requiredFlag(argv, "--source-official-dir"),
    sourceReport: requiredFlag(argv, "--source-report"),
  };
}

export async function preparePhase72BeamStoredRetry(
  options: Phase72BeamStoredRetryOptions,
): Promise<Record<string, unknown>> {
  const sourceSummaryPath = join(options.sourceOfficialDir, "rescore-summary.json");
  const sourceProgressPath = join(options.sourceOfficialDir, "progress.jsonl");
  const [sourceRaw, sourceSummaryRaw, sourceProgressRaw, rubricsRaw] =
    await Promise.all([
      readFile(options.sourceReport, "utf8"),
      readFile(sourceSummaryPath, "utf8"),
      readFile(sourceProgressPath, "utf8"),
      readFile(options.rubricsPath, "utf8"),
    ]);
  const source = JSON.parse(sourceRaw) as {
    cases: Phase72BeamStoredRetrySourceCase[];
    summary: { executionFailures: number; scale: BeamCase["scale"] };
  };
  if (source.summary.executionFailures !== 0 || source.summary.scale !== "100K") {
    throw new Error("BEAM stored retry requires a complete zero-failure 100K source report.");
  }
  const sourceSummary = JSON.parse(sourceSummaryRaw) as SourceOfficialSummary;
  assertSourceOfficialSummary({
    sourceRaw,
    sourceReport: options.sourceReport,
    summary: sourceSummary,
  });
  const rubricEntries = JSON.parse(rubricsRaw) as Record<string, BeamRubricEntry>;
  const rubrics = Object.fromEntries(
    Object.entries(rubricEntries).map(([questionId, entry]) => [
      questionId,
      entry.rubric,
    ]),
  );
  const sourceRows = readOfficialRescoreRubricProgressRows(
    sourceProgressRaw,
    sourceProgressPath,
  );

  const benchmarkRows = await readPhase63BeamRows({
    benchmarkRoot: options.benchmarkRoot,
    readFile: (path) => readFile(path, "utf8"),
  });
  const benchmarkCases = new Map(
    flattenPhase63BeamCases(benchmarkRows, "100K").map((testCase) => [
      testCase.questionId,
      testCase,
    ]),
  );
  const sourceById = uniqueCasesById(source.cases, "source");
  const replacements = new Map<string, string>();
  for (const questionId of options.questionIds) {
    const sourceCase = sourceById.get(questionId);
    const testCase = benchmarkCases.get(questionId);
    if (!sourceCase || !testCase) {
      throw new Error(`BEAM stored retry target ${questionId} is missing.`);
    }
    const memoryContext = buildPhase63BeamEvidencePackContext({
      retrievedChatIds: sourceCase.retrievedChatIds,
      testCase,
    });
    const retryHypothesis = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: sourceCase.hypothesis,
      memoryContext,
      testCase,
    });
    replacements.set(questionId, retryHypothesis);
  }

  const generatedAt = new Date().toISOString();
  const runDirectory = join(resolve(options.outputDir), options.runId);
  const reportPath = join(runDirectory, "beam-stored-retry-report.json");
  const manifestPath = join(runDirectory, "retry-manifest.json");
  const report = buildPhase72BeamStoredRetryReport({
    generatedAt,
    replacements,
    runId: options.runId,
    sourceCases: source.cases,
    sourceReportPath: options.sourceReport,
  });
  const reportRaw = `${JSON.stringify(report, null, 2)}\n`;
  const targetQuestionIds = new Set(options.questionIds);
  const reusableRows = selectPhase72BeamReusableJudgeRows({
    retryCases: report.cases,
    rubrics,
    sourceCases: source.cases,
    sourceRows,
    targetQuestionIds,
  });

  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const officialDirectory = join(
    repoRoot,
    "reports/eval/research/official-rescore",
    options.officialRunId,
  );
  const officialProgressPath = join(officialDirectory, "progress.jsonl");
  const officialIdentityPath = join(officialDirectory, "run-identity.json");
  const sourceInputs = {
    reportPath: resolve(reportPath),
    rubricsPath: resolve(options.rubricsPath),
  };
  const sourceInputFingerprints = buildOfficialRescoreSourceInputFingerprints({
    contents: {
      reportPath: reportRaw,
      rubricsPath: rubricsRaw,
    },
    sourceInputs,
  });
  const runIdentity = buildOfficialRescoreRunIdentity({
    benchmark: "beam",
    judgeGateway: PHASE72_ANSWER_GATEWAY,
    judgeModel: PHASE72_INDEPENDENT_JUDGE_MODEL,
    judgeProvider: "openai",
    runId: options.officialRunId,
    sourceInputFingerprints,
    sourceInputs,
  });
  const progressRaw = reusableRows.length === 0
    ? ""
    : `${reusableRows.map(serializeOfficialRescoreRubricProgressRow).join("\n")}\n`;
  const manifest = {
    generatedAt,
    generatedBy: GENERATED_BY,
    kind: "phase-72-beam-stored-retrieval-retry",
    officialRescore: {
      pendingRubricItems: sourceRows.length - reusableRows.length,
      reusableRubricItems: reusableRows.length,
      runDirectory: officialDirectory,
      runId: options.officialRunId,
    },
    output: {
      report: artifact(reportPath, reportRaw),
      runIdentity: artifact(
        officialIdentityPath,
        `${JSON.stringify(runIdentity, null, 2)}\n`,
      ),
      seededProgress: artifact(officialProgressPath, progressRaw),
    },
    replacements: report.retryMerge.replacements,
    source: {
      officialProgress: artifact(sourceProgressPath, sourceProgressRaw),
      officialSummary: artifact(sourceSummaryPath, sourceSummaryRaw),
      report: artifact(options.sourceReport, sourceRaw),
      rubrics: artifact(options.rubricsPath, rubricsRaw),
    },
  };
  await Promise.all([
    mkdir(runDirectory, { recursive: true }),
    mkdir(officialDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(reportPath, reportRaw, "utf8"),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(
      officialIdentityPath,
      `${JSON.stringify(runIdentity, null, 2)}\n`,
      "utf8",
    ),
    writeFile(officialProgressPath, progressRaw, "utf8"),
  ]);
  return {
    manifestPath,
    officialDirectory,
    officialRunId: options.officialRunId,
    pendingRubricItems: sourceRows.length - reusableRows.length,
    reportPath,
    replacements: report.retryMerge.replacements,
  };
}

function assertSourceOfficialSummary(input: {
  sourceRaw: string;
  sourceReport: string;
  summary: SourceOfficialSummary;
}): void {
  if (
    input.summary.judgeFailures !== 0 ||
    input.summary.judgeModel !== PHASE72_INDEPENDENT_JUDGE_MODEL
  ) {
    throw new Error("BEAM stored retry requires a zero-failure independent source rescore.");
  }
  if (
    !input.summary.sourceInputs.reportPath ||
    resolve(input.summary.sourceInputs.reportPath) !== resolve(input.sourceReport)
  ) {
    throw new Error("BEAM stored retry source rescore points to a different report.");
  }
  const fingerprint = input.summary.sourceInputFingerprints.reportPath;
  if (!fingerprint || fingerprint.sha256 !== sha256(input.sourceRaw)) {
    throw new Error("BEAM stored retry source report fingerprint does not match.");
  }
}

function uniqueCasesById<T extends Phase72BeamStoredRetryCase>(
  cases: readonly T[],
  label: string,
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const testCase of cases) {
    if (byId.has(testCase.questionId)) {
      throw new Error(`BEAM stored retry ${label} has duplicate ${testCase.questionId}.`);
    }
    byId.set(testCase.questionId, testCase);
  }
  return byId;
}

function artifact(path: string, content: string): {
  path: string;
  sha256: string;
} {
  return {
    path: resolve(path),
    sha256: sha256(content),
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function requiredFlag(argv: readonly string[], flag: string): string {
  const value = resolveCliFlagValueStrict(argv, flag);
  if (!value) {
    throw new Error(`${flag} is required.`);
  }
  return value;
}

function requiredPathSegmentFlag(
  argv: readonly string[],
  flag: string,
): string {
  return resolveCliPathSegmentFlagValueStrict(argv, flag) ?? requiredFlag(argv, flag);
}

if (import.meta.main) {
  console.log(
    JSON.stringify(
      await preparePhase72BeamStoredRetry(
        parsePhase72BeamStoredRetryOptions(Bun.argv),
      ),
      null,
      2,
    ),
  );
}
