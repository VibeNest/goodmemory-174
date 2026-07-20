export type ModelUsageOperation =
  | "answer_generation"
  | "assisted_extraction"
  | "embedding"
  | "judge"
  | "recall_plan"
  | "recall_router_plan"
  | "recall_router_rerank"
  | "reranker_listwise"
  | "reranker_pointwise";

export type ModelUsageCompleteness = "complete" | "missing" | "partial";

export interface ModelTokenUsage {
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  uncachedInputTokens: number | null;
}

export interface ModelUsageAttempt {
  attempt: number;
  completeness: ModelUsageCompleteness;
  modelId: string;
  operation: ModelUsageOperation;
  outcome: "failed" | "succeeded";
  providerId: string;
  schemaVersion: 1;
  usage: ModelTokenUsage;
}

export interface ModelUsageSink {
  emit(event: ModelUsageAttempt): void;
  strict?: boolean;
}

interface AISDKLanguageModelUsageLike {
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    noCacheTokens?: number;
  };
  inputTokens?: number;
  outputTokens?: number;
}

interface AISDKEmbeddingUsageLike {
  tokens?: number;
}

const MISSING_MODEL_TOKEN_USAGE: ModelTokenUsage = {
  cacheCreationInputTokens: null,
  cacheReadInputTokens: null,
  inputTokens: null,
  outputTokens: null,
  uncachedInputTokens: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function firstTokenCount(...values: unknown[]): number | null {
  for (const value of values) {
    const count = tokenCount(value);
    if (count !== null) {
      return count;
    }
  }
  return null;
}

function addTokenCounts(
  base: number | null,
  ...additional: Array<number | null>
): number | null {
  if (base === null) {
    return null;
  }
  return tokenCount(
    base + additional.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    ),
  );
}

function subtractTokenCounts(
  total: number | null,
  ...breakdown: Array<number | null>
): number | null {
  if (total === null) {
    return null;
  }
  return tokenCount(
    total - breakdown.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    ),
  );
}

export function normalizeAISDKLanguageModelUsage(
  usage: AISDKLanguageModelUsageLike | undefined,
): ModelTokenUsage {
  return {
    cacheCreationInputTokens: tokenCount(
      usage?.inputTokenDetails?.cacheWriteTokens,
    ),
    cacheReadInputTokens: tokenCount(
      usage?.inputTokenDetails?.cacheReadTokens,
    ),
    inputTokens: tokenCount(usage?.inputTokens),
    outputTokens: tokenCount(usage?.outputTokens),
    uncachedInputTokens: tokenCount(
      usage?.inputTokenDetails?.noCacheTokens,
    ),
  };
}

export function normalizeAISDKEmbeddingUsage(
  usage: AISDKEmbeddingUsageLike | undefined,
): ModelTokenUsage {
  const inputTokens = tokenCount(usage?.tokens);
  return {
    cacheCreationInputTokens: inputTokens === null ? null : 0,
    cacheReadInputTokens: inputTokens === null ? null : 0,
    inputTokens,
    outputTokens: inputTokens === null ? null : 0,
    uncachedInputTokens: inputTokens,
  };
}

export function normalizeOpenAICompatibleUsage(
  payload: unknown,
): ModelTokenUsage {
  const root = asRecord(payload);
  const usage = asRecord(root?.usage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const inputDetails = asRecord(usage?.input_tokens_details);
  const promptTokens = tokenCount(usage?.prompt_tokens);
  const rawInputTokens = tokenCount(usage?.input_tokens);
  const topLevelCacheCreation = tokenCount(
    usage?.cache_creation_input_tokens,
  );
  const topLevelCacheRead = tokenCount(usage?.cache_read_input_tokens);
  const inputDetailCacheCreation = tokenCount(inputDetails?.cache_write_tokens);
  const inputDetailCacheRead = tokenCount(inputDetails?.cache_read_tokens);
  const cacheCreationInputTokens = firstTokenCount(
    topLevelCacheCreation,
    promptDetails?.cache_creation_tokens,
    inputDetailCacheCreation,
  );
  const cacheReadInputTokens = firstTokenCount(
    topLevelCacheRead,
    promptDetails?.cached_tokens,
    inputDetailCacheRead,
    inputDetails?.cached_tokens,
  );
  const inputTokensAreUncached = promptTokens === null && (
    topLevelCacheCreation !== null ||
    topLevelCacheRead !== null ||
    inputDetailCacheCreation !== null ||
    inputDetailCacheRead !== null
  );
  const inputTokens = promptTokens ?? (
    inputTokensAreUncached
      ? addTokenCounts(
          rawInputTokens,
          cacheCreationInputTokens,
          cacheReadInputTokens,
        )
      : rawInputTokens
  );
  const uncachedInputTokens = inputTokensAreUncached
    ? rawInputTokens
    : subtractTokenCounts(
        inputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
      );

  return {
    cacheCreationInputTokens,
    cacheReadInputTokens,
    inputTokens,
    outputTokens: firstTokenCount(
      usage?.completion_tokens,
      usage?.output_tokens,
    ),
    uncachedInputTokens,
  };
}

export function modelUsageCompleteness(
  usage: ModelTokenUsage,
): ModelUsageCompleteness {
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    return "complete";
  }
  if (usage.inputTokens === null && usage.outputTokens === null) {
    return "missing";
  }
  return "partial";
}

export function modelTokenTotal(usage: ModelTokenUsage): number | null {
  if (usage.inputTokens === null || usage.outputTokens === null) {
    return null;
  }
  return usage.inputTokens + usage.outputTokens;
}

function emitUsage(
  sink: ModelUsageSink | undefined,
  event: ModelUsageAttempt,
): void {
  if (!sink) {
    return;
  }
  try {
    sink.emit(event);
  } catch (error) {
    if (sink.strict) {
      throw error;
    }
    console.error(
      "[goodmemory:model-usage] sink failed",
      error instanceof Error ? error.name : typeof error,
    );
  }
}

export async function runWithModelUsageAttempt<T>(input: {
  attempt: number;
  modelId: string;
  operation: ModelUsageOperation;
  providerId: string;
  run(report: (usage: ModelTokenUsage) => void): Promise<T>;
  sink?: ModelUsageSink;
}): Promise<T> {
  let reportedUsage: ModelTokenUsage | undefined;
  const report = (usage: ModelTokenUsage) => {
    if (reportedUsage) {
      return;
    }
    reportedUsage = usage;
  };
  const emitOutcome = (outcome: ModelUsageAttempt["outcome"]) => {
    const usage = reportedUsage ?? { ...MISSING_MODEL_TOKEN_USAGE };
    emitUsage(input.sink, {
      attempt: input.attempt,
      completeness: modelUsageCompleteness(usage),
      modelId: input.modelId,
      operation: input.operation,
      outcome,
      providerId: input.providerId,
      schemaVersion: 1,
      usage,
    });
  };

  let result: T;
  try {
    result = await input.run(report);
  } catch (error) {
    emitOutcome("failed");
    throw error;
  }
  emitOutcome("succeeded");
  return result;
}
