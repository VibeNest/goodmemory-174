import { anthropic } from "@ai-sdk/anthropic";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import {
  generateObject,
  generateText,
} from "ai";
import { z } from "zod";
import type { JudgeModel } from "../eval/judge";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "../eval/runners";

export type VercelAIProvider = "openai" | "anthropic";

export interface VercelAIModelConfig {
  provider: VercelAIProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

interface TextGeneratorDependencies {
  generateText?: typeof generateText;
  resolveModel?: typeof resolveVercelAIModel;
}

interface JudgeModelDependencies {
  generateObject?: typeof generateObject;
  generateText?: typeof generateText;
  resolveModel?: typeof resolveVercelAIModel;
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

export function parseVercelAIModelConfigFromEnv(
  prefix: string,
): VercelAIModelConfig | null {
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

export function resolveVercelAIModel(config: VercelAIModelConfig) {
  if (config.provider === "openai") {
    if (config.baseURL || config.apiKey) {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        name: config.baseURL ? "openai-compatible" : undefined,
      });

      // OpenAI-compatible gateways commonly implement chat completions
      // without a fully compatible responses API surface.
      return config.baseURL ? provider.chat(config.model) : provider(config.model);
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

export function buildVercelAITextPrompt(input: EvalAnswerGeneratorInput): string {
  return [
    input.transcript,
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    `User request:\n${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function createVercelAITextGenerator(input: {
  model: VercelAIModelConfig;
  system?: string;
  promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  dependencies?: TextGeneratorDependencies;
}): EvalAnswerGenerator {
  return async (payload) => {
    const { text } = await (input.dependencies?.generateText ?? generateText)({
      model: (input.dependencies?.resolveModel ?? resolveVercelAIModel)(input.model),
      system: input.system,
      prompt: (input.promptBuilder ?? buildVercelAITextPrompt)(payload),
    });

    return {
      content: text,
    };
  };
}

export function createVercelAIJudgeModel(input: {
  model: VercelAIModelConfig;
  system?: string;
  dependencies?: JudgeModelDependencies;
}): JudgeModel {
  return {
    async complete({ prompt }) {
      const system =
        input.system ??
        "You compare two answers and return strict JSON judging which one better understands the user and continues history.";

      if (input.model.provider === "openai" && input.model.baseURL) {
        const { text } = await (input.dependencies?.generateText ?? generateText)({
          model: (input.dependencies?.resolveModel ?? resolveVercelAIModel)(input.model),
          system,
          prompt,
        });

        return {
          content: text,
        };
      }

      const { object } = await (input.dependencies?.generateObject ?? generateObject)({
        model: (input.dependencies?.resolveModel ?? resolveVercelAIModel)(input.model),
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
