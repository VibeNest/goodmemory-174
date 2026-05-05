#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchReport,
} from "../src/eval/implicitmembench-research";
import { listImplicitMemBenchResearchCases } from "../src/eval/implicitmembench-research";
import type { Phase60OverallSummary } from "../src/eval/phase60";
import { buildPhase60OverallSummary } from "../src/eval/phase60";
import { resolveCliFlagValue } from "./cli-options";
import { PHASE60_CANONICAL_RUN_ID } from "./run-phase-60-eval";
import {
  parsePhase60CliOptions,
  resolvePhase60AdapterManifestPath,
  resolvePhase60FallbackOutputDir,
  resolvePhase60OverallSummaryPath,
  resolvePhase60RepoRoot,
} from "./run-phase-60-shared";

export const PHASE60_CANONICAL_OVERALL_RUN_ID = "run-phase60-overall-current";
const GENERATED_BY = "scripts/run-phase-60-overall.ts";

export interface Phase60OverallOptions {
  baselineReportPath?: string;
  benchmarkRoot?: string;
  goodmemoryReportPath?: string;
  limit?: number;
  outputDir?: string;
  runId?: string;
}

export interface Phase60OverallDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  listCases?: (input: {
    benchmarkRoot: string;
    limit?: number;
    manifestPath: string;
  }) => Promise<ImplicitMemBenchResearchCase[]>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export function parsePhase60OverallCliOptions(
  argv: readonly string[],
): Phase60OverallOptions {
  const phase60 = parsePhase60CliOptions(argv);
  return {
    baselineReportPath: resolveCliFlagValue(argv, "--baseline-report"),
    benchmarkRoot: phase60.benchmarkRoot,
    goodmemoryReportPath: resolveCliFlagValue(argv, "--goodmemory-report"),
    limit: phase60.limit,
    outputDir: phase60.outputDir,
    runId: phase60.runId,
  };
}

async function defaultReadTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function defaultWriteTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function parseReport(
  content: string,
  label: string,
): ImplicitMemBenchResearchReport {
  const parsed = JSON.parse(content) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("kind" in parsed) ||
    !("profiles" in parsed)
  ) {
    throw new Error(`${label} must be an ImplicitMemBench research report.`);
  }

  return parsed as ImplicitMemBenchResearchReport;
}

export function resolvePhase60BaselineReportPath(
  outputDir: string,
  runId = PHASE60_CANONICAL_RUN_ID,
): string {
  return join(outputDir, "baseline", runId, "report.json");
}

export function resolvePhase60GoodMemoryReportPath(
  outputDir: string,
  runId = PHASE60_CANONICAL_RUN_ID,
): string {
  return join(outputDir, "goodmemory", runId, "report.json");
}

export async function runPhase60Overall(
  input?: Phase60OverallOptions,
  dependencies?: Phase60OverallDependencies,
): Promise<Phase60OverallSummary> {
  const root = resolvePhase60RepoRoot();
  const outputDir = resolve(
    input?.outputDir ?? resolvePhase60FallbackOutputDir(root),
  );
  const runId = input?.runId ?? PHASE60_CANONICAL_OVERALL_RUN_ID;
  const sourceRunId =
    runId === PHASE60_CANONICAL_OVERALL_RUN_ID
      ? PHASE60_CANONICAL_RUN_ID
      : runId;
  const baselineReportPath =
    input?.baselineReportPath ??
    resolvePhase60BaselineReportPath(outputDir, sourceRunId);
  const goodmemoryReportPath =
    input?.goodmemoryReportPath ??
    resolvePhase60GoodMemoryReportPath(outputDir, sourceRunId);
  const readTextFile = dependencies?.readTextFile ?? defaultReadTextFile;
  const writeTextFile = dependencies?.writeTextFile ?? defaultWriteTextFile;
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const listCases = dependencies?.listCases ?? listImplicitMemBenchResearchCases;
  const now = dependencies?.now ?? (() => new Date().toISOString());

  const [baselineReport, goodmemoryReport] = await Promise.all([
    readTextFile(baselineReportPath).then((content) =>
      parseReport(content, "baseline report"),
    ),
    readTextFile(goodmemoryReportPath).then((content) =>
      parseReport(content, "goodmemory report"),
    ),
  ]);
  const benchmarkRoot =
    input?.benchmarkRoot ??
    goodmemoryReport.benchmarkRoot ??
    baselineReport.benchmarkRoot;
  const manifestPath = resolvePhase60AdapterManifestPath(root);
  const cases = await listCases({
    benchmarkRoot,
    limit: input?.limit,
    manifestPath,
  });
  const runDirectory = resolve(outputDir, runId);
  const summary = buildPhase60OverallSummary({
    baselineReport,
    cases,
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    goodmemoryReport,
    outputDir,
    runDirectory,
    runId,
  });

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    resolvePhase60OverallSummaryPath(outputDir, runId),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  return summary;
}

async function main(): Promise<void> {
  const report = await runPhase60Overall(
    parsePhase60OverallCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
