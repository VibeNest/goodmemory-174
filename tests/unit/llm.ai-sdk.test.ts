import { afterEach, describe, expect, it } from "bun:test";
import {
  buildAISDKTextPrompt,
  createAISDKJudgeModel,
  createAISDKTextGenerator,
  parseAISDKModelConfigFromEnv,
  resolveAISDKModel,
} from "../../src/llm/ai-sdk";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("vercel ai sdk adapter", () => {
  it("parses model config from environment variables", () => {
    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";
    process.env.GOODMEMORY_EVAL_MODEL = "gpt-5";
    process.env.GOODMEMORY_EVAL_API_KEY = "test-key";
    process.env.GOODMEMORY_EVAL_BASE_URL = "https://gateway.example/v1";

    expect(parseAISDKModelConfigFromEnv("GOODMEMORY_EVAL")).toEqual({
      provider: "openai",
      model: "gpt-5",
      apiKey: "test-key",
      baseURL: "https://gateway.example/v1",
    });
  });

  it("returns null when required env variables are missing", () => {
    delete process.env.GOODMEMORY_EVAL_PROVIDER;
    delete process.env.GOODMEMORY_EVAL_MODEL;

    expect(parseAISDKModelConfigFromEnv("GOODMEMORY_EVAL")).toBeNull();
  });

  it("rejects unsupported providers", () => {
    expect(() =>
      resolveAISDKModel({
        provider: "unsupported" as "openai",
        model: "x",
      }),
    ).toThrow("Unsupported Vercel AI SDK provider");
  });

  it("parses env providers strictly", () => {
    process.env.GOODMEMORY_JUDGE_PROVIDER = "unsupported";
    process.env.GOODMEMORY_JUDGE_MODEL = "judge-model";

    expect(() => parseAISDKModelConfigFromEnv("GOODMEMORY_JUDGE")).toThrow(
      "Unsupported Vercel AI SDK provider",
    );
  });

  it("resolves openai and anthropic models with and without explicit api keys", () => {
    expect(
      resolveAISDKModel({
        provider: "openai",
        model: "gpt-5",
      }),
    ).toBeTruthy();
    expect(
      resolveAISDKModel({
        provider: "openai",
        model: "gpt-5",
        apiKey: "openai-key",
      }),
    ).toBeTruthy();
    expect(
      resolveAISDKModel({
        provider: "openai",
        model: "gpt-5",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      }),
    ).toBeTruthy();
    expect(
      resolveAISDKModel({
        provider: "anthropic",
        model: "claude-sonnet",
      }),
    ).toBeTruthy();
    expect(
      resolveAISDKModel({
        provider: "anthropic",
        model: "claude-sonnet",
        apiKey: "anthropic-key",
      }),
    ).toBeTruthy();
    expect(
      resolveAISDKModel({
        provider: "anthropic",
        model: "claude-sonnet",
        apiKey: "anthropic-key",
        baseURL: "https://gateway.example/v1",
      }),
    ).toBeTruthy();
  });

  it("builds prompts with transcript, memory context, and user request", () => {
    expect(
      buildAISDKTextPrompt({
        persona: {} as never,
        scenario: {} as never,
        transcript: "user: hi",
        memoryContext: "## Facts\n- migration open loop",
        prompt: "continue",
      }),
    ).toContain("Memory context");

    expect(
      buildAISDKTextPrompt({
        persona: {} as never,
        scenario: {} as never,
        transcript: "user: hi",
        prompt: "continue",
      }),
    ).not.toContain("Memory context");
  });

  it("creates a text generator using injected dependencies", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const generator = createAISDKTextGenerator({
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
    const judge = createAISDKJudgeModel({
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

  it("uses text-based judge generation for openai-compatible base URLs", async () => {
    const streamCalls: Array<Record<string, unknown>> = [];
    const judge = createAISDKJudgeModel({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      system: "judge system",
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        streamText: (input) => {
          streamCalls.push(input as unknown as Record<string, unknown>);
          return {
            text: Promise.resolve("{\"winner\":\"tie\",\"scores\":{\"identity_understanding\":7,\"history_continuation\":7,\"factual_alignment\":7,\"relevance\":7,\"personalization\":7},\"reasoning\":\"ok\",\"failure_tags\":[]}"),
          } as never;
        },
        generateObject: async () => {
          throw new Error("generateObject should not run for openai-compatible base URLs");
        },
      },
    });

    const result = await judge.complete({
      purpose: "eval_judge",
      prompt: "judge this",
    });

    expect(JSON.parse(result.content).winner).toBe("tie");
    expect(streamCalls[0]?.system).toBe("judge system");
    expect(streamCalls[0]?.prompt).toBe("judge this");
    expect(streamCalls[0]?.providerOptions).toEqual({
      openaiCompatible: {
        reasoningEffort: "medium",
      },
    });
  });

  it("uses stream-based text generation for openai-compatible base URLs", async () => {
    const streamCalls: Array<Record<string, unknown>> = [];
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      system: "system prompt",
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        streamText: (input) => {
          streamCalls.push(input as unknown as Record<string, unknown>);
          return {
            text: Promise.resolve("streamed-answer"),
          } as never;
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("streamed-answer");
    expect(streamCalls[0]?.system).toBe("system prompt");
    expect(streamCalls[0]?.providerOptions).toEqual({
      openaiCompatible: {
        reasoningEffort: "medium",
      },
    });
  });
});
