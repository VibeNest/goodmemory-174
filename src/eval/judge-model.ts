import { generateObject } from "ai";

import type { AISDKRetryOptions } from "../llm/ai-sdk-runtime";
import type { FetchLike } from "../llm/ai-sdk-runtime";
import type { AISDKModelConfig } from "../llm/ai-sdk-runtime";
import {
  requestOpenAICompatibleObject,
  resolveAISDKModel,
  withAISDKRetries,
} from "../llm/ai-sdk-runtime";
import type { JudgeModel } from "./judge";
import { judgeResultSchema } from "./judge";

interface JudgeModelDependencies {
  generateObject?: typeof generateObject;
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

      return withAISDKRetries(async () => {
        if (input.model.provider === "openai" && input.model.baseURL) {
          const object = await requestOpenAICompatibleObject({
            model: input.model,
            schema: judgeResultSchema,
            system,
            prompt,
            fetch: input.dependencies?.fetch,
            timeoutMs: input.dependencies?.requestTimeoutMs,
          });

          const content = JSON.stringify(object);
          if (!content.trim()) {
            throw new Error("Empty model response");
          }

          return {
            content,
          };
        }

        const { object } = await (input.dependencies?.generateObject ?? generateObject)({
          model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
          schema: judgeResultSchema,
          system,
          prompt,
        });

        const content = JSON.stringify(object);
        if (!content.trim()) {
          throw new Error("Empty model response");
        }

        return {
          content,
        };
      }, input.dependencies?.retryOptions);
    },
  };
}
