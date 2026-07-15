import type { RecallRouterAssistant } from "../recall/assistant";
import type { Reranker } from "../recall/reranker";
import type {
  MemoryExtractionContext,
  MemoryExtractionInput,
  MemoryExtractor,
} from "../remember/candidates";
import type { EmbeddingAdapter } from "../embedding/contracts";
import type { AISDKModelConfig } from "./ai-sdk-runtime";
import { createAISDKEmbeddingAdapter } from "./ai-sdk-runtime";
import {
  buildConversationalMemoryExtractionPrompt,
  CONVERSATIONAL_MEMORY_EXTRACTION_SYSTEM_PROMPT,
  createLLMMemoryExtractor,
} from "./memory-extractor";
import { createLLMRecallRouter } from "./recall-router";
import {
  createLLMListwiseReranker,
  createLLMPointwiseReranker,
} from "./reranker";
import type {
  ListwiseRerankerDependencies,
  PointwiseRerankerDependencies,
} from "./reranker";
import type {
  ModelProviderId,
  ProviderRuntimeMetadata,
  RuntimeTargetDescriptor,
} from "./contracts";

interface ProviderMemoryExtractorFactory {
  (input: {
    dependencies?: ProviderRequestDependencies;
    model: AISDKModelConfig;
    promptBuilder?: (
      input: MemoryExtractionInput,
      context?: MemoryExtractionContext,
    ) => string;
    system?: string;
  }): MemoryExtractor;
}

interface ProviderEmbeddingAdapterFactory {
  (input: {
    dependencies?: ProviderRequestDependencies;
    model: AISDKModelConfig;
  }): EmbeddingAdapter;
}

interface ProviderRecallRouterFactory {
  (input: {
    dependencies?: ProviderRequestDependencies;
    model: AISDKModelConfig;
    planSystem?: string;
    rerankSystem?: string;
  }): RecallRouterAssistant;
}

interface ProviderRerankerFactory {
  (input: {
    dependencies?: PointwiseRerankerDependencies;
    model: AISDKModelConfig;
  }): Reranker;
}

interface ProviderListwiseRerankerFactory {
  (input: {
    dependencies?: ListwiseRerankerDependencies;
    model: AISDKModelConfig;
  }): Reranker;
}

const DEFAULT_PROVIDER_RERANKER_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_PROVIDER_LISTWISE_RERANKER_REQUEST_TIMEOUT_MS = 60_000;

export interface ProviderRequestDependencies {
  requestTimeoutMs?: number;
}

export interface ModelProviderDescriptorInput {
  providerId: ModelProviderId;
  modelId: string;
}

export function createFallbackAdapterDescriptor(): RuntimeTargetDescriptor {
  return {
    adapterId: "fallback",
    mode: "fallback",
  };
}

export function createLiveAdapterDescriptor(
  config: ModelProviderDescriptorInput,
): RuntimeTargetDescriptor {
  return {
    adapterId: "live-adapter",
    mode: "live",
    providerId: config.providerId,
    modelId: config.modelId,
  };
}

export function createProviderRuntimeMetadata(input: {
  generation: RuntimeTargetDescriptor;
  judge: RuntimeTargetDescriptor;
}): ProviderRuntimeMetadata {
  return {
    generationMode: input.generation.mode,
    generationAdapter: input.generation.adapterId,
    judgeMode: input.judge.mode,
    judgeAdapter: input.judge.adapterId,
    ...(input.generation.providerId
      ? { generationProviderId: input.generation.providerId }
      : {}),
    ...(input.generation.modelId ? { generationModelId: input.generation.modelId } : {}),
    ...(input.judge.providerId ? { judgeProviderId: input.judge.providerId } : {}),
    ...(input.judge.modelId ? { judgeModelId: input.judge.modelId } : {}),
  };
}

export function normalizeProviderRuntimeMetadata(
  input: ProviderRuntimeMetadata,
): ProviderRuntimeMetadata {
  return {
    ...input,
    generationAdapter:
      input.generationAdapter ??
      (input.generationMode === "live" ? "live-adapter" : "fallback"),
    judgeAdapter:
      input.judgeAdapter ??
      (input.judgeMode === "live" ? "live-adapter" : "fallback"),
  };
}

export function createProviderMemoryExtractor(input: {
  model: AISDKModelConfig;
  promptBuilder?: (
    input: MemoryExtractionInput,
    context?: MemoryExtractionContext,
  ) => string;
  system?: string;
  createMemoryExtractor?: ProviderMemoryExtractorFactory;
  requestTimeoutMs?: number;
}): MemoryExtractor {
  return (input.createMemoryExtractor ?? createLLMMemoryExtractor)({
    dependencies: buildProviderRequestDependencies(input.requestTimeoutMs),
    model: input.model,
    promptBuilder: input.promptBuilder,
    system: input.system,
  });
}

// Opt-in conversational atomic-fact extractor: same provider wiring as
// createProviderMemoryExtractor, but prompts the model to decompose dialogue
// into self-contained, coreference-resolved, entity/date-normalized atomic
// claims. Inject the result as `adapters.assistedExtractor` to improve recall
// on conversational corpora (the LoCoMo phrasing-gap lever) without an embedding
// endpoint. Default extraction is unchanged unless this is injected.
export function createProviderConversationalMemoryExtractor(input: {
  model: AISDKModelConfig;
  // Opt-in: prefix each extracted fact with a brief situating context (the
  // embedding-free Contextual Retrieval lever) to fight question-to-dialogue
  // vocabulary mismatch. Off by default.
  contextualDescriptor?: boolean;
  createMemoryExtractor?: ProviderMemoryExtractorFactory;
  requestTimeoutMs?: number;
}): MemoryExtractor {
  return createProviderMemoryExtractor({
    model: input.model,
    promptBuilder: (payload, context) =>
      buildConversationalMemoryExtractionPrompt(payload, {
        contextualDescriptor: input.contextualDescriptor,
        knownUserName: context?.knownUserName,
      }),
    system: CONVERSATIONAL_MEMORY_EXTRACTION_SYSTEM_PROMPT,
    createMemoryExtractor: input.createMemoryExtractor,
    requestTimeoutMs: input.requestTimeoutMs,
  });
}

export function createProviderEmbeddingAdapter(input: {
  model: AISDKModelConfig;
  createEmbeddingAdapter?: ProviderEmbeddingAdapterFactory;
  requestTimeoutMs?: number;
}): EmbeddingAdapter {
  return (input.createEmbeddingAdapter ?? createAISDKEmbeddingAdapter)({
    dependencies: buildProviderRequestDependencies(input.requestTimeoutMs),
    model: input.model,
  });
}

export function createProviderRecallRouter(input: {
  model: AISDKModelConfig;
  createRecallRouter?: ProviderRecallRouterFactory;
  planSystem?: string;
  requestTimeoutMs?: number;
  rerankSystem?: string;
}): RecallRouterAssistant {
  return (input.createRecallRouter ?? createLLMRecallRouter)({
    dependencies: buildProviderRequestDependencies(input.requestTimeoutMs),
    model: input.model,
    planSystem: input.planSystem,
    rerankSystem: input.rerankSystem,
  });
}

export function createProviderPointwiseReranker(input: {
  createReranker?: ProviderRerankerFactory;
  maxConcurrency?: number;
  model: AISDKModelConfig;
  requestTimeoutMs?: number;
  retryLimit?: number;
}): Reranker {
  const requestTimeoutMs =
    input.requestTimeoutMs ?? DEFAULT_PROVIDER_RERANKER_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("Provider reranker requestTimeoutMs must be a positive integer.");
  }
  if (
    input.maxConcurrency !== undefined &&
    (!Number.isSafeInteger(input.maxConcurrency) || input.maxConcurrency <= 0)
  ) {
    throw new Error("Provider reranker maxConcurrency must be a positive integer.");
  }
  if (
    input.retryLimit !== undefined &&
    (!Number.isSafeInteger(input.retryLimit) || input.retryLimit <= 0)
  ) {
    throw new Error("Provider reranker retryLimit must be a positive integer.");
  }
  return (input.createReranker ?? createLLMPointwiseReranker)({
    dependencies: {
      ...(input.maxConcurrency === undefined
        ? {}
        : { maxConcurrency: input.maxConcurrency }),
      requestTimeoutMs,
      retryOptions: { retryLimit: input.retryLimit ?? 1 },
    },
    model: input.model,
  });
}

export function createProviderListwiseReranker(input: {
  createReranker?: ProviderListwiseRerankerFactory;
  maxConcurrency?: number;
  model: AISDKModelConfig;
  requestTimeoutMs?: number;
  retryLimit?: number;
}): Reranker {
  const requestTimeoutMs =
    input.requestTimeoutMs ??
    DEFAULT_PROVIDER_LISTWISE_RERANKER_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("Provider reranker requestTimeoutMs must be a positive integer.");
  }
  if (
    input.maxConcurrency !== undefined &&
    (!Number.isSafeInteger(input.maxConcurrency) || input.maxConcurrency <= 0)
  ) {
    throw new Error("Provider reranker maxConcurrency must be a positive integer.");
  }
  if (
    input.retryLimit !== undefined &&
    (!Number.isSafeInteger(input.retryLimit) || input.retryLimit <= 0)
  ) {
    throw new Error("Provider reranker retryLimit must be a positive integer.");
  }
  return (input.createReranker ?? createLLMListwiseReranker)({
    dependencies: {
      ...(input.maxConcurrency === undefined
        ? {}
        : { maxConcurrency: input.maxConcurrency }),
      requestTimeoutMs,
      retryOptions: { retryLimit: input.retryLimit ?? 3 },
    },
    model: input.model,
  });
}

export function buildProviderRequestDependencies(
  requestTimeoutMs: number | undefined,
): ProviderRequestDependencies | undefined {
  return requestTimeoutMs === undefined ? undefined : { requestTimeoutMs };
}
