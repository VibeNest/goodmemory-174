import { describe, expect, it } from "bun:test";
import {
  buildPhase46GateCommands,
  buildPhase46GateRunId,
  parsePhase46GateCliOptions,
  resolvePhase46CanonicalQualityReportPath,
  resolvePhase46GateOutputDir,
  runPhase46QualityGate,
} from "../../scripts/run-phase-46-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase46QualityReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    diagnosis: {
      causesBySampleId: {
        "phase46-missed-recall-historical-task-continuation":
          "no_memory_baseline",
        "phase46-over-remembering-observe-rejected-candidate":
          "writeback_candidate_review",
      },
      providerBackedUpliftCandidates: [
        "optional-provider-backed-retrieval-uplift",
      ],
      providerBackedPromotionSeparated: true,
      rulesOnlyFailureSampleIds: [],
    },
    failureSamples: [
      {
        baselineObservedFailure: true,
        goodMemoryObservedFailure: false,
        label: "missed_recall",
        sampleId: "phase46-missed-recall-historical-task-continuation",
      },
      {
        baselineObservedFailure: true,
        goodMemoryObservedFailure: false,
        label: "over_remembering",
        sampleId: "phase46-over-remembering-observe-rejected-candidate",
      },
    ],
    generatedAt: "2026-04-27T12:30:00.000Z",
    generatedBy: "scripts/run-phase-46-quality-eval.ts",
    guardedRepairScenarios: [
      {
        family: "stale_recall",
        observedPhase45Failure: false,
        scenarioId: "phase46-stale-recall-historical-task-continuation-guardrail",
      },
    ],
    inputs: {
      phase45AdoptionReport: {
        reportPath:
          "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
        runId: "run-20260427104530-adoption-eval",
        status: "accepted",
      },
    },
    metrics: {
      failureSampleCount: 2,
      identityContinuityPreserved: true,
      maintenanceGuardrailCount: 1,
      missedRecallBaselineClosedCount: 1,
      observedFailureSampleCount: 2,
      overRememberingDemotedCount: 1,
      providerBackedPromotionSeparated: true,
      repairPassCount: 3,
      staleRepairDemotedCount: 1,
    },
    mode: "memory-quality-and-maintenance-2-0",
    phase: "phase-46",
    rawTranscriptPersistence: {
      evidenceSource: "phase45_redacted_scenario_evidence_and_deterministic_repairs",
      persistedRawTranscripts: false,
    },
    repairs: [
      {
        evidenceKind: "failure_sample",
        family: "missed_recall",
        status: "passed",
      },
      {
        evidenceKind: "maintenance_guardrail",
        family: "stale_recall",
        status: "passed",
      },
      {
        evidenceKind: "failure_sample",
        family: "over_remembering",
        status: "passed",
      },
    ],
    runId: "run-20260427123000-quality-eval",
    scope: {
      outOfScope: [
        "provider-backed retrieval default promotion",
        "root public API widening",
      ],
    },
  });
}

function createGateReadTextFile(qualityReport = createAcceptedPhase46QualityReport()) {
  return async (path: string): Promise<string> => {
    if (path.endsWith("reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json")) {
      return qualityReport;
    }
    if (path.endsWith("package.json")) {
      return JSON.stringify({
        scripts: {
          "eval:phase-46": "bun run scripts/run-phase-46-quality-eval.ts",
          "gate:phase-46": "bun run scripts/run-phase-46-gate.ts",
        },
      });
    }
    if (path.endsWith("src/index.ts")) {
      return "export { createGoodMemory } from './api/createGoodMemory';";
    }
    if (path.endsWith("src/maintenance/runner.ts")) {
      return [
        "qualityRepair",
        "jobs: MaintenanceJobName[] = [",
        '"dedupe"',
        '"contradiction"',
        '"consolidation"',
        '"embeddingRepair"',
      ].join("\n");
    }
    if (path.endsWith("src/eval/runners.ts")) {
      return [
        "OUTCOME_AWARE_MAINTENANCE_JOBS",
        '"qualityRepair"',
        '"dedupe"',
      ].join("\n");
    }
    if (path.endsWith("docs/GoodMemory-Current-Status-and-Evidence.md")) {
      return [
        "Phase 46 is now closed as the Memory Quality and Maintenance 2.0 slice",
        "reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
        "reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json",
        "docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md",
      ].join("\n");
    }
    if (path.endsWith("docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md")) {
      return [
        "Canonical accepted gate run: `run-20260428110000`",
        "run-20260427123000-quality-eval",
        "maintenance guardrail",
        "provider-backed retrieval default promotion",
      ].join("\n");
    }
    if (path.endsWith("docs/archive/quality-gates/README.md")) {
      return "GoodMemory-Phase-46-Quality-Gate.md";
    }
    if (path.endsWith("task-board/51-phase-46-memory-quality-and-maintenance-2-0.txt")) {
      return [
        "[DONE] Phase 46 is closed",
        "reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
        "reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json",
      ].join("\n");
    }
    if (path.endsWith("task-board/phase-46-memory-quality-and-maintenance-2-0/04-regressions-and-gate.txt")) {
      return [
        "[DONE] P46.4-T002",
        "GoodMemory-Phase-46-Quality-Gate.md",
      ].join("\n");
    }
    throw new Error(`Unexpected path: ${path}`);
  };
}

async function successfulRunCommand() {
  return {
    durationMs: 0,
    exitCode: 0,
    stderr: "",
    stdout: "",
  };
}

describe("run-phase-46 gate script", () => {
  it("resolves phase-46 output and canonical evidence paths", () => {
    expect(resolvePhase46GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-46",
    );
    expect(resolvePhase46CanonicalQualityReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
    );
  });

  it("builds a deterministic phase-46 gate run id", () => {
    expect(buildPhase46GateRunId("2026-04-28T11:00:00.000Z")).toBe(
      "run-20260428110000",
    );
  });

  it("parses phase-46 gate cli flags", () => {
    expect(
      parsePhase46GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-46-gate.ts",
        "--output-dir",
        "/tmp/phase46-gate",
        "--run-id",
        "run-phase46-gate",
        "--quality-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase46-gate",
      qualityReportPath: "/tmp/report.json",
      runId: "run-phase46-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase46GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/run-phase-46.quality-eval.test.ts",
          "tests/unit/run-phase-46-gate.test.ts",
          "tests/integration/maintenance.runner.test.ts",
          "tests/integration/maintenance.api.test.ts",
          "tests/integration/recall.touch-helpers.test.ts",
          "tests/integration/recall.outcome-scoring.test.ts",
          "tests/eval/runners.test.ts",
          "--test-name-pattern",
          "run-phase-46|qualityRepair|maintenance|verification pressure|stale action-driving|same recall raises|unsurfaced|caps persisted",
        ],
        cwd: ROOT,
        label: "phase-46-quality-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-46",
          "--run-id",
          "run-20260427123000-quality-eval",
        ],
        cwd: ROOT,
        label: "phase-46-quality-eval",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-46|package metadata exposes bin|current status doc points|task-board current note|root exports stay aligned|models fallback eval evidence",
        ],
        cwd: ROOT,
        env: {
          PHASE46_GATE_IN_PROGRESS: "1",
        },
        label: "phase-46-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-46 quality gate when evidence and boundaries pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const report = await runPhase46QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-46",
        runId: "run-phase46-gate-test",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T11:00:00.000Z",
        readTextFile: createGateReadTextFile(),
        runCommand: successfulRunCommand,
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.phase).toBe("phase-46");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.qualityReport).toMatchObject({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
      status: "accepted",
    });
    expect(report.evidence.qualityReportMetrics).toMatchObject({
      failureSampleCount: 2,
      maintenanceGuardrailCount: 1,
      observedFailureSampleCount: 2,
      repairPassCount: 3,
    });
    expect(report.evidence.docsAligned).toBe(true);
    expect(report.evidence.noRootApiWidening).toBe(true);
    expect(report.evidence.packageScriptsRegistered).toBe(true);
    expect(report.evidence.qualityRepairBoundary).toBe(true);
    expect(report.commands).toHaveLength(4);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks instead of accepting when command execution is skipped", async () => {
    const report = await runPhase46QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-46",
        runId: "run-phase46-gate-skipped-commands",
        skipCommands: true,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T11:00:00.000Z",
        readTextFile: createGateReadTextFile(),
        writeTextFile: async () => {},
      },
    );

    expect(report.commands).toEqual([]);
    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.qualityReport.status).toBe("accepted");
  });

  it("blocks when the quality report points at a noncanonical Phase 45 input", async () => {
    const qualityReport = JSON.parse(createAcceptedPhase46QualityReport()) as {
      inputs: {
        phase45AdoptionReport: {
          reportPath: string;
          runId: string;
        };
      };
    };
    qualityReport.inputs.phase45AdoptionReport.runId = "run-noncanonical-phase45";
    qualityReport.inputs.phase45AdoptionReport.reportPath =
      "reports/eval/adoption/phase-45/run-noncanonical-phase45/report.json";

    const report = await runPhase46QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-46",
        runId: "run-phase46-gate-noncanonical-phase45",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T11:00:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(qualityReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.qualityReport.status).toBe("blocked");
  });

  it("blocks when stale recall is mislabeled as an observed failure sample", async () => {
    await expect(runPhase46QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-46",
        runId: "run-phase46-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json")) {
            const report = JSON.parse(createAcceptedPhase46QualityReport()) as {
              failureSamples: unknown[];
              metrics: {
                failureSampleCount: number;
                observedFailureSampleCount: number;
              };
            };
            report.failureSamples.push({
              baselineObservedFailure: false,
              label: "stale_recall",
              sampleId: "bad-stale-sample",
            });
            report.metrics.failureSampleCount = 3;
            report.metrics.observedFailureSampleCount = 2;
            return JSON.stringify(report);
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 46 quality report does not match the expected schema.");
  });

  it("blocks when the stale repair guardrail is missing", async () => {
    await expect(runPhase46QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-46",
        runId: "run-phase46-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json")) {
            const report = JSON.parse(createAcceptedPhase46QualityReport()) as {
              guardedRepairScenarios: unknown[];
              metrics: {
                maintenanceGuardrailCount: number;
              };
              repairs: Array<{
                evidenceKind: string;
                family: string;
                status: string;
              }>;
            };
            report.guardedRepairScenarios = [];
            report.metrics.maintenanceGuardrailCount = 0;
            report.repairs = report.repairs.filter((repair) =>
              repair.family !== "stale_recall"
            );
            return JSON.stringify(report);
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 46 quality report does not match the expected schema.");
  });
});
