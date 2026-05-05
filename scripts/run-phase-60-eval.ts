#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  ImplicitMemBenchComparisonReport,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchReport,
  RunImplicitMemBenchComparisonOptions,
} from "../src/eval/implicitmembench-research";
import {
  createImplicitMemBenchSmokeDependencies,
  listImplicitMemBenchResearchCases,
  runImplicitMemBenchComparisonEval,
} from "../src/eval/implicitmembench-research";
import type { Phase60OverallSummary } from "../src/eval/phase60";
import { buildPhase60OverallSummary } from "../src/eval/phase60";
import {
  parsePhase60CliOptions,
  resolvePhase60AdapterManifestPath,
  resolvePhase60FallbackOutputDir,
  resolvePhase60FixtureRoot,
  resolvePhase60LiveDependencies,
  resolvePhase60OverallSummaryPath,
  resolvePhase60RepoRoot,
  resolvePhase60ReportPath,
  type Phase49LiveDependencyFactories,
} from "./run-phase-60-shared";

const GENERATED_BY = "scripts/run-phase-60-eval.ts";
export const PHASE60_CANONICAL_RUN_ID = "run-phase60-fallback-current";

export interface Phase60EvalDependencies extends Phase49LiveDependencyFactories {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  listCases?: (input: {
    benchmarkRoot: string;
    limit?: number;
    manifestPath: string;
  }) => Promise<ImplicitMemBenchResearchCase[]>;
  now?: () => string;
  runComparison?: (
    input: RunImplicitMemBenchComparisonOptions,
  ) => Promise<{
    baselineReport: ImplicitMemBenchResearchReport;
    comparisonReport: ImplicitMemBenchComparisonReport;
    goodmemoryReport: ImplicitMemBenchResearchReport;
  }>;
  writeOverallSummary?: (
    path: string,
    summary: Phase60OverallSummary,
  ) => Promise<void>;
}

export interface Phase60EvalOptions
  extends Partial<ReturnType<typeof parsePhase60CliOptions>> {
  cases?: readonly ImplicitMemBenchResearchCase[];
}

async function defaultWriteOverallSummary(
  path: string,
  summary: Phase60OverallSummary,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`);
}

export async function runPhase60Eval(
  input?: Phase60EvalOptions,
  dependencies?: Phase60EvalDependencies,
): Promise<{
  baselineReport: ImplicitMemBenchResearchReport;
  comparisonReport: ImplicitMemBenchComparisonReport;
  goodmemoryReport: ImplicitMemBenchResearchReport;
  phase60Summary: Phase60OverallSummary;
}> {
  const root = resolvePhase60RepoRoot();
  const smoke = input?.smoke ?? true;
  const benchmarkRoot =
    input?.benchmarkRoot ?? (smoke ? resolvePhase60FixtureRoot(root) : undefined);
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 60 eval requires --benchmark-root or GOODMEMORY_IMPLICITMEMBENCH_ROOT when --live is used.",
    );
  }

  const outputDir = resolve(
    input?.outputDir ?? resolvePhase60FallbackOutputDir(root),
  );
  const runId = input?.runId ?? PHASE60_CANONICAL_RUN_ID;
  const manifestPath = resolvePhase60AdapterManifestPath(root);
  const runComparison =
    dependencies?.runComparison ?? runImplicitMemBenchComparisonEval;
  const listCases = dependencies?.listCases ?? listImplicitMemBenchResearchCases;
  const writeOverallSummary =
    dependencies?.writeOverallSummary ?? defaultWriteOverallSummary;
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());

  const [reports, cases] = await Promise.all([
    runComparison({
      benchmarkRoot,
      cases: input?.cases,
      dependencies: smoke
        ? createImplicitMemBenchSmokeDependencies()
        : resolvePhase60LiveDependencies(dependencies),
      generatedBy: GENERATED_BY,
      limit: input?.limit,
      manifestPath,
      maxConcurrency: input?.maxConcurrency,
      mode: smoke ? "smoke" : "live",
      outputDir,
      runId,
    }),
    input?.cases ??
      listCases({
        benchmarkRoot,
        limit: input?.limit,
        manifestPath,
      }),
  ]);
  const runDirectory = resolve(outputDir, runId);
  const phase60Summary = buildPhase60OverallSummary({
    baselineReport: reports.baselineReport,
    cases,
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    goodmemoryReport: reports.goodmemoryReport,
    outputDir,
    runDirectory,
    runId,
  });

  await ensureDir(runDirectory, { recursive: true });
  await writeOverallSummary(
    resolvePhase60OverallSummaryPath(outputDir, runId),
    phase60Summary,
  );
  await writeOverallSummary(resolvePhase60ReportPath(outputDir, runId), phase60Summary);

  return {
    ...reports,
    phase60Summary,
  };
}

async function main(): Promise<void> {
  const reports = await runPhase60Eval(parsePhase60CliOptions(process.argv));
  console.log(JSON.stringify(reports.phase60Summary, null, 2));
}

if (import.meta.main) {
  await main();
}
