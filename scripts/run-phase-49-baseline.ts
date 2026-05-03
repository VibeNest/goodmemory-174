import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchBaselineOptions,
} from "../src/eval/implicitmembench-research";
import {
  createImplicitMemBenchSmokeDependencies,
  runImplicitMemBenchBaselineEval,
} from "../src/eval/implicitmembench-research";
import {
  parsePhase49CliOptions,
  resolvePhase49AdapterManifestPath,
  resolvePhase49BaselineOutputDir,
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  resolvePhase49SmokeBenchmarkRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

const GENERATED_BY = "scripts/run-phase-49-baseline.ts";

export interface Phase49BaselineDependencies extends Phase49LiveDependencyFactories {
  runEvaluation?: (
    input: RunImplicitMemBenchBaselineOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase49BaselineEval(
  input?: ReturnType<typeof parsePhase49CliOptions>,
  dependencies?: Phase49BaselineDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase49RepoRoot();
  const smoke = input?.smoke ?? false;
  const benchmarkRoot =
    input?.benchmarkRoot ??
    (smoke ? resolvePhase49SmokeBenchmarkRoot(root) : undefined);
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 49 baseline eval requires --benchmark-root or GOODMEMORY_IMPLICITMEMBENCH_ROOT unless --smoke is set.",
    );
  }

  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchBaselineEval;

  return runEvaluation({
    benchmarkRoot,
    dependencies: smoke
      ? createImplicitMemBenchSmokeDependencies()
      : resolvePhase49LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase49AdapterManifestPath(root),
    maxConcurrency: input?.maxConcurrency,
    mode: smoke ? "smoke" : "live",
    outputDir: input?.outputDir ?? resolvePhase49BaselineOutputDir(root),
    runId: input?.runId,
  });
}

async function main(): Promise<void> {
  const report = await runPhase49BaselineEval(
    parsePhase49CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
