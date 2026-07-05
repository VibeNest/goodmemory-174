// LoCoMo near-miss label analyzer. This is a deterministic post-processor for
// live-delta answerTokenF1NearMiss rows, joining them back to the benchmark
// source so label-compatibility work can inspect token overlap without another
// live answer run.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  LOCOMO_F1_PASS_THRESHOLD,
  LOCOMO_QA_CATEGORIES,
  locomoTokenF1,
  tokenizeLocomoAnswer,
} from "../src/eval/locomo";
import type {
  LocomoCase,
  LocomoQaCategory,
  LocomoQuestion,
} from "../src/eval/locomo";
import type {
  LocomoLiveDeltaAnalysis,
  LocomoLiveQuestionDelta,
} from "./analyze-phase-65-locomo-live-delta";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  assertLocomoReportHasCompleteLiveAnswers,
  assertLocomoReportHasNoExecutionFailures,
  assertLocomoReportQuestionCountMatchesCases,
} from "./locomo-report-compatibility";
import { loadLocomoCases } from "./run-phase-65-locomo-smoke";
import type {
  LocomoQuestionRetrieval,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_NEAR_MISS_LABEL_ANALYSIS_FILE_NAME =
  "near-miss-label-analysis.json";

const GENERATED_BY = "scripts/analyze-phase-65-locomo-near-miss-labels.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; not a public release or benchmark claim.";

const HIGH_TOKEN_OVERLAP_RATIO = 0.75;
const NUMERIC_OR_FREQUENCY_TOKENS = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "once",
  "twice",
  "thrice",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "time",
  "times",
]);

export type LocomoNearMissDiagnosis =
  | "balanced-partial-overlap"
  | "numeric-or-frequency-format"
  | "over-specified-answer"
  | "under-specified-answer"
  | "zero-token-overlap";

interface CliOptions {
  liveDeltaPath: string;
  outputPath?: string;
  runId?: string;
}

interface TokenOverlap {
  extraGeneratedTokens: string[];
  generatedTokenCount: number;
  goldTokenCount: number;
  missingGoldTokens: string[];
  overlapTokenCount: number;
  overlapTokens: string[];
  precision: number;
  recall: number;
}

export interface LocomoNearMissLabelRow {
  answerTransition: LocomoLiveQuestionDelta["answerTransition"];
  caseId: string;
  category: LocomoQaCategory;
  candidateAnswerTokenF1: number;
  candidateEvidenceRecall: number;
  candidateGoldEvidenceFullyRetrieved: boolean;
  candidateMissingEvidenceTurnIds: string[];
  candidateNoiseTurnCount: number;
  candidateNoiseTurnIds: string[];
  candidateRetrievedTurnIds: string[];
  computedAnswerTokenF1: number;
  diagnosis: LocomoNearMissDiagnosis;
  generatedAnswer: string;
  goldAnswer: string;
  question: string;
  questionId: string;
  retrievalTransition: LocomoLiveQuestionDelta["retrievalTransition"];
  tokenOverlap: TokenOverlap;
}

interface LocomoNearMissLabelSummary {
  averageCandidateAnswerTokenF1: number;
  diagnosisCounts: Record<LocomoNearMissDiagnosis, number>;
  fullRecallCount: number;
  nearMissCount: number;
  partialRecallCount: number;
  questionCount: number;
  questionIds: string[];
  selectedQuestionCount: number;
  zeroRecallCount: number;
}

interface LabelAccumulator {
  answerTokenF1Total: number;
  diagnosisCounts: Record<LocomoNearMissDiagnosis, number>;
  fullRecallCount: number;
  nearMissCount: number;
  partialRecallCount: number;
  questionIds: string[];
  zeroRecallCount: number;
}

interface LocomoNearMissRepairJob {
  category: LocomoQaCategory;
  diagnosis: LocomoNearMissDiagnosis;
  questionCount: number;
  questionIds: string[];
  retrievalBucket: "partial" | "zero";
}

export interface LocomoNearMissLabelAnalysis {
  benchmark: "locomo";
  candidateReport: { path: string; runId: string };
  categories: Partial<Record<LocomoQaCategory, LocomoNearMissLabelSummary>>;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  liveDeltaReport: { path: string; runId: string };
  outputPath: string | null;
  overall: LocomoNearMissLabelSummary;
  phase: "phase-65";
  questionIds: string[];
  repairJobs: LocomoNearMissRepairJob[];
  rows: LocomoNearMissLabelRow[];
  runId: string;
  sourceReports: Array<{
    path: string;
    questionCount: number;
    runId: string;
  }>;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const liveDeltaPath = resolveCliFlagValueStrict(argv, "--live-delta");
  if (!liveDeltaPath) {
    throw new Error(
      "LoCoMo near-miss label analysis requires --live-delta <live-delta.json>.",
    );
  }
  return {
    liveDeltaPath,
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertLiveDeltaAnalysis(
  value: unknown,
  path: string,
): asserts value is LocomoLiveDeltaAnalysis {
  if (!isRecord(value)) {
    throw new Error(`Live-delta report ${path} must be a JSON object.`);
  }
  if (value.phase !== "phase-65" || value.benchmark !== "locomo") {
    throw new Error(`Live-delta report ${path} is not a Phase 65 LoCoMo report.`);
  }
  if (!Array.isArray(value.answerTokenF1NearMisses)) {
    throw new Error(
      `Live-delta report ${path} must include answerTokenF1NearMisses[].`,
    );
  }
  if (!isRecord(value.candidateReport)) {
    throw new Error(`Live-delta report ${path} must include candidateReport.`);
  }
  if (
    typeof value.candidateReport.path !== "string" ||
    typeof value.candidateReport.runId !== "string"
  ) {
    throw new Error(
      `Live-delta report ${path} candidateReport must include path and runId.`,
    );
  }
  if (typeof value.runId !== "string") {
    throw new Error(`Live-delta report ${path} must include runId.`);
  }
}

function assertSmokeReport(
  value: unknown,
  path: string,
): asserts value is LocomoSmokeReport {
  if (!isRecord(value)) {
    throw new Error(`Candidate report ${path} must be a JSON object.`);
  }
  if (value.phase !== "phase-65" || value.benchmark !== "locomo") {
    throw new Error(`Candidate report ${path} is not a Phase 65 LoCoMo report.`);
  }
  if (!Array.isArray(value.cases)) {
    throw new Error(`Candidate report ${path} must include cases[].`);
  }
}

function defaultOutputPath(liveDeltaPath: string, runId: string): string {
  return join(
    dirname(liveDeltaPath),
    "..",
    runId,
    LOCOMO_NEAR_MISS_LABEL_ANALYSIS_FILE_NAME,
  );
}

function assertOutputPathDoesNotOverwriteSource(input: {
  outputPath: string;
  sourceFlag: string;
  sourcePath: string;
}): void {
  assertDistinctCliPathValues({
    firstFlag: "--output-path",
    firstValue: input.outputPath,
    secondFlag: input.sourceFlag,
    secondValue: input.sourcePath,
  });
}

function emptyDiagnosisCounts(): Record<LocomoNearMissDiagnosis, number> {
  return {
    "balanced-partial-overlap": 0,
    "numeric-or-frequency-format": 0,
    "over-specified-answer": 0,
    "under-specified-answer": 0,
    "zero-token-overlap": 0,
  };
}

function emptyAccumulator(): LabelAccumulator {
  return {
    answerTokenF1Total: 0,
    diagnosisCounts: emptyDiagnosisCounts(),
    fullRecallCount: 0,
    nearMissCount: 0,
    partialRecallCount: 0,
    questionIds: [],
    zeroRecallCount: 0,
  };
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function questionLookupKey(input: { caseId: string; questionId: string }): string {
  return `${input.caseId}::${input.questionId}`;
}

function buildCandidateQuestionMap(
  report: LocomoSmokeReport,
): Map<string, LocomoQuestionRetrieval> {
  const questions = new Map<string, LocomoQuestionRetrieval>();
  for (const question of report.cases) {
    const key = questionLookupKey(question);
    if (questions.has(key)) {
      throw new Error(
        `Candidate report ${report.runId} contains duplicate question ${key}.`,
      );
    }
    questions.set(key, question);
  }
  return questions;
}

function buildBenchmarkQuestionMap(
  cases: readonly LocomoCase[],
): Map<string, LocomoQuestion> {
  const questions = new Map<string, LocomoQuestion>();
  for (const testCase of cases) {
    for (const question of testCase.questions) {
      const key = questionLookupKey({
        caseId: testCase.caseId,
        questionId: question.questionId,
      });
      if (questions.has(key)) {
        throw new Error(`Benchmark source contains duplicate question ${key}.`);
      }
      questions.set(key, question);
    }
  }
  return questions;
}

function countTokens(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function expandTokenCounts(counts: ReadonlyMap<string, number>): string[] {
  const tokens: string[] = [];
  for (const [token, count] of [...counts].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    for (let index = 0; index < count; index += 1) {
      tokens.push(token);
    }
  }
  return tokens;
}

function tokenOverlap(
  generatedAnswer: string,
  goldAnswer: string,
): TokenOverlap {
  const generatedTokens = tokenizeLocomoAnswer(generatedAnswer);
  const goldTokens = tokenizeLocomoAnswer(goldAnswer);
  const remainingGoldCounts = countTokens(goldTokens);
  const overlapCounts = new Map<string, number>();
  const extraGeneratedCounts = new Map<string, number>();

  for (const token of generatedTokens) {
    const remainingGold = remainingGoldCounts.get(token) ?? 0;
    if (remainingGold > 0) {
      remainingGoldCounts.set(token, remainingGold - 1);
      overlapCounts.set(token, (overlapCounts.get(token) ?? 0) + 1);
    } else {
      extraGeneratedCounts.set(token, (extraGeneratedCounts.get(token) ?? 0) + 1);
    }
  }

  const overlapTokens = expandTokenCounts(overlapCounts);
  return {
    extraGeneratedTokens: expandTokenCounts(extraGeneratedCounts),
    generatedTokenCount: generatedTokens.length,
    goldTokenCount: goldTokens.length,
    missingGoldTokens: expandTokenCounts(remainingGoldCounts),
    overlapTokenCount: overlapTokens.length,
    overlapTokens,
    precision: divideOrZero(overlapTokens.length, generatedTokens.length),
    recall: divideOrZero(overlapTokens.length, goldTokens.length),
  };
}

function hasNumericOrFrequencySignal(overlap: TokenOverlap): boolean {
  return [
    ...overlap.extraGeneratedTokens,
    ...overlap.missingGoldTokens,
    ...overlap.overlapTokens,
  ].some(
    (token) => NUMERIC_OR_FREQUENCY_TOKENS.has(token) || /^\d+$/u.test(token),
  );
}

function diagnoseNearMiss(overlap: TokenOverlap): LocomoNearMissDiagnosis {
  if (overlap.overlapTokenCount === 0) {
    return "zero-token-overlap";
  }
  if (hasNumericOrFrequencySignal(overlap)) {
    return "numeric-or-frequency-format";
  }
  if (
    overlap.precision >= HIGH_TOKEN_OVERLAP_RATIO &&
    overlap.recall < HIGH_TOKEN_OVERLAP_RATIO
  ) {
    return "under-specified-answer";
  }
  if (
    overlap.recall >= HIGH_TOKEN_OVERLAP_RATIO &&
    overlap.precision < HIGH_TOKEN_OVERLAP_RATIO
  ) {
    return "over-specified-answer";
  }
  return "balanced-partial-overlap";
}

function validateCandidateReport(input: {
  candidate: LocomoSmokeReport;
  candidatePath: string;
  liveDelta: LocomoLiveDeltaAnalysis;
  liveDeltaPath: string;
}): void {
  if (resolve(input.candidatePath) !== resolve(input.liveDelta.candidateReport.path)) {
    throw new Error(
      `Candidate report path ${input.candidatePath} does not match ` +
        `live-delta candidateReport.path ${input.liveDelta.candidateReport.path}.`,
    );
  }
  if (input.candidate.runId !== input.liveDelta.candidateReport.runId) {
    throw new Error(
      `Candidate report ${input.candidatePath} runId ${input.candidate.runId} ` +
        `does not match live-delta ${input.liveDeltaPath} candidate runId ` +
        `${input.liveDelta.candidateReport.runId}.`,
    );
  }
  if (input.candidate.mode !== "live-answer") {
    throw new Error(`Candidate report ${input.candidatePath} must be live-answer.`);
  }
  if (input.candidate.answerEvaluation !== "scored") {
    throw new Error(`Candidate report ${input.candidatePath} must be scored.`);
  }
  assertLocomoReportHasNoExecutionFailures({
    path: input.candidatePath,
    report: input.candidate,
  });
  assertLocomoReportQuestionCountMatchesCases({
    path: input.candidatePath,
    report: input.candidate,
  });
  assertLocomoReportHasCompleteLiveAnswers({
    path: input.candidatePath,
    report: input.candidate,
  });
}

function resolveBenchmarkRoot(report: LocomoSmokeReport): string | undefined {
  if (report.externalRoot !== null) {
    return report.externalRoot;
  }
  if (report.benchmarkSource === "synthetic-smoke") {
    return undefined;
  }
  throw new Error(
    `Candidate report ${report.runId} is missing externalRoot; ` +
      "cannot join near-miss rows to benchmark gold answers.",
  );
}

function assertNearMissTokenF1(input: {
  candidateAnswerTokenF1: number;
  computedAnswerTokenF1: number;
  key: string;
}): void {
  if (
    Math.abs(input.candidateAnswerTokenF1 - input.computedAnswerTokenF1) > 1e-12
  ) {
    throw new Error(
      `Near-miss row ${input.key} token-F1 mismatch: ` +
        `delta=${input.candidateAnswerTokenF1}, ` +
        `computed=${input.computedAnswerTokenF1}.`,
    );
  }
  if (
    input.candidateAnswerTokenF1 <= 0 ||
    input.candidateAnswerTokenF1 >= LOCOMO_F1_PASS_THRESHOLD
  ) {
    throw new Error(
      `Near-miss row ${input.key} token-F1 ${input.candidateAnswerTokenF1} ` +
        `must be > 0 and < ${LOCOMO_F1_PASS_THRESHOLD}.`,
    );
  }
}

function buildNearMissRow(input: {
  benchmarkQuestion: LocomoQuestion;
  candidateQuestion: LocomoQuestionRetrieval;
  delta: LocomoLiveQuestionDelta;
}): LocomoNearMissLabelRow {
  const generatedAnswer = input.candidateQuestion.generatedAnswer;
  if (generatedAnswer === null) {
    throw new Error(
      `Near-miss row ${questionLookupKey(input.delta)} is missing generatedAnswer.`,
    );
  }
  const candidateAnswerTokenF1 = input.delta.candidate.answerTokenF1;
  if (candidateAnswerTokenF1 === null) {
    throw new Error(
      `Near-miss row ${questionLookupKey(input.delta)} is missing token-F1.`,
    );
  }
  if (
    input.candidateQuestion.answerTokenF1 !== undefined &&
    input.candidateQuestion.answerTokenF1 !== null &&
    Math.abs(input.candidateQuestion.answerTokenF1 - candidateAnswerTokenF1) >
      1e-12
  ) {
    throw new Error(
      `Near-miss row ${questionLookupKey(input.delta)} candidate report ` +
        `answerTokenF1 ${input.candidateQuestion.answerTokenF1} does not ` +
        `match live-delta token-F1 ${candidateAnswerTokenF1}.`,
    );
  }
  const computedAnswerTokenF1 = locomoTokenF1(
    generatedAnswer,
    input.benchmarkQuestion.goldAnswer,
  );
  assertNearMissTokenF1({
    candidateAnswerTokenF1,
    computedAnswerTokenF1,
    key: questionLookupKey(input.delta),
  });
  const overlap = tokenOverlap(generatedAnswer, input.benchmarkQuestion.goldAnswer);
  return {
    answerTransition: input.delta.answerTransition,
    caseId: input.delta.caseId,
    category: input.delta.category,
    candidateAnswerTokenF1,
    candidateEvidenceRecall: input.delta.candidate.evidenceRecall,
    candidateGoldEvidenceFullyRetrieved:
      input.delta.candidate.goldEvidenceFullyRetrieved,
    candidateMissingEvidenceTurnIds: [...input.candidateQuestion.missingEvidenceTurnIds],
    candidateNoiseTurnCount: input.delta.candidate.noiseTurnCount,
    candidateNoiseTurnIds: [...input.candidateQuestion.noiseTurnIds],
    candidateRetrievedTurnIds: [...input.candidateQuestion.retrievedTurnIds],
    computedAnswerTokenF1,
    diagnosis: diagnoseNearMiss(overlap),
    generatedAnswer,
    goldAnswer: input.benchmarkQuestion.goldAnswer,
    question: input.benchmarkQuestion.question,
    questionId: input.delta.questionId,
    retrievalTransition: input.delta.retrievalTransition,
    tokenOverlap: overlap,
  };
}

function addRowToAccumulator(
  accumulator: LabelAccumulator,
  row: LocomoNearMissLabelRow,
): void {
  accumulator.nearMissCount += 1;
  accumulator.answerTokenF1Total += row.candidateAnswerTokenF1;
  accumulator.diagnosisCounts[row.diagnosis] += 1;
  accumulator.questionIds.push(row.questionId);
  if (row.candidateEvidenceRecall <= 0) {
    accumulator.zeroRecallCount += 1;
  } else if (row.candidateGoldEvidenceFullyRetrieved) {
    accumulator.fullRecallCount += 1;
  } else {
    accumulator.partialRecallCount += 1;
  }
}

function summarizeAccumulator(
  accumulator: LabelAccumulator,
): LocomoNearMissLabelSummary {
  return {
    averageCandidateAnswerTokenF1: divideOrZero(
      accumulator.answerTokenF1Total,
      accumulator.nearMissCount,
    ),
    diagnosisCounts: { ...accumulator.diagnosisCounts },
    fullRecallCount: accumulator.fullRecallCount,
    nearMissCount: accumulator.nearMissCount,
    partialRecallCount: accumulator.partialRecallCount,
    questionCount: accumulator.questionIds.length,
    questionIds: [...accumulator.questionIds],
    selectedQuestionCount: accumulator.questionIds.length,
    zeroRecallCount: accumulator.zeroRecallCount,
  };
}

function nearMissRepairBucket(
  row: LocomoNearMissLabelRow,
): LocomoNearMissRepairJob["retrievalBucket"] | null {
  if (row.candidateGoldEvidenceFullyRetrieved) {
    return null;
  }
  return row.candidateEvidenceRecall <= 0 ? "zero" : "partial";
}

function buildRepairJobs(
  rows: readonly LocomoNearMissLabelRow[],
): LocomoNearMissRepairJob[] {
  const jobs = new Map<string, LocomoNearMissRepairJob>();
  for (const row of rows) {
    const retrievalBucket = nearMissRepairBucket(row);
    if (retrievalBucket === null) {
      continue;
    }
    const key = `${row.category}::${row.diagnosis}::${retrievalBucket}`;
    let job = jobs.get(key);
    if (!job) {
      job = {
        category: row.category,
        diagnosis: row.diagnosis,
        questionCount: 0,
        questionIds: [],
        retrievalBucket,
      };
      jobs.set(key, job);
    }
    job.questionIds.push(row.questionId);
    job.questionCount = job.questionIds.length;
  }
  return [...jobs.values()].sort((left, right) => {
    const leftKey = `${left.category}:${left.retrievalBucket}:${left.diagnosis}`;
    const rightKey = `${right.category}:${right.retrievalBucket}:${right.diagnosis}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function analyzeLocomoNearMissLabels(input: {
  benchmarkCases: readonly LocomoCase[];
  candidate: LocomoSmokeReport;
  candidatePath: string;
  generatedAt?: string;
  liveDelta: LocomoLiveDeltaAnalysis;
  liveDeltaPath: string;
  outputPath?: string;
  runId?: string;
}): LocomoNearMissLabelAnalysis {
  validateCandidateReport(input);
  const candidateQuestions = buildCandidateQuestionMap(input.candidate);
  const benchmarkQuestions = buildBenchmarkQuestionMap(input.benchmarkCases);
  const seenKeys = new Set<string>();
  const rows = input.liveDelta.answerTokenF1NearMisses.map((delta) => {
    const key = questionLookupKey(delta);
    if (seenKeys.has(key)) {
      throw new Error(
        `Live-delta report ${input.liveDeltaPath} contains duplicate ` +
          `answerTokenF1NearMiss row ${key}.`,
      );
    }
    seenKeys.add(key);
    const candidateQuestion = candidateQuestions.get(key);
    if (!candidateQuestion) {
      throw new Error(
        `Candidate report ${input.candidatePath} is missing near-miss row ${key}.`,
      );
    }
    const benchmarkQuestion = benchmarkQuestions.get(key);
    if (!benchmarkQuestion) {
      throw new Error(
        `Benchmark source is missing near-miss question ${key}.`,
      );
    }
    if (benchmarkQuestion.category !== delta.category) {
      throw new Error(
        `Near-miss row ${key} category ${delta.category} does not match ` +
          `benchmark category ${benchmarkQuestion.category}.`,
      );
    }
    return buildNearMissRow({
      benchmarkQuestion,
      candidateQuestion,
      delta,
    });
  });

  const overall = emptyAccumulator();
  const categoryAccumulators = new Map<LocomoQaCategory, LabelAccumulator>();
  for (const row of rows) {
    addRowToAccumulator(overall, row);
    let categoryAccumulator = categoryAccumulators.get(row.category);
    if (!categoryAccumulator) {
      categoryAccumulator = emptyAccumulator();
      categoryAccumulators.set(row.category, categoryAccumulator);
    }
    addRowToAccumulator(categoryAccumulator, row);
  }

  const categories: Partial<Record<LocomoQaCategory, LocomoNearMissLabelSummary>> =
    {};
  for (const category of LOCOMO_QA_CATEGORIES) {
    const accumulator = categoryAccumulators.get(category);
    if (accumulator) {
      categories[category] = summarizeAccumulator(accumulator);
    }
  }

  return {
    benchmark: "locomo",
    candidateReport: {
      path: input.candidatePath,
      runId: input.candidate.runId,
    },
    categories,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    liveDeltaReport: {
      path: input.liveDeltaPath,
      runId: input.liveDelta.runId,
    },
    outputPath: input.outputPath ?? null,
    overall: summarizeAccumulator(overall),
    phase: "phase-65",
    questionIds: rows.map((row) => row.questionId),
    repairJobs: buildRepairJobs(rows),
    rows,
    runId: input.runId ?? "locomo-near-miss-label-analysis-current",
    sourceReports: [
      {
        path: input.candidatePath,
        questionCount: input.candidate.questionCount,
        runId: input.candidate.runId,
      },
    ],
  };
}

export async function runLocomoNearMissLabelAnalysis(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{ analysis: LocomoNearMissLabelAnalysis; outputPath: string }> {
  const options = parseCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const runId = options.runId ?? "locomo-near-miss-label-analysis-current";
  const outputPath =
    options.outputPath ?? defaultOutputPath(options.liveDeltaPath, runId);
  assertOutputPathDoesNotOverwriteSource({
    outputPath,
    sourceFlag: "--live-delta",
    sourcePath: options.liveDeltaPath,
  });

  const liveDeltaParsed = JSON.parse(
    await readFileImpl(options.liveDeltaPath),
  ) as unknown;
  assertLiveDeltaAnalysis(liveDeltaParsed, options.liveDeltaPath);
  assertOutputPathDoesNotOverwriteSource({
    outputPath,
    sourceFlag: "live-delta candidateReport.path",
    sourcePath: liveDeltaParsed.candidateReport.path,
  });

  const candidateParsed = JSON.parse(
    await readFileImpl(liveDeltaParsed.candidateReport.path),
  ) as unknown;
  assertSmokeReport(candidateParsed, liveDeltaParsed.candidateReport.path);

  const benchmarkRoot = resolveBenchmarkRoot(candidateParsed);
  if (benchmarkRoot !== undefined) {
    assertOutputPathDoesNotOverwriteSource({
      outputPath,
      sourceFlag: "candidate benchmark cases",
      sourcePath: join(benchmarkRoot, "cases.json"),
    });
  }
  const loaded = await loadLocomoCases({
    ...(benchmarkRoot === undefined ? {} : { benchmarkRoot }),
    readFile: readFileImpl,
  });
  const analysis = analyzeLocomoNearMissLabels({
    benchmarkCases: loaded.cases,
    candidate: candidateParsed,
    candidatePath: liveDeltaParsed.candidateReport.path,
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    liveDelta: liveDeltaParsed,
    liveDeltaPath: options.liveDeltaPath,
    outputPath,
    runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  runLocomoNearMissLabelAnalysis(process.argv)
    .then(({ analysis, outputPath }) => {
      console.log(JSON.stringify({ outputPath, overall: analysis.overall }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
