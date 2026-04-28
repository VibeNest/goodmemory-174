import { describe, expect, it } from "bun:test";
import {
  buildPhase48GateCommands,
  buildPhase48GateRunId,
  parsePhase48GateCliOptions,
  resolvePhase48CanonicalDecisionReportPath,
  resolvePhase48GateOutputDir,
  runPhase48QualityGate,
} from "../../scripts/run-phase-48-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase48DecisionReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    decision: {
      decision: "no_go",
      reason: "Phase 45-47 evidence does not justify hosted surfaces.",
    },
    generatedAt: "2026-04-28T17:00:00.000Z",
    generatedBy: "scripts/run-phase-48-decision-report.ts",
    inputs: {
      phase44LocalViewerGate: {
        readOnlySecurityContracts: true,
        reportPath:
          "reports/quality-gates/phase-44/run-20260426160000/phase-44-quality-gate.json",
        runId: "run-20260426160000",
        status: "accepted",
      },
      phase45AdoptionReport: {
        localViewerInspectionObserved: true,
        noMemoryBaselineObserved: true,
        reportPath:
          "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
        runId: "run-20260427104530-adoption-eval",
        scenarioCount: 12,
        status: "accepted",
      },
      phase46QualityGate: {
        hostedSurfaceEvidenceObserved: false,
        providerBackedPromotionSeparated: true,
        qualityRepairBoundary: true,
        reportPath:
          "reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json",
        runId: "run-20260428110000",
        status: "accepted",
      },
      phase47ProviderRolloutGate: {
        explicitHybridOnly: true,
        hostedSurfaceEvidenceObserved: false,
        reportPath:
          "reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json",
        rulesOnlyDefaultPreserved: true,
        runId: "run-20260428123000",
        status: "accepted",
      },
    },
    mode: "dashboard-cloud-sync-team-workspace-decision",
    phase: "phase-48",
    pilot: {
      decision: "no_go",
      noGoReasons: [
        "Phase 45 proved reference-product value without hosted surfaces.",
        "Phase 46 quality gaps were addressed locally.",
        "Phase 47 provider need was explicit hybrid retrieval.",
        "Phase 44 local viewer remains sufficient for inspectability.",
      ],
      reconsiderationTriggers: [
        "cross-device sync becomes a measured blocker",
        "shared review requires tenancy",
        "local inspectability becomes an adoption blocker",
      ],
      smallestSafePilot: null,
    },
    productEvidence: {
      hostedSurfaceEvidenceObserved: false,
      memoryQualityNeedAddressedLocally: true,
      providerBackedNeedAddressedByExplicitHybrid: true,
      referenceProductAdoptionProven: true,
    },
    rawTranscriptPersistence: {
      persistedRawTranscripts: false,
      policy: "blocked_by_default",
    },
    runId: "run-20260428170000-dashboard-cloud-decision",
    scope: {
      inScope: [
        "Phase 45-47 evidence-backed hosted surface decision",
      ],
      outOfScope: [
        "implementing hosted dashboard, account, cloud sync, or team workspace runtime",
        "turning the Phase 44 local viewer into a hosted dashboard",
        "browser-executed mutation on the local viewer",
        "raw transcript archive as a default product feature",
        "root public API widening",
      ],
    },
    surfaceDecisions: [
      {
        decision: "no_go",
        surface: "hosted_dashboard",
      },
      {
        decision: "no_go",
        surface: "cloud_sync",
      },
      {
        decision: "no_go",
        surface: "team_workspace",
      },
    ],
    threatModel: {
      auditRequired: true,
      authRequired: true,
      deletionRequired: true,
      exportRequired: true,
      rawTranscriptDefault: "blocked",
      redactionRequired: true,
      tenancyRequired: true,
    },
    viewerBoundary: {
      browserExecutedMutationAllowed: false,
      localViewerRemainsLocalOnly: true,
      localViewerRemainsReadOnly: true,
      separateHostedSurfaceRequired: true,
    },
  });
}

function createGateReadTextFile(decisionReport = createAcceptedPhase48DecisionReport()) {
  return async (path: string): Promise<string> => {
    if (
      path === `${ROOT}/phase48/report.json` ||
      path.endsWith(
        "reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
      )
    ) {
      return decisionReport;
    }
    if (path.endsWith("package.json")) {
      return JSON.stringify({
        exports: {
          ".": {
            import: "./dist/index.js",
            types: "./dist/index.d.ts",
          },
        },
        scripts: {
          "eval:phase-48": "bun run scripts/run-phase-48-decision-report.ts",
          "gate:phase-48": "bun run scripts/run-phase-48-gate.ts",
        },
      });
    }
    if (path.endsWith("src/index.ts")) {
      return "export { createGoodMemory } from './api/createGoodMemory';";
    }
    if (path.endsWith("src/runtime-viewer/public.ts")) {
      return [
        "normalizeRuntimeViewerBindHost",
        "GoodMemory runtime viewer is read-only",
        "rawTranscriptPersisted: false",
      ].join("\n");
    }
    if (path.endsWith("docs/GoodMemory-Current-Status-and-Evidence.md")) {
      return [
        "Phase 48 is now closed as the Dashboard, Cloud Sync, and Team Workspace Decision slice",
        "no-go decision",
        "reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
        "reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json",
      ].join("\n");
    }
    if (path.endsWith("docs/archive/quality-gates/GoodMemory-Phase-48-Quality-Gate.md")) {
      return [
        "Canonical accepted gate run: `run-20260428173000`",
        "run-20260428170000-dashboard-cloud-decision",
        "no-go",
        "auth",
        "tenancy",
        "raw transcript",
        "local viewer remains local-only",
      ].join("\n");
    }
    if (path.endsWith("docs/archive/quality-gates/README.md")) {
      return "GoodMemory-Phase-48-Quality-Gate.md";
    }
    if (path.endsWith("task-board/53-phase-48-dashboard-cloud-sync-and-team-workspace-decision.txt")) {
      return [
        "[DONE] Phase 48 is closed with an accepted no-go decision",
        "reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
        "reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json",
      ].join("\n");
    }
    if (path.endsWith("task-board/phase-48-dashboard-cloud-sync-and-team-workspace-decision/04-pilot-or-no-go-gate.txt")) {
      return [
        "[DONE] P48.4-T003",
        "GoodMemory-Phase-48-Quality-Gate.md",
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

describe("run-phase-48 gate script", () => {
  it("resolves phase-48 output and canonical decision report paths", () => {
    expect(resolvePhase48GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-48",
    );
    expect(resolvePhase48CanonicalDecisionReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
    );
  });

  it("builds a deterministic phase-48 gate run id", () => {
    expect(buildPhase48GateRunId("2026-04-28T17:30:00.000Z")).toBe(
      "run-20260428173000",
    );
  });

  it("parses phase-48 gate cli flags", () => {
    expect(
      parsePhase48GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-48-gate.ts",
        "--output-dir",
        "/tmp/phase48-gate",
        "--run-id",
        "run-phase48-gate",
        "--decision-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      decisionReportPath: "/tmp/report.json",
      outputDir: "/tmp/phase48-gate",
      runId: "run-phase48-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase48GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/run-phase-48.decision-report.test.ts",
          "tests/unit/run-phase-48-gate.test.ts",
          "--test-name-pattern",
          "run-phase-48",
        ],
        cwd: ROOT,
        label: "phase-48-decision-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "gate:phase-47",
          "--run-id",
          "run-20260428123000",
        ],
        cwd: ROOT,
        env: {
          PHASE48_GATE_IN_PROGRESS: "1",
        },
        label: "phase-47-gate-prerequisite",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-48",
          "--run-id",
          "run-20260428170000-dashboard-cloud-decision",
        ],
        cwd: ROOT,
        label: "phase-48-decision-report",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-48|package metadata exposes bin|current status doc points|task-board current note|root exports stay aligned|models fallback eval evidence",
        ],
        cwd: ROOT,
        env: {
          PHASE48_GATE_IN_PROGRESS: "1",
        },
        label: "phase-48-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-48 quality gate when evidence and boundaries pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-test",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: createGateReadTextFile(),
        runCommand: successfulRunCommand,
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.phase).toBe("phase-48");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.decisionReport).toMatchObject({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
      regenerateCommand:
        "bun run gate:phase-47 --run-id run-20260428123000 && bun run eval:phase-48 --run-id run-20260428170000-dashboard-cloud-decision",
      status: "accepted",
    });
    expect(report.evidence.decisionReportSummary).toMatchObject({
      decision: "no_go",
      hostedSurfaceEvidenceObserved: false,
      localViewerPreserved: true,
      rawTranscriptPersistenceBlocked: true,
      surfaceDecisionCount: 3,
      threatModelComplete: true,
    });
    expect(report.evidence.docsAligned).toBe(true);
    expect(report.evidence.localViewerBoundaryPreserved).toBe(true);
    expect(report.evidence.noRootApiWidening).toBe(true);
    expect(report.evidence.packageScriptsRegistered).toBe(true);
    expect(report.commands).toHaveLength(5);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks instead of accepting when command execution is skipped", async () => {
    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-skipped-commands",
        skipCommands: true,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: createGateReadTextFile(),
        writeTextFile: async () => {},
      },
    );

    expect(report.commands).toEqual([]);
    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.decisionReport.status).toBe("accepted");
  });

  it("blocks when the decision report requires a hosted pilot design", async () => {
    const decisionReport = JSON.parse(createAcceptedPhase48DecisionReport()) as {
      acceptance: { decision: string };
      decision: { decision: string };
      productEvidence: { hostedSurfaceEvidenceObserved: boolean };
    };
    decisionReport.acceptance.decision = "blocked";
    decisionReport.decision.decision = "requires_pilot_design";
    decisionReport.productEvidence.hostedSurfaceEvidenceObserved = true;

    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-hosted-pilot",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(decisionReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.decisionReport.status).toBe("blocked");
    expect(report.evidence.decisionReportSummary.hostedSurfaceEvidenceObserved).toBe(
      true,
    );
  });

  it("blocks when the threat model is incomplete", async () => {
    const decisionReport = JSON.parse(createAcceptedPhase48DecisionReport()) as {
      threatModel: { authRequired: boolean };
    };
    decisionReport.threatModel.authRequired = false;

    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-threat-model",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(decisionReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.decisionReportSummary.threatModelComplete).toBe(false);
  });

  it("blocks when all three hosted surfaces are not explicitly no-go", async () => {
    const decisionReport = JSON.parse(createAcceptedPhase48DecisionReport()) as {
      surfaceDecisions: Array<{ decision: string; surface: string }>;
    };
    decisionReport.surfaceDecisions[2]!.surface = "cloud_sync";

    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-surface-decisions",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(decisionReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.decisionReport.status).toBe("blocked");
    expect(report.evidence.decisionReportSummary.surfaceDecisionCount).toBe(3);
  });

  it("blocks when the local viewer source no longer preserves bind-host safety", async () => {
    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-viewer-boundary",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("src/runtime-viewer/public.ts")) {
            return [
              "GoodMemory runtime viewer is read-only",
              "rawTranscriptPersisted: false",
            ].join("\n");
          }
          return createGateReadTextFile()(path);
        },
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.localViewerBoundaryPreserved).toBe(false);
  });

  it("blocks when the local viewer source adds a CORS header with standard casing", async () => {
    const report = await runPhase48QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-48",
        runId: "run-phase48-gate-viewer-cors",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T17:30:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("src/runtime-viewer/public.ts")) {
            return [
              "normalizeRuntimeViewerBindHost",
              "GoodMemory runtime viewer is read-only",
              "Access-Control-Allow-Origin",
              "rawTranscriptPersisted: false",
            ].join("\n");
          }
          return createGateReadTextFile()(path);
        },
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.localViewerBoundaryPreserved).toBe(false);
  });
});
