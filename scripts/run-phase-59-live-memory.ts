#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase59LiveDependencies,
  parsePhase59CliOptions,
  resolvePhase59AdapterManifestPath,
  resolvePhase59BenchmarkRoot,
  resolvePhase59LiveMemoryOutputDir,
  resolvePhase59RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-59-shared";

const GENERATED_BY = "scripts/run-phase-59-live-memory.ts";
export const PHASE59_CANONICAL_LIVE_RUN_ID = "run-phase59-live-current";

export interface Phase59LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase59LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase59CliOptions>>,
  dependencies?: Phase59LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase59RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase59BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase59LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase59AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase59LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE59_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase59LiveMemoryEval(
    parsePhase59CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
