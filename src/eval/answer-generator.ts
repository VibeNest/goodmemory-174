import { generateText } from "ai";

import {
  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
  requestOpenAICompatibleText,
  resolveAISDKModel,
  stripThinkingBlocks,
  withAISDKRetries,
} from "../provider/ai-sdk-runtime";
import type { AISDKRetryOptions } from "../provider/ai-sdk-runtime";
import type { FetchLike } from "../provider/ai-sdk-runtime";
import type { AISDKModelConfig } from "../provider/ai-sdk-runtime";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "./runners";

interface TextGeneratorDependencies {
  generateText?: typeof generateText;
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
    return withAISDKRetries(
      async () => {
        const prompt = (input.promptBuilder ?? buildEvalAnswerPrompt)(payload);

        if (input.model.provider === "openai" && input.model.baseURL) {
          const content = stripThinkingBlocks(
            await requestOpenAICompatibleText({
              model: input.model,
              system: input.system,
              prompt,
              fetch: input.dependencies?.fetch,
              timeoutMs: input.dependencies?.requestTimeoutMs,
            }),
          );
          if (!content) {
            throw new Error("Empty model response");
          }

          return {
            content,
          };
        }

        const { text } = await (input.dependencies?.generateText ?? generateText)({
          maxRetries: 0,
          model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
          system: input.system,
          prompt,
          timeout:
            input.dependencies?.requestTimeoutMs ??
            DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
        });
        const content = stripThinkingBlocks(text);
        if (!content) {
          throw new Error("Empty model response");
        }

        return {
          content,
        };
      },
      input.dependencies?.retryOptions,
    );
  };
}
