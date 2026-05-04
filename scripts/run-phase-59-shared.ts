import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase59SmokeDependencies,
  judgePhase59PrimingPair,
  judgePhase59TextCase,
} from "../src/eval/phase59";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase59CliOptions extends Phase49CliOptions {}

export function resolvePhase59FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-59");
}

export function resolvePhase59AdapterManifestPath(root: string): string {
  return join(resolvePhase59FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase59BenchmarkRoot(root: string): string {
  return resolvePhase59FixtureRoot(root);
}

export function resolvePhase59FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-59");
}

export function resolvePhase59LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-59");
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

export function parsePhase59CliOptions(
  argv: readonly string[],
): Phase59CliOptions {
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

export function createPhase59LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase59PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase59TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase59SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase59RepoRoot,
  type Phase49LiveDependencyFactories,
};
