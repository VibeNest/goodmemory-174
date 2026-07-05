// LoCoMo candidate-admission selector. This builds deterministic question
// manifests from paired retrieval/live reports so widened-admission work can
// target concrete missing-evidence and noise rows instead of category averages.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  LOCOMO_QA_CATEGORIES,
  type LocomoQaCategory,
} from "../src/eval/locomo";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
} from "./cli-options";
import {
  LOCOMO_STABLE_EXPERIMENT_METADATA_FIELDS,
  assertLocomoReportHasNoExecutionFailures,
  assertLocomoReportInputsHaveDistinctPaths,
  assertLocomoReportMetadataCompatible,
  assertLocomoReportQuestionCountMatchesCases,
} from "./locomo-report-compatibility";
import type {
  LocomoQuestionRetrieval,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_CANDIDATE_ADMISSION_SLICE_FILE_NAME =
  "candidate-admission-slice.json";

const GENERATED_BY =
  "scripts/select-phase-65-locomo-candidate-admission-slice.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; not a public release or benchmark claim.";
const DEFAULT_PER_BUCKET = 10;

type SelectionBucketName =
  | "candidateFullRetrievalGain"
  | "noisyFullRecallWrong"
  | "partialRetrievalGainStillMissing"
  | "stubbornMissingEvidence";

type AnswerTransition =
  | "baselineOnlyScored"
  | "candidateOnlyScored"
  | "improved"
  | "regressed"
  | "sameCorrect"
  | "sameWrong"
  | "unscored";

interface CliOptions {
  baselineReportPath: string;
  candidateReportPath: string;
  outputPath?: string;
  perBucket: number;
  runId?: string;
}

interface ReportInput {
  path: string;
  report: LocomoSmokeReport;
}

interface QuestionSide {
  answerCorrect: boolean | null;
  evidenceRecall: number;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnCount: number;
  noiseTurnCount: number;
}

interface SelectedQuestion {
  answerTransition: AnswerTransition;
  baseline: QuestionSide;
  bucket: SelectionBucketName;
  candidate: QuestionSide;
  caseId: string;
  category: LocomoQaCategory;
  evidenceRecallDelta: number;
  lostEvidenceTurnIds: string[];
  newlyIntroducedNoiseTurnIds: string[];
  newlyRetrievedEvidenceTurnIds: string[];
  noiseTurnDelta: number;
  questionId: string;
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
}

export interface LocomoCandidateAdmissionSliceSelection {
  baselineReport: { path: string; runId: string };
  benchmark: "locomo";
  candidateReport: { path: string; runId: string };
  categories: Partial<Record<LocomoQaCategory, CategorySelection>>;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  outputPath: string | null;
  overall: {
    bucketCounts: Record<SelectionBucketName, BucketSummary>;
    categoryCount: number;
    perBucket: number;
    selectedQuestionCount: number;
  };
  phase: "phase-65";
  reanswerJobs: Array<{
    bucket: "noisyFullRecallWrong";
    category: LocomoQaCategory;
    questionCount: number;
    questionIds: string[];
    sourceReportPath: string;
    sourceRunId: string;
  }>;
  repairJobs: Array<{
    category: LocomoQaCategory;
    questionCount: number;
    questionIds: string[];
  }>;
  runId: string;
  sourceReports: Array<{
    path: string;
    questionCount: number;
    runId: string;
  }>;
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
  const baselineReportPath = resolveCliFlagValueStrict(argv, "--baseline-report");
  const candidateReportPath = resolveCliFlagValueStrict(argv, "--candidate-report");
  if (!baselineReportPath) {
    throw new Error(
      "LoCoMo candidate-admission slice selection requires --baseline-report.",
    );
  }
  if (!candidateReportPath) {
    throw new Error(
      "LoCoMo candidate-admission slice selection requires --candidate-report.",
    );
  }
  assertDistinctCliPathValues({
    firstFlag: "--baseline-report",
    firstValue: baselineReportPath,
    secondFlag: "--candidate-report",
    secondValue: candidateReportPath,
  });
  return {
    baselineReportPath,
    candidateReportPath,
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    perBucket: parsePositiveIntegerFlag(argv, "--per-bucket", DEFAULT_PER_BUCKET),
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

function questionIdentity(question: {
  caseId: string;
  questionId: string;
}): string {
  return `${question.caseId}:${question.questionId}`;
}

function answerTransition(input: {
  baseline: LocomoQuestionRetrieval;
  candidate: LocomoQuestionRetrieval;
}): AnswerTransition {
  const { baseline, candidate } = input;
  if (baseline.answerCorrect === null && candidate.answerCorrect === null) {
    return "unscored";
  }
  if (baseline.answerCorrect === null) {
    return "candidateOnlyScored";
  }
  if (candidate.answerCorrect === null) {
    return "baselineOnlyScored";
  }
  if (!baseline.answerCorrect && candidate.answerCorrect) {
    return "improved";
  }
  if (baseline.answerCorrect && !candidate.answerCorrect) {
    return "regressed";
  }
  return baseline.answerCorrect ? "sameCorrect" : "sameWrong";
}

function side(question: LocomoQuestionRetrieval): QuestionSide {
  return {
    answerCorrect: question.answerCorrect,
    evidenceRecall: question.evidenceRecall,
    goldEvidenceFullyRetrieved: question.goldEvidenceFullyRetrieved,
    missingEvidenceTurnCount: question.missingEvidenceTurnIds.length,
    noiseTurnCount: question.noiseTurnCount,
  };
}

function selectedQuestion(input: {
  baseline: LocomoQuestionRetrieval;
  bucket: SelectionBucketName;
  candidate: LocomoQuestionRetrieval;
}): SelectedQuestion {
  const baselineRetrieved = new Set(input.baseline.retrievedTurnIds);
  const candidateRetrieved = new Set(input.candidate.retrievedTurnIds);
  const baselineNoise = new Set(input.baseline.noiseTurnIds);
  return {
    answerTransition: answerTransition(input),
    baseline: side(input.baseline),
    bucket: input.bucket,
    candidate: side(input.candidate),
    caseId: input.baseline.caseId,
    category: input.baseline.category,
    evidenceRecallDelta:
      input.candidate.evidenceRecall - input.baseline.evidenceRecall,
    lostEvidenceTurnIds: input.baseline.evidenceTurnIds.filter(
      (turnId) => baselineRetrieved.has(turnId) && !candidateRetrieved.has(turnId),
    ),
    newlyIntroducedNoiseTurnIds: input.candidate.noiseTurnIds.filter(
      (turnId) => !baselineNoise.has(turnId),
    ),
    newlyRetrievedEvidenceTurnIds: input.candidate.evidenceTurnIds.filter(
      (turnId) =>
        !baselineRetrieved.has(turnId) && candidateRetrieved.has(turnId),
    ),
    noiseTurnDelta:
      input.candidate.noiseTurnCount - input.baseline.noiseTurnCount,
    questionId: input.baseline.questionId,
  };
}

function byIdentity(
  left: { caseId: string; questionId: string },
  right: { caseId: string; questionId: string },
): number {
  return questionIdentity(left).localeCompare(questionIdentity(right));
}

function byFullRetrievalGain(
  left: SelectedQuestion,
  right: SelectedQuestion,
): number {
  if (right.evidenceRecallDelta !== left.evidenceRecallDelta) {
    return right.evidenceRecallDelta - left.evidenceRecallDelta;
  }
  if (left.candidate.noiseTurnCount !== right.candidate.noiseTurnCount) {
    return left.candidate.noiseTurnCount - right.candidate.noiseTurnCount;
  }
  if (left.noiseTurnDelta !== right.noiseTurnDelta) {
    return left.noiseTurnDelta - right.noiseTurnDelta;
  }
  return byIdentity(left, right);
}

function byPartialStillMissing(
  left: SelectedQuestion,
  right: SelectedQuestion,
): number {
  if (
    left.candidate.missingEvidenceTurnCount !==
    right.candidate.missingEvidenceTurnCount
  ) {
    return (
      left.candidate.missingEvidenceTurnCount -
      right.candidate.missingEvidenceTurnCount
    );
  }
  if (right.evidenceRecallDelta !== left.evidenceRecallDelta) {
    return right.evidenceRecallDelta - left.evidenceRecallDelta;
  }
  if (left.candidate.noiseTurnCount !== right.candidate.noiseTurnCount) {
    return left.candidate.noiseTurnCount - right.candidate.noiseTurnCount;
  }
  return byIdentity(left, right);
}

function byStubbornMissingEvidence(
  left: SelectedQuestion,
  right: SelectedQuestion,
): number {
  if (left.candidate.evidenceRecall !== right.candidate.evidenceRecall) {
    return left.candidate.evidenceRecall - right.candidate.evidenceRecall;
  }
  if (
    right.candidate.missingEvidenceTurnCount !==
    left.candidate.missingEvidenceTurnCount
  ) {
    return (
      right.candidate.missingEvidenceTurnCount -
      left.candidate.missingEvidenceTurnCount
    );
  }
  if (left.candidate.noiseTurnCount !== right.candidate.noiseTurnCount) {
    return left.candidate.noiseTurnCount - right.candidate.noiseTurnCount;
  }
  return byIdentity(left, right);
}

function byNoisyWrong(
  left: SelectedQuestion,
  right: SelectedQuestion,
): number {
  if (right.candidate.noiseTurnCount !== left.candidate.noiseTurnCount) {
    return right.candidate.noiseTurnCount - left.candidate.noiseTurnCount;
  }
  if (right.noiseTurnDelta !== left.noiseTurnDelta) {
    return right.noiseTurnDelta - left.noiseTurnDelta;
  }
  return byIdentity(left, right);
}

function emptyBucketSummaries(): Record<SelectionBucketName, BucketSummary> {
  return {
    candidateFullRetrievalGain: { availableCount: 0, selectedCount: 0 },
    noisyFullRecallWrong: { availableCount: 0, selectedCount: 0 },
    partialRetrievalGainStillMissing: { availableCount: 0, selectedCount: 0 },
    stubbornMissingEvidence: { availableCount: 0, selectedCount: 0 },
  };
}

function selectBucket(input: {
  bucket: SelectionBucketName;
  candidates: SelectedQuestion[];
  perBucket: number;
  seen: Set<string>;
  sorter: (left: SelectedQuestion, right: SelectedQuestion) => number;
}): SelectedQuestion[] {
  const selected: SelectedQuestion[] = [];
  for (const question of [...input.candidates].sort(input.sorter)) {
    const key = `${question.caseId}::${question.questionId}`;
    if (input.seen.has(key)) {
      continue;
    }
    input.seen.add(key);
    selected.push({ ...question, bucket: input.bucket });
    if (selected.length >= input.perBucket) {
      break;
    }
  }
  return selected;
}

function selectCategory(input: {
  deltas: SelectedQuestion[];
  perBucket: number;
}): CategorySelection | null {
  const candidateFullRetrievalGain = input.deltas.filter(
    (question) =>
      !question.baseline.goldEvidenceFullyRetrieved &&
      question.candidate.goldEvidenceFullyRetrieved,
  );
  const partialRetrievalGainStillMissing = input.deltas.filter(
    (question) =>
      question.evidenceRecallDelta > 0 &&
      !question.candidate.goldEvidenceFullyRetrieved,
  );
  const stubbornMissingEvidence = input.deltas.filter(
    (question) =>
      question.evidenceRecallDelta <= 0 &&
      !question.candidate.goldEvidenceFullyRetrieved,
  );
  const noisyFullRecallWrong = input.deltas.filter(
    (question) =>
      question.candidate.answerCorrect === false &&
      question.candidate.goldEvidenceFullyRetrieved &&
      question.candidate.noiseTurnCount > 0,
  );
  const seen = new Set<string>();
  const selectedQuestions = [
    ...selectBucket({
      bucket: "candidateFullRetrievalGain",
      candidates: candidateFullRetrievalGain,
      perBucket: input.perBucket,
      seen,
      sorter: byFullRetrievalGain,
    }),
    ...selectBucket({
      bucket: "partialRetrievalGainStillMissing",
      candidates: partialRetrievalGainStillMissing,
      perBucket: input.perBucket,
      seen,
      sorter: byPartialStillMissing,
    }),
    ...selectBucket({
      bucket: "stubbornMissingEvidence",
      candidates: stubbornMissingEvidence,
      perBucket: input.perBucket,
      seen,
      sorter: byStubbornMissingEvidence,
    }),
    ...selectBucket({
      bucket: "noisyFullRecallWrong",
      candidates: noisyFullRecallWrong,
      perBucket: input.perBucket,
      seen,
      sorter: byNoisyWrong,
    }),
  ];
  if (selectedQuestions.length === 0) {
    return null;
  }

  const buckets = emptyBucketSummaries();
  buckets.candidateFullRetrievalGain.availableCount =
    candidateFullRetrievalGain.length;
  buckets.partialRetrievalGainStillMissing.availableCount =
    partialRetrievalGainStillMissing.length;
  buckets.stubbornMissingEvidence.availableCount = stubbornMissingEvidence.length;
  buckets.noisyFullRecallWrong.availableCount = noisyFullRecallWrong.length;
  for (const question of selectedQuestions) {
    buckets[question.bucket].selectedCount += 1;
  }

  return {
    buckets,
    questionCount: selectedQuestions.length,
    questionIds: selectedQuestions.map((question) => question.questionId),
    selectedQuestions,
  };
}

function questionMap(
  report: LocomoSmokeReport,
): Map<string, LocomoQuestionRetrieval> {
  return new Map(report.cases.map((question) => [questionKey(question), question]));
}

function validateCompatibleReports(input: {
  baseline: ReportInput;
  candidate: ReportInput;
}): void {
  assertLocomoReportInputsHaveDistinctPaths(input);
  assertLocomoReportMetadataCompatible({
    candidate: input.candidate,
    fields: LOCOMO_STABLE_EXPERIMENT_METADATA_FIELDS,
    reference: input.baseline,
  });
  assertLocomoReportHasNoExecutionFailures(input.baseline);
  assertLocomoReportHasNoExecutionFailures(input.candidate);
  assertLocomoReportQuestionCountMatchesCases(input.baseline);
  assertLocomoReportQuestionCountMatchesCases(input.candidate);
}

function buildQuestionDeltas(input: {
  baseline: ReportInput;
  candidate: ReportInput;
}): SelectedQuestion[] {
  const baselineByQuestion = questionMap(input.baseline.report);
  const candidateByQuestion = questionMap(input.candidate.report);
  const deltas: SelectedQuestion[] = [];

  for (const [key, baselineQuestion] of baselineByQuestion) {
    const candidateQuestion = candidateByQuestion.get(key);
    if (!candidateQuestion) {
      throw new Error(`Candidate report is missing question ${key}.`);
    }
    if (baselineQuestion.category !== candidateQuestion.category) {
      throw new Error(
        `Question ${key} category mismatch: baseline=${baselineQuestion.category}, ` +
          `candidate=${candidateQuestion.category}.`,
      );
    }
    deltas.push(
      selectedQuestion({
        baseline: baselineQuestion,
        bucket: "stubbornMissingEvidence",
        candidate: candidateQuestion,
      }),
    );
  }

  for (const key of candidateByQuestion.keys()) {
    if (!baselineByQuestion.has(key)) {
      throw new Error(`Baseline report is missing question ${key}.`);
    }
  }

  return deltas.sort(byIdentity);
}

function mergeBucketCounts(
  target: Record<SelectionBucketName, BucketSummary>,
  source: Record<SelectionBucketName, BucketSummary>,
): void {
  for (const bucket of Object.keys(source) as SelectionBucketName[]) {
    target[bucket].availableCount += source[bucket].availableCount;
    target[bucket].selectedCount += source[bucket].selectedCount;
  }
}

function defaultOutputPath(candidateReportPath: string, runId: string): string {
  return join(
    dirname(candidateReportPath),
    "..",
    runId,
    LOCOMO_CANDIDATE_ADMISSION_SLICE_FILE_NAME,
  );
}

export function selectLocomoCandidateAdmissionSlice(input: {
  baseline: ReportInput;
  candidate: ReportInput;
  generatedAt?: string;
  outputPath?: string;
  perBucket?: number;
  runId?: string;
}): LocomoCandidateAdmissionSliceSelection {
  validateCompatibleReports(input);
  const perBucket = input.perBucket ?? DEFAULT_PER_BUCKET;
  const deltas = buildQuestionDeltas(input);
  const categories: Partial<Record<LocomoQaCategory, CategorySelection>> = {};
  const overallBucketCounts = emptyBucketSummaries();
  let selectedQuestionCount = 0;

  for (const category of LOCOMO_QA_CATEGORIES) {
    const categoryDeltas = deltas.filter((delta) => delta.category === category);
    if (categoryDeltas.length === 0) {
      continue;
    }
    const selection = selectCategory({
      deltas: categoryDeltas,
      perBucket,
    });
    if (!selection) {
      continue;
    }
    categories[category] = selection;
    selectedQuestionCount += selection.questionCount;
    mergeBucketCounts(overallBucketCounts, selection.buckets);
  }

  const repairJobs = LOCOMO_QA_CATEGORIES.flatMap((category) => {
    const selection = categories[category];
    if (!selection) {
      return [];
    }
    return [
      {
        category,
        questionCount: selection.questionCount,
        questionIds: selection.questionIds,
      },
    ];
  });
  const reanswerJobs = LOCOMO_QA_CATEGORIES.flatMap((category) => {
    const selection = categories[category];
    if (!selection) {
      return [];
    }
    const questionIds = selection.selectedQuestions
      .filter(
        (question) =>
          question.candidate.answerCorrect === false &&
          question.candidate.goldEvidenceFullyRetrieved &&
          question.candidate.noiseTurnCount > 0,
      )
      .map((question) => question.questionId);
    if (questionIds.length === 0) {
      return [];
    }
    return [
      {
        bucket: "noisyFullRecallWrong" as const,
        category,
        questionCount: questionIds.length,
        questionIds,
        sourceReportPath: input.candidate.path,
        sourceRunId: input.candidate.report.runId,
      },
    ];
  });

  return {
    baselineReport: {
      path: input.baseline.path,
      runId: input.baseline.report.runId,
    },
    benchmark: "locomo",
    candidateReport: {
      path: input.candidate.path,
      runId: input.candidate.report.runId,
    },
    categories,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    outputPath: input.outputPath ?? null,
    overall: {
      bucketCounts: overallBucketCounts,
      categoryCount: repairJobs.length,
      perBucket,
      selectedQuestionCount,
    },
    phase: "phase-65",
    reanswerJobs,
    repairJobs,
    runId: input.runId ?? "locomo-candidate-admission-slice-current",
    sourceReports: [
      {
        path: input.candidate.path,
        questionCount: input.candidate.report.questionCount,
        runId: input.candidate.report.runId,
      },
    ],
  };
}

export async function runLocomoCandidateAdmissionSliceSelection(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{
  analysis: LocomoCandidateAdmissionSliceSelection;
  outputPath: string;
}> {
  const options = parseCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const runId = options.runId ?? "locomo-candidate-admission-slice-current";
  const outputPath =
    options.outputPath ?? defaultOutputPath(options.candidateReportPath, runId);

  const baselineParsed = JSON.parse(
    await readFileImpl(options.baselineReportPath),
  ) as unknown;
  const candidateParsed = JSON.parse(
    await readFileImpl(options.candidateReportPath),
  ) as unknown;
  assertSmokeReport(baselineParsed, options.baselineReportPath);
  assertSmokeReport(candidateParsed, options.candidateReportPath);

  const analysis = selectLocomoCandidateAdmissionSlice({
    baseline: {
      path: options.baselineReportPath,
      report: baselineParsed,
    },
    candidate: {
      path: options.candidateReportPath,
      report: candidateParsed,
    },
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    outputPath,
    perBucket: options.perBucket,
    runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  runLocomoCandidateAdmissionSliceSelection(process.argv)
    .then(({ analysis, outputPath }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            outputPath,
            overall: analysis.overall,
            reanswerJobs: analysis.reanswerJobs,
            repairJobs: analysis.repairJobs,
            runId: analysis.runId,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo candidate-admission slice selection failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
