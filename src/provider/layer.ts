import type { RecallRouterAssistant } from "../recall/assistant";
import type {
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
import type {
  ModelProviderId,
  ProviderRuntimeMetadata,
  RuntimeTargetDescriptor,
} from "./contracts";

interface ProviderMemoryExtractorFactory {
  (input: {
    dependencies?: ProviderRequestDependencies;
    model: AISDKModelConfig;
    promptBuilder?: (input: MemoryExtractionInput) => string;
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
  promptBuilder?: (input: MemoryExtractionInput) => string;
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
  createMemoryExtractor?: ProviderMemoryExtractorFactory;
  requestTimeoutMs?: number;
}): MemoryExtractor {
  return createProviderMemoryExtractor({
    model: input.model,
    promptBuilder: buildConversationalMemoryExtractionPrompt,
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

export function buildProviderRequestDependencies(
  requestTimeoutMs: number | undefined,
): ProviderRequestDependencies | undefined {
  return requestTimeoutMs === undefined ? undefined : { requestTimeoutMs };
}
