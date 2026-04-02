import { afterEach, describe, expect, it } from "bun:test";
import {
  buildVercelAITextPrompt,
  createVercelAIJudgeModel,
  createVercelAITextGenerator,
  parseVercelAIModelConfigFromEnv,
  resolveVercelAIModel,
} from "../../src/llm/vercel-ai-sdk";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("vercel ai sdk adapter", () => {
  it("parses model config from environment variables", () => {
    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";
    process.env.GOODMEMORY_EVAL_MODEL = "gpt-5";
    process.env.GOODMEMORY_EVAL_API_KEY = "test-key";

    expect(parseVercelAIModelConfigFromEnv("GOODMEMORY_EVAL")).toEqual({
      provider: "openai",
      model: "gpt-5",
      apiKey: "test-key",
    });
  });

  it("returns null when required env variables are missing", () => {
    delete process.env.GOODMEMORY_EVAL_PROVIDER;
    delete process.env.GOODMEMORY_EVAL_MODEL;

    expect(parseVercelAIModelConfigFromEnv("GOODMEMORY_EVAL")).toBeNull();
  });

  it("rejects unsupported providers", () => {
    expect(() =>
      resolveVercelAIModel({
        provider: "unsupported" as "openai",
        model: "x",
      }),
    ).toThrow("Unsupported Vercel AI SDK provider");
  });

  it("parses env providers strictly", () => {
    process.env.GOODMEMORY_JUDGE_PROVIDER = "unsupported";
    process.env.GOODMEMORY_JUDGE_MODEL = "judge-model";

    expect(() => parseVercelAIModelConfigFromEnv("GOODMEMORY_JUDGE")).toThrow(
      "Unsupported Vercel AI SDK provider",
    );
  });

  it("resolves openai and anthropic models with and without explicit api keys", () => {
    expect(
      resolveVercelAIModel({
        provider: "openai",
        model: "gpt-5",
      }),
    ).toBeTruthy();
    expect(
      resolveVercelAIModel({
        provider: "openai",
        model: "gpt-5",
        apiKey: "openai-key",
      }),
    ).toBeTruthy();
    expect(
      resolveVercelAIModel({
        provider: "anthropic",
        model: "claude-sonnet",
      }),
    ).toBeTruthy();
    expect(
      resolveVercelAIModel({
        provider: "anthropic",
        model: "claude-sonnet",
        apiKey: "anthropic-key",
      }),
    ).toBeTruthy();
  });

  it("builds prompts with transcript, memory context, and user request", () => {
    expect(
      buildVercelAITextPrompt({
        persona: {} as never,
        scenario: {} as never,
        transcript: "user: hi",
        memoryContext: "## Facts\n- migration open loop",
        prompt: "continue",
      }),
    ).toContain("Memory context");

    expect(
      buildVercelAITextPrompt({
        persona: {} as never,
        scenario: {} as never,
        transcript: "user: hi",
        prompt: "continue",
      }),
    ).not.toContain("Memory context");
  });

  it("creates a text generator using injected dependencies", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const generator = createVercelAITextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5",
      },
      system: "system prompt",
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        generateText: async (input) => {
          calls.push(input as unknown as Record<string, unknown>);
          return { text: "generated-answer" } as never;
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      memoryContext: "## Facts\n- migration open loop",
      prompt: "continue",
    });

    expect(result.content).toBe("generated-answer");
    expect(calls[0]?.system).toBe("system prompt");
    expect(String(calls[0]?.prompt)).toContain("migration open loop");
  });

  it("creates a judge model using injected dependencies", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const judge = createVercelAIJudgeModel({
      model: {
        provider: "anthropic",
        model: "claude-sonnet",
      },
      system: "judge system",
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        generateObject: async (input) => {
          calls.push(input as unknown as Record<string, unknown>);
          return {
            object: {
              winner: "goodmemory",
              scores: {
                identity_understanding: 9,
                history_continuation: 9,
                factual_alignment: 8,
                relevance: 9,
              },
              reasoning: "comparison complete",
              failure_tags: [],
            },
          } as never;
        },
      },
    });

    const result = await judge.complete({
      purpose: "eval_judge",
      prompt: "judge this",
    });

    expect(JSON.parse(result.content).winner).toBe("goodmemory");
    expect(calls[0]?.system).toBe("judge system");
    expect(calls[0]?.schema).toBeTruthy();
  });
});
