import { anthropic } from "@ai-sdk/anthropic";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateObject,
  generateText,
  streamText,
} from "ai";
import { z } from "zod";
import type { JudgeModel } from "../eval/judge";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "../eval/runners";

export type AISDKProvider = "openai" | "anthropic";

export interface AISDKModelConfig {
  provider: AISDKProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

interface TextGeneratorDependencies {
  generateText?: typeof generateText;
  streamText?: typeof streamText;
  resolveModel?: typeof resolveAISDKModel;
}

interface JudgeModelDependencies {
  generateObject?: typeof generateObject;
  generateText?: typeof generateText;
  streamText?: typeof streamText;
  resolveModel?: typeof resolveAISDKModel;
}

const judgeScoresSchema = z.object({
  identity_understanding: z.number(),
  history_continuation: z.number(),
  factual_alignment: z.number(),
  relevance: z.number(),
  // Some OpenAI-compatible gateways reject JSON schemas whose optional
  // properties are omitted from the generated `required` array.
  personalization: z.number(),
});

const judgeResultSchema = z.object({
  winner: z.enum(["baseline", "goodmemory", "tie"]),
  scores: judgeScoresSchema,
  baseline_scores: judgeScoresSchema.optional(),
  goodmemory_scores: judgeScoresSchema.optional(),
  reasoning: z.string(),
  failure_tags: z.array(z.string()),
});

export function parseAISDKModelConfigFromEnv(
  prefix: string,
): AISDKModelConfig | null {
  const provider = process.env[`${prefix}_PROVIDER`];
  const model = process.env[`${prefix}_MODEL`];

  if (!provider || !model) {
    return null;
  }

  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`Unsupported Vercel AI SDK provider: ${provider}`);
  }

  return {
    provider,
    model,
    apiKey: process.env[`${prefix}_API_KEY`],
    baseURL: process.env[`${prefix}_BASE_URL`],
  };
}

export function resolveAISDKModel(config: AISDKModelConfig) {
  if (config.provider === "openai") {
    if (config.baseURL) {
      const provider = createOpenAICompatible({
        name: "openai-compatible",
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });

      return provider.chatModel(config.model);
    }

    if (config.apiKey) {
      const provider = createOpenAI({
        apiKey: config.apiKey,
      });
      return provider(config.model);
    }

    return openai(config.model);
  }

  if (config.provider === "anthropic") {
    if (config.baseURL || config.apiKey) {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      return provider(config.model);
    }

    return anthropic(config.model);
  }

  throw new Error(`Unsupported Vercel AI SDK provider: ${config.provider}`);
}

export function buildAISDKTextPrompt(input: EvalAnswerGeneratorInput): string {
  return [
    input.transcript,
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    `User request:\n${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function createAISDKTextGenerator(input: {
  model: AISDKModelConfig;
  system?: string;
  promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  dependencies?: TextGeneratorDependencies;
}): EvalAnswerGenerator {
  return async (payload) => {
    if (input.model.provider === "openai" && input.model.baseURL) {
      const result = (input.dependencies?.streamText ?? streamText)({
        model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
        system: input.system,
        prompt: (input.promptBuilder ?? buildAISDKTextPrompt)(payload),
        providerOptions: {
          openaiCompatible: {
            reasoningEffort: "medium",
          },
        },
      });

      return {
        content: await result.text,
      };
    }

    const { text } = await (input.dependencies?.generateText ?? generateText)({
      model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
      system: input.system,
      prompt: (input.promptBuilder ?? buildAISDKTextPrompt)(payload),
    });

    return {
      content: text,
    };
  };
}

export function createAISDKJudgeModel(input: {
  model: AISDKModelConfig;
  system?: string;
  dependencies?: JudgeModelDependencies;
}): JudgeModel {
  return {
    async complete({ prompt }) {
      const system =
        input.system ??
        "You compare two answers and return strict JSON judging which one better understands the user and continues history.";

      if (input.model.provider === "openai" && input.model.baseURL) {
        const result = (input.dependencies?.streamText ?? streamText)({
          model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
          system,
          prompt,
          providerOptions: {
            openaiCompatible: {
              reasoningEffort: "medium",
            },
          },
        });

        return {
          content: await result.text,
        };
      }

      const { object } = await (input.dependencies?.generateObject ?? generateObject)({
        model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
        schema: judgeResultSchema,
        system,
        prompt,
      });

      return {
        content: JSON.stringify(object),
      };
    },
  };
}
