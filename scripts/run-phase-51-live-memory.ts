import type {
  ImplicitMemBenchResearchReport,
  ImplicitMemBenchResearchDependencies,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase51LiveDependencies,
  parsePhase51CliOptions,
  resolvePhase51AdapterManifestPath,
  resolvePhase51BenchmarkRoot,
  resolvePhase51LiveMemoryOutputDir,
  resolvePhase51RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-51-shared";

export const PHASE51_CANONICAL_LIVE_RUN_ID = "run-phase51-live-current";
const GENERATED_BY = "scripts/run-phase-51-live-memory.ts";

export interface Phase51LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase51LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase51CliOptions>>,
  dependencies?: Phase51LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase51RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase51BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase51LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase51AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase51LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE51_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase51LiveMemoryEval(
    parsePhase51CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
