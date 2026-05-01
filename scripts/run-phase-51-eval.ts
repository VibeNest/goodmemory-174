import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase51SmokeDependencies,
  parsePhase51CliOptions,
  resolvePhase51AdapterManifestPath,
  resolvePhase51BenchmarkRoot,
  resolvePhase51FallbackOutputDir,
  resolvePhase51RepoRoot,
} from "./run-phase-51-shared";

const GENERATED_BY = "scripts/run-phase-51-eval.ts";
export const PHASE51_CANONICAL_RUN_ID = "run-phase51-fallback-current";

export interface Phase51EvalDependencies {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase51Eval(
  input?: Partial<ReturnType<typeof parsePhase51CliOptions>>,
  dependencies?: Phase51EvalDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase51RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase51BenchmarkRoot(root),
    dependencies: createPhase51SmokeDependencies(),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase51AdapterManifestPath(root),
    mode: "smoke",
    outputDir: input?.outputDir ?? resolvePhase51FallbackOutputDir(root),
    runId: input?.runId ?? PHASE51_CANONICAL_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase51Eval(parsePhase51CliOptions(process.argv));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
