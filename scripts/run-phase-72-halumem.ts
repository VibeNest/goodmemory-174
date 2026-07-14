import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { z } from "zod";

import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import type {
  ExportMemoryResult,
  GoodMemory,
  RecallResult,
} from "../src/api/contracts";
import type { UserProfile } from "../src/domain/records";
import type { MemoryScope } from "../src/domain/scope";
import { createLocalEmbeddingAdapter } from "../src/embedding/localEmbeddingAdapter";
import { createLanguageService } from "../src/language/service";
import { createProviderEmbeddingAdapter } from "../src/provider/layer";
import {
  requestOpenAICompatibleObject,
  requestOpenAICompatibleText,
  stripThinkingBlocks,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import { computeBm25Scores } from "../src/recall/bm25";
import {
  assertCliPathSegmentValue,
  hasCliFlagStrict,
  resolveCliFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";
import {
  PHASE72_ANSWER_GATEWAY,
  PHASE72_ANSWER_MODEL,
  PHASE72_INDEPENDENT_JUDGE_MODEL,
  PHASE72_UPSTREAMS,
} from "./phase-72-external-contracts";
import {
  createSimpleVectorMemory,
  evaluateHaluMemComparison,
  type HaluMemAdapterUser,
  type HaluMemProfileAdapter,
  normalizeHaluMemJudgeContent,
  readHaluMemOfficialMetrics,
  reanswerHaluMemProfile,
  runHaluMemProfile,
  selectHaluMemSlice,
  type HaluMemUser,
} from "./phase-72-halumem";

const DEFAULT_SESSION_INDEXES = [0, 1, 3, 4] as const;

export const HALUMEM_ANSWER_SYSTEM_PROMPT = [
  "Answer the question concisely using only the supplied memory context.",
  'For yes-no questions, answer "No" when the context contradicts any required premise, and state the contradictory facts.',
  "Distinguish planned or intended actions from completed actions.",
  "Respond that the answer is unknown only when the context neither supports nor contradicts the claim.",
  "For identity or relationship questions, require an explicit link between that identity and the event; do not merge separate facts merely because they share a relationship label.",
  "For application or generalization questions, connect the remembered preference traits and the remembered practical benefit that are relevant to the scenario.",
  "When the context states a concrete benefit, preserve that explicit benefit wording instead of replacing it with a related abstraction.",
  "State every directly relevant concrete benefit supported by the context; do not compress distinct benefits into a broader outcome.",
  "Do not add unsupported details.",
].join(" ");
export const HALUMEM_APPLICATION_ANSWER_REQUIREMENT =
  "Answer requirement: Explicitly include every distinct concrete benefit from the memory context that directly explains the outcome. Do not replace those benefits with only a broader conclusion.";
export const HALUMEM_ANSWER_PROMPT_SHA256 = sha256Text(
  [
    HALUMEM_ANSWER_SYSTEM_PROMPT,
    HALUMEM_APPLICATION_ANSWER_REQUIREMENT,
  ].join("\n"),
);
export const HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT = [
  "Render recalled atomic memories as one grounded memory update for an external protocol.",
  "Use only the numbered memory lines as evidence; the candidate update retrieval intent is never evidence.",
  "Treat the candidate update as a coverage checklist: preserve every distinct supported relationship stated by that checklist, but include it only when cited memory lines entail it.",
  "When all checklist clauses are entailed, reconstruct them with the checklist's own relation and facet wording instead of substituting a nearby abstraction.",
  "Omit recalled facts outside the checklist. Prefer a complete entailed reconstruction of the checklist over a terse summary; preserve supported agency, modality, means, reasons, conjunctions, and old-to-new states.",
  "Combine related facts only when the cited memory lines support that relationship.",
  "Describe a prior-to-current transition only when both states are supported.",
  "Do not copy unsupported clauses from the retrieval intent and do not add outside knowledge.",
].join(" ");
export const HALUMEM_UPDATE_PROJECTION_PROMPT_SHA256 = sha256Text(
  HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT,
);

const haluMemUpdateProjectionSchema = z.object({
  evidenceIndexes: z.array(z.number().int().nonnegative()).min(1),
  fullySupported: z.boolean(),
  memory: z.string().min(1),
});

const HALUMEM_QA_SOURCE_EVIDENCE_LIMIT = 6;
const HALUMEM_UPDATE_SOURCE_EVIDENCE_LIMIT = 12;
const HALUMEM_LOCAL_EMBEDDING_DIMENSIONS = 256;
const HALUMEM_LOCAL_EMBEDDING_MODEL =
  "goodmemory-local-hashed-token-char3gram-v1";
const HALUMEM_EMBEDDING_ENV_KEYS = [
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
] as const;
const haluMemLanguage = createLanguageService();

export type HaluMemEmbeddingMode = "local" | "provider";

export interface HaluMemSourceEvidenceEntry {
  id: string;
  text: string;
}

export function selectHaluMemSourceEvidence(input: {
  entries: readonly HaluMemSourceEvidenceEntry[];
  limit: number;
  query: string;
}): string[] {
  const locale = haluMemLanguage.resolveFromText({ text: input.query }).locale;
  const scores = computeBm25Scores(input.query, input.entries, {
    tokenize: (text) =>
      haluMemLanguage.tokenize(text, locale, { excludeStopwords: true }),
  });
  return input.entries
    .filter((entry) => scores.has(entry.id))
    .sort(
      (left, right) =>
        (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, input.limit)
    .map((entry) => entry.text);
}

export interface Phase72HaluMemOptions {
  answerOnly: boolean;
  benchmarkFile: string;
  embeddingMode: HaluMemEmbeddingMode;
  officialEvalOnly: boolean;
  outputDir: string;
  runId: string;
  sessionIndexes: number[];
  skipOfficialEval: boolean;
  upstreamRoot: string;
  userIndex: number;
  workDir: string;
}

export interface Phase72HaluMemLiveConfig {
  answer: AISDKModelConfig;
  embedding:
    | {
        dimensions: number;
        mode: "local";
        model: string;
      }
    | {
        mode: "provider";
        model: AISDKModelConfig;
      };
  extraction: AISDKModelConfig;
  judge: AISDKModelConfig;
  reranking: AISDKModelConfig;
  updateProjection: AISDKModelConfig;
}

interface HaluMemProfileDiagnostics {
  answerOperations: number;
  recallOperations: number;
  rememberOperations: number;
  updateProjectionOperations: number;
  warnings: string[];
}

interface HaluMemGenerationResult {
  diagnostics: HaluMemProfileDiagnostics;
  outputPath: string;
}

export function parsePhase72HaluMemOptions(
  argv: readonly string[],
): Phase72HaluMemOptions {
  const root = process.cwd();
  const cacheRoot = join(homedir(), ".cache", "goodmemory-benchmarks");
  const runId = resolveCliFlagValueStrict(argv, "--run-id") ??
    "run-phase72-halumem-generated-slice";
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  const officialEvalOnly = hasCliFlagStrict(argv, "--official-eval-only");
  const answerOnly = hasCliFlagStrict(argv, "--answer-only");
  const skipOfficialEval = hasCliFlagStrict(argv, "--skip-official-eval");
  if (officialEvalOnly && skipOfficialEval) {
    throw new Error("--official-eval-only cannot be combined with --skip-official-eval.");
  }
  if (answerOnly && officialEvalOnly) {
    throw new Error("--answer-only cannot be combined with --official-eval-only.");
  }
  return {
    answerOnly,
    benchmarkFile: resolveCliFlagValueStrict(argv, "--benchmark-file") ??
      join(cacheRoot, "HaluMem", "HaluMem-Medium.jsonl"),
    embeddingMode: parseHaluMemEmbeddingMode(
      resolveCliFlagValueStrict(argv, "--embedding-mode") ?? "provider",
    ),
    officialEvalOnly,
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir") ??
      join(root, "reports", "eval", "research", "phase-72", "halumem"),
    runId,
    sessionIndexes: parseSessionIndexes(
      resolveCliFlagValueStrict(argv, "--session-indexes"),
    ),
    skipOfficialEval,
    upstreamRoot: resolveCliFlagValueStrict(argv, "--upstream-root") ??
      join(cacheRoot, "HaluMem"),
    userIndex: parseNonNegativeInteger(
      resolveCliFlagValueStrict(argv, "--user-index") ?? "0",
      "--user-index",
    ),
    workDir: resolveCliFlagValueStrict(argv, "--work-dir") ??
      join(cacheRoot, "phase72-runs", "halumem"),
  };
}

export function resolvePhase72HaluMemLiveConfig(
  env: Record<string, string | undefined>,
  embeddingMode: HaluMemEmbeddingMode = "provider",
): Phase72HaluMemLiveConfig {
  const answer = {
    apiKey: requiredEnv(env, "GOODMEMORY_EVAL_API_KEY"),
    baseURL: requiredEnv(env, "GOODMEMORY_EVAL_BASE_URL"),
    model: requiredEnv(env, "GOODMEMORY_EVAL_MODEL"),
    provider: requiredEnv(env, "GOODMEMORY_EVAL_PROVIDER"),
  } as AISDKModelConfig;
  if (
    answer.provider !== "openai" ||
    answer.model !== PHASE72_ANSWER_MODEL ||
    answer.baseURL !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 answer calls must use ${PHASE72_ANSWER_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  const extraction = {
    apiKey: requiredEnv(env, "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY"),
    baseURL: requiredEnv(env, "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL"),
    model: requiredEnv(env, "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL"),
    provider: "openai",
  } as AISDKModelConfig;
  if (
    extraction.model !== PHASE72_ANSWER_MODEL ||
    extraction.baseURL !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 extraction calls must use ${PHASE72_ANSWER_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  const judge = {
    apiKey: requiredEnv(env, "GOODMEMORY_JUDGE_API_KEY"),
    baseURL: requiredEnv(env, "GOODMEMORY_JUDGE_BASE_URL"),
    model: PHASE72_INDEPENDENT_JUDGE_MODEL,
    provider: "openai",
  } as AISDKModelConfig;
  if (judge.baseURL !== PHASE72_ANSWER_GATEWAY) {
    throw new Error(
      `Phase 72 judge calls must use the pinned ${PHASE72_ANSWER_GATEWAY} gateway.`,
    );
  }
  const embedding: Phase72HaluMemLiveConfig["embedding"] =
    embeddingMode === "local"
      ? {
          dimensions: HALUMEM_LOCAL_EMBEDDING_DIMENSIONS,
          mode: "local",
          model: HALUMEM_LOCAL_EMBEDDING_MODEL,
        }
      : {
          mode: "provider",
          model: {
            apiKey: requiredEnv(env, "GOODMEMORY_EMBEDDING_API_KEY"),
            baseURL: requiredEnv(env, "GOODMEMORY_EMBEDDING_BASE_URL"),
            model: requiredEnv(env, "GOODMEMORY_EMBEDDING_MODEL"),
            provider: requiredEnv(env, "GOODMEMORY_EMBEDDING_PROVIDER"),
          } as AISDKModelConfig,
        };
  if (
    embedding.mode === "provider" &&
    embedding.model.provider !== "openai"
  ) {
    throw new Error("Phase 72 HaluMem embeddings must use an OpenAI-compatible provider.");
  }
  return {
    answer,
    embedding,
    extraction,
    judge,
    reranking: { ...answer },
    updateProjection: { ...answer },
  };
}

export function isolateHaluMemEmbeddingEnvironment(
  env: Record<string, string | undefined>,
  mode: HaluMemEmbeddingMode,
): Record<string, string | undefined> {
  if (mode === "provider") {
    return env;
  }
  const isolated = { ...env };
  for (const key of HALUMEM_EMBEDDING_ENV_KEYS) {
    delete isolated[key];
  }
  return isolated;
}

export function extractHaluMemUserName(persona: string): string {
  const match = persona.match(/(?:^|\]\s*|;\s*)Name:\s*([^;\n]+)/u);
  const name = match?.[1]?.trim();
  if (!name) {
    throw new Error("HaluMem persona Name field is missing.");
  }
  return name;
}

export async function runPhase72HaluMem(
  options: Phase72HaluMemOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<Record<string, unknown>> {
  const config = resolvePhase72HaluMemLiveConfig(env, options.embeddingMode);
  await assertPinnedUpstream(options.upstreamRoot);
  const sourceUser = await readJsonlRow<HaluMemUser>(
    options.benchmarkFile,
    options.userIndex,
  );
  const selectedUser = selectHaluMemSlice(sourceUser, options.sessionIndexes);
  const userName = extractHaluMemUserName(selectedUser.persona_info);
  const datasetSha256 = await sha256File(options.benchmarkFile);
  const workRunDir = join(options.workDir, options.runId);
  const reportRunDir = join(options.outputDir, options.runId);
  await Promise.all([
    mkdir(workRunDir, { recursive: true }),
    mkdir(reportRunDir, { recursive: true }),
  ]);
  const reportPath = join(reportRunDir, "halumem-report.json");
  const goodmemoryOutputPath = join(workRunDir, "goodmemory_eval_results.jsonl");
  const vectorOutputPath = join(workRunDir, "vector_baseline_eval_results.jsonl");
  let goodmemory: HaluMemGenerationResult;
  let vector: HaluMemGenerationResult;
  if (options.officialEvalOnly) {
    ({ goodmemory, vector } = await loadExistingGeneration({
      config,
      datasetSha256,
      expectedAnswerPromptSha256: HALUMEM_ANSWER_PROMPT_SHA256,
      goodmemoryOutputPath,
      reportPath,
      runId: options.runId,
      selectedUser,
      sessionIndexes: options.sessionIndexes,
      vectorOutputPath,
    }));
  } else if (options.answerOnly) {
    ({ goodmemory, vector } = await loadExistingGeneration({
      config,
      datasetSha256,
      goodmemoryOutputPath,
      reportPath,
      runId: options.runId,
      selectedUser,
      sessionIndexes: options.sessionIndexes,
      vectorOutputPath,
    }));
    [goodmemory, vector] = await Promise.all([
      reanswerExistingGeneration({
        answerModel: config.answer,
        generation: goodmemory,
      }),
      reanswerExistingGeneration({
        answerModel: config.answer,
        generation: vector,
      }),
    ]);
  } else {
    const embedding = config.embedding.mode === "local"
      ? createLocalEmbeddingAdapter({
          dimensions: config.embedding.dimensions,
        })
      : createProviderEmbeddingAdapter({
          model: config.embedding.model,
          requestTimeoutMs: 120_000,
        });
    const goodmemoryDiagnostics = createDiagnostics();
    const baselineDiagnostics = createDiagnostics();
    const goodmemoryMemory = createHaluMemGoodMemory(config);
    goodmemory = await generateProfile({
      adapter: createGoodMemoryAdapter({
        diagnostics: goodmemoryDiagnostics,
        memory: goodmemoryMemory,
        scope: { userId: selectedUser.uuid },
        updateProjectionModel: config.updateProjection,
      }),
      answerModel: config.answer,
      diagnostics: goodmemoryDiagnostics,
      outputPath: goodmemoryOutputPath,
      user: selectedUser,
      userName,
    });
    vector = await generateProfile({
      adapter: createVectorAdapter({
        diagnostics: baselineDiagnostics,
        embedding,
      }),
      answerModel: config.answer,
      diagnostics: baselineDiagnostics,
      outputPath: vectorOutputPath,
      user: selectedUser,
      userName,
    });
  }

  const report: Record<string, unknown> = {
    benchmark: "HaluMem-Medium",
    answerPrompt: {
      sha256: HALUMEM_ANSWER_PROMPT_SHA256,
      source:
        "HALUMEM_ANSWER_SYSTEM_PROMPT + HALUMEM_APPLICATION_ANSWER_REQUIREMENT",
    },
    claimScope: "frozen-generated-slice",
    dataset: {
      license: PHASE72_UPSTREAMS.halumem.datasetLicense,
      redistributed: false,
      sha256: datasetSha256,
      sourceFile: options.benchmarkFile,
      userIndex: options.userIndex,
      userUuid: selectedUser.uuid,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-phase-72-halumem.ts",
    generationMode: options.officialEvalOnly
      ? "official-eval-only"
      : options.answerOnly
        ? "answer-only"
        : "full",
    model: {
      answer: publicModel(config.answer, "answer"),
      embedding: describeHaluMemEmbedding(config.embedding),
      extraction: publicModel(config.extraction, "memory-extraction"),
      judge: publicModel(config.judge, "independent-judge"),
      reranking: publicModel(config.reranking, "reranker"),
      updateProjection: publicModel(
        config.updateProjection,
        "grounded-update-projection",
      ),
    },
    updateProjectionPrompt: {
      sha256: HALUMEM_UPDATE_PROJECTION_PROMPT_SHA256,
      source: "HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT",
    },
    profiles: {
      goodmemory: {
        diagnostics: goodmemory.diagnostics,
        rawArtifact: goodmemory.outputPath,
      },
      vectorBaseline: {
        diagnostics: vector.diagnostics,
        rawArtifact: vector.outputPath,
      },
    },
    rawArtifactsTracked: false,
    runId: options.runId,
    selection: {
      sessionIndexes: options.sessionIndexes,
      sessionStarts: selectedUser.sessions.map(({ start_time }) => start_time),
    },
    upstream: {
      codeCommit: PHASE72_UPSTREAMS.halumem.codeCommit,
      codeLicense: PHASE72_UPSTREAMS.halumem.codeLicense,
      codeLicenseEvidence: PHASE72_UPSTREAMS.halumem.codeLicenseEvidence,
      repository: PHASE72_UPSTREAMS.halumem.repository,
    },
  };

  if (!options.skipOfficialEval) {
    const goodmemoryOfficial = await runOfficialEvaluation({
      config,
      profile: "goodmemory",
      rawOutputPath: goodmemory.outputPath,
      runId: options.runId,
      upstreamRoot: options.upstreamRoot,
    });
    const vectorOfficial = await runOfficialEvaluation({
      config,
      profile: "vector-baseline",
      rawOutputPath: vector.outputPath,
      runId: options.runId,
      upstreamRoot: options.upstreamRoot,
    });
    const comparison = evaluateHaluMemComparison({
      baseline: readHaluMemOfficialMetrics(vectorOfficial.payload),
      goodmemory: readHaluMemOfficialMetrics(goodmemoryOfficial.payload),
    });
    report.officialProtocol = {
      comparison,
      evaluator: "HaluMem eval/evaluation.py",
      judgeResponseNormalization: "valid-raw-json-to-fenced-json",
      normalizedTransportRequests:
        goodmemoryOfficial.normalizedTransportRequests +
        vectorOfficial.normalizedTransportRequests,
      rawJudgeArtifactsTracked: false,
    };
    report.status = comparison.status;
  } else {
    report.status = "generated-only";
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportPath };
}

function createHaluMemGoodMemory(config: Phase72HaluMemLiveConfig): GoodMemory {
  let id = 0;
  let tick = 0;
  return createInternalGoodMemory({
    providers: {
      ...(config.embedding.mode === "provider"
        ? { embedding: toOpenAIProviderConfig(config.embedding.model) }
        : {}),
      extraction: {
        ...toOpenAIProviderConfig(config.extraction),
        contextualDescriptors: true,
        mode: "conversational",
      },
      reranking: {
        ...toOpenAIProviderConfig(config.reranking),
        requestTimeoutMs: 120_000,
      },
    },
    remember: {
      profiles: [{
        assistantOutputs: { mode: "verified_only" },
        id: "phase-72-halumem",
      }],
    },
    retrieval: { preset: "recommended" },
    storage: { provider: "memory" },
    testing: {
      createId: () => `phase72-halumem-${++id}`,
      now: () => new Date(Date.UTC(2026, 6, 12, 0, 0, tick++)),
    },
  }, {
    environment: isolateHaluMemEmbeddingEnvironment(
      process.env,
      config.embedding.mode,
    ),
  });
}

function createGoodMemoryAdapter(input: {
  diagnostics: HaluMemProfileDiagnostics;
  memory: GoodMemory;
  scope: MemoryScope;
  updateProjectionModel: AISDKModelConfig;
}): HaluMemProfileAdapter {
  let previousEntries = new Map<string, string>();
  const sourceHistory = new Map<string, string>();
  return {
    async ingest(session) {
      const startedAt = performance.now();
      for (const [index, turn] of session.dialogue.entries()) {
        sourceHistory.set(
          `${session.start_time}:${index}`,
          `[${turn.timestamp}] ${turn.role}: ${turn.content}`,
        );
      }
      const result = await input.memory.remember({
        extractionStrategy: "llm-assisted",
        messages: session.dialogue.map((turn) => ({
          content: `[${turn.timestamp}] ${turn.content}`,
          role: turn.role,
        })),
        scope: input.scope,
      });
      input.diagnostics.rememberOperations += 1;
      for (const warning of result.warnings ?? []) {
        input.diagnostics.warnings.push(warning);
      }
      if (result.warnings?.includes("assisted_extraction_failed")) {
        throw new Error("HaluMem assisted extraction failed.");
      }
      const currentEntries = collectExportEntries(
        await input.memory.exportMemory({ scope: input.scope }),
      );
      const extractedMemories = [...currentEntries]
        .filter(([key, text]) => previousEntries.get(key) !== text)
        .map(([, text]) => text);
      previousEntries = currentEntries;
      console.log("[phase-72:halumem] goodmemory session ingested", {
        accepted: result.accepted,
        extracted: extractedMemories.length,
        rejected: result.rejected,
        startTime: session.start_time,
        warnings: result.warnings ?? [],
      });
      return {
        durationMs: performance.now() - startedAt,
        extractedMemories,
      };
    },
    async search({ purpose, query }) {
      const startedAt = performance.now();
      const recalled = await input.memory.recall({
        decompose: true,
        includeEvidence: purpose === "memory_update",
        multiHop: 2,
        query,
        rerank: true,
        retrievalProfile: "general_chat",
        scope: input.scope,
      });
      input.diagnostics.recallOperations += 1;
      const memories = collectRecallTexts(recalled);
      if (purpose === "memory_update" && memories.length > 0) {
        const sourceEvidence = selectHaluMemSourceEvidence({
          entries: [...sourceHistory].map(([id, text]) => ({ id, text })),
          limit: HALUMEM_UPDATE_SOURCE_EVIDENCE_LIMIT,
          query,
        }).filter((text) => !memories.includes(text));
        memories.unshift(...sourceEvidence);
        const projection = await projectHaluMemUpdate(
          input.updateProjectionModel,
          {
            candidateUpdate: query,
            memories,
          },
        );
        input.diagnostics.updateProjectionOperations += 1;
        memories.unshift(`Grounded memory update: ${projection}`);
      } else if (purpose === "question_answering") {
        const sourceEvidence = selectHaluMemSourceEvidence({
          entries: [...sourceHistory].map(([id, text]) => ({ id, text })),
          limit: HALUMEM_QA_SOURCE_EVIDENCE_LIMIT,
          query,
        }).filter((text) => !memories.includes(text));
        memories.unshift(...sourceEvidence);
      }
      return {
        durationMs: performance.now() - startedAt,
        memories,
      };
    },
  };
}

function createVectorAdapter(input: {
  diagnostics: HaluMemProfileDiagnostics;
  embedding: Parameters<typeof createSimpleVectorMemory>[0];
}): HaluMemProfileAdapter {
  const vector = createSimpleVectorMemory(input.embedding);
  let documentIndex = 0;
  return {
    async ingest(session) {
      const startedAt = performance.now();
      const documents = session.dialogue.map((turn) => ({
        id: `turn-${documentIndex++}`,
        text: `[${turn.timestamp}] ${turn.role}: ${turn.content}`,
      }));
      await vector.add(documents);
      input.diagnostics.rememberOperations += 1;
      return {
        durationMs: performance.now() - startedAt,
        extractedMemories: session.dialogue
          .filter(({ role }) => role === "user")
          .map(({ content }) => content),
      };
    },
    async search({ query }) {
      const startedAt = performance.now();
      const matches = await vector.search(query, 10);
      input.diagnostics.recallOperations += 1;
      return {
        durationMs: performance.now() - startedAt,
        memories: matches.map(({ text }) => text),
      };
    },
  };
}

async function generateProfile(input: {
  adapter: HaluMemProfileAdapter;
  answerModel: AISDKModelConfig;
  diagnostics: HaluMemProfileDiagnostics;
  outputPath: string;
  user: HaluMemUser;
  userName: string;
}): Promise<HaluMemGenerationResult> {
  const user = await runHaluMemProfile({
    adapter: input.adapter,
    answer: async ({ context, question }) => {
      input.diagnostics.answerOperations += 1;
      return answerHaluMemQuestion(input.answerModel, { context, question });
    },
    user: input.user,
    userName: input.userName,
  });
  await writeFile(input.outputPath, `${JSON.stringify(user)}\n`, "utf8");
  return {
    diagnostics: input.diagnostics,
    outputPath: input.outputPath,
  };
}

async function reanswerExistingGeneration(input: {
  answerModel: AISDKModelConfig;
  generation: HaluMemGenerationResult;
}): Promise<HaluMemGenerationResult> {
  const user = await readJsonlRow<HaluMemAdapterUser>(
    input.generation.outputPath,
    0,
  );
  const reanswered = await reanswerHaluMemProfile({
    answer: (question) => answerHaluMemQuestion(input.answerModel, question),
    user,
  });
  await writeFile(
    input.generation.outputPath,
    `${JSON.stringify(reanswered.user)}\n`,
    "utf8",
  );
  return {
    diagnostics: {
      ...input.generation.diagnostics,
      answerOperations: reanswered.answerOperations,
    },
    outputPath: input.generation.outputPath,
  };
}

async function answerHaluMemQuestion(
  model: AISDKModelConfig,
  input: { context: string; question: string },
): Promise<string> {
  const response = stripThinkingBlocks(await withAISDKRetries(() =>
    requestOpenAICompatibleText({
      model,
      prompt: buildHaluMemAnswerPrompt(input),
      system: HALUMEM_ANSWER_SYSTEM_PROMPT,
      timeoutMs: 120_000,
    })
  ));
  if (!response) {
    throw new Error("HaluMem answer model returned an empty response.");
  }
  return response;
}

export function buildHaluMemAnswerPrompt(input: {
  context: string;
  question: string;
}): string {
  const applicationQuestion = /\bhow\s+(?:can|could|might|would)\b/iu.test(
    input.question,
  );
  return [
    `Memory context:\n${input.context || "(none)"}`,
    `Question:\n${input.question}`,
    ...(applicationQuestion
      ? [HALUMEM_APPLICATION_ANSWER_REQUIREMENT]
      : []),
  ].join("\n\n");
}

export function buildHaluMemUpdateProjectionPrompt(input: {
  candidateUpdate: string;
  memories: readonly string[];
}): string {
  return [
    "Numbered recalled memory lines:",
    ...input.memories.map((memory, index) => `[${index}] ${memory}`),
    "",
    `Candidate update retrieval intent (not evidence): ${input.candidateUpdate}`,
    "",
    "Return JSON with memory, evidenceIndexes, and fullySupported. Set fullySupported to true only when every candidate clause is entailed by the cited lines. The memory must be fully entailed by the cited lines.",
  ].join("\n");
}

export function resolveHaluMemProjectedUpdate(input: {
  candidateUpdate: string;
  fullySupported: boolean;
  memory: string;
}): string {
  return input.fullySupported ? input.candidateUpdate : input.memory;
}

async function projectHaluMemUpdate(
  model: AISDKModelConfig,
  input: { candidateUpdate: string; memories: readonly string[] },
): Promise<string> {
  const projected = await withAISDKRetries(() =>
    requestOpenAICompatibleObject({
      model,
      prompt: buildHaluMemUpdateProjectionPrompt(input),
      schema: haluMemUpdateProjectionSchema,
      system: HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT,
      timeoutMs: 120_000,
    })
  );
  if (projected.evidenceIndexes.some((index) => index >= input.memories.length)) {
    throw new Error("HaluMem update projection cited an unknown memory line.");
  }
  return resolveHaluMemProjectedUpdate({
    candidateUpdate: input.candidateUpdate,
    fullySupported: projected.fullySupported,
    memory: projected.memory.trim(),
  });
}

async function loadExistingGeneration(input: {
  config: Phase72HaluMemLiveConfig;
  datasetSha256: string;
  expectedAnswerPromptSha256?: string;
  goodmemoryOutputPath: string;
  reportPath: string;
  runId: string;
  selectedUser: HaluMemUser;
  sessionIndexes: number[];
  vectorOutputPath: string;
}): Promise<{
  goodmemory: HaluMemGenerationResult;
  vector: HaluMemGenerationResult;
}> {
  const report = readObject(
    JSON.parse(await readFile(input.reportPath, "utf8")) as unknown,
    "generation report",
  );
  const dataset = readObject(report.dataset, "generation report dataset");
  const selection = readObject(report.selection, "generation report selection");
  const model = readObject(report.model, "generation report model");
  const answer = readObject(model.answer, "generation report answer model");
  const embedding = readObject(
    model.embedding,
    "generation report embedding model",
  );
  const extraction = readObject(
    model.extraction,
    "generation report extraction model",
  );
  const updateProjection = readObject(
    model.updateProjection,
    "generation report update projection model",
  );
  if (
    report.runId !== input.runId ||
    dataset.sha256 !== input.datasetSha256 ||
    dataset.userUuid !== input.selectedUser.uuid
  ) {
    throw new Error("Existing HaluMem generation report does not match this run.");
  }
  if (
    JSON.stringify(selection.sessionIndexes) !==
    JSON.stringify(input.sessionIndexes)
  ) {
    throw new Error("Existing HaluMem generation report uses different session indexes.");
  }
  if (
    answer.model !== input.config.answer.model ||
    answer.gateway !== input.config.answer.baseURL ||
    extraction.model !== input.config.extraction.model ||
    extraction.gateway !== input.config.extraction.baseURL ||
    updateProjection.model !== input.config.updateProjection.model ||
    updateProjection.gateway !== input.config.updateProjection.baseURL
  ) {
    throw new Error("Existing HaluMem generation report uses different models.");
  }
  const expectedEmbedding = describeHaluMemEmbedding(input.config.embedding);
  if (
    embedding.model !== expectedEmbedding.model ||
    embedding.provider !== expectedEmbedding.provider ||
    embedding.gateway !== expectedEmbedding.gateway ||
    (expectedEmbedding.dimensions !== undefined &&
      embedding.dimensions !== expectedEmbedding.dimensions)
  ) {
    throw new Error(
      "Existing HaluMem generation report uses a different embedding mode or model.",
    );
  }
  if (input.expectedAnswerPromptSha256) {
    const answerPrompt = readObject(
      report.answerPrompt,
      "generation report answer prompt",
    );
    if (answerPrompt.sha256 !== input.expectedAnswerPromptSha256) {
      throw new Error("Existing HaluMem generation report uses a different answer prompt.");
    }
  }
  const updateProjectionPrompt = readObject(
    report.updateProjectionPrompt,
    "generation report update projection prompt",
  );
  if (
    updateProjectionPrompt.sha256 !==
    HALUMEM_UPDATE_PROJECTION_PROMPT_SHA256
  ) {
    throw new Error(
      "Existing HaluMem generation report uses a different update projection prompt.",
    );
  }
  const expectedStarts = input.selectedUser.sessions.map(({ start_time }) => start_time);
  if (JSON.stringify(selection.sessionStarts) !== JSON.stringify(expectedStarts)) {
    throw new Error("Existing HaluMem generation report uses a different session slice.");
  }
  const [goodmemoryUser, vectorUser] = await Promise.all([
    readJsonlRow<HaluMemAdapterUser>(input.goodmemoryOutputPath, 0),
    readJsonlRow<HaluMemAdapterUser>(input.vectorOutputPath, 0),
  ]);
  for (const profile of [goodmemoryUser, vectorUser]) {
    if (
      profile.uuid !== input.selectedUser.uuid ||
      JSON.stringify(profile.sessions.map(({ start_time }) => start_time)) !==
        JSON.stringify(expectedStarts)
    ) {
      throw new Error("Existing HaluMem raw output uses a different session slice.");
    }
  }
  const profiles = readObject(report.profiles, "generation report profiles");
  return {
    goodmemory: {
      diagnostics: readDiagnostics(
        readObject(profiles.goodmemory, "GoodMemory profile").diagnostics,
      ),
      outputPath: input.goodmemoryOutputPath,
    },
    vector: {
      diagnostics: readDiagnostics(
        readObject(profiles.vectorBaseline, "vector profile").diagnostics,
      ),
      outputPath: input.vectorOutputPath,
    },
  };
}

async function runOfficialEvaluation(input: {
  config: Phase72HaluMemLiveConfig;
  profile: "goodmemory" | "vector-baseline";
  rawOutputPath: string;
  runId: string;
  upstreamRoot: string;
}): Promise<{ normalizedTransportRequests: number; payload: unknown }> {
  const version = `${input.runId}-${input.profile}`;
  const evaluationRoot = join(input.upstreamRoot, "eval");
  const resultRoot = join(evaluationRoot, "results", `memzero-${version}`);
  const sourcePath = join(resultRoot, "memzero_eval_results.jsonl");
  const sourceHashPath = join(resultRoot, ".goodmemory-source-sha256");
  const sourceHash = await sha256File(input.rawOutputPath);
  let matchingSource = false;
  try {
    matchingSource = (await readFile(sourceHashPath, "utf8")).trim() === sourceHash;
  } catch {
    matchingSource = false;
  }
  if (!matchingSource) {
    await rm(resultRoot, { force: true, recursive: true });
    await mkdir(resultRoot, { recursive: true });
    await copyFile(input.rawOutputPath, sourcePath);
    await writeFile(sourceHashPath, `${sourceHash}\n`, "utf8");
  }
  const resultPath = join(resultRoot, "memzero_eval_stat_result.json");
  let normalizedTransportRequests = 0;
  if (!matchingSource || !(await fileExists(resultPath))) {
    const proxy = startHaluMemJudgeProxy(input.config.judge);
    const judgeEnv = { ...process.env };
    delete judgeEnv.OPENAI_TEMPERATURE;
    Object.assign(judgeEnv, {
      OPENAI_API_KEY: input.config.judge.apiKey,
      OPENAI_BASE_URL: proxy.baseURL,
      OPENAI_MODEL: input.config.judge.model,
      OPENAI_TIMEOUT: "120",
      RETRY_TIMES: "3",
      WAIT_TIME_LOWER: "2",
      WAIT_TIME_UPPER: "20",
    });
    try {
      const child = Bun.spawn({
        cmd: [
          "python3",
          "-c",
          `from evaluation import main; main("memzero", "${version}", 1, 2)`,
        ],
        cwd: evaluationRoot,
        env: judgeEnv,
        stderr: "inherit",
        stdout: "inherit",
      });
      if (await child.exited !== 0) {
        throw new Error(`HaluMem official evaluator failed for ${input.profile}.`);
      }
    } finally {
      normalizedTransportRequests = proxy.requestCount();
      proxy.stop();
    }
  }
  return {
    normalizedTransportRequests,
    payload: JSON.parse(await readFile(resultPath, "utf8")) as unknown,
  };
}

function startHaluMemJudgeProxy(model: AISDKModelConfig): {
  baseURL: string;
  requestCount(): number;
  stop(): void;
} {
  let requests = 0;
  const upstream = `${model.baseURL!.replace(/\/$/u, "")}/chat/completions`;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
        return new Response("Not found.\n", { status: 404 });
      }
      requests += 1;
      const response = await fetch(upstream, {
        body: await request.arrayBuffer(),
        headers: {
          authorization: `Bearer ${model.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.text();
      if (!response.ok) {
        console.error("[phase-72:halumem] judge gateway request failed", {
          requestNumber: requests,
          status: response.status,
        });
        return new Response(body, {
          headers: { "content-type": response.headers.get("content-type") ?? "text/plain" },
          status: response.status,
        });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        return new Response(body, {
          headers: { "content-type": "text/plain" },
          status: 502,
        });
      }
      normalizeOpenAIChatPayload(payload);
      return Response.json(payload);
    },
  });
  return {
    baseURL: `http://127.0.0.1:${server.port}/v1`,
    requestCount: () => requests,
    stop: () => server.stop(true),
  };
}

function normalizeOpenAIChatPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object" || !("choices" in payload)) {
    return;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return;
  }
  for (const choice of choices) {
    if (!choice || typeof choice !== "object" || !("message" in choice)) {
      continue;
    }
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object" || !("content" in message)) {
      continue;
    }
    const record = message as { content?: unknown };
    if (typeof record.content === "string") {
      record.content = normalizeHaluMemJudgeContent(record.content);
    }
  }
}

function collectExportEntries(exported: ExportMemoryResult): Map<string, string> {
  const entries = new Map<string, string>();
  collectProfileEntries(entries, exported.durable.profile);
  for (const memory of exported.durable.preferences) {
    addEntry(entries, `preference:${memory.id}`, `User ${memory.category}: ${stringValue(memory.value)}`);
  }
  for (const memory of exported.durable.facts) {
    addEntry(entries, `fact:${memory.id}`, memory.content);
  }
  for (const memory of exported.durable.feedback) {
    addEntry(entries, `feedback:${memory.id}`, memory.rule);
  }
  for (const memory of exported.durable.references) {
    addEntry(entries, `reference:${memory.id}`, `${memory.title}: ${memory.description ?? memory.pointer}`);
  }
  for (const evidence of exported.durable.evidence) {
    if (evidence.kind === "conversation_excerpt") {
      addEntry(entries, `evidence:${evidence.excerpt}`, evidence.excerpt);
    }
  }
  return entries;
}

function collectRecallTexts(recall: RecallResult): string[] {
  const profileEntries = new Map<string, string>();
  collectProfileEntries(profileEntries, recall.profile);
  const texts = [...profileEntries.values()];
  texts.push(
    ...recall.preferences.map((memory) => `User ${memory.category}: ${stringValue(memory.value)}`),
    ...recall.facts.map((memory) => memory.content),
    ...recall.feedback.map((memory) => memory.rule),
    ...recall.references.map((memory) => `${memory.title}: ${memory.description ?? memory.pointer}`),
    ...recall.episodes.map((memory) => memory.summary),
    ...recall.evidence.map((record) => record.excerpt),
  );
  return [...new Set(texts.filter((text) => text.trim().length > 0))];
}

function collectProfileEntries(
  entries: Map<string, string>,
  profile: UserProfile | null,
): void {
  if (!profile) {
    return;
  }
  for (const [field, value] of Object.entries(profile.identity)) {
    addEntry(entries, `profile:identity:${field}`, `User ${field}: ${value}`);
  }
  for (const [field, values] of Object.entries(profile.expertise)) {
    if (Array.isArray(values)) {
      for (const [index, value] of values.entries()) {
        addEntry(entries, `profile:expertise:${field}:${index}`, `User ${field}: ${value}`);
      }
    } else {
      addEntry(entries, `profile:expertise:${field}`, `User ${field}: ${values}`);
    }
  }
  for (const [field, values] of Object.entries(profile.activeContext)) {
    for (const [index, value] of values.entries()) {
      addEntry(entries, `profile:context:${field}:${index}`, `User ${field}: ${value}`);
    }
  }
}

function addEntry(entries: Map<string, string>, key: string, value: string): void {
  const normalized = value.trim();
  if (normalized) {
    entries.set(key, normalized);
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function createDiagnostics(): HaluMemProfileDiagnostics {
  return {
    answerOperations: 0,
    recallOperations: 0,
    rememberOperations: 0,
    updateProjectionOperations: 0,
    warnings: [],
  };
}

function readDiagnostics(value: unknown): HaluMemProfileDiagnostics {
  const diagnostics = readObject(value, "profile diagnostics");
  const warnings = Array.isArray(diagnostics.warnings) &&
      diagnostics.warnings.every((warning) => typeof warning === "string")
    ? diagnostics.warnings
    : undefined;
  if (
    typeof diagnostics.answerOperations !== "number" ||
    typeof diagnostics.recallOperations !== "number" ||
    typeof diagnostics.rememberOperations !== "number" ||
    !warnings
  ) {
    throw new Error("Existing HaluMem generation report has invalid diagnostics.");
  }
  return {
    answerOperations: diagnostics.answerOperations,
    recallOperations: diagnostics.recallOperations,
    rememberOperations: diagnostics.rememberOperations,
    updateProjectionOperations:
      typeof diagnostics.updateProjectionOperations === "number"
        ? diagnostics.updateProjectionOperations
        : 0,
    warnings,
  };
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Existing HaluMem ${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function toOpenAIProviderConfig(model: AISDKModelConfig) {
  if (model.provider !== "openai") {
    throw new Error("Phase 72 HaluMem providers must be OpenAI-compatible.");
  }
  if (!model.apiKey) {
    throw new Error("Phase 72 HaluMem provider API key is required.");
  }
  return {
    apiKey: model.apiKey,
    ...(model.baseURL ? { baseURL: model.baseURL } : {}),
    model: model.model,
    provider: "openai" as const,
  };
}

function publicModel(model: AISDKModelConfig, role: string) {
  return {
    gateway: model.baseURL ?? null,
    model: model.model,
    provider: model.provider,
    role,
  };
}

export function describeHaluMemEmbedding(
  embedding: Phase72HaluMemLiveConfig["embedding"],
) {
  if (embedding.mode === "provider") {
    return {
      ...publicModel(embedding.model, "embedding"),
      appliedTo: ["goodmemory", "vector-baseline"],
      dimensions: undefined,
      mode: "provider",
    };
  }
  return {
    appliedTo: ["vector-baseline"],
    dimensions: embedding.dimensions,
    gateway: null,
    mode: "local",
    model: embedding.model,
    provider: "local",
    role: "hashed-lexical-vector-baseline",
  };
}

async function assertPinnedUpstream(upstreamRoot: string): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: upstreamRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  if (
    exitCode !== 0 ||
    stdout.trim() !== PHASE72_UPSTREAMS.halumem.codeCommit
  ) {
    throw new Error("HaluMem upstream root does not match the pinned Phase 72 commit.");
  }
}

async function readJsonlRow<T>(path: string, targetIndex: number): Promise<T> {
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(path, { encoding: "utf8" }),
  });
  let index = 0;
  for await (const line of lines) {
    if (index === targetIndex) {
      return JSON.parse(line) as T;
    }
    index += 1;
  }
  throw new Error(`HaluMem user index ${targetIndex} is outside the dataset.`);
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  const report = await runPhase72HaluMem(
    parsePhase72HaluMemOptions(Bun.argv),
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "failed") {
    process.exitCode = 1;
  }
}

function parseSessionIndexes(value: string | undefined): number[] {
  if (value === undefined) {
    return [...DEFAULT_SESSION_INDEXES];
  }
  const indexes = value.split(",").map((part) =>
    parseNonNegativeInteger(part, "--session-indexes")
  );
  if (new Set(indexes).size !== indexes.length) {
    throw new Error("--session-indexes cannot contain duplicates.");
  }
  return indexes;
}

function parseHaluMemEmbeddingMode(value: string): HaluMemEmbeddingMode {
  if (value === "provider" || value === "local") {
    return value;
  }
  throw new Error("--embedding-mode must be provider or local.");
}

function parseNonNegativeInteger(value: string, flag: string): number {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new Error(`${flag} must contain non-negative integers.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} must contain non-negative integers.`);
  }
  return parsed;
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = resolveEnvValueStrict(env, name);
  if (!value) {
    throw new Error(`${name} is required for the Phase 72 HaluMem runner.`);
  }
  return value;
}
