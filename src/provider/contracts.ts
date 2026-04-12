import type { ModelProviderId } from "./model-provider";

export type RuntimeAdapterId = "fallback" | "live-adapter";
export type ProviderExecutionMode = "fallback" | "live";
export type { ModelProviderId } from "./model-provider";

export interface RuntimeTargetDescriptor {
  adapterId: RuntimeAdapterId;
  mode: ProviderExecutionMode;
  modelId?: string;
  providerId?: ModelProviderId;
}

export interface ProviderRuntimeMetadata {
  generationMode: ProviderExecutionMode;
  generationAdapter?: RuntimeAdapterId;
  generationModelId?: string;
  generationProviderId?: ModelProviderId;
  judgeMode: ProviderExecutionMode;
  judgeAdapter?: RuntimeAdapterId;
  judgeModelId?: string;
  judgeProviderId?: ModelProviderId;
  memoryBackend?: "in-memory" | "provider-backed";
  embeddingEnabled?: boolean;
  assistedExtractionEnabled?: boolean;
}
