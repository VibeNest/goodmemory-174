import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../src/eval/implicitmembench-research";
import {
  createPhase52SmokeDependencies,
  judgePhase52PrimingPair,
  judgePhase52TextCase,
} from "../src/eval/phase52";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49CliOptions,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase52CliOptions extends Phase49CliOptions {}

export function resolvePhase52FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-phase-52");
}

export function resolvePhase52AdapterManifestPath(root: string): string {
  return join(resolvePhase52FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase52BenchmarkRoot(root: string): string {
  return resolvePhase52FixtureRoot(root);
}

export function resolvePhase52FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-52");
}

export function resolvePhase52LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-52");
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

export function parsePhase52CliOptions(
  argv: readonly string[],
): Phase52CliOptions {
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

export function createPhase52LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const live = resolvePhase49LiveDependencies(dependencies);

  return {
    ...live,
    judgePrimingPair: async (input) =>
      judgePhase52PrimingPair({
        caseDefinition: input.caseDefinition,
        controlAnswer: input.controlAnswer,
        experimentalAnswer: input.experimentalAnswer,
      }),
    judgeTextBehavior: async (input) =>
      judgePhase52TextCase({
        answer: input.answer,
        caseDefinition: input.caseDefinition,
      }),
  };
}

export {
  createPhase52SmokeDependencies,
  resolvePhase49RepoRoot as resolvePhase52RepoRoot,
  type Phase49LiveDependencyFactories,
};
