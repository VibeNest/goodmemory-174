import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase52SmokeDependencies,
  parsePhase52CliOptions,
  resolvePhase52AdapterManifestPath,
  resolvePhase52BenchmarkRoot,
  resolvePhase52FallbackOutputDir,
  resolvePhase52RepoRoot,
} from "./run-phase-52-shared";

const GENERATED_BY = "scripts/run-phase-52-eval.ts";
export const PHASE52_CANONICAL_RUN_ID = "run-phase52-fallback-current";

export interface Phase52EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase52Eval(
  input?: Partial<ReturnType<typeof parsePhase52CliOptions>>,
  dependencies?: Phase52EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase52RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase52BenchmarkRoot(root),
    dependencies: createPhase52SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase52AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase52FallbackOutputDir(root),
    runId: input?.runId ?? PHASE52_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase52Eval(parsePhase52CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
