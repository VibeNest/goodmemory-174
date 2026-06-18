import { join } from "node:path";
import { createGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemoryConfig } from "../src/api/contracts";
import type {
  ImplicitBehaviorAnswerGenerator,
  ImplicitBehaviorMemoryFactory,
  ImplicitBehaviorReport,
  RunImplicitBehaviorEvaluationOptions,
} from "../src/eval/implicit-behavior";
import { runImplicitBehaviorEvaluation } from "../src/eval/implicit-behavior";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
  createProviderTextGenerator,
} from "../src/eval/provider-harness";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import {
  resolveFlagValue,
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
} from "./run-eval";
import {
  resolvePhase24FixtureDir,
  type Phase24EvalOptions,
} from "./run-phase-24-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase24LiveMemoryDependencies {
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createMemory?: typeof createGoodMemory;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
  createTextGenerator?: typeof createProviderTextGenerator;
  runEvaluation?: (
    input: RunImplicitBehaviorEvaluationOptions,
  ) => Promise<ImplicitBehaviorReport>;
}

const GENERATED_BY = "scripts/run-phase-24-live-memory.ts";

export function resolvePhase24LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-24");
}

function resolvePostgresUrl(): string {
  const postgresUrl = process.env.GOODMEMORY_TEST_POSTGRES_URL;
  if (!postgresUrl || postgresUrl.trim().length === 0) {
    throw new Error(
      "Missing required provider-backed eval environment variables: GOODMEMORY_TEST_POSTGRES_URL",
    );
  }

  return postgresUrl;
}

function buildLiveAnswerPrompt(input: Parameters<ImplicitBehaviorAnswerGenerator>[0]): string {
  return [
    "Answer the final probe with only the first action you would take.",
    "Do not explain that memory was used.",
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    `Probe:\n${input.testProbe}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildLiveAnswerGenerator(input: {
  evalModel: AISDKModelConfig;
  createTextGenerator: typeof createProviderTextGenerator;
}): ImplicitBehaviorAnswerGenerator {
  const generator = input.createTextGenerator({
    model: input.evalModel,
    system:
      "You are a strict first-action agent. Return only the first command, tool, warning, or codename list requested.",
    promptBuilder: (payload) => payload.prompt,
  });

  return async (payload) => {
    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      prompt: buildLiveAnswerPrompt(payload),
      transcript: "",
      memoryContext: payload.memoryContext,
    });

    return result.content;
  };
}

function buildLiveMemoryFactory(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): ImplicitBehaviorMemoryFactory {
  return ({ scope }) => {
    const config: GoodMemoryConfig = {
      storage: {
        provider: "postgres",
        url: input.postgresUrl,
      },
      adapters: {
        embeddingAdapter: input.createEmbeddingAdapter({
          model: input.embeddingModel,
        }),
        assistedExtractor: input.createMemoryExtractor({
          model: input.extractorModel,
        }),
      },
    };
    const memory = input.createMemory(config);

    return {
      memory,
      cleanup: async () => {
        await memory.deleteAllMemory({
          scope: {
            userId: scope.userId,
            workspaceId: scope.workspaceId,
          },
          includeRuntime: true,
        });
      },
    };
  };
}

export async function runPhase24LiveMemoryEval(
  input?: Phase24EvalOptions,
  dependencies?: Phase24LiveMemoryDependencies,
): Promise<ImplicitBehaviorReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  const extractorModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );
  const createEmbeddingAdapter =
    dependencies?.createEmbeddingAdapter ?? createProviderEmbeddingAdapter;
  const createMemory = dependencies?.createMemory ?? createGoodMemory;
  const createMemoryExtractor =
    dependencies?.createMemoryExtractor ?? createProviderMemoryExtractor;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const runEvaluation = dependencies?.runEvaluation ?? runImplicitBehaviorEvaluation;

  return runEvaluation({
    answerGenerator: buildLiveAnswerGenerator({
      createTextGenerator,
      evalModel,
    }),
    createMemory: buildLiveMemoryFactory({
      createEmbeddingAdapter,
      createMemory,
      createMemoryExtractor,
      embeddingModel,
      extractorModel,
      postgresUrl: resolvePostgresUrl(),
    }),
    fixtureDir: resolvePhase24FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "live-memory",
    outputDir: input?.outputDir ?? resolvePhase24LiveMemoryOutputDir(root),
    runId: input?.runId,
  });
}

export function parsePhase24LiveMemoryCliOptions(
  argv: readonly string[],
): Phase24EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase24LiveMemoryEval(
    parsePhase24LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
