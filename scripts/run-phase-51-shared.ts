import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase51SmokeDependencies,
  judgePhase51PrimingPair,
  judgePhase51TextCase,
} from "../src/eval/phase51";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase51CliOptions extends Phase49CliOptions {}

export function resolvePhase51FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-51");
}

export function resolvePhase51AdapterManifestPath(root: string): string {
  return join(resolvePhase51FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase51BenchmarkRoot(root: string): string {
  return resolvePhase51FixtureRoot(root);
}

export function resolvePhase51FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-51");
}

export function resolvePhase51LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-51");
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

export function parsePhase51CliOptions(
  argv: readonly string[],
): Phase51CliOptions {
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

export function createPhase51LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase51PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase51TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase51SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase51RepoRoot,
  type Phase49LiveDependencyFactories,
};
