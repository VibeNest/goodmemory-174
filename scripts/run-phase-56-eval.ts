#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase56SmokeDependencies,
  parsePhase56CliOptions,
  resolvePhase56AdapterManifestPath,
  resolvePhase56BenchmarkRoot,
  resolvePhase56FallbackOutputDir,
  resolvePhase56RepoRoot,
} from "./run-phase-56-shared";

const GENERATED_BY = "scripts/run-phase-56-eval.ts";
export const PHASE56_CANONICAL_RUN_ID = "run-phase56-fallback-current";

export interface Phase56EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase56Eval(
  input?: Partial<ReturnType<typeof parsePhase56CliOptions>>,
  dependencies?: Phase56EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase56RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase56BenchmarkRoot(root),
    dependencies: createPhase56SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase56AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase56FallbackOutputDir(root),
    runId: input?.runId ?? PHASE56_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase56Eval(parsePhase56CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
