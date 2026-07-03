// LoCoMo live-delta analyzer. This compares two Phase 65 live-answer smoke
// reports at question granularity so candidate-admission experiments can be
// routed toward retrieval, noise, or answer-policy work before defaulting.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  LOCOMO_QA_CATEGORIES,
  type LocomoQaCategory,
} from "../src/eval/locomo";
import { resolveCliFlagValue } from "./cli-options";
import type {
  LocomoQuestionRetrieval,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_LIVE_DELTA_FILE_NAME = "live-delta.json";

const GENERATED_BY = "scripts/analyze-phase-65-locomo-live-delta.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; not a public release or benchmark claim.";

type AnswerTransition =
  | "baselineOnlyAnswered"
  | "bothUnanswered"
  | "candidateOnlyAnswered"
  | "improved"
  | "regressed"
  | "sameCorrect"
  | "sameWrong";

type FailureBucket =
  | "correct-or-unanswered"
  | "full-recall-wrong-clean"
  | "full-recall-wrong-noisy"
  | "missing-evidence-wrong";

type RetrievalBucket = "full" | "partial" | "zero";
type RetrievalTransition = `${RetrievalBucket}->${RetrievalBucket}`;

interface ReportInput {
  path: string;
  report: LocomoSmokeReport;
}

interface CliOptions {
  baselineReportPath: string;
  candidateReportPath: string;
  outputPath?: string;
  runId?: string;
}

interface AnswerTransitionCounts {
  baselineOnlyAnswered: number;
  bothUnanswered: number;
  candidateOnlyAnswered: number;
  improved: number;
  regressed: number;
  sameCorrect: number;
  sameWrong: number;
}

interface DeltaAccumulator {
  answerCorrectDelta: number;
  answerTransitions: AnswerTransitionCounts;
  baselineCorrectCount: number;
  baselineEvidenceRecallTotal: number;
  baselineFullRecallWrongNoisyCount: number;
  baselineFullyRetrievedCount: number;
  baselineMissingEvidenceWrongCount: number;
  baselineNoiseTurnTotal: number;
  candidateCorrectCount: number;
  candidateEvidenceRecallTotal: number;
  candidateFullRecallWrongNoisyCount: number;
  candidateFullyRetrievedCount: number;
  candidateMissingEvidenceWrongCount: number;
  candidateNoiseTurnTotal: number;
  convertedRetrievalGainCount: number;
  noisyFullRecallRegressionCount: number;
  questionCount: number;
  retrievalTransitions: Record<RetrievalTransition, number>;
  unconvertedRetrievalGainCount: number;
}

export interface LocomoLiveQuestionDelta {
  answerTransition: AnswerTransition;
  baseline: LocomoLiveQuestionSide;
  candidate: LocomoLiveQuestionSide;
  caseId: string;
  category: LocomoQaCategory;
  evidenceRecallDelta: number;
  noiseTurnDelta: number;
  questionId: string;
  retrievalTransition: RetrievalTransition;
}

interface LocomoLiveQuestionSide {
  answerCorrect: boolean | null;
  evidenceRecall: number;
  generatedAnswer: string | null;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnCount: number;
  noiseTurnCount: number;
}

export interface LocomoLiveDeltaSummary {
  answerCorrectDelta: number;
  answerTransitions: AnswerTransitionCounts;
  averageEvidenceRecallDelta: number;
  baselineCorrectCount: number;
  baselineFullyRetrievedCount: number;
  candidateCorrectCount: number;
  candidateFullyRetrievedCount: number;
  convertedRetrievalGainCount: number;
  fullyRetrievedDelta: number;
  fullRecallWrongNoisyDelta: number;
  missingEvidenceWrongDelta: number;
  noiseTurnDelta: number;
  noisyFullRecallRegressionCount: number;
  questionCount: number;
  retrievalTransitions: Record<RetrievalTransition, number>;
  unconvertedRetrievalGainCount: number;
}

export interface LocomoLiveDeltaAnalysis {
  answerImprovements: LocomoLiveQuestionDelta[];
  answerRegressions: LocomoLiveQuestionDelta[];
  baselineReport: { path: string; runId: string };
  benchmark: "locomo";
  candidateReport: { path: string; runId: string };
  categories: Partial<Record<LocomoQaCategory, LocomoLiveDeltaSummary>>;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  mode: LocomoSmokeReport["mode"];
  outputPath: string | null;
  overall: LocomoLiveDeltaSummary;
  phase: "phase-65";
  runId: string;
  topUnconvertedRetrievalGains: LocomoLiveQuestionDelta[];
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const baselineReportPath = resolveCliFlagValue(argv, "--baseline-report");
  const candidateReportPath = resolveCliFlagValue(argv, "--candidate-report");
  if (!baselineReportPath) {
    throw new Error("LoCoMo live-delta analysis requires --baseline-report.");
  }
  if (!candidateReportPath) {
    throw new Error("LoCoMo live-delta analysis requires --candidate-report.");
  }
  return {
    baselineReportPath,
    candidateReportPath,
    outputPath: resolveCliFlagValue(argv, "--output-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
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

function emptyAnswerTransitions(): AnswerTransitionCounts {
  return {
    baselineOnlyAnswered: 0,
    bothUnanswered: 0,
    candidateOnlyAnswered: 0,
    improved: 0,
    regressed: 0,
    sameCorrect: 0,
    sameWrong: 0,
  };
}

function emptyRetrievalTransitions(): Record<RetrievalTransition, number> {
  return {
    "full->full": 0,
    "full->partial": 0,
    "full->zero": 0,
    "partial->full": 0,
    "partial->partial": 0,
    "partial->zero": 0,
    "zero->full": 0,
    "zero->partial": 0,
    "zero->zero": 0,
  };
}

function emptyAccumulator(): DeltaAccumulator {
  return {
    answerCorrectDelta: 0,
    answerTransitions: emptyAnswerTransitions(),
    baselineCorrectCount: 0,
    baselineEvidenceRecallTotal: 0,
    baselineFullRecallWrongNoisyCount: 0,
    baselineFullyRetrievedCount: 0,
    baselineMissingEvidenceWrongCount: 0,
    baselineNoiseTurnTotal: 0,
    candidateCorrectCount: 0,
    candidateEvidenceRecallTotal: 0,
    candidateFullRecallWrongNoisyCount: 0,
    candidateFullyRetrievedCount: 0,
    candidateMissingEvidenceWrongCount: 0,
    candidateNoiseTurnTotal: 0,
    convertedRetrievalGainCount: 0,
    noisyFullRecallRegressionCount: 0,
    questionCount: 0,
    retrievalTransitions: emptyRetrievalTransitions(),
    unconvertedRetrievalGainCount: 0,
  };
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function questionKey(question: LocomoQuestionRetrieval): string {
  return `${question.caseId}::${question.questionId}`;
}

function retrievalBucket(question: LocomoQuestionRetrieval): RetrievalBucket {
  if (question.evidenceRecall <= 0) {
    return "zero";
  }
  if (question.goldEvidenceFullyRetrieved || question.evidenceRecall >= 1) {
    return "full";
  }
  return "partial";
}

function failureBucket(question: LocomoQuestionRetrieval): FailureBucket {
  if (question.answerCorrect !== false) {
    return "correct-or-unanswered";
  }
  if (!question.goldEvidenceFullyRetrieved) {
    return "missing-evidence-wrong";
  }
  if (question.noiseTurnCount > 0) {
    return "full-recall-wrong-noisy";
  }
  return "full-recall-wrong-clean";
}

function answerTransition(input: {
  baseline: LocomoQuestionRetrieval;
  candidate: LocomoQuestionRetrieval;
}): AnswerTransition {
  const { baseline, candidate } = input;
  if (baseline.answerCorrect === null && candidate.answerCorrect === null) {
    return "bothUnanswered";
  }
  if (baseline.answerCorrect === null) {
    return "candidateOnlyAnswered";
  }
  if (candidate.answerCorrect === null) {
    return "baselineOnlyAnswered";
  }
  if (!baseline.answerCorrect && candidate.answerCorrect) {
    return "improved";
  }
  if (baseline.answerCorrect && !candidate.answerCorrect) {
    return "regressed";
  }
  return baseline.answerCorrect ? "sameCorrect" : "sameWrong";
}

function side(question: LocomoQuestionRetrieval): LocomoLiveQuestionSide {
  return {
    answerCorrect: question.answerCorrect,
    evidenceRecall: question.evidenceRecall,
    generatedAnswer: question.generatedAnswer,
    goldEvidenceFullyRetrieved: question.goldEvidenceFullyRetrieved,
    missingEvidenceTurnCount: question.missingEvidenceTurnIds.length,
    noiseTurnCount: question.noiseTurnCount,
  };
}

function questionDelta(input: {
  baseline: LocomoQuestionRetrieval;
  candidate: LocomoQuestionRetrieval;
}): LocomoLiveQuestionDelta {
  const baselineBucket = retrievalBucket(input.baseline);
  const candidateBucket = retrievalBucket(input.candidate);
  return {
    answerTransition: answerTransition(input),
    baseline: side(input.baseline),
    candidate: side(input.candidate),
    caseId: input.baseline.caseId,
    category: input.baseline.category,
    evidenceRecallDelta:
      input.candidate.evidenceRecall - input.baseline.evidenceRecall,
    noiseTurnDelta:
      input.candidate.noiseTurnCount - input.baseline.noiseTurnCount,
    questionId: input.baseline.questionId,
    retrievalTransition: `${baselineBucket}->${candidateBucket}`,
  };
}

function addQuestionDelta(
  acc: DeltaAccumulator,
  delta: LocomoLiveQuestionDelta,
): void {
  acc.questionCount += 1;
  acc.baselineEvidenceRecallTotal += delta.baseline.evidenceRecall;
  acc.candidateEvidenceRecallTotal += delta.candidate.evidenceRecall;
  acc.baselineNoiseTurnTotal += delta.baseline.noiseTurnCount;
  acc.candidateNoiseTurnTotal += delta.candidate.noiseTurnCount;
  if (delta.baseline.answerCorrect === true) {
    acc.baselineCorrectCount += 1;
  }
  if (delta.candidate.answerCorrect === true) {
    acc.candidateCorrectCount += 1;
  }
  if (delta.baseline.goldEvidenceFullyRetrieved) {
    acc.baselineFullyRetrievedCount += 1;
  }
  if (delta.candidate.goldEvidenceFullyRetrieved) {
    acc.candidateFullyRetrievedCount += 1;
  }
  if (delta.baseline.answerCorrect !== delta.candidate.answerCorrect) {
    acc.answerCorrectDelta +=
      (delta.candidate.answerCorrect === true ? 1 : 0) -
      (delta.baseline.answerCorrect === true ? 1 : 0);
  }
  acc.answerTransitions[delta.answerTransition] += 1;
  acc.retrievalTransitions[delta.retrievalTransition] += 1;

  if (delta.evidenceRecallDelta > 0 && delta.candidate.answerCorrect === false) {
    acc.unconvertedRetrievalGainCount += 1;
  }
  if (
    delta.evidenceRecallDelta > 0 &&
    delta.baseline.answerCorrect !== true &&
    delta.candidate.answerCorrect === true
  ) {
    acc.convertedRetrievalGainCount += 1;
  }
  if (
    delta.answerTransition === "regressed" &&
    delta.candidate.goldEvidenceFullyRetrieved &&
    delta.candidate.noiseTurnCount > 0
  ) {
    acc.noisyFullRecallRegressionCount += 1;
  }

  if (delta.baseline.answerCorrect === false) {
    const bucket = failureBucketFromSide(delta.baseline);
    if (bucket === "missing-evidence-wrong") {
      acc.baselineMissingEvidenceWrongCount += 1;
    } else if (bucket === "full-recall-wrong-noisy") {
      acc.baselineFullRecallWrongNoisyCount += 1;
    }
  }
  if (delta.candidate.answerCorrect === false) {
    const bucket = failureBucketFromSide(delta.candidate);
    if (bucket === "missing-evidence-wrong") {
      acc.candidateMissingEvidenceWrongCount += 1;
    } else if (bucket === "full-recall-wrong-noisy") {
      acc.candidateFullRecallWrongNoisyCount += 1;
    }
  }
}

function failureBucketFromSide(sideValue: LocomoLiveQuestionSide): FailureBucket {
  if (sideValue.answerCorrect !== false) {
    return "correct-or-unanswered";
  }
  if (!sideValue.goldEvidenceFullyRetrieved) {
    return "missing-evidence-wrong";
  }
  if (sideValue.noiseTurnCount > 0) {
    return "full-recall-wrong-noisy";
  }
  return "full-recall-wrong-clean";
}

function summarizeAccumulator(acc: DeltaAccumulator): LocomoLiveDeltaSummary {
  return {
    answerCorrectDelta: acc.candidateCorrectCount - acc.baselineCorrectCount,
    answerTransitions: { ...acc.answerTransitions },
    averageEvidenceRecallDelta:
      divideOrZero(acc.candidateEvidenceRecallTotal, acc.questionCount) -
      divideOrZero(acc.baselineEvidenceRecallTotal, acc.questionCount),
    baselineCorrectCount: acc.baselineCorrectCount,
    baselineFullyRetrievedCount: acc.baselineFullyRetrievedCount,
    candidateCorrectCount: acc.candidateCorrectCount,
    candidateFullyRetrievedCount: acc.candidateFullyRetrievedCount,
    convertedRetrievalGainCount: acc.convertedRetrievalGainCount,
    fullyRetrievedDelta:
      acc.candidateFullyRetrievedCount - acc.baselineFullyRetrievedCount,
    fullRecallWrongNoisyDelta:
      acc.candidateFullRecallWrongNoisyCount -
      acc.baselineFullRecallWrongNoisyCount,
    missingEvidenceWrongDelta:
      acc.candidateMissingEvidenceWrongCount -
      acc.baselineMissingEvidenceWrongCount,
    noiseTurnDelta: acc.candidateNoiseTurnTotal - acc.baselineNoiseTurnTotal,
    noisyFullRecallRegressionCount: acc.noisyFullRecallRegressionCount,
    questionCount: acc.questionCount,
    retrievalTransitions: { ...acc.retrievalTransitions },
    unconvertedRetrievalGainCount: acc.unconvertedRetrievalGainCount,
  };
}

function validateCompatibleReports(input: {
  baseline: ReportInput;
  candidate: ReportInput;
}): void {
  const { baseline, candidate } = input;
  if (baseline.report.mode !== "live-answer") {
    throw new Error(
      `Baseline report ${baseline.path} must be a live-answer report.`,
    );
  }
  if (candidate.report.mode !== "live-answer") {
    throw new Error(
      `Candidate report ${candidate.path} must be a live-answer report.`,
    );
  }
  if (baseline.report.answerEvaluation !== "scored") {
    throw new Error(`Baseline report ${baseline.path} must be scored.`);
  }
  if (candidate.report.answerEvaluation !== "scored") {
    throw new Error(`Candidate report ${candidate.path} must be scored.`);
  }
  if (baseline.report.executionFailures > 0) {
    throw new Error(
      `Baseline report ${baseline.path} has ${baseline.report.executionFailures} execution failure(s).`,
    );
  }
  if (candidate.report.executionFailures > 0) {
    throw new Error(
      `Candidate report ${candidate.path} has ${candidate.report.executionFailures} execution failure(s).`,
    );
  }
}

function questionMap(
  report: LocomoSmokeReport,
): Map<string, LocomoQuestionRetrieval> {
  return new Map(report.cases.map((question) => [questionKey(question), question]));
}

function buildQuestionDeltas(input: {
  baseline: ReportInput;
  candidate: ReportInput;
}): LocomoLiveQuestionDelta[] {
  const baselineByQuestion = questionMap(input.baseline.report);
  const candidateByQuestion = questionMap(input.candidate.report);
  const deltas: LocomoLiveQuestionDelta[] = [];

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
      questionDelta({
        baseline: baselineQuestion,
        candidate: candidateQuestion,
      }),
    );
  }

  for (const key of candidateByQuestion.keys()) {
    if (!baselineByQuestion.has(key)) {
      throw new Error(`Baseline report is missing question ${key}.`);
    }
  }

  return deltas.sort((left, right) =>
    `${left.caseId}:${left.questionId}`.localeCompare(
      `${right.caseId}:${right.questionId}`,
    ),
  );
}

function addToAccumulators(input: {
  categories: Map<LocomoQaCategory, DeltaAccumulator>;
  delta: LocomoLiveQuestionDelta;
  overall: DeltaAccumulator;
}): void {
  addQuestionDelta(input.overall, input.delta);
  let categoryAcc = input.categories.get(input.delta.category);
  if (!categoryAcc) {
    categoryAcc = emptyAccumulator();
    input.categories.set(input.delta.category, categoryAcc);
  }
  addQuestionDelta(categoryAcc, input.delta);
}

function byEvidenceGainThenNoise(
  left: LocomoLiveQuestionDelta,
  right: LocomoLiveQuestionDelta,
): number {
  if (right.evidenceRecallDelta !== left.evidenceRecallDelta) {
    return right.evidenceRecallDelta - left.evidenceRecallDelta;
  }
  if (right.noiseTurnDelta !== left.noiseTurnDelta) {
    return right.noiseTurnDelta - left.noiseTurnDelta;
  }
  return `${left.caseId}:${left.questionId}`.localeCompare(
    `${right.caseId}:${right.questionId}`,
  );
}

function defaultOutputPath(candidateReportPath: string, runId: string): string {
  return join(dirname(candidateReportPath), "..", runId, LOCOMO_LIVE_DELTA_FILE_NAME);
}

export function analyzeLocomoLiveDelta(input: {
  baseline: ReportInput;
  candidate: ReportInput;
  generatedAt?: string;
  outputPath?: string;
  runId?: string;
}): LocomoLiveDeltaAnalysis {
  validateCompatibleReports(input);
  const deltas = buildQuestionDeltas(input);
  if (deltas.length === 0) {
    throw new Error("LoCoMo live-delta analysis found no overlapping questions.");
  }

  const overall = emptyAccumulator();
  const categories = new Map<LocomoQaCategory, DeltaAccumulator>();
  for (const delta of deltas) {
    addToAccumulators({ categories, delta, overall });
  }

  const categorySummaries: Partial<Record<LocomoQaCategory, LocomoLiveDeltaSummary>> =
    {};
  for (const category of LOCOMO_QA_CATEGORIES) {
    const acc = categories.get(category);
    if (acc) {
      categorySummaries[category] = summarizeAccumulator(acc);
    }
  }

  return {
    answerImprovements: deltas
      .filter((delta) => delta.answerTransition === "improved")
      .sort(byEvidenceGainThenNoise)
      .slice(0, 10),
    answerRegressions: deltas
      .filter((delta) => delta.answerTransition === "regressed")
      .sort(byEvidenceGainThenNoise)
      .slice(0, 10),
    baselineReport: {
      path: input.baseline.path,
      runId: input.baseline.report.runId,
    },
    benchmark: "locomo",
    candidateReport: {
      path: input.candidate.path,
      runId: input.candidate.report.runId,
    },
    categories: categorySummaries,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    mode: input.baseline.report.mode,
    outputPath: input.outputPath ?? null,
    overall: summarizeAccumulator(overall),
    phase: "phase-65",
    runId: input.runId ?? "locomo-live-delta-current",
    topUnconvertedRetrievalGains: deltas
      .filter(
        (delta) =>
          delta.evidenceRecallDelta > 0 &&
          delta.candidate.answerCorrect === false,
      )
      .sort(byEvidenceGainThenNoise)
      .slice(0, 10),
  };
}

export async function runLocomoLiveDeltaAnalysis(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{ analysis: LocomoLiveDeltaAnalysis; outputPath: string }> {
  const options = parseCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const runId = options.runId ?? "locomo-live-delta-current";
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

  const analysis = analyzeLocomoLiveDelta({
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
    runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  runLocomoLiveDeltaAnalysis(process.argv)
    .then(({ analysis, outputPath }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            answerImprovements: analysis.answerImprovements.length,
            answerRegressions: analysis.answerRegressions.length,
            outputPath,
            overall: analysis.overall,
            runId: analysis.runId,
            topUnconvertedRetrievalGains:
              analysis.topUnconvertedRetrievalGains.length,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo live-delta analysis failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
