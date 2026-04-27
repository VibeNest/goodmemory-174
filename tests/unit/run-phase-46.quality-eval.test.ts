import { describe, expect, it } from "bun:test";
import {
  buildPhase46QualityEvalRunId,
  parsePhase46QualityEvalCliOptions,
  resolvePhase46CanonicalPhase45ReportPath,
  resolvePhase46QualityEvalOutputDir,
  runPhase46QualityEval,
} from "../../scripts/run-phase-46-quality-eval";

const requiredPhase45Families = [
  "identity_background_continuity",
  "project_preference_continuity",
  "coding_style_preference_continuity",
  "historical_task_continuation",
  "user_correction_targeted_revise",
  "wrong_memory_forget",
  "procedural_feedback_memory",
  "observe_writeback_candidate_visibility",
  "selective_writeback_next_turn_recall",
  "no_provider_rules_only_fallback",
  "optional_provider_backed_retrieval_uplift",
  "local_viewer_trace_writeback_session_inspection",
] as const;

interface MutablePhase45Variant {
  missedRecall: boolean;
  observed: boolean;
  status?: string;
  usefulRecall: boolean;
  wrongRecall: boolean;
}

interface MutablePhase45Scenario {
  family: string;
  noMemory: MutablePhase45Variant;
  providerBacked: MutablePhase45Variant;
  redactedEvidence: Record<string, unknown>;
  rulesOnlyGoodMemory: MutablePhase45Variant;
}

interface MutablePhase45Report {
  scenarios: MutablePhase45Scenario[];
  variants: {
    providerBackedGoodMemory: {
      status?: string;
    };
  };
}

function createAcceptedPhase45Report(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    generatedAt: "2026-04-27T10:45:30.000Z",
    generatedBy: "scripts/run-phase-45-adoption-eval.ts",
    metrics: {
      correctionSuccessRate: 1,
      firstUsefulRecallRate: 1,
      missedRecallRate: 0,
      noMemoryLeakRate: 0,
      observeToSelectiveConversionReadiness: {
        acceptedReviewedRatio: 0.5,
        observedCandidatesAcceptedAsUseful: 1,
        observedCandidatesRejectedAsUnsafeOrNoisy: 1,
        observedCandidatesReviewed: 2,
        scenariosWhereSelectiveWritebackJustified: 1,
      },
      staleMemoryRate: 0,
      timeToFirstMemoryValueMs: 8,
      userVisibleSetupSteps: 4,
      wrongRecallRate: 0,
    },
    mode: "reference-product-adoption-eval",
    phase: "phase-45",
    rawTranscriptPersistence: {
      defaultRuntimeArchive: "off",
      evidenceSource: "redacted_reference_product_scenario_events",
      persistedRawTranscripts: false,
    },
    runId: "run-20260427104530-adoption-eval",
    scenarios: requiredPhase45Families.map((family) => ({
      caseId: family.replaceAll("_", "-"),
      checks:
        family === "optional_provider_backed_retrieval_uplift"
          ? ["provider-backed-eval-explicitly-skipped"]
          : ["scenario-check"],
      family,
      noMemory: {
        missedRecall: true,
        observed: true,
        status: "passed",
        usefulRecall: false,
        wrongRecall: false,
      },
      passed: true,
      productPath: "reference-product-backend",
      providerBacked: {
        missedRecall: false,
        observed: false,
        status: "skipped",
        usefulRecall: false,
        wrongRecall: false,
      },
      rawTranscriptPersisted: false,
      redactedEvidence:
        family === "observe_writeback_candidate_visibility"
          ? {
              acceptedCandidateCount: 1,
              matchedSignals: [
                "observe-candidates-reviewable",
                "observe-useful-candidate-approved",
                "observe-private-candidate-rejected",
              ],
              observedCandidateCount: 2,
              rejectedCandidateCount: 1,
              reviewDecisionCount: 2,
              reviewDecisionReasonCodes: [
                "useful_launch_note_candidate",
                "explicit_private_secret_do_not_store",
              ],
            }
          : {
              matchedSignals: [family],
            },
      rulesOnlyGoodMemory: {
        missedRecall: false,
        observed: true,
        status: "passed",
        usefulRecall: true,
        wrongRecall: false,
      },
    })),
    scope: {
      outOfScope: ["new root public API"],
    },
    variants: {
      noMemory: {
        mode: "no-memory",
        observed: true,
      },
      providerBackedGoodMemory: {
        mode: "provider-backed-goodmemory",
        reason: "provider-backed explicitly skipped",
        status: "skipped",
      },
      rulesOnlyGoodMemory: {
        mode: "rules-only-goodmemory",
        storage: "memory",
      },
    },
  });
}

function mutateAcceptedPhase45Report(
  mutate: (report: MutablePhase45Report) => void,
): string {
  const report = JSON.parse(createAcceptedPhase45Report()) as MutablePhase45Report;
  mutate(report);
  return JSON.stringify(report);
}

describe("run-phase-46 quality eval script", () => {
  it("resolves phase-46 output and canonical phase-45 input paths", () => {
    expect(resolvePhase46QualityEvalOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-46",
    );
    expect(resolvePhase46CanonicalPhase45ReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
    );
  });

  it("builds a deterministic phase-46 quality eval run id", () => {
    expect(buildPhase46QualityEvalRunId("2026-04-27T12:30:00.000Z")).toBe(
      "run-20260427123000-quality-eval",
    );
  });

  it("parses phase-46 quality eval cli flags", () => {
    expect(
      parsePhase46QualityEvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-46-quality-eval.ts",
        "--output-dir",
        "/tmp/phase46",
        "--run-id",
        "run-phase46",
        "--phase45-report-path",
        "/tmp/phase45.json",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase46",
      phase45ReportPath: "/tmp/phase45.json",
      runId: "run-phase46",
    });
  });

  it("writes an accepted quality report from Phase 45 samples and deterministic repairs", async () => {
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase46QualityEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-46",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        runId: "run-phase46-quality",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T12:30:00.000Z",
        readTextFile: async (path) => {
          if (path === "/tmp/goodmemory/phase45.json") {
            return createAcceptedPhase45Report();
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.phase).toBe("phase-46");
    expect(report.mode).toBe("memory-quality-and-maintenance-2-0");
    expect(report.generatedBy).toBe("scripts/run-phase-46-quality-eval.ts");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.inputs.phase45AdoptionReport).toMatchObject({
      runId: "run-20260427104530-adoption-eval",
      status: "accepted",
    });
    expect(report.failureSamples.map((sample) => sample.label)).toEqual([
      "missed_recall",
      "over_remembering",
    ]);
    expect(report.failureSamples.every((sample) => sample.baselineObservedFailure)).toBe(true);
    expect(report.guardedRepairScenarios).toEqual([
      expect.objectContaining({
        family: "stale_recall",
        observedPhase45Failure: false,
        scenarioId: "phase46-stale-recall-historical-task-continuation-guardrail",
      }),
    ]);
    expect(
      report.failureSamples.every(
        (sample) =>
          sample.sourceScenario.length > 0 &&
          sample.productImpact.length > 0 &&
          sample.redactedEvidence.matchedSignals.length > 0,
      ),
    ).toBe(true);
    expect(report.diagnosis.providerBackedUpliftCandidates).toEqual([
      "optional-provider-backed-retrieval-uplift",
    ]);
    expect(report.repairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceKind: "maintenance_guardrail",
          family: "stale_recall",
          repair:
            "qualityRepair demotes repeatedly hinted stale inferred action facts only when a current replacement is linked",
          status: "passed",
        }),
        expect.objectContaining({
          evidenceKind: "failure_sample",
          family: "over_remembering",
          repair:
            "qualityRepair demotes quality failure-sample-marked unsafe writeback facts",
          status: "passed",
        }),
        expect.objectContaining({
          evidenceKind: "failure_sample",
          family: "missed_recall",
          repair: "rules-only GoodMemory closes Phase 45 no-memory missed-recall baseline",
          status: "passed",
        }),
      ]),
    );
    expect(report.metrics).toMatchObject({
      failureSampleCount: 2,
      identityContinuityPreserved: true,
      maintenanceGuardrailCount: 1,
      observedFailureSampleCount: 2,
      overRememberingDemotedCount: 1,
      providerBackedPromotionSeparated: true,
      staleRepairDemotedCount: 1,
    });
    expect(JSON.stringify(report)).not.toContain("sk-phase45");
    expect(report.rawTranscriptPersistence.persistedRawTranscripts).toBe(false);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks when Phase 45 observe evidence has no rejected unsafe or noisy sample", async () => {
    const report = await runPhase46QualityEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-46",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        runId: "run-phase46-quality-no-reject",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T12:30:00.000Z",
        readTextFile: async () =>
          mutateAcceptedPhase45Report((phase45) => {
            const observe = phase45.scenarios.find((scenario) =>
              scenario.family === "observe_writeback_candidate_visibility"
            );
            if (observe) {
              observe.redactedEvidence.rejectedCandidateCount = 0;
              observe.redactedEvidence.reviewDecisionReasonCodes = [
                "useful_launch_note_candidate",
              ];
            }
          }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.failureSamples.find((sample) => sample.label === "over_remembering")).toMatchObject({
      baselineObservedFailure: false,
    });
    expect(report.metrics.overRememberingDemotedCount).toBe(0);
  });

  it("blocks when Phase 45 missed-recall failure was not explicitly observed", async () => {
    const report = await runPhase46QualityEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-46",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        runId: "run-phase46-quality-unobserved-missed",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T12:30:00.000Z",
        readTextFile: async () =>
          mutateAcceptedPhase45Report((phase45) => {
            const historical = phase45.scenarios.find((scenario) =>
              scenario.family === "historical_task_continuation"
            );
            if (historical) {
              historical.noMemory.observed = false;
              historical.noMemory.missedRecall = true;
            }
          }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.failureSamples.find((sample) => sample.label === "missed_recall")).toMatchObject({
      baselineObservedFailure: false,
    });
    expect(report.metrics.observedFailureSampleCount).toBe(1);
    expect(
      report.repairs.find((repair) => repair.family === "missed_recall")?.status,
    ).toBe("failed");
  });

  it("blocks when Phase 45 observe candidate evidence was not explicitly observed", async () => {
    const report = await runPhase46QualityEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-46",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        runId: "run-phase46-quality-unobserved-over-memory",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T12:30:00.000Z",
        readTextFile: async () =>
          mutateAcceptedPhase45Report((phase45) => {
            const observe = phase45.scenarios.find((scenario) =>
              scenario.family === "observe_writeback_candidate_visibility"
            );
            if (observe) {
              observe.rulesOnlyGoodMemory.observed = false;
              observe.redactedEvidence.rejectedCandidateCount = 1;
            }
          }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.failureSamples.find((sample) => sample.label === "over_remembering")).toMatchObject({
      baselineObservedFailure: false,
    });
    expect(report.metrics.observedFailureSampleCount).toBe(1);
    expect(report.metrics.overRememberingDemotedCount).toBe(0);
  });

  it("blocks when provider-backed skip evidence is missing instead of defaulting to skipped", async () => {
    const report = await runPhase46QualityEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-46",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        runId: "run-phase46-quality-missing-provider-status",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T12:30:00.000Z",
        readTextFile: async () =>
          mutateAcceptedPhase45Report((phase45) => {
            const providerScenario = phase45.scenarios.find((scenario) =>
              scenario.family === "optional_provider_backed_retrieval_uplift"
            );
            if (providerScenario) {
              delete providerScenario.providerBacked.status;
            }
          }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.diagnosis.providerBackedPromotionSeparated).toBe(false);
    expect(report.diagnosis.providerBackedUpliftCandidates).toEqual([]);
  });

  it("blocks when Phase 45 rules-only GoodMemory has unresolved recall failure", async () => {
    const report = await runPhase46QualityEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-46",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        runId: "run-phase46-quality-goodmemory-fail",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T12:30:00.000Z",
        readTextFile: async () =>
          mutateAcceptedPhase45Report((phase45) => {
            const historical = phase45.scenarios.find((scenario) =>
              scenario.family === "historical_task_continuation"
            );
            if (historical) {
              historical.rulesOnlyGoodMemory.usefulRecall = false;
              historical.rulesOnlyGoodMemory.missedRecall = true;
              historical.rulesOnlyGoodMemory.wrongRecall = true;
            }
          }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.diagnosis.rulesOnlyFailureSampleIds).toEqual([
      "phase46-missed-recall-historical-task-continuation",
    ]);
    expect(
      report.repairs.find((repair) => repair.family === "missed_recall")?.status,
    ).toBe("failed");
  });
});
