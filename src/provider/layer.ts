import {
  createEvalAnswerGenerator,
} from "../eval/answer-generator";
import {
  createEvalJudgeModel,
} from "../eval/judge-model";
import type { JudgeModel } from "../eval/judge";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "../eval/runners";
import type { MemoryExtractor } from "../remember/candidates";
import type { EmbeddingAdapter } from "../embedding/contracts";
import type { AISDKModelConfig } from "./ai-sdk-runtime";
import { createAISDKEmbeddingAdapter } from "./ai-sdk-runtime";
import { createLLMMemoryExtractor } from "./memory-extractor";
import type {
  ModelProviderId,
  ProviderRuntimeMetadata,
  RuntimeTargetDescriptor,
} from "./contracts";

interface ProviderTextGeneratorFactory {
  (input: {
    model: AISDKModelConfig;
    system?: string;
    promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  }): EvalAnswerGenerator;
}

interface ProviderJudgeModelFactory {
  (input: {
    model: AISDKModelConfig;
    system?: string;
  }): JudgeModel;
}

interface ProviderMemoryExtractorFactory {
  (input: {
    model: AISDKModelConfig;
    system?: string;
  }): MemoryExtractor;
}

interface ProviderEmbeddingAdapterFactory {
  (input: {
    model: AISDKModelConfig;
  }): EmbeddingAdapter;
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

export function createProviderTextGenerator(input: {
  model: AISDKModelConfig;
  system?: string;
  promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  createTextGenerator?: ProviderTextGeneratorFactory;
}): EvalAnswerGenerator {
  return (input.createTextGenerator ?? createEvalAnswerGenerator)({
    model: input.model,
    system: input.system,
    promptBuilder: input.promptBuilder,
  });
}

export function createProviderJudgeModel(input: {
  model: AISDKModelConfig;
  system?: string;
  createJudgeModel?: ProviderJudgeModelFactory;
}): JudgeModel {
  return (input.createJudgeModel ?? createEvalJudgeModel)({
    model: input.model,
    system: input.system,
  });
}

export function createProviderMemoryExtractor(input: {
  model: AISDKModelConfig;
  system?: string;
  createMemoryExtractor?: ProviderMemoryExtractorFactory;
}): MemoryExtractor {
  return (input.createMemoryExtractor ?? createLLMMemoryExtractor)({
    model: input.model,
    system: input.system,
  });
}

export function createProviderEmbeddingAdapter(input: {
  model: AISDKModelConfig;
  createEmbeddingAdapter?: ProviderEmbeddingAdapterFactory;
}): EmbeddingAdapter {
  return (input.createEmbeddingAdapter ?? createAISDKEmbeddingAdapter)({
    model: input.model,
  });
}
