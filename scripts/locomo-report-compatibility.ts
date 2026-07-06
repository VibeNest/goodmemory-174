import { join, resolve } from "node:path";
import { deriveLocomoMatchMode, LOCOMO_QA_CATEGORIES } from "../src/eval/locomo";
import type { LocomoQaCategory } from "../src/eval/locomo";
import { LOCOMO_REANSWER_JOB_BUCKET_SET } from "./locomo-reanswer-contracts";
import type {
  LocomoCategoryRetrievalSummary,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export interface LocomoReportInput {
  path: string;
  report: LocomoSmokeReport;
}

export function assertLocomoReportInputsHaveDistinctPaths(input: {
  baseline: LocomoReportInput;
  candidate: LocomoReportInput;
}): void {
  if (resolve(input.baseline.path) !== resolve(input.candidate.path)) {
    return;
  }

  throw new Error(
    "baseline and candidate reports must refer to different paths; " +
      `${input.candidate.path} resolves to the same path as ` +
      `${input.baseline.path}.`,
  );
}

export function assertLocomoReportInputsHaveDistinctRunIds(input: {
  baseline: LocomoReportInput;
  candidate: LocomoReportInput;
}): void {
  const baselineRunId = input.baseline.report.runId;
  const candidateRunId = input.candidate.report.runId;
  if (baselineRunId !== candidateRunId) {
    return;
  }

  throw new Error(
    "baseline and candidate reports must use different runIds; " +
      `both declare ${candidateRunId}.`,
  );
}

export function assertLocomoReportInputsHaveUniquePaths(
  reports: readonly LocomoReportInput[],
): void {
  const seen = new Set<string>();
  for (const { path } of reports) {
    const normalizedPath = resolve(path);
    if (seen.has(normalizedPath)) {
      throw new Error(`duplicate report path ${path}.`);
    }
    seen.add(normalizedPath);
  }
}

export type LocomoReportMetadataField =
  | "allowCommonsenseResolution"
  | "strictNoEvidenceAbstention"
  | "answerContextMode"
  | "answerEvaluation"
  | "benchmarkSource"
  | "bm25Ranking"
  | "caseIds"
  | "externalRoot"
  | "ingestMode"
  | "mode"
  | "profilesCompared"
  | "questionCategories"
  | "questionIds"
  | "semanticCandidateEmbeddingSource"
  | "semanticCandidates";

export const LOCOMO_STABLE_EXPERIMENT_METADATA_FIELDS = [
  "mode",
  "answerEvaluation",
  "benchmarkSource",
  "externalRoot",
  "caseIds",
  "questionCategories",
  "questionIds",
  "profilesCompared",
  "bm25Ranking",
  "ingestMode",
  "answerContextMode",
  "allowCommonsenseResolution",
  "strictNoEvidenceAbstention",
  "semanticCandidateEmbeddingSource",
] as const satisfies readonly LocomoReportMetadataField[];

export const LOCOMO_LIVE_DELTA_INVARIANT_METADATA_FIELDS = [
  "mode",
  "answerEvaluation",
  "benchmarkSource",
  "externalRoot",
  "caseIds",
  "questionCategories",
  "questionIds",
  "profilesCompared",
  "ingestMode",
] as const satisfies readonly LocomoReportMetadataField[];

export const LOCOMO_SAME_RETRIEVAL_METADATA_FIELDS = [
  ...LOCOMO_STABLE_EXPERIMENT_METADATA_FIELDS,
  "semanticCandidates",
] as const satisfies readonly LocomoReportMetadataField[];

export const LOCOMO_CATEGORY_GAP_METADATA_FIELDS = [
  "mode",
  "answerEvaluation",
  "benchmarkSource",
  "externalRoot",
  "profilesCompared",
  "bm25Ranking",
  "ingestMode",
  "answerContextMode",
  "allowCommonsenseResolution",
  "strictNoEvidenceAbstention",
  "semanticCandidateEmbeddingSource",
  "semanticCandidates",
] as const satisfies readonly LocomoReportMetadataField[];

export const LOCOMO_CATEGORY_SHARD_METADATA_FIELDS = [
  "mode",
  "answerEvaluation",
  "benchmarkSource",
  "externalRoot",
  "caseIds",
  "questionIds",
  "profilesCompared",
  "bm25Ranking",
  "ingestMode",
  "answerContextMode",
  "allowCommonsenseResolution",
  "strictNoEvidenceAbstention",
  "semanticCandidateEmbeddingSource",
  "semanticCandidates",
] as const satisfies readonly LocomoReportMetadataField[];

const LOCOMO_SEMANTIC_CANDIDATE_EMBEDDING_SOURCES = [
  "none",
  "provider",
  "smoke-hash",
] as const;

const LOCOMO_SEMANTIC_CANDIDATE_TUNING_FIELDS = [
  "maxAdditions",
  "minRelativeScore",
  "minSimilarity",
  "topK",
] as const;

const LOCOMO_ANSWER_CONTEXT_MODES = [
  "evidence-pack",
  "gold-evidence-only-pack",
  "raw-turns",
  "recalled-records",
] as const;

const LOCOMO_EXTERNAL_CASES_FILE_NAME = "cases.json";
const LOCOMO_UPSTREAM_LICENSE = "CC BY-NC 4.0";
const LOCOMO_UPSTREAM_SOURCE = "https://github.com/snap-research/locomo";
const LOCOMO_SYNTHETIC_BENCHMARK_SOURCE = "synthetic-smoke";

const LOCOMO_SMOKE_RUNNER_REPORT_WRITER =
  "scripts/run-phase-65-locomo-smoke.ts";
const LOCOMO_REANSWER_REPORT_WRITER =
  "scripts/reanswer-phase-65-locomo-report.ts";

const LOCOMO_SMOKE_REPORT_WRITERS = [
  LOCOMO_SMOKE_RUNNER_REPORT_WRITER,
  LOCOMO_REANSWER_REPORT_WRITER,
] as const;

const LOCOMO_DIA_ID_PATTERN = /^D\d+:\d+$/u;
const LOCOMO_EXPECTED_PROFILES_COMPARED = ["goodmemory-rules-only"] as const;
const LOCOMO_REPAIR_JOB_DIAGNOSES = [
  "balanced-partial-overlap",
  "numeric-or-frequency-format",
  "over-specified-answer",
  "rationale-bearing-gold-answer",
  "under-specified-answer",
  "zero-token-overlap",
] as const;
const LOCOMO_REPAIR_JOB_DIAGNOSIS_SET: ReadonlySet<string> = new Set(
  LOCOMO_REPAIR_JOB_DIAGNOSES,
);
const LOCOMO_REPAIR_JOB_RETRIEVAL_BUCKETS = [
  "full",
  "partial",
  "zero",
] as const;
const LOCOMO_REPAIR_JOB_RETRIEVAL_BUCKET_SET: ReadonlySet<string> = new Set(
  LOCOMO_REPAIR_JOB_RETRIEVAL_BUCKETS,
);
const LOCOMO_EXECUTION_FAILURE_STAGES = [
  "answer",
  "provider-run-timeout",
  "recall",
  "seed",
] as const;
const LOCOMO_EXECUTION_FAILURE_STAGE_SET: ReadonlySet<string> = new Set(
  LOCOMO_EXECUTION_FAILURE_STAGES,
);

function normalizedMetadataValue(
  report: LocomoSmokeReport,
  field: LocomoReportMetadataField,
): unknown {
  switch (field) {
    case "allowCommonsenseResolution":
      return report.allowCommonsenseResolution ?? false;
    case "strictNoEvidenceAbstention":
      return report.strictNoEvidenceAbstention ?? false;
    case "answerContextMode":
      return report.answerContextMode;
    case "answerEvaluation":
      return report.answerEvaluation;
    case "benchmarkSource":
      return report.benchmarkSource;
    case "bm25Ranking":
      return report.bm25Ranking;
    case "caseIds":
      return report.caseIds;
    case "externalRoot":
      return report.externalRoot;
    case "ingestMode":
      return report.ingestMode;
    case "mode":
      return report.mode;
    case "profilesCompared":
      return report.profilesCompared;
    case "questionCategories":
      return report.questionCategories;
    case "questionIds":
      return report.questionIds ?? null;
    case "semanticCandidateEmbeddingSource":
      return report.semanticCandidateEmbeddingSource;
    case "semanticCandidates":
      return report.semanticCandidates;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStringArrayField(input: {
  field: string;
  nullable?: boolean;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (!Array.isArray(input.value)) {
    const suffix = input.nullable === true ? " or null" : "";
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} must be ` +
        `an array of strings${suffix}.`,
    );
  }
  for (const [index, value] of input.value.entries()) {
    if (typeof value !== "string") {
      throw new Error(
        `Report ${input.path} (${input.runId}) ${input.field} contains ` +
          `non-string value at index ${index}.`,
      );
    }
    if (value.trim().length === 0) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ${input.field} contains ` +
          `empty string at index ${index}.`,
      );
    }
    if (value.trim() !== value) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ${input.field} contains ` +
          `leading or trailing whitespace at index ${index}.`,
      );
    }
  }
}

function assertLocomoTurnIdArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  assertStringArrayField(input);
  if (!Array.isArray(input.value)) {
    return;
  }
  for (const turnId of input.value) {
    if (typeof turnId !== "string") {
      continue;
    }
    if (!LOCOMO_DIA_ID_PATTERN.test(turnId)) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ${input.field} contains ` +
          `non-LoCoMo dia_id ${turnId}.`,
      );
    }
  }
}

function assertUniqueStringArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  assertStringArrayField(input);
  if (!Array.isArray(input.value)) {
    return;
  }
  const duplicate = firstDuplicate(input.value);
  if (duplicate !== null) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} contains ` +
        `duplicate value ${duplicate}.`,
    );
  }
}

function assertNullableUniqueStringArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === null) {
    return;
  }
  assertUniqueStringArrayField(input);
}

function assertNullableNonEmptyUniqueStringArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === null) {
    return;
  }
  assertNonEmptyUniqueStringArrayField(input);
}

function assertNonEmptyUniqueStringArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  assertUniqueStringArrayField(input);
  if (!Array.isArray(input.value)) {
    return;
  }
  if (input.value.length === 0) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must contain at least one value.",
    );
  }
}

function assertNonNegativeIntegerField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (
    typeof input.value !== "number" ||
    !Number.isInteger(input.value) ||
    input.value < 0
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        `${String(input.value)} is not a non-negative integer.`,
    );
  }
}

function assertNullableNonNegativeIntegerField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === null) {
    return;
  }
  assertNonNegativeIntegerField(input);
}

function assertNullablePositiveIntegerField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (
    input.value !== null &&
    (typeof input.value !== "number" ||
      !Number.isInteger(input.value) ||
      input.value <= 0)
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        `${String(input.value)} is not a positive integer or null.`,
    );
  }
}

function assertNonEmptyStringField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (typeof input.value !== "string" || input.value.trim().length === 0) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a non-empty string.",
    );
  }
}

function assertNoEdgeWhitespaceStringField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (typeof input.value !== "string") {
    return;
  }
  if (input.value.trim() !== input.value) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must not have leading or trailing whitespace.",
    );
  }
}

function assertIsoTimestampField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  assertNonEmptyStringField(input);
  assertNoEdgeWhitespaceStringField(input);
  if (typeof input.value !== "string") {
    return;
  }
  const parsed = new Date(input.value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== input.value
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be an ISO timestamp.",
    );
  }
}

function assertLocomoReportWriterField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  assertNonEmptyStringField(input);
  assertNoEdgeWhitespaceStringField(input);
  if (typeof input.value !== "string") {
    return;
  }
  if (
    !LOCOMO_SMOKE_REPORT_WRITERS.includes(
      input.value as (typeof LOCOMO_SMOKE_REPORT_WRITERS)[number],
    )
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        `${JSON.stringify(input.value)} is not a supported LoCoMo report writer.`,
    );
  }
}

function assertExactStringField(input: {
  expected: string;
  field: string;
  label: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  assertNonEmptyStringField(input);
  assertNoEdgeWhitespaceStringField(input);
  if (typeof input.value !== "string") {
    return;
  }
  if (input.value !== input.expected) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        `${JSON.stringify(input.value)} is not supported for ${input.label}.`,
    );
  }
}

function assertFiniteNumberField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a finite number.",
    );
  }
}

function assertBooleanField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (typeof input.value !== "boolean") {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a boolean.",
    );
  }
}

function assertOptionalBooleanField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === undefined) {
    return;
  }
  assertBooleanField(input);
}

function assertNullableBooleanField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value !== null && typeof input.value !== "boolean") {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a boolean or null.",
    );
  }
}

function assertNullableFiniteNumberField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (
    input.value !== null &&
    (typeof input.value !== "number" || !Number.isFinite(input.value))
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a finite number or null.",
    );
  }
}

function assertNullableNonNegativeFiniteNumberField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (
    input.value !== null &&
    (typeof input.value !== "number" ||
      !Number.isFinite(input.value) ||
      input.value < 0)
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a non-negative finite number or null.",
    );
  }
}

function assertUnitIntervalField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (
    typeof input.value !== "number" ||
    !Number.isFinite(input.value) ||
    input.value < 0 ||
    input.value > 1
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a finite number between 0 and 1.",
    );
  }
}

function assertNullableUnitIntervalField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (
    input.value !== null &&
    (typeof input.value !== "number" || !Number.isFinite(input.value))
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a finite number or null.",
    );
  }
  if (
    input.value !== null &&
    (input.value < 0 || input.value > 1)
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a finite number between 0 and 1 or null.",
    );
  }
}

function assertNullableStringField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value !== null && typeof input.value !== "string") {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a string or null.",
    );
  }
}

function assertNullableNonEmptyStringField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === null) {
    return;
  }
  if (typeof input.value !== "string") {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a string or null.",
    );
  }
  if (input.value.trim().length === 0) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be a non-empty string or null.",
    );
  }
}

function assertBenchmarkSourceExternalRootCompatible(input: {
  benchmarkSource: unknown;
  externalRoot: unknown;
  path: string;
  runId: string;
}): void {
  assertNonEmptyStringField({
    field: "benchmarkSource",
    path: input.path,
    runId: input.runId,
    value: input.benchmarkSource,
  });
  assertNoEdgeWhitespaceStringField({
    field: "benchmarkSource",
    path: input.path,
    runId: input.runId,
    value: input.benchmarkSource,
  });
  assertNullableNonEmptyStringField({
    field: "externalRoot",
    path: input.path,
    runId: input.runId,
    value: input.externalRoot,
  });
  assertNoEdgeWhitespaceStringField({
    field: "externalRoot",
    path: input.path,
    runId: input.runId,
    value: input.externalRoot,
  });
  if (
    typeof input.benchmarkSource !== "string" ||
    (input.externalRoot !== null && typeof input.externalRoot !== "string")
  ) {
    return;
  }

  if (input.externalRoot === null) {
    if (input.benchmarkSource !== LOCOMO_SYNTHETIC_BENCHMARK_SOURCE) {
      throw new Error(
        `Report ${input.path} (${input.runId}) benchmarkSource ` +
          `${JSON.stringify(input.benchmarkSource)} requires externalRoot ` +
          `or ${JSON.stringify(LOCOMO_SYNTHETIC_BENCHMARK_SOURCE)}.`,
      );
    }
    return;
  }

  const expectedCasesPath = join(
    input.externalRoot,
    LOCOMO_EXTERNAL_CASES_FILE_NAME,
  );
  if (resolve(input.benchmarkSource) !== resolve(expectedCasesPath)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) benchmarkSource ` +
        `${JSON.stringify(input.benchmarkSource)} does not match ` +
        `externalRoot cases file ${JSON.stringify(expectedCasesPath)}.`,
    );
  }
}

function assertNullableStringArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === null) {
    return;
  }
  assertStringArrayField(input);
}

function assertArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (!Array.isArray(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        "must be an array.",
    );
  }
}

function assertArrayEntriesAreObjects(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (!Array.isArray(input.value)) {
    return;
  }
  for (const [index, value] of input.value.entries()) {
    if (!isRecord(value)) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ${input.field} ` +
          `entry at index ${index} must be an object.`,
      );
    }
  }
}

function assertNonEmptyArrayField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (!Array.isArray(input.value) || input.value.length > 0) {
    return;
  }
  throw new Error(
    `Report ${input.path} (${input.runId}) ${input.field} ` +
      "must contain at least one value.",
  );
}

function assertSemanticCandidateEmbeddingSourceField(input: {
  field?: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  const field = input.field ?? "semanticCandidateEmbeddingSource";
  assertNonEmptyStringField({
    field,
    path: input.path,
    runId: input.runId,
    value: input.value,
  });
  assertNoEdgeWhitespaceStringField({
    field,
    path: input.path,
    runId: input.runId,
    value: input.value,
  });
  if (
    !LOCOMO_SEMANTIC_CANDIDATE_EMBEDDING_SOURCES.includes(
      input.value as (typeof LOCOMO_SEMANTIC_CANDIDATE_EMBEDDING_SOURCES)[number],
    )
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${field} ` +
        `${JSON.stringify(input.value)} is not supported.`,
    );
  }
}

function assertSemanticCandidatesField(input: {
  field?: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  const field = input.field ?? "semanticCandidates";
  if (!isRecord(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${field} must be an object.`,
    );
  }
  assertBooleanField({
    field: `${field}.enabled`,
    path: input.path,
    runId: input.runId,
    value: input.value.enabled,
  });
  assertNullablePositiveIntegerField({
    field: `${field}.topK`,
    path: input.path,
    runId: input.runId,
    value: input.value.topK,
  });
  assertNullableNonNegativeIntegerField({
    field: `${field}.maxAdditions`,
    path: input.path,
    runId: input.runId,
    value: input.value.maxAdditions,
  });
  assertNullableNonNegativeFiniteNumberField({
    field: `${field}.minSimilarity`,
    path: input.path,
    runId: input.runId,
    value: input.value.minSimilarity,
  });
  assertNullableUnitIntervalField({
    field: `${field}.minRelativeScore`,
    path: input.path,
    runId: input.runId,
    value: input.value.minRelativeScore,
  });
}

function assertSemanticCandidateSourceCompatible(input: {
  embeddingSourceField?: string;
  embeddingSourceValue: unknown;
  field?: string;
  path: string;
  runId: string;
  semanticCandidatesValue: unknown;
}): void {
  const field = input.field ?? "semanticCandidates";
  const embeddingSourceField =
    input.embeddingSourceField ?? "semanticCandidateEmbeddingSource";
  if (!isRecord(input.semanticCandidatesValue)) {
    return;
  }
  if (
    input.semanticCandidatesValue.enabled !== true ||
    input.embeddingSourceValue !== "none"
  ) {
    return;
  }
  throw new Error(
    `Report ${input.path} (${input.runId}) ${field}.enabled requires ` +
      `${embeddingSourceField} other than "none".`,
  );
}

function assertBm25RankingSourceCompatible(input: {
  bm25RankingValue: unknown;
  embeddingSourceField?: string;
  embeddingSourceValue: unknown;
  path: string;
  runId: string;
}): void {
  const embeddingSourceField =
    input.embeddingSourceField ?? "semanticCandidateEmbeddingSource";
  if (
    input.bm25RankingValue !== true ||
    input.embeddingSourceValue === "none"
  ) {
    return;
  }
  throw new Error(
    `Report ${input.path} (${input.runId}) bm25Ranking true requires ` +
      `${embeddingSourceField} "none".`,
  );
}

function assertInactiveSemanticCandidateTuningFields(input: {
  field?: string;
  path: string;
  runId: string;
  semanticCandidatesValue: unknown;
}): void {
  const field = input.field ?? "semanticCandidates";
  if (!isRecord(input.semanticCandidatesValue)) {
    return;
  }
  if (input.semanticCandidatesValue.enabled !== false) {
    return;
  }
  for (const tuningField of LOCOMO_SEMANTIC_CANDIDATE_TUNING_FIELDS) {
    if (input.semanticCandidatesValue[tuningField] === null) {
      continue;
    }
    throw new Error(
      `Report ${input.path} (${input.runId}) ${field}.${tuningField} ` +
        `must be null when ${field}.enabled is false.`,
    );
  }
}

function assertAnswerPolicyFlagsRequireLiveAnswer(input: {
  allowCommonsenseResolution: unknown;
  mode: unknown;
  path: string;
  runId: string;
  strictNoEvidenceAbstention: unknown;
}): void {
  if (
    input.allowCommonsenseResolution === true &&
    input.mode !== "live-answer"
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) allowCommonsenseResolution ` +
        "requires mode live-answer.",
    );
  }
  if (
    input.strictNoEvidenceAbstention === true &&
    input.mode !== "live-answer"
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) strictNoEvidenceAbstention ` +
        "requires mode live-answer.",
    );
  }
}

function assertAnswerContextModeCompatibleWithMode(input: {
  answerContextMode: unknown;
  mode: unknown;
  path: string;
  runId: string;
}): void {
  if (
    input.mode === "retrieval-only" &&
    input.answerContextMode !== "raw-turns"
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) retrieval-only reports ` +
        "require answerContextMode raw-turns.",
    );
  }
}

function assertNullableAnswerContextModeField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === null) {
    return;
  }
  assertNonEmptyStringField(input);
  assertNoEdgeWhitespaceStringField(input);
  if (
    !LOCOMO_ANSWER_CONTEXT_MODES.includes(
      input.value as (typeof LOCOMO_ANSWER_CONTEXT_MODES)[number],
    )
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        `${JSON.stringify(input.value)} is not supported.`,
    );
  }
}

function assertOptionalAnswerContextModeField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === undefined) {
    return;
  }
  assertNonEmptyStringField(input);
  assertNoEdgeWhitespaceStringField(input);
  if (
    !LOCOMO_ANSWER_CONTEXT_MODES.includes(
      input.value as (typeof LOCOMO_ANSWER_CONTEXT_MODES)[number],
    )
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} ` +
        `${JSON.stringify(input.value)} is not supported.`,
    );
  }
}

function assertRequiredAnswerContextModeField(input: {
  field: string;
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === undefined) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ${input.field} is required.`,
    );
  }
  assertOptionalAnswerContextModeField(input);
}

function assertAnswerContextModeLineageCompatible(input: {
  answerContextMode: unknown;
  generatedBy: unknown;
  path: string;
  reanswerSelection: unknown;
  runId: string;
  sourceReport: unknown;
}): void {
  if (input.generatedBy === LOCOMO_SMOKE_RUNNER_REPORT_WRITER) {
    if (input.sourceReport !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) smoke report writer ` +
          "must not carry sourceReport lineage.",
      );
    }
    if (input.reanswerSelection !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) smoke report writer ` +
          "must not carry reanswerSelection lineage.",
      );
    }
  }
  if (input.generatedBy === LOCOMO_REANSWER_REPORT_WRITER) {
    if (input.sourceReport === undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) reanswer report writer ` +
          "requires sourceReport lineage.",
      );
    }
    if (input.reanswerSelection === undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) reanswer report writer ` +
          "requires reanswerSelection lineage.",
      );
    }
    if (
      input.answerContextMode !== "evidence-pack" &&
      input.answerContextMode !== "gold-evidence-only-pack"
    ) {
      throw new Error(
        `Report ${input.path} (${input.runId}) reanswer report writer ` +
          `does not support answerContextMode ${String(input.answerContextMode)}.`,
      );
    }
  }
  if (input.answerContextMode !== "gold-evidence-only-pack") {
    return;
  }
  if (input.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    throw new Error(
      `Report ${input.path} (${input.runId}) answerContextMode ` +
        "gold-evidence-only-pack requires the reanswer report writer.",
    );
  }
  if (input.sourceReport === undefined) {
    throw new Error(
      `Report ${input.path} (${input.runId}) answerContextMode ` +
        "gold-evidence-only-pack requires sourceReport lineage.",
    );
  }
}

function assertOptionalSourceReportField(input: {
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === undefined) {
    return;
  }
  if (!isRecord(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) sourceReport must be an object.`,
    );
  }
  assertNullableAnswerContextModeField({
    field: "sourceReport.answerContextMode",
    path: input.path,
    runId: input.runId,
    value: input.value.answerContextMode,
  });
  assertIsoTimestampField({
    field: "sourceReport.generatedAt",
    path: input.path,
    runId: input.runId,
    value: input.value.generatedAt,
  });
  assertNonEmptyStringField({
    field: "sourceReport.path",
    path: input.path,
    runId: input.runId,
    value: input.value.path,
  });
  assertNoEdgeWhitespaceStringField({
    field: "sourceReport.path",
    path: input.path,
    runId: input.runId,
    value: input.value.path,
  });
  assertNonEmptyStringField({
    field: "sourceReport.runId",
    path: input.path,
    runId: input.runId,
    value: input.value.runId,
  });
  assertNoEdgeWhitespaceStringField({
    field: "sourceReport.runId",
    path: input.path,
    runId: input.runId,
    value: input.value.runId,
  });
  if (!isRecord(input.value.retrievalConfig)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) sourceReport.retrievalConfig ` +
        "must be an object.",
    );
  }
  assertBooleanField({
    field: "sourceReport.retrievalConfig.bm25Ranking",
    path: input.path,
    runId: input.runId,
    value: input.value.retrievalConfig.bm25Ranking,
  });
  assertSemanticCandidateEmbeddingSourceField({
    field: "sourceReport.retrievalConfig.semanticCandidateEmbeddingSource",
    path: input.path,
    runId: input.runId,
    value: input.value.retrievalConfig.semanticCandidateEmbeddingSource,
  });
  assertSemanticCandidatesField({
    field: "sourceReport.retrievalConfig.semanticCandidates",
    path: input.path,
    runId: input.runId,
    value: input.value.retrievalConfig.semanticCandidates,
  });
  assertInactiveSemanticCandidateTuningFields({
    field: "sourceReport.retrievalConfig.semanticCandidates",
    path: input.path,
    runId: input.runId,
    semanticCandidatesValue: input.value.retrievalConfig.semanticCandidates,
  });
  assertSemanticCandidateSourceCompatible({
    embeddingSourceField:
      "sourceReport.retrievalConfig.semanticCandidateEmbeddingSource",
    embeddingSourceValue:
      input.value.retrievalConfig.semanticCandidateEmbeddingSource,
    field: "sourceReport.retrievalConfig.semanticCandidates",
    path: input.path,
    runId: input.runId,
    semanticCandidatesValue: input.value.retrievalConfig.semanticCandidates,
  });
}

function assertOptionalReanswerSelectionField(input: {
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === undefined) {
    return;
  }
  if (!isRecord(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) reanswerSelection must be an object.`,
    );
  }
  assertNullableNonEmptyUniqueStringArrayField({
    field: "reanswerSelection.explicitQuestionIds",
    path: input.path,
    runId: input.runId,
    value: input.value.explicitQuestionIds,
  });
  assertNullableNonEmptyStringField({
    field: "reanswerSelection.questionIdFile",
    path: input.path,
    runId: input.runId,
    value: input.value.questionIdFile,
  });
  assertNoEdgeWhitespaceStringField({
    field: "reanswerSelection.questionIdFile",
    path: input.path,
    runId: input.runId,
    value: input.value.questionIdFile,
  });
  assertNullableNonEmptyUniqueStringArrayField({
    field: "reanswerSelection.reanswerJobBuckets",
    path: input.path,
    runId: input.runId,
    value: input.value.reanswerJobBuckets,
  });
  if (Array.isArray(input.value.reanswerJobBuckets)) {
    const unknownBucket = input.value.reanswerJobBuckets.find(
      (bucket) => !LOCOMO_REANSWER_JOB_BUCKET_SET.has(bucket),
    );
    if (unknownBucket !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) reanswerSelection.` +
          `reanswerJobBuckets contains unknown bucket ${unknownBucket}.`,
      );
    }
  }
  assertNullableNonEmptyUniqueStringArrayField({
    field: "reanswerSelection.reanswerJobCategories",
    path: input.path,
    runId: input.runId,
    value: input.value.reanswerJobCategories,
  });
  if (Array.isArray(input.value.reanswerJobCategories)) {
    const unknownCategory = input.value.reanswerJobCategories.find(
      (category) => !isLocomoQaCategory(category),
    );
    if (unknownCategory !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) reanswerSelection.` +
        `reanswerJobCategories contains unknown category ${unknownCategory}.`,
      );
    }
  }
  if (
    (Array.isArray(input.value.reanswerJobBuckets) ||
      Array.isArray(input.value.reanswerJobCategories)) &&
    input.value.questionIdFile === null
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) reanswerSelection.` +
        "questionIdFile is required when reanswer job filters are set.",
    );
  }
}

function assertOptionalQuestionSelectionField(input: {
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (input.value === undefined) {
    return;
  }
  if (!isRecord(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) questionSelection must be an object.`,
    );
  }
  assertNullableNonEmptyUniqueStringArrayField({
    field: "questionSelection.explicitQuestionIds",
    path: input.path,
    runId: input.runId,
    value: input.value.explicitQuestionIds,
  });
  assertNullableNonEmptyStringField({
    field: "questionSelection.questionIdFile",
    path: input.path,
    runId: input.runId,
    value: input.value.questionIdFile,
  });
  assertNoEdgeWhitespaceStringField({
    field: "questionSelection.questionIdFile",
    path: input.path,
    runId: input.runId,
    value: input.value.questionIdFile,
  });
  assertNullableNonEmptyUniqueStringArrayField({
    field: "questionSelection.repairJobDiagnoses",
    path: input.path,
    runId: input.runId,
    value: input.value.repairJobDiagnoses,
  });
  if (Array.isArray(input.value.repairJobDiagnoses)) {
    const unknownDiagnosis = input.value.repairJobDiagnoses.find(
      (diagnosis) => !LOCOMO_REPAIR_JOB_DIAGNOSIS_SET.has(diagnosis),
    );
    if (unknownDiagnosis !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) questionSelection.` +
          `repairJobDiagnoses contains unknown diagnosis ${unknownDiagnosis}.`,
      );
    }
  }
  assertNullableNonEmptyUniqueStringArrayField({
    field: "questionSelection.repairJobRetrievalBuckets",
    path: input.path,
    runId: input.runId,
    value: input.value.repairJobRetrievalBuckets,
  });
  if (Array.isArray(input.value.repairJobRetrievalBuckets)) {
    const unknownBucket = input.value.repairJobRetrievalBuckets.find(
      (bucket) => !LOCOMO_REPAIR_JOB_RETRIEVAL_BUCKET_SET.has(bucket),
    );
    if (unknownBucket !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.runId}) questionSelection.` +
          `repairJobRetrievalBuckets contains unknown bucket ${unknownBucket}.`,
      );
    }
  }
  if (
    (Array.isArray(input.value.repairJobDiagnoses) ||
      Array.isArray(input.value.repairJobRetrievalBuckets)) &&
    input.value.questionIdFile === null
  ) {
    throw new Error(
      `Report ${input.path} (${input.runId}) questionSelection.` +
        "questionIdFile is required when repair job filters are set.",
    );
  }
}

function isLocomoQaCategory(value: string): value is LocomoQaCategory {
  return LOCOMO_QA_CATEGORIES.includes(value as LocomoQaCategory);
}

function assertUpstreamAnswerMetricByCategoryField(input: {
  path: string;
  runId: string;
  value: unknown;
}): void {
  if (!isRecord(input.value)) {
    throw new Error(
      `Report ${input.path} (${input.runId}) ` +
        "upstreamAnswerMetricByCategory must be an object.",
    );
  }
  for (const [category, metric] of Object.entries(input.value)) {
    if (category.trim().length === 0) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ` +
          "upstreamAnswerMetricByCategory contains empty category.",
      );
    }
    if (category.trim() !== category) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ` +
          `upstreamAnswerMetricByCategory category ${JSON.stringify(category)} ` +
          "must not have leading or trailing whitespace.",
      );
    }
    if (!isLocomoQaCategory(category)) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ` +
          "upstreamAnswerMetricByCategory contains unknown category " +
          `${category}.`,
      );
    }
    assertNonEmptyStringField({
      field: `upstreamAnswerMetricByCategory.${category}`,
      path: input.path,
      runId: input.runId,
      value: metric,
    });
    assertNoEdgeWhitespaceStringField({
      field: `upstreamAnswerMetricByCategory.${category}`,
      path: input.path,
      runId: input.runId,
      value: metric,
    });
    if (typeof metric !== "string") {
      continue;
    }
    const expectedMetric = deriveLocomoMatchMode(category);
    if (metric !== expectedMetric) {
      throw new Error(
        `Report ${input.path} (${input.runId}) ` +
          `upstreamAnswerMetricByCategory.${category} ` +
          `${JSON.stringify(metric)} does not match expected ` +
          `${JSON.stringify(expectedMetric)}.`,
      );
    }
  }
}

function assertUpstreamAnswerMetricCategoriesMatchCases(input: {
  path: string;
  report: LocomoSmokeReport;
}): void {
  const metricCategories = Object.keys(
    input.report.upstreamAnswerMetricByCategory,
  );
  const actualCategories = uniqueStrings(
    input.report.cases.map((question) => question.category),
  );
  if (!sameStringSet(metricCategories, actualCategories)) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) ` +
        "upstreamAnswerMetricByCategory categories " +
        `${JSON.stringify(metricCategories)} do not match cases[] ` +
        `categories ${JSON.stringify(actualCategories)}.`,
    );
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const expected = new Set(left);
  return right.every((value) => expected.has(value));
}

function assertQuestionSelectionMatchesReport(input: LocomoReportInput): void {
  const selection = input.report.questionSelection;
  if (selection === undefined) {
    return;
  }
  if (input.report.questionIds === undefined || input.report.questionIds === null) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) questionIds is ` +
        "required when questionSelection is present.",
    );
  }
  const selectedQuestionIds = new Set(input.report.questionIds);
  for (const questionId of selection.explicitQuestionIds ?? []) {
    if (!selectedQuestionIds.has(questionId)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) questionSelection.` +
          `explicitQuestionIds contains ${questionId}, which is not present ` +
          "in report questionIds.",
      );
    }
  }
  if (
    selection.questionIdFile === null &&
    selection.repairJobDiagnoses === null &&
    selection.repairJobRetrievalBuckets === null &&
    !sameStringSet(selection.explicitQuestionIds ?? [], input.report.questionIds)
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) questionSelection.` +
        `explicitQuestionIds ${JSON.stringify(
          selection.explicitQuestionIds,
        )} do not match report questionIds ` +
        `${JSON.stringify(input.report.questionIds)} without manifest or ` +
        "repair-job filters.",
    );
  }
}

function expectedNoiseTurnIds(
  question: LocomoSmokeReport["cases"][number],
): string[] {
  const evidenceTurnIds = new Set(question.evidenceTurnIds);
  return uniqueStrings(
    question.retrievedTurnIds.filter((turnId) => !evidenceTurnIds.has(turnId)),
  );
}

function expectedMissingEvidenceTurnIds(
  question: LocomoSmokeReport["cases"][number],
): string[] {
  const retrievedTurnIds = new Set(question.retrievedTurnIds);
  return question.evidenceTurnIds.filter((turnId) => !retrievedTurnIds.has(turnId));
}

function expectedEvidenceRecall(
  question: LocomoSmokeReport["cases"][number],
  missingEvidenceTurnIds: readonly string[],
): number {
  return question.evidenceTurnIds.length === 0
    ? 1
    : (question.evidenceTurnIds.length - missingEvidenceTurnIds.length) /
        question.evidenceTurnIds.length;
}

function rowIdentity(input: { caseId: string; questionId: string }): string {
  return `${input.caseId}::${input.questionId}`;
}

function assertReanswerExplicitQuestionIdsMatchCases(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const explicitQuestionIds = input.report.reanswerSelection?.explicitQuestionIds;
  if (explicitQuestionIds === undefined || explicitQuestionIds === null) {
    return;
  }
  const caseQuestionIds = new Set(
    input.report.cases.map((question) => question.questionId),
  );
  const missingQuestionId = explicitQuestionIds.find(
    (questionId) => !caseQuestionIds.has(questionId),
  );
  if (missingQuestionId !== undefined) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
        `explicitQuestionIds contains ${missingQuestionId} not present in cases[].`,
    );
  }
}

function assertReanswerQuestionIdsHaveSelectionLineage(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  if (input.report.questionIds === undefined || input.report.questionIds === null) {
    return;
  }
  const explicitQuestionIds = input.report.reanswerSelection?.explicitQuestionIds;
  const questionIdFile = input.report.reanswerSelection?.questionIdFile;
  if (
    Array.isArray(explicitQuestionIds) ||
    typeof questionIdFile === "string"
  ) {
    return;
  }
  throw new Error(
    `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
      "questionIdFile is required when report questionIds are set without " +
      "explicitQuestionIds.",
  );
}

function assertReanswerExplicitOnlyQuestionIdsMatchReport(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const selection = input.report.reanswerSelection;
  if (
    input.report.questionIds === undefined ||
    input.report.questionIds === null ||
    selection === undefined ||
    !Array.isArray(selection.explicitQuestionIds) ||
    selection.questionIdFile !== null ||
    Array.isArray(selection.reanswerJobBuckets) ||
    Array.isArray(selection.reanswerJobCategories)
  ) {
    return;
  }
  if (sameStringSet(selection.explicitQuestionIds, input.report.questionIds)) {
    return;
  }
  throw new Error(
    `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
      `explicitQuestionIds ${JSON.stringify(selection.explicitQuestionIds)} ` +
      `do not match report questionIds ` +
      `${JSON.stringify(input.report.questionIds)} without manifest or job ` +
      "filters.",
  );
}

function assertReanswerQuestionIdFileHasSelectionReason(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const selection = input.report.reanswerSelection;
  if (
    selection?.questionIdFile === undefined ||
    selection.questionIdFile === null
  ) {
    return;
  }
  if (
    (input.report.questionIds !== undefined &&
      input.report.questionIds !== null) ||
    Array.isArray(selection.explicitQuestionIds) ||
    Array.isArray(selection.reanswerJobBuckets) ||
    Array.isArray(selection.reanswerJobCategories)
  ) {
    return;
  }
  throw new Error(
    `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
      "questionIdFile requires selected questionIds or job filters.",
  );
}

function assertReanswerJobCategoriesMatchCases(input: LocomoReportInput): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const selectedCategories =
    input.report.reanswerSelection?.reanswerJobCategories;
  if (!Array.isArray(selectedCategories)) {
    return;
  }
  const explicitQuestionIds = new Set(
    input.report.reanswerSelection?.explicitQuestionIds ?? [],
  );
  const selectedCategorySet = new Set(selectedCategories);
  const unexpectedQuestion = input.report.cases.find(
    (question) =>
      !explicitQuestionIds.has(question.questionId) &&
      !selectedCategorySet.has(question.category),
  );
  if (unexpectedQuestion !== undefined) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
        `reanswerJobCategories excludes case category ` +
        `${unexpectedQuestion.category} for ${unexpectedQuestion.questionId}.`,
    );
  }
}

function assertReanswerQuestionIdFileIsNotSelf(input: LocomoReportInput): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const questionIdFile = input.report.reanswerSelection?.questionIdFile;
  if (typeof questionIdFile !== "string") {
    return;
  }
  if (resolve(questionIdFile) === resolve(input.path)) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
        "questionIdFile must differ from report path.",
    );
  }
}

function assertReanswerQuestionIdFileIsNotSourceReport(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const questionIdFile = input.report.reanswerSelection?.questionIdFile;
  const sourceReport = input.report.sourceReport;
  if (typeof questionIdFile !== "string" || sourceReport === undefined) {
    return;
  }
  if (resolve(questionIdFile) === resolve(sourceReport.path)) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) reanswerSelection.` +
        "questionIdFile must differ from sourceReport.path.",
    );
  }
}

function assertReanswerSelectedScopeHasQuestionIdsHeader(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  if (Array.isArray(input.report.questionIds)) {
    return;
  }
  const selection = input.report.reanswerSelection;
  if (selection === undefined) {
    return;
  }
  if (
    Array.isArray(selection.explicitQuestionIds) ||
    Array.isArray(selection.reanswerJobBuckets) ||
    Array.isArray(selection.reanswerJobCategories)
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) questionIds is ` +
        "required when reanswerSelection has explicit ids or job filters.",
    );
  }
}

function assertReanswerSourceReportIsNotSelf(input: LocomoReportInput): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const sourceReport = input.report.sourceReport;
  if (sourceReport === undefined) {
    return;
  }
  if (sourceReport.runId === input.report.runId) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.runId ` +
        "must differ from report runId.",
    );
  }
  if (resolve(sourceReport.path) === resolve(input.path)) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.path ` +
        "must differ from report path.",
    );
  }
}

function assertReanswerSourceReportTimestampPrecedesReport(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const sourceReport = input.report.sourceReport;
  if (sourceReport === undefined) {
    return;
  }
  if (
    new Date(sourceReport.generatedAt).getTime() >=
    new Date(input.report.generatedAt).getTime()
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.` +
        "generatedAt must be earlier than report generatedAt.",
    );
  }
}

function assertReanswerSourceReportAnswerContextIsReplayable(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const sourceReport = input.report.sourceReport;
  if (sourceReport === undefined) {
    return;
  }
  if (sourceReport.answerContextMode === null) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.` +
        "answerContextMode is required for replay source lineage.",
    );
  }
  if (sourceReport.answerContextMode === "gold-evidence-only-pack") {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.` +
        "answerContextMode gold-evidence-only-pack cannot be used as " +
        "replay source lineage.",
    );
  }
}

function assertReanswerSourceRetrievalConfigMatchesReport(
  input: LocomoReportInput,
): void {
  if (input.report.generatedBy !== LOCOMO_REANSWER_REPORT_WRITER) {
    return;
  }
  const sourceReport = input.report.sourceReport;
  if (sourceReport === undefined) {
    return;
  }
  const retrievalConfig = sourceReport.retrievalConfig;
  if (retrievalConfig.bm25Ranking !== input.report.bm25Ranking) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.` +
        "retrievalConfig.bm25Ranking does not match report bm25Ranking.",
    );
  }
  if (
    retrievalConfig.semanticCandidateEmbeddingSource !==
    input.report.semanticCandidateEmbeddingSource
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.` +
        "retrievalConfig.semanticCandidateEmbeddingSource does not match " +
        "report semanticCandidateEmbeddingSource.",
    );
  }
  if (!sameJson(retrievalConfig.semanticCandidates, input.report.semanticCandidates)) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) sourceReport.` +
        "retrievalConfig.semanticCandidates does not match report " +
        "semanticCandidates.",
    );
  }
}

function assertPresentCategorySummariesMatchCases(
  input: LocomoReportInput,
): void {
  const seenSummaryCategories = new Set<LocomoQaCategory>();
  for (const [index, summary] of input.report.categories.entries()) {
    assertNonEmptyStringField({
      field: `category summary at index ${index} category`,
      path: input.path,
      runId: input.report.runId,
      value: summary.category,
    });
    assertNoEdgeWhitespaceStringField({
      field: `category summary at index ${index} category`,
      path: input.path,
      runId: input.report.runId,
      value: summary.category,
    });
    if (typeof summary.category !== "string") {
      continue;
    }
    if (!isLocomoQaCategory(summary.category)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) has unknown category ` +
          `${summary.category}.`,
      );
    }
    if (seenSummaryCategories.has(summary.category)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) has duplicate ` +
          `category summary ${summary.category}.`,
      );
    }
    seenSummaryCategories.add(summary.category);
    assertNullableUnitIntervalField({
      field: `category ${summary.category} answerAccuracy`,
      path: input.path,
      runId: input.report.runId,
      value: summary.answerAccuracy,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} answeredCount`,
      path: input.path,
      runId: input.report.runId,
      value: summary.answeredCount,
    });
    assertUnitIntervalField({
      field: `category ${summary.category} averageEvidenceRecall`,
      path: input.path,
      runId: input.report.runId,
      value: summary.averageEvidenceRecall,
    });
    assertNullableBooleanField({
      field: `category ${summary.category} crossSessionChainReady`,
      path: input.path,
      runId: input.report.runId,
      value: summary.crossSessionChainReady,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} fullyRetrievedCount`,
      path: input.path,
      runId: input.report.runId,
      value: summary.fullyRetrievedCount,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} noiseTurnTotal`,
      path: input.path,
      runId: input.report.runId,
      value: summary.noiseTurnTotal,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} questionCount`,
      path: input.path,
      runId: input.report.runId,
      value: summary.questionCount,
    });
    const expected = expectedCategorySummary(input.report, summary.category);
    assertCategorySummaryNumber({
      actual: summary.answerAccuracy,
      category: summary.category,
      expected: expected.answerAccuracy,
      field: "answerAccuracy",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: summary.answeredCount,
      category: summary.category,
      expected: expected.answeredCount,
      field: "answeredCount",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: summary.averageEvidenceRecall,
      category: summary.category,
      expected: expected.averageEvidenceRecall,
      field: "averageEvidenceRecall",
      report: input,
    });
    if (summary.crossSessionChainReady !== expected.crossSessionChainReady) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) category ` +
          `${summary.category} crossSessionChainReady ` +
          `${JSON.stringify(summary.crossSessionChainReady)} does not match ` +
          `cases[] ${JSON.stringify(expected.crossSessionChainReady)}.`,
      );
    }
    assertCategorySummaryNumber({
      actual: summary.fullyRetrievedCount,
      category: summary.category,
      expected: expected.fullyRetrievedCount,
      field: "fullyRetrievedCount",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: summary.noiseTurnTotal,
      category: summary.category,
      expected: expected.noiseTurnTotal,
      field: "noiseTurnTotal",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: summary.questionCount,
      category: summary.category,
      expected: expected.questionCount,
      field: "questionCount",
      report: input,
    });
  }
}

function numberMatches(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null) {
    return actual === expected;
  }
  return Math.abs(actual - expected) < 1e-12;
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function expectedCategorySummary(
  report: LocomoSmokeReport,
  category: LocomoQaCategory,
): LocomoCategoryRetrievalSummary {
  const bucket = report.cases.filter((question) => question.category === category);
  const questionCount = bucket.length;
  const fullyRetrievedCount = bucket.filter(
    (question) => question.goldEvidenceFullyRetrieved,
  ).length;
  const answered = bucket.filter((question) => question.answerCorrect !== null);
  const answeredCount = answered.length;
  return {
    answerAccuracy:
      answeredCount === 0
        ? null
        : answered.filter((question) => question.answerCorrect === true).length /
          answeredCount,
    answeredCount,
    averageEvidenceRecall: divideOrZero(
      bucket.reduce((sum, question) => sum + question.evidenceRecall, 0),
      questionCount,
    ),
    category,
    crossSessionChainReady:
      category === "multi_hop"
        ? questionCount > 0 && fullyRetrievedCount === questionCount
        : null,
    fullyRetrievedCount,
    noiseTurnTotal: bucket.reduce(
      (sum, question) => sum + question.noiseTurnCount,
      0,
    ),
    questionCount,
  };
}

function assertCategorySummaryNumber(input: {
  actual: number | null;
  category: LocomoQaCategory;
  expected: number | null;
  field: keyof LocomoCategoryRetrievalSummary;
  report: LocomoReportInput;
}): void {
  if (!numberMatches(input.actual, input.expected)) {
    throw new Error(
      `Report ${input.report.path} (${input.report.report.runId}) category ` +
        `${input.category} ${input.field} ${JSON.stringify(input.actual)} ` +
        `does not match cases[] ${JSON.stringify(input.expected)}.`,
    );
  }
}

export function assertLocomoReportMetadataCompatible(input: {
  candidate: LocomoReportInput;
  fields: readonly LocomoReportMetadataField[];
  reference: LocomoReportInput;
}): void {
  for (const field of input.fields) {
    const expected = normalizedMetadataValue(input.reference.report, field);
    const actual = normalizedMetadataValue(input.candidate.report, field);
    if (!sameJson(actual, expected)) {
      throw new Error(
        `Report ${input.candidate.path} has incompatible ${field}: ` +
          `${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`,
      );
    }
  }
}

export function assertLocomoReportHasNoExecutionFailures(
  input: LocomoReportInput,
): void {
  if (!Number.isInteger(input.report.executionFailures) || input.report.executionFailures < 0) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) executionFailures ` +
        `${input.report.executionFailures} is not a non-negative integer.`,
    );
  }
  if (input.report.executionFailures > 0) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) has ` +
        `${input.report.executionFailures} execution failure(s).`,
    );
  }
}

export function assertLocomoReportHasCompleteLiveAnswers(
  input: LocomoReportInput,
): void {
  if (
    input.report.mode !== "live-answer" ||
    input.report.answerEvaluation !== "scored"
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) must be a scored ` +
        "live-answer report.",
    );
  }
  const missingAnswer = input.report.cases.find(
    (question) =>
      question.answerCorrect === null || question.generatedAnswer === null,
  );
  if (missingAnswer !== undefined) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) live-answer row ` +
        `${missingAnswer.caseId}::${missingAnswer.questionId} is missing ` +
        "a scored generated answer.",
    );
  }
}

export function assertLocomoReportQuestionCountMatchesCases(
  input: LocomoReportInput,
): void {
  const runId = (input.report as { runId?: unknown }).runId;
  if (typeof runId !== "string") {
    throw new Error(`Report ${input.path} runId must be a string.`);
  }
  if (runId.trim().length === 0) {
    throw new Error(`Report ${input.path} runId must not be empty.`);
  }
  if (runId.trim() !== runId) {
    throw new Error(
      `Report ${input.path} runId must not have leading or trailing whitespace.`,
    );
  }
  const rawReport = input.report as {
    allowCommonsenseResolution?: unknown;
    answerContextMode?: unknown;
    benchmarkSource?: unknown;
    bm25Ranking?: unknown;
    cases?: unknown;
    categories?: unknown;
    caseIds?: unknown;
    caseCount?: unknown;
    executionFailures?: unknown;
    externalRoot?: unknown;
    generatedAt?: unknown;
    generatedBy?: unknown;
    ingestMode?: unknown;
    license?: unknown;
    profilesCompared?: unknown;
    questionCategories?: unknown;
    questionCount?: unknown;
    questionIds?: unknown;
    questionSelection?: unknown;
    reanswerSelection?: unknown;
    resume?: unknown;
    runDirectory?: unknown;
    semanticCandidateEmbeddingSource?: unknown;
    semanticCandidates?: unknown;
    sourceReport?: unknown;
    strictNoEvidenceAbstention?: unknown;
    upstreamAnswerMetricByCategory?: unknown;
    upstreamSource?: unknown;
  };
  assertIsoTimestampField({
    field: "generatedAt",
    path: input.path,
    runId,
    value: rawReport.generatedAt,
  });
  assertLocomoReportWriterField({
    field: "generatedBy",
    path: input.path,
    runId,
    value: rawReport.generatedBy,
  });
  assertExactStringField({
    expected: LOCOMO_UPSTREAM_LICENSE,
    field: "license",
    label: "LoCoMo",
    path: input.path,
    runId,
    value: rawReport.license,
  });
  assertNonEmptyStringField({
    field: "runDirectory",
    path: input.path,
    runId,
    value: rawReport.runDirectory,
  });
  assertNoEdgeWhitespaceStringField({
    field: "runDirectory",
    path: input.path,
    runId,
    value: rawReport.runDirectory,
  });
  assertExactStringField({
    expected: LOCOMO_UPSTREAM_SOURCE,
    field: "upstreamSource",
    label: "LoCoMo",
    path: input.path,
    runId,
    value: rawReport.upstreamSource,
  });
  assertBooleanField({
    field: "resume",
    path: input.path,
    runId,
    value: rawReport.resume,
  });
  assertNonNegativeIntegerField({
    field: "executionFailures",
    path: input.path,
    runId,
    value: rawReport.executionFailures,
  });
  assertRequiredAnswerContextModeField({
    field: "answerContextMode",
    path: input.path,
    runId,
    value: rawReport.answerContextMode,
  });
  assertAnswerContextModeLineageCompatible({
    answerContextMode: rawReport.answerContextMode,
    generatedBy: rawReport.generatedBy,
    path: input.path,
    reanswerSelection: rawReport.reanswerSelection,
    runId,
    sourceReport: rawReport.sourceReport,
  });
  assertOptionalBooleanField({
    field: "allowCommonsenseResolution",
    path: input.path,
    runId,
    value: rawReport.allowCommonsenseResolution,
  });
  assertOptionalBooleanField({
    field: "strictNoEvidenceAbstention",
    path: input.path,
    runId,
    value: rawReport.strictNoEvidenceAbstention,
  });
  assertUpstreamAnswerMetricByCategoryField({
    path: input.path,
    runId,
    value: rawReport.upstreamAnswerMetricByCategory,
  });
  assertBenchmarkSourceExternalRootCompatible({
    benchmarkSource: rawReport.benchmarkSource,
    externalRoot: rawReport.externalRoot,
    path: input.path,
    runId,
  });
  assertBooleanField({
    field: "bm25Ranking",
    path: input.path,
    runId,
    value: rawReport.bm25Ranking,
  });
  assertNonEmptyUniqueStringArrayField({
    field: "profilesCompared",
    path: input.path,
    runId,
    value: rawReport.profilesCompared,
  });
  if (!sameJson(rawReport.profilesCompared, LOCOMO_EXPECTED_PROFILES_COMPARED)) {
    throw new Error(
      `Report ${input.path} (${runId}) profilesCompared ` +
        `${JSON.stringify(rawReport.profilesCompared)} does not match ` +
        `expected ${JSON.stringify(LOCOMO_EXPECTED_PROFILES_COMPARED)}.`,
    );
  }
  assertSemanticCandidateEmbeddingSourceField({
    path: input.path,
    runId,
    value: rawReport.semanticCandidateEmbeddingSource,
  });
  assertSemanticCandidatesField({
    path: input.path,
    runId,
    value: rawReport.semanticCandidates,
  });
  assertInactiveSemanticCandidateTuningFields({
    path: input.path,
    runId,
    semanticCandidatesValue: rawReport.semanticCandidates,
  });
  assertSemanticCandidateSourceCompatible({
    embeddingSourceValue: rawReport.semanticCandidateEmbeddingSource,
    path: input.path,
    runId,
    semanticCandidatesValue: rawReport.semanticCandidates,
  });
  assertBm25RankingSourceCompatible({
    bm25RankingValue: rawReport.bm25Ranking,
    embeddingSourceValue: rawReport.semanticCandidateEmbeddingSource,
    path: input.path,
    runId,
  });
  assertOptionalSourceReportField({
    path: input.path,
    runId,
    value: rawReport.sourceReport,
  });
  assertOptionalReanswerSelectionField({
    path: input.path,
    runId,
    value: rawReport.reanswerSelection,
  });
  assertOptionalQuestionSelectionField({
    path: input.path,
    runId,
    value: rawReport.questionSelection,
  });
  assertArrayField({
    field: "cases",
    path: input.path,
    runId,
    value: rawReport.cases,
  });
  assertArrayField({
    field: "categories",
    path: input.path,
    runId,
    value: rawReport.categories,
  });
  assertArrayEntriesAreObjects({
    field: "cases",
    path: input.path,
    runId,
    value: rawReport.cases,
  });
  assertArrayEntriesAreObjects({
    field: "categories",
    path: input.path,
    runId,
    value: rawReport.categories,
  });
  assertNonEmptyUniqueStringArrayField({
    field: "caseIds",
    path: input.path,
    runId,
    value: rawReport.caseIds,
  });
  if (rawReport.questionIds !== undefined && rawReport.questionIds !== null) {
    assertStringArrayField({
      field: "questionIds",
      path: input.path,
      runId,
      value: rawReport.questionIds,
    });
    assertNonEmptyArrayField({
      field: "questionIds",
      path: input.path,
      runId,
      value: rawReport.questionIds,
    });
  }
  if (rawReport.questionCategories !== null) {
    assertStringArrayField({
      field: "questionCategories",
      nullable: true,
      path: input.path,
      runId,
      value: rawReport.questionCategories,
    });
    assertNonEmptyArrayField({
      field: "questionCategories",
      path: input.path,
      runId,
      value: rawReport.questionCategories,
    });
  }
  assertNonNegativeIntegerField({
    field: "questionCount",
    path: input.path,
    runId,
    value: rawReport.questionCount,
  });
  assertNonNegativeIntegerField({
    field: "caseCount",
    path: input.path,
    runId,
    value: rawReport.caseCount,
  });
  assertNonEmptyStringField({
    field: "benchmark",
    path: input.path,
    runId,
    value: input.report.benchmark,
  });
  assertNoEdgeWhitespaceStringField({
    field: "benchmark",
    path: input.path,
    runId,
    value: input.report.benchmark,
  });
  assertNonEmptyStringField({
    field: "phase",
    path: input.path,
    runId,
    value: input.report.phase,
  });
  assertNoEdgeWhitespaceStringField({
    field: "phase",
    path: input.path,
    runId,
    value: input.report.phase,
  });
  assertNonEmptyStringField({
    field: "mode",
    path: input.path,
    runId,
    value: input.report.mode,
  });
  assertNoEdgeWhitespaceStringField({
    field: "mode",
    path: input.path,
    runId,
    value: input.report.mode,
  });
  assertNonEmptyStringField({
    field: "ingestMode",
    path: input.path,
    runId,
    value: input.report.ingestMode,
  });
  assertNoEdgeWhitespaceStringField({
    field: "ingestMode",
    path: input.path,
    runId,
    value: input.report.ingestMode,
  });
  assertNonEmptyStringField({
    field: "answerEvaluation",
    path: input.path,
    runId,
    value: input.report.answerEvaluation,
  });
  assertNoEdgeWhitespaceStringField({
    field: "answerEvaluation",
    path: input.path,
    runId,
    value: input.report.answerEvaluation,
  });
  if (input.report.benchmark !== "locomo") {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) benchmark ` +
        `${JSON.stringify(input.report.benchmark)} is not locomo.`,
    );
  }
  if (input.report.phase !== "phase-65") {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) phase ` +
        `${JSON.stringify(input.report.phase)} is not phase-65.`,
    );
  }
  if (
    input.report.mode !== "retrieval-only" &&
    input.report.mode !== "live-answer"
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) mode ` +
        `${JSON.stringify(input.report.mode)} is not a supported LoCoMo mode.`,
    );
  }
  if (
    input.report.ingestMode !== "raw-turns" &&
    input.report.ingestMode !== "conversational-extraction"
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) ingestMode ` +
        `${JSON.stringify(input.report.ingestMode)} is not supported.`,
    );
  }
  if (
    input.report.answerEvaluation !== "deferred-to-live-mode" &&
    input.report.answerEvaluation !== "scored"
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) answerEvaluation ` +
        `${JSON.stringify(input.report.answerEvaluation)} is not supported.`,
    );
  }
  if (
    input.report.mode === "retrieval-only" &&
    input.report.answerEvaluation !== "deferred-to-live-mode"
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) is retrieval-only but ` +
        `answerEvaluation is ${input.report.answerEvaluation}.`,
    );
  }
  if (
    input.report.mode === "live-answer" &&
    input.report.answerEvaluation !== "scored"
  ) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) is live-answer but ` +
        `answerEvaluation is ${input.report.answerEvaluation}.`,
    );
  }
  assertAnswerContextModeCompatibleWithMode({
    answerContextMode: input.report.answerContextMode,
    mode: input.report.mode,
    path: input.path,
    runId: input.report.runId,
  });
  assertAnswerPolicyFlagsRequireLiveAnswer({
    allowCommonsenseResolution: input.report.allowCommonsenseResolution,
    mode: input.report.mode,
    path: input.path,
    runId: input.report.runId,
    strictNoEvidenceAbstention: input.report.strictNoEvidenceAbstention,
  });
  if (input.report.questionCount !== input.report.cases.length) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) questionCount ` +
        `${input.report.questionCount} does not match cases length ` +
        `${input.report.cases.length}.`,
    );
  }

  for (const [index, question] of input.report.cases.entries()) {
    assertNonEmptyStringField({
      field: `row at index ${index} caseId`,
      path: input.path,
      runId,
      value: question.caseId,
    });
    assertNoEdgeWhitespaceStringField({
      field: `row at index ${index} caseId`,
      path: input.path,
      runId,
      value: question.caseId,
    });
    assertNonEmptyStringField({
      field: `row at index ${index} questionId`,
      path: input.path,
      runId,
      value: question.questionId,
    });
    assertNoEdgeWhitespaceStringField({
      field: `row at index ${index} questionId`,
      path: input.path,
      runId,
      value: question.questionId,
    });
    const identity = rowIdentity(question);
    assertNonEmptyStringField({
      field: `row ${identity} category`,
      path: input.path,
      runId,
      value: question.category,
    });
    assertNoEdgeWhitespaceStringField({
      field: `row ${identity} category`,
      path: input.path,
      runId,
      value: question.category,
    });
    assertUnitIntervalField({
      field: `row ${identity} evidenceRecall`,
      path: input.path,
      runId,
      value: question.evidenceRecall,
    });
    assertNonNegativeIntegerField({
      field: `row ${identity} noiseTurnCount`,
      path: input.path,
      runId,
      value: question.noiseTurnCount,
    });
    assertBooleanField({
      field: `row ${identity} goldEvidenceFullyRetrieved`,
      path: input.path,
      runId,
      value: question.goldEvidenceFullyRetrieved,
    });
    assertNullableBooleanField({
      field: `row ${identity} answerCorrect`,
      path: input.path,
      runId,
      value: question.answerCorrect,
    });
    if (question.answerTokenF1 !== undefined) {
      assertNullableUnitIntervalField({
        field: `row ${identity} answerTokenF1`,
        path: input.path,
        runId,
        value: question.answerTokenF1,
      });
    }
    const executionFailureStage = question.executionFailureStage;
    const executionFailureMessage = question.executionFailureMessage;
    const hasExecutionFailureStage =
      executionFailureStage !== undefined && executionFailureStage !== null;
    const hasExecutionFailureMessage =
      executionFailureMessage !== undefined && executionFailureMessage !== null;
    if (executionFailureStage !== undefined) {
      assertNullableNonEmptyStringField({
        field: `row ${identity} executionFailureStage`,
        path: input.path,
        runId,
        value: executionFailureStage,
      });
      assertNoEdgeWhitespaceStringField({
        field: `row ${identity} executionFailureStage`,
        path: input.path,
        runId,
        value: executionFailureStage,
      });
      if (
        hasExecutionFailureStage &&
        !LOCOMO_EXECUTION_FAILURE_STAGE_SET.has(executionFailureStage)
      ) {
        throw new Error(
          `Report ${input.path} (${input.report.runId}) row ${identity} ` +
            `executionFailureStage ${JSON.stringify(executionFailureStage)} ` +
            "is not supported.",
        );
      }
    }
    if (executionFailureMessage !== undefined) {
      assertNullableNonEmptyStringField({
        field: `row ${identity} executionFailureMessage`,
        path: input.path,
        runId,
        value: executionFailureMessage,
      });
      assertNoEdgeWhitespaceStringField({
        field: `row ${identity} executionFailureMessage`,
        path: input.path,
        runId,
        value: executionFailureMessage,
      });
    }
    if (hasExecutionFailureStage !== hasExecutionFailureMessage) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          "must carry executionFailureStage and executionFailureMessage together.",
      );
    }
    if (input.report.executionFailures === 0 && hasExecutionFailureStage) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) zero-failure row ` +
          `${identity} carries execution failure metadata.`,
      );
    }
    assertNullableNonEmptyStringField({
      field: `row ${identity} generatedAnswer`,
      path: input.path,
      runId,
      value: question.generatedAnswer,
    });
    assertNoEdgeWhitespaceStringField({
      field: `row ${identity} generatedAnswer`,
      path: input.path,
      runId,
      value: question.generatedAnswer,
    });
    if (
      input.report.mode === "live-answer" &&
      (question.answerCorrect === null) !== (question.generatedAnswer === null)
    ) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) live-answer row ` +
          `${identity} has partial scored answer fields; answerCorrect and ` +
          "generatedAnswer must both be null or both be present.",
      );
    }
    if (
      input.report.mode === "live-answer" &&
      input.report.executionFailures === 0 &&
      (question.answerCorrect === null || question.generatedAnswer === null)
    ) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) zero-failure ` +
          `live-answer row ${identity} is missing scored answer fields.`,
      );
    }
    if (
      input.report.mode === "retrieval-only" &&
      (question.answerCorrect !== null || question.generatedAnswer !== null)
    ) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) retrieval-only row ` +
          `${identity} carries scored answer fields.`,
      );
    }
    if (
      question.answerTokenF1 !== undefined &&
      question.answerTokenF1 !== null &&
      (question.answerCorrect === null || question.generatedAnswer === null)
    ) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) unscored row ` +
          `${identity} carries answerTokenF1; answerTokenF1 must be null or ` +
          "omitted unless answerCorrect and generatedAnswer are present.",
      );
    }
    if (!isLocomoQaCategory(question.category)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `has unknown category ${question.category}.`,
      );
    }
    assertLocomoTurnIdArrayField({
      field: `row ${identity} evidenceTurnIds`,
      path: input.path,
      runId,
      value: question.evidenceTurnIds,
    });
    assertLocomoTurnIdArrayField({
      field: `row ${identity} retrievedTurnIds`,
      path: input.path,
      runId,
      value: question.retrievedTurnIds,
    });
    assertLocomoTurnIdArrayField({
      field: `row ${identity} missingEvidenceTurnIds`,
      path: input.path,
      runId,
      value: question.missingEvidenceTurnIds,
    });
    assertLocomoTurnIdArrayField({
      field: `row ${identity} noiseTurnIds`,
      path: input.path,
      runId,
      value: question.noiseTurnIds,
    });
    const duplicateEvidenceTurnId = firstDuplicate(question.evidenceTurnIds);
    if (duplicateEvidenceTurnId !== null) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `evidenceTurnIds contains duplicate turn id ${duplicateEvidenceTurnId}.`,
      );
    }
    const duplicateRetrievedTurnId = firstDuplicate(question.retrievedTurnIds);
    if (duplicateRetrievedTurnId !== null) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `retrievedTurnIds contains duplicate turn id ${duplicateRetrievedTurnId}.`,
      );
    }
    const duplicateMissingTurnId = firstDuplicate(question.missingEvidenceTurnIds);
    if (duplicateMissingTurnId !== null) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `missingEvidenceTurnIds contains duplicate turn id ${duplicateMissingTurnId}.`,
      );
    }
    const duplicateNoiseTurnId = firstDuplicate(question.noiseTurnIds);
    if (duplicateNoiseTurnId !== null) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `noiseTurnIds contains duplicate turn id ${duplicateNoiseTurnId}.`,
      );
    }
    const expectedMissingIds = expectedMissingEvidenceTurnIds(question);
    const expectedNoiseIds = expectedNoiseTurnIds(question);
    if (question.noiseTurnCount !== question.noiseTurnIds.length) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `noiseTurnCount ${question.noiseTurnCount} does not match ` +
          `noiseTurnIds length ${question.noiseTurnIds.length}.`,
      );
    }
    if (!sameJson(question.noiseTurnIds, expectedNoiseIds)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `noiseTurnIds ${JSON.stringify(question.noiseTurnIds)} do not ` +
          "match retrieved non-evidence turns " +
          `${JSON.stringify(expectedNoiseIds)}.`,
      );
    }
    if (!sameJson(question.missingEvidenceTurnIds, expectedMissingIds)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `missingEvidenceTurnIds ${JSON.stringify(
            question.missingEvidenceTurnIds,
          )} do not match unretrieved evidence turns ` +
          `${JSON.stringify(expectedMissingIds)}.`,
      );
    }
    const expectedRecall = expectedEvidenceRecall(question, expectedMissingIds);
    if (!numberMatches(question.evidenceRecall, expectedRecall)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `evidenceRecall ${question.evidenceRecall} does not match ` +
          `retrieved evidence recall ${expectedRecall}.`,
      );
    }
    const expectedFullyRetrieved = expectedMissingIds.length === 0;
    if (question.goldEvidenceFullyRetrieved !== expectedFullyRetrieved) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) row ${identity} ` +
          `goldEvidenceFullyRetrieved ${question.goldEvidenceFullyRetrieved} ` +
          `does not match unretrieved evidence turns ${JSON.stringify(
            expectedMissingIds,
          )}.`,
      );
    }
  }

  if (input.report.mode === "live-answer") {
    const failedLiveAnswerRows = input.report.cases.filter(
      (question) =>
        question.answerCorrect === null && question.generatedAnswer === null,
    ).length;
    if (input.report.executionFailures !== failedLiveAnswerRows) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) executionFailures ` +
          `${input.report.executionFailures} does not match failed ` +
          `live-answer rows ${failedLiveAnswerRows}.`,
      );
    }
  }

  assertPresentCategorySummariesMatchCases(input);

  const questionIdentities = input.report.cases.map((question) =>
    rowIdentity(question),
  );
  const duplicateIdentity = firstDuplicate(questionIdentities);
  if (duplicateIdentity !== null) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) cases[] contains ` +
        `duplicate question identity ${duplicateIdentity}.`,
    );
  }
  assertReanswerExplicitQuestionIdsMatchCases(input);
  assertReanswerQuestionIdsHaveSelectionLineage(input);
  assertReanswerExplicitOnlyQuestionIdsMatchReport(input);
  assertReanswerQuestionIdFileHasSelectionReason(input);
  assertReanswerJobCategoriesMatchCases(input);
  assertReanswerQuestionIdFileIsNotSelf(input);
  assertReanswerQuestionIdFileIsNotSourceReport(input);
  assertReanswerSourceReportIsNotSelf(input);
  assertReanswerSourceReportTimestampPrecedesReport(input);
  assertReanswerSourceReportAnswerContextIsReplayable(input);
  assertReanswerSourceRetrievalConfigMatchesReport(input);
  assertReanswerSelectedScopeHasQuestionIdsHeader(input);
  assertQuestionSelectionMatchesReport(input);
  assertUpstreamAnswerMetricCategoriesMatchCases(input);

  const actualCaseIds = uniqueStrings(
    input.report.cases.map((question) => question.caseId),
  );
  if (input.report.caseCount !== input.report.caseIds.length) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) caseCount ` +
        `${input.report.caseCount} does not match caseIds length ` +
        `${input.report.caseIds.length}.`,
    );
  }
  if (!sameJson(input.report.caseIds, actualCaseIds)) {
    throw new Error(
      `Report ${input.path} (${input.report.runId}) caseIds ` +
        `${JSON.stringify(input.report.caseIds)} does not match cases[] ` +
        `case ids ${JSON.stringify(actualCaseIds)}.`,
    );
  }

  if (
    input.report.questionIds !== undefined &&
    input.report.questionIds !== null
  ) {
    const duplicateQuestionId = firstDuplicate(input.report.questionIds);
    if (duplicateQuestionId !== null) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) questionIds contains ` +
          `duplicate question id ${duplicateQuestionId}.`,
      );
    }
    const actualQuestionIds = uniqueStrings(
      input.report.cases.map((question) => question.questionId),
    );
    if (actualQuestionIds.length !== input.report.cases.length) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) cases[] contains ` +
          "duplicate question ids while questionIds is set.",
      );
    }
    if (!sameStringSet(input.report.questionIds, actualQuestionIds)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) questionIds ` +
          `${JSON.stringify(input.report.questionIds)} does not match ` +
          `cases[] question ids ${JSON.stringify(actualQuestionIds)}.`,
      );
    }
  }

  if (input.report.questionCategories !== null) {
    const duplicateCategory = firstDuplicate(input.report.questionCategories);
    if (duplicateCategory !== null) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) questionCategories ` +
          `contains duplicate category ${duplicateCategory}.`,
      );
    }
    const unknownSelectedCategory = input.report.questionCategories.find(
      (category) => !isLocomoQaCategory(category),
    );
    if (unknownSelectedCategory !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) questionCategories ` +
          `contains unknown category ${unknownSelectedCategory}.`,
      );
    }
    const selectedCategories = new Set(input.report.questionCategories);
    const unexpectedCategory = input.report.cases.find(
      (question) => !selectedCategories.has(question.category),
    )?.category;
    if (unexpectedCategory !== undefined) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) contains category ` +
          `${unexpectedCategory} outside questionCategories ` +
          `${JSON.stringify(input.report.questionCategories)}.`,
      );
    }
    const actualCategories = uniqueStrings(
      input.report.cases.map((question) => question.category),
    );
    if (!sameStringSet(input.report.questionCategories, actualCategories)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) questionCategories ` +
          `${JSON.stringify(input.report.questionCategories)} does not match ` +
          `cases[] categories ${JSON.stringify(actualCategories)}.`,
      );
    }
  }
}

export function assertLocomoReportCategorySummariesMatchCases(
  input: LocomoReportInput,
): void {
  const summariesByCategory = new Map<
    LocomoQaCategory,
    LocomoCategoryRetrievalSummary
  >();
  for (const [index, summary] of input.report.categories.entries()) {
    assertNonEmptyStringField({
      field: `category summary at index ${index} category`,
      path: input.path,
      runId: input.report.runId,
      value: summary.category,
    });
    assertNoEdgeWhitespaceStringField({
      field: `category summary at index ${index} category`,
      path: input.path,
      runId: input.report.runId,
      value: summary.category,
    });
    if (!LOCOMO_QA_CATEGORIES.includes(summary.category)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) has unknown category ` +
          `${summary.category}.`,
      );
    }
    assertNullableUnitIntervalField({
      field: `category ${summary.category} answerAccuracy`,
      path: input.path,
      runId: input.report.runId,
      value: summary.answerAccuracy,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} answeredCount`,
      path: input.path,
      runId: input.report.runId,
      value: summary.answeredCount,
    });
    assertUnitIntervalField({
      field: `category ${summary.category} averageEvidenceRecall`,
      path: input.path,
      runId: input.report.runId,
      value: summary.averageEvidenceRecall,
    });
    assertNullableBooleanField({
      field: `category ${summary.category} crossSessionChainReady`,
      path: input.path,
      runId: input.report.runId,
      value: summary.crossSessionChainReady,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} fullyRetrievedCount`,
      path: input.path,
      runId: input.report.runId,
      value: summary.fullyRetrievedCount,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} noiseTurnTotal`,
      path: input.path,
      runId: input.report.runId,
      value: summary.noiseTurnTotal,
    });
    assertNonNegativeIntegerField({
      field: `category ${summary.category} questionCount`,
      path: input.path,
      runId: input.report.runId,
      value: summary.questionCount,
    });
    if (summariesByCategory.has(summary.category)) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) has duplicate ` +
          `category summary ${summary.category}.`,
      );
    }
    summariesByCategory.set(summary.category, summary);
  }

  for (const category of LOCOMO_QA_CATEGORIES) {
    const expected = expectedCategorySummary(input.report, category);
    const actual = summariesByCategory.get(category);
    if (actual === undefined) {
      if (expected.questionCount > 0) {
        throw new Error(
          `Report ${input.path} (${input.report.runId}) is missing category ` +
            `summary ${category} for ${expected.questionCount} cases[].`,
        );
      }
      continue;
    }
    assertCategorySummaryNumber({
      actual: actual.answerAccuracy,
      category,
      expected: expected.answerAccuracy,
      field: "answerAccuracy",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: actual.answeredCount,
      category,
      expected: expected.answeredCount,
      field: "answeredCount",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: actual.averageEvidenceRecall,
      category,
      expected: expected.averageEvidenceRecall,
      field: "averageEvidenceRecall",
      report: input,
    });
    if (actual.crossSessionChainReady !== expected.crossSessionChainReady) {
      throw new Error(
        `Report ${input.path} (${input.report.runId}) category ${category} ` +
          `crossSessionChainReady ${JSON.stringify(actual.crossSessionChainReady)} ` +
          `does not match cases[] ${JSON.stringify(expected.crossSessionChainReady)}.`,
      );
    }
    assertCategorySummaryNumber({
      actual: actual.fullyRetrievedCount,
      category,
      expected: expected.fullyRetrievedCount,
      field: "fullyRetrievedCount",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: actual.noiseTurnTotal,
      category,
      expected: expected.noiseTurnTotal,
      field: "noiseTurnTotal",
      report: input,
    });
    assertCategorySummaryNumber({
      actual: actual.questionCount,
      category,
      expected: expected.questionCount,
      field: "questionCount",
      report: input,
    });
  }
}

export function assertLocomoReportHasNoQuestionIdFilter(
  input: LocomoReportInput,
): void {
  if (
    input.report.questionIds !== undefined &&
    input.report.questionIds !== null
  ) {
    throw new Error(
      `Report ${input.path} was filtered by questionIds; category-matrix ` +
        "assembly requires full category shards.",
    );
  }
}

export function locomoQuestionIdentitiesForCategory(
  report: LocomoSmokeReport,
  category: LocomoQaCategory,
): string[] {
  return report.cases
    .filter((result) => result.category === category)
    .map((result) => `${result.caseId}::${result.questionId}`);
}

export function assertLocomoCategoryQuestionIdentities(input: {
  baseline: LocomoReportInput;
  baselineSummary: LocomoCategoryRetrievalSummary;
  candidate: LocomoReportInput;
  candidateSummary: LocomoCategoryRetrievalSummary;
}): void {
  const baselineIdentities = locomoQuestionIdentitiesForCategory(
    input.baseline.report,
    input.baselineSummary.category,
  );
  const candidateIdentities = locomoQuestionIdentitiesForCategory(
    input.candidate.report,
    input.candidateSummary.category,
  );
  if (
    baselineIdentities.length !== input.baselineSummary.questionCount ||
    candidateIdentities.length !== input.candidateSummary.questionCount
  ) {
    throw new Error(
      `Category ${input.baselineSummary.category} question identity cannot be ` +
        "validated because cases[] does not match the category questionCount.",
    );
  }
  if (!sameJson(candidateIdentities, baselineIdentities)) {
    throw new Error(
      `Category ${input.baselineSummary.category} question identity mismatch.`,
    );
  }
}
