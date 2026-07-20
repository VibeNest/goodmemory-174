import { generateText } from "ai";

import {
  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
  requestOpenAICompatibleText,
  requestOpenAICompatibleTextResult,
  resolveAISDKModel,
  stripThinkingBlocks,
  withAISDKRetries,
} from "../provider/ai-sdk-runtime";
import type {
  AISDKModelConfig,
  AISDKRetryOptions,
  FetchLike,
} from "../provider/ai-sdk-runtime";
import {
  normalizeAISDKLanguageModelUsage,
  runWithModelUsageAttempt,
} from "../provider/model-usage";
import type { ModelUsageSink } from "../provider/model-usage";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "./runners";

interface TextGeneratorDependencies {
  generateText?: typeof generateText;
  modelUsageSink?: ModelUsageSink;
  resolveModel?: typeof resolveAISDKModel;
  fetch?: FetchLike;
  requestTimeoutMs?: number;
  retryOptions?: AISDKRetryOptions;
}

export function buildEvalAnswerPrompt(input: EvalAnswerGeneratorInput): string {
  return [
    input.transcript,
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    `User request:\n${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function createEvalAnswerGenerator(input: {
  model: AISDKModelConfig;
  system?: string;
  promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  dependencies?: TextGeneratorDependencies;
}): EvalAnswerGenerator {
  return async (payload) => {
    let attempt = 0;
    return withAISDKRetries(
      async () => {
        attempt += 1;
        return runWithModelUsageAttempt({
          attempt,
          modelId: input.model.model,
          operation: "answer_generation",
          providerId: input.model.provider,
          sink: input.dependencies?.modelUsageSink,
          run: async (report) => {
            const prompt = (input.promptBuilder ?? buildEvalAnswerPrompt)(
              payload,
            );

            if (input.model.provider === "openai" && input.model.baseURL) {
              let raw: string;
              if (input.dependencies?.modelUsageSink) {
                const result = await requestOpenAICompatibleTextResult({
                  model: input.model,
                  system: input.system,
                  prompt,
                  fetch: input.dependencies?.fetch,
                  timeoutMs: input.dependencies?.requestTimeoutMs,
                });
                report(
                  result.usage ?? normalizeAISDKLanguageModelUsage(undefined),
                );
                raw = result.text;
              } else {
                raw = await requestOpenAICompatibleText({
                  model: input.model,
                  system: input.system,
                  prompt,
                  fetch: input.dependencies?.fetch,
                  timeoutMs: input.dependencies?.requestTimeoutMs,
                });
              }
              const content = stripThinkingBlocks(raw);
              if (!content) {
                throw new Error("Empty model response");
              }

              return { content };
            }

            const result = await (
              input.dependencies?.generateText ?? generateText
            )({
              maxRetries: 0,
              model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(
                input.model,
              ),
              system: input.system,
              prompt,
              timeout:
                input.dependencies?.requestTimeoutMs ??
                DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
            });
            report(normalizeAISDKLanguageModelUsage(result.usage));
            const content = stripThinkingBlocks(result.text);
            if (!content) {
              throw new Error("Empty model response");
            }

            return { content };
          },
        });
      },
      input.dependencies?.retryOptions,
    );
  };
}
