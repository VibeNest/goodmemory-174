// LoCoMo category-matrix assembler. This is a cheap JSON-only post-process over
// five Phase 65 one-category smoke reports; it does not run retrieval or live
// answer generation.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  LOCOMO_QA_CATEGORIES,
  type LocomoQaCategory,
} from "../src/eval/locomo";
import { resolveCliFlagValueStrict } from "./cli-options";
import {
  assertLocomoReportCategorySummariesMatchCases,
  assertLocomoReportHasNoQuestionIdFilter,
  assertLocomoReportInputsHaveUniquePaths,
  assertLocomoReportMetadataCompatible,
  assertLocomoReportQuestionCountMatchesCases,
  LOCOMO_CATEGORY_SHARD_METADATA_FIELDS,
} from "./locomo-report-compatibility";
import type {
  LocomoCategoryRetrievalSummary,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_CATEGORY_SUMMARY_FILE_NAME = "category-summary.json";

const GENERATED_BY = "scripts/summarize-phase-65-locomo-categories.ts";
const CLAIM_BOUNDARY =
  "Research hardening artifact only; not a public release or benchmark claim.";

interface LocomoCategoryReportInput {
  path: string;
  report: LocomoSmokeReport;
}

interface LocomoCategorySummaryCliOptions {
  outputPath?: string;
  reportPaths: string[];
  runId?: string;
}

interface LocomoCategoryShardSummary {
  answerAccuracy: number | null;
  answerCorrectCount: number | null;
  answeredCount: number;
  averageEvidenceRecall: number;
  crossSessionChainReady: boolean | null;
  fullyRetrievedCount: number;
  fullyRetrievedShare: number;
  noiseTurnTotal: number;
  questionCount: number;
  reportPath: string;
  sourceRunId: string;
}

interface LocomoCategoryOverallSummary {
  answerAccuracy: number | null;
  answerCorrectCount: number | null;
  answeredCount: number;
  averageEvidenceRecall: number;
  executionFailures: number;
  fullyRetrievedCount: number;
  fullyRetrievedShare: number;
  noiseTurnTotal: number;
  questionCount: number;
}

export interface LocomoCategorySummaryReport {
  answerEvaluation: LocomoSmokeReport["answerEvaluation"];
  benchmark: "locomo";
  categories: Record<LocomoQaCategory, LocomoCategoryShardSummary>;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  mode: LocomoSmokeReport["mode"];
  outputPath: string | null;
  overall: LocomoCategoryOverallSummary;
  phase: "phase-65";
  requiredCategories: LocomoQaCategory[];
  runId: string;
  semanticCandidateEmbeddingSource:
    LocomoSmokeReport["semanticCandidateEmbeddingSource"];
  semanticCandidates: LocomoSmokeReport["semanticCandidates"];
  sourceReports: Array<{
    category: LocomoQaCategory;
    path: string;
    questionCount: number;
    runId: string;
  }>;
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

export function parseLocomoCategorySummaryCliOptions(
  argv: readonly string[],
): LocomoCategorySummaryCliOptions {
  const reportPaths = parseStringListFlag(argv, "--report");
  if (reportPaths.length === 0) {
    throw new Error(
      "LoCoMo category summary requires --report <smoke-report.json>.",
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
  if (!Array.isArray(report.categories)) {
    throw new Error(`Report ${path} must include categories[].`);
  }
}

function assertCompatibleReport(
  first: LocomoSmokeReport,
  next: LocomoSmokeReport,
  path: string,
): void {
  assertLocomoReportMetadataCompatible({
    candidate: { path, report: next },
    fields: LOCOMO_CATEGORY_SHARD_METADATA_FIELDS,
    reference: { path: "first report", report: first },
  });
}

function findShardCategory(
  input: LocomoCategoryReportInput,
): LocomoCategoryRetrievalSummary {
  const { path, report } = input;
  assertLocomoReportHasNoQuestionIdFilter(input);
  assertLocomoReportQuestionCountMatchesCases(input);
  assertLocomoReportCategorySummariesMatchCases(input);
  if (report.executionFailures > 0) {
    throw new Error(
      `Report ${path} (${report.runId}) has ${report.executionFailures} ` +
        "execution failure(s); rerun or resume before assembling.",
    );
  }
  const nonEmptyCategories = report.categories.filter(
    (category) => category.questionCount > 0,
  );
  if (nonEmptyCategories.length !== 1) {
    throw new Error(
      `Report ${path} must contain exactly one non-empty LoCoMo category shard; ` +
        `found ${nonEmptyCategories.length}.`,
    );
  }
  const shard = nonEmptyCategories[0];
  if (report.questionCategories !== null) {
    if (
      report.questionCategories.length !== 1 ||
      report.questionCategories[0] !== shard.category
    ) {
      throw new Error(
        `Report ${path} questionCategories does not match shard ` +
          `${shard.category}.`,
      );
    }
  }
  if (report.questionCount !== shard.questionCount) {
    throw new Error(
      `Report ${path} questionCount ${report.questionCount} does not match ` +
        `category ${shard.category} questionCount ${shard.questionCount}.`,
    );
  }
  if (report.mode === "live-answer" && shard.answerAccuracy === null) {
    throw new Error(`Report ${path} is live-answer mode but has no answerAccuracy.`);
  }
  return shard;
}

function answerCorrectCount(
  shard: LocomoCategoryRetrievalSummary,
): number | null {
  if (shard.answerAccuracy === null) {
    return null;
  }
  return Math.round(shard.answerAccuracy * shard.answeredCount);
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function defaultOutputPath(reportPaths: readonly string[], runId: string): string {
  return join(dirname(reportPaths[0] ?? "."), "..", runId, LOCOMO_CATEGORY_SUMMARY_FILE_NAME);
}

export function summarizeLocomoCategoryReports(input: {
  generatedAt?: string;
  outputPath?: string;
  reports: LocomoCategoryReportInput[];
  requiredCategories?: readonly LocomoQaCategory[];
  runId?: string;
}): LocomoCategorySummaryReport {
  const requiredCategories = [...(input.requiredCategories ?? LOCOMO_QA_CATEGORIES)];
  if (input.reports.length === 0) {
    throw new Error("LoCoMo category summary requires at least one report.");
  }
  assertLocomoReportInputsHaveUniquePaths(input.reports);
  const first = input.reports[0].report;
  for (const { path, report } of input.reports) {
    assertCompatibleReport(first, report, path);
  }

  const byCategory = new Map<LocomoQaCategory, LocomoCategoryShardSummary>();
  const sourceReports: LocomoCategorySummaryReport["sourceReports"] = [];
  let questionCount = 0;
  let answeredCount = 0;
  let answerCorrectTotal: number | null = first.mode === "live-answer" ? 0 : null;
  let weightedEvidenceRecall = 0;
  let fullyRetrievedCount = 0;
  let noiseTurnTotal = 0;

  for (const reportInput of input.reports) {
    const shard = findShardCategory(reportInput);
    if (byCategory.has(shard.category)) {
      throw new Error(`Duplicate LoCoMo category shard: ${shard.category}.`);
    }
    const correctCount = answerCorrectCount(shard);
    if (first.mode === "live-answer" && correctCount === null) {
      throw new Error(`Category ${shard.category} has no answer count.`);
    }
    if (answerCorrectTotal !== null && correctCount !== null) {
      answerCorrectTotal += correctCount;
    }
    questionCount += shard.questionCount;
    answeredCount += shard.answeredCount;
    weightedEvidenceRecall += shard.averageEvidenceRecall * shard.questionCount;
    fullyRetrievedCount += shard.fullyRetrievedCount;
    noiseTurnTotal += shard.noiseTurnTotal;

    byCategory.set(shard.category, {
      answerAccuracy: shard.answerAccuracy,
      answerCorrectCount: correctCount,
      answeredCount: shard.answeredCount,
      averageEvidenceRecall: shard.averageEvidenceRecall,
      crossSessionChainReady: shard.crossSessionChainReady,
      fullyRetrievedCount: shard.fullyRetrievedCount,
      fullyRetrievedShare: divideOrZero(
        shard.fullyRetrievedCount,
        shard.questionCount,
      ),
      noiseTurnTotal: shard.noiseTurnTotal,
      questionCount: shard.questionCount,
      reportPath: reportInput.path,
      sourceRunId: reportInput.report.runId,
    });
    sourceReports.push({
      category: shard.category,
      path: reportInput.path,
      questionCount: shard.questionCount,
      runId: reportInput.report.runId,
    });
  }

  const missingCategories = requiredCategories.filter(
    (category) => !byCategory.has(category),
  );
  if (missingCategories.length > 0) {
    throw new Error(
      `Missing LoCoMo category shard(s): ${missingCategories.join(", ")}.`,
    );
  }

  const categories = {} as Record<LocomoQaCategory, LocomoCategoryShardSummary>;
  for (const category of requiredCategories) {
    const summary = byCategory.get(category);
    if (summary === undefined) {
      throw new Error(`Missing LoCoMo category shard: ${category}.`);
    }
    categories[category] = summary;
  }

  const answerAccuracy =
    answerCorrectTotal === null
      ? null
      : divideOrZero(answerCorrectTotal, answeredCount);

  return {
    answerEvaluation: first.answerEvaluation,
    benchmark: "locomo",
    categories,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    mode: first.mode,
    outputPath: input.outputPath ?? null,
    overall: {
      answerAccuracy,
      answerCorrectCount: answerCorrectTotal,
      answeredCount,
      averageEvidenceRecall: divideOrZero(weightedEvidenceRecall, questionCount),
      executionFailures: 0,
      fullyRetrievedCount,
      fullyRetrievedShare: divideOrZero(fullyRetrievedCount, questionCount),
      noiseTurnTotal,
      questionCount,
    },
    phase: "phase-65",
    requiredCategories,
    runId: input.runId ?? "locomo-category-summary-current",
    semanticCandidateEmbeddingSource: first.semanticCandidateEmbeddingSource,
    semanticCandidates: first.semanticCandidates,
    sourceReports,
  };
}

export async function runLocomoCategorySummary(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{ outputPath: string; summary: LocomoCategorySummaryReport }> {
  const options = parseLocomoCategorySummaryCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const runId = options.runId ?? "locomo-category-summary-current";
  const outputPath =
    options.outputPath ?? defaultOutputPath(options.reportPaths, runId);

  const reports: LocomoCategoryReportInput[] = [];
  for (const path of options.reportPaths) {
    const parsed = JSON.parse(await readFileImpl(path)) as unknown;
    assertSmokeReport(parsed, path);
    reports.push({ path, report: parsed });
  }

  const summary = summarizeLocomoCategoryReports({
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    outputPath,
    reports,
    runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { outputPath, summary };
}

if (import.meta.main) {
  runLocomoCategorySummary(process.argv)
    .then(({ outputPath, summary }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            outputPath,
            overall: summary.overall,
            runId: summary.runId,
            sourceReports: summary.sourceReports,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo category summary failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
