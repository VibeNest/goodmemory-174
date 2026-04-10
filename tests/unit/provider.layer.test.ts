import { describe, expect, it } from "bun:test";
import type { JudgeModel } from "../../src/eval/judge";
import type { EvalAnswerGenerator } from "../../src/eval/runners";
import {
  createAISDKProviderDescriptor,
  createFallbackProviderDescriptor,
  createProviderJudgeModel,
  createProviderRuntimeMetadata,
  createProviderTextGenerator,
} from "../../src/provider/layer";

describe("provider layer contract", () => {
  it("builds explicit runtime metadata for fallback and live provider targets", () => {
    expect(
      createProviderRuntimeMetadata({
        generation: createFallbackProviderDescriptor(),
        judge: createFallbackProviderDescriptor(),
      }),
    ).toEqual({
      generationLayer: "fallback",
      generationMode: "fallback",
      judgeLayer: "fallback",
      judgeMode: "fallback",
    });

    expect(
      createProviderRuntimeMetadata({
        generation: createAISDKProviderDescriptor({
          provider: "openai",
          model: "gpt-5",
        }),
        judge: createAISDKProviderDescriptor({
          provider: "anthropic",
          model: "claude-sonnet",
        }),
      }),
    ).toEqual({
      generationLayer: "vercel-ai-sdk",
      generationMode: "live",
      generationModel: "gpt-5",
      generationProvider: "openai",
      judgeLayer: "vercel-ai-sdk",
      judgeMode: "live",
      judgeModel: "claude-sonnet",
      judgeProvider: "anthropic",
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
});
