import { describe, expect, it } from "bun:test";
import type { JudgeModel } from "../../src/eval/judge";
import type { EmbeddingAdapter } from "../../src/embedding/contracts";
import type { EvalAnswerGenerator } from "../../src/eval/runners";
import type { RecallRouterAssistant } from "../../src/recall/assistant";
import type { MemoryExtractor } from "../../src/remember/candidates";
import {
  createFallbackAdapterDescriptor,
  createLiveAdapterDescriptor,
  createProviderEmbeddingAdapter,
  createProviderJudgeModel,
  createProviderMemoryExtractor,
  createProviderRecallRouter,
  createProviderRuntimeMetadata,
  createProviderTextGenerator,
} from "../../src/provider/layer";

describe("provider layer contract", () => {
  it("builds explicit runtime metadata for fallback and live provider targets", () => {
    expect(
      createProviderRuntimeMetadata({
        generation: createFallbackAdapterDescriptor(),
        judge: createFallbackAdapterDescriptor(),
      }),
    ).toEqual({
      generationAdapter: "fallback",
      generationMode: "fallback",
      judgeAdapter: "fallback",
      judgeMode: "fallback",
    });

    expect(
      createProviderRuntimeMetadata({
        generation: createLiveAdapterDescriptor({
          providerId: "openai",
          modelId: "gpt-5",
        }),
        judge: createLiveAdapterDescriptor({
          providerId: "anthropic",
          modelId: "claude-sonnet",
        }),
      }),
    ).toEqual({
      generationAdapter: "live-adapter",
      generationMode: "live",
      generationModelId: "gpt-5",
      generationProviderId: "openai",
      judgeAdapter: "live-adapter",
      judgeMode: "live",
      judgeModelId: "claude-sonnet",
      judgeProviderId: "anthropic",
    });
  });

  it("routes provider-backed text and judge creation through one internal contract", async () => {
    const textCalls: Array<Record<string, unknown>> = [];
    const judgeCalls: Array<Record<string, unknown>> = [];

    const textGenerator = createProviderTextGenerator({
      model: {
        provider: "openai",
        model: "gpt-5",
      },
      system: "provider-system",
      createTextGenerator: (input) => {
        textCalls.push(input as unknown as Record<string, unknown>);
        const generator: EvalAnswerGenerator = async () => ({
          content: "provider-answer",
        });
        return generator;
      },
    });
    const judgeModel = createProviderJudgeModel({
      model: {
        provider: "anthropic",
        model: "claude-sonnet",
      },
      createJudgeModel: (input) => {
        judgeCalls.push(input as unknown as Record<string, unknown>);
        const judge: JudgeModel = {
          async complete() {
            return {
              content: "{\"winner\":\"tie\",\"scores\":{\"factual_recall\":7,\"preference_consistency\":7,\"cross_domain_transfer\":7,\"contamination_penalty\":7,\"update_correctness\":7,\"personalization_usefulness\":7,\"provenance_explainability\":7},\"reasoning\":\"ok\",\"failure_tags\":[]}",
            };
          },
        };

        return judge;
      },
    });

    const textResult = await textGenerator({
      persona: {} as never,
      scenario: {} as never,
      prompt: "continue",
      transcript: "user: hi",
    });
    const judgeResult = await judgeModel.complete({
      purpose: "judge",
      prompt: "judge this",
    });

    expect(textResult.content).toBe("provider-answer");
    expect(judgeResult.content).toContain("\"winner\":\"tie\"");
    expect(textCalls[0]?.model).toEqual({
      provider: "openai",
      model: "gpt-5",
    });
    expect(judgeCalls[0]?.model).toEqual({
      provider: "anthropic",
      model: "claude-sonnet",
    });
  });

  it("routes provider-backed memory extraction through the same provider layer", async () => {
    const extractorCalls: Array<Record<string, unknown>> = [];

    const extractor = createProviderMemoryExtractor({
      model: {
        provider: "openai",
        model: "gpt-5",
      },
      createMemoryExtractor: (input) => {
        extractorCalls.push(input as unknown as Record<string, unknown>);
        const memoryExtractor: MemoryExtractor = {
          async extract() {
            return {
              candidates: [],
              ignoredMessageCount: 1,
            };
          },
        };

        return memoryExtractor;
      },
    });

    const result = await extractor.extract({
      scope: { userId: "u-1" },
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.ignoredMessageCount).toBe(1);
    expect(extractorCalls[0]?.model).toEqual({
      provider: "openai",
      model: "gpt-5",
    });
  });

  it("routes provider-backed embedding creation through the same provider layer", async () => {
    const embeddingCalls: Array<Record<string, unknown>> = [];

    const adapter = createProviderEmbeddingAdapter({
      model: {
        provider: "openai",
        model: "text-embedding-3-small",
      },
      createEmbeddingAdapter: (input) => {
        embeddingCalls.push(input as unknown as Record<string, unknown>);
        const embeddingAdapter: EmbeddingAdapter = {
          async embed(texts) {
            return texts.map(() => [1, 0, 0]);
          },
        };

        return embeddingAdapter;
      },
    });

    const vectors = await adapter.embed(["alpha"]);

    expect(vectors).toEqual([[1, 0, 0]]);
    expect(embeddingCalls[0]?.model).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
    });
  });

  it("routes provider-backed recall router creation through the same provider layer", async () => {
    const routerCalls: Array<Record<string, unknown>> = [];

    const router = createProviderRecallRouter({
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
      },
      createRecallRouter: (input) => {
        routerCalls.push(input as unknown as Record<string, unknown>);
        const recallRouter: RecallRouterAssistant = {
          async plan() {
            return {
              querySummary: "refined query",
              rationale: "provider-routed plan",
            };
          },
          async rerank() {
            return {
              orderedCandidateIds: ["fact-1"],
              rationale: "provider-routed rerank",
            };
          },
        };

        return recallRouter;
      },
    });

    const plan = await router.plan({
      locale: "en",
      query: "what is the blocker",
      routingDecision: {
        retrievalProfile: "general_chat",
        intent: "general_assistance",
        strategy: "llm-assisted",
        strategyExplanation: {
          requestedStrategy: "llm-assisted",
          resolvedStrategy: "llm-assisted",
          summary: "llm assisted",
          hardFloor: "lexical_runtime_procedural_priors",
          semanticTieBreaking: false,
          llmRefinement: true,
        },
        sourcePriorities: ["profile", "feedback", "fact", "episode"],
        requestedSlots: ["blocker"],
        supportSlots: [],
        actionDriving: false,
        referenceSeeking: false,
        continuation: false,
      },
      runtime: {
        hasJournal: false,
        hasWorkingMemory: false,
      },
    });

    expect(plan.querySummary).toBe("refined query");
    expect(routerCalls[0]?.model).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });
});
