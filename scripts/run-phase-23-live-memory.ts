import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createInternalGoodMemory,
} from "../src/api/createGoodMemory";
import {
  PHASE_23_PROMOTION_SCENARIO_IDS,
} from "../src/eval/phase23";
import type { EvalSuiteResult } from "../src/eval/suite";
import { runEvalSuite } from "../src/eval/suite";
import { buildStrategyRolloutMetadata } from "../src/eval/strategy-rollout";
import type { RetrievalStrategyPromotionAuthorization } from "../src/eval/strategy-rollout";
import type { RetrievalStrategyRolloutConfig } from "../src/eval/strategy-rollout";
import { createRetrievalPromotionAuthorization } from "../src/eval/strategy-promotion-gate";
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

export interface Phase23LiveMemoryOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase23LiveMemoryDependencies {
  createAuthorization?: typeof createRetrievalPromotionAuthorization;
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createJudgeModel?: typeof createProviderJudgeModel;
  createMemory?: typeof createInternalGoodMemory;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
  createRecallRouter?: typeof createProviderRecallRouter;
  createTextGenerator?: typeof createProviderTextGenerator;
  runSuite?: typeof runEvalSuite;
  writeFileImpl?: typeof writeFile;
}

export interface Phase23LiveMemoryReport {
  assist: EvalSuiteResult;
  authorization: RetrievalStrategyPromotionAuthorization;
  authorizationPath: string;
  observe: EvalSuiteResult;
  outputDir: string;
  promote: EvalSuiteResult;
}

export function resolvePhase23LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-23");
}

function resolvePhase23LiveMemoryScenarioIds(explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit)];
  }

  return [...PHASE_23_PROMOTION_SCENARIO_IDS];
}

function resolvePhase23BaseRunId(runId?: string): string {
  return runId ?? `run-${Date.now()}`;
}

function resolvePhase23RunId(
  baseRunId: string,
  suffix: "assist" | "observe" | "promote",
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

async function runPhase23LiveMemoryMode(input: {
  authorization?: RetrievalStrategyPromotionAuthorization;
  baseRunId: string;
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createJudgeModel: typeof createProviderJudgeModel;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  createRecallRouter: typeof createProviderRecallRouter;
  createTextGenerator: typeof createProviderTextGenerator;
  dependencies?: Phase23LiveMemoryDependencies;
  embeddingModel: AISDKModelConfig;
  evalModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  judgeModel: AISDKModelConfig;
  mode: "assist" | "observe" | "promote";
  options?: Phase23LiveMemoryOptions;
  outputDir: string;
  recallRouterModel: AISDKModelConfig;
  root: string;
  runSuite: typeof runEvalSuite;
}): Promise<EvalSuiteResult> {
  const strategyRollout =
    input.mode === "promote"
      ? {
          family: "retrieval" as const,
          mode: "promote" as const,
          promotedStrategy: "llm-assisted" as const,
          promotionAuthorization: input.authorization!,
        }
      : {
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
    runId: resolvePhase23RunId(input.baseRunId, input.mode),
    limit: input.options?.limit,
    scenarioIds: resolvePhase23LiveMemoryScenarioIds(input.options?.scenarioIds),
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
    createMemory: ({ persona, scopeNamespace, strategyRollout: runtimeStrategyRollout }) => {
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
          ...(runtimeStrategyRollout &&
          (runtimeStrategyRollout.family ?? "retrieval") === "retrieval"
            ? {
                retrievalStrategyRollout:
                  runtimeStrategyRollout as RetrievalStrategyRolloutConfig,
              }
            : {}),
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
    strategies: input.mode === "promote" ? ["auto"] : ["llm-assisted"],
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

export async function runPhase23LiveMemoryEval(
  input?: Phase23LiveMemoryOptions,
  dependencies?: Phase23LiveMemoryDependencies,
): Promise<Phase23LiveMemoryReport> {
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
  const createAuthorization =
    dependencies?.createAuthorization ?? createRetrievalPromotionAuthorization;
  const writeFileImpl = dependencies?.writeFileImpl ?? writeFile;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const outputDir = input?.outputDir ?? resolvePhase23LiveMemoryOutputDir(root);
  const baseRunId = resolvePhase23BaseRunId(input?.runId);

  const observe = await runPhase23LiveMemoryMode({
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
  const assist = await runPhase23LiveMemoryMode({
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
  const authorization = createAuthorization({
    generatedBy: "scripts/run-phase-23-live-memory.ts",
    observe: {
      runDirectory: observe.runDirectory,
      runId: observe.runId,
      summary: observe.summary,
    },
    runDirectory: assist.runDirectory,
    runId: assist.runId,
    summary: assist.summary,
  });
  const authorizationPath = join(
    assist.runDirectory,
    "strategy-promotion-authorization.json",
  );
  await writeFileImpl(
    authorizationPath,
    `${JSON.stringify(authorization, null, 2)}\n`,
  );

  const promote = await runPhase23LiveMemoryMode({
    authorization,
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
    mode: "promote",
    options: input,
    outputDir,
    recallRouterModel,
    root,
    runSuite,
  });

  return {
    assist,
    authorization,
    authorizationPath,
    observe,
    outputDir,
    promote,
  };
}

function parsePhase23LiveMemoryCliOptions(argv: string[]): Phase23LiveMemoryOptions {
  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(argv, "--output-dir"),
    runId: resolveFlagValue(argv, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
  };
}

async function main(): Promise<void> {
  const options = parsePhase23LiveMemoryCliOptions(process.argv);
  const report = await runPhase23LiveMemoryEval(options);
  console.log(
    JSON.stringify(
      {
        authorizationPath: report.authorizationPath,
        observe: {
          runDirectory: report.observe.runDirectory,
          runId: report.observe.runId,
          summary: report.observe.summary,
        },
        assist: {
          runDirectory: report.assist.runDirectory,
          runId: report.assist.runId,
          summary: report.assist.summary,
        },
        promote: {
          runDirectory: report.promote.runDirectory,
          runId: report.promote.runId,
          summary: report.promote.summary,
        },
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
