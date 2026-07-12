import { describe, expect, it } from "bun:test";
import {
  buildPhase45GateCommands,
  buildPhase45GateRunId,
  parsePhase45GateCliOptions,
  resolvePhase45CanonicalAdoptionReportPath,
  resolvePhase45GateOutputDir,
  runPhase45QualityGate,
} from "../../scripts/run-phase-45-gate";

const ROOT = "/tmp/goodmemory";

const requiredScenarioFamilies = [
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

function createAcceptedPhase45AdoptionReport(): string {
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
      timeToFirstMemoryValueMs: 3,
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
    scenarios: requiredScenarioFamilies.map((family) => ({
      caseId: family.replaceAll("_", "-"),
      checks:
        family === "local_viewer_trace_writeback_session_inspection"
          ? [
              "session-start",
              "chat",
              "inspector-scope-catalog",
              "inspector-memory-list",
              "inspector-recall-trace",
              "runtime-viewer-read-only-adapter",
              "backend-mutation-flow",
              "session-end",
            ]
	          : family === "optional_provider_backed_retrieval_uplift"
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
        family === "local_viewer_trace_writeback_session_inspection"
          ? {
              backendMutationCount: 2,
              handoffCount: 0,
              matchedSignals: [
                "inspector-scope-catalog",
                "inspector-memory-drilldown",
                "inspector-recall-trace",
                "runtime-viewer-read-only-adapter",
                "backend-mutations-outside-inspector",
              ],
              observedCandidateCount: 1,
              recordRefCount: 1,
              traceEventCount: 4,
	              viewerMutationRejected: true,
	            }
	          : family === "observe_writeback_candidate_visibility"
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
	              matchedSignals: ["accepted"],
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
      inScope: [
        "runnable reference product under examples/reference-chat-product",
        "redacted local-viewer inspectability inputs without viewer mutation",
      ],
      outOfScope: [
        "hosted dashboard, account, team workspace, cloud sync, or analytics",
        "viewer mutation routes or browser-executed forget/revise",
        "raw transcript archive as accepted evidence",
        "new root public API",
      ],
    },
    variants: {
      noMemory: {
        mode: "no-memory",
        observed: true,
      },
      providerBackedGoodMemory: {
        mode: "provider-backed-goodmemory",
        reason: "GOODMEMORY provider env is not configured",
        status: "skipped",
      },
      rulesOnlyGoodMemory: {
        mode: "rules-only-goodmemory",
        storage: "memory",
      },
    },
  });
}

describe("run-phase-45 gate script", () => {
  it("resolves phase-45 output and canonical evidence paths", () => {
    expect(resolvePhase45GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-45",
    );
    expect(resolvePhase45CanonicalAdoptionReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
    );
  });

  it("builds a deterministic phase-45 gate run id", () => {
    expect(buildPhase45GateRunId("2026-04-27T11:00:00.000Z")).toBe(
      "run-20260427110000",
    );
  });

  it("parses phase-45 gate cli flags", () => {
    expect(
      parsePhase45GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-45-gate.ts",
        "--output-dir",
        "/tmp/phase45-gate",
        "--run-id",
        "run-phase45-gate",
        "--adoption-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      adoptionReportPath: "/tmp/report.json",
      outputDir: "/tmp/phase45-gate",
      runId: "run-phase45-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase45GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/phase-45-reference-product-contract.test.ts",
          "tests/unit/phase-45-reference-product-runtime.test.ts",
          "tests/unit/run-phase-45.adoption-eval.test.ts",
          "tests/unit/run-phase-45-gate.test.ts",
          "tests/unit/runtime-viewer.test.ts",
          "tests/integration/python-http-bridge.test.ts",
          "--test-name-pattern",
          "phase-45|runtime viewer|python http bridge|run-phase-45",
        ],
        cwd: ROOT,
        label: "phase-45-reference-product-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-45",
          "--run-id",
          "run-20260427104530-adoption-eval",
        ],
        cwd: ROOT,
        label: "phase-45-adoption-eval",
      },
      {
        args: ["bun", "run", "example:reference-product"],
        cwd: ROOT,
        label: "reference-product-smoke",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-45|reference product|package metadata exposes bin|current status doc points|task-board current note|packs a tarball|root exports stay aligned|models fallback eval evidence",
        ],
        cwd: ROOT,
        env: {
          PHASE45_GATE_IN_PROGRESS: "1",
        },
        label: "phase-45-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-45 quality gate when evidence and boundaries pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const report = await runPhase45QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-45",
        runId: "run-phase45-gate-test",
        skipCommands: true,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-27T11:00:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json")) {
            return createAcceptedPhase45AdoptionReport();
          }
          if (path.endsWith("package.json")) {
            return JSON.stringify({
              exports: {},
              scripts: {
                "eval:phase-45": "bun run scripts/run-phase-45-adoption-eval.ts",
                "example:reference-product":
                  "bun run examples/reference-chat-product/backend.ts smoke",
                "gate:phase-45": "bun run scripts/run-phase-45-gate.ts",
              },
            });
          }
          if (path.endsWith("src/index.ts")) {
            return "export { createGoodMemory } from './api/createGoodMemory';";
          }
          if (path.endsWith("src/runtime-viewer/public.ts")) {
            return [
              "normalizeRuntimeViewerBindHost",
              "createInspectorApp",
              "serveInspector",
              "readOnly: true",
            ].join("\n");
          }
          if (path.endsWith("examples/reference-chat-product/backend.ts")) {
            return [
              'from "goodmemory"',
              'from "goodmemory/http"',
              "/memory/recall-context",
              "/memory/remember",
              "/memory/feedback",
              "/memory/export",
              "/memory/forget",
              "/memory/revise",
            ].join("\n");
          }
          if (path.endsWith("examples/reference-chat-product/fastapi_backend.py")) {
            return [
              "GOODMEMORY_BRIDGE_URL",
              "/memory/recall-context",
              "/memory/remember",
              "/memory/feedback",
              "/memory/export",
              "/memory/forget",
              "/memory/revise",
              "CREATE TABLE IF NOT EXISTS product_idempotency",
            ].join("\n");
          }
          if (path.endsWith("examples/reference-chat-product/README.md")) {
            return [
              "goodmemory-http-bridge",
              "bun run example:reference-product",
              "bun run eval:phase-45",
              "bun run gate:phase-45",
              "runtime viewer is deprecated",
              "read-only Inspector",
            ].join("\n");
          }
          if (path.endsWith("docs/GoodMemory-Current-Status-and-Evidence.md")) {
            return [
              "Phase 45 is now closed as the First Reference Product and Adoption Evidence slice",
              "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
              "reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json",
              "docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md",
              "hosted dashboard",
            ].join("\n");
          }
          if (path.endsWith("docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md")) {
            return [
              "Canonical accepted gate run: `run-20260427110000`",
              "run-20260427104530-adoption-eval",
              "reference product",
              "viewer remains read-only",
              "not a hosted dashboard",
            ].join("\n");
          }
          if (path.endsWith("task-board/50-phase-45-first-reference-product-and-adoption-evidence.txt")) {
            return [
              "[DONE] Phase 45 is closed",
              "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
              "reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json",
            ].join("\n");
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-45");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.adoptionReport).toMatchObject({
      artifactKind: "tracked_report",
      reportPath:
        "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
      status: "accepted",
    });
	    expect(report.evidence.adoptionMetrics).toMatchObject({
	      noMemoryLeakRate: 0,
	      observeAcceptedCandidateCount: 1,
	      observeRejectedCandidateCount: 1,
	      observeReviewedCandidateCount: 2,
	      providerBackedStatus: "skipped",
	      scenarioCount: 12,
	      viewerMutationRejected: true,
    });
    expect(report.evidence.noRootApiWidening).toBe(true);
    expect(report.evidence.packageScriptsRegistered).toBe(true);
    expect(report.evidence.referenceProductPublicSurface).toBe(true);
    expect(report.evidence.viewerReadOnlyInspectability).toBe(true);
    expect(report.evidence.docsAligned).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("rejects adoption reports without the required viewer inspectability proof", async () => {
    await expect(runPhase45QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-45",
        runId: "run-phase45-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json")) {
            const report = JSON.parse(createAcceptedPhase45AdoptionReport()) as {
              scenarios: Array<{
                family: string;
                redactedEvidence: Record<string, unknown>;
              }>;
            };
            const viewerScenario = report.scenarios.find((scenario) =>
              scenario.family === "local_viewer_trace_writeback_session_inspection"
            );
            if (viewerScenario) {
              viewerScenario.redactedEvidence = {
                matchedSignals: ["viewer-inputs-inspectable"],
              };
            }
            return JSON.stringify(report);
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 45 adoption report does not match the expected schema.");
  });

  it("rejects adoption reports without hard observe accepted and rejected review evidence", async () => {
    await expect(runPhase45QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-45",
        runId: "run-phase45-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json")) {
            const report = JSON.parse(createAcceptedPhase45AdoptionReport()) as {
              metrics: {
                observeToSelectiveConversionReadiness: {
                  acceptedReviewedRatio: number;
                  observedCandidatesAcceptedAsUseful: number;
                  observedCandidatesRejectedAsUnsafeOrNoisy: number;
                  observedCandidatesReviewed: number;
                  scenariosWhereSelectiveWritebackJustified: number;
                };
              };
              scenarios: Array<{
                family: string;
                redactedEvidence: Record<string, unknown>;
              }>;
            };
            report.metrics.observeToSelectiveConversionReadiness = {
              acceptedReviewedRatio: 0.5,
              observedCandidatesAcceptedAsUseful: 1,
              observedCandidatesRejectedAsUnsafeOrNoisy: 0,
              observedCandidatesReviewed: 2,
              scenariosWhereSelectiveWritebackJustified: 1,
            };
            const observeScenario = report.scenarios.find((scenario) =>
              scenario.family === "observe_writeback_candidate_visibility"
            );
            if (observeScenario) {
              observeScenario.redactedEvidence = {
                matchedSignals: ["observe-candidates-reviewable"],
                observedCandidateCount: 2,
                rejectedCandidateCount: 0,
              };
            }
            return JSON.stringify(report);
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 45 adoption report observe-to-selective evidence is incomplete.");
  });

  it("rejects spoofed provider-backed accepted evidence until Phase 45 has a real provider-backed runner", async () => {
    await expect(runPhase45QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-45",
        runId: "run-phase45-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json")) {
            const report = JSON.parse(createAcceptedPhase45AdoptionReport()) as {
              scenarios: Array<{
                family: string;
                providerBacked: {
                  missedRecall: boolean;
                  observed: boolean;
                  status: string;
                  usefulRecall: boolean;
                  wrongRecall: boolean;
                };
              }>;
              variants: {
                providerBackedGoodMemory: {
                  status: string;
                };
              };
            };
            report.variants.providerBackedGoodMemory.status = "accepted";
            const providerScenario = report.scenarios.find((scenario) =>
              scenario.family === "optional_provider_backed_retrieval_uplift"
            );
            if (providerScenario) {
              providerScenario.providerBacked = {
                missedRecall: false,
                observed: true,
                status: "accepted",
                usefulRecall: true,
                wrongRecall: false,
              };
            }
            return JSON.stringify(report);
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 45 adoption report provider-backed evidence must remain an explicit skip.");
  });
});
