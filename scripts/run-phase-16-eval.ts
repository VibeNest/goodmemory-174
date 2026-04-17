import { join } from "node:path";
import {
  createPhase16FallbackCreateMemory,
  PHASE_16_SCENARIO_IDS,
} from "../src/eval/phase16";
import type { EvalSuiteResult } from "../src/eval/suite";
import { runEvalSuite } from "../src/eval/suite";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
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

export interface Phase16EvalOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase16EvalDependencies {
  runSuite?: typeof runEvalSuite;
}

export function resolvePhase16FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-16");
}

export function resolvePhase16ScenarioIds(explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit)];
  }

  return [...PHASE_16_SCENARIO_IDS];
}

export async function runPhase16FallbackEval(
  input?: Phase16EvalOptions,
  dependencies?: Phase16EvalDependencies,
): Promise<EvalSuiteResult> {
  const root = new URL("..", import.meta.url).pathname;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;

  return runSuite({
    mode: "fallback",
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir: join(root, "fixtures/scenarios/eval"),
    outputDir: input?.outputDir ?? resolvePhase16FallbackOutputDir(root),
    runId: input?.runId,
    limit: input?.limit,
    scenarioIds: resolvePhase16ScenarioIds(input?.scenarioIds),
    caseIds: input?.caseIds,
    createMemory: createPhase16FallbackCreateMemory(),
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
    runtime: {
      ...createProviderRuntimeMetadata({
        generation: createFallbackAdapterDescriptor(),
        judge: createFallbackAdapterDescriptor(),
      }),
      memoryBackend: "in-memory",
      embeddingEnabled: false,
      assistedExtractionEnabled: false,
    },
  });
}

function parsePhase16CliOptions(argv: string[]): Phase16EvalOptions {
  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
    outputDir: resolveFlagValue(argv, "--output-dir"),
    runId: resolveFlagValue(argv, "--run-id"),
  };
}

async function main(): Promise<void> {
  const options = parsePhase16CliOptions(process.argv);
  const report = await runPhase16FallbackEval(options);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
