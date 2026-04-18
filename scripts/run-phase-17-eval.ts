import { join } from "node:path";
import {
  createPhase17FallbackCreateMemory,
  PHASE_17_FALLBACK_SCENARIO_IDS,
} from "../src/eval/phase17";
import type { EvalSuiteResult } from "../src/eval/suite";
import { runEvalSuite } from "../src/eval/suite";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
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

export interface Phase17EvalOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase17EvalDependencies {
  runSuite?: typeof runEvalSuite;
}

export function resolvePhase17FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-17");
}

export function resolvePhase17FallbackScenarioIds(explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit)];
  }

  return [...PHASE_17_FALLBACK_SCENARIO_IDS];
}

export async function runPhase17FallbackEval(
  input?: Phase17EvalOptions,
  dependencies?: Phase17EvalDependencies,
): Promise<EvalSuiteResult> {
  const root = new URL("..", import.meta.url).pathname;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const strategyRollout = {
    family: "retrieval" as const,
    mode: "observe" as const,
    promotedStrategy: "rules-only" as const,
  };

  return runSuite({
    mode: "fallback",
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir: join(root, "fixtures/scenarios/eval"),
    outputDir: input?.outputDir ?? resolvePhase17FallbackOutputDir(root),
    runId: input?.runId,
    limit: input?.limit,
    scenarioIds: resolvePhase17FallbackScenarioIds(input?.scenarioIds),
    caseIds: input?.caseIds,
    createMemory: createPhase17FallbackCreateMemory(),
    strategies: input?.strategies ?? ["rules-only", "hybrid"],
    rememberExtractionStrategy:
      input?.rememberExtractionStrategy ?? "auto",
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
      strategyRollout: buildStrategyRolloutMetadata(strategyRollout),
    },
  });
}

function parsePhase17CliOptions(argv: string[]): Phase17EvalOptions {
  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(argv, "--output-dir"),
    runId: resolveFlagValue(argv, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
  };
}

async function main(): Promise<void> {
  const options = parsePhase17CliOptions(process.argv);
  const report = await runPhase17FallbackEval(options);
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        runDirectory: report.runDirectory,
        runId: report.runId,
        summary: {
          assertions: report.summary.assertions,
          executionFailures: report.summary.executionFailures,
          promotionGate: report.summary.promotionGate,
          publicSurfaceDecision: report.summary.publicSurfaceDecision?.surfaces,
          regressionDashboardSummary:
            report.summary.regressionDashboardSummary,
          shadowSummary: report.summary.shadowSummary,
          totalCases: report.summary.totalCases,
          winnerCounts: report.summary.winnerCounts,
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
