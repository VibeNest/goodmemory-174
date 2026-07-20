import { describe, expect, it } from "bun:test";

import {
  modelTokenTotal,
  normalizeAISDKEmbeddingUsage,
  normalizeAISDKLanguageModelUsage,
  normalizeOpenAICompatibleUsage,
  runWithModelUsageAttempt,
} from "../../src/provider/model-usage";
import type {
  ModelUsageAttempt,
  ModelUsageIntent,
} from "../../src/provider/model-usage";

describe("provider model usage", () => {
  it("keeps authoritative total input separate from cache breakdown", () => {
    const usage = normalizeAISDKLanguageModelUsage({
      inputTokens: 20,
      inputTokenDetails: {
        cacheReadTokens: 7,
        cacheWriteTokens: 5,
        noCacheTokens: 8,
      },
      outputTokens: 4,
    });

    expect(usage).toEqual({
      cacheCreationInputTokens: 5,
      cacheReadInputTokens: 7,
      inputTokens: 20,
      outputTokens: 4,
      uncachedInputTokens: 8,
    });
    expect(modelTokenTotal(usage)).toBe(24);
  });

  it("normalizes OpenAI-compatible and Anthropic-style usage without double counting caches", () => {
    const openAI = normalizeOpenAICompatibleUsage({
      usage: {
        completion_tokens: 3,
        prompt_tokens: 12,
        prompt_tokens_details: { cached_tokens: 4 },
      },
    });
    const anthropic = normalizeOpenAICompatibleUsage({
      usage: {
        cache_creation_input_tokens: 5,
        cache_read_input_tokens: 7,
        input_tokens: 20,
        output_tokens: 4,
      },
    });
    const openAIResponses = normalizeOpenAICompatibleUsage({
      usage: {
        input_tokens: 18,
        input_tokens_details: { cached_tokens: 6 },
        output_tokens: 2,
      },
    });

    expect(openAI).toEqual({
      cacheCreationInputTokens: null,
      cacheReadInputTokens: 4,
      inputTokens: 12,
      outputTokens: 3,
      uncachedInputTokens: 8,
    });
    expect(modelTokenTotal(openAI)).toBe(15);
    expect(anthropic).toEqual({
      cacheCreationInputTokens: 5,
      cacheReadInputTokens: 7,
      inputTokens: 32,
      outputTokens: 4,
      uncachedInputTokens: 20,
    });
    expect(modelTokenTotal(anthropic)).toBe(36);
    expect(openAIResponses).toEqual({
      cacheCreationInputTokens: null,
      cacheReadInputTokens: 6,
      inputTokens: 18,
      outputTokens: 2,
      uncachedInputTokens: 12,
    });
    expect(modelTokenTotal(openAIResponses)).toBe(20);
  });

  it("treats cache breakdown as optional but fails closed without total input or output", () => {
    const complete = normalizeAISDKLanguageModelUsage({
      inputTokens: 9,
      outputTokens: 2,
    });
    const missingOutput = normalizeOpenAICompatibleUsage({
      usage: { prompt_tokens: 9 },
    });

    expect(complete).toEqual({
      cacheCreationInputTokens: null,
      cacheReadInputTokens: null,
      inputTokens: 9,
      outputTokens: 2,
      uncachedInputTokens: null,
    });
    expect(modelTokenTotal(complete)).toBe(11);
    expect(modelTokenTotal(missingOutput)).toBeNull();
  });

  it("counts embedding tokens as input-only model usage", () => {
    const usage = normalizeAISDKEmbeddingUsage({ tokens: 17 });

    expect(usage).toEqual({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      inputTokens: 17,
      outputTokens: 0,
      uncachedInputTokens: 17,
    });
    expect(modelTokenTotal(usage)).toBe(17);
  });

  it("emits one complete or missing sidecar event per attempted request", async () => {
    const events: ModelUsageAttempt[] = [];
    const sink = { emit(event: ModelUsageAttempt) { events.push(event); } };

    await expect(
      runWithModelUsageAttempt({
        attempt: 1,
        modelId: "gpt-5.6-terra",
        operation: "answer_generation",
        providerId: "openai",
        run: async (report) => {
          report(normalizeAISDKLanguageModelUsage({
            inputTokens: 10,
            outputTokens: 2,
          }));
          return "ok";
        },
        sink,
      }),
    ).resolves.toBe("ok");
    await expect(
      runWithModelUsageAttempt({
        attempt: 2,
        modelId: "gpt-5.6-terra",
        operation: "answer_generation",
        providerId: "openai",
        run: async () => {
          throw new Error("gateway timeout");
        },
        sink,
      }),
    ).rejects.toThrow("gateway timeout");

    expect(events).toEqual([
      {
        attempt: 1,
        completeness: "complete",
        modelId: "gpt-5.6-terra",
        operation: "answer_generation",
        outcome: "succeeded",
        providerId: "openai",
        schemaVersion: 1,
        usage: {
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null,
          inputTokens: 10,
          outputTokens: 2,
          uncachedInputTokens: null,
        },
      },
      {
        attempt: 2,
        completeness: "missing",
        modelId: "gpt-5.6-terra",
        operation: "answer_generation",
        outcome: "failed",
        providerId: "openai",
        schemaVersion: 1,
        usage: {
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null,
          inputTokens: null,
          outputTokens: null,
          uncachedInputTokens: null,
        },
      },
    ]);
  });

  it("begins before each request and commits its success or failure terminal", async () => {
    const trace: string[] = [];
    const sink = {
      begin(intent: ModelUsageIntent) {
        trace.push(`begin:${intent.attempt}:${intent.schemaVersion}`);
        return (event: ModelUsageAttempt) => {
          trace.push(`commit:${intent.attempt}:${event.outcome}`);
        };
      },
      emit() {
        throw new Error("begin-aware sink must commit through its receipt");
      },
      strict: true,
    };

    await expect(runWithModelUsageAttempt({
      attempt: 1,
      modelId: "gpt-5.6-terra",
      operation: "answer_generation",
      providerId: "openai",
      run: async (report) => {
        trace.push("run:1");
        report(normalizeAISDKLanguageModelUsage({
          inputTokens: 10,
          outputTokens: 2,
        }));
        return "ok";
      },
      sink,
    })).resolves.toBe("ok");
    await expect(runWithModelUsageAttempt({
      attempt: 2,
      modelId: "gpt-5.6-terra",
      operation: "answer_generation",
      providerId: "openai",
      run: async () => {
        trace.push("run:2");
        throw new Error("gateway timeout");
      },
      sink,
    })).rejects.toThrow("gateway timeout");

    expect(trace).toEqual([
      "begin:1:1",
      "run:1",
      "commit:1:succeeded",
      "begin:2:1",
      "run:2",
      "commit:2:failed",
    ]);
  });

  it("keeps concurrent begin receipts bound to their own terminal", async () => {
    const committed: Array<{
      intentAttempt: number;
      terminalAttempt: number;
      tokens: number | null;
    }> = [];
    let releaseFirst = () => {};
    let releaseSecond = () => {};
    const sink = {
      begin(intent: ModelUsageIntent) {
        return (event: ModelUsageAttempt) => {
          committed.push({
            intentAttempt: intent.attempt,
            terminalAttempt: event.attempt,
            tokens: modelTokenTotal(event.usage),
          });
        };
      },
      emit() {
        throw new Error("begin-aware sink must commit through its receipt");
      },
      strict: true,
    };
    const first = runWithModelUsageAttempt({
      attempt: 1,
      modelId: "model-1",
      operation: "reranker_pointwise",
      providerId: "openai",
      run: async (report) => {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        report(normalizeAISDKLanguageModelUsage({
          inputTokens: 10,
          outputTokens: 1,
        }));
        return "first";
      },
      sink,
    });
    const second = runWithModelUsageAttempt({
      attempt: 2,
      modelId: "model-2",
      operation: "reranker_pointwise",
      providerId: "openai",
      run: async (report) => {
        await new Promise<void>((resolve) => {
          releaseSecond = resolve;
        });
        report(normalizeAISDKLanguageModelUsage({
          inputTokens: 20,
          outputTokens: 2,
        }));
        return "second";
      },
      sink,
    });

    releaseSecond();
    await expect(second).resolves.toBe("second");
    releaseFirst();
    await expect(first).resolves.toBe("first");

    expect(committed).toEqual([{
      intentAttempt: 2,
      terminalAttempt: 2,
      tokens: 22,
    }, {
      intentAttempt: 1,
      terminalAttempt: 1,
      tokens: 11,
    }]);
  });

  it("marks reported usage as failed when validation rejects the model response", async () => {
    const events: ModelUsageAttempt[] = [];

    await expect(runWithModelUsageAttempt({
      attempt: 1,
      modelId: "gpt-5.6-terra",
      operation: "reranker_listwise",
      providerId: "openai",
      run: async (report) => {
        report(normalizeAISDKLanguageModelUsage({
          inputTokens: 12,
          outputTokens: 3,
        }));
        throw new Error("schema validation failed");
      },
      sink: { emit(event) { events.push(event); } },
    })).rejects.toThrow("schema validation failed");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      completeness: "complete",
      outcome: "failed",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it("does not fail a model call when the optional usage sink fails", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await expect(runWithModelUsageAttempt({
        attempt: 1,
        modelId: "gpt-5.6-terra",
        operation: "answer_generation",
        providerId: "openai",
        run: async (report) => {
          report(normalizeAISDKLanguageModelUsage({
            inputTokens: 5,
            outputTokens: 1,
          }));
          return "answer";
        },
        sink: { emit() { throw new Error("collector unavailable"); } },
      })).resolves.toBe("answer");
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("falls back to emit when a non-strict begin or commit fails", async () => {
    const events: ModelUsageAttempt[] = [];
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const sink = {
        begin(intent: ModelUsageIntent) {
          if (intent.attempt === 1) {
            throw new Error("intent ledger unavailable");
          }
          return () => {
            throw new Error("terminal ledger unavailable");
          };
        },
        emit(event: ModelUsageAttempt) {
          events.push(event);
        },
      };
      for (const attempt of [1, 2]) {
        await expect(runWithModelUsageAttempt({
          attempt,
          modelId: "gpt-5.6-terra",
          operation: "answer_generation",
          providerId: "openai",
          run: async () => "answer",
          sink,
        })).resolves.toBe("answer");
      }
      expect(events.map(({ attempt }) => attempt)).toEqual([1, 2]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("fails closed before the request when a strict sink cannot begin", async () => {
    let requests = 0;
    await expect(runWithModelUsageAttempt({
      attempt: 1,
      modelId: "gpt-5.6-terra",
      operation: "answer_generation",
      providerId: "openai",
      run: async () => {
        requests += 1;
        return "answer";
      },
      sink: {
        begin() {
          throw new Error("intent ledger unavailable");
        },
        emit() {},
        strict: true,
      },
    })).rejects.toThrow("intent ledger unavailable");
    expect(requests).toBe(0);
  });

  it("fails closed after the request when a strict sink cannot commit", async () => {
    let requests = 0;
    await expect(runWithModelUsageAttempt({
      attempt: 1,
      modelId: "gpt-5.6-terra",
      operation: "answer_generation",
      providerId: "openai",
      run: async () => {
        requests += 1;
        return "answer";
      },
      sink: {
        begin() {
          return () => {
            throw new Error("terminal ledger unavailable");
          };
        },
        emit() {},
        strict: true,
      },
    })).rejects.toThrow("terminal ledger unavailable");
    expect(requests).toBe(1);
  });

  it("fails an eval request when a strict usage sink cannot commit its terminal event", async () => {
    let requests = 0;
    await expect(runWithModelUsageAttempt({
      attempt: 1,
      modelId: "gpt-5.6-terra",
      operation: "answer_generation",
      providerId: "openai",
      run: async (report) => {
        requests += 1;
        report(normalizeAISDKLanguageModelUsage({
          inputTokens: 5,
          outputTokens: 1,
        }));
        return "answer";
      },
      sink: {
        emit() {
          throw new Error("ledger unavailable");
        },
        strict: true,
      },
    })).rejects.toThrow("ledger unavailable");
    expect(requests).toBe(1);
  });
});
