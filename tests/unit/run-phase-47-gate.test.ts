import { describe, expect, it } from "bun:test";
import {
  buildPhase47GateCommands,
  buildPhase47GateRunId,
  parsePhase47GateCliOptions,
  resolvePhase47CanonicalProviderReportPath,
  resolvePhase47GateOutputDir,
  runPhase47QualityGate,
} from "../../scripts/run-phase-47-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase47ProviderReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    defaultScenario: {
      autoBodyResolvedStrategy: "rules-only",
      noStrategyResolvedStrategy: "rules-only",
      providerRuntimeAvailable: true,
      requestedStrategy: "auto",
      resolvedStrategy: "rules-only",
      rulesOnlyDefaultPreserved: true,
    },
    fallbackScenario: {
      fallbackReason: "provider_error",
      requestedStrategy: "hybrid",
      resolvedStrategy: "rules-only",
      rulesOnlyContextRecovered: true,
      silentProviderFailure: false,
    },
    generatedBy: "scripts/run-phase-47-provider-rollout-eval.ts",
    inputs: {
      phase45AdoptionReport: {
        providerBackedStatus: "skipped",
        reportPath:
          "reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
        runId: "run-20260427104530-adoption-eval",
        status: "accepted",
      },
      phase46QualityReport: {
        providerBackedPromotionSeparated: true,
        reportPath:
          "reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
        runId: "run-20260427123000-quality-eval",
        status: "accepted",
      },
    },
    metrics: {
      fallbackVisibleCount: 1,
      providerBackedObservedCount: 1,
      rulesOnlyDefaultPreserved: true,
      scenarioCount: 1,
      setupFragilityDelta: 0,
      staleRecallDelta: -1,
      usefulRecallDelta: 1,
      wrongRecallDelta: -1,
    },
    mode: "provider-backed-retrieval-rollout",
    phase: "phase-47",
    promotionCriteria: {
      maxSetupFragilityDelta: 0,
      maxStaleRecallDelta: 0,
      maxWrongRecallDelta: 0,
      minUsefulRecallDelta: 1,
      requireFallbackVisible: true,
      requireNoDefaultPromotion: true,
    },
    rawTranscriptPersistence: {
      evidenceSource:
        "deterministic_provider_backed_recall_paths_and_phase45_46_redacted_reports",
      persistedRawTranscripts: false,
    },
    runId: "run-20260428120000-provider-rollout-eval",
    scenarios: [
      {
        caseId: "phase47-provider-backed-semantic-tie-break",
        providerBacked: {
          fallbackReason: undefined,
          recalledMemoryIds: ["phase47-z-current-blocker"],
          requestedStrategy: "hybrid",
          resolvedStrategy: "hybrid",
          setupFragility: false,
          staleRecall: false,
          usefulRecall: true,
          wrongRecall: false,
        },
        qualityDelta: {
          setupFragility: 0,
          staleRecall: -1,
          usefulRecall: 1,
          wrongRecall: -1,
        },
        rulesOnly: {
          recalledMemoryIds: ["phase47-a-stale-blocker"],
          requestedStrategy: "rules-only",
          resolvedStrategy: "rules-only",
          setupFragility: false,
          staleRecall: true,
          usefulRecall: false,
          wrongRecall: true,
        },
      },
    ],
    scope: {
      outOfScope: [
        "provider-backed retrieval default-on rollout",
        "root public API widening",
      ],
    },
  });
}

function createGateReadTextFile(providerReport = createAcceptedPhase47ProviderReport()) {
  return async (path: string): Promise<string> => {
    if (path.endsWith("reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json")) {
      return providerReport;
    }
    if (path.endsWith("package.json")) {
      return JSON.stringify({
        scripts: {
          "eval:phase-47": "bun run scripts/run-phase-47-provider-rollout-eval.ts",
          "gate:phase-47": "bun run scripts/run-phase-47-gate.ts",
        },
      });
    }
    if (path.endsWith("src/index.ts")) {
      return "export { createGoodMemory } from './api/createGoodMemory';";
    }
    if (path.endsWith("src/http/index.ts")) {
      return [
        "GoodMemoryHttpRecallRoutingDiagnostics",
        "providerFallback",
        "provider_error",
        "Expected strategy to be auto, rules-only, or hybrid.",
      ].join("\n");
    }
    if (path.endsWith("docs/GoodMemory-Current-Status-and-Evidence.md")) {
      return [
        "Phase 47 is now closed as the Provider-Backed Retrieval Rollout and Quality Promotion slice",
        "reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json",
        "reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json",
        "docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md",
      ].join("\n");
    }
    if (path.endsWith("docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md")) {
      return [
        "Canonical accepted gate run: `run-20260428123000`",
        "run-20260428120000-provider-rollout-eval",
        "provider-backed retrieval",
        "rules-only fallback",
        "provider_error",
        "root public API widening",
      ].join("\n");
    }
    if (path.endsWith("docs/archive/quality-gates/README.md")) {
      return "GoodMemory-Phase-47-Quality-Gate.md";
    }
    if (path.endsWith("task-board/52-phase-47-provider-backed-retrieval-rollout-and-quality-promotion.txt")) {
      return [
        "[DONE] Phase 47 is closed",
        "reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json",
        "reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json",
      ].join("\n");
    }
    if (path.endsWith("task-board/phase-47-provider-backed-retrieval-rollout-and-quality-promotion/04-docs-gate-and-closure.txt")) {
      return [
        "[DONE] P47.4-T002",
        "[DONE] P47.4-T003",
        "GoodMemory-Phase-47-Quality-Gate.md",
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

describe("run-phase-47 gate script", () => {
  it("resolves phase-47 output and canonical provider report paths", () => {
    expect(resolvePhase47GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-47",
    );
    expect(resolvePhase47CanonicalProviderReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json",
    );
  });

  it("builds a deterministic phase-47 gate run id", () => {
    expect(buildPhase47GateRunId("2026-04-28T12:30:00.000Z")).toBe(
      "run-20260428123000",
    );
  });

  it("parses phase-47 gate cli flags", () => {
    expect(
      parsePhase47GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-47-gate.ts",
        "--output-dir",
        "/tmp/phase47-gate",
        "--run-id",
        "run-phase47-gate",
        "--provider-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase47-gate",
      providerReportPath: "/tmp/report.json",
      runId: "run-phase47-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase47GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/run-phase-47.provider-rollout-eval.test.ts",
          "tests/unit/run-phase-47-gate.test.ts",
          "tests/unit/phase-45-reference-product-runtime.test.ts",
          "tests/integration/python-http-bridge.test.ts",
          "--test-name-pattern",
          "run-phase-47|provider-backed|provider failure|auto and omitted|llm-assisted recall|recall strategy",
        ],
        cwd: ROOT,
        label: "phase-47-provider-regressions",
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
        label: "phase-46-quality-eval-prerequisite",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-47",
          "--run-id",
          "run-20260428120000-provider-rollout-eval",
        ],
        cwd: ROOT,
        label: "phase-47-provider-rollout-eval",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-47|package metadata exposes bin|current status doc points|task-board current note|root exports stay aligned|models fallback eval evidence",
        ],
        cwd: ROOT,
        env: {
          PHASE47_GATE_IN_PROGRESS: "1",
        },
        label: "phase-47-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-47 quality gate when evidence and boundaries pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const report = await runPhase47QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-47",
        runId: "run-phase47-gate-test",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:30:00.000Z",
        readTextFile: createGateReadTextFile(),
        runCommand: successfulRunCommand,
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.phase).toBe("phase-47");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.providerReport).toMatchObject({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json",
      regenerateCommand:
        "bun run eval:phase-46 --run-id run-20260427123000-quality-eval && bun run eval:phase-47 --run-id run-20260428120000-provider-rollout-eval",
      status: "accepted",
    });
    expect(report.evidence.providerReportMetrics).toMatchObject({
      fallbackVisibleCount: 1,
      providerBackedObservedCount: 1,
      rulesOnlyDefaultPreserved: true,
      scenarioCount: 1,
      usefulRecallDelta: 1,
      wrongRecallDelta: -1,
    });
    expect(report.evidence.docsAligned).toBe(true);
    expect(report.evidence.httpBridgeDiagnostics).toBe(true);
    expect(report.evidence.noRootApiWidening).toBe(true);
    expect(report.evidence.packageScriptsRegistered).toBe(true);
    expect(report.commands).toHaveLength(5);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks instead of accepting when command execution is skipped", async () => {
    const report = await runPhase47QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-47",
        runId: "run-phase47-gate-skipped-commands",
        skipCommands: true,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:30:00.000Z",
        readTextFile: createGateReadTextFile(),
        writeTextFile: async () => {},
      },
    );

    expect(report.commands).toEqual([]);
    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.providerReport.status).toBe("accepted");
  });

  it("blocks when provider-backed quality improves useful recall but increases wrong recall", async () => {
    const providerReport = JSON.parse(createAcceptedPhase47ProviderReport()) as {
      metrics: {
        wrongRecallDelta: number;
      };
      scenarios: Array<{
        providerBacked: {
          wrongRecall: boolean;
        };
        qualityDelta: {
          wrongRecall: number;
        };
      }>;
    };
    providerReport.metrics.wrongRecallDelta = 1;
    providerReport.scenarios[0]!.providerBacked.wrongRecall = true;
    providerReport.scenarios[0]!.qualityDelta.wrongRecall = 1;

    const report = await runPhase47QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-47",
        runId: "run-phase47-gate-wrong-recall",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(providerReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.providerReport.status).toBe("blocked");
  });

  it("blocks when aggregate metrics do not match scenario evidence", async () => {
    const providerReport = JSON.parse(createAcceptedPhase47ProviderReport()) as {
      metrics: {
        providerBackedObservedCount: number;
      };
    };
    providerReport.metrics.providerBackedObservedCount = 2;

    const report = await runPhase47QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-47",
        runId: "run-phase47-gate-inflated-metrics",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(providerReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.providerReport.status).toBe("blocked");
  });

  it("blocks when provider fallback evidence omits the silent-failure proof", async () => {
    const providerReport = JSON.parse(createAcceptedPhase47ProviderReport()) as {
      fallbackScenario: {
        silentProviderFailure?: boolean;
      };
    };
    delete providerReport.fallbackScenario.silentProviderFailure;

    const report = await runPhase47QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-47",
        runId: "run-phase47-gate-missing-silent-proof",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(providerReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.providerReport.status).toBe("blocked");
    expect(report.evidence.providerReportMetrics.fallbackVisibleCount).toBe(0);
  });

  it("blocks when default proof allows auto provider-backed retrieval", async () => {
    const providerReport = JSON.parse(createAcceptedPhase47ProviderReport()) as {
      defaultScenario: {
        autoBodyResolvedStrategy: string;
      };
      metrics: {
        rulesOnlyDefaultPreserved: boolean;
      };
    };
    providerReport.defaultScenario.autoBodyResolvedStrategy = "hybrid";
    providerReport.metrics.rulesOnlyDefaultPreserved = false;

    const report = await runPhase47QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-47",
        runId: "run-phase47-gate-auto-default",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:30:00.000Z",
        readTextFile: createGateReadTextFile(JSON.stringify(providerReport)),
        runCommand: successfulRunCommand,
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.providerReport.status).toBe("blocked");
    expect(report.evidence.providerReportMetrics.rulesOnlyDefaultPreserved).toBe(false);
  });
});
