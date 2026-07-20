import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  assertCliPathSegmentValue,
  resolveCliFlagValueStrict,
} from "./cli-options";

import {
  createInternalGoodMemory,
} from "../src/api/createGoodMemory";
import type {
  GoodMemory,
  RecallResult,
} from "../src/api/contracts";
import type { MemoryScope } from "../src/domain/scope";
import type {
  MemoryCandidate,
  MemoryExtractor,
} from "../src/remember/candidates";
import {
  type Phase74GeneralizationCase,
  type Phase74GeneralizationReport,
  type Phase74RetrievalSnapshot,
  runPhase74Generalization,
} from "../src/eval/phase74Generalization";
import { createPhase74FileCheckpoint } from "../src/eval/phase74Checkpoint";
import {
  assertPhase74FrozenDataset,
  createPhase74LocomoDataset,
  createPhase74LongMemEvalDataset,
  type Phase74BenchmarkFamily,
  type Phase74DatasetCase,
  type Phase74DatasetBundle,
} from "../src/eval/phase74Datasets";
import {
  createPhase74FullRetrievalRuntime,
  PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION,
} from "../src/eval/phase74FullRuntime";
import { buildPhase74ReplicateComparison } from "../src/eval/phase74Replicates";
import { createPhase74ProtocolReader } from "../src/eval/phase74ProtocolReader";
import {
  buildPhase74OfficialScoringIdentity,
  createPhase74OfficialAnswerAssessor,
} from "../src/eval/phase74OfficialScoring";
import type {
  Phase74EmbeddingIdentity,
  Phase74LiveModels,
} from "../src/eval/phase74Live";
import {
  buildPhase74EmbeddingIdentity,
  createPhase74LiveJudge,
  createPhase74LiveReader,
  phase74LivePromptSha256s,
  resolvePhase74EvaluatorSource,
  resolvePhase74LiveModels,
  verifyPhase74EvaluatorSource,
} from "../src/eval/phase74Live";
import {
  appendPhase74ModelUsageEventSync,
  buildPhase74ModelUsageEvidence,
  type AttributedModelUsageAttempt,
} from "../src/eval/modelUsage";
import type { EvidenceLedgerFormat } from "../src/eval/evidenceLedgerFormats";
import type { GeneralizedFusionChannel } from "../src/recall/generalizedFusion";
import {
  type LongMemEvalCase,
  validateLongMemEvalCases,
} from "../src/eval/longmemeval";
import {
  LOCOMO_MATCH_MODES,
  locomoTokenF1,
  scoreLocomoAnswer,
  type LocomoMatchMode,
} from "../src/eval/locomo";
import {
  buildEvalRunIdentity,
  createOrMatchEvalRunIdentity,
  hashEvalExperimentIdentity,
  type EvalRunJsonObject,
} from "../src/eval/runIdentity";

const DEFAULT_DATASET_PATH =
  "fixtures/external-benchmarks/longmemeval/longmemeval_s_smoke.json";
const DEFAULT_OUTPUT_DIR =
  "reports/eval/research/phase-74/generalization";
const CONTEXT_TOKEN_BUDGET = 6_000;
const PRE_RANK_LIMIT = 32;
const SELECTED_LIMIT = 12;

interface RuntimeSnapshot extends Phase74RetrievalSnapshot {
}

export interface Phase74GeneralizationSmokeOptions {
  datasetPath?: string;
  generatedAt?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase74GeneralizationSmokeResult {
  report: Phase74GeneralizationReport;
  runDirectory: string;
}

export interface Phase74GeneralizationFullOptions {
  benchmark: Phase74BenchmarkFamily;
  benchmarkRoot: string;
  caseSelectionSeed?: number;
  caseSelectionSize?: number;
  generatedAt?: string;
  outputDir: string;
  replicate: 1 | 2 | 3;
  rerankerMode?: "deterministic" | "provider";
  runId: string;
  stage: "E1" | "E2" | "E3" | "E4";
}

export interface Phase74GeneralizationFullResult {
  dataset: Phase74DatasetBundle;
  report: Phase74GeneralizationReport;
  runDirectory: string;
}

export function buildPhase74FullRunIdentityConfiguration(input: {
  dataset: EvalRunJsonObject;
  embedding: Phase74EmbeddingIdentity;
  evaluatorSource: EvalRunJsonObject;
  replicate: 1 | 2 | 3;
  reranker: EvalRunJsonObject;
  scoring: EvalRunJsonObject;
  selection: EvalRunJsonObject;
  selectedCaseIdsSha256: string;
}): EvalRunJsonObject {
  return {
    answer: {
      maxTokens: 512,
      reasoningEffort: "medium",
      temperature: 0,
    },
    context: {
      maxTokens: CONTEXT_TOKEN_BUDGET,
      tokenizer: "utf8-byte-upper-bound-v1",
    },
    costBoundary: "query-only-comparison-with-shadow-ingestion",
    dataset: input.dataset,
    embedding: input.embedding,
    evaluatorSource: input.evaluatorSource,
    modelUsageAccounting: "phase74-model-usage-v1",
    preRankLimit: PRE_RANK_LIMIT,
    providerObjectCalls: PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION,
    reader: "generic-label-free-v1",
    replicate: input.replicate,
    reranker: input.reranker,
    scoring: input.scoring,
    selection: input.selection,
    selectedCaseIdsSha256: input.selectedCaseIdsSha256,
    selectedLimit: SELECTED_LIMIT,
    seenCasesOnly: true,
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function labelFreeCaseContent(testCase: Phase74DatasetCase): string {
  return JSON.stringify({
    caseId: testCase.caseId,
    locale: testCase.locale ?? null,
    memoryGroupId: testCase.memoryGroupId ?? null,
    question: testCase.question,
    rawEvidence: testCase.rawEvidence.map((item) => ({
      content: item.content,
      id: item.id,
      observedAt: item.observedAt ?? null,
      role: item.role ?? null,
      sourceIds: [...item.sourceIds],
    })),
    referenceTime: testCase.referenceTime ?? null,
  });
}

export function selectPhase74GeneralizationCases(input: {
  cases: readonly Phase74DatasetCase[];
  seed?: number;
  size?: number;
}): {
  cases: Phase74DatasetCase[];
  identity: EvalRunJsonObject;
} {
  if ((input.seed === undefined) !== (input.size === undefined)) {
    throw new Error(
      "Phase 74 case selection seed and size must be provided together.",
    );
  }
  const contentHashes = input.cases.map((testCase) =>
    sha256(labelFreeCaseContent(testCase))
  );
  const populationContentSha256 = sha256(JSON.stringify(contentHashes));
  if (input.seed === undefined || input.size === undefined) {
    const cases = [...input.cases];
    return {
      cases,
      identity: {
        mode: "all",
        populationContentSha256,
        populationSize: cases.length,
        selectedCaseIdsSha256: sha256(
          JSON.stringify(cases.map(({ caseId }) => caseId)),
        ),
        selectedSize: cases.length,
      },
    };
  }
  if (!Number.isSafeInteger(input.seed) || input.seed < 0) {
    throw new Error("Phase 74 case selection seed must be a non-negative integer.");
  }
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > input.cases.length
  ) {
    throw new Error(
      `Phase 74 case selection size must be between 1 and ${input.cases.length}.`,
    );
  }
  const selectedIndexes = new Set(
    input.cases
      .map((testCase, index) => ({
        caseId: testCase.caseId,
        index,
        rank: sha256(JSON.stringify([input.seed, contentHashes[index]])),
      }))
      .sort((left, right) =>
        left.rank.localeCompare(right.rank) ||
        left.caseId.localeCompare(right.caseId) ||
        left.index - right.index
      )
      .slice(0, input.size)
      .map(({ index }) => index),
  );
  const cases = input.cases.filter((_, index) => selectedIndexes.has(index));
  return {
    cases,
    identity: {
      mode: "deterministic-content-hash",
      populationContentSha256,
      populationSize: input.cases.length,
      seed: input.seed,
      selectedCaseIdsSha256: sha256(
        JSON.stringify(cases.map(({ caseId }) => caseId)),
      ),
      selectedSize: cases.length,
    },
  };
}

function isoDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toISOString()
    : parsed.toISOString();
}

function stableMessageId(input: {
  caseId: string;
  sessionId: string;
  turnIndex: number;
}): string {
  return `${input.caseId}/${input.sessionId}/turn-${input.turnIndex + 1}`;
}

function inferSubject(content: string, fallback: string): string {
  return content.match(/\b[A-Z][\p{L}\p{N}_-]*\b/u)?.[0] ?? fallback;
}

function inferPredicate(content: string): string {
  const normalized = content.toLowerCase();
  if (/\bprefer(?:s|red|ence)?\b|偏好/u.test(normalized)) {
    return "preference.value";
  }
  if (/\bdatabase\b|\bsqlite\b|\bpostgres\b|数据库/u.test(normalized)) {
    return "technology.database";
  }
  if (/\bdeployment region\b|部署区域/u.test(normalized)) {
    return "deployment.region";
  }
  return "memory.statement";
}

function createSmokeExtractor(input: {
  contextualDescriptor: boolean;
}): MemoryExtractor {
  return {
    async extract(payload) {
      const candidates: MemoryCandidate[] = payload.messages.map(
        (message, sourceMessageIndex) => {
          const subject = inferSubject(message.content, payload.scope.userId);
          return {
            content: message.content,
            explicitness: "explicit",
            id: message.id ?? `message-${sourceMessageIndex + 1}`,
            kindHint: "fact",
            metadata: {
              category: "external_benchmark",
              subject,
              ...(input.contextualDescriptor
                ? {
                    claim: {
                      modality: "asserted" as const,
                      objectText: message.content,
                      polarity: "positive" as const,
                      predicateKey: inferPredicate(message.content),
                    },
                    contextualDescriptor: [
                      payload.scope.sessionId
                        ? `session ${payload.scope.sessionId}`
                        : undefined,
                      message.observedAt
                        ? `observed ${message.observedAt}`
                        : undefined,
                    ].filter(Boolean).join(", "),
                  }
                : {}),
            },
            sourceMessageIndex,
            sourceMessageIndexes: [sourceMessageIndex],
            sourceRole: message.role,
          };
        },
      );
      return { candidates, ignoredMessageCount: 0 };
    },
  };
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readFusionChannels(
  value: unknown,
): GeneralizedFusionChannel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const allowed = new Set<GeneralizedFusionChannel>([
    "dense",
    "entity",
    "lexical",
    "relation",
    "temporal",
  ]);
  return value.filter(
    (item): item is GeneralizedFusionChannel =>
      typeof item === "string" && allowed.has(item as GeneralizedFusionChannel),
  );
}

function createExecutionMemory(input: {
  configuration: Readonly<Record<string, unknown>>;
  now: string;
}): {
  extractionStrategy: "llm-assisted" | "rules-only";
  memory: GoodMemory;
} {
  const representation = readString(
    input.configuration.representation,
    "raw-only",
  );
  const retrieval = input.configuration.retrieval;
  const retrievalConfig = retrieval &&
      typeof retrieval === "object" &&
      !Array.isArray(retrieval)
    ? retrieval as Record<string, unknown>
    : {};
  const planner = input.configuration.planner;
  const plannerMode = planner && typeof planner === "object" &&
      !Array.isArray(planner)
    ? readString((planner as Record<string, unknown>).mode, "off")
    : "off";
  let nextId = 0;
  const assistedExtractor = representation === "raw-only"
    ? undefined
    : createSmokeExtractor({
        contextualDescriptor:
          representation === "atomic-contextual-raw-pointer",
      });
  const fusionChannels = readFusionChannels(
    retrievalConfig.generalizedFusionChannels,
  );
  const memory = createInternalGoodMemory(
    {
      adapters: {
        ...(assistedExtractor ? { assistedExtractor } : {}),
        ...(plannerMode === "assisted"
          ? {
              recallPlanner: {
                async plan() {
                  return {};
                },
              },
            }
          : {}),
      },
      retrieval: {
        ...(fusionChannels
          ? { generalizedFusionChannels: fusionChannels }
          : {}),
        preset: "recommended",
        recallPlanExecution: readBoolean(
          retrievalConfig.recallPlanExecution,
        ),
      },
      storage: { provider: "memory" },
      testing: {
        createId: () => `phase74-smoke-${++nextId}`,
        now: () => new Date(input.now),
      },
    },
    { environment: {} },
  );
  return {
    extractionStrategy: representation === "raw-only"
      ? "rules-only"
      : "llm-assisted",
    memory,
  };
}

function baseScope(testCase: LongMemEvalCase, runId: string): MemoryScope {
  return {
    userId: `phase74-${runId}-${testCase.questionId}`,
    workspaceId: "longmemeval-smoke",
  };
}

function buildGeneralizationCase(
  testCase: LongMemEvalCase,
): Phase74GeneralizationCase {
  return {
    caseId: testCase.questionId,
    expectedAnswer: testCase.answer,
    goldEvidenceIds: testCase.answerSessionIds,
    locale: "en",
    protocolMetadata: {
      questionType: testCase.questionType,
    },
    question: testCase.question,
    rawEvidence: testCase.haystackSessions.flatMap((session, sessionIndex) => {
      const sessionId = testCase.haystackSessionIds[sessionIndex] ??
        `session-${sessionIndex + 1}`;
      const date = testCase.haystackDates[sessionIndex] ?? "unknown-date";
      return session.map((turn, turnIndex) => ({
        content: `[${date}] ${turn.role}: ${turn.content}`,
        id: stableMessageId({
          caseId: testCase.questionId,
          sessionId,
          turnIndex,
        }),
        sourceIds: [sessionId],
      }));
    }),
  };
}

function sourceIdsForMemory(input: {
  evidence: RecallResult["evidence"];
  memoryId: string;
  sessionByMessageId: ReadonlyMap<string, string>;
}): string[] {
  return [...new Set(
    input.evidence
      .filter(
        (record) =>
          record.linkedMemoryIds.includes(input.memoryId) ||
          record.linkedArchiveIds.includes(input.memoryId),
      )
      .flatMap((record) => record.sourceMessageIds)
      .map((messageId) => input.sessionByMessageId.get(messageId))
      .filter((sessionId): sessionId is string => sessionId !== undefined),
  )];
}

function contextItems(input: {
  evidence: RecallResult["evidence"];
  records: readonly { content: string; id: string }[];
  sessionByMessageId: ReadonlyMap<string, string>;
}) {
  return input.records.map((record) => ({
    content: record.content,
    id: record.id,
    sourceIds: sourceIdsForMemory({
      evidence: input.evidence,
      memoryId: record.id,
      sessionByMessageId: input.sessionByMessageId,
    }),
  }));
}

async function executeLongMemEvalRetrieval(input: {
  arm: string;
  configuration: Readonly<Record<string, unknown>>;
  runId: string;
  stage: string;
  testCase: LongMemEvalCase;
}): Promise<RuntimeSnapshot> {
  const scope = baseScope(input.testCase, input.runId);
  const runtime = createExecutionMemory({
    configuration: input.configuration,
    now: isoDate(input.testCase.questionDate),
  });
  const sessionByMessageId = new Map<string, string>();
  for (const [sessionIndex, session] of input.testCase.haystackSessions.entries()) {
    const sessionId = input.testCase.haystackSessionIds[sessionIndex] ??
      `session-${sessionIndex + 1}`;
    const observedAt = isoDate(
      input.testCase.haystackDates[sessionIndex] ?? "1970-01-01",
    );
    const messages = session.map((turn, turnIndex) => {
      const id = stableMessageId({
        caseId: input.testCase.questionId,
        sessionId,
        turnIndex,
      });
      sessionByMessageId.set(id, sessionId);
      return {
        content: turn.content,
        id,
        observedAt,
        role: turn.role,
      };
    });
    await runtime.memory.remember({
      annotations: messages.map((_, messageIndex) => ({
        confirmed: true,
        kindHint: "fact" as const,
        messageIndex,
        metadataPatch: {
          attributes: {
            sourceDate: observedAt,
            sourceSessionId: sessionId,
          },
        },
        reason: "Preserve immutable raw source evidence for Phase 74 smoke.",
        remember: "always" as const,
        verified: true,
      })),
      extractionStrategy: runtime.extractionStrategy,
      messages,
      scope: { ...scope, sessionId },
    });
  }
  const recall = await runtime.memory.recall({
    includeEvidence: true,
    query: input.testCase.question,
    scope,
    strategy: "hybrid",
  });
  const exported = await runtime.memory.exportMemory({ scope });
  const storedEvidence = exported.durable.evidence;
  const storedMemories = contextItems({
    evidence: storedEvidence,
    records: exported.durable.facts.map(({ content, id }) => ({ content, id })),
    sessionByMessageId,
  });
  const retrievedMemories = contextItems({
    evidence: recall.evidence,
    records: recall.facts.map(({ content, id }) => ({ content, id })),
    sessionByMessageId,
  });
  const evidenceLedgers = Object.fromEntries(
    await Promise.all(
      ([
        "prose",
        "chronology",
        "compact_json",
        "json_locale_note",
      ] as const).map(async (format) => [
        format,
        (await runtime.memory.buildContext({
          evidenceLedgerFormat: format,
          maxTokens: CONTEXT_TOKEN_BUDGET,
          output: "markdown",
          recall,
        })).content,
      ]),
    ),
  ) as Record<EvidenceLedgerFormat, string>;
  const snapshotId = sha256(JSON.stringify({
    arm: input.arm,
    caseId: input.testCase.questionId,
    evidenceLedgers,
    retrievedMemories,
    stage: input.stage,
    storedMemories,
  }));
  return {
    evidenceLedgers,
    retrievedMemories,
    snapshotId,
    storedMemories,
  };
}

const STOPWORDS = new Set([
  "a",
  "an",
  "did",
  "does",
  "finally",
  "for",
  "is",
  "the",
  "to",
  "what",
  "which",
]);

function readerTokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])
    .map((token) => token.replace(/(?:ing|ed|es|s)$/u, ""))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function deterministicGenericReader(input: {
  context: string;
  question: string;
}): string {
  if (!input.context.trim()) {
    return "No answer.";
  }
  const questionTokens = new Set(readerTokens(input.question));
  const lines = input.context.split("\n").filter((line) => line.trim());
  let bestLine = lines.at(-1) ?? "";
  let bestScore = -1;
  for (const line of lines) {
    const lineTokens = new Set(readerTokens(line));
    const score = [...questionTokens].filter((token) => lineTokens.has(token)).length;
    if (score >= bestScore) {
      bestLine = line;
      bestScore = score;
    }
  }
  if (/\bno one mentioned\b|\bnot mentioned\b|未提及/iu.test(bestLine)) {
    return "No answer.";
  }
  return bestLine.replace(/^\s*-\s*\[.*?\]\s*/u, "").trim();
}

function normalizeAnswer(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[.。]+$/u, "").trim();
}

function deterministicJudge(input: {
  answer: string;
  expectedAnswer: string;
}): { correct: boolean } {
  const answer = normalizeAnswer(input.answer);
  const expected = normalizeAnswer(input.expectedAnswer);
  const abstentionExpected = expected === "no answer";
  return {
    correct: abstentionExpected
      ? /\bno answer\b|cannot determine|insufficient/u.test(answer)
      : answer === expected || answer.includes(expected),
  };
}

function modelSafeRunId(generatedAt: string): string {
  return `phase74-smoke-${generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonLines(path: string, values: readonly unknown[]): Promise<void> {
  await writeFile(path, values.map(jsonLine).join(""), "utf8");
}

const PHASE74_USAGE_BRANCHES = new Set([
  "baseline",
  "candidate",
  "judge",
  "oracle_reader",
  "protocol_reader",
  "shadow",
]);
const PHASE74_USAGE_OPERATIONS = new Set([
  "answer_generation",
  "assisted_extraction",
  "embedding",
  "judge",
  "recall_plan",
  "recall_router_plan",
  "recall_router_rerank",
  "reranker_listwise",
  "reranker_pointwise",
]);

function isUsageTokenCount(value: unknown): boolean {
  return value === null || (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function isAttributedModelUsageAttempt(
  value: unknown,
): value is AttributedModelUsageAttempt {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  const usage = event.usage;
  return Number.isSafeInteger(event.attempt) && Number(event.attempt) > 0 &&
    typeof event.branch === "string" && PHASE74_USAGE_BRANCHES.has(event.branch) &&
    typeof event.caseId === "string" && event.caseId.length > 0 &&
    (event.completeness === "complete" ||
      event.completeness === "missing" || event.completeness === "partial") &&
    typeof event.modelId === "string" && event.modelId.length > 0 &&
    typeof event.operation === "string" &&
    PHASE74_USAGE_OPERATIONS.has(event.operation) &&
    (event.outcome === "failed" || event.outcome === "succeeded") &&
    typeof event.providerId === "string" && event.providerId.length > 0 &&
    event.schemaVersion === 1 && usage !== null && typeof usage === "object" &&
    !Array.isArray(usage) && [
      "cacheCreationInputTokens",
      "cacheReadInputTokens",
      "inputTokens",
      "outputTokens",
      "uncachedInputTokens",
    ].every((key) => isUsageTokenCount((usage as Record<string, unknown>)[key]));
}

export async function loadPhase74ModelUsageEvents(
  path: string,
): Promise<AttributedModelUsageAttempt[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return raw.split("\n").filter(Boolean).map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid Phase 74 model usage JSON at line ${index + 1}.`);
    }
    if (!isAttributedModelUsageAttempt(value)) {
      throw new Error(`Invalid Phase 74 model usage event at line ${index + 1}.`);
    }
    return value;
  });
}

function publicModelIdentity(model: Phase74LiveModels["answer"]) {
  return {
    gateway: model.baseURL ?? "",
    model: model.model,
    provider: model.provider,
  };
}

export function phase74BenchmarkScore(input: {
  answer: string;
  benchmark: Phase74BenchmarkFamily;
  correct: boolean;
  testCase: Phase74GeneralizationCase;
}): number {
  if (input.benchmark === "longmemeval") {
    return Number(input.correct);
  }
  const rawMatchMode = input.testCase.protocolMetadata?.matchMode;
  if (
    typeof rawMatchMode !== "string" ||
    !LOCOMO_MATCH_MODES.includes(rawMatchMode as LocomoMatchMode)
  ) {
    throw new Error(`Phase 74 LoCoMo case ${input.testCase.caseId} has no valid match mode.`);
  }
  const matchMode = rawMatchMode as LocomoMatchMode;
  if (matchMode === "f1_token_overlap") {
    return locomoTokenF1(input.answer, input.testCase.expectedAnswer);
  }
  const adversarialAnswer = input.testCase.protocolMetadata?.adversarialAnswer;
  return Number(scoreLocomoAnswer({
    ...(typeof adversarialAnswer === "string" || adversarialAnswer === null
      ? { adversarialAnswer }
      : {}),
    answer: input.answer,
    goldAnswer: input.testCase.expectedAnswer,
    matchMode,
  }));
}

export async function loadPhase74PreparedDataset(input: {
  benchmark: Phase74BenchmarkFamily;
  benchmarkRoot: string;
}): Promise<Phase74DatasetBundle> {
  const dataFile = input.benchmark === "longmemeval"
    ? "longmemeval_s_cleaned.json"
    : "cases.json";
  const raw = await readFile(join(input.benchmarkRoot, dataFile), "utf8");
  const bundle = input.benchmark === "longmemeval"
    ? createPhase74LongMemEvalDataset({ raw })
    : createPhase74LocomoDataset({ normalizedRaw: raw });
  assertPhase74FrozenDataset(bundle);
  const persisted = JSON.parse(await readFile(
    join(input.benchmarkRoot, "dataset-manifest.json"),
    "utf8",
  ));
  for (const [key, value] of Object.entries(bundle.manifest)) {
    if (!isDeepStrictEqual(persisted[key], value)) {
      throw new Error(
        `Phase 74 ${input.benchmark} prepared manifest drifted at ${key}.`,
      );
    }
  }
  if (persisted.dataFile !== dataFile) {
    throw new Error(`Phase 74 ${input.benchmark} prepared data file drifted.`);
  }
  return bundle;
}

async function persistRunIdentity(input: {
  identity: Parameters<typeof createOrMatchEvalRunIdentity>[0]["identity"];
  runDirectory: string;
}) {
  const identityPath = join(input.runDirectory, "run-identity.json");
  await createOrMatchEvalRunIdentity({
    identity: input.identity,
    path: identityPath,
    persistence: {
      async create(path, content) {
        await writeFile(path, content, { encoding: "utf8", flag: "wx" });
      },
      async read(path) {
        try {
          return await readFile(path, "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
          }
          throw error;
        }
      },
    },
  });
  return JSON.parse(await readFile(identityPath, "utf8"));
}

export async function runPhase74GeneralizationFull(
  options: Phase74GeneralizationFullOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<Phase74GeneralizationFullResult> {
  assertCliPathSegmentValue({ flag: "--run-id", value: options.runId });
  const dataset = await loadPhase74PreparedDataset(options);
  const selection = selectPhase74GeneralizationCases({
    cases: dataset.cases,
    seed: options.caseSelectionSeed,
    size: options.caseSelectionSize,
  });
  const selectedCases = selection.cases;
  const models = resolvePhase74LiveModels(env);
  const rerankerMode = options.rerankerMode ?? "provider";
  const evaluatorSource = await verifyPhase74EvaluatorSource({
    declared: resolvePhase74EvaluatorSource(env),
    repoRoot: process.cwd(),
  });
  const promptSha256s = phase74LivePromptSha256s();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const runDirectory = join(resolve(options.outputDir), options.runId);
  await mkdir(runDirectory, { recursive: true });
  const selectedCaseIdsSha256 = sha256(
    JSON.stringify(selectedCases.map(({ caseId }) => caseId)),
  );
  const identity = buildEvalRunIdentity({
    answerModel: publicModelIdentity(models.answer),
    benchmark: `${options.benchmark}-full`,
    configuration: buildPhase74FullRunIdentityConfiguration({
      dataset: dataset.manifest as unknown as EvalRunJsonObject,
      embedding: buildPhase74EmbeddingIdentity(models.embedding),
      evaluatorSource,
      replicate: options.replicate,
      reranker: rerankerMode === "deterministic"
        ? {
            implementation: "lexical-coverage-v1",
            mode: "deterministic",
          }
        : {
            ...publicModelIdentity(models.reranker),
            implementation: "provider-pointwise-v1",
            mode: "provider",
          },
      scoring: buildPhase74OfficialScoringIdentity(options.benchmark),
      selection: selection.identity,
      selectedCaseIdsSha256,
    }),
    datasetSha256: dataset.manifest.datasetSha256,
    generatedAt,
    generatedBy: "scripts/run-phase-74-generalization.ts",
    judgeModel: publicModelIdentity(models.judge),
    promptSha256s,
    runId: options.runId,
  });
  const prefix = options.stage.toLowerCase();
  const usagePath = join(runDirectory, `${prefix}-model-usage.jsonl`);
  const events = await loadPhase74ModelUsageEvents(usagePath);
  const onUsageEvent = (event: AttributedModelUsageAttempt) => {
    appendPhase74ModelUsageEventSync(usagePath, event);
  };
  const retrieval = createPhase74FullRetrievalRuntime({
    datasetSha256: dataset.manifest.datasetSha256,
    evaluatorSourceSha256: evaluatorSource.sha256,
    events,
    models,
    runDirectory,
    onUsageEvent,
    promptSha256s,
    rerankerMode,
  });
  const reader = createPhase74LiveReader({
    events,
    model: models.answer,
    onUsageEvent,
  });
  const judge = createPhase74LiveJudge({
    events,
    model: models.judge,
    onUsageEvent,
  });
  const officialAssessment = createPhase74OfficialAnswerAssessor({
    benchmark: options.benchmark,
    events,
    model: models.judge,
    onUsageEvent,
  });
  const countRenderedTokens = (content: string) =>
    Buffer.byteLength(content, "utf8");
  const protocolReader = createPhase74ProtocolReader({
    contextTokenBudget: CONTEXT_TOKEN_BUDGET,
    countRenderedTokens,
    reader,
  });
  const snapshots: Phase74RetrievalSnapshot[] = [];
  const report = await runPhase74Generalization({
    assessAnswer: officialAssessment,
    cases: selectedCases,
    checkpoint: createPhase74FileCheckpoint(join(runDirectory, "checkpoints")),
    contextTokenBudget: CONTEXT_TOKEN_BUDGET,
    countRenderedTokens,
    executeRetrieval: retrieval.execute,
    genericReader: reader,
    identity,
    includeOracle: options.stage === "E4",
    judge,
    onRetrievalSnapshot: (snapshot) => {
      snapshots.push(snapshot);
    },
    persistIdentity: (nextIdentity) => persistRunIdentity({
      identity: nextIdentity,
      runDirectory,
    }),
    protocolReader,
    renderEvidenceLedger: retrieval.render,
    stages: [options.stage],
  });
  const experimentIdentityHash = hashEvalExperimentIdentity(report.identity);
  const modelUsage = options.stage === "E4"
    ? null
    : buildPhase74ModelUsageEvidence(events, {
        baselineCaseIds: selectedCases.map(({ caseId }) => caseId),
        candidateCaseIds: selectedCases.map(({ caseId }) => caseId),
        costBoundary: "query-only",
      });
  const endToEndScores = Object.fromEntries(
    [...new Set(report.executions.map(({ arm }) => arm))].map((arm) => {
      const armCases = report.executions.filter((result) => result.arm === arm);
      const scored = armCases.filter(
        (result): result is typeof result & { correct: boolean; score: number } =>
          result.correct !== undefined && result.score !== undefined,
      );
      return [arm, {
        meanFamilyScore: scored.length === 0
          ? null
          : scored.reduce((sum, { score }) => sum + score, 0) / scored.length,
        semanticAccuracy: scored.length === 0
          ? null
          : scored.filter(({ correct }) => correct).length / scored.length,
        caseCount: armCases.length,
        scoredCaseCount: scored.length,
      }];
    }),
  );

  await Promise.all([
    writeJson(
      join(runDirectory, "dataset-manifest.json"),
      dataset.manifest,
    ),
    writeJsonLines(
      join(runDirectory, `${prefix}-progress.jsonl`),
      options.stage === "E4" ? report.e4.cases : report.executions,
    ),
    writeJsonLines(
      join(runDirectory, `${prefix}-retrieval-packets.jsonl`),
      snapshots,
    ),
    writeFile(usagePath, "", { encoding: "utf8", flag: "a" }),
    writeJson(
      join(runDirectory, `${prefix}-model-usage-summary.json`),
      modelUsage ?? {
        reason: "E4 has no frozen baseline/candidate product-cost pair.",
        status: "not_applicable",
      },
    ),
    writeJson(
      join(runDirectory, `${prefix}-report.json`),
      report,
    ),
    writeJson(
      join(runDirectory, `${prefix}-summary.json`),
      {
        ...report.summary,
        benchmark: options.benchmark,
        comparison: options.stage === "E4"
          ? null
          : buildPhase74ReplicateComparison({
              benchmark: options.benchmark,
              selectedCaseIdsSha256,
              stage: options.stage,
            }),
        endToEndScores,
        experimentIdentityHash,
        identityHash: report.identityHash,
        modelUsage,
        replicate: options.replicate,
        stage: options.stage,
        status: report.status,
      },
    ),
    ...(options.stage === "E4"
      ? [
          writeJsonLines(
            join(runDirectory, "oracle-matrix.jsonl"),
            report.oracle,
          ),
          writeJson(join(runDirectory, "promotion-gate.json"), {
            reason:
              "Full public datasets are seen-case diagnostics until sealed independent evidence exists.",
            seenCasesOnly: true,
            status: "not_evaluable",
          }),
        ]
      : []),
  ]);
  return { dataset, report, runDirectory };
}

export async function runPhase74GeneralizationSmoke(
  options: Phase74GeneralizationSmokeOptions = {},
): Promise<Phase74GeneralizationSmokeResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const runId = options.runId ?? modelSafeRunId(generatedAt);
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  const datasetPath = resolve(options.datasetPath ?? DEFAULT_DATASET_PATH);
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const runDirectory = join(outputDir, runId);
  await mkdir(runDirectory, { recursive: true });
  const rawDataset = await readFile(datasetPath, "utf8");
  const testCases = validateLongMemEvalCases(JSON.parse(rawDataset));
  const casesById = new Map(testCases.map((testCase) => [
    testCase.questionId,
    testCase,
  ]));
  const generalizationCases = testCases.map(buildGeneralizationCase);
  const selectedCaseIdsSha256 = sha256(
    JSON.stringify(testCases.map(({ questionId }) => questionId)),
  );
  const identity = buildEvalRunIdentity({
    answerModel: {
      gateway: "deterministic://phase74-generic-reader",
      model: "phase74-generic-extractive-reader-v1",
      provider: "deterministic",
    },
    benchmark: "longmemeval-smoke",
    configuration: {
      answer: { maxTokens: 512, temperature: 0 },
      context: {
        maxTokens: CONTEXT_TOKEN_BUDGET,
        tokenizer: "utf8-byte-upper-bound-v1",
      },
      modelUsageAccounting: "phase74-model-usage-v1",
      preRankLimit: PRE_RANK_LIMIT,
      reader: "generic-label-free-v1",
      replicate: 1,
      selectedCaseIdsSha256,
      selectedLimit: SELECTED_LIMIT,
      smoke: true,
    },
    datasetSha256: sha256(rawDataset),
    generatedAt,
    generatedBy: "scripts/run-phase-74-generalization.ts",
    judgeModel: {
      gateway: "deterministic://phase74-independent-judge",
      model: "phase74-independent-deterministic-judge-v1",
      provider: "deterministic",
    },
    promptSha256s: {
      genericReader: sha256(deterministicGenericReader.toString()),
      judge: sha256(deterministicJudge.toString()),
      protocolReader: sha256("phase74-smoke-protocol-reader-v1"),
    },
    runId,
  });
  const snapshots: RuntimeSnapshot[] = [];
  const report = await runPhase74Generalization({
    cases: generalizationCases,
    checkpoint: createPhase74FileCheckpoint(join(runDirectory, "checkpoints")),
    contextTokenBudget: CONTEXT_TOKEN_BUDGET,
    countRenderedTokens: (content) => Buffer.byteLength(content, "utf8"),
    executeRetrieval: async ({ arm, configuration, stage, testCase }) => {
      const benchmarkCase = casesById.get(testCase.caseId);
      if (!benchmarkCase) {
        throw new Error(`Unknown LongMemEval smoke case ${testCase.caseId}`);
      }
      const snapshot = await executeLongMemEvalRetrieval({
        arm,
        configuration,
        runId,
        stage,
        testCase: benchmarkCase,
      });
      return snapshot;
    },
    genericReader: async (input) => deterministicGenericReader(input),
    identity,
    judge: async (input) => deterministicJudge(input),
    onRetrievalSnapshot: (snapshot) => {
      snapshots.push(snapshot as RuntimeSnapshot);
    },
    persistIdentity: async (nextIdentity) => {
      const identityPath = join(runDirectory, "run-identity.json");
      await createOrMatchEvalRunIdentity({
        identity: nextIdentity,
        path: identityPath,
        persistence: {
          async create(path, content) {
            await writeFile(path, content, { encoding: "utf8", flag: "wx" });
          },
          async read(path) {
            try {
              return await readFile(path, "utf8");
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
              }
              throw error;
            }
          },
        },
      });
      return JSON.parse(await readFile(identityPath, "utf8"));
    },
    protocolReader: createPhase74ProtocolReader({
      contextTokenBudget: CONTEXT_TOKEN_BUDGET,
      countRenderedTokens: (content) => Buffer.byteLength(content, "utf8"),
      reader: async (input) => deterministicGenericReader(input),
    }),
    renderEvidenceLedger: async ({ format, snapshot }) => {
      const rendered = snapshot.evidenceLedgers?.[format];
      if (rendered === undefined) {
        throw new Error(
          `Phase 74 snapshot ${snapshot.snapshotId} has no ${format} evidence ledger.`,
        );
      }
      return rendered;
    },
  });

  const publicSnapshots = snapshots.map((snapshot) => ({
    retrievedMemories: snapshot.retrievedMemories,
    snapshotId: snapshot.snapshotId,
    storedMemories: snapshot.storedMemories,
  }));
  await Promise.all([
    writeJson(join(runDirectory, "snapshot-manifest.json"), {
      datasetSha256: identity.datasetSha256,
      replay: "content-hashed-file-checkpoints",
      schemaVersion: 1,
      selectedCaseIdsSha256,
      snapshotIds: publicSnapshots.map(({ snapshotId }) => snapshotId),
    }),
    writeJsonLines(join(runDirectory, "progress.jsonl"), report.executions),
    writeJsonLines(join(runDirectory, "cases.jsonl"), report.executions),
    writeJsonLines(
      join(runDirectory, "retrieval-packets.jsonl"),
      publicSnapshots,
    ),
    writeJsonLines(join(runDirectory, "oracle-matrix.jsonl"), report.oracle),
    writeJsonLines(join(runDirectory, "e4-formats.jsonl"), report.e4.cases),
    writeJson(join(runDirectory, "summary.json"), {
      ...report.summary,
      identityHash: report.identityHash,
      selectedEvidenceLedgerFormat: report.e4.selectedFormat,
      status: report.status,
    }),
    writeJson(join(runDirectory, "inference.json"), {
      reason: "A deterministic smoke run has no repeated-run inference.",
      status: "not_evaluable",
    }),
    writeJson(join(runDirectory, "promotion-gate.json"), {
      reason: report.reason,
      status: "not_evaluable",
    }),
    writeJsonLines(join(runDirectory, "model-usage.jsonl"), [{
      liveModelRequestCount: 0,
      reason: "Deterministic smoke; live usage evidence was not collected.",
      status: "not_applicable",
    }]),
    writeJson(join(runDirectory, "report.json"), report),
  ]);

  return { report, runDirectory };
}

export type Phase74GeneralizationCliOptions =
  | ({
      benchmark: "longmemeval";
      mode: "smoke";
    } & Phase74GeneralizationSmokeOptions)
  | {
      benchmark: "locomo" | "longmemeval";
      benchmarkRoot: string;
      caseSelectionSeed?: number;
      caseSelectionSize?: number;
      mode: "full";
      outputDir: string;
      replicate: 1 | 2 | 3;
      rerankerMode?: "deterministic" | "provider";
      runId: string;
      stage: "E1" | "E2" | "E3" | "E4";
    };

export function parsePhase74GeneralizationCliOptions(
  args: readonly string[],
): Phase74GeneralizationCliOptions {
  const readFlag = (name: string) => resolveCliFlagValueStrict(args, name);
  const mode = readFlag("--mode") ?? "smoke";
  const benchmark = readFlag("--benchmark") ?? "longmemeval";
  if (mode === "smoke") {
    if (benchmark !== "longmemeval") {
      throw new Error("Phase 74 smoke supports only --benchmark longmemeval.");
    }
    return {
      benchmark,
      ...(readFlag("--dataset-path") === undefined
        ? {}
        : { datasetPath: readFlag("--dataset-path") }),
      mode,
      ...(readFlag("--output-dir") === undefined
        ? {}
        : { outputDir: readFlag("--output-dir") }),
      ...(readFlag("--run-id") === undefined
        ? {}
        : { runId: readFlag("--run-id") }),
    };
  }
  if (mode !== "full") {
    throw new Error("--mode must be smoke or full.");
  }
  if (benchmark !== "longmemeval" && benchmark !== "locomo") {
    throw new Error("--benchmark must be longmemeval or locomo.");
  }
  const benchmarkRoot = readFlag("--benchmark-root");
  const outputDir = readFlag("--output-dir");
  const runId = readFlag("--run-id");
  const rawCaseSelectionSeed = readFlag("--case-selection-seed");
  const rawCaseSelectionSize = readFlag("--case-selection-size");
  if (
    (rawCaseSelectionSeed === undefined) !==
      (rawCaseSelectionSize === undefined)
  ) {
    throw new Error(
      "--case-selection-seed and --case-selection-size must be provided together.",
    );
  }
  if (
    rawCaseSelectionSeed !== undefined &&
    (!/^\d+$/u.test(rawCaseSelectionSeed) ||
      !Number.isSafeInteger(Number(rawCaseSelectionSeed)))
  ) {
    throw new Error("--case-selection-seed must be a non-negative integer.");
  }
  if (
    rawCaseSelectionSize !== undefined &&
    (!/^[1-9]\d*$/u.test(rawCaseSelectionSize) ||
      !Number.isSafeInteger(Number(rawCaseSelectionSize)))
  ) {
    throw new Error("--case-selection-size must be a positive integer.");
  }
  const rawReplicate = readFlag("--replicate");
  if (rawReplicate !== "1" && rawReplicate !== "2" && rawReplicate !== "3") {
    throw new Error("--replicate must be 1, 2, or 3.");
  }
  const stage = readFlag("--stage");
  if (stage !== "E1" && stage !== "E2" && stage !== "E3" && stage !== "E4") {
    throw new Error("--stage must be E1, E2, E3, or E4.");
  }
  const rerankerMode = readFlag("--reranker-mode");
  if (
    rerankerMode !== undefined &&
    rerankerMode !== "deterministic" &&
    rerankerMode !== "provider"
  ) {
    throw new Error("--reranker-mode must be deterministic or provider.");
  }
  if (!benchmarkRoot || !outputDir || !runId) {
    throw new Error(
      "Phase 74 full mode requires --benchmark-root, --output-dir, and --run-id.",
    );
  }
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  return {
    benchmark,
    benchmarkRoot,
    ...(rawCaseSelectionSeed === undefined
      ? {}
      : { caseSelectionSeed: Number(rawCaseSelectionSeed) }),
    ...(rawCaseSelectionSize === undefined
      ? {}
      : { caseSelectionSize: Number(rawCaseSelectionSize) }),
    mode,
    outputDir,
    replicate: Number(rawReplicate) as 1 | 2 | 3,
    ...(rerankerMode === undefined ? {} : { rerankerMode }),
    runId,
    stage,
  };
}

if (import.meta.main) {
  const options = parsePhase74GeneralizationCliOptions(process.argv);
  const result = options.mode === "smoke"
    ? await runPhase74GeneralizationSmoke({
        datasetPath: options.datasetPath,
        outputDir: options.outputDir,
        runId: options.runId,
      })
    : await runPhase74GeneralizationFull(options);
  console.log(JSON.stringify({
    runDirectory: result.runDirectory,
    status: result.report.status,
    summary: result.report.summary,
  }, null, 2));
}
