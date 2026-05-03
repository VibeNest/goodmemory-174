import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase55SmokeDependencies,
  judgePhase55PrimingPair,
  judgePhase55TextCase,
} from "../src/eval/phase55";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase55CliOptions extends Phase49CliOptions {}

export function resolvePhase55FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-55");
}

export function resolvePhase55AdapterManifestPath(root: string): string {
  return join(resolvePhase55FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase55BenchmarkRoot(root: string): string {
  return resolvePhase55FixtureRoot(root);
}

export function resolvePhase55FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-55");
}

export function resolvePhase55LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-55");
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

export function parsePhase55CliOptions(
  argv: readonly string[],
): Phase55CliOptions {
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

export function createPhase55LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase55PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase55TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase55SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase55RepoRoot,
  type Phase49LiveDependencyFactories,
};
