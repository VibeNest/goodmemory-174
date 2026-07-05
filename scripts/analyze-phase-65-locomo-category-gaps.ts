// LoCoMo category-gap analyzer. This is a JSON-only diagnostic over Phase 65
// smoke reports; it separates retrieval-missing failures from full-recall answer
// failures and high-noise full-recall rows.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  LOCOMO_QA_CATEGORIES,
  type LocomoQaCategory,
} from "../src/eval/locomo";
import { resolveCliFlagValueStrict } from "./cli-options";
import {
  LOCOMO_CATEGORY_GAP_METADATA_FIELDS,
  assertLocomoReportHasNoExecutionFailures,
  assertLocomoReportInputsHaveUniquePaths,
  assertLocomoReportMetadataCompatible,
  assertLocomoReportQuestionCountMatchesCases,
} from "./locomo-report-compatibility";
import type {
  LocomoQuestionRetrieval,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_CATEGORY_GAP_ANALYSIS_FILE_NAME =
  "category-gap-analysis.json";

const GENERATED_BY = "scripts/analyze-phase-65-locomo-category-gaps.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; not a public release or benchmark claim.";

interface ReportInput {
  path: string;
  report: LocomoSmokeReport;
}

interface GapCliOptions {
  outputPath?: string;
  reportPaths: string[];
  runId?: string;
}

interface FailureBuckets {
  fullRecallWrongClean: number;
  fullRecallWrongNoisy: number;
  missingEvidenceWrong: number;
}

interface RetrievalBucket {
  averageNoise: number;
  correct: number;
  questionCount: number;
  wrong: number;
}

interface NoisyWrongQuestion {
  answerCorrect: boolean | null;
  caseId: string;
  category: LocomoQaCategory;
  evidenceRecall: number;
  generatedAnswer: string | null;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnCount: number;
  noiseTurnCount: number;
  questionId: string;
  reportPath: string;
  sourceRunId: string;
}

interface GapSummary {
  answerAccuracy: number | null;
  answerCorrectCount: number;
  answeredCount: number;
  averageEvidenceRecall: number;
  averageNoise: number;
  failureBuckets: FailureBuckets;
  questionCount: number;
  retrievalBuckets: {
    full: RetrievalBucket;
    partial: RetrievalBucket;
    zero: RetrievalBucket;
  };
  topNoisyWrongQuestions: NoisyWrongQuestion[];
}

export interface LocomoCategoryGapAnalysis {
  benchmark: "locomo";
  categories: Partial<Record<LocomoQaCategory, GapSummary>>;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  mode: LocomoSmokeReport["mode"];
  outputPath: string | null;
  overall: GapSummary;
  phase: "phase-65";
  runId: string;
  sourceReports: Array<{
    path: string;
    questionCount: number;
    runId: string;
  }>;
}

interface GapAccumulator {
  answerCorrectCount: number;
  answeredCount: number;
  evidenceRecallTotal: number;
  failureBuckets: FailureBuckets;
  noiseTurnTotal: number;
  questionCount: number;
  retrievalBuckets: {
    full: RetrievalBucketAccumulator;
    partial: RetrievalBucketAccumulator;
    zero: RetrievalBucketAccumulator;
  };
  topNoisyWrongQuestions: NoisyWrongQuestion[];
}

interface RetrievalBucketAccumulator {
  correct: number;
  noiseTurnTotal: number;
  questionCount: number;
  wrong: number;
}

function parseStringListFlag(
  argv: readonly string[],
  flagName: string,
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flagName) {
      continue;
    }
    const raw = argv[index + 1];
    if (!raw || raw.startsWith("--")) {
      throw new Error(`${flagName} requires a value.`);
    }
    const parts = raw.split(",");
    for (const value of parts) {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        throw new Error(`${flagName} contains an empty value.`);
      }
      const normalizedPath = resolve(trimmed);
      if (seen.has(normalizedPath)) {
        throw new Error(`${flagName} contains duplicate value ${trimmed}.`);
      }
      seen.add(normalizedPath);
      values.push(trimmed);
    }
  }
  return values;
}

function parseCliOptions(argv: readonly string[]): GapCliOptions {
  const reportPaths = parseStringListFlag(argv, "--report");
  if (reportPaths.length === 0) {
    throw new Error(
      "LoCoMo category-gap analysis requires --report <smoke-report.json>.",
    );
  }
  return {
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    reportPaths,
    runId: resolveCliFlagValueStrict(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSmokeReport(
  report: unknown,
  path: string,
): asserts report is LocomoSmokeReport {
  if (!isRecord(report)) {
    throw new Error(`Report ${path} must be a JSON object.`);
  }
  if (report.phase !== "phase-65" || report.benchmark !== "locomo") {
    throw new Error(`Report ${path} is not a Phase 65 LoCoMo smoke report.`);
  }
  if (!Array.isArray(report.cases)) {
    throw new Error(`Report ${path} must include cases[].`);
  }
}

function emptyRetrievalBucket(): RetrievalBucketAccumulator {
  return {
    correct: 0,
    noiseTurnTotal: 0,
    questionCount: 0,
    wrong: 0,
  };
}

function emptyAccumulator(): GapAccumulator {
  return {
    answerCorrectCount: 0,
    answeredCount: 0,
    evidenceRecallTotal: 0,
    failureBuckets: {
      fullRecallWrongClean: 0,
      fullRecallWrongNoisy: 0,
      missingEvidenceWrong: 0,
    },
    noiseTurnTotal: 0,
    questionCount: 0,
    retrievalBuckets: {
      full: emptyRetrievalBucket(),
      partial: emptyRetrievalBucket(),
      zero: emptyRetrievalBucket(),
    },
    topNoisyWrongQuestions: [],
  };
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function bucketForQuestion(
  question: LocomoQuestionRetrieval,
): keyof GapAccumulator["retrievalBuckets"] {
  if (question.evidenceRecall <= 0) {
    return "zero";
  }
  if (question.goldEvidenceFullyRetrieved || question.evidenceRecall >= 1) {
    return "full";
  }
  return "partial";
}

function addQuestion(
  acc: GapAccumulator,
  question: LocomoQuestionRetrieval,
  source: { reportPath: string; runId: string },
): void {
  acc.questionCount += 1;
  acc.evidenceRecallTotal += question.evidenceRecall;
  acc.noiseTurnTotal += question.noiseTurnCount;
  if (question.answerCorrect !== null) {
    acc.answeredCount += 1;
    if (question.answerCorrect) {
      acc.answerCorrectCount += 1;
    }
  }

  const bucket = acc.retrievalBuckets[bucketForQuestion(question)];
  bucket.questionCount += 1;
  bucket.noiseTurnTotal += question.noiseTurnCount;
  if (question.answerCorrect === true) {
    bucket.correct += 1;
  } else if (question.answerCorrect === false) {
    bucket.wrong += 1;
  }

  if (question.answerCorrect !== false) {
    return;
  }
  if (!question.goldEvidenceFullyRetrieved) {
    acc.failureBuckets.missingEvidenceWrong += 1;
  } else if (question.noiseTurnCount > 0) {
    acc.failureBuckets.fullRecallWrongNoisy += 1;
  } else {
    acc.failureBuckets.fullRecallWrongClean += 1;
  }

  if (question.noiseTurnCount > 0) {
    acc.topNoisyWrongQuestions.push({
      answerCorrect: question.answerCorrect,
      caseId: question.caseId,
      category: question.category,
      evidenceRecall: question.evidenceRecall,
      generatedAnswer: question.generatedAnswer,
      goldEvidenceFullyRetrieved: question.goldEvidenceFullyRetrieved,
      missingEvidenceTurnCount: question.missingEvidenceTurnIds.length,
      noiseTurnCount: question.noiseTurnCount,
      questionId: question.questionId,
      reportPath: source.reportPath,
      sourceRunId: source.runId,
    });
  }
}

function summarizeBucket(bucket: RetrievalBucketAccumulator): RetrievalBucket {
  return {
    averageNoise: divideOrZero(bucket.noiseTurnTotal, bucket.questionCount),
    correct: bucket.correct,
    questionCount: bucket.questionCount,
    wrong: bucket.wrong,
  };
}

function summarizeAccumulator(acc: GapAccumulator): GapSummary {
  const topNoisyWrongQuestions = [...acc.topNoisyWrongQuestions]
    .sort((left, right) => {
      if (right.noiseTurnCount !== left.noiseTurnCount) {
        return right.noiseTurnCount - left.noiseTurnCount;
      }
      return `${left.category}:${left.caseId}:${left.questionId}`.localeCompare(
        `${right.category}:${right.caseId}:${right.questionId}`,
      );
    })
    .slice(0, 10);

  return {
    answerAccuracy:
      acc.answeredCount === 0
        ? null
        : divideOrZero(acc.answerCorrectCount, acc.answeredCount),
    answerCorrectCount: acc.answerCorrectCount,
    answeredCount: acc.answeredCount,
    averageEvidenceRecall: divideOrZero(
      acc.evidenceRecallTotal,
      acc.questionCount,
    ),
    averageNoise: divideOrZero(acc.noiseTurnTotal, acc.questionCount),
    failureBuckets: { ...acc.failureBuckets },
    questionCount: acc.questionCount,
    retrievalBuckets: {
      full: summarizeBucket(acc.retrievalBuckets.full),
      partial: summarizeBucket(acc.retrievalBuckets.partial),
      zero: summarizeBucket(acc.retrievalBuckets.zero),
    },
    topNoisyWrongQuestions,
  };
}

function defaultOutputPath(reportPaths: readonly string[], runId: string): string {
  return join(
    dirname(reportPaths[0] ?? "."),
    "..",
    runId,
    LOCOMO_CATEGORY_GAP_ANALYSIS_FILE_NAME,
  );
}

export function analyzeLocomoCategoryGaps(input: {
  generatedAt?: string;
  outputPath?: string;
  reports: ReportInput[];
  runId?: string;
}): LocomoCategoryGapAnalysis {
  if (input.reports.length === 0) {
    throw new Error("LoCoMo category-gap analysis requires at least one report.");
  }
  assertLocomoReportInputsHaveUniquePaths(input.reports);
  const first = input.reports[0].report;
  const overall = emptyAccumulator();
  const categories = new Map<LocomoQaCategory, GapAccumulator>();
  const seenQuestionKeys = new Map<string, string>();
  const sourceReports: LocomoCategoryGapAnalysis["sourceReports"] = [];

  for (const { path, report } of input.reports) {
    assertLocomoReportMetadataCompatible({
      candidate: { path, report },
      fields: LOCOMO_CATEGORY_GAP_METADATA_FIELDS,
      reference: input.reports[0],
    });
    assertLocomoReportHasNoExecutionFailures({ path, report });
    assertLocomoReportQuestionCountMatchesCases({ path, report });

    sourceReports.push({
      path,
      questionCount: report.questionCount,
      runId: report.runId,
    });
    for (const question of report.cases) {
      const questionKey = `${question.caseId}::${question.questionId}`;
      const duplicatePath = seenQuestionKeys.get(questionKey);
      if (duplicatePath) {
        throw new Error(
          `LoCoMo category-gap analysis received duplicate question ` +
            `${questionKey} in ${path}; first seen in ${duplicatePath}.`,
        );
      }
      seenQuestionKeys.set(questionKey, path);
      addQuestion(overall, question, {
        reportPath: path,
        runId: report.runId,
      });
      let acc = categories.get(question.category);
      if (!acc) {
        acc = emptyAccumulator();
        categories.set(question.category, acc);
      }
      addQuestion(acc, question, {
        reportPath: path,
        runId: report.runId,
      });
    }
  }

  const categorySummaries: Partial<Record<LocomoQaCategory, GapSummary>> = {};
  for (const category of LOCOMO_QA_CATEGORIES) {
    const acc = categories.get(category);
    if (acc) {
      categorySummaries[category] = summarizeAccumulator(acc);
    }
  }

  return {
    benchmark: "locomo",
    categories: categorySummaries,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    mode: first.mode,
    outputPath: input.outputPath ?? null,
    overall: summarizeAccumulator(overall),
    phase: "phase-65",
    runId: input.runId ?? "locomo-category-gap-analysis-current",
    sourceReports,
  };
}

export async function runLocomoCategoryGapAnalysis(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{ analysis: LocomoCategoryGapAnalysis; outputPath: string }> {
  const options = parseCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const runId = options.runId ?? "locomo-category-gap-analysis-current";
  const outputPath =
    options.outputPath ?? defaultOutputPath(options.reportPaths, runId);

  const reports: ReportInput[] = [];
  for (const path of options.reportPaths) {
    const parsed = JSON.parse(await readFileImpl(path)) as unknown;
    assertSmokeReport(parsed, path);
    reports.push({ path, report: parsed });
  }

  const analysis = analyzeLocomoCategoryGaps({
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    outputPath,
    reports,
    runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  runLocomoCategoryGapAnalysis(process.argv)
    .then(({ analysis, outputPath }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            outputPath,
            overall: analysis.overall,
            runId: analysis.runId,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo category-gap analysis failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
