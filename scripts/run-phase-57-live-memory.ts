#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase57LiveDependencies,
  parsePhase57CliOptions,
  resolvePhase57AdapterManifestPath,
  resolvePhase57BenchmarkRoot,
  resolvePhase57LiveMemoryOutputDir,
  resolvePhase57RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-57-shared";

const GENERATED_BY = "scripts/run-phase-57-live-memory.ts";
export const PHASE57_CANONICAL_LIVE_RUN_ID = "run-phase57-live-current";

export interface Phase57LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase57LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase57CliOptions>>,
  dependencies?: Phase57LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase57RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase57BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase57LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase57AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase57LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE57_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase57LiveMemoryEval(
    parsePhase57CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
