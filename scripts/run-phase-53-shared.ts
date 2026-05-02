import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase53SmokeDependencies,
  judgePhase53PrimingPair,
  judgePhase53TextCase,
} from "../src/eval/phase53";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase53CliOptions extends Phase49CliOptions {}

export function resolvePhase53FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-53");
}

export function resolvePhase53AdapterManifestPath(root: string): string {
  return join(resolvePhase53FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase53BenchmarkRoot(root: string): string {
  return resolvePhase53FixtureRoot(root);
}

export function resolvePhase53FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-53");
}

export function resolvePhase53LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-53");
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

export function parsePhase53CliOptions(
  argv: readonly string[],
): Phase53CliOptions {
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

export function createPhase53LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase53PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase53TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase53SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase53RepoRoot,
  type Phase49LiveDependencyFactories,
};
