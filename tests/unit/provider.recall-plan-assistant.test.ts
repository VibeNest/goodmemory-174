import { describe, expect, it } from "bun:test";

import {
  buildRecallPlanAssistantPrompt,
  createLLMRecallPlanAssistant,
  recallPlanAssistanceSchema,
} from "../../src/provider/recall-plan-assistant";
import type { AISDKModelConfig } from "../../src/provider/ai-sdk-runtime";
import { createProviderRecallPlanAssistant } from "../../src/provider/layer";
import type { ModelUsageAttempt } from "../../src/provider/model-usage";
import type { RecallPlanAssistantInput } from "../../src/recall/recallPlan";

const ASSISTANT_INPUT: RecallPlanAssistantInput = {
  deterministicPlan: {
    entities: ["partner api"],
    facets: ["current partner api"],
    temporalConstraints: [
      { kind: "current", referenceTime: "2026-07-18T00:00:00.000Z" },
    ],
    aggregation: "current",
    evidenceNeeds: ["direct", "temporal"],
    planes: ["semantic"],
    maxHops: 1,
    preRankLimit: 32,
    selectedLimit: 12,
    maxRenderedTokens: 6_000,
    uncertainty: "medium",
  },
  locale: "en-US",
  query: "Which partner API is current?",
  referenceTime: "2026-07-18T00:00:00.000Z",
  scope: { tenantId: "tenant-1", userId: "user-1" },
};

describe("provider recall plan assistant", () => {
  it("sends only query-local RecallPlanAssistantInput to the GurkiAI gateway", async () => {
    let requestUrl = "";
    let requestBody = "";
    const assistant = createLLMRecallPlanAssistant({
      dependencies: {
        fetch: async (url, init) => {
          requestUrl = String(url);
          requestBody = String(init?.body);
          return new Response(
            [
              'data: {"choices":[{"delta":{"content":"{\\"entities\\":[\\"partner api\\"],\\"facets\\":[\\"partner api\\"],\\"maxHops\\":2}"},"index":0}]}',
              "data: [DONE]",
              "",
            ].join("\n\n"),
            {
              headers: { "content-type": "text/event-stream" },
              status: 200,
            },
          );
        },
        retryOptions: { retryLimit: 1 },
      },
      maxOutputTokens: 1_024,
      model: {
        apiKey: "test-key",
        baseURL: "https://ai.gurkiai.com/v1",
        model: "gpt-5.6-terra",
        provider: "openai",
      },
      temperature: 0,
    });
    const inputWithForbiddenFields = {
      ...ASSISTANT_INPUT,
      benchmarkCaseId: "case-7",
      candidates: [{ content: "private content" }],
      goldEvidence: ["expected evidence"],
      memory: [{ content: "private content" }],
    } as RecallPlanAssistantInput;

    await expect(assistant.plan(inputWithForbiddenFields)).resolves.toEqual({
      entities: ["partner api"],
      facets: ["partner api"],
      maxHops: 2,
    });

    expect(requestUrl).toBe("https://ai.gurkiai.com/v1/chat/completions");
    const request = JSON.parse(requestBody) as {
      messages: Array<{ content: string; role: string }>;
      max_tokens: number;
      model: string;
      reasoning_effort: string;
      stream: boolean;
      temperature: number;
    };
    expect(request).toMatchObject({
      model: "gpt-5.6-terra",
      max_tokens: 1_024,
      reasoning_effort: "medium",
      stream: true,
      temperature: 0,
    });
    expect((request as Record<string, unknown>).stream_options).toBeUndefined();
    const normalizedRequest = requestBody.toLowerCase();
    expect(normalizedRequest).not.toContain("benchmark");
    expect(normalizedRequest).not.toContain("candidate");
    expect(normalizedRequest).not.toContain("gold");
    expect(normalizedRequest).not.toContain('"memory"');
    const userPrompt = request.messages.find(
      (message) => message.role === "user",
    )?.content;
    expect(userPrompt).toContain('"query":"Which partner API is current?"');
    expect(userPrompt).toContain('"deterministicPlan"');
    expect(userPrompt).toContain('"scope"');
  });

  it("serializes an explicit allowlist rather than arbitrary input fields", () => {
    const prompt = buildRecallPlanAssistantPrompt({
      ...ASSISTANT_INPUT,
      benchmarkCaseId: "case-7",
      goldAnswer: "secret",
      memory: "private",
    } as RecallPlanAssistantInput);

    expect(prompt).toContain('"query":"Which partner API is current?"');
    expect(prompt).toContain('"locale":"en-US"');
    expect(prompt).toContain('"referenceTime":"2026-07-18T00:00:00.000Z"');
    expect(prompt).not.toContain("benchmarkCaseId");
    expect(prompt).not.toContain("goldAnswer");
    expect(prompt).not.toContain("private");
  });

  it("rejects provider attempts to override fixed retrieval budgets", () => {
    expect(() =>
      recallPlanAssistanceSchema.parse({
        facets: ["partner api"],
        preRankLimit: 128,
        selectedLimit: 64,
      }),
    ).toThrow();
  });

  it("emits normalized usage for the provider-assisted planner", async () => {
    const events: ModelUsageAttempt[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const assistant = createLLMRecallPlanAssistant({
      dependencies: {
        generateObject: async (callInput) => {
          calls.push(callInput as unknown as Record<string, unknown>);
          return {
            object: { facets: ["partner api"], maxHops: 2 },
            usage: { inputTokens: 14, outputTokens: 3 },
          } as never;
        },
        modelUsageSink: { emit(event) { events.push(event); } },
        resolveModel: () => ({}) as never,
      },
      maxOutputTokens: 1_024,
      model: { model: "gpt-5.6-terra", provider: "openai" },
      temperature: 0,
    });

    await assistant.plan(ASSISTANT_INPUT);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      completeness: "complete",
      modelId: "gpt-5.6-terra",
      operation: "recall_plan",
      usage: { inputTokens: 14, outputTokens: 3 },
    });
    expect(calls[0]).toMatchObject({
      maxOutputTokens: 1_024,
      temperature: 0,
    });
  });

  it("uses bounded provider retries and an explicitly supplied model", () => {
    let factoryInput:
      | {
          dependencies?: Record<string, unknown>;
          maxOutputTokens?: number;
          model: AISDKModelConfig;
          temperature?: number;
        }
      | undefined;
    const model = {
      apiKey: "test-key",
      baseURL: "https://ai.gurkiai.com/v1",
      model: "gpt-5.6-terra",
      provider: "openai",
    } as const;

    createProviderRecallPlanAssistant({
      createRecallPlanAssistant(input) {
        factoryInput = {
          dependencies: input.dependencies as Record<string, unknown>,
          maxOutputTokens: input.maxOutputTokens,
          model: input.model,
          temperature: input.temperature,
        };
        return { async plan() { return {}; } };
      },
      maxOutputTokens: 1_024,
      model,
      temperature: 0,
    });

    expect(factoryInput?.model).toEqual(model);
    expect(factoryInput?.dependencies?.requestTimeoutMs).toBe(15_000);
    expect(factoryInput?.dependencies?.retryOptions).toEqual({ retryLimit: 3 });
    expect(factoryInput?.maxOutputTokens).toBe(1_024);
    expect(factoryInput?.temperature).toBe(0);
  });
});
