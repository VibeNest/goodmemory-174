import { generateObject } from "ai";

import {
  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
  requestOpenAICompatibleObject,
  requestOpenAICompatibleObjectResult,
  resolveAISDKModel,
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
import type { JudgeModel } from "./judge";
import { judgeResultSchema } from "./judge";

interface JudgeModelDependencies {
  generateObject?: typeof generateObject;
  modelUsageSink?: ModelUsageSink;
  resolveModel?: typeof resolveAISDKModel;
  fetch?: FetchLike;
  requestTimeoutMs?: number;
  retryOptions?: AISDKRetryOptions;
}

const DEFAULT_JUDGE_SYSTEM_PROMPT =
  "You compare two answers and return strict JSON judging which one better understands the user and continues history.";

export function createEvalJudgeModel(input: {
  model: AISDKModelConfig;
  system?: string;
  dependencies?: JudgeModelDependencies;
}): JudgeModel {
  return {
    async complete({ prompt }) {
      const system = input.system ?? DEFAULT_JUDGE_SYSTEM_PROMPT;
      let attempt = 0;

      return withAISDKRetries(async () => {
        attempt += 1;
        return runWithModelUsageAttempt({
          attempt,
          modelId: input.model.model,
          operation: "judge",
          providerId: input.model.provider,
          sink: input.dependencies?.modelUsageSink,
          run: async (report) => {
            let object;
            if (input.model.provider === "openai" && input.model.baseURL) {
              if (input.dependencies?.modelUsageSink) {
                object = (await requestOpenAICompatibleObjectResult({
                  model: input.model,
                  schema: judgeResultSchema,
                  system,
                  prompt,
                  fetch: input.dependencies?.fetch,
                  timeoutMs: input.dependencies?.requestTimeoutMs,
                  onUsage: (usage) => report(
                    usage ?? normalizeAISDKLanguageModelUsage(undefined),
                  ),
                })).object;
              } else {
                object = await requestOpenAICompatibleObject({
                  model: input.model,
                  schema: judgeResultSchema,
                  system,
                  prompt,
                  fetch: input.dependencies?.fetch,
                  timeoutMs: input.dependencies?.requestTimeoutMs,
                });
              }
            } else {
              const response = await (
                input.dependencies?.generateObject ?? generateObject
              )({
                maxRetries: 0,
                model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(
                  input.model,
                ),
                schema: judgeResultSchema,
                system,
                prompt,
                timeout:
                  input.dependencies?.requestTimeoutMs ??
                  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
              });
              report(normalizeAISDKLanguageModelUsage(response.usage));
              object = response.object;
            }

            const content = JSON.stringify(object);
            if (!content.trim()) {
              throw new Error("Empty model response");
            }
            return { content };
          },
        });
      }, input.dependencies?.retryOptions);
    },
  };
}
