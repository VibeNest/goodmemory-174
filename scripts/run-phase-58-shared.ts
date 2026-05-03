import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase58SmokeDependencies,
  judgePhase58PrimingPair,
  judgePhase58TextCase,
} from "../src/eval/phase58";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase58CliOptions extends Phase49CliOptions {}

export function resolvePhase58FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-58");
}

export function resolvePhase58AdapterManifestPath(root: string): string {
  return join(resolvePhase58FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase58BenchmarkRoot(root: string): string {
  return resolvePhase58FixtureRoot(root);
}

export function resolvePhase58FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-58");
}

export function resolvePhase58LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-58");
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit must be a positive integer");
  }

  return parsed;
}

export function parsePhase58CliOptions(
  argv: readonly string[],
): Phase58CliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_IMPLICITMEMBENCH_ROOT,
    limit: parseLimit(resolveCliFlagValue(argv, "--limit")),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    smoke: argv.includes("--smoke"),
  };
}

export function createPhase58LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase58PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase58TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase58SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase58RepoRoot,
  type Phase49LiveDependencyFactories,
};
