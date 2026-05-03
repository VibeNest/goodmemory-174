import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase54SmokeDependencies,
  judgePhase54PrimingPair,
  judgePhase54TextCase,
} from "../src/eval/phase54";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase54CliOptions extends Phase49CliOptions {}

export function resolvePhase54FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-54");
}

export function resolvePhase54AdapterManifestPath(root: string): string {
  return join(resolvePhase54FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase54BenchmarkRoot(root: string): string {
  return resolvePhase54FixtureRoot(root);
}

export function resolvePhase54FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-54");
}

export function resolvePhase54LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-54");
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

export function parsePhase54CliOptions(
  argv: readonly string[],
): Phase54CliOptions {
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

export function createPhase54LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase54PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase54TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase54SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase54RepoRoot,
  type Phase49LiveDependencyFactories,
};
