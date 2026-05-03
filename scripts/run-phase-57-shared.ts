import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import { createPhase57SmokeDependencies } from "../src/eval/phase57";
import {
  judgePhase56PrimingPair,
  judgePhase56TextCase,
} from "../src/eval/phase56";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase57CliOptions extends Phase49CliOptions {}

export function resolvePhase57FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-57");
}

export function resolvePhase57AdapterManifestPath(root: string): string {
  return join(resolvePhase57FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase57BenchmarkRoot(root: string): string {
  return resolvePhase57FixtureRoot(root);
}

export function resolvePhase57FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-57");
}

export function resolvePhase57LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-57");
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

export function parsePhase57CliOptions(
  argv: readonly string[],
): Phase57CliOptions {
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

export function createPhase57LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase56PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase56TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase57SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase57RepoRoot,
  type Phase49LiveDependencyFactories,
};
