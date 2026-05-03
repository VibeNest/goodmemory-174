#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase57SmokeDependencies,
  parsePhase57CliOptions,
  resolvePhase57AdapterManifestPath,
  resolvePhase57BenchmarkRoot,
  resolvePhase57FallbackOutputDir,
  resolvePhase57RepoRoot,
} from "./run-phase-57-shared";

const GENERATED_BY = "scripts/run-phase-57-eval.ts";
export const PHASE57_CANONICAL_RUN_ID = "run-phase57-fallback-current";

export interface Phase57EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase57Eval(
  input?: Partial<ReturnType<typeof parsePhase57CliOptions>>,
  dependencies?: Phase57EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase57RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase57BenchmarkRoot(root),
    dependencies: createPhase57SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase57AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase57FallbackOutputDir(root),
    runId: input?.runId ?? PHASE57_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase57Eval(parsePhase57CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
