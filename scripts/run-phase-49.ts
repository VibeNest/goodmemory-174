import type {
  ImplicitMemBenchComparisonReport,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchComparisonOptions,
} from "../src/eval/implicitmembench-research";
import {
  createImplicitMemBenchSmokeDependencies,
  runImplicitMemBenchComparisonEval,
} from "../src/eval/implicitmembench-research";
import {
  parsePhase49CliOptions,
  resolvePhase49AdapterManifestPath,
  resolvePhase49ComparisonOutputDir,
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  resolvePhase49SmokeBenchmarkRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

const GENERATED_BY = "scripts/run-phase-49.ts";

export interface Phase49ComparisonDependencies
  extends Phase49LiveDependencyFactories {
  runEvaluation?: (
    input: RunImplicitMemBenchComparisonOptions,
  ) => Promise<{
    baselineReport: ImplicitMemBenchResearchReport;
    comparisonReport: ImplicitMemBenchComparisonReport;
    goodmemoryReport: ImplicitMemBenchResearchReport;
  }>;
}

export async function runPhase49ComparisonEval(
  input?: ReturnType<typeof parsePhase49CliOptions>,
  dependencies?: Phase49ComparisonDependencies,
): Promise<{
  baselineReport: ImplicitMemBenchResearchReport;
  comparisonReport: ImplicitMemBenchComparisonReport;
  goodmemoryReport: ImplicitMemBenchResearchReport;
}> {
  const root = resolvePhase49RepoRoot();
  const smoke = input?.smoke ?? false;
  const benchmarkRoot =
    input?.benchmarkRoot ??
    (smoke ? resolvePhase49SmokeBenchmarkRoot(root) : undefined);
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 49 comparison eval requires --benchmark-root or GOODMEMORY_IMPLICITMEMBENCH_ROOT unless --smoke is set.",
    );
  }

  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchComparisonEval;

  return runEvaluation({
    benchmarkRoot,
    dependencies: smoke
      ? createImplicitMemBenchSmokeDependencies()
      : resolvePhase49LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase49AdapterManifestPath(root),
    mode: smoke ? "smoke" : "live",
    outputDir: input?.outputDir ?? resolvePhase49ComparisonOutputDir(root),
    runId: input?.runId,
  });
}

async function main(): Promise<void> {
  const reports = await runPhase49ComparisonEval(
    parsePhase49CliOptions(process.argv),
  );
  console.log(JSON.stringify(reports.comparisonReport, null, 2));
}

if (import.meta.main) {
  await main();
}
