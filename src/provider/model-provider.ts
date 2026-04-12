export const MODEL_PROVIDER_IDS = ["openai", "anthropic"] as const;

export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export function isModelProviderId(value: string): value is ModelProviderId {
  return MODEL_PROVIDER_IDS.includes(value as ModelProviderId);
}
