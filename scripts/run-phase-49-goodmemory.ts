import type {
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchGoodMemoryOptions,
} from "../src/eval/implicitmembench-research";
import {
  createImplicitMemBenchSmokeDependencies,
  runImplicitMemBenchGoodMemoryEval,
} from "../src/eval/implicitmembench-research";
import {
  parsePhase49CliOptions,
  resolvePhase49AdapterManifestPath,
  resolvePhase49GoodMemoryOutputDir,
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  resolvePhase49SmokeBenchmarkRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

const GENERATED_BY = "scripts/run-phase-49-goodmemory.ts";

export interface Phase49GoodMemoryDependencies
  extends Phase49LiveDependencyFactories {
  runEvaluation?: (
    input: RunImplicitMemBenchGoodMemoryOptions,
  ) => Promise<ImplicitMemBenchResearchReport>;
}

export async function runPhase49GoodMemoryEval(
  input?: ReturnType<typeof parsePhase49CliOptions>,
  dependencies?: Phase49GoodMemoryDependencies,
): Promise<ImplicitMemBenchResearchReport> {
  const root = resolvePhase49RepoRoot();
  const smoke = input?.smoke ?? false;
  const benchmarkRoot =
    input?.benchmarkRoot ??
    (smoke ? resolvePhase49SmokeBenchmarkRoot(root) : undefined);
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 49 GoodMemory eval requires --benchmark-root or GOODMEMORY_IMPLICITMEMBENCH_ROOT unless --smoke is set.",
    );
  }

  const runEvaluation =
    dependencies?.runEvaluation ?? runImplicitMemBenchGoodMemoryEval;

  return runEvaluation({
    benchmarkRoot,
    dependencies: smoke
      ? createImplicitMemBenchSmokeDependencies()
      : resolvePhase49LiveDependencies(dependencies),
    generatedBy: GENERATED_BY,
    limit: input?.limit,
    manifestPath: resolvePhase49AdapterManifestPath(root),
    mode: smoke ? "smoke" : "live",
    outputDir: input?.outputDir ?? resolvePhase49GoodMemoryOutputDir(root),
    runId: input?.runId,
  });
}

async function main(): Promise<void> {
  const report = await runPhase49GoodMemoryEval(
    parsePhase49CliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
