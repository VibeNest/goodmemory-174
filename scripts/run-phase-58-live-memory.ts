#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase58LiveDependencies,
  parsePhase58CliOptions,
  resolvePhase58AdapterManifestPath,
  resolvePhase58BenchmarkRoot,
  resolvePhase58LiveMemoryOutputDir,
  resolvePhase58RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-58-shared";

const GENERATED_BY = "scripts/run-phase-58-live-memory.ts";
export const PHASE58_CANONICAL_LIVE_RUN_ID = "run-phase58-live-current";

export interface Phase58LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase58LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase58CliOptions>>,
  dependencies?: Phase58LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase58RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase58BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase58LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase58AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase58LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE58_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase58LiveMemoryEval(
    parsePhase58CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
