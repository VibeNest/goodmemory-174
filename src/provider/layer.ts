import type { JudgeModel } from "../eval/judge";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "../eval/runners";
import type { MemoryExtractor } from "../remember/candidates";
import {
  createAISDKEmbeddingAdapter,
  createAISDKJudgeModel,
  createAISDKMemoryExtractor,
  createAISDKTextGenerator,
} from "../llm/ai-sdk";
import type {
  AISDKModelConfig,
  AISDKProvider,
} from "../llm/ai-sdk";
import type { EmbeddingAdapter } from "../embedding/contracts";

export type ProviderLayerName = "fallback" | "vercel-ai-sdk";
export type ProviderExecutionMode = "fallback" | "live";

export interface ProviderTargetDescriptor {
  layer: ProviderLayerName;
  mode: ProviderExecutionMode;
  provider?: AISDKProvider;
  model?: string;
}

export function createFallbackProviderDescriptor(): ProviderTargetDescriptor {
  return {
    layer: "fallback",
    mode: "fallback",
  };
}

export function createAISDKProviderDescriptor(
  config: AISDKModelConfig,
): ProviderTargetDescriptor {
  return {
    layer: "vercel-ai-sdk",
    mode: "live",
    provider: config.provider,
    model: config.model,
  };
}

export function createProviderRuntimeMetadata(input: {
  generation: ProviderTargetDescriptor;
  judge: ProviderTargetDescriptor;
}) {
  return {
    generationMode: input.generation.mode,
    generationLayer: input.generation.layer,
    judgeMode: input.judge.mode,
    judgeLayer: input.judge.layer,
    ...(input.generation.provider
      ? { generationProvider: input.generation.provider }
      : {}),
    ...(input.generation.model ? { generationModel: input.generation.model } : {}),
    ...(input.judge.provider ? { judgeProvider: input.judge.provider } : {}),
    ...(input.judge.model ? { judgeModel: input.judge.model } : {}),
  };
}

export function normalizeProviderRuntimeMetadata(input: {
  generationMode: ProviderExecutionMode;
  generationLayer?: ProviderLayerName;
  generationModel?: string;
  generationProvider?: AISDKProvider;
  judgeMode: ProviderExecutionMode;
  judgeLayer?: ProviderLayerName;
  judgeModel?: string;
  judgeProvider?: AISDKProvider;
}) {
  return {
    ...input,
    generationLayer:
      input.generationLayer ??
      (input.generationMode === "live" ? "vercel-ai-sdk" : "fallback"),
    judgeLayer:
      input.judgeLayer ??
      (input.judgeMode === "live" ? "vercel-ai-sdk" : "fallback"),
  };
}

export function createProviderTextGenerator(input: {
  model: AISDKModelConfig;
  system?: string;
  promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  createTextGenerator?: typeof createAISDKTextGenerator;
}): EvalAnswerGenerator {
  return (input.createTextGenerator ?? createAISDKTextGenerator)({
    model: input.model,
    system: input.system,
    promptBuilder: input.promptBuilder,
  });
}

export function createProviderJudgeModel(input: {
  model: AISDKModelConfig;
  system?: string;
  createJudgeModel?: typeof createAISDKJudgeModel;
}): JudgeModel {
  return (input.createJudgeModel ?? createAISDKJudgeModel)({
    model: input.model,
    system: input.system,
  });
}

export function createProviderMemoryExtractor(input: {
  model: AISDKModelConfig;
  system?: string;
  createMemoryExtractor?: typeof createAISDKMemoryExtractor;
}): MemoryExtractor {
  return (input.createMemoryExtractor ?? createAISDKMemoryExtractor)({
    model: input.model,
    system: input.system,
  });
}

export function createProviderEmbeddingAdapter(input: {
  model: AISDKModelConfig;
  createEmbeddingAdapter?: typeof createAISDKEmbeddingAdapter;
}): EmbeddingAdapter {
  return (input.createEmbeddingAdapter ?? createAISDKEmbeddingAdapter)({
    model: input.model,
  });
}
