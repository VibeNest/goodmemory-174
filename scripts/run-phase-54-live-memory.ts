#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase54LiveDependencies,
  parsePhase54CliOptions,
  resolvePhase54AdapterManifestPath,
  resolvePhase54BenchmarkRoot,
  resolvePhase54LiveMemoryOutputDir,
  resolvePhase54RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-54-shared";

export const PHASE54_CANONICAL_LIVE_RUN_ID = "run-phase54-live-current";
const GENERATED_BY = "scripts/run-phase-54-live-memory.ts";

export interface Phase54LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase54LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase54CliOptions>>,
  dependencies?: Phase54LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase54RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase54BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase54LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase54AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase54LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE54_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase54LiveMemoryEval(
    parsePhase54CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
