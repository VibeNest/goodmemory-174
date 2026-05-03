import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase56SmokeDependencies,
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

export interface Phase56CliOptions extends Phase49CliOptions {}

export function resolvePhase56FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-56");
}

export function resolvePhase56AdapterManifestPath(root: string): string {
  return join(resolvePhase56FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase56BenchmarkRoot(root: string): string {
  return resolvePhase56FixtureRoot(root);
}

export function resolvePhase56FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-56");
}

export function resolvePhase56LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-56");
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

export function parsePhase56CliOptions(
  argv: readonly string[],
): Phase56CliOptions {
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

export function createPhase56LiveDependencies(
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
  createPhase56SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase56RepoRoot,
  type Phase49LiveDependencyFactories,
};
