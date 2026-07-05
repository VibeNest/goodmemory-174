// LoCoMo answer-policy selector. This builds deterministic re-answer slices for
// prompt-policy probes, so safety checks do not rely on hand-picked question IDs.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  LOCOMO_QA_CATEGORIES,
  type LocomoQaCategory,
} from "../src/eval/locomo";
import { resolveCliFlagValueStrict } from "./cli-options";
import {
  LOCOMO_CATEGORY_GAP_METADATA_FIELDS,
  assertLocomoReportHasCompleteLiveAnswers,
  assertLocomoReportHasNoExecutionFailures,
  assertLocomoReportInputsHaveUniquePaths,
  assertLocomoReportMetadataCompatible,
  assertLocomoReportQuestionCountMatchesCases,
} from "./locomo-report-compatibility";
import type {
  LocomoQuestionRetrieval,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_ANSWER_POLICY_SLICE_FILE_NAME =
  "answer-policy-slice.json";

const GENERATED_BY = "scripts/select-phase-65-locomo-answer-policy-slice.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; not a public release or benchmark claim.";
const DEFAULT_PER_BUCKET = 5;

type SelectionBucketName =
  | "baselineCorrectHighNoise"
  | "wrongFullRecallNoisy"
  | "wrongMissingEvidence";

interface CliOptions {
  outputPath?: string;
  perBucket: number;
  reportPaths: string[];
  runId?: string;
}

interface ReportInput {
  path: string;
  report: LocomoSmokeReport;
}

interface SelectedQuestion {
  answerCorrect: boolean | null;
  bucket: SelectionBucketName;
  caseId: string;
  category: LocomoQaCategory;
  evidenceRecall: number;
  generatedAnswer: string | null;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnCount: number;
  noiseTurnCount: number;
  questionId: string;
  sourceReportPath: string;
  sourceRunId: string;
}

interface BucketSummary {
  availableCount: number;
  selectedCount: number;
}

interface CategorySelection {
  buckets: Record<SelectionBucketName, BucketSummary>;
  questionCount: number;
  questionIds: string[];
  selectedQuestions: SelectedQuestion[];
  sourceReports: Array<{
    path: string;
    questionCount: number;
    runId: string;
  }>;
}

interface SourceQuestion {
  path: string;
  question: LocomoQuestionRetrieval;
  runId: string;
}

export interface LocomoAnswerPolicySliceSelection {
  benchmark: "locomo";
  categories: Partial<Record<LocomoQaCategory, CategorySelection>>;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  outputPath: string | null;
  overall: {
    categoryCount: number;
    perBucket: number;
    selectedQuestionCount: number;
  };
  phase: "phase-65";
  reanswerJobs: Array<{
    category: LocomoQaCategory;
    questionCount: number;
    questionIds: string[];
    sourceReportPath: string;
    sourceRunId: string;
  }>;
  runId: string;
  sourceReports: Array<{
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
    index += 1;
  }
  return values;
}

function parsePositiveIntegerFlag(
  argv: readonly string[],
  flagName: string,
  defaultValue: number,
): number {
  const raw = resolveCliFlagValueStrict(argv, flagName);
  if (raw === undefined) {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const reportPaths = parseStringListFlag(argv, "--report");
  if (reportPaths.length === 0) {
    throw new Error(
      "LoCoMo answer-policy slice selection requires --report <smoke-report.json>.",
    );
  }
  return {
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    perBucket: parsePositiveIntegerFlag(argv, "--per-bucket", DEFAULT_PER_BUCKET),
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

function questionKey(question: LocomoQuestionRetrieval): string {
  return `${question.caseId}::${question.questionId}`;
}

function byQuestionIdentity(left: SourceQuestion, right: SourceQuestion): number {
  return `${left.question.caseId}:${left.question.questionId}`.localeCompare(
    `${right.question.caseId}:${right.question.questionId}`,
  );
}

function byHighNoiseThenIdentity(
  left: SourceQuestion,
  right: SourceQuestion,
): number {
  if (right.question.noiseTurnCount !== left.question.noiseTurnCount) {
    return right.question.noiseTurnCount - left.question.noiseTurnCount;
  }
  if (left.question.evidenceRecall !== right.question.evidenceRecall) {
    return left.question.evidenceRecall - right.question.evidenceRecall;
  }
  return byQuestionIdentity(left, right);
}

function byMissingEvidenceRisk(
  left: SourceQuestion,
  right: SourceQuestion,
): number {
  if (left.question.evidenceRecall !== right.question.evidenceRecall) {
    return left.question.evidenceRecall - right.question.evidenceRecall;
  }
  if (
    right.question.missingEvidenceTurnIds.length !==
    left.question.missingEvidenceTurnIds.length
  ) {
    return (
      right.question.missingEvidenceTurnIds.length -
      left.question.missingEvidenceTurnIds.length
    );
  }
  if (right.question.noiseTurnCount !== left.question.noiseTurnCount) {
    return right.question.noiseTurnCount - left.question.noiseTurnCount;
  }
  return byQuestionIdentity(left, right);
}

function selectedQuestion(input: {
  bucket: SelectionBucketName;
  sourceQuestion: SourceQuestion;
}): SelectedQuestion {
  const { question } = input.sourceQuestion;
  return {
    answerCorrect: question.answerCorrect,
    bucket: input.bucket,
    caseId: question.caseId,
    category: question.category,
    evidenceRecall: question.evidenceRecall,
    generatedAnswer: question.generatedAnswer,
    goldEvidenceFullyRetrieved: question.goldEvidenceFullyRetrieved,
    missingEvidenceTurnCount: question.missingEvidenceTurnIds.length,
    noiseTurnCount: question.noiseTurnCount,
    questionId: question.questionId,
    sourceReportPath: input.sourceQuestion.path,
    sourceRunId: input.sourceQuestion.runId,
  };
}

function selectBucket(input: {
  bucket: SelectionBucketName;
  candidates: SourceQuestion[];
  perBucket: number;
  sorter: (left: SourceQuestion, right: SourceQuestion) => number;
  seen: Set<string>;
}): SelectedQuestion[] {
  const selected: SelectedQuestion[] = [];
  for (const sourceQuestion of [...input.candidates].sort(input.sorter)) {
    const key = questionKey(sourceQuestion.question);
    if (input.seen.has(key)) {
      continue;
    }
    input.seen.add(key);
    selected.push(selectedQuestion({ bucket: input.bucket, sourceQuestion }));
    if (selected.length >= input.perBucket) {
      break;
    }
  }
  return selected;
}

function emptyBucketSummaries(): Record<SelectionBucketName, BucketSummary> {
  return {
    baselineCorrectHighNoise: { availableCount: 0, selectedCount: 0 },
    wrongFullRecallNoisy: { availableCount: 0, selectedCount: 0 },
    wrongMissingEvidence: { availableCount: 0, selectedCount: 0 },
  };
}

function selectCategory(input: {
  category: LocomoQaCategory;
  perBucket: number;
  questions: SourceQuestion[];
}): CategorySelection | null {
  const baselineCorrectHighNoise = input.questions.filter(
    (sourceQuestion) => sourceQuestion.question.answerCorrect === true,
  );
  const wrongFullRecallNoisy = input.questions.filter(
    (sourceQuestion) =>
      sourceQuestion.question.answerCorrect === false &&
      sourceQuestion.question.goldEvidenceFullyRetrieved &&
      sourceQuestion.question.noiseTurnCount > 0,
  );
  const wrongMissingEvidence = input.questions.filter(
    (sourceQuestion) =>
      sourceQuestion.question.answerCorrect === false &&
      !sourceQuestion.question.goldEvidenceFullyRetrieved,
  );
  const seen = new Set<string>();
  const selectedQuestions = [
    ...selectBucket({
      bucket: "baselineCorrectHighNoise",
      candidates: baselineCorrectHighNoise,
      perBucket: input.perBucket,
      seen,
      sorter: byHighNoiseThenIdentity,
    }),
    ...selectBucket({
      bucket: "wrongFullRecallNoisy",
      candidates: wrongFullRecallNoisy,
      perBucket: input.perBucket,
      seen,
      sorter: byHighNoiseThenIdentity,
    }),
    ...selectBucket({
      bucket: "wrongMissingEvidence",
      candidates: wrongMissingEvidence,
      perBucket: input.perBucket,
      seen,
      sorter: byMissingEvidenceRisk,
    }),
  ];
  if (selectedQuestions.length === 0) {
    return null;
  }

  const buckets = emptyBucketSummaries();
  buckets.baselineCorrectHighNoise.availableCount =
    baselineCorrectHighNoise.length;
  buckets.wrongFullRecallNoisy.availableCount = wrongFullRecallNoisy.length;
  buckets.wrongMissingEvidence.availableCount = wrongMissingEvidence.length;
  for (const question of selectedQuestions) {
    buckets[question.bucket].selectedCount += 1;
  }
  const sourceReports = sourceReportsForSelectedQuestions(selectedQuestions);

  return {
    buckets,
    questionCount: selectedQuestions.length,
    questionIds: selectedQuestions.map((question) => question.questionId),
    selectedQuestions,
    sourceReports,
  };
}

function sourceReportsForSelectedQuestions(
  selectedQuestions: readonly SelectedQuestion[],
): CategorySelection["sourceReports"] {
  const sourceReports: CategorySelection["sourceReports"] = [];
  for (const question of selectedQuestions) {
    const sourceReport = sourceReports.find(
      (candidate) =>
        candidate.path === question.sourceReportPath &&
        candidate.runId === question.sourceRunId,
    );
    if (sourceReport) {
      sourceReport.questionCount += 1;
    } else {
      sourceReports.push({
        path: question.sourceReportPath,
        questionCount: 1,
        runId: question.sourceRunId,
      });
    }
  }
  return sourceReports;
}

function reanswerJobsForCategory(
  category: LocomoQaCategory,
  selection: CategorySelection,
): LocomoAnswerPolicySliceSelection["reanswerJobs"] {
  return selection.sourceReports.map((sourceReport) => {
    const questionIds = selection.selectedQuestions
      .filter(
        (question) =>
          question.sourceReportPath === sourceReport.path &&
          question.sourceRunId === sourceReport.runId,
      )
      .map((question) => question.questionId);
    return {
      category,
      questionCount: questionIds.length,
      questionIds,
      sourceReportPath: sourceReport.path,
      sourceRunId: sourceReport.runId,
    };
  });
}

function defaultOutputPath(reportPaths: readonly string[], runId: string): string {
  return join(
    dirname(reportPaths[0] ?? "."),
    "..",
    runId,
    LOCOMO_ANSWER_POLICY_SLICE_FILE_NAME,
  );
}

export function selectLocomoAnswerPolicySlice(input: {
  generatedAt?: string;
  outputPath?: string;
  perBucket?: number;
  reports: ReportInput[];
  runId?: string;
}): LocomoAnswerPolicySliceSelection {
  if (input.reports.length === 0) {
    throw new Error(
      "LoCoMo answer-policy slice selection requires at least one report.",
    );
  }
  assertLocomoReportInputsHaveUniquePaths(input.reports);
  const perBucket = input.perBucket ?? DEFAULT_PER_BUCKET;
  const categories: Partial<Record<LocomoQaCategory, CategorySelection>> = {};
  const questionsByCategory = new Map<
    LocomoQaCategory,
    {
      questions: SourceQuestion[];
    }
  >();
  const seenQuestionKeys = new Map<string, string>();
  const sourceReports: LocomoAnswerPolicySliceSelection["sourceReports"] = [];

  for (const { path, report } of input.reports) {
    assertLocomoReportMetadataCompatible({
      candidate: { path, report },
      fields: LOCOMO_CATEGORY_GAP_METADATA_FIELDS,
      reference: input.reports[0],
    });
    assertLocomoReportHasNoExecutionFailures({ path, report });
    assertLocomoReportQuestionCountMatchesCases({ path, report });
    assertLocomoReportHasCompleteLiveAnswers({ path, report });
    sourceReports.push({
      path,
      questionCount: report.questionCount,
      runId: report.runId,
    });
    for (const question of report.cases) {
      const key = questionKey(question);
      const duplicatePath = seenQuestionKeys.get(key);
      if (duplicatePath) {
        throw new Error(
          `LoCoMo answer-policy slice received duplicate question ${key} ` +
            `in ${path}; first seen in ${duplicatePath}.`,
        );
      }
      seenQuestionKeys.set(key, path);
      const group = questionsByCategory.get(question.category);
      const sourceQuestion = {
        path,
        question,
        runId: report.runId,
      };
      if (group) {
        group.questions.push(sourceQuestion);
      } else {
        questionsByCategory.set(question.category, {
          questions: [sourceQuestion],
        });
      }
    }
  }

  let selectedQuestionCount = 0;
  for (const category of LOCOMO_QA_CATEGORIES) {
    const group = questionsByCategory.get(category);
    if (!group) {
      continue;
    }
    const selection = selectCategory({
      category,
      perBucket,
      questions: group.questions,
    });
    if (!selection) {
      continue;
    }
    categories[category] = selection;
    selectedQuestionCount += selection.questionCount;
  }

  const reanswerJobs =
    LOCOMO_QA_CATEGORIES.flatMap((category) => {
      const selection = categories[category];
      if (!selection) {
        return [];
      }
      return reanswerJobsForCategory(category, selection);
    });
  const selectedCategoryCount = Object.keys(categories).length;

  return {
    benchmark: "locomo",
    categories,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    outputPath: input.outputPath ?? null,
    overall: {
      categoryCount: selectedCategoryCount,
      perBucket,
      selectedQuestionCount,
    },
    phase: "phase-65",
    reanswerJobs,
    runId: input.runId ?? "locomo-answer-policy-slice-current",
    sourceReports,
  };
}

export async function runLocomoAnswerPolicySliceSelection(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{ analysis: LocomoAnswerPolicySliceSelection; outputPath: string }> {
  const options = parseCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const runId = options.runId ?? "locomo-answer-policy-slice-current";
  const outputPath =
    options.outputPath ?? defaultOutputPath(options.reportPaths, runId);

  const reports: ReportInput[] = [];
  for (const path of options.reportPaths) {
    const parsed = JSON.parse(await readFileImpl(path)) as unknown;
    assertSmokeReport(parsed, path);
    reports.push({ path, report: parsed });
  }

  const analysis = selectLocomoAnswerPolicySlice({
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    outputPath,
    perBucket: options.perBucket,
    reports,
    runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  runLocomoAnswerPolicySliceSelection(process.argv)
    .then(({ analysis, outputPath }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            outputPath,
            overall: analysis.overall,
            reanswerJobs: analysis.reanswerJobs,
            runId: analysis.runId,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo answer-policy slice selection failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
