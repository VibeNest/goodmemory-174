import type {
  ImplicitMemBenchResearchReport,
  ImplicitMemBenchResearchDependencies,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import { runImplicitMemBenchGoodMemoryEval } from "../src/eval/implicitmembench-research";
import {
  createPhase52LiveDependencies,
  parsePhase52CliOptions,
  resolvePhase52AdapterManifestPath,
  resolvePhase52BenchmarkRoot,
  resolvePhase52LiveMemoryOutputDir,
  resolvePhase52RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-52-shared";

export const PHASE52_CANONICAL_LIVE_RUN_ID = "run-phase52-live-current";
const GENERATED_BY = "scripts/run-phase-52-live-memory.ts";

export interface Phase52LiveMemoryDependencies extends Phase49LiveDependencyFactories {
  researchDependencies?: ImplicitMemBenchResearchDependencies;
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase52LiveMemoryEval(
  input?: Partial<ReturnType<typeof parsePhase52CliOptions>>,
  dependencies?: Phase52LiveMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase52RepoRoot();
  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot: input?.benchmarkRoot ?? resolvePhase52BenchmarkRoot(root),
    dependencies:
      dependencies?.researchDependencies ??
      createPhase52LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase52AdapterManifestPath(root),
    mode: "live",
    outputDir: input?.outputDir ?? resolvePhase52LiveMemoryOutputDir(root),
    runId: input?.runId ?? PHASE52_CANONICAL_LIVE_RUN_ID,
  });
}

async function main(): Promise<void> {
  const report = await runPhase52LiveMemoryEval(
    parsePhase52CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
