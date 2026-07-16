/**
 * Phase A of the public-claims comparability plan: rescore EXISTING run
 * answers under each benchmark's OFFICIAL / industry-comparable judge
 * protocol, so GoodMemory numbers can sit next to published competitor
 * numbers on the same scale. No answers are regenerated - this only re-judges
 * stored hypotheses.
 *
 * Protocols (embedded verbatim from the upstream sources):
 * - longmemeval: the official evaluate_qa.py anscheck prompts
 *   (github.com/xiaowu0162/LongMemEval, src/evaluation/evaluate_qa.py) -
 *   per-type yes/no judging, temperature 0.
 * - locomo: the industry-comparable J-metric judge from
 *   github.com/mem0ai/memory-benchmarks benchmarks/locomo/prompts.py
 *   (no-evidence variant; binary CORRECT/WRONG on categories 1-4, adversarial
 *   category excluded per that methodology).
 * - beam: the official BEAM judge prompt from github.com/mohammadtavakoli78/BEAM.
 *
 * The judge model comes from GOODMEMORY_JUDGE_* (per user directive: the
 * primary gateway; gpt-5.4 = cross-version, same family as the gpt-5.5
 * answerer - disclose in any claim). Resumable via a per-question progress
 * JSONL in the output run dir.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export type OfficialRescoreBenchmark = "beam" | "locomo" | "longmemeval";
export type OfficialRescoreLimitUnit = "cases" | "rubric-items";
export type OfficialRescoreCaseBenchmark = Exclude<OfficialRescoreBenchmark, "beam">;

export interface OfficialRescoreCliOptions {
  benchmark: OfficialRescoreBenchmark;
  concurrency: number;
  limit?: number;
  profile?: string;
  referencePath?: string;
  reportPath?: string;
  rootPath?: string;
  rubricsPath?: string;
  runId: string;
}

export interface OfficialRescoreSourceInputs {
  referencePath?: string;
  reportPath?: string;
  rootPath?: string;
  rubricsPath?: string;
}

const OFFICIAL_RESCORE_SOURCE_INPUT_KEYS = [
  "referencePath",
  "reportPath",
  "rootPath",
  "rubricsPath",
] as const;
const OFFICIAL_RESCORE_SOURCE_INPUT_KEY_SET: ReadonlySet<string> = new Set(
  OFFICIAL_RESCORE_SOURCE_INPUT_KEYS,
);
const OFFICIAL_RESCORE_SOURCE_INPUT_FINGERPRINT_KEY_SET: ReadonlySet<string> =
  new Set(["bytes", "sha256"]);
const OFFICIAL_RESCORE_RUN_IDENTITY_KEY_SET: ReadonlySet<string> = new Set([
  "benchmark",
  "generatedBy",
  "judgeModel",
  "limit",
  "runId",
  "sourceAnswersUnchanged",
  "sourceInputFingerprints",
  "sourceInputs",
  "sourceProfile",
]);
const OFFICIAL_RESCORE_PROGRESS_ROW_KEY_SET: ReadonlySet<string> = new Set([
  "correct",
  "questionId",
]);
const OFFICIAL_RESCORE_RUBRIC_PROGRESS_ROW_KEY_SET: ReadonlySet<string> =
  new Set(["key", "questionId", "score"]);
const OFFICIAL_RESCORE_SUMMARY_COMMON_KEY_SET: ReadonlySet<string> = new Set([
  "benchmark",
  "categories",
  "claimBoundary",
  "generatedAt",
  "generatedBy",
  "judgeFailures",
  "judgeModel",
  "limit",
  "limitUnit",
  "outputPath",
  "protocol",
  "runId",
  "sourceAnswersUnchanged",
  "sourceInputFingerprints",
  "sourceInputs",
  "sourceProfile",
]);
const OFFICIAL_RESCORE_CASE_SUMMARY_KEY_SET: ReadonlySet<string> = new Set([
  ...OFFICIAL_RESCORE_SUMMARY_COMMON_KEY_SET,
  "judgedCases",
  "overallAccuracy",
  "overallCorrect",
  "selectedCases",
  "sourceCases",
  "totalCases",
]);
const OFFICIAL_RESCORE_BEAM_SUMMARY_KEY_SET: ReadonlySet<string> = new Set([
  ...OFFICIAL_RESCORE_SUMMARY_COMMON_KEY_SET,
  "overallMacroByCategory",
  "overallMicroByQuestion",
  "rubricItemsJudged",
  "scoredQuestions",
  "selectedQuestions",
  "selectedRubricItems",
  "sourceQuestions",
  "sourceRubricItems",
  "totalQuestions",
  "totalRubricItems",
]);
const OFFICIAL_RESCORE_CASE_CATEGORY_SUMMARY_KEY_SET: ReadonlySet<string> =
  new Set(["accuracy", "correct", "total"]);
const OFFICIAL_RESCORE_BEAM_CATEGORY_SUMMARY_KEY_SET: ReadonlySet<string> =
  new Set(["meanScore", "questions"]);
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const OFFICIAL_RESCORE_FLOAT_TOLERANCE = 1e-12;

type OfficialRescoreSourceInputKey = (typeof OFFICIAL_RESCORE_SOURCE_INPUT_KEYS)[number];

export interface OfficialRescoreSourceInputFingerprint {
  bytes: number;
  sha256: string;
}

export type OfficialRescoreSourceInputFingerprints = Partial<
  Record<OfficialRescoreSourceInputKey, OfficialRescoreSourceInputFingerprint>
>;

export interface OfficialRescoreBeamScopeMetadata {
  selectedQuestions: number;
  selectedRubricItems: number;
  sourceQuestions: number;
  sourceRubricItems: number;
}

export interface OfficialRescoreCaseScopeMetadata {
  selectedCases: number;
  sourceCases: number;
}

export type OfficialRescoreScopeMetadata =
  | OfficialRescoreBeamScopeMetadata
  | OfficialRescoreCaseScopeMetadata;

type OfficialRescoreScopeInput =
  | {
      benchmark: "beam";
      selectedQuestionCount: number;
      selectedRubricItemCount: number;
      sourceQuestionCount: number;
      sourceRubricItemCount: number;
    }
  | {
      benchmark: OfficialRescoreCaseBenchmark;
      selectedCaseCount: number;
      sourceCaseCount: number;
    };

interface OfficialRescoreMetadataInput {
  benchmark: OfficialRescoreBenchmark;
  generatedAt: string;
  judgeModel: string | undefined;
  limit?: number;
  outputPath: string;
  runId: string;
  sourceInputFingerprints: OfficialRescoreSourceInputFingerprints;
  sourceInputs: OfficialRescoreSourceInputs;
  sourceProfile?: string;
}

export interface OfficialRescoreRunIdentity {
  benchmark: OfficialRescoreBenchmark;
  generatedBy: "scripts/rescore-official-protocols.ts";
  judgeModel: string | undefined;
  limit?: number;
  runId: string;
  sourceInputFingerprints: OfficialRescoreSourceInputFingerprints;
  sourceInputs: OfficialRescoreSourceInputs;
  sourceProfile?: string;
  sourceAnswersUnchanged: true;
}

interface JudgeCase {
  category: string;
  gold: string;
  hypothesis: string;
  question: string;
  questionId: string;
}

interface JudgeVerdict {
  correct: boolean;
  raw: string;
}

export interface OfficialRescoreProgressRow {
  correct: boolean;
  questionId: string;
}

export interface OfficialRescoreRubricProgressRow {
  key: string;
  questionId: string;
  score: 0 | 0.5 | 1;
}

const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
const OFFICIAL_RESCORE_CLAIM_BOUNDARY =
  "Official-protocol comparability rescore of stored answers; not answer regeneration or a public benchmark claim unless promoted by the benchmark-claim gate.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKnownKeys(
  value: Record<string, unknown>,
  knownKeys: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => knownKeys.has(key));
}

function isOfficialRescoreBenchmark(value: unknown): value is OfficialRescoreBenchmark {
  return value === "beam" || value === "locomo" || value === "longmemeval";
}

function isNonEmptyUnpaddedString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function isSha256HexString(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isUnitIntervalNumber(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isUnitIntervalNumberOrNull(value: unknown): boolean {
  return value === null || isUnitIntervalNumber(value);
}

function numbersClose(left: number, right: number): boolean {
  return Math.abs(left - right) <= OFFICIAL_RESCORE_FLOAT_TOLERANCE;
}

function isOfficialRescoreSourceInputs(
  value: unknown,
): value is OfficialRescoreSourceInputs {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasOnlyKnownKeys(value, OFFICIAL_RESCORE_SOURCE_INPUT_KEY_SET)) {
    return false;
  }
  return OFFICIAL_RESCORE_SOURCE_INPUT_KEYS.every((key) => {
    const inputPath = value[key];
    return inputPath === undefined || isNonEmptyUnpaddedString(inputPath);
  });
}

function isOfficialRescoreSourceInputFingerprint(
  value: unknown,
): value is OfficialRescoreSourceInputFingerprint {
  return (
    isRecord(value) &&
    hasOnlyKnownKeys(value, OFFICIAL_RESCORE_SOURCE_INPUT_FINGERPRINT_KEY_SET) &&
    typeof value.bytes === "number" &&
    Number.isInteger(value.bytes) &&
    value.bytes >= 0 &&
    isSha256HexString(value.sha256)
  );
}

function isOfficialRescoreSourceInputFingerprints(
  value: unknown,
): value is OfficialRescoreSourceInputFingerprints {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasOnlyKnownKeys(value, OFFICIAL_RESCORE_SOURCE_INPUT_KEY_SET)) {
    return false;
  }
  return OFFICIAL_RESCORE_SOURCE_INPUT_KEYS.every((key) => {
    const fingerprint = value[key];
    return (
      fingerprint === undefined ||
      isOfficialRescoreSourceInputFingerprint(fingerprint)
    );
  });
}

function isOfficialRescoreRunIdentity(
  value: unknown,
): value is OfficialRescoreRunIdentity {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasOnlyKnownKeys(value, OFFICIAL_RESCORE_RUN_IDENTITY_KEY_SET)) {
    return false;
  }
  return (
    isOfficialRescoreBenchmark(value.benchmark) &&
    value.generatedBy === "scripts/rescore-official-protocols.ts" &&
    (value.judgeModel === undefined ||
      isNonEmptyUnpaddedString(value.judgeModel)) &&
    (value.limit === undefined ||
      (typeof value.limit === "number" &&
        Number.isInteger(value.limit) &&
        value.limit > 0)) &&
    isNonEmptyUnpaddedString(value.runId) &&
    value.sourceAnswersUnchanged === true &&
    isOfficialRescoreSourceInputFingerprints(value.sourceInputFingerprints) &&
    isOfficialRescoreSourceInputs(value.sourceInputs) &&
    (value.sourceProfile === undefined ||
      (value.benchmark === "longmemeval" &&
        isNonEmptyUnpaddedString(value.sourceProfile)))
  );
}

function parseOfficialRescoreRunIdentity(
  raw: string,
  identityPath: string,
): OfficialRescoreRunIdentity {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      `malformed official rescore run identity at ${identityPath}`,
    );
  }
  if (!isOfficialRescoreRunIdentity(value)) {
    throw new Error(
      `malformed official rescore run identity at ${identityPath}`,
    );
  }
  return value;
}

function sourceInputFingerprintsFingerprint(
  input: OfficialRescoreSourceInputFingerprints,
): string {
  return JSON.stringify({
    ...(input.referencePath === undefined ? {} : { referencePath: input.referencePath }),
    ...(input.reportPath === undefined ? {} : { reportPath: input.reportPath }),
    ...(input.rootPath === undefined ? {} : { rootPath: input.rootPath }),
    ...(input.rubricsPath === undefined ? {} : { rubricsPath: input.rubricsPath }),
  });
}

function sourceInputsFingerprint(input: OfficialRescoreSourceInputs): string {
  return JSON.stringify({
    ...(input.referencePath === undefined ? {} : { referencePath: input.referencePath }),
    ...(input.reportPath === undefined ? {} : { reportPath: input.reportPath }),
    ...(input.rootPath === undefined ? {} : { rootPath: input.rootPath }),
    ...(input.rubricsPath === undefined ? {} : { rubricsPath: input.rubricsPath }),
  });
}

function officialRescoreLimitUnit(benchmark: OfficialRescoreBenchmark): OfficialRescoreLimitUnit {
  return benchmark === "beam" ? "rubric-items" : "cases";
}

function fingerprintOfficialRescoreSourceInputContent(
  content: string | Uint8Array,
): OfficialRescoreSourceInputFingerprint {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  return {
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export function buildOfficialRescoreSourceInputFingerprints(input: {
  contents: Partial<Record<OfficialRescoreSourceInputKey, string | Uint8Array>>;
  sourceInputs: OfficialRescoreSourceInputs;
}): OfficialRescoreSourceInputFingerprints {
  const fingerprints: OfficialRescoreSourceInputFingerprints = {};
  for (const key of OFFICIAL_RESCORE_SOURCE_INPUT_KEYS) {
    if (input.sourceInputs[key] === undefined) continue;
    const content = input.contents[key];
    if (content === undefined) {
      throw new Error(`missing official rescore source input content for ${key}`);
    }
    fingerprints[key] = fingerprintOfficialRescoreSourceInputContent(content);
  }
  return fingerprints;
}

async function readOfficialRescoreSourceInputFingerprints(
  sourceInputs: OfficialRescoreSourceInputs,
): Promise<OfficialRescoreSourceInputFingerprints> {
  const contents: Partial<Record<OfficialRescoreSourceInputKey, Uint8Array>> = {};
  await Promise.all(
    OFFICIAL_RESCORE_SOURCE_INPUT_KEYS.map(async (key) => {
      const sourcePath = sourceInputs[key];
      if (sourcePath === undefined) return;
      contents[key] = await readFile(sourcePath);
    }),
  );
  return buildOfficialRescoreSourceInputFingerprints({ contents, sourceInputs });
}

export function buildOfficialRescoreScopeMetadata(
  input: OfficialRescoreScopeInput,
): OfficialRescoreScopeMetadata {
  if (input.benchmark === "beam") {
    return {
      selectedQuestions: input.selectedQuestionCount,
      selectedRubricItems: input.selectedRubricItemCount,
      sourceQuestions: input.sourceQuestionCount,
      sourceRubricItems: input.sourceRubricItemCount,
    };
  }
  return {
    selectedCases: input.selectedCaseCount,
    sourceCases: input.sourceCaseCount,
  };
}

export function buildOfficialRescoreRunIdentity(input: {
  benchmark: OfficialRescoreBenchmark;
  judgeModel: string | undefined;
  limit?: number;
  runId: string;
  sourceInputFingerprints: OfficialRescoreSourceInputFingerprints;
  sourceInputs: OfficialRescoreSourceInputs;
  sourceProfile?: string;
}): OfficialRescoreRunIdentity {
  return {
    benchmark: input.benchmark,
    generatedBy: "scripts/rescore-official-protocols.ts",
    judgeModel: input.judgeModel,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    runId: input.runId,
    sourceAnswersUnchanged: true,
    sourceInputFingerprints: input.sourceInputFingerprints,
    sourceInputs: input.sourceInputs,
    ...(input.sourceProfile === undefined
      ? {}
      : { sourceProfile: input.sourceProfile }),
  };
}

export function assertOfficialRescoreRunIdentityCompatible(
  existing: OfficialRescoreRunIdentity,
  expected: OfficialRescoreRunIdentity,
): void {
  if (existing.generatedBy !== expected.generatedBy) {
    throw new Error("official rescore run identity changed: generatedBy");
  }
  if (existing.runId !== expected.runId) {
    throw new Error("official rescore run identity changed: runId");
  }
  if (existing.benchmark !== expected.benchmark) {
    throw new Error("official rescore run identity changed: benchmark");
  }
  if (existing.judgeModel !== expected.judgeModel) {
    throw new Error("official rescore run identity changed: judgeModel");
  }
  if (existing.limit !== expected.limit) {
    throw new Error("official rescore run identity changed: limit");
  }
  if (existing.sourceAnswersUnchanged !== expected.sourceAnswersUnchanged) {
    throw new Error("official rescore run identity changed: sourceAnswersUnchanged");
  }
  if (existing.sourceProfile !== expected.sourceProfile) {
    throw new Error("official rescore run identity changed: sourceProfile");
  }
  if (sourceInputsFingerprint(existing.sourceInputs) !== sourceInputsFingerprint(expected.sourceInputs)) {
    throw new Error("official rescore run identity changed: sourceInputs");
  }
  if (
    sourceInputFingerprintsFingerprint(existing.sourceInputFingerprints) !==
    sourceInputFingerprintsFingerprint(expected.sourceInputFingerprints)
  ) {
    throw new Error("official rescore run identity changed: sourceInputFingerprints");
  }
}

export function buildOfficialRescoreMetadata(
  input: OfficialRescoreMetadataInput,
) {
  return {
    benchmark: input.benchmark,
    claimBoundary: OFFICIAL_RESCORE_CLAIM_BOUNDARY,
    generatedAt: input.generatedAt,
    generatedBy: "scripts/rescore-official-protocols.ts",
    judgeModel: input.judgeModel,
    limit: input.limit ?? null,
    limitUnit: officialRescoreLimitUnit(input.benchmark),
    outputPath: input.outputPath,
    runId: input.runId,
    sourceAnswersUnchanged: true,
    sourceInputFingerprints: input.sourceInputFingerprints,
    sourceInputs: input.sourceInputs,
    ...(input.sourceProfile === undefined
      ? {}
      : { sourceProfile: input.sourceProfile }),
  };
}

export function validateOfficialRescoreSummary(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["official rescore summary must be an object"];
  }
  const benchmark = value.benchmark;
  if (!isOfficialRescoreBenchmark(benchmark)) {
    errors.push("benchmark must be beam, locomo, or longmemeval");
    return errors;
  }
  const knownKeys =
    benchmark === "beam"
      ? OFFICIAL_RESCORE_BEAM_SUMMARY_KEY_SET
      : OFFICIAL_RESCORE_CASE_SUMMARY_KEY_SET;
  if (!hasOnlyKnownKeys(value, knownKeys)) {
    errors.push("summary contains unknown fields");
  }
  if (value.claimBoundary !== OFFICIAL_RESCORE_CLAIM_BOUNDARY) {
    errors.push("claimBoundary must describe stored-answer comparability");
  }
  if (!isNonEmptyUnpaddedString(value.generatedAt)) {
    errors.push("generatedAt must be a non-empty unpadded string");
  }
  if (value.generatedBy !== "scripts/rescore-official-protocols.ts") {
    errors.push("generatedBy must be scripts/rescore-official-protocols.ts");
  }
  if (!isNonEmptyUnpaddedString(value.judgeModel)) {
    errors.push("judgeModel must be a non-empty unpadded string");
  }
  if (
    !(
      value.limit === null ||
      (typeof value.limit === "number" &&
        Number.isInteger(value.limit) &&
        value.limit > 0)
    )
  ) {
    errors.push("limit must be null or a positive integer");
  }
  if (value.limitUnit !== officialRescoreLimitUnit(benchmark)) {
    errors.push(`limitUnit must be ${officialRescoreLimitUnit(benchmark)}`);
  }
  if (!isNonEmptyUnpaddedString(value.outputPath)) {
    errors.push("outputPath must be a non-empty unpadded string");
  }
  if (!isNonEmptyUnpaddedString(value.protocol)) {
    errors.push("protocol must be a non-empty unpadded string");
  }
  if (!isNonEmptyUnpaddedString(value.runId)) {
    errors.push("runId must be a non-empty unpadded string");
  }
  if (value.sourceAnswersUnchanged !== true) {
    errors.push("sourceAnswersUnchanged must be true");
  }
  if (!isOfficialRescoreSourceInputFingerprints(value.sourceInputFingerprints)) {
    errors.push("sourceInputFingerprints must be canonical source fingerprints");
  }
  if (!isOfficialRescoreSourceInputs(value.sourceInputs)) {
    errors.push("sourceInputs must be canonical source input paths");
  }
  if (
    value.sourceProfile !== undefined &&
    (benchmark !== "longmemeval" ||
      !isNonEmptyUnpaddedString(value.sourceProfile))
  ) {
    errors.push(
      "sourceProfile must be a non-empty unpadded string for longmemeval only",
    );
  }
  if (!isRecord(value.categories) || Object.keys(value.categories).length === 0) {
    errors.push("categories must be a non-empty object");
  }
  if (!isNonNegativeInteger(value.judgeFailures)) {
    errors.push("judgeFailures must be a non-negative integer");
  }

  if (benchmark === "beam") {
    if (!isPositiveInteger(value.sourceQuestions)) {
      errors.push("sourceQuestions must be a positive integer");
    }
    if (!isPositiveInteger(value.selectedQuestions)) {
      errors.push("selectedQuestions must be a positive integer");
    }
    if (!isPositiveInteger(value.sourceRubricItems)) {
      errors.push("sourceRubricItems must be a positive integer");
    }
    if (!isPositiveInteger(value.selectedRubricItems)) {
      errors.push("selectedRubricItems must be a positive integer");
    }
    if (!isNonNegativeInteger(value.scoredQuestions)) {
      errors.push("scoredQuestions must be a non-negative integer");
    }
    if (!isNonNegativeInteger(value.rubricItemsJudged)) {
      errors.push("rubricItemsJudged must be a non-negative integer");
    }
    if (value.totalQuestions !== value.selectedQuestions) {
      errors.push("totalQuestions must equal selectedQuestions");
    }
    if (value.totalRubricItems !== value.selectedRubricItems) {
      errors.push("totalRubricItems must equal selectedRubricItems");
    }
    if (
      isPositiveInteger(value.selectedQuestions) &&
      isPositiveInteger(value.sourceQuestions) &&
      value.selectedQuestions > value.sourceQuestions
    ) {
      errors.push("selectedQuestions cannot exceed sourceQuestions");
    }
    if (
      isPositiveInteger(value.selectedRubricItems) &&
      isPositiveInteger(value.sourceRubricItems) &&
      value.selectedRubricItems > value.sourceRubricItems
    ) {
      errors.push("selectedRubricItems cannot exceed sourceRubricItems");
    }
    if (
      isNonNegativeInteger(value.rubricItemsJudged) &&
      isPositiveInteger(value.selectedRubricItems) &&
      value.rubricItemsJudged !== value.selectedRubricItems
    ) {
      errors.push("rubricItemsJudged must equal selectedRubricItems");
    }
    if (
      value.limit === null &&
      isNonNegativeInteger(value.scoredQuestions) &&
      isPositiveInteger(value.selectedQuestions) &&
      value.scoredQuestions !== value.selectedQuestions
    ) {
      errors.push("full-scope scoredQuestions must equal selectedQuestions");
    }
    if (!isUnitIntervalNumberOrNull(value.overallMacroByCategory)) {
      errors.push("overallMacroByCategory must be null or a number in [0, 1]");
    }
    if (!isUnitIntervalNumberOrNull(value.overallMicroByQuestion)) {
      errors.push("overallMicroByQuestion must be null or a number in [0, 1]");
    }
    validateOfficialRescoreBeamSummaryAggregates(value, errors);
  } else {
    if (!isPositiveInteger(value.sourceCases)) {
      errors.push("sourceCases must be a positive integer");
    }
    if (!isPositiveInteger(value.selectedCases)) {
      errors.push("selectedCases must be a positive integer");
    }
    if (!isNonNegativeInteger(value.judgedCases)) {
      errors.push("judgedCases must be a non-negative integer");
    }
    if (!isNonNegativeInteger(value.overallCorrect)) {
      errors.push("overallCorrect must be a non-negative integer");
    }
    if (value.totalCases !== value.selectedCases) {
      errors.push("totalCases must equal selectedCases");
    }
    if (
      isPositiveInteger(value.selectedCases) &&
      isPositiveInteger(value.sourceCases) &&
      value.selectedCases > value.sourceCases
    ) {
      errors.push("selectedCases cannot exceed sourceCases");
    }
    if (
      isNonNegativeInteger(value.judgedCases) &&
      isPositiveInteger(value.selectedCases) &&
      value.judgedCases !== value.selectedCases
    ) {
      errors.push("judgedCases must equal selectedCases");
    }
    if (
      isNonNegativeInteger(value.overallCorrect) &&
      isPositiveInteger(value.selectedCases) &&
      value.overallCorrect > value.selectedCases
    ) {
      errors.push("overallCorrect cannot exceed selectedCases");
    }
    if (!isUnitIntervalNumberOrNull(value.overallAccuracy)) {
      errors.push("overallAccuracy must be null or a number in [0, 1]");
    }
    validateOfficialRescoreCaseSummaryAggregates(value, errors);
  }

  return errors;
}

function validateOfficialRescoreCaseSummaryAggregates(
  value: Record<string, unknown>,
  errors: string[],
): void {
  if (!isRecord(value.categories)) {
    return;
  }

  let categoryCorrect = 0;
  let categoryTotal = 0;
  for (const [category, bucket] of Object.entries(value.categories)) {
    if (!isNonEmptyUnpaddedString(category)) {
      errors.push("case category names must be non-empty unpadded strings");
    }
    if (!isRecord(bucket)) {
      errors.push(`case category ${category} must be an object`);
      continue;
    }
    if (!hasOnlyKnownKeys(bucket, OFFICIAL_RESCORE_CASE_CATEGORY_SUMMARY_KEY_SET)) {
      errors.push(`case category ${category} contains unknown fields`);
    }

    const { accuracy, correct, total } = bucket;
    const totalIsValid = isPositiveInteger(total);
    const correctIsValid = isNonNegativeInteger(correct);
    const accuracyIsValid = isUnitIntervalNumber(accuracy);
    if (!totalIsValid) {
      errors.push(`case category ${category} total must be a positive integer`);
    }
    if (!correctIsValid) {
      errors.push(`case category ${category} correct must be a non-negative integer`);
    }
    if (!accuracyIsValid) {
      errors.push(`case category ${category} accuracy must be a number in [0, 1]`);
    }
    if (correctIsValid && totalIsValid && correct > total) {
      errors.push(`case category ${category} correct cannot exceed total`);
    }
    if (correctIsValid && totalIsValid && accuracyIsValid) {
      categoryCorrect += correct;
      categoryTotal += total;
      if (!numbersClose(accuracy, correct / total)) {
        errors.push(`case category ${category} accuracy must equal correct / total`);
      }
    }
  }

  if (isPositiveInteger(value.selectedCases) && categoryTotal !== value.selectedCases) {
    errors.push("case category totals must equal selectedCases");
  }
  if (
    isNonNegativeInteger(value.overallCorrect) &&
    categoryCorrect !== value.overallCorrect
  ) {
    errors.push("case category correct sum must equal overallCorrect");
  }
  if (
    isUnitIntervalNumber(value.overallAccuracy) &&
    isNonNegativeInteger(value.overallCorrect) &&
    isPositiveInteger(value.selectedCases) &&
    !numbersClose(value.overallAccuracy, value.overallCorrect / value.selectedCases)
  ) {
    errors.push("overallAccuracy must equal overallCorrect / selectedCases");
  }
}

function validateOfficialRescoreBeamSummaryAggregates(
  value: Record<string, unknown>,
  errors: string[],
): void {
  if (!isRecord(value.categories)) {
    return;
  }

  let categoryCount = 0;
  let categoryQuestionTotal = 0;
  let categoryMeanSum = 0;
  let weightedMeanSum = 0;
  for (const [category, bucket] of Object.entries(value.categories)) {
    if (!isNonEmptyUnpaddedString(category)) {
      errors.push("BEAM category names must be non-empty unpadded strings");
    }
    if (!isRecord(bucket)) {
      errors.push(`BEAM category ${category} must be an object`);
      continue;
    }
    if (!hasOnlyKnownKeys(bucket, OFFICIAL_RESCORE_BEAM_CATEGORY_SUMMARY_KEY_SET)) {
      errors.push(`BEAM category ${category} contains unknown fields`);
    }

    const { meanScore, questions } = bucket;
    const questionsIsValid = isPositiveInteger(questions);
    const meanScoreIsValid = isUnitIntervalNumber(meanScore);
    if (!questionsIsValid) {
      errors.push(`BEAM category ${category} questions must be a positive integer`);
    }
    if (!meanScoreIsValid) {
      errors.push(`BEAM category ${category} meanScore must be a number in [0, 1]`);
    }
    if (questionsIsValid && meanScoreIsValid) {
      categoryCount += 1;
      categoryQuestionTotal += questions;
      categoryMeanSum += meanScore;
      weightedMeanSum += meanScore * questions;
    }
  }

  if (
    isNonNegativeInteger(value.scoredQuestions) &&
    categoryQuestionTotal !== value.scoredQuestions
  ) {
    errors.push("BEAM category question totals must equal scoredQuestions");
  }
  if (categoryCount === 0) {
    return;
  }
  if (
    isUnitIntervalNumber(value.overallMacroByCategory) &&
    !numbersClose(value.overallMacroByCategory, categoryMeanSum / categoryCount)
  ) {
    errors.push("overallMacroByCategory must equal the mean of category meanScore values");
  }
  if (
    isUnitIntervalNumber(value.overallMicroByQuestion) &&
    categoryQuestionTotal > 0 &&
    !numbersClose(value.overallMicroByQuestion, weightedMeanSum / categoryQuestionTotal)
  ) {
    errors.push(
      "overallMicroByQuestion must equal the question-weighted mean of category meanScore values",
    );
  }
}

export function assertOfficialRescoreSummaryValid(value: unknown): void {
  const errors = validateOfficialRescoreSummary(value);
  if (errors.length === 0) {
    return;
  }
  throw new Error(`malformed official rescore summary: ${errors.join("; ")}`);
}

export function requireOfficialRescoreCompleteJudging(input: {
  failureCount: number;
  label: string;
}): void {
  if (input.failureCount === 0) {
    return;
  }
  throw new Error(
    `official rescore ${input.label} had ${input.failureCount} judge failure(s); rerun with the same run id to resume before writing a final summary.`,
  );
}

function parseJsonLine(line: string): unknown {
  return JSON.parse(line);
}

function parseOfficialRescoreRubricProgressKeyQuestionId(key: string): string | null {
  const separatorIndex = key.lastIndexOf("#");
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }
  const itemIndex = key.slice(separatorIndex + 1);
  if (!/^(0|[1-9][0-9]*)$/.test(itemIndex)) {
    return null;
  }
  return key.slice(0, separatorIndex);
}

export function parseOfficialRescoreProgressLine(
  line: string,
  label: string,
): OfficialRescoreProgressRow {
  const parsed = parseJsonLine(line);
  if (
    !isRecord(parsed) ||
    !hasOnlyKnownKeys(parsed, OFFICIAL_RESCORE_PROGRESS_ROW_KEY_SET) ||
    !("correct" in parsed) ||
    !("questionId" in parsed)
  ) {
    throw new Error(`malformed official rescore progress row at ${label}`);
  }
  const row = parsed;
  if (
    typeof row.correct !== "boolean" ||
    typeof row.questionId !== "string" ||
    row.questionId.trim() !== row.questionId ||
    row.questionId.length === 0
  ) {
    throw new Error(`malformed official rescore progress row at ${label}`);
  }
  return {
    correct: row.correct,
    questionId: row.questionId,
  };
}

export function serializeOfficialRescoreProgressRow(
  row: OfficialRescoreProgressRow,
): string {
  return JSON.stringify({
    correct: row.correct,
    questionId: row.questionId,
  });
}

export function serializeOfficialRescoreRubricProgressRow(
  row: OfficialRescoreRubricProgressRow,
): string {
  return JSON.stringify({
    key: row.key,
    questionId: row.questionId,
    score: row.score,
  });
}

export function parseOfficialRescoreRubricProgressLine(
  line: string,
  label: string,
): OfficialRescoreRubricProgressRow {
  const parsed = parseJsonLine(line);
  if (
    !isRecord(parsed) ||
    !hasOnlyKnownKeys(parsed, OFFICIAL_RESCORE_RUBRIC_PROGRESS_ROW_KEY_SET) ||
    !("key" in parsed) ||
    !("questionId" in parsed) ||
    !("score" in parsed)
  ) {
    throw new Error(`malformed official rescore rubric progress row at ${label}`);
  }
  const row = parsed;
  if (
    typeof row.key !== "string" ||
    row.key.trim() !== row.key ||
    row.key.length === 0 ||
    typeof row.questionId !== "string" ||
    row.questionId.trim() !== row.questionId ||
    row.questionId.length === 0 ||
    !(row.score === 0 || row.score === 0.5 || row.score === 1)
  ) {
    throw new Error(`malformed official rescore rubric progress row at ${label}`);
  }
  const keyQuestionId = parseOfficialRescoreRubricProgressKeyQuestionId(row.key);
  if (keyQuestionId !== row.questionId) {
    throw new Error(`malformed official rescore rubric progress row at ${label}`);
  }
  return {
    key: row.key,
    questionId: row.questionId,
    score: row.score,
  };
}

export function readOfficialRescoreProgressRows(
  text: string,
  label: string,
): OfficialRescoreProgressRow[] {
  const rows: OfficialRescoreProgressRow[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    if (!line.trim()) continue;
    let row: OfficialRescoreProgressRow;
    try {
      row = parseOfficialRescoreProgressLine(line, `${label}:${lineIndex + 1}`);
    } catch (error) {
      if (!(error instanceof SyntaxError && lineIndex === lines.length - 1)) {
        throw error;
      }
      // torn tail line from a killed run - ignore
      continue;
    }
    if (seen.has(row.questionId)) {
      throw new Error(
        `duplicate official rescore progress row for ${row.questionId} at ${label}:${lineIndex + 1}`,
      );
    }
    seen.add(row.questionId);
    rows.push(row);
  }
  return rows;
}

export function readOfficialRescoreRubricProgressRows(
  text: string,
  label: string,
): OfficialRescoreRubricProgressRow[] {
  const rows: OfficialRescoreRubricProgressRow[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    if (!line.trim()) continue;
    let row: OfficialRescoreRubricProgressRow;
    try {
      row = parseOfficialRescoreRubricProgressLine(line, `${label}:${lineIndex + 1}`);
    } catch (error) {
      if (!(error instanceof SyntaxError && lineIndex === lines.length - 1)) {
        throw error;
      }
      // torn tail line from a killed run - ignore
      continue;
    }
    if (seen.has(row.key)) {
      throw new Error(
        `duplicate official rescore rubric progress row for ${row.key} at ${label}:${lineIndex + 1}`,
      );
    }
    seen.add(row.key);
    rows.push(row);
  }
  return rows;
}

export function requireOfficialRescoreProgressRowsWithinSelection(
  rows: OfficialRescoreProgressRow[],
  selectedQuestionIds: ReadonlySet<string>,
  label: string,
): void {
  for (const row of rows) {
    if (!selectedQuestionIds.has(row.questionId)) {
      throw new Error(
        `official rescore progress row ${row.questionId} is outside selected scope at ${label}`,
      );
    }
  }
}

export function requireOfficialRescoreRubricProgressRowsWithinSelection(
  rows: OfficialRescoreRubricProgressRow[],
  selectedRubricKeys: ReadonlySet<string>,
  label: string,
): void {
  for (const row of rows) {
    if (!selectedRubricKeys.has(row.key)) {
      throw new Error(
        `official rescore rubric progress row ${row.key} is outside selected scope at ${label}`,
      );
    }
  }
}

function parseOfficialRescoreBenchmark(
  value: string | undefined,
): OfficialRescoreBenchmark {
  if (value === "beam" || value === "locomo" || value === "longmemeval") {
    return value;
  }
  throw new Error("--benchmark must be longmemeval, locomo, or beam.");
}

function validateOfficialRescoreSourceSelectors(input: {
  benchmark: OfficialRescoreBenchmark;
  profile?: string;
  referencePath?: string;
  rootPath?: string;
  rubricsPath?: string;
}): void {
  if (input.referencePath !== undefined && input.benchmark !== "longmemeval") {
    throw new Error("--reference is only valid with --benchmark longmemeval.");
  }
  if (input.rootPath !== undefined && input.benchmark !== "locomo") {
    throw new Error("--root is only valid with --benchmark locomo.");
  }
  if (input.rubricsPath !== undefined && input.benchmark !== "beam") {
    throw new Error("--rubrics is only valid with --benchmark beam.");
  }
  if (input.profile !== undefined && input.benchmark !== "longmemeval") {
    throw new Error("--profile is only valid with --benchmark longmemeval.");
  }
}

function pathResolvesInsideOrEqual(input: {
  candidatePath: string;
  parentPath: string;
}): boolean {
  const relativePath = relative(
    resolve(input.parentPath),
    resolve(input.candidatePath),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

export function assertOfficialRescoreSourceInputsOutsideOutputDir(input: {
  outputDir: string;
  sourceInputs: OfficialRescoreSourceInputs;
}): void {
  for (const key of OFFICIAL_RESCORE_SOURCE_INPUT_KEYS) {
    const sourcePath = input.sourceInputs[key];
    if (sourcePath === undefined) {
      continue;
    }
    if (
      pathResolvesInsideOrEqual({
        candidatePath: sourcePath,
        parentPath: input.outputDir,
      })
    ) {
      throw new Error(
        `official rescore source input ${key} resolves inside output run ` +
          `directory ${input.outputDir}: ${sourcePath}`,
      );
    }
  }
}

export function parseOfficialRescoreCliOptions(
  argv: readonly string[],
): OfficialRescoreCliOptions {
  const benchmark = parseOfficialRescoreBenchmark(
    resolveCliFlagValueStrict(argv, "--benchmark"),
  );
  const concurrency =
    parseCliPositiveIntegerFlagStrict(argv, "--concurrency") ?? 4;
  const limit = parseCliPositiveIntegerFlagStrict(argv, "--limit");
  const profile = resolveCliFlagValueStrict(argv, "--profile");
  const referencePath = resolveCliFlagValueStrict(argv, "--reference");
  const reportPath = resolveCliFlagValueStrict(argv, "--report");
  const rootPath = resolveCliFlagValueStrict(argv, "--root");
  const rubricsPath = resolveCliFlagValueStrict(argv, "--rubrics");
  const runId =
    resolveCliPathSegmentFlagValueStrict(argv, "--run-id") ??
    `rescore-${benchmark}-official-judge`;
  validateOfficialRescoreSourceSelectors({
    benchmark,
    ...(profile === undefined ? {} : { profile }),
    ...(referencePath === undefined ? {} : { referencePath }),
    ...(rootPath === undefined ? {} : { rootPath }),
    ...(rubricsPath === undefined ? {} : { rubricsPath }),
  });

  return {
    benchmark,
    concurrency,
    ...(limit === undefined ? {} : { limit }),
    ...(profile === undefined ? {} : { profile }),
    ...(referencePath === undefined ? {} : { referencePath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(rootPath === undefined ? {} : { rootPath }),
    ...(rubricsPath === undefined ? {} : { rubricsPath }),
    runId,
  };
}

// ---------------------------------------------------------------------------
// LongMemEval official prompts (evaluate_qa.py get_anscheck_prompt, verbatim)
// ---------------------------------------------------------------------------

const LME_DEFAULT_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. \n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_TEMPORAL_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. \n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_KNOWLEDGE_UPDATE_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_PREFERENCE_TEMPLATE =
  "I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: {q}\n\nRubric: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_ABSTENTION_TEMPLATE =
  "I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: {q}\n\nExplanation: {a}\n\nModel Response: {r}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.";

function fillTemplate(template: string, c: JudgeCase): string {
  return template
    .replace("{q}", c.question)
    .replace("{a}", c.gold)
    .replace("{r}", c.hypothesis);
}

function buildLongmemevalPrompt(c: JudgeCase, abstention: boolean): string {
  if (abstention) {
    return fillTemplate(LME_ABSTENTION_TEMPLATE, c);
  }
  switch (c.category) {
    case "temporal-reasoning":
      return fillTemplate(LME_TEMPORAL_TEMPLATE, c);
    case "knowledge-update":
      return fillTemplate(LME_KNOWLEDGE_UPDATE_TEMPLATE, c);
    case "single-session-preference":
      return fillTemplate(LME_PREFERENCE_TEMPLATE, c);
    default:
      return fillTemplate(LME_DEFAULT_TEMPLATE, c);
  }
}

// ---------------------------------------------------------------------------
// LoCoMo industry-comparable judge (mem0ai/memory-benchmarks, no-evidence
// variant, verbatim)
// ---------------------------------------------------------------------------

const LOCOMO_JUDGE_SYSTEM =
  "You are evaluating conversational AI memory recall. Return JSON only with the format requested.";
const LOCOMO_JUDGE_TEMPLATE = `Label the generated answer as CORRECT or WRONG.

## Rules

1. **PARTIAL CREDIT**: If the generated answer includes AT LEAST ONE correct item from the gold answer's list, mark CORRECT. Getting 1 out of 2, 2 out of 4, etc. is always acceptable. Only mark WRONG if NONE of the gold answer items appear.

2. **PARAPHRASES COUNT**: Same concept in different words is CORRECT. "Chocolate raspberry tart" = "chocolate cake with raspberries". "Shelter meal service" = "volunteering at a homeless shelter". Emotions and sentiments in the same positive/negative family count as paraphrases: "proud" = "fulfilled" = "accomplished"; "huge success" = "relieved" = "thrilled" (all express positive achievement). Judge semantic meaning, not exact wording.

3. **EXTRA DETAIL IS FINE**: A longer answer that includes the gold answer's key facts plus additional information is CORRECT. Never penalize for being more detailed or specific. If the generated answer adds extra descriptive details beyond the gold answer while still referencing the same core entity or concept, mark CORRECT.

4. **DATE TOLERANCE**: Dates within 14 days of each other are CORRECT. Durations within 50% are CORRECT (e.g., "5 months" matches "six months"; "19 days" matches "two weeks"). Relative dates ("few days before November") match specific dates in the same window. A specific date (e.g., "February 2020") that is consistent with a vague reference (e.g., "a few years ago" relative to 2023) is CORRECT. Converting "last year" to the actual year (e.g., "2022" when conversations are in 2023) is CORRECT.

5. **SEMANTIC OVERLAP**: Judge whether the generated answer addresses the same topic and captures the core idea of the gold answer. Different wording, phrasing, or level of detail should not result in WRONG if the underlying concept matches. For EMOTIONS and FEELINGS questions, answers expressing sentiments in the same valence (positive/negative) about the same event are CORRECT - do not require the exact same emotion word.

6. **SAME REFERENT**: If the generated answer mentions or references the same named entity, character, person, or concept as the gold answer, mark CORRECT - even if the generated answer provides a different physical description or includes additional details. The key question is: does the generated answer identify the same core entity? If yes, it is CORRECT.

7. **FOCUS ON KNOWLEDGE, NOT WORDING**: The goal is to assess whether the system recalled the right fact. Minor differences in specificity, phrasing, or scope should not result in WRONG. Only mark WRONG when the generated answer demonstrates a genuinely different or incorrect understanding.

## ONLY mark WRONG if:
- The generated answer contains ZERO correct items from the gold answer
- The answer addresses a completely different topic

## Question
Question: {q}
Gold answer: {a}
Generated answer: {r}

Return JSON with "reasoning" (one sentence) and "label" (CORRECT or WRONG). Do NOT include both labels.`;

// ---------------------------------------------------------------------------
// BEAM official unified judge prompt (github.com/mohammadtavakoli78/BEAM,
// src/prompts.py unified_llm_judge_base_prompt, verbatim). Scoring is per
// RUBRIC ITEM on a 1.0/0.5/0.0 scale; a question's score is the mean over its
// rubric items (run_evaluation.py). Deviation disclosed in the summary: the
// official pipeline scores event_ordering with a Kendall-tau metric
// (tau_norm) instead of the judge; the public third-party reference
// (MemPalace issue #125) judged all 1051 rubric items incl. event_ordering,
// and this rescore matches THAT protocol for comparability.
// ---------------------------------------------------------------------------

const BEAM_JUDGE_TEMPLATE = `
You are an expert evaluator tasked with judging whether the LLM's response demonstrates compliance with the specified RUBRIC CRITERION.

## EVALUATION INPUTS
- QUESTION (what the user asked): <question>
- RUBRIC CRITERION (what to check): <rubric_item>
- RESPONSE TO EVALUATE: <llm_response>

## EVALUATION RUBRIC:
The rubric defines a specific requirement, constraint, or expected behavior that the LLM response should demonstrate.

**IMPORTANT**: Pay careful attention to whether the rubric specifies:
- **Positive requirements** (things the response SHOULD include/do)
- **Negative constraints** (things the response SHOULD NOT include/do, often indicated by "no", "not", "avoid", "absent")

## RESPONSIVENESS REQUIREMENT (anchored to the QUESTION)
A compliant response must be **on-topic with respect to the QUESTION** and attempt to answer it.
- If the response does not address the QUESTION, score **0.0** and stop.
- For negative constraints, both must hold: (a) the response is responsive to the QUESTION, and (b) the prohibited element is absent.

## SEMANTIC TOLERANCE RULES:
Judge by meaning, not exact wording.
- Accept **paraphrases** and **synonyms** that preserve intent.
- **Case/punctuation/whitespace** differences must be ignored.
- **Numbers/currencies/dates** may appear in equivalent forms (e.g., "$68,000", "68k", "68,000 USD", or "sixty-eight thousand dollars"). Treat them as equal when numerically equivalent.
- If the rubric expects a number or duration, prefer **normalized comparison** (extract and compare values) over string matching.

## STYLE NEUTRALITY (prevents style contamination):
Ignore tone, politeness, length, and flourish unless the rubric explicitly requires a format/structure (e.g., "itemized list", "no citations", "one sentence").
- Do **not** penalize hedging, voice, or verbosity if content satisfies the rubric.
- Only evaluate format when the rubric **explicitly** mandates it.

## SCORING SCALE:
- **1.0 (Complete Compliance)**: Fully complies with the rubric criterion.
  - Positive: required element present, accurate, properly executed (allowing semantic equivalents).
  - Negative: prohibited element **absent** AND response is **responsive**.

- **0.5 (Partial Compliance)**: Partially complies.
  - Positive: element present but minor inaccuracies/incomplete execution.
  - Negative: generally responsive and mostly avoids the prohibited element but with minor/edge violations.

- **0.0 (No Compliance)**: Fails to comply.
  - Positive: required element missing or incorrect.
  - Negative: prohibited element present **or** response is non-responsive/evasive even if the element is absent.

## EVALUATION INSTRUCTIONS:
1. **Understand the Requirement**: Determine if the rubric is asking for something to be present (positive) or absent (negative/constraint).

2. **Parse Compound Statements**: If the rubric contains multiple elements connected by "and" or commas, evaluate whether:
   - **All elements** must be present for full compliance (1.0)
   - **Some elements** present indicates partial compliance (0.5)
   - **No elements** present indicates no compliance (0.0)

3. **Check Compliance**:
   - For positive requirements: Look for the presence and quality of the required element
   - For negative constraints: Look for the absence of the prohibited element

4. **Assign Score**: Based on compliance with the specific rubric criterion according to the scoring scale above.

5. **Provide Reasoning**: Explain whether the rubric criterion was satisfied and justify the score.

## OUTPUT FORMAT:
Return your evaluation in JSON format with two fields:

{
   "score": [your score: 1.0, 0.5, or 0.0],
   "reason": "[detailed explanation of whether the rubric criterion was satisfied and why this justified the assigned score]"
}

NOTE: ONLY output the json object, without any explanation before or after that
`;

function parseBeamScore(raw: string): OfficialRescoreRubricProgressRow["score"] {
  const jsonMatch = /\{[\s\S]*\}/u.exec(raw);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown };
      const score = Number(parsed.score);
      if (score === 1 || score === 0.5 || score === 0) {
        return score;
      }
    } catch {
      // fall through
    }
  }
  const numeric = /\b(1(?:\.0)?|0\.5|0(?:\.0)?)\b/u.exec(raw);
  if (numeric) {
    const score = Number(numeric[1]);
    if (score === 1 || score === 0.5 || score === 0) {
      return score;
    }
  }
  throw new Error(`unparseable BEAM judge score: ${raw.slice(0, 120)}`);
}

// ---------------------------------------------------------------------------
// Judge client: direct chat-completions call so the official kwargs
// (temperature 0, bounded max_tokens) are honored exactly.
// ---------------------------------------------------------------------------

export interface OfficialRescoreJudgeEnvironment {
  apiKey: string;
  baseURL: string;
  model: string;
}

export const OFFICIAL_RESCORE_REQUEST_TIMEOUT_MS = 180_000;
export const OFFICIAL_RESCORE_REQUEST_TIMEOUT_ENV =
  "GOODMEMORY_OFFICIAL_RESCORE_REQUEST_TIMEOUT_MS";

export function resolveOfficialRescoreRequestTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const value = env[OFFICIAL_RESCORE_REQUEST_TIMEOUT_ENV];
  if (value === undefined) {
    return OFFICIAL_RESCORE_REQUEST_TIMEOUT_MS;
  }
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(
      `${OFFICIAL_RESCORE_REQUEST_TIMEOUT_ENV} must be a positive integer.`,
    );
  }
  return Number(value);
}

function requireCanonicalJudgeEnvValue(input: {
  env: Record<string, string | undefined>;
  name:
    | "GOODMEMORY_JUDGE_API_KEY"
    | "GOODMEMORY_JUDGE_BASE_URL"
    | "GOODMEMORY_JUDGE_MODEL";
}): string {
  const value = input.env[input.name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${input.name} is required for official rescore judging.`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${input.name} must not be empty.`);
  }
  if (value.trim() !== value) {
    throw new Error(`${input.name} must not have leading or trailing whitespace.`);
  }
  return value;
}

export function resolveOfficialRescoreJudgeEnvironment(
  env: Record<string, string | undefined>,
): OfficialRescoreJudgeEnvironment {
  return {
    apiKey: requireCanonicalJudgeEnvValue({
      env,
      name: "GOODMEMORY_JUDGE_API_KEY",
    }),
    baseURL: requireCanonicalJudgeEnvValue({
      env,
      name: "GOODMEMORY_JUDGE_BASE_URL",
    }),
    model: requireCanonicalJudgeEnvValue({
      env,
      name: "GOODMEMORY_JUDGE_MODEL",
    }),
  };
}

export async function callJudge(input: {
  maxTokens: number;
  prompt: string;
  system?: string;
}): Promise<string> {
  const judgeEnv = resolveOfficialRescoreJudgeEnvironment(process.env);
  const requestTimeoutMs = resolveOfficialRescoreRequestTimeoutMs();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${judgeEnv.baseURL.replace(/\/$/, "")}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: input.maxTokens,
          messages: [
            ...(input.system ? [{ content: input.system, role: "system" }] : []),
            { content: input.prompt, role: "user" },
          ],
          model: judgeEnv.model,
          temperature: 0,
        }),
        headers: {
          authorization: `Bearer ${judgeEnv.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!response.ok || payload.error) {
        throw new Error(
          `judge gateway ${response.status}: ${payload.error?.message ?? "request failed"}`,
        );
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("judge returned empty content");
      }
      return content.trim();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function parseYesNo(raw: string): boolean {
  return raw.toLowerCase().includes("yes");
}

function parseCorrectWrong(raw: string): boolean {
  const jsonMatch = /\{[\s\S]*\}/u.exec(raw);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { label?: string };
      if (typeof parsed.label === "string") {
        return parsed.label.toUpperCase() === "CORRECT";
      }
    } catch {
      // fall through to the string check
    }
  }
  const upper = raw.toUpperCase();
  return upper.includes("CORRECT") && !upper.includes("WRONG");
}

// ---------------------------------------------------------------------------
// Case loaders: join stored hypotheses with the benchmark roots.
// ---------------------------------------------------------------------------

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadLongmemevalCases(input: {
  profile?: string;
  referencePath: string;
  reportPath: string;
}): Promise<{ abstentionIds: Set<string>; cases: JudgeCase[] }> {
  const report = (await loadJson(input.reportPath)) as {
    profiles: Record<string, { cases: Array<{ hypothesis: string; questionId: string }> }>;
  };
  const sourceProfile = input.profile ?? "goodmemory-rules-only";
  const profile = report.profiles[sourceProfile];
  if (!profile) {
    throw new Error(`report is missing the ${sourceProfile} profile`);
  }
  const reference = (await loadJson(input.referencePath)) as Array<{
    answer: unknown;
    question: string;
    question_id: string;
    question_type: string;
  }>;
  const byId = new Map(reference.map((entry) => [entry.question_id, entry]));
  const abstentionIds = new Set<string>();
  const cases: JudgeCase[] = [];
  for (const entry of profile.cases) {
    const ref = byId.get(entry.questionId);
    if (!ref) {
      throw new Error(`reference missing question ${entry.questionId}`);
    }
    if (entry.questionId.includes("_abs")) {
      abstentionIds.add(entry.questionId);
    }
    cases.push({
      category: ref.question_type,
      gold: String(ref.answer),
      hypothesis: entry.hypothesis ?? "",
      question: ref.question,
      questionId: entry.questionId,
    });
  }
  return { abstentionIds, cases };
}

async function loadLocomoCases(input: {
  reportPath: string;
  rootPath: string;
}): Promise<JudgeCase[]> {
  const report = (await loadJson(input.reportPath)) as {
    cases: Array<{
      caseId: string;
      category: string;
      generatedAnswer: string | null;
      questionId: string;
    }>;
  };
  const root = (await loadJson(input.rootPath)) as {
    cases: Array<{
      caseId: string;
      questions: Array<{ goldAnswer: string | null; question: string; questionId: string }>;
    }>;
  };
  const byId = new Map<string, { goldAnswer: string | null; question: string }>();
  for (const rootCase of root.cases) {
    for (const question of rootCase.questions) {
      byId.set(question.questionId, question);
    }
  }
  const cases: JudgeCase[] = [];
  for (const entry of report.cases) {
    // The industry J-metric judges categories 1-4 only; the adversarial
    // category is excluded from the comparable number (reported separately by
    // the deterministic scorer).
    if (entry.category === "adversarial") {
      continue;
    }
    const ref = byId.get(entry.questionId);
    if (!ref) {
      throw new Error(`root missing question ${entry.questionId}`);
    }
    cases.push({
      category: entry.category,
      gold: ref.goldAnswer ?? "",
      hypothesis: entry.generatedAnswer ?? "",
      question: ref.question,
      questionId: entry.questionId,
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// BEAM rubric-level rescore (official unified judge, per rubric item)
// ---------------------------------------------------------------------------

async function runBeamRubricRescore(input: {
  concurrency: number;
  generatedAt: string;
  limit?: number;
  outputDir: string;
  progressPath: string;
  reportPath: string;
  rubricsPath: string;
  runId: string;
  sourceInputFingerprints: OfficialRescoreSourceInputFingerprints;
}): Promise<void> {
  const report = (await loadJson(input.reportPath)) as {
    cases: Array<{ hypothesis?: string; questionId: string; questionType: string }>;
  };
  const rubrics = (await loadJson(input.rubricsPath)) as Record<
    string,
    { question: string; rubric: string[] }
  >;
  interface RubricUnit {
    itemIndex: number;
    key: string;
    prompt: string;
    questionId: string;
  }
  let units: RubricUnit[] = [];
  const questionMeta = new Map<string, { itemCount: number; questionType: string }>();
  for (const entry of report.cases) {
    const rubricEntry = rubrics[entry.questionId];
    if (!rubricEntry || rubricEntry.rubric.length === 0) {
      throw new Error(`no rubric for ${entry.questionId}`);
    }
    questionMeta.set(entry.questionId, {
      itemCount: rubricEntry.rubric.length,
      questionType: entry.questionType,
    });
    rubricEntry.rubric.forEach((item, itemIndex) => {
      units.push({
        itemIndex,
        key: `${entry.questionId}#${itemIndex}`,
        prompt: BEAM_JUDGE_TEMPLATE.replace("<question>", rubricEntry.question)
          .replace("<rubric_item>", item)
          .replace("<llm_response>", entry.hypothesis ?? ""),
        questionId: entry.questionId,
      });
    });
  }
  const sourceQuestionCount = questionMeta.size;
  const sourceRubricItemCount = units.length;
  if (input.limit !== undefined) {
    units = units.slice(0, input.limit);
  }
  const selectedQuestionCount = new Set(units.map((unit) => unit.questionId)).size;
  const selectedRubricItemCount = units.length;
  const selectedRubricKeys = new Set(units.map((unit) => unit.key));

  const done = new Map<string, number>();
  try {
    const rows = readOfficialRescoreRubricProgressRows(
      await readFile(input.progressPath, "utf8"),
      input.progressPath,
    );
    requireOfficialRescoreRubricProgressRowsWithinSelection(
      rows,
      selectedRubricKeys,
      input.progressPath,
    );
    for (const row of rows) {
      done.set(row.key, row.score);
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    // fresh run
  }
  const pending = units.filter((unit) => !done.has(unit.key));
  console.log(
    `beam: ${units.length} rubric items over ${questionMeta.size} questions, ${done.size} cached, ${pending.length} to judge (model ${process.env.GOODMEMORY_JUDGE_MODEL})`,
  );

  let cursor = 0;
  let failures = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const unit = pending[index]!;
      try {
        const raw = await callJudge({ maxTokens: 400, prompt: unit.prompt });
        const score = parseBeamScore(raw);
        done.set(unit.key, score);
        await appendFile(
          input.progressPath,
          `${serializeOfficialRescoreRubricProgressRow({
            key: unit.key,
            questionId: unit.questionId,
            score,
          })}\n`,
        );
      } catch (error) {
        failures += 1;
        console.error(`judge failed for ${unit.key}: ${String(error).slice(0, 160)}`);
      }
      if ((index + 1) % 100 === 0) {
        console.log(`${index + 1}/${pending.length} rubric items judged`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(input.concurrency, pending.length)) }, () =>
      worker(),
    ),
  );
  requireOfficialRescoreCompleteJudging({
    failureCount: failures,
    label: "beam",
  });

  const questionScores = new Map<string, number>();
  for (const [questionId, meta] of questionMeta) {
    let sum = 0;
    let scored = 0;
    for (let itemIndex = 0; itemIndex < meta.itemCount; itemIndex += 1) {
      const score = done.get(`${questionId}#${itemIndex}`);
      if (score === undefined) continue;
      sum += score;
      scored += 1;
    }
    if (scored === meta.itemCount) {
      questionScores.set(questionId, sum / meta.itemCount);
    }
  }
  const byCategory = new Map<string, { scores: number[] }>();
  for (const [questionId, score] of questionScores) {
    const meta = questionMeta.get(questionId)!;
    const bucket = byCategory.get(meta.questionType) ?? { scores: [] };
    bucket.scores.push(score);
    byCategory.set(meta.questionType, bucket);
  }
  const categoryMeans = [...byCategory.entries()].map(([category, bucket]) => ({
    category,
    mean: bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length,
    questions: bucket.scores.length,
  }));
  const allScores = [...questionScores.values()];
  const summaryPath = join(input.outputDir, "rescore-summary.json");
  const summary = {
    ...buildOfficialRescoreMetadata({
      benchmark: "beam",
      generatedAt: input.generatedAt,
      judgeModel: process.env.GOODMEMORY_JUDGE_MODEL,
      limit: input.limit,
      outputPath: summaryPath,
      runId: input.runId,
      sourceInputs: {
        reportPath: input.reportPath,
        rubricsPath: input.rubricsPath,
      },
      sourceInputFingerprints: input.sourceInputFingerprints,
    }),
    ...buildOfficialRescoreScopeMetadata({
      benchmark: "beam",
      selectedQuestionCount,
      selectedRubricItemCount,
      sourceQuestionCount,
      sourceRubricItemCount,
    }),
    categories: Object.fromEntries(
      categoryMeans.map((entry) => [
        entry.category,
        { meanScore: entry.mean, questions: entry.questions },
      ]),
    ),
    judgeFailures: failures,
    overallMacroByCategory:
      categoryMeans.reduce((a, b) => a + b.mean, 0) / Math.max(1, categoryMeans.length),
    overallMicroByQuestion:
      allScores.reduce((a, b) => a + b, 0) / Math.max(1, allScores.length),
    protocol:
      "official BEAM unified rubric judge (1.0/0.5/0.0 per rubric item; question = mean over items). Deviation from the paper pipeline: event_ordering is rubric-judged here (the paper scores it with tau_norm); this matches the public third-party reference which judged all 1051 rubric items.",
    rubricItemsJudged: done.size,
    scoredQuestions: questionScores.size,
    totalQuestions: questionMeta.size,
    totalRubricItems: units.length,
  };
  assertOfficialRescoreSummaryValid(summary);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function ensureOfficialRescoreRunIdentity(
  identityPath: string,
  progressPath: string,
  expected: OfficialRescoreRunIdentity,
): Promise<void> {
  try {
    const existing = parseOfficialRescoreRunIdentity(
      await readFile(identityPath, "utf8"),
      identityPath,
    );
    assertOfficialRescoreRunIdentityCompatible(existing, expected);
  } catch (error) {
    if (isMissingFileError(error)) {
      const progress = await readFileIfPresent(progressPath);
      if (progress !== null && progress.trim().length > 0) {
        throw new Error(
          `official rescore progress cache exists without run-identity.json at ${progressPath}`,
        );
      }
      await writeFile(identityPath, `${JSON.stringify(expected, null, 2)}\n`);
      return;
    }
    throw error;
  }
}

async function readFileIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Resumable runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseOfficialRescoreCliOptions(Bun.argv);
  const { benchmark, concurrency, limit, runId } = options;
  const generatedAt = new Date().toISOString();
  const judgeEnv = resolveOfficialRescoreJudgeEnvironment(process.env);

  const outputDir = join(
    repoRoot,
    "reports",
    "eval",
    "research",
    "official-rescore",
    runId,
  );
  await mkdir(outputDir, { recursive: true });
  const runIdentityPath = join(outputDir, "run-identity.json");
  const progressPath = join(outputDir, "progress.jsonl");
  const judgeModel = judgeEnv.model;

  let judgePrompt: (c: JudgeCase) => { maxTokens: number; prompt: string; system?: string };
  let parseVerdict: (raw: string) => boolean;
  let cases: JudgeCase[];
  let sourceInputFingerprints: OfficialRescoreSourceInputFingerprints;
  let sourceInputs: OfficialRescoreSourceInputs;

  if (benchmark === "longmemeval") {
    const referencePath =
      options.referencePath ??
      `${process.env.HOME}/.goodmemory-longmemeval/longmemeval_s.json`;
    const reportPath =
      options.reportPath ??
      join(
        repoRoot,
        "reports/eval/research/phase-62/longmemeval/run-phase67b-longmemeval-rules-deterministic-current/report.json",
      );
    sourceInputs = { referencePath, reportPath };
    assertOfficialRescoreSourceInputsOutsideOutputDir({
      outputDir,
      sourceInputs,
    });
    sourceInputFingerprints = await readOfficialRescoreSourceInputFingerprints(sourceInputs);
    const { abstentionIds, cases: loaded } = await loadLongmemevalCases({
      ...(options.profile === undefined ? {} : { profile: options.profile }),
      referencePath,
      reportPath,
    });
    cases = loaded;
    judgePrompt = (c) => ({
      maxTokens: 10,
      prompt: buildLongmemevalPrompt(c, abstentionIds.has(c.questionId)),
    });
    parseVerdict = parseYesNo;
  } else if (benchmark === "locomo") {
    const reportPath =
      options.reportPath ??
      join(
        repoRoot,
        "reports/eval/research/phase-65/locomo/run-p4-full10-union16-ext-live/union-live-report.json",
      );
    const rootPath = options.rootPath ?? "/private/tmp/LOCOMO-full10/cases.json";
    sourceInputs = { reportPath, rootPath };
    assertOfficialRescoreSourceInputsOutsideOutputDir({
      outputDir,
      sourceInputs,
    });
    sourceInputFingerprints = await readOfficialRescoreSourceInputFingerprints(sourceInputs);
    cases = await loadLocomoCases({
      reportPath,
      rootPath,
    });
    judgePrompt = (c) => ({
      maxTokens: 300,
      prompt: LOCOMO_JUDGE_TEMPLATE.replace("{q}", c.question)
        .replace("{a}", c.gold)
        .replace("{r}", c.hypothesis),
      system: LOCOMO_JUDGE_SYSTEM,
    });
    parseVerdict = parseCorrectWrong;
  } else {
    const reportPath =
      options.reportPath ??
      join(
        repoRoot,
        "reports/eval/research/phase-63/beam/run-p5-beam-closure-rules-abstfmt-gpt54judge/live-slice-report.json",
      );
    const rubricsPath =
      options.rubricsPath ??
      `${process.env.HOME}/.goodmemory-beam/rubrics-by-question-id.json`;
    const sourceInputs = { reportPath, rubricsPath };
    assertOfficialRescoreSourceInputsOutsideOutputDir({
      outputDir,
      sourceInputs,
    });
    const sourceInputFingerprints = await readOfficialRescoreSourceInputFingerprints(sourceInputs);
    await ensureOfficialRescoreRunIdentity(
      runIdentityPath,
      progressPath,
      buildOfficialRescoreRunIdentity({
        benchmark,
        judgeModel,
        limit,
        runId,
        sourceInputFingerprints,
        sourceInputs,
      }),
    );
    await runBeamRubricRescore({
      concurrency,
      generatedAt,
      limit,
      outputDir,
      progressPath,
      reportPath,
      rubricsPath,
      runId,
      sourceInputFingerprints,
    });
    return;
  }

  await ensureOfficialRescoreRunIdentity(
    runIdentityPath,
    progressPath,
    buildOfficialRescoreRunIdentity({
      benchmark,
      judgeModel,
      limit,
      runId,
      sourceInputFingerprints,
      sourceInputs,
      ...(options.profile === undefined
        ? {}
        : { sourceProfile: options.profile }),
    }),
  );

  const sourceCaseCount = cases.length;
  if (limit !== undefined) {
    cases = cases.slice(0, limit);
  }
  const selectedCaseCount = cases.length;
  const selectedQuestionIds = new Set(cases.map((c) => c.questionId));

  const done = new Map<string, boolean>();
  try {
    const rows = readOfficialRescoreProgressRows(
      await readFile(progressPath, "utf8"),
      progressPath,
    );
    requireOfficialRescoreProgressRowsWithinSelection(
      rows,
      selectedQuestionIds,
      progressPath,
    );
    for (const row of rows) {
      done.set(row.questionId, row.correct);
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    // fresh run
  }
  const pending = cases.filter((c) => !done.has(c.questionId));
  console.log(
    `${benchmark}: ${cases.length} cases, ${done.size} cached, ${pending.length} to judge (model ${process.env.GOODMEMORY_JUDGE_MODEL})`,
  );

  let cursor = 0;
  let failures = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const c = pending[index]!;
      try {
        const spec = judgePrompt(c);
        const raw = await callJudge(spec);
        const correct = parseVerdict(raw);
        done.set(c.questionId, correct);
        await appendFile(
          progressPath,
          `${serializeOfficialRescoreProgressRow({
            correct,
            questionId: c.questionId,
          })}\n`,
        );
      } catch (error) {
        failures += 1;
        console.error(`judge failed for ${c.questionId}: ${String(error).slice(0, 160)}`);
      }
      if ((index + 1) % 50 === 0) {
        console.log(`${index + 1}/${pending.length} judged`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, () => worker()),
  );
  requireOfficialRescoreCompleteJudging({
    failureCount: failures,
    label: benchmark,
  });

  const byCategory = new Map<string, { correct: number; total: number }>();
  for (const c of cases) {
    const verdict = done.get(c.questionId);
    if (verdict === undefined) continue;
    const bucket = byCategory.get(c.category) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (verdict) bucket.correct += 1;
    byCategory.set(c.category, bucket);
  }
  const judged = [...done.entries()].filter(([id]) => cases.some((c) => c.questionId === id));
  const overallCorrect = judged.filter(([, v]) => v).length;
  const summaryPath = join(outputDir, "rescore-summary.json");
  const summary = {
    ...buildOfficialRescoreMetadata({
      benchmark,
      generatedAt,
      judgeModel: process.env.GOODMEMORY_JUDGE_MODEL,
      limit,
      outputPath: summaryPath,
      runId,
      sourceInputs,
      sourceInputFingerprints,
      ...(options.profile === undefined
        ? {}
        : { sourceProfile: options.profile }),
    }),
    ...buildOfficialRescoreScopeMetadata({
      benchmark,
      selectedCaseCount,
      sourceCaseCount,
    }),
    categories: Object.fromEntries(
      [...byCategory.entries()].map(([category, bucket]) => [
        category,
        {
          accuracy: bucket.total === 0 ? null : bucket.correct / bucket.total,
          correct: bucket.correct,
          total: bucket.total,
        },
      ]),
    ),
    judgeFailures: failures,
    judgedCases: judged.length,
    overallAccuracy: judged.length === 0 ? null : overallCorrect / judged.length,
    overallCorrect,
    protocol:
      benchmark === "longmemeval"
        ? "official LongMemEval evaluate_qa.py anscheck prompts (temperature 0)"
        : benchmark === "locomo"
          ? "mem0ai/memory-benchmarks LoCoMo judge (no-evidence variant, categories 1-4)"
          : "official BEAM judge prompt",
    totalCases: cases.length,
  };
  assertOfficialRescoreSummaryValid(summary);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
