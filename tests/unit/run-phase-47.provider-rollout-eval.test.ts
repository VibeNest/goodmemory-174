import { describe, expect, it } from "bun:test";
import {
  buildPhase47ProviderRolloutEvalRunId,
  parsePhase47ProviderRolloutEvalCliOptions,
  resolvePhase47CanonicalPhase45ReportPath,
  resolvePhase47CanonicalPhase46ReportPath,
  resolvePhase47ProviderRolloutEvalOutputDir,
  runPhase47ProviderRolloutEval,
} from "../../scripts/run-phase-47-provider-rollout-eval";

function createAcceptedPhase45Report(): string {
  return JSON.stringify({
    acceptance: { decision: "accepted" },
    generatedBy: "scripts/run-phase-45-adoption-eval.ts",
    mode: "reference-product-adoption-eval",
    phase: "phase-45",
    rawTranscriptPersistence: {
      persistedRawTranscripts: false,
    },
    runId: "run-20260427104530-adoption-eval",
    scenarios: [
      {
        caseId: "optional-provider-backed-retrieval-uplift",
        family: "optional_provider_backed_retrieval_uplift",
        passed: true,
        providerBacked: {
          observed: false,
          status: "skipped",
          usefulRecall: false,
          wrongRecall: false,
        },
        rawTranscriptPersisted: false,
        rulesOnlyGoodMemory: {
          observed: true,
          usefulRecall: true,
          wrongRecall: false,
        },
      },
    ],
    variants: {
      providerBackedGoodMemory: {
        status: "skipped",
      },
    },
  });
}

function createAcceptedPhase46Report(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    acceptance: { decision: "accepted" },
    diagnosis: {
      providerBackedPromotionSeparated: true,
      rulesOnlyFailureSampleIds: [],
    },
    generatedBy: "scripts/run-phase-46-quality-eval.ts",
    metrics: {
      providerBackedPromotionSeparated: true,
      repairPassCount: 3,
    },
    mode: "memory-quality-and-maintenance-2-0",
    phase: "phase-46",
    rawTranscriptPersistence: {
      persistedRawTranscripts: false,
    },
    runId: "run-20260427123000-quality-eval",
    scope: {
      outOfScope: [
        "provider-backed retrieval default promotion",
        "root public API widening",
      ],
    },
    ...overrides,
  });
}

describe("run-phase-47 provider rollout eval script", () => {
  it("resolves phase-47 output and canonical prerequisite paths", () => {
    expect(resolvePhase47ProviderRolloutEvalOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-47",
    );
    expect(resolvePhase47CanonicalPhase45ReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json",
    );
    expect(resolvePhase47CanonicalPhase46ReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
    );
  });

  it("builds a deterministic phase-47 provider rollout eval run id", () => {
    expect(buildPhase47ProviderRolloutEvalRunId("2026-04-28T12:00:00.000Z")).toBe(
      "run-20260428120000-provider-rollout-eval",
    );
  });

  it("parses phase-47 provider rollout eval cli flags", () => {
    expect(
      parsePhase47ProviderRolloutEvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-47-provider-rollout-eval.ts",
        "--output-dir",
        "/tmp/phase47",
        "--run-id",
        "run-phase47",
        "--phase45-report-path",
        "/tmp/phase45.json",
        "--phase46-report-path",
        "/tmp/phase46.json",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase47",
      phase45ReportPath: "/tmp/phase45.json",
      phase46ReportPath: "/tmp/phase46.json",
      runId: "run-phase47",
    });
  });

  it("writes an accepted provider-backed rollout report from real recall paths", async () => {
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase47ProviderRolloutEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-47",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        phase46ReportPath: "/tmp/goodmemory/phase46.json",
        runId: "run-phase47-provider",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:00:00.000Z",
        readTextFile: async (path) => {
          if (path === "/tmp/goodmemory/phase45.json") {
            return createAcceptedPhase45Report();
          }
          if (path === "/tmp/goodmemory/phase46.json") {
            return createAcceptedPhase46Report();
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.defaultScenario).toMatchObject({
      autoBodyResolvedStrategy: "rules-only",
      noStrategyResolvedStrategy: "rules-only",
      providerRuntimeAvailable: true,
      requestedStrategy: "auto",
      resolvedStrategy: "rules-only",
      rulesOnlyDefaultPreserved: true,
    });
    expect(report.inputs.phase45AdoptionReport.status).toBe("accepted");
    expect(report.inputs.phase46QualityReport.providerBackedPromotionSeparated).toBe(true);
    expect(report.metrics.providerBackedObservedCount).toBe(1);
    expect(report.metrics.usefulRecallDelta).toBe(1);
    expect(report.metrics.wrongRecallDelta).toBeLessThanOrEqual(0);
    expect(report.metrics.staleRecallDelta).toBe(-1);
    expect(report.metrics.setupFragilityDelta).toBe(0);
    expect(report.metrics.fallbackVisibleCount).toBe(1);
    expect(report.metrics.rulesOnlyDefaultPreserved).toBe(true);
    expect(report.promotionCriteria).toMatchObject({
      maxSetupFragilityDelta: 0,
      maxStaleRecallDelta: 0,
      maxWrongRecallDelta: 0,
      minUsefulRecallDelta: 1,
      requireFallbackVisible: true,
      requireNoDefaultPromotion: true,
    });
    expect(report.scenarios[0]).toMatchObject({
      caseId: "phase47-provider-backed-semantic-tie-break",
      providerBacked: {
        fallbackReason: undefined,
        recalledMemoryIds: ["phase47-z-current-blocker"],
        resolvedStrategy: "hybrid",
        setupFragility: false,
        staleRecall: false,
        usefulRecall: true,
        wrongRecall: false,
      },
      rulesOnly: {
        recalledMemoryIds: ["phase47-a-stale-blocker"],
        resolvedStrategy: "rules-only",
        setupFragility: false,
        staleRecall: true,
        usefulRecall: false,
        wrongRecall: true,
      },
    });
    expect(report.fallbackScenario).toMatchObject({
      fallbackReason: "provider_error",
      requestedStrategy: "hybrid",
      rulesOnlyContextRecovered: true,
      resolvedStrategy: "rules-only",
      silentProviderFailure: false,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-47/run-phase47-provider/report.json",
    );
  });

  it("blocks when Phase 46 did not preserve provider-backed promotion separation", async () => {
    const report = await runPhase47ProviderRolloutEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-47",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        phase46ReportPath: "/tmp/goodmemory/phase46.json",
        runId: "run-phase47-provider",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:00:00.000Z",
        readTextFile: async (path) => {
          if (path === "/tmp/goodmemory/phase45.json") {
            return createAcceptedPhase45Report();
          }
          if (path === "/tmp/goodmemory/phase46.json") {
            return createAcceptedPhase46Report({
              diagnosis: {
                providerBackedPromotionSeparated: false,
                rulesOnlyFailureSampleIds: [],
              },
              metrics: {
                providerBackedPromotionSeparated: false,
                repairPassCount: 3,
              },
            });
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance).toMatchObject({
      decision: "blocked",
    });
    expect(report.inputs.phase46QualityReport.providerBackedPromotionSeparated).toBe(false);
  });

  it("rejects Phase 45 reports whose provider-backed status is missing", async () => {
    const phase45Report = JSON.parse(createAcceptedPhase45Report()) as {
      variants: {
        providerBackedGoodMemory: {
          status?: string;
        };
      };
    };
    delete phase45Report.variants.providerBackedGoodMemory.status;

    await expect(runPhase47ProviderRolloutEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-47",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        phase46ReportPath: "/tmp/goodmemory/phase46.json",
        runId: "run-phase47-provider",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:00:00.000Z",
        readTextFile: async (path) => {
          if (path === "/tmp/goodmemory/phase45.json") {
            return JSON.stringify(phase45Report);
          }
          if (path === "/tmp/goodmemory/phase46.json") {
            return createAcceptedPhase46Report();
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async () => {},
      },
    )).rejects.toThrow("Phase 45 adoption report does not match the expected schema.");
  });

  it("rejects Phase 46 reports whose rules-only failure samples are missing", async () => {
    const phase46Report = JSON.parse(createAcceptedPhase46Report()) as {
      diagnosis: {
        rulesOnlyFailureSampleIds?: string[];
      };
    };
    delete phase46Report.diagnosis.rulesOnlyFailureSampleIds;

    await expect(runPhase47ProviderRolloutEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-47",
        phase45ReportPath: "/tmp/goodmemory/phase45.json",
        phase46ReportPath: "/tmp/goodmemory/phase46.json",
        runId: "run-phase47-provider",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-28T12:00:00.000Z",
        readTextFile: async (path) => {
          if (path === "/tmp/goodmemory/phase45.json") {
            return createAcceptedPhase45Report();
          }
          if (path === "/tmp/goodmemory/phase46.json") {
            return JSON.stringify(phase46Report);
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async () => {},
      },
    )).rejects.toThrow("Phase 46 quality report does not match the expected schema.");
  });
});
