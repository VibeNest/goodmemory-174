import { describe, expect, it } from "bun:test";
import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchReport,
} from "../../src/eval/implicitmembench-research";
import { buildRawInternalizationDiagnosisSummary } from "../../src/eval/implicitmembench-diagnostics";

function createCase(
  overrides: Partial<ImplicitMemBenchCaseResult>,
): ImplicitMemBenchCaseResult {
  return {
    blocking: true,
    caseId: overrides.caseId ?? "case-1",
    datasetFamily: overrides.datasetFamily ?? "classical_conditioning",
    explicitRecallLeak: false,
    feedbackSignalApplied: true,
    profile: overrides.profile ?? "goodmemory-raw-experience",
    scorerFamily: overrides.scorerFamily ?? "text_behavior_judge",
    sourceFile: overrides.sourceFile ?? "/tmp/case.json",
    taskFile: overrides.taskFile ?? "case.json",
    taskName: overrides.taskName ?? "Case",
    ...overrides,
  };
}

function createSummary(cases: ImplicitMemBenchCaseResult[]): ImplicitMemBenchProfileSummary {
  return {
    caseCountsByDataset: {
      classical_conditioning: cases.filter(
        (caseResult) => caseResult.datasetFamily === "classical_conditioning",
      ).length,
      priming: cases.filter((caseResult) => caseResult.datasetFamily === "priming").length,
      procedural_memory: cases.filter(
        (caseResult) => caseResult.datasetFamily === "procedural_memory",
      ).length,
    },
    caseCountsByScorer: {
      priming_pair_judge: cases.filter(
        (caseResult) => caseResult.scorerFamily === "priming_pair_judge",
      ).length,
      structured_first_action: cases.filter(
        (caseResult) => caseResult.scorerFamily === "structured_first_action",
      ).length,
      text_behavior_judge: cases.filter(
        (caseResult) => caseResult.scorerFamily === "text_behavior_judge",
      ).length,
    },
    cases,
    executionFailures: cases.filter((caseResult) => caseResult.executionFailure).length,
    explicitRecallLeakCount: cases.filter((caseResult) => caseResult.explicitRecallLeak).length,
    passedBlockingCases: cases.filter((caseResult) => caseResult.blocking && caseResult.passed).length,
    primingAverageScore: null,
    totalBlockingCases: cases.filter((caseResult) => caseResult.blocking).length,
    totalCases: cases.length,
  };
}

function createReport(input: {
  distilledCases: ImplicitMemBenchCaseResult[];
  rawCases: ImplicitMemBenchCaseResult[];
}): ImplicitMemBenchResearchReport {
  const rawSummary = createSummary(input.rawCases);
  const distilledSummary = createSummary(input.distilledCases);
  return {
    benchmarkRoot: "/tmp/bench",
    generatedAt: "2026-05-04T00:00:00.000Z",
    generatedBy: "test",
    kind: "goodmemory",
    manifestPath: "/tmp/bench/adapter-manifest.json",
    mode: "smoke",
    outputDir: "/tmp/out",
    profiles: {
      "goodmemory-distilled-feedback": distilledSummary,
      "goodmemory-raw-experience": rawSummary,
    },
    runDirectory: "/tmp/out/run",
    runId: "run",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCountsByDataset: rawSummary.caseCountsByDataset,
      caseCountsByScorer: rawSummary.caseCountsByScorer,
      executionFailures: rawSummary.executionFailures + distilledSummary.executionFailures,
      explicitRecallLeakCount:
        rawSummary.explicitRecallLeakCount + distilledSummary.explicitRecallLeakCount,
      passedBlockingCases:
        rawSummary.passedBlockingCases + distilledSummary.passedBlockingCases,
      primingAverageScore: null,
      totalBlockingCases:
        rawSummary.totalBlockingCases + distilledSummary.totalBlockingCases,
      totalCases: rawSummary.totalCases + distilledSummary.totalCases,
    },
  };
}

describe("ImplicitMemBench raw internalization diagnostics", () => {
  it("aggregates stable diagnosis buckets and raw-vs-distilled delta", () => {
    const report = createReport({
      distilledCases: [
        createCase({
          caseId: "case-1",
          passed: true,
          profile: "goodmemory-distilled-feedback",
        }),
        createCase({
          caseId: "case-2",
          passed: false,
          profile: "goodmemory-distilled-feedback",
        }),
      ],
      rawCases: [
        createCase({
          caseId: "case-1",
          passed: false,
          rawCarryover: {
            candidatePrototypeIds: ["p1"],
            diagnosis: "support_conflict",
            mode: "abstained",
            selectedExemplarIds: [],
            selectedPrototypeIds: [],
          },
        }),
        createCase({
          caseId: "case-2",
          executionFailure: "Invalid JSON response from judge",
          passed: false,
        }),
      ],
    });

    const summary = buildRawInternalizationDiagnosisSummary([report]);

    expect(summary.totalCases).toBe(2);
    expect(summary.byDiagnosis.support_conflict).toBe(1);
    expect(summary.byDiagnosis.operator_failure).toBe(1);
    expect(summary.byExecutionFailure.invalid_json_response).toBe(1);
    expect(summary.rawVsDistilledDelta.distilledOnlyPasses).toBe(1);
    expect(summary.rawBlockingExecutionFailures).toBe(1);
  });
});
