import { join } from "node:path";
import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemoryConfig } from "../src/api/contracts";
import type {
  BehavioralAdaptationMemoryFactory,
  BehavioralAdaptationReport,
  BehavioralAnswerGenerator,
  RunBehavioralAdaptationEvaluationOptions,
} from "../src/eval/behavioral-adaptation";
import { runBehavioralAdaptationEvaluation } from "../src/eval/behavioral-adaptation";
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
  resolvePhase25FixtureDir,
  type Phase25EvalOptions,
} from "./run-phase-25-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase25LiveMemoryDependencies {
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createMemory?: typeof createInternalGoodMemory;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
  createTextGenerator?: typeof createProviderTextGenerator;
  runEvaluation?: (
    input: RunBehavioralAdaptationEvaluationOptions,
  ) => Promise<BehavioralAdaptationReport>;
}

const GENERATED_BY = "scripts/run-phase-25-live-memory.ts";

export function resolvePhase25LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-25");
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

function buildLivePrompt(input: Parameters<BehavioralAnswerGenerator>[0]): string {
  if (input.fixture.paradigm === "priming") {
    return [
      "Return exactly three codenames, one per line.",
      input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
      `Probe:\n${input.prompt}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "Return valid JSON with keys answer and first_action.",
    "first_action.kind must be tool_call, command, or warning.",
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    `Probe:\n${input.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildLiveAnswerGenerator(input: {
  createTextGenerator: typeof createProviderTextGenerator;
  evalModel: AISDKModelConfig;
}): BehavioralAnswerGenerator {
  const generator = input.createTextGenerator({
    model: input.evalModel,
    system:
      "You are a strict first-action evaluator. Follow output format instructions exactly.",
    promptBuilder: (payload) => payload.prompt,
  });

  return async (payload) => {
    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      prompt: buildLivePrompt(payload),
      transcript: "",
      memoryContext: payload.memoryContext,
    });

    if (payload.fixture.paradigm === "priming") {
      return {
        answer: result.content.trim(),
      };
    }

    const parsed = JSON.parse(result.content) as {
      answer?: string;
      first_action?: {
        args?: string[];
        kind?: "command" | "tool_call" | "warning";
        name?: string;
        raw?: string;
      };
    };

    return {
      answer: parsed.answer ?? result.content.trim(),
      first_action:
        parsed.first_action?.kind && parsed.first_action?.name
          ? {
              kind: parsed.first_action.kind,
              name: parsed.first_action.name,
              ...(parsed.first_action.args ? { args: parsed.first_action.args } : {}),
              ...(parsed.first_action.raw ? { raw: parsed.first_action.raw } : {}),
            }
          : undefined,
    };
  };
}

function buildLiveMemoryFactory(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): BehavioralAdaptationMemoryFactory {
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
    const memory = input.createMemory(config, {
      behavioralOutcomeRecorder: true,
    });

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

export async function runPhase25LiveMemoryEval(
  input?: Phase25EvalOptions,
  dependencies?: Phase25LiveMemoryDependencies,
): Promise<BehavioralAdaptationReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  const extractorModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );
  const createEmbeddingAdapter =
    dependencies?.createEmbeddingAdapter ?? createProviderEmbeddingAdapter;
  const createMemory = dependencies?.createMemory ?? createInternalGoodMemory;
  const createMemoryExtractor =
    dependencies?.createMemoryExtractor ?? createProviderMemoryExtractor;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const runEvaluation = dependencies?.runEvaluation ?? runBehavioralAdaptationEvaluation;

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
    fixtureDir: resolvePhase25FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "live-memory",
    outputDir: input?.outputDir ?? resolvePhase25LiveMemoryOutputDir(root),
    runId: input?.runId,
    scopePrefix: "phase25",
  });
}

export function parsePhase25LiveMemoryCliOptions(
  argv: readonly string[],
): Phase25EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase25LiveMemoryEval(
    parsePhase25LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
