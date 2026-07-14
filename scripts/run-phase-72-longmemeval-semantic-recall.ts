import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import type { GoodMemoryConfig } from "../src/api/contracts";
import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import type { EmbeddingAdapter } from "../src/embedding/contracts";
import {
  createLongMemEvalGoodMemoryContextBuilder,
  LONGMEMEVAL_DEFAULT_CONTEXT_MAX_TOKENS,
  runLongMemEvalRecallDiagnostic,
} from "../src/eval/longmemeval";
import type {
  LongMemEvalRecallDiagnosticReport,
  LongMemEvalRecallRunConfiguration,
} from "../src/eval/longmemeval";
import { createProviderEmbeddingAdapter } from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import {
  RECOMMENDED_GENERALIZED_FUSION_MAX_CANDIDATES,
  RECOMMENDED_GENERALIZED_FUSION_MAX_TOTAL_FACTS,
} from "../src/api/retrievalPreset";
import {
  DEFAULT_GENERALIZED_FUSION_MIN_RELATIVE_STRENGTH,
  DEFAULT_GENERALIZED_FUSION_RRF_K,
} from "../src/recall/generalizedFusion";
import {
  assertCliPathSegmentValue,
  hasCliFlagStrict,
  resolveCliFlagValueStrict,
} from "./cli-options";
import {
  createLongMemEvalMemoryFactory,
  resolvePhase62LiveRequestTimeoutMs,
} from "./run-phase-62-eval";
import { resolvePhase62DataFileCandidates } from "./run-phase-62-shared";

export const PHASE72_LONGMEMEVAL_EMBEDDING_GATEWAY =
  "https://openrouter.ai/api/v1";
export const PHASE72_LONGMEMEVAL_EMBEDDING_MODEL =
  "text-embedding-3-small";
export const PHASE72_LONGMEMEVAL_MAX_EMBED_BATCH_CHARS = 32_000;
export const PHASE72_LONGMEMEVAL_MAX_EMBED_BATCH_TEXTS = 8;
export const PHASE72_LONGMEMEVAL_MAX_EMBED_TEXT_CHARS = 16_000;

const GENERATED_BY =
  "scripts/run-phase-72-longmemeval-semantic-recall.ts";

const selectionCohortSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1),
  salt: z.string().min(1),
  selectionMethod: z.string().min(1),
});

const semanticSelectionSchema = z.object({
  benchmark: z.literal("LongMemEval"),
  benchmarkFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  categoryQuotas: z.record(z.string(), z.number().int().positive()),
  datasetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  protection: selectionCohortSchema,
  schemaVersion: z.literal(1),
  sourceRunId: z.string().min(1),
  target: selectionCohortSchema,
});

export type Phase72LongMemEvalSemanticSelection = z.infer<
  typeof semanticSelectionSchema
>;
export type Phase72LongMemEvalEmbeddingMode = "none" | "provider";
export type Phase72LongMemEvalSemanticCohort =
  | "all"
  | "protection"
  | "target";

export interface Phase72LongMemEvalSemanticRecallOptions {
  benchmarkRoot: string;
  cohort: Phase72LongMemEvalSemanticCohort;
  embeddingMode: Phase72LongMemEvalEmbeddingMode;
  maxConcurrency: number;
  outputDir: string;
  resume: boolean;
  retryFailures: boolean;
  runId: string;
  selectionFile: string;
}

export type Phase72LongMemEvalSemanticEmbedding =
  | { mode: "none" }
  | {
      mode: "provider";
      model: AISDKModelConfig;
    };

export interface Phase72LongMemEvalSemanticMetrics {
  executionFailures: number;
  protectionRecall: number;
  targetRecall: number;
}

export type Phase72EmbeddingEvent =
  | {
      callId: number;
      event: "start";
      textChars: number;
      textCount: number;
    }
  | {
      callId: number;
      dimensions: number;
      durationMs: number;
      event: "success";
      vectorCount: number;
    }
  | {
      callId: number;
      durationMs: number;
      error: string;
      event: "failure";
    };

export function createBoundedPhase72EmbeddingAdapter(input: {
  inner: EmbeddingAdapter;
  maxBatchChars: number;
  maxBatchTexts: number;
  maxTextChars: number;
}): EmbeddingAdapter {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      const vectors: number[][] = [];
      let batch: string[] = [];
      let batchChars = 0;
      const flush = async (): Promise<void> => {
        if (batch.length === 0) {
          return;
        }
        const current = batch;
        batch = [];
        batchChars = 0;
        const embedded = await input.inner.embed(current);
        if (embedded.length !== current.length) {
          throw new Error("Embedding provider returned the wrong vector count.");
        }
        vectors.push(...embedded);
      };

      for (const text of texts) {
        const bounded = text.slice(0, input.maxTextChars);
        if (
          batch.length >= input.maxBatchTexts ||
          (batch.length > 0 &&
            batchChars + bounded.length > input.maxBatchChars)
        ) {
          await flush();
        }
        batch.push(bounded);
        batchChars += bounded.length;
      }
      await flush();
      return vectors;
    },
  };
}

export function createObservedPhase72EmbeddingAdapter(input: {
  inner: EmbeddingAdapter;
  now?: () => number;
  writeEvent: (event: Phase72EmbeddingEvent) => Promise<void>;
}): EmbeddingAdapter {
  const now = input.now ?? Date.now;
  let callId = 0;
  return {
    async embed(texts: string[]): Promise<number[][]> {
      callId += 1;
      const currentCallId = callId;
      const startedAt = now();
      await input.writeEvent({
        callId: currentCallId,
        event: "start",
        textChars: texts.reduce((total, text) => total + text.length, 0),
        textCount: texts.length,
      });
      try {
        const vectors = await input.inner.embed(texts);
        await input.writeEvent({
          callId: currentCallId,
          dimensions: vectors[0]?.length ?? 0,
          durationMs: now() - startedAt,
          event: "success",
          vectorCount: vectors.length,
        });
        return vectors;
      } catch (error) {
        await input.writeEvent({
          callId: currentCallId,
          durationMs: now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          event: "failure",
        });
        throw error;
      }
    },
  };
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseEmbeddingMode(value: string): Phase72LongMemEvalEmbeddingMode {
  if (value === "none" || value === "provider") {
    return value;
  }
  throw new Error("--embedding-mode must be none or provider.");
}

function parseCohort(value: string): Phase72LongMemEvalSemanticCohort {
  if (value === "all" || value === "protection" || value === "target") {
    return value;
  }
  throw new Error("--cohort must be all, target, or protection.");
}

export function parsePhase72LongMemEvalSemanticRecallOptions(
  argv: readonly string[],
  root = process.cwd(),
  cacheRoot = join(homedir(), ".cache", "goodmemory-benchmarks"),
): Phase72LongMemEvalSemanticRecallOptions {
  const embeddingMode = parseEmbeddingMode(
    resolveCliFlagValueStrict(argv, "--embedding-mode") ?? "provider",
  );
  const runId = resolveCliFlagValueStrict(argv, "--run-id") ??
    `run-phase72-longmemeval-semantic-recall-${embeddingMode}`;
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });

  return {
    benchmarkRoot: resolveCliFlagValueStrict(argv, "--benchmark-root") ??
      join(cacheRoot, "LongMemEval"),
    cohort: parseCohort(
      resolveCliFlagValueStrict(argv, "--cohort") ?? "all",
    ),
    embeddingMode,
    maxConcurrency: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--max-concurrency") ?? "1",
      "--max-concurrency",
    ),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir") ??
      join(root, "reports", "eval", "research", "phase-72", "longmemeval"),
    resume: hasCliFlagStrict(argv, "--resume"),
    retryFailures: hasCliFlagStrict(argv, "--retry-failures"),
    runId,
    selectionFile: resolveCliFlagValueStrict(argv, "--selection-file") ??
      join(
        root,
        "scripts",
        "eval-profiles",
        "phase-72",
        "longmemeval-semantic-recall-selection.json",
      ),
  };
}

export async function loadPhase72LongMemEvalSemanticSelection(
  path: string,
): Promise<Phase72LongMemEvalSemanticSelection> {
  const selection = semanticSelectionSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  const target = new Set(selection.target.questionIds);
  const protection = new Set(selection.protection.questionIds);
  if (target.size !== selection.target.questionIds.length) {
    throw new Error("LongMemEval semantic target cohort contains duplicate ids.");
  }
  if (protection.size !== selection.protection.questionIds.length) {
    throw new Error("LongMemEval semantic protection cohort contains duplicate ids.");
  }
  if ([...target].some((questionId) => protection.has(questionId))) {
    throw new Error("LongMemEval semantic target and protection cohorts overlap.");
  }
  const expectedCount = Object.values(selection.categoryQuotas)
    .reduce((total, count) => total + count, 0);
  if (
    target.size !== expectedCount ||
    protection.size !== expectedCount
  ) {
    throw new Error(
      "LongMemEval semantic cohort sizes do not match category quotas.",
    );
  }
  return selection;
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required ${name}.`);
  }
  return value;
}

export function resolvePhase72LongMemEvalSemanticEmbedding(
  env: Record<string, string | undefined>,
  mode: Phase72LongMemEvalEmbeddingMode,
): Phase72LongMemEvalSemanticEmbedding {
  if (mode === "none") {
    return { mode };
  }

  const model: AISDKModelConfig = {
    apiKey: requiredEnv(env, "GOODMEMORY_EMBEDDING_API_KEY"),
    baseURL: requiredEnv(env, "GOODMEMORY_EMBEDDING_BASE_URL"),
    model: requiredEnv(env, "GOODMEMORY_EMBEDDING_MODEL"),
    provider: requiredEnv(env, "GOODMEMORY_EMBEDDING_PROVIDER") as
      AISDKModelConfig["provider"],
  };
  if (
    model.provider !== "openai" ||
    model.model !== PHASE72_LONGMEMEVAL_EMBEDDING_MODEL ||
    model.baseURL !== PHASE72_LONGMEMEVAL_EMBEDDING_GATEWAY
  ) {
    throw new Error(
      `Phase 72 LongMemEval semantic recall requires ${PHASE72_LONGMEMEVAL_EMBEDDING_MODEL} through ${PHASE72_LONGMEMEVAL_EMBEDDING_GATEWAY}.`,
    );
  }
  return { mode, model };
}

export function buildPhase72LongMemEvalSemanticRunConfiguration(
  embedding: Phase72LongMemEvalSemanticEmbedding,
): LongMemEvalRecallRunConfiguration {
  return {
    contextMaxTokens: LONGMEMEVAL_DEFAULT_CONTEXT_MAX_TOKENS,
    embedding: embedding.mode === "provider"
      ? {
          gateway: embedding.model.baseURL ?? null,
          maxBatchChars: PHASE72_LONGMEMEVAL_MAX_EMBED_BATCH_CHARS,
          maxBatchTexts: PHASE72_LONGMEMEVAL_MAX_EMBED_BATCH_TEXTS,
          maxTextChars: PHASE72_LONGMEMEVAL_MAX_EMBED_TEXT_CHARS,
          model: embedding.model.model,
          provider: embedding.model.provider,
        }
      : null,
    extractionStrategy: "rules-only",
    generalizedFusion: {
      maxCandidates: RECOMMENDED_GENERALIZED_FUSION_MAX_CANDIDATES,
      maxTotalFacts: RECOMMENDED_GENERALIZED_FUSION_MAX_TOTAL_FACTS,
      minRelativeStrength: DEFAULT_GENERALIZED_FUSION_MIN_RELATIVE_STRENGTH,
      rrfK: DEFAULT_GENERALIZED_FUSION_RRF_K,
    },
    projection: {
      bulkBackfill: true,
      writeThrough: false,
    },
    providerEmbedding: embedding.mode === "provider",
    recallStrategy: "hybrid",
  };
}

function selectedQuestionIds(
  selection: Phase72LongMemEvalSemanticSelection,
  cohort: Phase72LongMemEvalSemanticCohort,
): string[] {
  if (cohort === "target") {
    return selection.target.questionIds;
  }
  if (cohort === "protection") {
    return selection.protection.questionIds;
  }
  return [
    ...selection.target.questionIds,
    ...selection.protection.questionIds,
  ];
}

function averageRecall(
  report: LongMemEvalRecallDiagnosticReport,
  questionIds: readonly string[],
): number {
  const selected = new Set(questionIds);
  const cases = report.cases.filter((testCase) =>
    selected.has(testCase.questionId)
  );
  if (cases.length !== selected.size) {
    throw new Error("LongMemEval semantic report is missing selected cases.");
  }
  return cases.reduce(
    (total, testCase) => total + (testCase.evidenceSessionRecall ?? 0),
    0,
  ) / cases.length;
}

export function summarizePhase72LongMemEvalSemanticReport(
  report: LongMemEvalRecallDiagnosticReport,
  selection: Phase72LongMemEvalSemanticSelection,
): Phase72LongMemEvalSemanticMetrics {
  return {
    executionFailures: report.summary.executionFailures,
    protectionRecall: averageRecall(report, selection.protection.questionIds),
    targetRecall: averageRecall(report, selection.target.questionIds),
  };
}

function roundPoints(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function evaluatePhase72LongMemEvalSemanticAdmission(input: {
  baseline: Phase72LongMemEvalSemanticMetrics;
  candidate: Phase72LongMemEvalSemanticMetrics;
}): {
  admitted: boolean;
  protectionRegressionPoints: number;
  targetGainPoints: number;
} {
  const targetGainPoints = roundPoints(
    (input.candidate.targetRecall - input.baseline.targetRecall) * 100,
  );
  const protectionRegressionPoints = roundPoints(
    Math.max(
      0,
      input.baseline.protectionRecall - input.candidate.protectionRecall,
    ) * 100,
  );
  return {
    admitted:
      input.baseline.executionFailures === 0 &&
      input.candidate.executionFailures === 0 &&
      targetGainPoints >= 3 &&
      protectionRegressionPoints <= 1,
    protectionRegressionPoints,
    targetGainPoints,
  };
}

async function assertFrozenDataset(input: {
  benchmarkRoot: string;
  selection: Phase72LongMemEvalSemanticSelection;
}): Promise<void> {
  const dataFile = resolvePhase62DataFileCandidates({
    benchmarkRoot: input.benchmarkRoot,
    mode: "full",
  }).find(existsSync);
  if (!dataFile) {
    throw new Error(
      `LongMemEval dataset not found under ${input.benchmarkRoot}.`,
    );
  }
  const raw = await readFile(dataFile, "utf8");
  const datasetSha256 = createHash("sha256").update(raw).digest("hex");
  const benchmarkFingerprint = createHash("sha256")
    .update(JSON.stringify(JSON.parse(raw)))
    .digest("hex");
  if (
    datasetSha256 !== input.selection.datasetSha256 ||
    benchmarkFingerprint !== input.selection.benchmarkFingerprint
  ) {
    throw new Error("LongMemEval dataset does not match the frozen selection.");
  }
}

export async function runPhase72LongMemEvalSemanticRecall(
  options: Phase72LongMemEvalSemanticRecallOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<{
  metrics?: Phase72LongMemEvalSemanticMetrics;
  report: LongMemEvalRecallDiagnosticReport;
}> {
  const selection = await loadPhase72LongMemEvalSemanticSelection(
    options.selectionFile,
  );
  await assertFrozenDataset({
    benchmarkRoot: options.benchmarkRoot,
    selection,
  });
  const embedding = resolvePhase72LongMemEvalSemanticEmbedding(
    env,
    options.embeddingMode,
  );
  const runDirectory = join(options.outputDir, options.runId);
  await mkdir(runDirectory, { recursive: true });
  let logWrite = Promise.resolve();
  const embeddingAdapter = embedding.mode === "provider"
    ? createBoundedPhase72EmbeddingAdapter({
        inner: createObservedPhase72EmbeddingAdapter({
          inner: createProviderEmbeddingAdapter({
            model: embedding.model,
            requestTimeoutMs: resolvePhase62LiveRequestTimeoutMs(env),
          }),
          writeEvent: (event) => {
            logWrite = logWrite.then(() =>
              appendFile(
                join(runDirectory, "embedding-events.jsonl"),
                `${JSON.stringify(event)}\n`,
              )
            );
            return logWrite;
          },
        }),
        maxBatchChars: PHASE72_LONGMEMEVAL_MAX_EMBED_BATCH_CHARS,
        maxBatchTexts: PHASE72_LONGMEMEVAL_MAX_EMBED_BATCH_TEXTS,
        maxTextChars: PHASE72_LONGMEMEVAL_MAX_EMBED_TEXT_CHARS,
      })
    : undefined;
  const createMemory = (config: GoodMemoryConfig) =>
    createInternalGoodMemory({
      ...config,
      adapters: {
        ...config.adapters,
        ...(embeddingAdapter ? { embeddingAdapter } : {}),
      },
    }, {
      environment: {},
      projectionBulkBackfill: true,
      projectionWriteThrough: false,
    });
  const createProfileMemory = createLongMemEvalMemoryFactory(createMemory, {
    requestTimeoutMs: resolvePhase62LiveRequestTimeoutMs(env),
    runNamespace: options.runId,
  });
  const report = await runLongMemEvalRecallDiagnostic({
    benchmarkRoot: options.benchmarkRoot,
    caseIds: selectedQuestionIds(selection, options.cohort),
    generatedBy: GENERATED_BY,
    ingestMode: "label-free-raw",
    maxConcurrency: options.maxConcurrency,
    mode: "full",
    outputDir: options.outputDir,
    profile: "goodmemory-recommended",
    resume: options.resume,
    retryFailures: options.retryFailures,
    runConfiguration:
      buildPhase72LongMemEvalSemanticRunConfiguration(embedding),
    runId: options.runId,
  }, {
    memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
      createMemory: createProfileMemory,
      ingestMode: "label-free-raw",
      maxTokens: LONGMEMEVAL_DEFAULT_CONTEXT_MAX_TOKENS,
      runId: options.runId,
    }),
  });
  const metrics = options.cohort === "all"
    ? summarizePhase72LongMemEvalSemanticReport(report, selection)
    : undefined;
  await writeFile(
    join(report.runDirectory, "phase72-semantic-recall-summary.json"),
    `${JSON.stringify({
      cohort: options.cohort,
      embedding: report.runConfiguration?.embedding ?? null,
      metrics: metrics ?? null,
      runId: options.runId,
      selectionFile: options.selectionFile,
    }, null, 2)}\n`,
  );
  return { metrics, report };
}

if (import.meta.main) {
  const options = parsePhase72LongMemEvalSemanticRecallOptions(Bun.argv);
  console.error(
    `[phase72-longmemeval] run=${options.runId} embedding=${options.embeddingMode} cohort=${options.cohort} concurrency=${options.maxConcurrency}`,
  );
  const result = await runPhase72LongMemEvalSemanticRecall(options);
  console.log(JSON.stringify({
    metrics: result.metrics ?? null,
    runDirectory: result.report.runDirectory,
    summary: result.report.summary,
  }, null, 2));
}
