#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase53LiveDependencies,
  parsePhase53CliOptions,
  resolvePhase53AdapterManifestPath,
  resolvePhase53BenchmarkRoot,
  resolvePhase53LiveMemoryOutputDir,
  resolvePhase53RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-53-shared";

export const PHASE53_CANONICAL_LIVE_RUN_ID = "run-phase53-live-current";
const GENERATED_BY = "scripts/run-phase-53-live-memory.ts";

export interface Phase53LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase53LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase53CliOptions>>,
  dependencies?: Phase53LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase53RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase53BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase53LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase53AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase53LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE53_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase53LiveMemoryEval(
    parsePhase53CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
