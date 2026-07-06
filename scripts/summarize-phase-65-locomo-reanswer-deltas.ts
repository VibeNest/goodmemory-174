import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LOCOMO_QA_CATEGORIES } from "../src/eval/locomo";
import type { LocomoQaCategory } from "../src/eval/locomo";
import {
  assertDistinctCliPathValues,
  parseCliPathListFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  LOCOMO_REANSWER_JOB_BUCKET_SET,
  type LocomoReanswerJobBucket,
} from "./locomo-reanswer-contracts";

const GENERATED_BY = "scripts/summarize-phase-65-locomo-reanswer-deltas.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; aggregate of existing LoCoMo replay deltas, not a public benchmark claim.";
const DEFAULT_OUTPUT_DIR = join(
  process.cwd(),
  "reports",
  "eval",
  "research",
  "phase-65",
  "locomo",
);
const LOCOMO_QA_CATEGORY_SET: ReadonlySet<string> = new Set(LOCOMO_QA_CATEGORIES);
const ANSWER_TRANSITIONS = [
  "baselineOnlyAnswered",
  "bothUnanswered",
  "candidateOnlyAnswered",
  "improved",
  "regressed",
  "sameCorrect",
  "sameWrong",
] as const;
const RETRIEVAL_TRANSITIONS = [
  "full->full",
  "full->partial",
  "full->zero",
  "partial->full",
  "partial->partial",
  "partial->zero",
  "zero->full",
  "zero->partial",
  "zero->zero",
] as const;

type AnswerTransition = (typeof ANSWER_TRANSITIONS)[number];
type RetrievalTransition = (typeof RETRIEVAL_TRANSITIONS)[number];

interface CliOptions {
  deltaPaths: string[];
  outputPath?: string;
  readinessPath: string;
  runId?: string;
}

interface ReadinessJob {
  bucket: LocomoReanswerJobBucket;
  category: LocomoQaCategory;
  questionCount: number;
  questionIds: string[];
  sourceReportPath: string;
  sourceRunId: string;
  targetRunId: string;
}

interface DeltaReportSource {
  path: string;
  runId: string;
}

interface DeltaReport {
  answerTokenF1NearMisses: unknown[];
  baselineReport: DeltaReportSource;
  benchmark: "locomo";
  candidateReport: DeltaReportSource;
  categories: Partial<Record<LocomoQaCategory, DeltaSummary>>;
  generatedBy: string;
  overall: DeltaSummary;
  runId: string;
}

interface DeltaSummary {
  answerContextModeChangedAnswerChangeCount: number;
  answerContextModeChangedCount: number;
  answerContextModeChangedRegressionCount: number;
  answerContextModeUnchangedAnswerChangeCount: number;
  answerContextModeUnchangedCount: number;
  answerContextModeUnchangedRegressionCount: number;
  answerCorrectDelta: number;
  answerTransitions: Record<AnswerTransition, number>;
  averageEvidenceRecallDelta: number;
  baselineCorrectCount: number;
  baselineFullyRetrievedCount: number;
  candidateCorrectCount: number;
  candidateFullyRetrievedCount: number;
  convertedRetrievalGainCount: number;
  effectiveAnswerPolicyChangedAnswerChangeCount: number;
  effectiveAnswerPolicyChangedCount: number;
  effectiveAnswerPolicyChangedRegressionCount: number;
  effectiveAnswerPolicyUnchangedAnswerChangeCount: number;
  effectiveAnswerPolicyUnchangedCount: number;
  effectiveAnswerPolicyUnchangedRegressionCount: number;
  fullyRetrievedDelta: number;
  fullRecallWrongNoisyDelta: number;
  missingEvidenceWrongDelta: number;
  noiseTurnDelta: number;
  noisyFullRecallRegressionCount: number;
  questionCount: number;
  residualLiveAnswerChangeCount: number;
  retrievalMetricChangedAnswerChangeCount: number;
  retrievalTransitions: Record<RetrievalTransition, number>;
  unconvertedRetrievalGainCount: number;
}

interface AggregateSummary extends Omit<DeltaSummary, "averageEvidenceRecallDelta"> {
  answerTokenF1NearMissCount: number;
  averageEvidenceRecallDelta: number;
  deltaReportCount: number;
}

interface AggregateBucket extends AggregateSummary {
  bucket: LocomoReanswerJobBucket;
  category?: LocomoQaCategory;
}

interface SourceDeltaReportSummary {
  baselineReportPath: string;
  baselineRunId: string;
  bucket: LocomoReanswerJobBucket;
  candidateReportPath: string;
  candidateRunId: string;
  category: LocomoQaCategory;
  deltaPath: string;
  deltaRunId: string;
  questionCount: number;
  questionIds: string[];
}

export interface LocomoReanswerDeltaAggregate {
  benchmark: "locomo";
  byBucket: Partial<Record<LocomoReanswerJobBucket, AggregateBucket>>;
  byCategory: Partial<Record<LocomoQaCategory, AggregateBucket>>;
  byCategoryBucket: Partial<
    Record<LocomoQaCategory, Partial<Record<LocomoReanswerJobBucket, AggregateBucket>>>
  >;
  claimBoundary: string;
  generatedAt: string;
  generatedBy: string;
  outputPath: string | null;
  phase: "phase-65";
  readiness: {
    matchedReadyJobCount: number;
    path: string;
    readyJobCount: number;
  };
  runId: string;
  sourceDeltaReports: SourceDeltaReportSummary[];
  totals: AggregateSummary;
}

interface Dependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
}

const ZERO_TRANSITIONS: Record<AnswerTransition, number> = {
  baselineOnlyAnswered: 0,
  bothUnanswered: 0,
  candidateOnlyAnswered: 0,
  improved: 0,
  regressed: 0,
  sameCorrect: 0,
  sameWrong: 0,
};
const ZERO_RETRIEVAL_TRANSITIONS: Record<RetrievalTransition, number> = {
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

function emptyAggregate(): AggregateSummary {
  return {
    answerContextModeChangedAnswerChangeCount: 0,
    answerContextModeChangedCount: 0,
    answerContextModeChangedRegressionCount: 0,
    answerContextModeUnchangedAnswerChangeCount: 0,
    answerContextModeUnchangedCount: 0,
    answerContextModeUnchangedRegressionCount: 0,
    answerCorrectDelta: 0,
    answerTokenF1NearMissCount: 0,
    answerTransitions: { ...ZERO_TRANSITIONS },
    averageEvidenceRecallDelta: 0,
    baselineCorrectCount: 0,
    baselineFullyRetrievedCount: 0,
    candidateCorrectCount: 0,
    candidateFullyRetrievedCount: 0,
    convertedRetrievalGainCount: 0,
    deltaReportCount: 0,
    effectiveAnswerPolicyChangedAnswerChangeCount: 0,
    effectiveAnswerPolicyChangedCount: 0,
    effectiveAnswerPolicyChangedRegressionCount: 0,
    effectiveAnswerPolicyUnchangedAnswerChangeCount: 0,
    effectiveAnswerPolicyUnchangedCount: 0,
    effectiveAnswerPolicyUnchangedRegressionCount: 0,
    fullyRetrievedDelta: 0,
    fullRecallWrongNoisyDelta: 0,
    missingEvidenceWrongDelta: 0,
    noiseTurnDelta: 0,
    noisyFullRecallRegressionCount: 0,
    questionCount: 0,
    residualLiveAnswerChangeCount: 0,
    retrievalMetricChangedAnswerChangeCount: 0,
    retrievalTransitions: { ...ZERO_RETRIEVAL_TRANSITIONS },
    unconvertedRetrievalGainCount: 0,
  };
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const readinessPath = resolveCliFlagValueStrict(argv, "--readiness");
  if (readinessPath === undefined) {
    throw new Error("--readiness is required.");
  }
  const deltaPaths = parseCliPathListFlagStrict(argv, "--delta");
  if (deltaPaths.length === 0) {
    throw new Error("At least one --delta path is required.");
  }
  return {
    deltaPaths,
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    readinessPath,
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrictString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() === value;
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (!isStrictString(value)) {
    throw new Error(`${field} must be a non-empty unpadded string.`);
  }
  return value;
}

function stringValue(value: unknown, field: string): string {
  if (!isStrictString(value)) {
    throw new Error(`${field} must be a non-empty unpadded string.`);
  }
  return value;
}

function categoryField(value: unknown, field: string): LocomoQaCategory {
  if (!isStrictString(value) || !LOCOMO_QA_CATEGORY_SET.has(value)) {
    throw new Error(`${field} must be a valid LoCoMo category.`);
  }
  return value as LocomoQaCategory;
}

function bucketField(value: unknown, field: string): LocomoReanswerJobBucket {
  if (!isStrictString(value) || !LOCOMO_REANSWER_JOB_BUCKET_SET.has(value)) {
    throw new Error(`${field} must be a valid reanswer job bucket.`);
  }
  return value as LocomoReanswerJobBucket;
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!isStrictString(entry)) {
      throw new Error(`${field}[${index}] must be a non-empty unpadded string.`);
    }
    if (seen.has(entry)) {
      throw new Error(`${field} contains duplicate value ${entry}.`);
    }
    seen.add(entry);
    return entry;
  });
}

function parseTransitionCounts<T extends string>(
  value: unknown,
  fields: readonly T[],
  field: string,
): Record<T, number> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const parsed = {} as Record<T, number>;
  for (const name of fields) {
    const count = value[name];
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new Error(`${field}.${name} must be a finite number.`);
    }
    parsed[name] = count;
  }
  return parsed;
}

function parseDeltaSummary(value: unknown, label: string): DeltaSummary {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const summary: DeltaSummary = {
    answerContextModeChangedAnswerChangeCount: numberField(
      value,
      "answerContextModeChangedAnswerChangeCount",
    ),
    answerContextModeChangedCount: numberField(value, "answerContextModeChangedCount"),
    answerContextModeChangedRegressionCount: numberField(
      value,
      "answerContextModeChangedRegressionCount",
    ),
    answerContextModeUnchangedAnswerChangeCount: numberField(
      value,
      "answerContextModeUnchangedAnswerChangeCount",
    ),
    answerContextModeUnchangedCount: numberField(value, "answerContextModeUnchangedCount"),
    answerContextModeUnchangedRegressionCount: numberField(
      value,
      "answerContextModeUnchangedRegressionCount",
    ),
    answerCorrectDelta: numberField(value, "answerCorrectDelta"),
    answerTransitions: parseTransitionCounts(
      value.answerTransitions,
      ANSWER_TRANSITIONS,
      "answerTransitions",
    ),
    averageEvidenceRecallDelta: numberField(value, "averageEvidenceRecallDelta"),
    baselineCorrectCount: numberField(value, "baselineCorrectCount"),
    baselineFullyRetrievedCount: numberField(value, "baselineFullyRetrievedCount"),
    candidateCorrectCount: numberField(value, "candidateCorrectCount"),
    candidateFullyRetrievedCount: numberField(value, "candidateFullyRetrievedCount"),
    convertedRetrievalGainCount: numberField(value, "convertedRetrievalGainCount"),
    effectiveAnswerPolicyChangedAnswerChangeCount: numberField(
      value,
      "effectiveAnswerPolicyChangedAnswerChangeCount",
    ),
    effectiveAnswerPolicyChangedCount: numberField(value, "effectiveAnswerPolicyChangedCount"),
    effectiveAnswerPolicyChangedRegressionCount: numberField(
      value,
      "effectiveAnswerPolicyChangedRegressionCount",
    ),
    effectiveAnswerPolicyUnchangedAnswerChangeCount: numberField(
      value,
      "effectiveAnswerPolicyUnchangedAnswerChangeCount",
    ),
    effectiveAnswerPolicyUnchangedCount: numberField(value, "effectiveAnswerPolicyUnchangedCount"),
    effectiveAnswerPolicyUnchangedRegressionCount: numberField(
      value,
      "effectiveAnswerPolicyUnchangedRegressionCount",
    ),
    fullyRetrievedDelta: numberField(value, "fullyRetrievedDelta"),
    fullRecallWrongNoisyDelta: numberField(value, "fullRecallWrongNoisyDelta"),
    missingEvidenceWrongDelta: numberField(value, "missingEvidenceWrongDelta"),
    noiseTurnDelta: numberField(value, "noiseTurnDelta"),
    noisyFullRecallRegressionCount: numberField(value, "noisyFullRecallRegressionCount"),
    questionCount: numberField(value, "questionCount"),
    residualLiveAnswerChangeCount: numberField(value, "residualLiveAnswerChangeCount"),
    retrievalMetricChangedAnswerChangeCount: numberField(
      value,
      "retrievalMetricChangedAnswerChangeCount",
    ),
    retrievalTransitions: parseTransitionCounts(
      value.retrievalTransitions,
      RETRIEVAL_TRANSITIONS,
      "retrievalTransitions",
    ),
    unconvertedRetrievalGainCount: numberField(value, "unconvertedRetrievalGainCount"),
  };
  validateDeltaSummary(summary, label);
  return summary;
}

function validateDeltaSummary(summary: DeltaSummary, label: string): void {
  const transitionTotal = ANSWER_TRANSITIONS.reduce(
    (total, transition) => total + summary.answerTransitions[transition],
    0,
  );
  if (transitionTotal !== summary.questionCount) {
    throw new Error(
      `${label} answer transition total ${transitionTotal} does not equal questionCount ${summary.questionCount}.`,
    );
  }
  const retrievalTransitionTotal = RETRIEVAL_TRANSITIONS.reduce(
    (total, transition) => total + summary.retrievalTransitions[transition],
    0,
  );
  if (retrievalTransitionTotal !== summary.questionCount) {
    throw new Error(
      `${label} retrieval transition total ${retrievalTransitionTotal} does not equal questionCount ${summary.questionCount}.`,
    );
  }
  if (summary.candidateCorrectCount - summary.baselineCorrectCount !== summary.answerCorrectDelta) {
    throw new Error(`${label} answerCorrectDelta disagrees with candidate-baseline counts.`);
  }
}

function parseSource(value: unknown, field: string): DeltaReportSource {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const path = value.path;
  const runId = value.runId;
  if (!isStrictString(path)) {
    throw new Error(`${field}.path must be a non-empty unpadded string.`);
  }
  if (!isStrictString(runId)) {
    throw new Error(`${field}.runId must be a non-empty unpadded string.`);
  }
  return {
    path,
    runId,
  };
}

function parseDeltaReport(value: unknown, path: string): DeltaReport {
  if (!isRecord(value)) {
    throw new Error(`${path} must be a JSON object.`);
  }
  if (value.benchmark !== "locomo") {
    throw new Error(`${path} benchmark must be locomo.`);
  }
  if (value.generatedBy !== "scripts/analyze-phase-65-locomo-live-delta.ts") {
    throw new Error(`${path} generatedBy must be scripts/analyze-phase-65-locomo-live-delta.ts.`);
  }
  if (!Array.isArray(value.answerTokenF1NearMisses)) {
    throw new Error(`${path} answerTokenF1NearMisses must be an array.`);
  }
  if (!isRecord(value.categories)) {
    throw new Error(`${path} categories must be an object.`);
  }
  const categories: Partial<Record<LocomoQaCategory, DeltaSummary>> = {};
  for (const [category, summary] of Object.entries(value.categories)) {
    const parsedCategory = categoryField(category, `${path}.categories`);
    categories[parsedCategory] = parseDeltaSummary(summary, `${path}.categories.${category}`);
  }
  return {
    answerTokenF1NearMisses: value.answerTokenF1NearMisses,
    baselineReport: parseSource(value.baselineReport, `${path}.baselineReport`),
    benchmark: "locomo",
    candidateReport: parseSource(value.candidateReport, `${path}.candidateReport`),
    categories,
    generatedBy: value.generatedBy,
    overall: parseDeltaSummary(value.overall, `${path}.overall`),
    runId: stringValue(value.runId, `${path}.runId`),
  };
}

function parseReadinessJobs(value: unknown, path: string): ReadinessJob[] {
  if (!isRecord(value)) {
    throw new Error(`${path} must be a JSON object.`);
  }
  if (value.benchmark !== "locomo") {
    throw new Error(`${path} benchmark must be locomo.`);
  }
  if (!isRecord(value.replayPlan) || !Array.isArray(value.replayPlan.commands)) {
    throw new Error(`${path} replayPlan.commands must be an array.`);
  }
  return value.replayPlan.commands.map((rawJob, index): ReadinessJob => {
    if (!isRecord(rawJob)) {
      throw new Error(`${path} replayPlan.commands[${index}] must be an object.`);
    }
    const questionIds = parseStringArray(
      rawJob.questionIds,
      `${path}.replayPlan.commands[${index}].questionIds`,
    );
    const questionCount = numberField(rawJob, "questionCount");
    if (questionCount !== questionIds.length) {
      throw new Error(
        `${path} replayPlan.commands[${index}] questionCount ${questionCount} does not match questionIds length ${questionIds.length}.`,
      );
    }
    return {
      bucket: bucketField(rawJob.bucket, `${path}.replayPlan.commands[${index}].bucket`),
      category: categoryField(rawJob.category, `${path}.replayPlan.commands[${index}].category`),
      questionCount,
      questionIds,
      sourceReportPath: stringField(rawJob, "sourceReportPath"),
      sourceRunId: stringField(rawJob, "sourceRunId"),
      targetRunId: stringField(rawJob, "targetRunId"),
    };
  });
}

async function readJson(input: {
  path: string;
  readFileImpl: (path: string) => Promise<string>;
}): Promise<unknown> {
  return JSON.parse(await input.readFileImpl(input.path)) as unknown;
}

function addSummary(input: {
  answerTokenF1NearMissCount: number;
  target: AggregateSummary;
  value: DeltaSummary;
}): void {
  const target = input.target;
  const value = input.value;
  target.answerContextModeChangedAnswerChangeCount +=
    value.answerContextModeChangedAnswerChangeCount;
  target.answerContextModeChangedCount += value.answerContextModeChangedCount;
  target.answerContextModeChangedRegressionCount +=
    value.answerContextModeChangedRegressionCount;
  target.answerContextModeUnchangedAnswerChangeCount +=
    value.answerContextModeUnchangedAnswerChangeCount;
  target.answerContextModeUnchangedCount += value.answerContextModeUnchangedCount;
  target.answerContextModeUnchangedRegressionCount +=
    value.answerContextModeUnchangedRegressionCount;
  target.answerCorrectDelta += value.answerCorrectDelta;
  target.answerTokenF1NearMissCount += input.answerTokenF1NearMissCount;
  target.baselineCorrectCount += value.baselineCorrectCount;
  target.baselineFullyRetrievedCount += value.baselineFullyRetrievedCount;
  target.candidateCorrectCount += value.candidateCorrectCount;
  target.candidateFullyRetrievedCount += value.candidateFullyRetrievedCount;
  target.convertedRetrievalGainCount += value.convertedRetrievalGainCount;
  target.deltaReportCount += 1;
  target.effectiveAnswerPolicyChangedAnswerChangeCount +=
    value.effectiveAnswerPolicyChangedAnswerChangeCount;
  target.effectiveAnswerPolicyChangedCount += value.effectiveAnswerPolicyChangedCount;
  target.effectiveAnswerPolicyChangedRegressionCount +=
    value.effectiveAnswerPolicyChangedRegressionCount;
  target.effectiveAnswerPolicyUnchangedAnswerChangeCount +=
    value.effectiveAnswerPolicyUnchangedAnswerChangeCount;
  target.effectiveAnswerPolicyUnchangedCount += value.effectiveAnswerPolicyUnchangedCount;
  target.effectiveAnswerPolicyUnchangedRegressionCount +=
    value.effectiveAnswerPolicyUnchangedRegressionCount;
  target.fullyRetrievedDelta += value.fullyRetrievedDelta;
  target.fullRecallWrongNoisyDelta += value.fullRecallWrongNoisyDelta;
  target.missingEvidenceWrongDelta += value.missingEvidenceWrongDelta;
  target.noiseTurnDelta += value.noiseTurnDelta;
  target.noisyFullRecallRegressionCount += value.noisyFullRecallRegressionCount;
  target.averageEvidenceRecallDelta += value.averageEvidenceRecallDelta * value.questionCount;
  target.questionCount += value.questionCount;
  target.residualLiveAnswerChangeCount += value.residualLiveAnswerChangeCount;
  target.retrievalMetricChangedAnswerChangeCount +=
    value.retrievalMetricChangedAnswerChangeCount;
  target.unconvertedRetrievalGainCount += value.unconvertedRetrievalGainCount;
  for (const transition of ANSWER_TRANSITIONS) {
    target.answerTransitions[transition] += value.answerTransitions[transition];
  }
  for (const transition of RETRIEVAL_TRANSITIONS) {
    target.retrievalTransitions[transition] += value.retrievalTransitions[transition];
  }
}

function finalizeSummary(summary: AggregateSummary): AggregateSummary {
  return {
    ...summary,
    averageEvidenceRecallDelta:
      summary.questionCount === 0 ? 0 : summary.averageEvidenceRecallDelta / summary.questionCount,
  };
}

function bucketWithMeta(input: {
  bucket?: LocomoReanswerJobBucket;
  category?: LocomoQaCategory;
  summary: AggregateSummary;
}): AggregateBucket {
  return {
    ...(input.bucket ? { bucket: input.bucket } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...finalizeSummary(input.summary),
  } as AggregateBucket;
}

function resolveOutputPath(options: CliOptions): string {
  const runId = options.runId ?? "locomo-reanswer-delta-aggregate-current";
  return options.outputPath ?? join(DEFAULT_OUTPUT_DIR, runId, "reanswer-delta-aggregate.json");
}

export function parseLocomoReanswerDeltaAggregateCliOptions(
  argv: readonly string[],
): CliOptions {
  return parseCliOptions(argv);
}

export async function summarizeLocomoReanswerDeltas(
  options: CliOptions,
  dependencies: Dependencies = {},
): Promise<LocomoReanswerDeltaAggregate> {
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const now = dependencies.now ?? (() => new Date());
  const outputPath = resolveOutputPath(options);
  assertDistinctCliPathValues({
    firstFlag: "--readiness",
    firstValue: options.readinessPath,
    secondFlag: "--output-path",
    secondValue: outputPath,
  });
  for (const deltaPath of options.deltaPaths) {
    assertDistinctCliPathValues({
      firstFlag: "--delta",
      firstValue: deltaPath,
      secondFlag: "--output-path",
      secondValue: outputPath,
    });
  }

  const readinessJobs = parseReadinessJobs(
    await readJson({ path: options.readinessPath, readFileImpl }),
    options.readinessPath,
  );
  const jobByTargetRunId = new Map(
    readinessJobs.map((job) => [job.targetRunId, job] as const),
  );
  const sourceDeltaReports: SourceDeltaReportSummary[] = [];
  const totals = emptyAggregate();
  const byBucket = new Map<LocomoReanswerJobBucket, AggregateSummary>();
  const byCategory = new Map<LocomoQaCategory, AggregateSummary>();
  const byCategoryBucket = new Map<
    LocomoQaCategory,
    Map<LocomoReanswerJobBucket, AggregateSummary>
  >();

  for (const deltaPath of options.deltaPaths) {
    const delta = parseDeltaReport(
      await readJson({ path: deltaPath, readFileImpl }),
      deltaPath,
    );
    const job = jobByTargetRunId.get(delta.candidateReport.runId);
    if (!job) {
      throw new Error(
        `${deltaPath} candidate run ${delta.candidateReport.runId} does not match any readiness replay job.`,
      );
    }
    if (delta.overall.questionCount !== job.questionCount) {
      throw new Error(
        `${deltaPath} questionCount ${delta.overall.questionCount} does not match readiness job ${job.questionCount}.`,
      );
    }
    const categorySummary = delta.categories[job.category];
    if (!categorySummary) {
      throw new Error(`${deltaPath} missing category summary for ${job.category}.`);
    }
    if (categorySummary.questionCount !== delta.overall.questionCount) {
      throw new Error(`${deltaPath} category questionCount must match overall questionCount.`);
    }

    const nearMissCount = delta.answerTokenF1NearMisses.length;
    addSummary({
      answerTokenF1NearMissCount: nearMissCount,
      target: totals,
      value: delta.overall,
    });
    const bucketSummary = byBucket.get(job.bucket) ?? emptyAggregate();
    addSummary({
      answerTokenF1NearMissCount: nearMissCount,
      target: bucketSummary,
      value: delta.overall,
    });
    byBucket.set(job.bucket, bucketSummary);
    const categoryBucketMap = byCategoryBucket.get(job.category) ?? new Map();
    const categoryBucketSummary = categoryBucketMap.get(job.bucket) ?? emptyAggregate();
    addSummary({
      answerTokenF1NearMissCount: nearMissCount,
      target: categoryBucketSummary,
      value: delta.overall,
    });
    categoryBucketMap.set(job.bucket, categoryBucketSummary);
    byCategoryBucket.set(job.category, categoryBucketMap);
    const categoryAggregate = byCategory.get(job.category) ?? emptyAggregate();
    addSummary({
      answerTokenF1NearMissCount: nearMissCount,
      target: categoryAggregate,
      value: delta.overall,
    });
    byCategory.set(job.category, categoryAggregate);

    sourceDeltaReports.push({
      baselineReportPath: delta.baselineReport.path,
      baselineRunId: delta.baselineReport.runId,
      bucket: job.bucket,
      candidateReportPath: delta.candidateReport.path,
      candidateRunId: delta.candidateReport.runId,
      category: job.category,
      deltaPath,
      deltaRunId: delta.runId,
      questionCount: delta.overall.questionCount,
      questionIds: job.questionIds,
    });
  }

  const byBucketObject: Partial<Record<LocomoReanswerJobBucket, AggregateBucket>> = {};
  for (const [bucket, summary] of byBucket) {
    byBucketObject[bucket] = bucketWithMeta({ bucket, summary });
  }
  const byCategoryObject: Partial<Record<LocomoQaCategory, AggregateBucket>> = {};
  for (const [category, summary] of byCategory) {
    byCategoryObject[category] = bucketWithMeta({ category, summary });
  }
  const byCategoryBucketObject: Partial<
    Record<LocomoQaCategory, Partial<Record<LocomoReanswerJobBucket, AggregateBucket>>>
  > = {};
  for (const [category, bucketMap] of byCategoryBucket) {
    byCategoryBucketObject[category] = {};
    for (const [bucket, summary] of bucketMap) {
      byCategoryBucketObject[category]![bucket] = bucketWithMeta({
        bucket,
        category,
        summary,
      });
    }
  }

  return {
    benchmark: "locomo",
    byBucket: byBucketObject,
    byCategory: byCategoryObject,
    byCategoryBucket: byCategoryBucketObject,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    outputPath,
    phase: "phase-65",
    readiness: {
      matchedReadyJobCount: sourceDeltaReports.length,
      path: options.readinessPath,
      readyJobCount: readinessJobs.length,
    },
    runId: options.runId ?? "locomo-reanswer-delta-aggregate-current",
    sourceDeltaReports,
    totals: finalizeSummary(totals),
  };
}

export async function runLocomoReanswerDeltaAggregate(
  options: CliOptions,
  dependencies: Dependencies = {},
): Promise<LocomoReanswerDeltaAggregate> {
  const aggregate = await summarizeLocomoReanswerDeltas(options, dependencies);
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  if (aggregate.outputPath) {
    await mkdirImpl(dirname(aggregate.outputPath), { recursive: true });
    await writeFileImpl(aggregate.outputPath, `${JSON.stringify(aggregate, null, 2)}\n`);
  }
  return aggregate;
}

async function main(): Promise<void> {
  const aggregate = await runLocomoReanswerDeltaAggregate(parseCliOptions(process.argv));
  console.log(JSON.stringify(aggregate, null, 2));
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
