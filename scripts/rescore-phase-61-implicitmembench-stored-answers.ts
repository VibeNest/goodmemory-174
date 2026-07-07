#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  type ImplicitMemBenchCaseResult,
  type ImplicitMemBenchDatasetFamily,
  type ImplicitMemBenchPrimingJudgeResult,
  type ImplicitMemBenchProfileSummary,
  type ImplicitMemBenchResearchCase,
  type ImplicitMemBenchResearchMode,
  type ImplicitMemBenchResearchProfile,
  type ImplicitMemBenchResearchReport,
  type ImplicitMemBenchScorerFamily,
  type ImplicitMemBenchTextJudgeResult,
  type PrimingImplicitMemBenchCase,
  type TextImplicitMemBenchCase,
  listImplicitMemBenchResearchCases,
} from "../src/eval/implicitmembench-research";
import {
  buildPhase60OverallSummary,
  type Phase60OverallSummary,
} from "../src/eval/phase60";
import { requestOpenAICompatibleObject } from "../src/provider/ai-sdk-runtime";
import {
  assertDistinctCliPathValues,
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";

const GENERATED_BY = "scripts/rescore-phase-61-implicitmembench-stored-answers.ts";
const DEFAULT_OUTPUT_DIR = join(
  process.cwd(),
  "reports",
  "eval",
  "research",
  "phase-61",
  "implicitmembench",
);
const BASELINE_PROFILE: ImplicitMemBenchResearchProfile = "baseline-upstream-chat";
const GOODMEMORY_BLOCKING_SOURCE_PROFILE: ImplicitMemBenchResearchProfile =
  "goodmemory-distilled-feedback";
const GOODMEMORY_PRIMING_SOURCE_PROFILE: ImplicitMemBenchResearchProfile =
  "goodmemory-raw-experience";
const GOODMEMORY_COMPOSITE_PROFILE =
  "goodmemory-distilled-feedback+controlled-priming";
const SCORER_FAMILIES = [
  "priming_pair_judge",
  "structured_first_action",
  "text_behavior_judge",
] as const satisfies readonly ImplicitMemBenchScorerFamily[];

const textJudgeSchema = z.object({
  failure_tags: z.array(z.string()).default([]),
  passed: z.boolean(),
  reasoning: z.string(),
});

const primingJudgeSchema = z.object({
  priming_influence_score: z.number().min(0).max(100),
  reasoning: z.string(),
});

export interface Phase61StoredAnswerRescoreCliOptions {
  answerModel?: string;
  maxConcurrency?: number;
  outputDir?: string;
  overallReportPath: string;
  runId?: string;
}

interface JudgeEnvironment {
  answerModel: string;
  apiKey: string;
  baseURL: string;
  judgeModel: string;
}

export interface Phase61StoredAnswerRescoreSummary {
  answerModel: string;
  benchmark: "implicitmembench";
  generatedAt: string;
  generatedBy: string;
  judgeModel: string;
  kind: "phase-61-implicitmembench-stored-answer-rescore";
  outputReports: {
    baselineReportPath: string;
    goodmemoryReportPath: string;
    overallSummaryPath: string;
    progressPath: string;
    runIdentityPath: string;
  };
  phase: "phase-61";
  runDirectory: string;
  runId: string;
  sameModelJudge: false;
  sourceAnswersUnchanged: true;
  sourceReports: {
    baselineReportPath: string;
    goodmemoryReportPath: string;
    overallReportPath: string;
    sourceRunId: string | null;
  };
  overallSummary: Phase60OverallSummary;
}

interface RescoreDependencies {
  judgePrimingPair?: (input: {
    caseDefinition: PrimingImplicitMemBenchCase;
    controlAnswer: string;
    experimentalAnswer: string;
    profile: ImplicitMemBenchResearchProfile;
  }) => Promise<ImplicitMemBenchPrimingJudgeResult>;
  judgeTextBehavior?: (input: {
    answer: string;
    caseDefinition: TextImplicitMemBenchCase;
    profile: ImplicitMemBenchResearchProfile;
  }) => Promise<ImplicitMemBenchTextJudgeResult>;
  appendFile?: (path: string, data: string) => Promise<void>;
  listCases?: typeof listImplicitMemBenchResearchCases;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
  env?: Record<string, string | undefined>;
}

interface LoadedSources {
  baselineReport: ImplicitMemBenchResearchReport;
  baselineReportPath: string;
  cases: readonly ImplicitMemBenchResearchCase[];
  goodmemoryReport: ImplicitMemBenchResearchReport;
  goodmemoryReportPath: string;
  overallReport: Record<string, unknown>;
  sourceArtifacts: {
    baselineReport: SourceArtifact;
    goodmemoryReport: SourceArtifact;
    overallReport: SourceArtifact;
  };
}

interface SourceArtifact {
  bytes: number;
  path: string;
  sha256: string;
}

interface ProgressIdentity {
  answerModel: string;
  generatedBy: typeof GENERATED_BY;
  judgeModel: string;
  kind: "phase-61-implicitmembench-stored-answer-rescore-identity";
  runId: string;
  sourceAnswersUnchanged: true;
  sourceArtifacts: LoadedSources["sourceArtifacts"];
  sourceReports: Phase61StoredAnswerRescoreSummary["sourceReports"];
}

interface ProgressRow {
  caseId: string;
  kind: "phase-61-implicitmembench-stored-answer-rescore-progress";
  profile: ImplicitMemBenchResearchProfile;
  result: ImplicitMemBenchCaseResult;
  scorerFamily: ImplicitMemBenchScorerFamily;
}

type ProgressCache = Map<string, ImplicitMemBenchCaseResult>;

function strictString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  if (value.trim() !== value) {
    throw new Error(`${path} must not be whitespace-padded.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScorerFamily(value: unknown): value is ImplicitMemBenchScorerFamily {
  return typeof value === "string" && SCORER_FAMILIES.includes(value as ImplicitMemBenchScorerFamily);
}

function requireReportPathFromOverall(
  overallReport: Record<string, unknown>,
  key: "baselineReportPath" | "goodmemoryReportPath",
): string {
  const sourceReports = overallReport.sourceReports;
  if (!isRecord(sourceReports)) {
    throw new Error("overall report missing sourceReports object.");
  }
  return strictString(sourceReports[key], `sourceReports.${key}`);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function sourceArtifact(path: string, raw: string): SourceArtifact {
  return {
    bytes: Buffer.byteLength(raw, "utf8"),
    path,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, [...flattenJsonKeys(value)].sort());
}

function flattenJsonKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenJsonKeys(item, keys);
    }
    return keys;
  }
  if (!isRecord(value)) {
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    flattenJsonKeys(child, keys);
  }
  return keys;
}

function assertResearchReport(
  value: Record<string, unknown>,
  label: string,
): ImplicitMemBenchResearchReport {
  if (value.source !== undefined && !isRecord(value.source)) {
    throw new Error(`${label}.source must be an object when present.`);
  }
  if (!isRecord(value.profiles)) {
    throw new Error(`${label}.profiles must be an object.`);
  }
  strictString(value.benchmarkRoot, `${label}.benchmarkRoot`);
  strictString(value.manifestPath, `${label}.manifestPath`);
  strictString(value.outputDir, `${label}.outputDir`);
  strictString(value.runDirectory, `${label}.runDirectory`);
  strictString(value.runId, `${label}.runId`);
  strictString(value.generatedAt, `${label}.generatedAt`);
  strictString(value.generatedBy, `${label}.generatedBy`);
  if (value.mode !== "live" && value.mode !== "smoke") {
    throw new Error(`${label}.mode must be live or smoke.`);
  }
  return value as unknown as ImplicitMemBenchResearchReport;
}

function profileCases(input: {
  report: ImplicitMemBenchResearchReport;
  profile: ImplicitMemBenchResearchProfile;
  label: string;
}): ImplicitMemBenchCaseResult[] {
  const summary = input.report.profiles[input.profile];
  if (!summary) {
    throw new Error(`${input.label} missing profile ${input.profile}.`);
  }
  if (!Array.isArray(summary.cases)) {
    throw new Error(`${input.label} profile ${input.profile} missing cases array.`);
  }
  return summary.cases.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`${input.label} ${input.profile}.cases[${index}] must be an object.`);
    }
    const scorerFamily = row.scorerFamily;
    if (!isScorerFamily(scorerFamily)) {
      throw new Error(
        `${input.label} ${input.profile}.cases[${index}].scorerFamily is invalid.`,
      );
    }
    strictString(row.caseId, `${input.label} ${input.profile}.cases[${index}].caseId`);
    return row as unknown as ImplicitMemBenchCaseResult;
  });
}

function emptyDatasetCounts(): Record<ImplicitMemBenchDatasetFamily, number> {
  return {
    classical_conditioning: 0,
    priming: 0,
    procedural_memory: 0,
  };
}

function emptyScorerCounts(): Record<ImplicitMemBenchScorerFamily, number> {
  return {
    priming_pair_judge: 0,
    structured_first_action: 0,
    text_behavior_judge: 0,
  };
}

function summarizeProfile(
  cases: readonly ImplicitMemBenchCaseResult[],
): ImplicitMemBenchProfileSummary {
  const caseCountsByDataset = emptyDatasetCounts();
  const caseCountsByScorer = emptyScorerCounts();
  let explicitRecallLeakCount = 0;
  let passedBlockingCases = 0;
  let totalBlockingCases = 0;
  let primingScoreTotal = 0;
  let primingScoreCount = 0;
  let distilledCompiledPolicyCount = 0;
  let distilledContextEmptyCount = 0;
  let distilledContextNonEmptyCount = 0;
  let distilledContextNonEmptyPassed = 0;
  let distilledFallbackPolicyCount = 0;
  const distilledContextExamples: NonNullable<
    ImplicitMemBenchProfileSummary["distilledContextExamples"]
  > = [];

  for (const caseResult of cases) {
    caseCountsByDataset[caseResult.datasetFamily] += 1;
    caseCountsByScorer[caseResult.scorerFamily] += 1;
    if (caseResult.explicitRecallLeak) {
      explicitRecallLeakCount += 1;
    }
    if (caseResult.blocking) {
      totalBlockingCases += 1;
      if (caseResult.passed) {
        passedBlockingCases += 1;
      }
    }
    if (typeof caseResult.primingInfluenceScore === "number") {
      primingScoreTotal += caseResult.primingInfluenceScore;
      primingScoreCount += 1;
    }

    if (caseResult.distilledContextDiagnostics) {
      const diagnostics = caseResult.distilledContextDiagnostics;
      if (diagnostics.contextEmpty) {
        distilledContextEmptyCount += 1;
        if (distilledContextExamples.length < 5) {
          distilledContextExamples.push({
            caseId: caseResult.caseId,
            ...(caseResult.judgeReason ? { judgeReason: caseResult.judgeReason } : {}),
            taskFile: caseResult.taskFile,
          });
        }
      } else {
        distilledContextNonEmptyCount += 1;
        if (caseResult.passed) {
          distilledContextNonEmptyPassed += 1;
        }
      }
      if (diagnostics.compiledPolicyCount > 0) {
        distilledCompiledPolicyCount += 1;
      }
      if (diagnostics.fallbackPolicyCount > 0) {
        distilledFallbackPolicyCount += 1;
      }
    }
  }

  const hasDistilledDiagnostics =
    distilledContextEmptyCount > 0 ||
    distilledContextNonEmptyCount > 0 ||
    distilledCompiledPolicyCount > 0 ||
    distilledFallbackPolicyCount > 0;

  return {
    caseCountsByDataset,
    caseCountsByScorer,
    cases: [...cases],
    ...(hasDistilledDiagnostics
      ? {
          distilledCompiledPolicyCount,
          distilledContextEmptyCount,
          distilledContextExamples,
          distilledContextPassRate:
            distilledContextNonEmptyCount === 0
              ? null
              : distilledContextNonEmptyPassed / distilledContextNonEmptyCount,
          distilledFallbackPolicyCount,
        }
      : {}),
    executionFailures: cases.filter((caseResult) => caseResult.executionFailure).length,
    explicitRecallLeakCount,
    passedBlockingCases,
    primingAverageScore:
      primingScoreCount === 0 ? null : primingScoreTotal / primingScoreCount,
    totalBlockingCases,
    totalCases: cases.length,
  };
}

function summarizeReportProfiles(
  profiles: Partial<
    Record<ImplicitMemBenchResearchProfile, ImplicitMemBenchProfileSummary>
  >,
): ImplicitMemBenchResearchReport["summary"] {
  const caseCountsByDataset = emptyDatasetCounts();
  const caseCountsByScorer = emptyScorerCounts();
  let executionFailures = 0;
  let explicitRecallLeakCount = 0;
  let passedBlockingCases = 0;
  let primingScoreTotal = 0;
  let primingScoreCount = 0;
  let totalBlockingCases = 0;
  let totalCases = 0;

  for (const summary of Object.values(profiles)) {
    if (!summary) {
      continue;
    }
    totalCases += summary.totalCases;
    executionFailures += summary.executionFailures;
    explicitRecallLeakCount += summary.explicitRecallLeakCount;
    passedBlockingCases += summary.passedBlockingCases;
    totalBlockingCases += summary.totalBlockingCases;
    for (const datasetFamily of Object.keys(caseCountsByDataset) as ImplicitMemBenchDatasetFamily[]) {
      caseCountsByDataset[datasetFamily] += summary.caseCountsByDataset[datasetFamily];
    }
    for (const scorerFamily of SCORER_FAMILIES) {
      caseCountsByScorer[scorerFamily] += summary.caseCountsByScorer[scorerFamily];
    }
    if (summary.primingAverageScore !== null) {
      primingScoreTotal += summary.primingAverageScore;
      primingScoreCount += 1;
    }
  }

  return {
    caseCountsByDataset,
    caseCountsByScorer,
    executionFailures,
    explicitRecallLeakCount,
    passedBlockingCases,
    primingAverageScore:
      primingScoreCount === 0 ? null : primingScoreTotal / primingScoreCount,
    totalBlockingCases,
    totalCases,
  };
}

function resolveJudgeEnvironment(input: {
  answerModel?: string;
  env: Record<string, string | undefined>;
}): JudgeEnvironment {
  const answerModel =
    input.answerModel ?? strictString(input.env.GOODMEMORY_EVAL_MODEL, "GOODMEMORY_EVAL_MODEL or --answer-model");
  const judgeModel = strictString(input.env.GOODMEMORY_JUDGE_MODEL, "GOODMEMORY_JUDGE_MODEL");
  if (answerModel === judgeModel) {
    throw new Error(
      `ImplicitMemBench stored-answer rescore requires an independent judge; answer model and judge model are both ${answerModel}.`,
    );
  }
  return {
    answerModel,
    apiKey: strictString(input.env.GOODMEMORY_JUDGE_API_KEY, "GOODMEMORY_JUDGE_API_KEY"),
    baseURL: strictString(input.env.GOODMEMORY_JUDGE_BASE_URL, "GOODMEMORY_JUDGE_BASE_URL"),
    judgeModel,
  };
}

function buildTextJudgePrompt(input: {
  answer: string;
  caseDefinition: TextImplicitMemBenchCase;
  profile: ImplicitMemBenchResearchProfile;
}): string {
  const rubric =
    input.caseDefinition.fixture.judgeRubric ??
    input.caseDefinition.expectedPattern ??
    "Apply the learned behavior in the final answer.";
  return [
    "You are judging a single GoodMemory benchmark answer.",
    "Return strict JSON with keys: passed (boolean), reasoning (string), failure_tags (string[]).",
    "passed should be true only if the answer follows the learned rule/behavior on the final probe.",
    "Do not require the answer to mention memory or prior turns.",
    `Task: ${input.caseDefinition.taskName}`,
    `Dataset family: ${input.caseDefinition.datasetFamily}`,
    `Profile: ${input.profile}`,
    `Probe: ${input.caseDefinition.instance.test_probe.content}`,
    `Expected behavior: ${rubric}`,
    `Answer to judge: ${input.answer}`,
  ].join("\n");
}

function buildPrimingJudgePrompt(input: {
  caseDefinition: PrimingImplicitMemBenchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): string {
  return [
    "You are judging priming influence between an experimental and control answer.",
    "Return strict JSON with keys: priming_influence_score (0-100 number), reasoning (string).",
    "Score only attributable thematic influence from the experimental priming context over the control answer.",
    "Use 0 unless the experimental answer shows stronger and attributable thematic influence than the control answer.",
    `Theme name: ${input.caseDefinition.instance.selected_source_theme}`,
    `Theme keywords: ${input.caseDefinition.fixture.themeKeywords.join(", ")}`,
    `Probe: ${input.caseDefinition.instance.experimental_instance.test_probe.prompt}`,
    `[EXPERIMENTAL ANSWER]\n${input.experimentalAnswer}`,
    `[CONTROL ANSWER]\n${input.controlAnswer}`,
  ].join("\n\n");
}

function createLiveJudgeDependencies(
  environment: JudgeEnvironment,
): Required<Pick<RescoreDependencies, "judgePrimingPair" | "judgeTextBehavior">> {
  const model = {
    apiKey: environment.apiKey,
    baseURL: environment.baseURL,
    model: environment.judgeModel,
    provider: "openai" as const,
  };

  return {
    judgePrimingPair: (input) =>
      requestOpenAICompatibleObject({
        model,
        prompt: buildPrimingJudgePrompt(input),
        schema: primingJudgeSchema,
        system:
          "You are a strict benchmark judge. Return only valid JSON matching the requested shape.",
      }),
    judgeTextBehavior: (input) =>
      requestOpenAICompatibleObject({
        model,
        prompt: buildTextJudgePrompt(input),
        schema: textJudgeSchema,
        system:
          "You are a strict benchmark judge. Return only valid JSON matching the requested shape.",
      }),
  };
}

async function runWithConcurrency<T, TResult>(input: {
  items: readonly T[];
  limit: number;
  worker: (item: T) => Promise<TResult>;
}): Promise<TResult[]> {
  const results = new Array<TResult>(input.items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(input.limit, input.items.length) },
    async () => {
      while (cursor < input.items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await input.worker(input.items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function caseMap(cases: readonly ImplicitMemBenchResearchCase[]): Map<string, ImplicitMemBenchResearchCase> {
  return new Map(cases.map((caseDefinition) => [caseDefinition.caseId, caseDefinition]));
}

function assertExactCaseScope(input: {
  expectedCaseIds: readonly string[];
  label: string;
  rows: readonly ImplicitMemBenchCaseResult[];
}): void {
  const expected = new Set(input.expectedCaseIds);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const unexpected: string[] = [];

  for (const row of input.rows) {
    if (!expected.has(row.caseId)) {
      unexpected.push(row.caseId);
      continue;
    }
    if (seen.has(row.caseId)) {
      duplicates.push(row.caseId);
    }
    seen.add(row.caseId);
  }

  const missing = [...expected].filter((caseId) => !seen.has(caseId));
  if (duplicates.length === 0 && unexpected.length === 0 && missing.length === 0) {
    return;
  }

  const details = [
    `${input.label} must exactly match stored-answer rescore scope`,
    `expected ${expected.size} rows, found ${input.rows.length}`,
    ...(missing.length > 0 ? [`missing: ${missing.join(", ")}`] : []),
    ...(unexpected.length > 0 ? [`unexpected: ${unexpected.join(", ")}`] : []),
    ...(duplicates.length > 0 ? [`duplicates: ${duplicates.join(", ")}`] : []),
  ];
  throw new Error(details.join("; "));
}

function assertNoStoredExecutionFailures(input: {
  label: string;
  rows: readonly ImplicitMemBenchCaseResult[];
}): void {
  const failed = input.rows
    .filter((row) => typeof row.executionFailure === "string")
    .map((row) => row.caseId);
  if (failed.length === 0) {
    return;
  }

  throw new Error(
    `${input.label} contains stored execution failures and cannot be rescored cleanly: ${failed.join(", ")}`,
  );
}

function progressKey(input: {
  caseId: string;
  profile: ImplicitMemBenchResearchProfile;
}): string {
  return `${input.profile}\0${input.caseId}`;
}

function requiresJudge(row: ImplicitMemBenchCaseResult): boolean {
  return row.scorerFamily !== "structured_first_action";
}

function buildProgressIdentity(input: {
  answerModel: string;
  judgeModel: string;
  runId: string;
  sourceArtifacts: LoadedSources["sourceArtifacts"];
  sourceReports: Phase61StoredAnswerRescoreSummary["sourceReports"];
}): ProgressIdentity {
  return {
    answerModel: input.answerModel,
    generatedBy: GENERATED_BY,
    judgeModel: input.judgeModel,
    kind: "phase-61-implicitmembench-stored-answer-rescore-identity",
    runId: input.runId,
    sourceAnswersUnchanged: true,
    sourceArtifacts: input.sourceArtifacts,
    sourceReports: input.sourceReports,
  };
}

async function readOptional(
  path: string,
  read: (path: string) => Promise<string>,
): Promise<string | null> {
  try {
    return await read(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("no such file")) {
      return null;
    }
    throw error;
  }
}

async function ensureProgressIdentity(input: {
  expected: ProgressIdentity;
  identityPath: string;
  progressPath: string;
  read: (path: string) => Promise<string>;
  write: (path: string, data: string) => Promise<void>;
}): Promise<void> {
  const existingIdentityRaw = await readOptional(input.identityPath, input.read);
  if (existingIdentityRaw === null) {
    const existingProgressRaw = await readOptional(input.progressPath, input.read);
    if (existingProgressRaw !== null && existingProgressRaw.trim().length > 0) {
      throw new Error(
        "progress cache exists without run-identity.json; use a fresh --run-id or restore the matching identity file.",
      );
    }
    await input.write(input.identityPath, `${JSON.stringify(input.expected, null, 2)}\n`);
    return;
  }

  const existingIdentity = parseJsonObject(
    existingIdentityRaw,
    "run-identity.json",
  );
  if (stableJson(existingIdentity) !== stableJson(input.expected)) {
    throw new Error(
      "ImplicitMemBench stored-answer rescore run identity changed; use a fresh --run-id before reusing progress.jsonl.",
    );
  }
}

function buildExpectedProgressRows(input: {
  baselineRows: readonly ImplicitMemBenchCaseResult[];
  distilledRows: readonly ImplicitMemBenchCaseResult[];
  rawPrimingRows: readonly ImplicitMemBenchCaseResult[];
}): Map<string, { profile: ImplicitMemBenchResearchProfile; row: ImplicitMemBenchCaseResult }> {
  const rows: Array<{
    profile: ImplicitMemBenchResearchProfile;
    row: ImplicitMemBenchCaseResult;
  }> = [
    ...input.baselineRows.map((row) => ({ profile: BASELINE_PROFILE, row })),
    ...input.distilledRows.map((row) => ({
      profile: GOODMEMORY_BLOCKING_SOURCE_PROFILE,
      row,
    })),
    ...input.rawPrimingRows.map((row) => ({
      profile: GOODMEMORY_PRIMING_SOURCE_PROFILE,
      row,
    })),
  ].filter((entry) => requiresJudge(entry.row));
  return new Map(
    rows.map((entry) => [
      progressKey({ caseId: entry.row.caseId, profile: entry.profile }),
      entry,
    ]),
  );
}

function assertProgressResult(input: {
  expected: { profile: ImplicitMemBenchResearchProfile; row: ImplicitMemBenchCaseResult };
  key: string;
  result: Record<string, unknown>;
}): ImplicitMemBenchCaseResult {
  if (input.result.caseId !== input.expected.row.caseId) {
    throw new Error(`progress row ${input.key} result.caseId does not match.`);
  }
  if (input.result.profile !== input.expected.profile) {
    throw new Error(`progress row ${input.key} result.profile does not match.`);
  }
  if (input.result.scorerFamily !== input.expected.row.scorerFamily) {
    throw new Error(`progress row ${input.key} result.scorerFamily does not match.`);
  }
  return input.result as unknown as ImplicitMemBenchCaseResult;
}

async function readProgressCache(input: {
  expectedRows: Map<
    string,
    { profile: ImplicitMemBenchResearchProfile; row: ImplicitMemBenchCaseResult }
  >;
  progressPath: string;
  read: (path: string) => Promise<string>;
}): Promise<ProgressCache> {
  const raw = await readOptional(input.progressPath, input.read);
  const cache: ProgressCache = new Map();
  if (raw === null || raw.trim().length === 0) {
    return cache;
  }

  raw.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    const parsed = parseJsonObject(
      line,
      `progress.jsonl line ${index + 1}`,
    );
    if (parsed.kind !== "phase-61-implicitmembench-stored-answer-rescore-progress") {
      throw new Error(`progress.jsonl line ${index + 1} has invalid kind.`);
    }
    const caseId = strictString(
      parsed.caseId,
      `progress.jsonl line ${index + 1}.caseId`,
    );
    const profile = strictString(
      parsed.profile,
      `progress.jsonl line ${index + 1}.profile`,
    ) as ImplicitMemBenchResearchProfile;
    const key = progressKey({ caseId, profile });
    const expected = input.expectedRows.get(key);
    if (!expected) {
      throw new Error(`progress.jsonl line ${index + 1} is outside the selected rescore scope.`);
    }
    if (parsed.scorerFamily !== expected.row.scorerFamily) {
      throw new Error(`progress.jsonl line ${index + 1}.scorerFamily does not match source row.`);
    }
    if (!isRecord(parsed.result)) {
      throw new Error(`progress.jsonl line ${index + 1}.result must be an object.`);
    }
    if (cache.has(key)) {
      throw new Error(`progress.jsonl contains duplicate progress for ${profile}/${caseId}.`);
    }
    cache.set(
      key,
      assertProgressResult({
        expected,
        key,
        result: parsed.result,
      }),
    );
  });
  return cache;
}

async function rescoreRowsWithProgress(input: {
  append: (path: string, data: string) => Promise<void>;
  caseDefinitionById: Map<string, ImplicitMemBenchResearchCase>;
  dependencies: Required<Pick<RescoreDependencies, "judgePrimingPair" | "judgeTextBehavior">>;
  limit: number;
  progressCache: ProgressCache;
  progressPath: string;
  profile: ImplicitMemBenchResearchProfile;
  rows: readonly ImplicitMemBenchCaseResult[];
}): Promise<ImplicitMemBenchCaseResult[]> {
  let appendChain = Promise.resolve();
  const appendProgress = (progress: ProgressRow): Promise<void> => {
    appendChain = appendChain.then(() =>
      input.append(input.progressPath, `${JSON.stringify(progress)}\n`),
    );
    return appendChain;
  };

  const results = await runWithConcurrency({
    items: input.rows,
    limit: input.limit,
    worker: async (row) => {
      if (requiresJudge(row)) {
        const key = progressKey({ caseId: row.caseId, profile: input.profile });
        const cached = input.progressCache.get(key);
        if (cached) {
          return { ...cached };
        }
        const result = await rescoreRow({
          caseDefinitionById: input.caseDefinitionById,
          dependencies: input.dependencies,
          profile: input.profile,
          row,
        });
        input.progressCache.set(key, result);
        await appendProgress({
          caseId: result.caseId,
          kind: "phase-61-implicitmembench-stored-answer-rescore-progress",
          profile: input.profile,
          result,
          scorerFamily: result.scorerFamily,
        });
        return result;
      }

      return rescoreRow({
        caseDefinitionById: input.caseDefinitionById,
        dependencies: input.dependencies,
        profile: input.profile,
        row,
      });
    },
  });
  await appendChain;
  return results;
}

async function rescoreRow(input: {
  caseDefinitionById: Map<string, ImplicitMemBenchResearchCase>;
  dependencies: Required<Pick<RescoreDependencies, "judgePrimingPair" | "judgeTextBehavior">>;
  profile: ImplicitMemBenchResearchProfile;
  row: ImplicitMemBenchCaseResult;
}): Promise<ImplicitMemBenchCaseResult> {
  const caseDefinition = input.caseDefinitionById.get(input.row.caseId);
  if (!caseDefinition) {
    throw new Error(`No benchmark case definition found for ${input.row.caseId}.`);
  }
  if (caseDefinition.scorerFamily !== input.row.scorerFamily) {
    throw new Error(
      `Stored row ${input.row.caseId} scorer ${input.row.scorerFamily} does not match benchmark scorer ${caseDefinition.scorerFamily}.`,
    );
  }
  if (input.row.scorerFamily === "structured_first_action") {
    return { ...input.row };
  }
  if (input.row.scorerFamily === "text_behavior_judge") {
    if (caseDefinition.scorerFamily !== "text_behavior_judge") {
      throw new Error(`Case ${input.row.caseId} is not text_behavior_judge.`);
    }
    const answer = strictString(input.row.answer, `${input.row.caseId}.answer`);
    const judged = await input.dependencies.judgeTextBehavior({
      answer,
      caseDefinition,
      profile: input.profile,
    });
    return {
      ...input.row,
      judgeReason: judged.reasoning,
      passed: judged.passed,
    };
  }

  if (caseDefinition.scorerFamily !== "priming_pair_judge") {
    throw new Error(`Case ${input.row.caseId} is not priming_pair_judge.`);
  }
  const controlAnswer = strictString(
    input.row.primingControlAnswer,
    `${input.row.caseId}.primingControlAnswer`,
  );
  const experimentalAnswer = strictString(
    input.row.primingExperimentalAnswer,
    `${input.row.caseId}.primingExperimentalAnswer`,
  );
  const judged = await input.dependencies.judgePrimingPair({
    caseDefinition,
    controlAnswer,
    experimentalAnswer,
    profile: input.profile,
  });
  return {
    ...input.row,
    judgeReason: judged.reasoning,
    primingInfluenceScore: judged.priming_influence_score,
  };
}

function buildReport(input: {
  benchmarkRoot: string;
  generatedAt: string;
  kind: "baseline" | "goodmemory";
  manifestPath: string;
  mode: ImplicitMemBenchResearchMode;
  outputDir: string;
  profiles: Partial<Record<ImplicitMemBenchResearchProfile, ImplicitMemBenchProfileSummary>>;
  runDirectory: string;
  runId: string;
}): ImplicitMemBenchResearchReport {
  return {
    benchmarkRoot: input.benchmarkRoot,
    generatedAt: input.generatedAt,
    generatedBy: GENERATED_BY,
    kind: input.kind,
    manifestPath: input.manifestPath,
    mode: input.mode,
    outputDir: input.outputDir,
    profiles: input.profiles,
    runDirectory: input.runDirectory,
    runId: input.runId,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: summarizeReportProfiles(input.profiles),
  };
}

async function loadSources(
  options: Phase61StoredAnswerRescoreCliOptions,
  dependencies: RescoreDependencies,
): Promise<LoadedSources> {
  const read = dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const overallReportPath = resolve(options.overallReportPath);
  const overallRaw = await read(overallReportPath);
  const overallReport = parseJsonObject(overallRaw, "overall report");
  const baselineReportPath = resolve(
    requireReportPathFromOverall(overallReport, "baselineReportPath"),
  );
  const goodmemoryReportPath = resolve(
    requireReportPathFromOverall(overallReport, "goodmemoryReportPath"),
  );
  assertDistinctCliPathValues({
    firstFlag: "--overall-report",
    firstValue: overallReportPath,
    secondFlag: "sourceReports.baselineReportPath",
    secondValue: baselineReportPath,
  });
  assertDistinctCliPathValues({
    firstFlag: "--overall-report",
    firstValue: overallReportPath,
    secondFlag: "sourceReports.goodmemoryReportPath",
    secondValue: goodmemoryReportPath,
  });
  const baselineRaw = await read(baselineReportPath);
  const goodmemoryRaw = await read(goodmemoryReportPath);
  const baselineReport = assertResearchReport(
    parseJsonObject(baselineRaw, "baseline report"),
    "baseline report",
  );
  const goodmemoryReport = assertResearchReport(
    parseJsonObject(goodmemoryRaw, "goodmemory report"),
    "goodmemory report",
  );
  if (baselineReport.runId !== goodmemoryReport.runId) {
    throw new Error("baseline and goodmemory source reports must have the same runId.");
  }
  if (baselineReport.benchmarkRoot !== goodmemoryReport.benchmarkRoot) {
    throw new Error("baseline and goodmemory source reports must have the same benchmarkRoot.");
  }
  if (baselineReport.manifestPath !== goodmemoryReport.manifestPath) {
    throw new Error("baseline and goodmemory source reports must have the same manifestPath.");
  }

  const listCases = dependencies.listCases ?? listImplicitMemBenchResearchCases;
  const cases = await listCases({
    benchmarkRoot: baselineReport.benchmarkRoot,
    manifestPath: baselineReport.manifestPath,
  });
  return {
    baselineReport,
    baselineReportPath,
    cases,
    goodmemoryReport,
    goodmemoryReportPath,
    overallReport,
    sourceArtifacts: {
      baselineReport: sourceArtifact(baselineReportPath, baselineRaw),
      goodmemoryReport: sourceArtifact(goodmemoryReportPath, goodmemoryRaw),
      overallReport: sourceArtifact(overallReportPath, overallRaw),
    },
  };
}

export function parsePhase61StoredAnswerRescoreCliOptions(
  argv: readonly string[],
): Phase61StoredAnswerRescoreCliOptions {
  const overallReportPath = resolveCliFlagValueStrict(argv, "--overall-report");
  if (!overallReportPath) {
    throw new Error("--overall-report is required.");
  }
  return {
    answerModel: resolveCliFlagValueStrict(argv, "--answer-model"),
    maxConcurrency: parseCliPositiveIntegerFlagStrict(argv, "--max-concurrency"),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    overallReportPath,
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

export async function rescorePhase61ImplicitMemBenchStoredAnswers(
  options: Phase61StoredAnswerRescoreCliOptions,
  dependencies: RescoreDependencies = {},
): Promise<Phase61StoredAnswerRescoreSummary> {
  const env = dependencies.env ?? process.env;
  const judgeEnvironment = resolveJudgeEnvironment({
    answerModel: options.answerModel,
    env,
  });
  const judgeDependencies =
    dependencies.judgePrimingPair && dependencies.judgeTextBehavior
      ? {
          judgePrimingPair: dependencies.judgePrimingPair,
          judgeTextBehavior: dependencies.judgeTextBehavior,
        }
      : createLiveJudgeDependencies(judgeEnvironment);
  const sources = await loadSources(options, dependencies);
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const runId = options.runId ?? "implicitmembench-stored-answer-rescore-current";
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const runDirectory = join(outputDir, runId);
  const baselineReportPath = join(runDirectory, "baseline-report.json");
  const goodmemoryReportPath = join(runDirectory, "goodmemory-report.json");
  const overallSummaryPath = join(runDirectory, "overall-summary.json");
  const progressPath = join(runDirectory, "progress.jsonl");
  const runIdentityPath = join(runDirectory, "run-identity.json");
  const summaryPath = join(runDirectory, "rescore-summary.json");
  const overallReportPath = resolve(options.overallReportPath);
  const read = dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const write = dependencies.writeFile ?? ((path, data) => writeFile(path, data, "utf8"));
  const append = dependencies.appendFile ?? ((path, data) => appendFile(path, data, "utf8"));

  for (const [pathLabel, outputPath] of [
    ["baseline-report.json", baselineReportPath],
    ["goodmemory-report.json", goodmemoryReportPath],
    ["overall-summary.json", overallSummaryPath],
    ["progress.jsonl", progressPath],
    ["run-identity.json", runIdentityPath],
    ["rescore-summary.json", summaryPath],
  ] as const) {
    for (const [sourceLabel, sourcePath] of [
      ["--overall-report", overallReportPath],
      ["source baseline report", sources.baselineReportPath],
      ["source goodmemory report", sources.goodmemoryReportPath],
    ] as const) {
      assertDistinctCliPathValues({
        firstFlag: sourceLabel,
        firstValue: sourcePath,
        secondFlag: pathLabel,
        secondValue: outputPath,
      });
    }
  }

  const caseDefinitionById = caseMap(sources.cases);
  const maxConcurrency = options.maxConcurrency ?? 1;
  const baselineRows = profileCases({
    label: "baseline report",
    profile: BASELINE_PROFILE,
    report: sources.baselineReport,
  });
  const distilledRows = profileCases({
    label: "goodmemory report",
    profile: GOODMEMORY_BLOCKING_SOURCE_PROFILE,
    report: sources.goodmemoryReport,
  }).filter((row) => row.scorerFamily !== "priming_pair_judge");
  const rawPrimingRows = profileCases({
    label: "goodmemory report",
    profile: GOODMEMORY_PRIMING_SOURCE_PROFILE,
    report: sources.goodmemoryReport,
  }).filter((row) => row.scorerFamily === "priming_pair_judge");
  const allCaseIds = sources.cases.map((caseDefinition) => caseDefinition.caseId);
  const blockingCaseIds = sources.cases
    .filter((caseDefinition) => caseDefinition.scorerFamily !== "priming_pair_judge")
    .map((caseDefinition) => caseDefinition.caseId);
  const primingCaseIds = sources.cases
    .filter((caseDefinition) => caseDefinition.scorerFamily === "priming_pair_judge")
    .map((caseDefinition) => caseDefinition.caseId);

  assertExactCaseScope({
    expectedCaseIds: allCaseIds,
    label: "baseline source rows",
    rows: baselineRows,
  });
  assertExactCaseScope({
    expectedCaseIds: blockingCaseIds,
    label: "goodmemory distilled blocking source rows",
    rows: distilledRows,
  });
  assertExactCaseScope({
    expectedCaseIds: primingCaseIds,
    label: "goodmemory raw priming source rows",
    rows: rawPrimingRows,
  });
  assertNoStoredExecutionFailures({
    label: "baseline source rows",
    rows: baselineRows,
  });
  assertNoStoredExecutionFailures({
    label: "goodmemory distilled blocking source rows",
    rows: distilledRows,
  });
  assertNoStoredExecutionFailures({
    label: "goodmemory raw priming source rows",
    rows: rawPrimingRows,
  });

  const sourceReports = {
    baselineReportPath: sources.baselineReportPath,
    goodmemoryReportPath: sources.goodmemoryReportPath,
    overallReportPath,
    sourceRunId:
      typeof sources.overallReport.runId === "string" ? sources.overallReport.runId : null,
  } satisfies Phase61StoredAnswerRescoreSummary["sourceReports"];
  const progressIdentity = buildProgressIdentity({
    answerModel: judgeEnvironment.answerModel,
    judgeModel: judgeEnvironment.judgeModel,
    runId,
    sourceArtifacts: sources.sourceArtifacts,
    sourceReports,
  });
  await (dependencies.mkdir ?? mkdir)(runDirectory, { recursive: true });
  await ensureProgressIdentity({
    expected: progressIdentity,
    identityPath: runIdentityPath,
    progressPath,
    read,
    write,
  });
  const progressCache = await readProgressCache({
    expectedRows: buildExpectedProgressRows({
      baselineRows,
      distilledRows,
      rawPrimingRows,
    }),
    progressPath,
    read,
  });

  const rescoredBaselineRows = await rescoreRowsWithProgress({
    append,
    caseDefinitionById,
    dependencies: judgeDependencies,
    limit: maxConcurrency,
    profile: BASELINE_PROFILE,
    progressCache,
    progressPath,
    rows: baselineRows,
  });
  const rescoredDistilledRows = await rescoreRowsWithProgress({
    append,
    caseDefinitionById,
    dependencies: judgeDependencies,
    limit: maxConcurrency,
    profile: GOODMEMORY_BLOCKING_SOURCE_PROFILE,
    progressCache,
    progressPath,
    rows: distilledRows,
  });
  const rescoredRawPrimingRows = await rescoreRowsWithProgress({
    append,
    caseDefinitionById,
    dependencies: judgeDependencies,
    limit: maxConcurrency,
    profile: GOODMEMORY_PRIMING_SOURCE_PROFILE,
    progressCache,
    progressPath,
    rows: rawPrimingRows,
  });

  const baselineProfiles = {
    [BASELINE_PROFILE]: summarizeProfile(rescoredBaselineRows),
  } satisfies Partial<Record<ImplicitMemBenchResearchProfile, ImplicitMemBenchProfileSummary>>;
  const goodmemoryProfiles = {
    [GOODMEMORY_BLOCKING_SOURCE_PROFILE]: summarizeProfile(rescoredDistilledRows),
    [GOODMEMORY_PRIMING_SOURCE_PROFILE]: summarizeProfile(rescoredRawPrimingRows),
  } satisfies Partial<Record<ImplicitMemBenchResearchProfile, ImplicitMemBenchProfileSummary>>;

  const baselineReport = buildReport({
    benchmarkRoot: sources.baselineReport.benchmarkRoot,
    generatedAt,
    kind: "baseline",
    manifestPath: sources.baselineReport.manifestPath,
    mode: sources.baselineReport.mode,
    outputDir,
    profiles: baselineProfiles,
    runDirectory,
    runId,
  });
  const goodmemoryReport = buildReport({
    benchmarkRoot: sources.goodmemoryReport.benchmarkRoot,
    generatedAt,
    kind: "goodmemory",
    manifestPath: sources.goodmemoryReport.manifestPath,
    mode: sources.goodmemoryReport.mode,
    outputDir,
    profiles: goodmemoryProfiles,
    runDirectory,
    runId,
  });
  const overallSummary = buildPhase60OverallSummary({
    baselineReport,
    cases: sources.cases,
    generatedAt,
    generatedBy: GENERATED_BY,
    goodmemoryReport,
    outputDir,
    runDirectory,
    runId,
  });
  const summary: Phase61StoredAnswerRescoreSummary = {
    answerModel: judgeEnvironment.answerModel,
    benchmark: "implicitmembench",
    generatedAt,
    generatedBy: GENERATED_BY,
    judgeModel: judgeEnvironment.judgeModel,
    kind: "phase-61-implicitmembench-stored-answer-rescore",
    outputReports: {
      baselineReportPath,
      goodmemoryReportPath,
      overallSummaryPath,
      progressPath,
      runIdentityPath,
    },
    phase: "phase-61",
    runDirectory,
    runId,
    sameModelJudge: false,
    sourceAnswersUnchanged: true,
    sourceReports,
    overallSummary,
  };

  await write(baselineReportPath, `${JSON.stringify(baselineReport, null, 2)}\n`);
  await write(goodmemoryReportPath, `${JSON.stringify(goodmemoryReport, null, 2)}\n`);
  await write(overallSummaryPath, `${JSON.stringify(overallSummary, null, 2)}\n`);
  await write(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function main(): Promise<void> {
  const summary = await rescorePhase61ImplicitMemBenchStoredAnswers(
    parsePhase61StoredAnswerRescoreCliOptions(process.argv),
  );
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
