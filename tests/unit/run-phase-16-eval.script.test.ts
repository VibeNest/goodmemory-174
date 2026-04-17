import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  resolvePhase16FallbackOutputDir,
  resolvePhase16ScenarioIds,
  runPhase16FallbackEval,
} from "../../scripts/run-phase-16-eval";

function buildEmptySuiteSummary() {
  return {
    totalCases: 0,
    winnerCounts: {
      baseline: 0,
      goodmemory: 0,
      tie: 0,
    },
    baselineAverage: {
      factual_recall: 0,
      preference_consistency: 0,
      cross_domain_transfer: 0,
      contamination_penalty: 0,
      update_correctness: 0,
      personalization_usefulness: 0,
      provenance_explainability: 0,
    },
    goodmemoryAverage: {
      factual_recall: 0,
      preference_consistency: 0,
      cross_domain_transfer: 0,
      contamination_penalty: 0,
      update_correctness: 0,
      personalization_usefulness: 0,
      provenance_explainability: 0,
    },
    uplift: {
      factual_recall: 0,
      preference_consistency: 0,
      cross_domain_transfer: 0,
      contamination_penalty: 0,
      update_correctness: 0,
      personalization_usefulness: 0,
      provenance_explainability: 0,
    },
    layers: {
      baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
      goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
      uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
    },
    assertions: {
      totalCases: 0,
      passingCases: 0,
      passRate: 0,
      totalChecks: 0,
      passingChecks: 0,
      checkPassRate: 0,
      applicableStaleSuppressionCases: 0,
      applicableUpdateCases: 0,
      contaminationFailures: 0,
      staleMisuseCases: 0,
      staleMisuseRate: 0,
      staleSuppressionCases: 0,
      staleSuppressionRate: 0,
      updateWinCases: 0,
      updateWinRate: 0,
      updateFailures: 0,
    },
    outcomeLoopSummary: {
      acceptedProceduralPromotionCases: 0,
      applicableCorrectionCases: 0,
      applicableProceduralReuseCases: 0,
      applicableStaleSuppressionCases: 0,
      correctionWinCases: 0,
      correctionWinRate: 0,
      governedProceduralReuseCases: 0,
      governedProceduralReuseRate: 0,
      staleMisuseCases: 0,
      staleMisuseRate: 0,
      staleSuppressionCases: 0,
      staleSuppressionRate: 0,
    },
    strategySummary: {
      byStrategy: {},
      embeddingImpact: null,
      routerImpact: null,
    },
    maintenanceSummary: {
      averageActiveValidatedPatterns: 0,
      averageCompiledValidatedPatterns: 0,
      averageCorrectionRepairs: 0,
      averageDemotedFacts: 0,
      averagePressuredFacts: 0,
      casesWithAcceptedProceduralPromotions: 0,
      casesWithCompiledProceduralReuse: 0,
      casesWithCorrectionRepairs: 0,
      casesWithDemotions: 0,
      casesWithProceduralReuse: 0,
      casesWithVerificationPressure: 0,
    },
  };
}

describe("run-phase-16-eval script", () => {
  it("resolves the dedicated fallback output directory", () => {
    expect(resolvePhase16FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-16",
    );
  });

  it("uses the curated phase-16 scenario slice by default and keeps explicit overrides narrow", () => {
    expect(resolvePhase16ScenarioIds()).toEqual([
      "scenario-medium-01",
      "scenario-medium-03",
      "scenario-medium-17",
      "scenario-complex-01",
      "scenario-complex-05",
    ]);
    expect(resolvePhase16ScenarioIds(["scenario-medium-01"])).toEqual([
      "scenario-medium-01",
    ]);
  });

  it("wires the phase-16 fallback runner with the curated scenario slice and in-memory replay factory", async () => {
    const calls: Array<Record<string, unknown>> = [];

    const result = await runPhase16FallbackEval(
      {
        limit: 3,
        runId: "phase16-run",
      },
      {
        runSuite: async (input) => {
          calls.push({
            mode: input.mode,
            outputDir: input.outputDir,
            runId: input.runId,
            limit: input.limit,
            scenarioIds: input.scenarioIds,
            hasCreateMemory: typeof input.createMemory === "function",
          });

          return {
            mode: input.mode,
            runId: input.runId ?? "phase16-run",
            runDirectory: join("/tmp", "phase16-run"),
            summary: buildEmptySuiteSummary(),
            runtime: input.runtime!,
            cases: [],
          };
        },
      },
    );

    expect(result.mode).toBe("fallback");
    expect(calls[0]?.mode).toBe("fallback");
    expect(calls[0]?.runId).toBe("phase16-run");
    expect(calls[0]?.limit).toBe(3);
    expect(calls[0]?.hasCreateMemory).toBe(true);
    expect(calls[0]?.scenarioIds).toEqual([
      "scenario-medium-01",
      "scenario-medium-03",
      "scenario-medium-17",
      "scenario-complex-01",
      "scenario-complex-05",
    ]);
    expect(String(calls[0]?.outputDir)).toContain("reports/eval/fallback/phase-16");
  });
});
