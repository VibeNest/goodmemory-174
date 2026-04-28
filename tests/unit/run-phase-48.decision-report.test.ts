import { describe, expect, it } from "bun:test";
import {
  buildPhase48DecisionReportRunId,
  parsePhase48DecisionReportCliOptions,
  resolvePhase48CanonicalPhase44GatePath,
  resolvePhase48CanonicalPhase45ReportPath,
  resolvePhase48CanonicalPhase46GatePath,
  resolvePhase48CanonicalPhase47GatePath,
  resolvePhase48DecisionReportOutputDir,
  runPhase48DecisionReport,
} from "../../scripts/run-phase-48-decision-report";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase44Gate(): string {
  return JSON.stringify({
    acceptance: { decision: "accepted" },
    evidence: {
      noRootApiWidening: true,
      readOnlySecurityContracts: true,
    },
    generatedBy: "scripts/run-phase-44-gate.ts",
    phase: "phase-44",
    runId: "run-20260426160000",
  });
}

function createAcceptedPhase45Report(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    acceptance: { decision: "accepted" },
    generatedBy: "scripts/run-phase-45-adoption-eval.ts",
    metrics: {
      firstUsefulRecallRate: 1,
      missedRecallRate: 0,
      noMemoryLeakRate: 0,
      staleMemoryRate: 0,
      wrongRecallRate: 0,
    },
    mode: "reference-product-adoption-eval",
    phase: "phase-45",
    rawTranscriptPersistence: {
      persistedRawTranscripts: false,
    },
    runId: "run-20260427104530-adoption-eval",
    scenarios: [
      {
        family: "identity_background_continuity",
        noMemory: {
          observed: true,
        },
      },
      {
        family: "local_viewer_trace_writeback_session_inspection",
        noMemory: {
          observed: true,
        },
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        family: `phase45-reference-product-family-${index}`,
        noMemory: {
          observed: true,
        },
      })),
    ],
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
    ...overrides,
  });
}

function createAcceptedPhase46Gate(): string {
  return JSON.stringify({
    acceptance: { decision: "accepted" },
    commands: [
      {
        label: "phase-46-quality-eval",
        stdout: JSON.stringify({
          scope: {
            inScope: [
              "Phase 45 redacted reference-product failure samples",
              "provider-backed promotion separation for Phase 47",
            ],
            outOfScope: [
              "provider-backed retrieval default promotion",
              "hosted dashboard, cloud sync, account, or team workspace",
              "viewer mutation routes",
              "raw transcript persistence",
              "root public API widening",
            ],
          },
        }),
      },
    ],
    evidence: {
      noRootApiWidening: true,
      qualityRepairBoundary: true,
      qualityReportMetrics: {
        providerBackedPromotionSeparated: true,
      },
    },
    generatedBy: "scripts/run-phase-46-gate.ts",
    phase: "phase-46",
    runId: "run-20260428110000",
  });
}

function createAcceptedPhase47Gate(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    acceptance: { decision: "accepted" },
    commands: [
      {
        label: "phase-47-provider-rollout-eval",
        stdout: JSON.stringify({
          scope: {
            inScope: [
              "explicit provider-backed retrieval request through existing strategy controls",
              "quality promotion criteria against rules-only evidence",
            ],
            outOfScope: [
              "provider-backed retrieval default-on rollout",
              "hosted dashboard, cloud sync, account, or team workspace",
              "viewer mutation routes",
              "raw transcript persistence",
              "root public API widening",
            ],
          },
        }),
      },
    ],
    evidence: {
      noRootApiWidening: true,
      providerReportMetrics: {
        fallbackVisibleCount: 1,
        providerBackedObservedCount: 1,
        rulesOnlyDefaultPreserved: true,
        setupFragilityDelta: 0,
        staleRecallDelta: -1,
        usefulRecallDelta: 1,
        wrongRecallDelta: -1,
      },
    },
    generatedBy: "scripts/run-phase-47-gate.ts",
    phase: "phase-47",
    runId: "run-20260428123000",
    ...overrides,
  });
}

function createReadTextFile(overrides: Record<string, string> = {}) {
  return async (path: string): Promise<string> => {
    if (overrides[path]) {
      return overrides[path];
    }
    if (path === `${ROOT}/phase44.json`) {
      return createAcceptedPhase44Gate();
    }
    if (path === `${ROOT}/phase45.json`) {
      return createAcceptedPhase45Report();
    }
    if (path === `${ROOT}/phase46.json`) {
      return createAcceptedPhase46Gate();
    }
    if (path === `${ROOT}/phase47.json`) {
      return createAcceptedPhase47Gate();
    }
    throw new Error(`Unexpected path: ${path}`);
  };
}

describe("run-phase-48 decision report script", () => {
  it("resolves phase-48 output and canonical input paths", () => {
    expect(resolvePhase48DecisionReportOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-48",
    );
    expect(resolvePhase48CanonicalPhase44GatePath(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-44/run-20260426160000/phase-44-quality-gate.json",
    );
    expect(resolvePhase48CanonicalPhase45ReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
    );
    expect(resolvePhase48CanonicalPhase46GatePath(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json",
    );
    expect(resolvePhase48CanonicalPhase47GatePath(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json",
    );
  });

  it("builds a deterministic phase-48 decision report run id", () => {
    expect(buildPhase48DecisionReportRunId("2026-04-28T17:00:00.000Z")).toBe(
      "run-20260428170000-dashboard-cloud-decision",
    );
  });

  it("parses phase-48 decision report cli flags", () => {
    expect(
      parsePhase48DecisionReportCliOptions([
        "bun",
        "run",
        "scripts/run-phase-48-decision-report.ts",
        "--output-dir",
        "/tmp/phase48",
        "--run-id",
        "run-phase48",
        "--phase44-gate-path",
        "/tmp/phase44.json",
        "--phase45-report-path",
        "/tmp/phase45.json",
        "--phase46-gate-path",
        "/tmp/phase46.json",
        "--phase47-gate-path",
        "/tmp/phase47.json",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase48",
      phase44GatePath: "/tmp/phase44.json",
      phase45ReportPath: "/tmp/phase45.json",
      phase46GatePath: "/tmp/phase46.json",
      phase47GatePath: "/tmp/phase47.json",
      runId: "run-phase48",
    });
  });

  it("writes an accepted no-go decision from Phase 44-47 evidence", async () => {
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase48DecisionReport(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
        phase44GatePath: `${ROOT}/phase44.json`,
        phase45ReportPath: `${ROOT}/phase45.json`,
        phase46GatePath: `${ROOT}/phase46.json`,
        phase47GatePath: `${ROOT}/phase47.json`,
        runId: "run-phase48",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:00:00.000Z",
        readTextFile: createReadTextFile(),
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.decision.decision).toBe("no_go");
    expect(report.productEvidence).toMatchObject({
      hostedSurfaceEvidenceObserved: false,
      memoryQualityNeedAddressedLocally: true,
      providerBackedNeedAddressedByExplicitHybrid: true,
      referenceProductAdoptionProven: true,
    });
    expect(report.viewerBoundary).toEqual({
      browserExecutedMutationAllowed: false,
      localViewerRemainsLocalOnly: true,
      localViewerRemainsReadOnly: true,
      separateHostedSurfaceRequired: true,
    });
    expect(report.inputs.phase46QualityGate.hostedSurfaceEvidenceObserved).toBe(
      false,
    );
    expect(report.inputs.phase47ProviderRolloutGate).toMatchObject({
      explicitHybridOnly: true,
      hostedSurfaceEvidenceObserved: false,
      rulesOnlyDefaultPreserved: true,
    });
    expect(report.rawTranscriptPersistence.persistedRawTranscripts).toBe(false);
    expect(report.surfaceDecisions).toHaveLength(3);
    expect(report.surfaceDecisions.every((surface) => surface.decision === "no_go")).toBe(
      true,
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks when hosted surface evidence appears without a pilot design", async () => {
    const phase45WithHostedNeed = createAcceptedPhase45Report({
      scope: {
        inScope: [
          "runnable reference product under examples/reference-chat-product",
          "Account System adoption blocker",
        ],
        outOfScope: [
          "hosted dashboard, account, team workspace, cloud sync, or analytics",
          "viewer mutation routes or browser-executed forget/revise",
          "raw transcript archive as accepted evidence",
          "new root public API",
        ],
      },
    });

    const report = await runPhase48DecisionReport(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
        phase44GatePath: `${ROOT}/phase44.json`,
        phase45ReportPath: `${ROOT}/phase45.json`,
        phase46GatePath: `${ROOT}/phase46.json`,
        phase47GatePath: `${ROOT}/phase47.json`,
        runId: "run-phase48-hosted-need",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:00:00.000Z",
        readTextFile: createReadTextFile({
          [`${ROOT}/phase45.json`]: phase45WithHostedNeed,
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.decision.decision).toBe("requires_pilot_design");
    expect(report.productEvidence.hostedSurfaceEvidenceObserved).toBe(true);
  });

  it("blocks when Phase 45 scenario families contain team workspace signals", async () => {
    const phase45WithTeamWorkspaceFamily = createAcceptedPhase45Report({
      scenarios: [
        {
          family: "local_viewer_trace_writeback_session_inspection",
          noMemory: {
            observed: true,
          },
        },
        {
          family: "Team_Workspace_adoption_blocker",
          noMemory: {
            observed: true,
          },
        },
        ...Array.from({ length: 10 }, (_, index) => ({
          family: `phase45-reference-product-family-${index}`,
          noMemory: {
            observed: true,
          },
        })),
      ],
    });

    const report = await runPhase48DecisionReport(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
        phase44GatePath: `${ROOT}/phase44.json`,
        phase45ReportPath: `${ROOT}/phase45.json`,
        phase46GatePath: `${ROOT}/phase46.json`,
        phase47GatePath: `${ROOT}/phase47.json`,
        runId: "run-phase48-team-workspace-family",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:00:00.000Z",
        readTextFile: createReadTextFile({
          [`${ROOT}/phase45.json`]: phase45WithTeamWorkspaceFamily,
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.decision.decision).toBe("requires_pilot_design");
    expect(report.productEvidence.hostedSurfaceEvidenceObserved).toBe(true);
  });

  it("fails closed when Phase 47 default-preservation evidence is missing", async () => {
    await expect(
      runPhase48DecisionReport(
        {
          outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
          phase44GatePath: `${ROOT}/phase44.json`,
          phase45ReportPath: `${ROOT}/phase45.json`,
          phase46GatePath: `${ROOT}/phase46.json`,
          phase47GatePath: `${ROOT}/phase47.json`,
          runId: "run-phase48-missing-phase47",
        },
        {
          ensureDir: async () => {},
          now: () => "2026-04-28T17:00:00.000Z",
          readTextFile: createReadTextFile({
            [`${ROOT}/phase47.json`]: createAcceptedPhase47Gate({
              evidence: {
                noRootApiWidening: true,
                providerReportMetrics: {},
              },
            }),
          }),
          writeTextFile: async () => {},
        },
      ),
    ).rejects.toThrow("Phase 47 provider rollout gate");
  });

  it("blocks when Phase 47 lacks explicit hybrid uplift evidence", async () => {
    const report = await runPhase48DecisionReport(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
        phase44GatePath: `${ROOT}/phase44.json`,
        phase45ReportPath: `${ROOT}/phase45.json`,
        phase46GatePath: `${ROOT}/phase46.json`,
        phase47GatePath: `${ROOT}/phase47.json`,
        runId: "run-phase48-no-uplift",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:00:00.000Z",
        readTextFile: createReadTextFile({
          [`${ROOT}/phase47.json`]: createAcceptedPhase47Gate({
            evidence: {
              noRootApiWidening: true,
              providerReportMetrics: {
                fallbackVisibleCount: 1,
                providerBackedObservedCount: 0,
                rulesOnlyDefaultPreserved: true,
                setupFragilityDelta: 0,
                staleRecallDelta: 0,
                usefulRecallDelta: 0,
                wrongRecallDelta: 0,
              },
            },
          }),
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.inputs.phase47ProviderRolloutGate.explicitHybridOnly).toBe(false);
    expect(report.productEvidence.providerBackedNeedAddressedByExplicitHybrid).toBe(
      false,
    );
  });

  it("blocks when Phase 46 evidence contains hosted-surface scope", async () => {
    const report = await runPhase48DecisionReport(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
        phase44GatePath: `${ROOT}/phase44.json`,
        phase45ReportPath: `${ROOT}/phase45.json`,
        phase46GatePath: `${ROOT}/phase46.json`,
        phase47GatePath: `${ROOT}/phase47.json`,
        runId: "run-phase48-hosted-phase46",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:00:00.000Z",
        readTextFile: createReadTextFile({
          [`${ROOT}/phase46.json`]: JSON.stringify({
            acceptance: { decision: "accepted" },
            commands: [
              {
                label: "phase-46-quality-eval",
                stdout: JSON.stringify({
                  scope: {
                    inScope: ["Cloud Sync adoption blocker"],
                    outOfScope: [
                      "provider-backed retrieval default promotion",
                      "hosted dashboard, cloud sync, account, or team workspace",
                      "viewer mutation routes",
                      "raw transcript persistence",
                      "root public API widening",
                    ],
                  },
                }),
              },
            ],
            evidence: {
              noRootApiWidening: true,
              qualityRepairBoundary: true,
              qualityReportMetrics: {
                providerBackedPromotionSeparated: true,
              },
            },
            generatedBy: "scripts/run-phase-46-gate.ts",
            phase: "phase-46",
            runId: "run-20260428110000",
          }),
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.decision.decision).toBe("requires_pilot_design");
    expect(report.inputs.phase46QualityGate.hostedSurfaceEvidenceObserved).toBe(
      true,
    );
  });

  it("blocks when Phase 47 evidence contains hosted-surface scope", async () => {
    const report = await runPhase48DecisionReport(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-48",
        phase44GatePath: `${ROOT}/phase44.json`,
        phase45ReportPath: `${ROOT}/phase45.json`,
        phase46GatePath: `${ROOT}/phase46.json`,
        phase47GatePath: `${ROOT}/phase47.json`,
        runId: "run-phase48-hosted-phase47",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:00:00.000Z",
        readTextFile: createReadTextFile({
          [`${ROOT}/phase47.json`]: createAcceptedPhase47Gate({
            commands: [
              {
                label: "phase-47-provider-rollout-eval",
                stdout: JSON.stringify({
                  scope: {
                    inScope: ["Team Workspace adoption blocker"],
                    outOfScope: [
                      "provider-backed retrieval default-on rollout",
                      "hosted dashboard, cloud sync, account, or team workspace",
                      "viewer mutation routes",
                      "raw transcript persistence",
                      "root public API widening",
                    ],
                  },
                }),
              },
            ],
          }),
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.decision.decision).toBe("requires_pilot_design");
    expect(report.inputs.phase47ProviderRolloutGate.hostedSurfaceEvidenceObserved).toBe(
      true,
    );
  });
});
