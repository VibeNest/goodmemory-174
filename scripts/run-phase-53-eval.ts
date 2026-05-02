#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase53SmokeDependencies,
  parsePhase53CliOptions,
  resolvePhase53AdapterManifestPath,
  resolvePhase53BenchmarkRoot,
  resolvePhase53FallbackOutputDir,
  resolvePhase53RepoRoot,
} from "./run-phase-53-shared";

const GENERATED_BY = "scripts/run-phase-53-eval.ts";
export const PHASE53_CANONICAL_RUN_ID = "run-phase53-fallback-current";

export interface Phase53EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase53Eval(
  input?: Partial<ReturnType<typeof parsePhase53CliOptions>>,
  dependencies?: Phase53EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase53RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase53BenchmarkRoot(root),
    dependencies: createPhase53SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase53AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase53FallbackOutputDir(root),
    runId: input?.runId ?? PHASE53_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase53Eval(parsePhase53CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
