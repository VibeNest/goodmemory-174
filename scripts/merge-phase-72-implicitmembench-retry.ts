import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchResearchReport,
} from "../src/eval/implicitmembench-research";
import { listImplicitMemBenchResearchCases } from "../src/eval/implicitmembench-research";
import { buildPhase60OverallSummary } from "../src/eval/phase60";
import {
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  summarizePhase61Cases,
  summarizePhase61Report,
} from "./run-phase-61-full300";

const GENERATED_BY = "scripts/merge-phase-72-implicitmembench-retry.ts";

export interface ImplicitMemBenchRetryMergeOptions {
  baselineReport: string;
  caseIds: string[];
  goodmemoryReport: string;
  outputDir: string;
  profile: ImplicitMemBenchResearchProfile;
  retryReport: string;
  runId: string;
}

export interface ImplicitMemBenchRetryReplacement {
  caseId: string;
  retryPassed: boolean | undefined;
  sourcePassed: boolean | undefined;
}

export function parseImplicitMemBenchRetryMergeOptions(
  argv: readonly string[],
): ImplicitMemBenchRetryMergeOptions {
  const caseIds = requiredFlag(argv, "--case-ids").split(",");
  if (
    caseIds.some((caseId) => caseId.length === 0 || caseId.trim() !== caseId) ||
    new Set(caseIds).size !== caseIds.length
  ) {
    throw new Error("--case-ids must contain unique, non-empty case IDs.");
  }
  const profile = resolveCliFlagValueStrict(argv, "--profile") ??
    "goodmemory-distilled-feedback";
  if (
    profile !== "goodmemory-distilled-feedback" &&
    profile !== "goodmemory-raw-experience"
  ) {
    throw new Error("--profile must select a GoodMemory research profile.");
  }
  return {
    baselineReport: requiredFlag(argv, "--baseline-report"),
    caseIds,
    goodmemoryReport: requiredFlag(argv, "--goodmemory-report"),
    outputDir: requiredFlag(argv, "--output-dir"),
    profile,
    retryReport: requiredFlag(argv, "--retry-report"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id") ??
      requiredFlag(argv, "--run-id"),
  };
}

export function mergeImplicitMemBenchRetryReport(input: {
  caseIds: readonly string[];
  generatedAt: string;
  outputDir?: string;
  profile: ImplicitMemBenchResearchProfile;
  retry: ImplicitMemBenchResearchReport;
  runDirectory?: string;
  runId: string;
  source: ImplicitMemBenchResearchReport;
}): {
  replacements: ImplicitMemBenchRetryReplacement[];
  report: ImplicitMemBenchResearchReport;
} {
  if (input.source.kind !== "goodmemory" || input.retry.kind !== "goodmemory") {
    throw new Error("ImplicitMemBench retry merge requires GoodMemory reports.");
  }
  if (input.caseIds.length === 0 || new Set(input.caseIds).size !== input.caseIds.length) {
    throw new Error("ImplicitMemBench retry case IDs must be non-empty and unique.");
  }
  const sourceProfile = input.source.profiles[input.profile];
  const retryProfile = input.retry.profiles[input.profile];
  if (!sourceProfile || !retryProfile) {
    throw new Error(`ImplicitMemBench retry profile ${input.profile} is missing.`);
  }
  const sourceById = new Map(
    sourceProfile.cases.map((caseResult) => [caseResult.caseId, caseResult]),
  );
  const retryById = new Map(
    retryProfile.cases.map((caseResult) => [caseResult.caseId, caseResult]),
  );
  const selected = new Map<string, ImplicitMemBenchCaseResult>();
  const replacements: ImplicitMemBenchRetryReplacement[] = [];
  for (const caseId of input.caseIds) {
    const sourceCase = sourceById.get(caseId);
    const retryCase = retryById.get(caseId);
    if (!sourceCase || !retryCase) {
      throw new Error(`ImplicitMemBench retry case ${caseId} is missing.`);
    }
    if (retryCase.executionFailure) {
      throw new Error(
        `ImplicitMemBench retry case ${caseId} has an execution failure.`,
      );
    }
    assertMatchingRetryIdentity(sourceCase, retryCase);
    selected.set(caseId, retryCase);
    replacements.push({
      caseId,
      retryPassed: retryCase.passed,
      sourcePassed: sourceCase.passed,
    });
  }
  const mergedCases = sourceProfile.cases.map((caseResult) => ({
    ...(selected.get(caseResult.caseId) ?? caseResult),
  }));
  const profiles = {
    ...input.source.profiles,
    [input.profile]: summarizePhase61Cases(mergedCases),
  };
  const report: ImplicitMemBenchResearchReport = {
    ...input.source,
    generatedAt: input.generatedAt,
    generatedBy: GENERATED_BY,
    outputDir: input.outputDir ?? input.source.outputDir,
    profiles,
    runDirectory: input.runDirectory ?? input.source.runDirectory,
    runId: input.runId,
    summary: summarizePhase61Report(profiles),
  };
  return { replacements, report };
}

function assertMatchingRetryIdentity(
  source: ImplicitMemBenchCaseResult,
  retry: ImplicitMemBenchCaseResult,
): void {
  const sourceIdentity = [
    source.caseId,
    source.datasetFamily,
    source.scorerFamily,
    source.sourceFile,
    source.taskFile,
    source.taskName,
    source.blocking,
    source.profile,
  ];
  const retryIdentity = [
    retry.caseId,
    retry.datasetFamily,
    retry.scorerFamily,
    retry.sourceFile,
    retry.taskFile,
    retry.taskName,
    retry.blocking,
    retry.profile,
  ];
  if (JSON.stringify(sourceIdentity) !== JSON.stringify(retryIdentity)) {
    throw new Error(
      `ImplicitMemBench retry case ${source.caseId} identity does not match the source.`,
    );
  }
}

export async function runImplicitMemBenchRetryMerge(
  options: ImplicitMemBenchRetryMergeOptions,
): Promise<Record<string, unknown>> {
  const [baselineRaw, goodmemoryRaw, retryRaw] = await Promise.all([
    readFile(options.baselineReport, "utf8"),
    readFile(options.goodmemoryReport, "utf8"),
    readFile(options.retryReport, "utf8"),
  ]);
  const baseline = JSON.parse(baselineRaw) as ImplicitMemBenchResearchReport;
  const source = JSON.parse(goodmemoryRaw) as ImplicitMemBenchResearchReport;
  const retry = JSON.parse(retryRaw) as ImplicitMemBenchResearchReport;
  if (baseline.kind !== "baseline") {
    throw new Error("ImplicitMemBench retry merge requires a baseline report.");
  }
  if (
    baseline.benchmarkRoot !== source.benchmarkRoot ||
    baseline.manifestPath !== source.manifestPath
  ) {
    throw new Error("ImplicitMemBench source reports use different benchmark identities.");
  }

  const outputDir = resolve(options.outputDir);
  const runDirectory = join(outputDir, options.runId);
  const generatedAt = new Date().toISOString();
  const merged = mergeImplicitMemBenchRetryReport({
    caseIds: options.caseIds,
    generatedAt,
    outputDir,
    profile: options.profile,
    retry,
    runDirectory,
    runId: options.runId,
    source,
  });
  const cases = await listImplicitMemBenchResearchCases({
    benchmarkRoot: source.benchmarkRoot,
    manifestPath: source.manifestPath,
  });
  const outputPaths = {
    baseline: join(runDirectory, "baseline-report.json"),
    goodmemory: join(runDirectory, "goodmemory-report.json"),
    manifest: join(runDirectory, "retry-manifest.json"),
    overall: join(runDirectory, "overall-report.json"),
  };
  const overall = {
    ...buildPhase60OverallSummary({
      baselineReport: baseline,
      cases,
      generatedAt,
      generatedBy: GENERATED_BY,
      goodmemoryReport: merged.report,
      outputDir,
      runDirectory,
      runId: options.runId,
    }),
    sourceReports: {
      baselineReportPath: outputPaths.baseline,
      goodmemoryReportPath: outputPaths.goodmemory,
    },
    retryMerge: {
      caseIds: options.caseIds,
      profile: options.profile,
      replacements: merged.replacements,
      sourceRunId: source.runId,
      retryRunId: retry.runId,
    },
  };
  const serialized = {
    baseline: `${JSON.stringify(baseline, null, 2)}\n`,
    goodmemory: `${JSON.stringify(merged.report, null, 2)}\n`,
    overall: `${JSON.stringify(overall, null, 2)}\n`,
  };
  const manifest = {
    generatedAt,
    generatedBy: GENERATED_BY,
    kind: "phase-72-implicitmembench-retry-merge",
    output: {
      baseline: artifact(outputPaths.baseline, serialized.baseline),
      goodmemory: artifact(outputPaths.goodmemory, serialized.goodmemory),
      overall: artifact(outputPaths.overall, serialized.overall),
    },
    replacements: merged.replacements,
    retry: {
      caseIds: options.caseIds,
      profile: options.profile,
      runId: retry.runId,
    },
    source: {
      baseline: artifact(options.baselineReport, baselineRaw),
      goodmemory: artifact(options.goodmemoryReport, goodmemoryRaw),
      retry: artifact(options.retryReport, retryRaw),
    },
  };
  await mkdir(runDirectory, { recursive: true });
  await Promise.all([
    writeFile(outputPaths.baseline, serialized.baseline, "utf8"),
    writeFile(outputPaths.goodmemory, serialized.goodmemory, "utf8"),
    writeFile(outputPaths.overall, serialized.overall, "utf8"),
    writeFile(
      outputPaths.manifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return {
    manifest,
    outputPaths,
    runDirectory,
    runId: options.runId,
    score: overall.comparison.bestGoodMemoryOverallRate,
  };
}

function artifact(path: string, content: string): {
  path: string;
  sha256: string;
} {
  return {
    path: resolve(path),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function requiredFlag(argv: readonly string[], flag: string): string {
  const value = resolveCliFlagValueStrict(argv, flag);
  if (!value) {
    throw new Error(`${flag} is required.`);
  }
  return value;
}

if (import.meta.main) {
  console.log(JSON.stringify(
    await runImplicitMemBenchRetryMerge(
      parseImplicitMemBenchRetryMergeOptions(Bun.argv),
    ),
    null,
    2,
  ));
}
