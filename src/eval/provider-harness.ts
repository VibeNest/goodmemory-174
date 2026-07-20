// Eval-facing harness glue: builds provider-backed text generators and judge
// models for the evaluation suite. These wrappers live in `eval/` (not
// `provider/`) on purpose — their bodies construct eval harness components
// (`EvalAnswerGenerator`, `JudgeModel`), so keeping them here lets `provider/`
// stay free of any `eval/` import and keeps the dependency direction
// one-way (eval → provider). See architecture.boundaries.test.ts.
import type { AISDKModelConfig } from "../provider/ai-sdk-runtime";
import type { ModelUsageSink } from "../provider/model-usage";
import {
  buildProviderRequestDependencies,
  type ProviderRequestDependencies,
} from "../provider/layer";
import { createEvalAnswerGenerator } from "./answer-generator";
import { createEvalJudgeModel } from "./judge-model";
import type { JudgeModel } from "./judge";
import type {
  EvalAnswerGenerator,
  EvalAnswerGeneratorInput,
} from "./runners";

// Re-export the provider-layer surface so eval scripts can resolve every
// provider-backed factory plus these harness wrappers from a single module.
export * from "../provider/layer";

interface ProviderTextGeneratorFactory {
  (input: {
    dependencies?: ProviderRequestDependencies;
    model: AISDKModelConfig;
    system?: string;
    promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  }): EvalAnswerGenerator;
}

interface ProviderJudgeModelFactory {
  (input: {
    dependencies?: ProviderRequestDependencies;
    model: AISDKModelConfig;
    system?: string;
  }): JudgeModel;
}

export function createProviderTextGenerator(input: {
  model: AISDKModelConfig;
  modelUsageSink?: ModelUsageSink;
  system?: string;
  promptBuilder?: (input: EvalAnswerGeneratorInput) => string;
  createTextGenerator?: ProviderTextGeneratorFactory;
  requestTimeoutMs?: number;
}): EvalAnswerGenerator {
  return (input.createTextGenerator ?? createEvalAnswerGenerator)({
    dependencies: buildProviderRequestDependencies(
      input.requestTimeoutMs,
      input.modelUsageSink,
    ),
    model: input.model,
    system: input.system,
    promptBuilder: input.promptBuilder,
  });
}

export function createProviderJudgeModel(input: {
  model: AISDKModelConfig;
  modelUsageSink?: ModelUsageSink;
  system?: string;
  createJudgeModel?: ProviderJudgeModelFactory;
  requestTimeoutMs?: number;
}): JudgeModel {
  return (input.createJudgeModel ?? createEvalJudgeModel)({
    dependencies: buildProviderRequestDependencies(
      input.requestTimeoutMs,
      input.modelUsageSink,
    ),
    model: input.model,
    system: input.system,
  });
}
