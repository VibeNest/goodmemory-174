#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase55SmokeDependencies,
  parsePhase55CliOptions,
  resolvePhase55AdapterManifestPath,
  resolvePhase55BenchmarkRoot,
  resolvePhase55FallbackOutputDir,
  resolvePhase55RepoRoot,
} from "./run-phase-55-shared";

const GENERATED_BY = "scripts/run-phase-55-eval.ts";
export const PHASE55_CANONICAL_RUN_ID = "run-phase55-fallback-current";

export interface Phase55EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase55Eval(
  input?: Partial<ReturnType<typeof parsePhase55CliOptions>>,
  dependencies?: Phase55EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase55RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase55BenchmarkRoot(root),
    dependencies: createPhase55SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase55AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase55FallbackOutputDir(root),
    runId: input?.runId ?? PHASE55_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase55Eval(parsePhase55CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
