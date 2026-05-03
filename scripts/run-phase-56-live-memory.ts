#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase56LiveDependencies,
  parsePhase56CliOptions,
  resolvePhase56AdapterManifestPath,
  resolvePhase56BenchmarkRoot,
  resolvePhase56LiveMemoryOutputDir,
  resolvePhase56RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-56-shared";

export const PHASE56_CANONICAL_LIVE_RUN_ID = "run-phase56-live-current";
const GENERATED_BY = "scripts/run-phase-56-live-memory.ts";

export interface Phase56LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase56LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase56CliOptions>>,
  dependencies?: Phase56LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase56RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase56BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase56LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase56AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase56LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE56_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase56LiveMemoryEval(
    parsePhase56CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
