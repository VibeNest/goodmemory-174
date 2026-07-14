import { describe, expect, it } from "bun:test";

import {
  mergeImplicitMemBenchRetryReport,
  parseImplicitMemBenchRetryMergeOptions,
} from "../../scripts/merge-phase-72-implicitmembench-retry";
import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchReport,
} from "../../src/eval/implicitmembench-research";

function caseResult(input: {
  caseId: string;
  passed: boolean;
  sourceFile?: string;
}): ImplicitMemBenchCaseResult {
  return {
    blocking: true,
    caseId: input.caseId,
    datasetFamily: "procedural_memory",
    explicitRecallLeak: false,
    feedbackSignalApplied: true,
    judgeReason: input.passed
      ? "expected_first_action_matched"
      : "expected_first_action_missing_or_forbidden",
    passed: input.passed,
    profile: "goodmemory-distilled-feedback",
    scorerFamily: "structured_first_action",
    sourceFile: input.sourceFile ?? "dataset/procedural_memory/logiql.json",
    taskFile: "logiql.json",
    taskName: "LogiQL",
  };
}

function summary(cases: ImplicitMemBenchCaseResult[]): ImplicitMemBenchProfileSummary {
  return {
    caseCountsByDataset: {
      classical_conditioning: 0,
      priming: 0,
      procedural_memory: cases.length,
    },
    caseCountsByScorer: {
      priming_pair_judge: 0,
      structured_first_action: cases.length,
      text_behavior_judge: 0,
    },
    cases,
    executionFailures: 0,
    explicitRecallLeakCount: 0,
    passedBlockingCases: cases.filter(({ passed }) => passed).length,
    primingAverageScore: null,
    totalBlockingCases: cases.length,
    totalCases: cases.length,
  };
}

function report(
  cases: ImplicitMemBenchCaseResult[],
  runId: string,
): ImplicitMemBenchResearchReport {
  const profile = summary(cases);
  return {
    benchmarkRoot: "/bench/implicit",
    generatedAt: "2026-07-12T00:00:00.000Z",
    generatedBy: "test",
    kind: "goodmemory",
    manifestPath: "/repo/fixtures/adapter-manifest.json",
    mode: "live",
    outputDir: "/reports/goodmemory",
    profiles: { "goodmemory-distilled-feedback": profile },
    runDirectory: `/reports/goodmemory/${runId}`,
    runId,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      ...profile,
      cases: undefined,
    },
  } as ImplicitMemBenchResearchReport;
}

describe("Phase 72 ImplicitMemBench retry merge", () => {
  it("parses explicit source reports and retry case IDs", () => {
    expect(parseImplicitMemBenchRetryMergeOptions([
      "bun",
      "merge-phase-72-implicitmembench-retry.ts",
      "--baseline-report",
      "/reports/baseline.json",
      "--goodmemory-report",
      "/reports/goodmemory.json",
      "--retry-report",
      "/reports/retry.json",
      "--case-ids",
      "case-1,case-2",
      "--output-dir",
      "/reports/merged",
      "--run-id",
      "merged-run",
    ])).toEqual({
      baselineReport: "/reports/baseline.json",
      caseIds: ["case-1", "case-2"],
      goodmemoryReport: "/reports/goodmemory.json",
      outputDir: "/reports/merged",
      profile: "goodmemory-distilled-feedback",
      retryReport: "/reports/retry.json",
      runId: "merged-run",
    });
    expect(() => parseImplicitMemBenchRetryMergeOptions([
      "--baseline-report", "/a.json",
      "--goodmemory-report", "/b.json",
      "--retry-report", "/c.json",
      "--case-ids", "case-1,case-1",
      "--output-dir", "/out",
      "--run-id", "../escape",
    ])).toThrow();
  });

  it("replaces only explicit cases and recomputes summary in source order", () => {
    const source = report([
      caseResult({ caseId: "case-1", passed: false }),
      caseResult({ caseId: "case-2", passed: true }),
    ], "source-run");
    const retry = report([
      caseResult({ caseId: "case-1", passed: true }),
    ], "retry-run");

    const merged = mergeImplicitMemBenchRetryReport({
      caseIds: ["case-1"],
      generatedAt: "2026-07-12T01:00:00.000Z",
      profile: "goodmemory-distilled-feedback",
      retry,
      runId: "merged-run",
      source,
    });

    expect(merged.replacements).toEqual([{
      caseId: "case-1",
      sourcePassed: false,
      retryPassed: true,
    }]);
    expect(merged.report.profiles["goodmemory-distilled-feedback"]?.cases.map(
      ({ caseId, passed }) => ({ caseId, passed }),
    )).toEqual([
      { caseId: "case-1", passed: true },
      { caseId: "case-2", passed: true },
    ]);
    expect(merged.report.summary.passedBlockingCases).toBe(2);
    expect(merged.report.runId).toBe("merged-run");
  });

  it("rejects missing, failed, or identity-mismatched retry cases", () => {
    const source = report([caseResult({ caseId: "case-1", passed: false })], "source");
    const retry = report([caseResult({
      caseId: "case-1",
      passed: true,
      sourceFile: "dataset/other.json",
    })], "retry");

    expect(() => mergeImplicitMemBenchRetryReport({
      caseIds: ["missing"],
      generatedAt: "2026-07-12T01:00:00.000Z",
      profile: "goodmemory-distilled-feedback",
      retry,
      runId: "merged",
      source,
    })).toThrow("missing");
    expect(() => mergeImplicitMemBenchRetryReport({
      caseIds: ["case-1"],
      generatedAt: "2026-07-12T01:00:00.000Z",
      profile: "goodmemory-distilled-feedback",
      retry,
      runId: "merged",
      source,
    })).toThrow("identity");

    retry.profiles["goodmemory-distilled-feedback"]!.cases[0]!.sourceFile =
      source.profiles["goodmemory-distilled-feedback"]!.cases[0]!.sourceFile;
    retry.profiles["goodmemory-distilled-feedback"]!.cases[0]!.executionFailure =
      "transport failed";
    expect(() => mergeImplicitMemBenchRetryReport({
      caseIds: ["case-1"],
      generatedAt: "2026-07-12T01:00:00.000Z",
      profile: "goodmemory-distilled-feedback",
      retry,
      runId: "merged",
      source,
    })).toThrow("execution failure");
  });
});
