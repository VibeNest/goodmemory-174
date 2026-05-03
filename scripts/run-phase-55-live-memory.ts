#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase55LiveDependencies,
  parsePhase55CliOptions,
  resolvePhase55AdapterManifestPath,
  resolvePhase55BenchmarkRoot,
  resolvePhase55LiveMemoryOutputDir,
  resolvePhase55RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-55-shared";

export const PHASE55_CANONICAL_LIVE_RUN_ID = "run-phase55-live-current";
const GENERATED_BY = "scripts/run-phase-55-live-memory.ts";

export interface Phase55LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase55LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase55CliOptions>>,
  dependencies?: Phase55LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase55RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase55BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase55LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase55AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase55LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE55_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase55LiveMemoryEval(
    parsePhase55CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
