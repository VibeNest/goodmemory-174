#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase59SmokeDependencies,
  parsePhase59CliOptions,
  resolvePhase59AdapterManifestPath,
  resolvePhase59BenchmarkRoot,
  resolvePhase59FallbackOutputDir,
  resolvePhase59RepoRoot,
} from "./run-phase-59-shared";

const GENERATED_BY = "scripts/run-phase-59-eval.ts";
export const PHASE59_CANONICAL_RUN_ID = "run-phase59-fallback-current";

export interface Phase59EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase59Eval(
  input?: Partial<ReturnType<typeof parsePhase59CliOptions>>,
  dependencies?: Phase59EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase59RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase59BenchmarkRoot(root),
    dependencies: createPhase59SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase59AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase59FallbackOutputDir(root),
    runId: input?.runId ?? PHASE59_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase59Eval(parsePhase59CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
