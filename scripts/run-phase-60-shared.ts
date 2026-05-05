import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveEvalMaxConcurrency } from "./run-eval";
import {
  resolvePhase49AdapterManifestPath,
  resolvePhase49FixtureRoot,
  resolvePhase49LiveDependencies,
  resolvePhase49RepoRoot,
  type Phase49LiveDependencyFactories,
} from "./run-phase-49-shared";

export interface Phase60CliOptions {
  benchmarkRoot?: string;
  limit?: number;
  maxConcurrency: number;
  outputDir?: string;
  runId?: string;
  smoke: boolean;
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

export function parsePhase60CliOptions(
  argv: readonly string[],
): Phase60CliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_IMPLICITMEMBENCH_ROOT,
    limit: parseLimit(resolveCliFlagValue(argv, "--limit")),
    maxConcurrency: resolveEvalMaxConcurrency() ?? 1,
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    smoke: !argv.includes("--live"),
  };
}

export function resolvePhase60FixtureRoot(root: string): string {
  return resolvePhase49FixtureRoot(root);
}

export function resolvePhase60AdapterManifestPath(root: string): string {
  return resolvePhase49AdapterManifestPath(root);
}

export function resolvePhase60FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-60");
}

export function resolvePhase60OverallSummaryPath(
  outputDir: string,
  runId: string,
): string {
  return join(outputDir, runId, "overall-summary.json");
}

export function resolvePhase60ReportPath(
  outputDir: string,
  runId: string,
): string {
  return join(outputDir, runId, "report.json");
}

export {
  resolvePhase49LiveDependencies as resolvePhase60LiveDependencies,
  resolvePhase49RepoRoot as resolvePhase60RepoRoot,
  type Phase49LiveDependencyFactories,
};
