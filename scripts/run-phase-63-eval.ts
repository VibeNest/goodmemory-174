import { runBeamSuite, type BeamReport, type RunBeamOptions } from "../src/eval/beam";
import {
  assertPhase63Readiness,
  checkPhase63Readiness,
  parsePhase63CliOptions,
  resolvePhase63BenchmarkRoot,
  resolvePhase63OutputDir,
  resolvePhase63RepoRoot,
  type Phase63CliOptions,
} from "./run-phase-63-shared";

export const PHASE63_CANONICAL_RUN_ID = "run-phase63-beam-smoke-current";

const GENERATED_BY = "scripts/run-phase-63-eval.ts";

export interface Phase63EvalDependencies {
  runSuite?: typeof runBeamSuite;
}

export function buildPhase63BeamOptions(
  root: string,
  options: Phase63CliOptions,
): RunBeamOptions {
  const mode = options.mode;
  return {
    benchmarkRoot:
      options.benchmarkRoot ?? resolvePhase63BenchmarkRoot(root, mode === "smoke"),
    caseIds: options.caseIds,
    generatedBy: GENERATED_BY,
    limit: options.limit,
    mode,
    offset: options.offset,
    outputDir: options.outputDir ?? resolvePhase63OutputDir(root),
    profiles: options.profiles,
    questionTypes: options.questionTypes,
    runId: options.runId ?? PHASE63_CANONICAL_RUN_ID,
    scale: options.scale ?? "100K",
  };
}

export async function runPhase63Beam(
  options: Partial<Phase63CliOptions> = {},
  dependencies: Phase63EvalDependencies = {},
): Promise<BeamReport> {
  const root = resolvePhase63RepoRoot();
  const runOptions = buildPhase63BeamOptions(root, {
    mode: "smoke",
    ...options,
  });

  if (!dependencies.runSuite) {
    assertPhase63Readiness(
      checkPhase63Readiness({
        benchmarkRoot: runOptions.benchmarkRoot,
        mode: runOptions.mode,
        profiles: runOptions.profiles,
      }),
    );
  }

  const runSuite = dependencies.runSuite ?? runBeamSuite;
  return runSuite(runOptions);
}

if (import.meta.main) {
  const report = await runPhase63Beam(parsePhase63CliOptions(Bun.argv));
  console.log(JSON.stringify(report, null, 2));
}
