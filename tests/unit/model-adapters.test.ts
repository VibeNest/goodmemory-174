import { afterEach, describe, expect, it } from "bun:test";
import {
  buildEvalAnswerPrompt as buildAISDKTextPrompt,
  createEvalAnswerGenerator as createAISDKTextGenerator,
} from "../../src/eval/answer-generator";
import {
  createEvalJudgeModel as createAISDKJudgeModel,
} from "../../src/eval/judge-model";
import {
  createAISDKEmbeddingAdapter,
  createOpenAICompatibleFetch,
  parseAISDKModelConfigFromEnv,
  resolveAISDKEmbeddingModel,
  resolveAISDKModel,
  withAISDKRetries,
} from "../../src/llm/ai-sdk-runtime";
import {
  createLLMMemoryExtractor as createAISDKMemoryExtractor,
} from "../../src/remember/llm-extractor";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("model adapters", () => {
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
          return { text: "<think>hidden</think>\n\ngenerated-answer" } as never;
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

  it("retries transient gateway validation failures for text generation", async () => {
    let attempts = 0;
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5",
      },
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        generateText: async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error(
              "AI_TypeValidationError: Type validation failed: Invalid input: expected array, received null",
            );
          }

          return { text: "recovered-answer" } as never;
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("recovered-answer");
    expect(attempts).toBe(3);
  });

  it("retries empty text generations instead of returning a blank answer", async () => {
    let attempts = 0;
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5",
      },
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        generateText: async () => {
          attempts += 1;
          if (attempts < 3) {
            return { text: "   " } as never;
          }

          return { text: "non-empty-answer" } as never;
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("non-empty-answer");
    expect(attempts).toBe(3);
  });

  it("uses escalating backoff for transient service availability failures", async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await withAISDKRetries(
      async () => {
        attempts += 1;
        if (attempts < 4) {
          throw new Error(
            "Error: OpenAI-compatible gateway error 503: Service temporarily unavailable",
          );
        }

        return "recovered";
      },
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(result).toBe("recovered");
    expect(attempts).toBe(4);
    expect(delays).toEqual([2_000, 5_000, 10_000]);
  });

  it("keeps validation retries on a short backoff schedule", async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await withAISDKRetries(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(
            "AI_TypeValidationError: Type validation failed: Invalid input: expected array, received null",
          );
        }

        return "recovered";
      },
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
    expect(delays).toEqual([250, 500]);
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

  it("creates a structured memory extractor using generateObject", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const extractor = createAISDKMemoryExtractor({
      model: {
        provider: "anthropic",
        model: "claude-sonnet",
      },
      system: "extract durable memory",
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        generateObject: async (input) => {
          calls.push(input as unknown as Record<string, unknown>);
          return {
            object: {
              candidates: [
                {
                  id: "llm-1",
                  kindHint: "fact",
                  explicitness: "explicit",
                  content: "Runtime rollout still needs legal signoff.",
                  sourceMessageIndex: 0,
                  sourceRole: "user",
                  metadata: {
                    category: "project",
                    factKind: "open_loop",
                    subject: "runtime rollout",
                  },
                },
              ],
              ignoredMessageCount: 0,
            },
          } as never;
        },
      },
    });

    const result = await extractor.extract({
      scope: { userId: "u-1" },
      messages: [
        {
          role: "user",
          content: "Heads up: legal still needs to sign off on the runtime rollout.",
        },
      ],
    });

    expect(result.candidates[0]?.kindHint).toBe("fact");
    expect(result.candidates[0]?.content).toContain("legal signoff");
    expect(calls[0]?.schema).toBeTruthy();
    expect(String(calls[0]?.prompt)).toContain("runtime rollout");
  });

  it("creates an embedding adapter using injected dependencies", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const adapter = createAISDKEmbeddingAdapter({
      model: {
        provider: "openai",
        model: "text-embedding-3-small",
      },
      dependencies: {
        resolveEmbeddingModel: (config) => ({ resolvedFrom: config.model }) as never,
        embedMany: async (input) => {
          calls.push(input as unknown as Record<string, unknown>);
          return {
            embeddings: [[1, 0, 0], [0, 1, 0]],
          } as never;
        },
      },
    });

    const result = await adapter.embed(["alpha", "beta"]);

    expect(result).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(calls[0]?.values).toEqual(["alpha", "beta"]);
  });

  it("rejects anthropic embedding model resolution because embeddings are unsupported", () => {
    expect(() =>
      resolveAISDKEmbeddingModel({
        provider: "anthropic",
        model: "claude-sonnet",
      }),
    ).toThrow("does not currently support text embeddings");
  });

  it("uses fetch-based memory extraction for openai-compatible base URLs", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const extractor = createAISDKMemoryExtractor({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      system: "extract durable memory",
      dependencies: {
        fetch: async (url, init) => {
          fetchCalls.push({ url: String(url), init });
          return new Response(
            [
              "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"},\"index\":0}]}",
              "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"candidates\\\":[{\\\"id\\\":\\\"llm-1\\\",\\\"kindHint\\\":\\\"fact\\\",\\\"explicitness\\\":\\\"explicit\\\",\\\"content\\\":\\\"Runtime rollout still needs legal signoff.\\\",\\\"sourceMessageIndex\\\":0,\\\"sourceRole\\\":\\\"user\\\",\\\"metadata\\\":{\\\"category\\\":\\\"project\\\",\\\"factKind\\\":\\\"open_loop\\\",\\\"subject\\\":\\\"runtime rollout\\\"}}],\\\"ignoredMessageCount\\\":0}\"},\"index\":0}]}",
              "data: [DONE]",
              "",
            ].join("\n\n"),
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
        generateObject: async () => {
          throw new Error("generateObject should not run for openai-compatible base URLs");
        },
      },
    });

    const result = await extractor.extract({
      scope: { userId: "u-1" },
      messages: [
        {
          role: "user",
          content: "Heads up: legal still needs to sign off on the runtime rollout.",
        },
      ],
    });

    expect(result.candidates[0]?.metadata?.subject).toBe("runtime rollout");
    expect(fetchCalls[0]?.url).toBe("https://gateway.example/v1/chat/completions");
    expect(fetchCalls[0]?.init?.method).toBe("POST");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"reasoning_effort\":\"medium\"");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"content\":\"extract durable memory\"");
    expect(String(fetchCalls[0]?.init?.body)).toContain("runtime rollout");
  });

  it("normalizes openai-compatible memory extraction enum aliases before schema validation", async () => {
    const extractor = createAISDKMemoryExtractor({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        fetch: async () =>
          new Response(
            [
              "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"},\"index\":0}]}",
              "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"candidates\\\":[{\\\"id\\\":1,\\\"kindHint\\\":\\\"durable_fact\\\",\\\"explicitness\\\":\\\"direct\\\",\\\"content\\\":\\\"Runtime rollout still needs legal signoff.\\\",\\\"sourceMessageIndex\\\":\\\"0\\\",\\\"sourceRole\\\":\\\"USER\\\"}],\\\"ignoredMessageCount\\\":\\\"0\\\"}\"},\"index\":0}]}",
              "data: [DONE]",
              "",
            ].join("\n\n"),
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          ),
      },
    });

    const result = await extractor.extract({
      scope: { userId: "u-1" },
      messages: [
        {
          role: "user",
          content: "Heads up: legal still needs to sign off on the runtime rollout.",
        },
      ],
    });

    expect(result).toEqual({
      candidates: [
        {
          id: "1",
          kindHint: "fact",
          explicitness: "explicit",
          content: "Runtime rollout still needs legal signoff.",
          sourceMessageIndex: 0,
          sourceRole: "user",
        },
      ],
      ignoredMessageCount: 0,
    });
  });

  it("retries invalid structured memory extraction payloads for openai-compatible base URLs", async () => {
    let attempts = 0;
    const extractor = createAISDKMemoryExtractor({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        fetch: async () => {
          attempts += 1;
          return new Response(
            attempts < 3
              ? "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"candidates\\\":[],\\\"ignoredMessageCount\\\":\\\"oops\\\"}\"},\"index\":0}]}\n\ndata: [DONE]\n\n"
              : "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"candidates\\\":[{\\\"id\\\":\\\"llm-1\\\",\\\"kindHint\\\":\\\"fact\\\",\\\"explicitness\\\":\\\"explicit\\\",\\\"content\\\":\\\"Runtime rollout still needs legal signoff.\\\",\\\"sourceMessageIndex\\\":0,\\\"sourceRole\\\":\\\"user\\\"}],\\\"ignoredMessageCount\\\":0}\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await extractor.extract({
      scope: { userId: "u-1" },
      messages: [
        {
          role: "user",
          content: "Heads up: legal still needs to sign off on the runtime rollout.",
        },
      ],
    });

    expect(result.ignoredMessageCount).toBe(0);
    expect(result.candidates[0]?.id).toBe("llm-1");
    expect(attempts).toBe(3);
  });

  it("retries transient gateway validation failures for judge generation", async () => {
    let attempts = 0;
    const judge = createAISDKJudgeModel({
      model: {
        provider: "anthropic",
        model: "claude-sonnet",
      },
      dependencies: {
        resolveModel: (config) => ({ resolvedFrom: config.model }) as never,
        generateObject: async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error(
              "AI_TypeValidationError: Type validation failed: Invalid input: expected array, received null",
            );
          }

          return {
            object: {
              winner: "goodmemory",
              scores: {
                factual_recall: 9,
                preference_consistency: 9,
                cross_domain_transfer: 9,
                contamination_penalty: 9,
                update_correctness: 9,
                personalization_usefulness: 9,
                provenance_explainability: 9,
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
    expect(attempts).toBe(3);
  });

  it("retries empty judge responses instead of returning blank content", async () => {
    let attempts = 0;
    const judge = createAISDKJudgeModel({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        fetch: async () => {
          attempts += 1;
          return new Response(
            attempts < 3
              ? "data: {\"choices\":[{\"delta\":{\"content\":\"   \"},\"index\":0}]}\n\ndata: [DONE]\n\n"
              : "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"winner\\\":\\\"tie\\\",\\\"scores\\\":{\\\"factual_recall\\\":7,\\\"preference_consistency\\\":7,\\\"cross_domain_transfer\\\":7,\\\"contamination_penalty\\\":7,\\\"update_correctness\\\":7,\\\"personalization_usefulness\\\":7,\\\"provenance_explainability\\\":7},\\\"reasoning\\\":\\\"ok\\\",\\\"failure_tags\\\":[]}\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await judge.complete({
      purpose: "eval_judge",
      prompt: "judge this",
    });

    expect(JSON.parse(result.content).winner).toBe("tie");
    expect(attempts).toBe(3);
  });

  it("uses fetch-based judge generation for openai-compatible base URLs", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const judge = createAISDKJudgeModel({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      system: "judge system",
      dependencies: {
        fetch: async (url, init) => {
          fetchCalls.push({ url: String(url), init });
          return new Response(
            "data: {\"choices\":[{\"delta\":{\"content\":\"<think>{\\\"scratch\\\":1}</think>\\n{\\\"winner\\\":\\\"tie\\\",\\\"scores\\\":{\\\"factual_recall\\\":7,\\\"preference_consistency\\\":7,\\\"cross_domain_transfer\\\":7,\\\"contamination_penalty\\\":7,\\\"update_correctness\\\":7,\\\"personalization_usefulness\\\":7,\\\"provenance_explainability\\\":7},\\\"reasoning\\\":\\\"ok\\\",\\\"failure_tags\\\":[]}\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
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
    expect(fetchCalls[0]?.url).toBe("https://gateway.example/v1/chat/completions");
    expect(fetchCalls[0]?.init?.method).toBe("POST");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"reasoning_effort\":\"medium\"");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"content\":\"judge system\"");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"content\":\"judge this\"");
  });

  it("uses fetch-based text generation for openai-compatible base URLs", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      system: "system prompt",
      dependencies: {
        fetch: async (url, init) => {
          fetchCalls.push({ url: String(url), init });
          return new Response(
            [
              "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"},\"index\":0}]}",
              "data: {\"choices\":[{\"delta\":{\"content\":\"<think>hidden</think>\\n\\nfetch-answer\"},\"index\":0}]}",
              "data: [DONE]",
              "",
            ].join("\n\n"),
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("fetch-answer");
    expect(fetchCalls[0]?.url).toBe("https://gateway.example/v1/chat/completions");
    expect(fetchCalls[0]?.init?.method).toBe("POST");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"reasoning_effort\":\"medium\"");
    expect(String(fetchCalls[0]?.init?.body)).toContain("\"content\":\"system prompt\"");
    expect(String(fetchCalls[0]?.init?.body)).toContain("User request:\\ncontinue");
  });

  it("retries malformed openai-compatible stream chunks and recovers on a later attempt", async () => {
    let attempts = 0;
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        fetch: async () => {
          attempts += 1;
          return new Response(
            attempts < 3
              ? "data: {\"id\":\"resp_bad\",\"choices\":null}\n\ndata: [DONE]\n\n"
              : "data: {\"choices\":[{\"delta\":{\"content\":\"recovered-stream-answer\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("recovered-stream-answer");
    expect(attempts).toBe(3);
  });

  it("retries timed out openai-compatible requests and succeeds on a later attempt", async () => {
    let attempts = 0;
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        requestTimeoutMs: 10,
        retryOptions: {
          sleep: async () => undefined,
        },
        fetch: async (_url, init) => {
          attempts += 1;
          if (attempts < 3) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => {
                  reject(init.signal?.reason ?? new Error("aborted"));
                },
                { once: true },
              );
            });
          }

          return new Response(
            "data: {\"choices\":[{\"delta\":{\"content\":\"timeout-recovered-answer\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("timeout-recovered-answer");
    expect(attempts).toBe(3);
  });

  it("retries when the response body hangs after the stream starts", async () => {
    let attempts = 0;
    const generator = createAISDKTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        requestTimeoutMs: 10,
        retryOptions: {
          sleep: async () => undefined,
        },
        fetch: async (_url, init) => {
          attempts += 1;
          if (attempts < 3) {
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"},\"index\":0}]}\n\n",
                    ),
                  );
                  init?.signal?.addEventListener(
                    "abort",
                    () => {
                      controller.error(init.signal?.reason ?? new Error("aborted"));
                    },
                    { once: true },
                  );
                },
              }),
              {
                status: 200,
                headers: {
                  "content-type": "text/event-stream",
                },
              },
            );
          }

          return new Response(
            "data: {\"choices\":[{\"delta\":{\"content\":\"stream-timeout-recovered\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      transcript: "user: hi",
      prompt: "continue",
    });

    expect(result.content).toBe("stream-timeout-recovered");
    expect(attempts).toBe(3);
  });

  it("retries truncated judge streams instead of returning partial json", async () => {
    let attempts = 0;
    const judge = createAISDKJudgeModel({
      model: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "gateway-key",
        baseURL: "https://gateway.example/v1",
      },
      dependencies: {
        fetch: async () => {
          attempts += 1;
          return new Response(
            attempts < 3
              ? "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"winner\\\":\\\"ti\"},\"index\":0}]}\n\n"
              : "data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"winner\\\":\\\"tie\\\",\\\"scores\\\":{\\\"factual_recall\\\":7,\\\"preference_consistency\\\":7,\\\"cross_domain_transfer\\\":7,\\\"contamination_penalty\\\":7,\\\"update_correctness\\\":7,\\\"personalization_usefulness\\\":7,\\\"provenance_explainability\\\":7},\\\"reasoning\\\":\\\"ok\\\",\\\"failure_tags\\\":[]}\"},\"index\":0}]}\n\ndata: [DONE]\n\n",
            {
              status: 200,
              headers: {
                "content-type": "text/event-stream",
              },
            },
          );
        },
      },
    });

    const result = await judge.complete({
      purpose: "eval_judge",
      prompt: "judge this",
    });

    expect(JSON.parse(result.content).winner).toBe("tie");
    expect(attempts).toBe(3);
  });

  it("turns malformed openai-compatible json payloads into concise retryable fetch errors", async () => {
    const wrappedFetch = createOpenAICompatibleFetch(async () =>
      new Response(
        JSON.stringify({
          id: "",
          object: "",
          created: 0,
          model: "",
          system_fingerprint: null,
          choices: null,
          usage: null,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    await expect(
      wrappedFetch("https://gateway.example/v1/chat/completions", {
        method: "POST",
      }),
    ).rejects.toThrow(
      "Malformed openai-compatible gateway response: expected choices array or error object.",
    );
  });

  it("passes through valid event streams without buffering them", async () => {
    const response = new Response("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n", {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
    });
    const wrappedFetch = createOpenAICompatibleFetch(async () => response);

    await expect(
      wrappedFetch("https://gateway.example/v1/chat/completions", {
        method: "POST",
      }),
    ).resolves.toBe(response);
  });
});
