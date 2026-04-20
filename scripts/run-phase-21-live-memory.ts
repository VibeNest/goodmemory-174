import { join } from "node:path";
import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import {
  PHASE_21_FALLBACK_SCENARIO_IDS,
} from "../src/eval/phase21";
import type { EvalSuiteResult } from "../src/eval/suite";
import { runEvalSuite } from "../src/eval/suite";
import { buildStrategyRolloutMetadata } from "../src/eval/strategy-rollout";
import {
  buildEvalUserId,
  buildEvalWorkspaceId,
} from "../src/eval/runners";
import {
  createProviderEmbeddingAdapter,
  createProviderJudgeModel,
  createProviderMemoryExtractor,
  createProviderRecallRouter,
  createProviderRuntimeMetadata,
  createProviderTextGenerator,
} from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import type { RecallRouterStrategy } from "../src/recall/router";
import type { FixtureEvalOptions } from "./run-eval";
import {
  buildLiveGoodMemorySystemPrompt,
  resolveEvalMaxConcurrency,
  resolveFlagValue,
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
  resolveRepeatedFlagValues,
} from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase21LiveMemoryOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase21LiveMemoryDependencies {
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createJudgeModel?: typeof createProviderJudgeModel;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
  createRecallRouter?: typeof createProviderRecallRouter;
  createTextGenerator?: typeof createProviderTextGenerator;
  createMemory?: typeof createInternalGoodMemory;
  runSuite?: typeof runEvalSuite;
}

export interface Phase21LiveMemoryReport {
  assist: EvalSuiteResult;
  observe: EvalSuiteResult;
  outputDir: string;
}

const PHASE_21_RECALL_ROUTER_STRATEGIES = [
  "llm-assisted",
] as const satisfies RecallRouterStrategy[];

export function resolvePhase21LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-21");
}

function resolvePhase21LiveMemoryScenarioIds(explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit)];
  }

  return [...PHASE_21_FALLBACK_SCENARIO_IDS];
}

function resolvePhase21BaseRunId(runId?: string): string {
  return runId ?? `run-${Date.now()}`;
}

function resolvePhase21RunId(
  baseRunId: string,
  suffix: "assist" | "observe",
): string {
  return `${baseRunId}-${suffix}`;
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

async function runPhase21LiveMemoryMode(input: {
  baseRunId: string;
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createJudgeModel: typeof createProviderJudgeModel;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  createRecallRouter: typeof createProviderRecallRouter;
  createTextGenerator: typeof createProviderTextGenerator;
  dependencies?: Phase21LiveMemoryDependencies;
  embeddingModel: AISDKModelConfig;
  evalModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  judgeModel: AISDKModelConfig;
  mode: "assist" | "observe";
  options?: Phase21LiveMemoryOptions;
  outputDir: string;
  recallRouterModel: AISDKModelConfig;
  root: string;
  runSuite: typeof runEvalSuite;
}): Promise<EvalSuiteResult> {
  const strategyRollout = {
    family: "retrieval" as const,
    mode: input.mode,
    promotedStrategy: "rules-only" as const,
  };
  const postgresUrl = resolvePostgresUrl();

  return input.runSuite({
    mode: "live",
    personaDir: join(input.root, "fixtures/personas/eval"),
    scenarioDir: join(input.root, "fixtures/scenarios/eval"),
    outputDir: input.outputDir,
    runId: resolvePhase21RunId(input.baseRunId, input.mode),
    limit: input.options?.limit,
    scenarioIds: resolvePhase21LiveMemoryScenarioIds(input.options?.scenarioIds),
    caseIds: input.options?.caseIds,
    baselineGenerator: input.createTextGenerator({
      model: input.evalModel,
      system:
        "Answer using only the visible transcript. If critical history is missing, say that you need more context.",
    }),
    goodmemoryGenerator: input.createTextGenerator({
      model: input.evalModel,
      system: buildLiveGoodMemorySystemPrompt(),
    }),
    judge: input.createJudgeModel({
      model: input.judgeModel,
    }),
    createMemory: ({ persona, scopeNamespace }) => {
      const memory = (input.dependencies?.createMemory ?? input.createMemory)(
        {
          storage: {
            provider: "postgres",
            url: postgresUrl,
          },
          adapters: {
            embeddingAdapter: input.createEmbeddingAdapter({
              model: input.embeddingModel,
            }),
            assistedExtractor: input.createMemoryExtractor({
              model: input.extractorModel,
            }),
          },
        },
        {
          assistedRecallRouter: input.createRecallRouter({
            model: input.recallRouterModel,
          }),
        },
      );

      return {
        memory,
        cleanup: async () => {
          await memory.deleteAllMemory({
            scope: {
              userId: buildEvalUserId(persona, scopeNamespace),
              workspaceId: buildEvalWorkspaceId(persona, scopeNamespace),
            },
            includeRuntime: true,
          });
        },
      };
    },
    maxConcurrency: resolveEvalMaxConcurrency(),
    strategies: input.options?.strategies ?? [...PHASE_21_RECALL_ROUTER_STRATEGIES],
    rememberExtractionStrategy:
      input.options?.rememberExtractionStrategy ?? "auto",
    strategyRollout,
    runtime: {
      ...createProviderRuntimeMetadata({
        generation: {
          adapterId: "live-adapter",
          mode: "live",
          providerId: input.evalModel.provider,
          modelId: input.evalModel.model,
        },
        judge: {
          adapterId: "live-adapter",
          mode: "live",
          providerId: input.judgeModel.provider,
          modelId: input.judgeModel.model,
        },
      }),
      memoryBackend: "provider-backed",
      embeddingEnabled: true,
      assistedExtractionEnabled: true,
      assistedRecallRouterEnabled: true,
      recallRouterProviderId: input.recallRouterModel.provider,
      recallRouterModelId: input.recallRouterModel.model,
      strategyRollout: buildStrategyRolloutMetadata(strategyRollout),
    },
  });
}

export async function runPhase21LiveMemoryEval(
  input?: Phase21LiveMemoryOptions,
  dependencies?: Phase21LiveMemoryDependencies,
): Promise<Phase21LiveMemoryReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const judgeModel = resolveLiveModelConfig("GOODMEMORY_JUDGE");
  const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  const extractorModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );
  const recallRouterModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_RECALL_ROUTER",
  );
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const createJudgeModel =
    dependencies?.createJudgeModel ?? createProviderJudgeModel;
  const createEmbeddingAdapter =
    dependencies?.createEmbeddingAdapter ?? createProviderEmbeddingAdapter;
  const createMemoryExtractor =
    dependencies?.createMemoryExtractor ?? createProviderMemoryExtractor;
  const createRecallRouter =
    dependencies?.createRecallRouter ?? createProviderRecallRouter;
  const createMemory = dependencies?.createMemory ?? createInternalGoodMemory;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const outputDir = input?.outputDir ?? resolvePhase21LiveMemoryOutputDir(root);
  const baseRunId = resolvePhase21BaseRunId(input?.runId);

  const observe = await runPhase21LiveMemoryMode({
    baseRunId,
    createEmbeddingAdapter,
    createJudgeModel,
    createMemory,
    createMemoryExtractor,
    createRecallRouter,
    createTextGenerator,
    dependencies,
    embeddingModel,
    evalModel,
    extractorModel,
    judgeModel,
    mode: "observe",
    options: input,
    outputDir,
    recallRouterModel,
    root,
    runSuite,
  });
  const assist = await runPhase21LiveMemoryMode({
    baseRunId,
    createEmbeddingAdapter,
    createJudgeModel,
    createMemory,
    createMemoryExtractor,
    createRecallRouter,
    createTextGenerator,
    dependencies,
    embeddingModel,
    evalModel,
    extractorModel,
    judgeModel,
    mode: "assist",
    options: input,
    outputDir,
    recallRouterModel,
    root,
    runSuite,
  });

  return {
    assist,
    observe,
    outputDir,
  };
}

function parsePhase21LiveMemoryCliOptions(argv: string[]): Phase21LiveMemoryOptions {
  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(argv, "--output-dir"),
    runId: resolveFlagValue(argv, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
  };
}

async function main(): Promise<void> {
  const options = parsePhase21LiveMemoryCliOptions(process.argv);
  const report = await runPhase21LiveMemoryEval(options);
  console.log(
    JSON.stringify(
      {
        assist: {
          runDirectory: report.assist.runDirectory,
          runId: report.assist.runId,
          summary: {
            executionFailures: report.assist.summary.executionFailures,
            promotionGate: report.assist.summary.promotionGate,
            regressionDashboardSummary:
              report.assist.summary.regressionDashboardSummary,
            totalCases: report.assist.summary.totalCases,
          },
        },
        observe: {
          runDirectory: report.observe.runDirectory,
          runId: report.observe.runId,
          summary: {
            executionFailures: report.observe.summary.executionFailures,
            promotionGate: report.observe.summary.promotionGate,
            regressionDashboardSummary:
              report.observe.summary.regressionDashboardSummary,
            shadowSummary: report.observe.summary.shadowSummary,
            totalCases: report.observe.summary.totalCases,
          },
        },
        outputDir: report.outputDir,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
