import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createPhase23FallbackCreateMemory,
  PHASE_23_PROMOTION_SCENARIO_IDS,
} from "../src/eval/phase23";
import type { EvalSuiteResult } from "../src/eval/suite";
import { runEvalSuite } from "../src/eval/suite";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
import { createRetrievalPromotionAuthorization } from "../src/eval/strategy-promotion-gate";
import type { RetrievalStrategyPromotionAuthorization } from "../src/eval/strategy-rollout";
import { buildStrategyRolloutMetadata } from "../src/eval/strategy-rollout";
import {
  createFallbackAdapterDescriptor,
  createProviderRuntimeMetadata,
} from "../src/provider/layer";
import type { FixtureEvalOptions } from "./run-eval";
import {
  buildFallbackGoodMemoryAnswer,
  buildFallbackJudgeContent,
  resolveFlagValue,
  resolveRepeatedFlagValues,
} from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase23EvalOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase23EvalDependencies {
  createAuthorization?: typeof createRetrievalPromotionAuthorization;
  runSuite?: typeof runEvalSuite;
  writeFileImpl?: typeof writeFile;
}

export interface Phase23EvalReport {
  assist: EvalSuiteResult;
  authorization: RetrievalStrategyPromotionAuthorization;
  authorizationPath: string;
  observe: EvalSuiteResult;
  outputDir: string;
  promote: EvalSuiteResult;
}

export function resolvePhase23FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-23");
}

export function resolvePhase23PromotionScenarioIds(explicit?: string[]): string[] {
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

async function runPhase23FallbackMode(input: {
  baseRunId: string;
  createMemory: ReturnType<typeof createPhase23FallbackCreateMemory>;
  mode: "assist" | "observe";
  options?: Phase23EvalOptions;
  outputDir: string;
  root: string;
  runSuite: typeof runEvalSuite;
}): Promise<EvalSuiteResult> {
  const strategyRollout = {
    family: "retrieval" as const,
    mode: input.mode,
    promotedStrategy: "rules-only" as const,
  };

  return input.runSuite({
    mode: "fallback",
    personaDir: join(input.root, "fixtures/personas/eval"),
    scenarioDir: join(input.root, "fixtures/scenarios/eval"),
    outputDir: input.outputDir,
    runId: resolvePhase23RunId(input.baseRunId, input.mode),
    limit: input.options?.limit,
    scenarioIds: resolvePhase23PromotionScenarioIds(input.options?.scenarioIds),
    caseIds: input.options?.caseIds,
    createMemory: input.createMemory,
    strategies: ["llm-assisted"],
    rememberExtractionStrategy:
      input.options?.rememberExtractionStrategy ?? "auto",
    baselineGenerator: async () => ({
      content: "I need more context before I can answer reliably.",
    }),
    goodmemoryGenerator: async (payload: EvalAnswerGeneratorInput) => ({
      content: buildFallbackGoodMemoryAnswer(payload),
    }),
    judge: {
      async complete({ prompt }: { prompt: string }) {
        return {
          content: buildFallbackJudgeContent(prompt),
        };
      },
    },
    strategyRollout,
    runtime: {
      ...createProviderRuntimeMetadata({
        generation: createFallbackAdapterDescriptor(),
        judge: createFallbackAdapterDescriptor(),
      }),
      memoryBackend: "in-memory",
      embeddingEnabled: true,
      assistedExtractionEnabled: false,
      assistedRecallRouterEnabled: true,
      strategyRollout: buildStrategyRolloutMetadata(strategyRollout),
    },
  });
}

async function runPhase23FallbackPromoteMode(input: {
  authorization: RetrievalStrategyPromotionAuthorization;
  baseRunId: string;
  createMemory: ReturnType<typeof createPhase23FallbackCreateMemory>;
  options?: Phase23EvalOptions;
  outputDir: string;
  root: string;
  runSuite: typeof runEvalSuite;
}): Promise<EvalSuiteResult> {
  const strategyRollout = {
    family: "retrieval" as const,
    mode: "promote" as const,
    promotedStrategy: "llm-assisted" as const,
    promotionAuthorization: input.authorization,
  };

  return input.runSuite({
    mode: "fallback",
    personaDir: join(input.root, "fixtures/personas/eval"),
    scenarioDir: join(input.root, "fixtures/scenarios/eval"),
    outputDir: input.outputDir,
    runId: resolvePhase23RunId(input.baseRunId, "promote"),
    limit: input.options?.limit,
    scenarioIds: resolvePhase23PromotionScenarioIds(input.options?.scenarioIds),
    caseIds: input.options?.caseIds,
    createMemory: input.createMemory,
    strategies: ["auto"],
    rememberExtractionStrategy:
      input.options?.rememberExtractionStrategy ?? "auto",
    baselineGenerator: async () => ({
      content: "I need more context before I can answer reliably.",
    }),
    goodmemoryGenerator: async (payload: EvalAnswerGeneratorInput) => ({
      content: buildFallbackGoodMemoryAnswer(payload),
    }),
    judge: {
      async complete({ prompt }: { prompt: string }) {
        return {
          content: buildFallbackJudgeContent(prompt),
        };
      },
    },
    strategyRollout,
    runtime: {
      ...createProviderRuntimeMetadata({
        generation: createFallbackAdapterDescriptor(),
        judge: createFallbackAdapterDescriptor(),
      }),
      memoryBackend: "in-memory",
      embeddingEnabled: true,
      assistedExtractionEnabled: false,
      assistedRecallRouterEnabled: true,
      strategyRollout: buildStrategyRolloutMetadata(strategyRollout),
    },
  });
}

export async function runPhase23FallbackEval(
  input?: Phase23EvalOptions,
  dependencies?: Phase23EvalDependencies,
): Promise<Phase23EvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const createAuthorization =
    dependencies?.createAuthorization ?? createRetrievalPromotionAuthorization;
  const writeFileImpl = dependencies?.writeFileImpl ?? writeFile;
  const outputDir = input?.outputDir ?? resolvePhase23FallbackOutputDir(root);
  const baseRunId = resolvePhase23BaseRunId(input?.runId);
  const createMemory = createPhase23FallbackCreateMemory();

  const observe = await runPhase23FallbackMode({
    baseRunId,
    createMemory,
    mode: "observe",
    options: input,
    outputDir,
    root,
    runSuite,
  });
  const assist = await runPhase23FallbackMode({
    baseRunId,
    createMemory,
    mode: "assist",
    options: input,
    outputDir,
    root,
    runSuite,
  });
  const authorization = createAuthorization({
    generatedBy: "scripts/run-phase-23-eval.ts",
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

  const promote = await runPhase23FallbackPromoteMode({
    authorization,
    baseRunId,
    createMemory,
    options: input,
    outputDir,
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

function parsePhase23CliOptions(argv: string[]): Phase23EvalOptions {
  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(argv, "--output-dir"),
    runId: resolveFlagValue(argv, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
  };
}

async function main(): Promise<void> {
  const options = parsePhase23CliOptions(process.argv);
  const report = await runPhase23FallbackEval(options);
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
