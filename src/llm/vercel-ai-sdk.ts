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
}

interface TextGeneratorDependencies {
  generateText?: typeof generateText;
  resolveModel?: typeof resolveVercelAIModel;
}

interface JudgeModelDependencies {
  generateObject?: typeof generateObject;
  resolveModel?: typeof resolveVercelAIModel;
}

const judgeScoresSchema = z.object({
  identity_understanding: z.number(),
  history_continuation: z.number(),
  factual_alignment: z.number(),
  relevance: z.number(),
  personalization: z.number().optional(),
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
  };
}

export function resolveVercelAIModel(config: VercelAIModelConfig) {
  if (config.provider === "openai") {
    const provider = config.apiKey ? createOpenAI({ apiKey: config.apiKey }) : openai;
    return provider(config.model);
  }

  if (config.provider === "anthropic") {
    const provider = config.apiKey
      ? createAnthropic({ apiKey: config.apiKey })
      : anthropic;
    return provider(config.model);
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
      const { object } = await (input.dependencies?.generateObject ?? generateObject)({
        model: (input.dependencies?.resolveModel ?? resolveVercelAIModel)(input.model),
        schema: judgeResultSchema,
        system:
          input.system ??
          "You compare two answers and return strict JSON judging which one better understands the user and continues history.",
        prompt,
      });

      return {
        content: JSON.stringify(object),
      };
    },
  };
}
