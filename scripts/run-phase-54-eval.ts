#!/usr/bin/env bun
import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase54SmokeDependencies,
  parsePhase54CliOptions,
  resolvePhase54AdapterManifestPath,
  resolvePhase54BenchmarkRoot,
  resolvePhase54FallbackOutputDir,
  resolvePhase54RepoRoot,
} from "./run-phase-54-shared";

const GENERATED_BY = "scripts/run-phase-54-eval.ts";
export const PHASE54_CANONICAL_RUN_ID = "run-phase54-fallback-current";

export interface Phase54EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase54Eval(
  input?: Partial<ReturnType<typeof parsePhase54CliOptions>>,
  dependencies?: Phase54EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase54RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase54BenchmarkRoot(root),
    dependencies: createPhase54SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase54AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase54FallbackOutputDir(root),
    runId: input?.runId ?? PHASE54_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase54Eval(parsePhase54CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
