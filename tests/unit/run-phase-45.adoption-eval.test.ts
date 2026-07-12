import { describe, expect, it } from "bun:test";
import {
  buildPhase45AdoptionEvalRunId,
  parsePhase45AdoptionEvalCliOptions,
  resolvePhase45AdoptionEvalOutputDir,
  runPhase45AdoptionEval,
} from "../../scripts/run-phase-45-adoption-eval";

describe("run-phase-45 adoption eval script", () => {
  it("resolves the phase-45 adoption eval output directory", () => {
    expect(resolvePhase45AdoptionEvalOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/adoption/phase-45",
    );
  });

  it("builds a deterministic phase-45 adoption eval run id", () => {
    expect(buildPhase45AdoptionEvalRunId("2026-04-27T10:45:30.000Z")).toBe(
      "run-20260427104530-adoption-eval",
    );
  });

  it("parses phase-45 adoption eval cli flags", () => {
    expect(
      parsePhase45AdoptionEvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-45-adoption-eval.ts",
        "--output-dir",
        "/tmp/phase45-adoption",
        "--run-id",
        "run-phase45-adoption",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase45-adoption",
      runId: "run-phase45-adoption",
    });
  });

  it("writes an accepted reference-product adoption report without raw transcripts", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase45AdoptionEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/adoption/phase-45",
        runId: "run-phase45-adoption",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-27T10:45:30.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.phase).toBe("phase-45");
    expect(report.mode).toBe("reference-product-adoption-eval");
    expect(report.generatedBy).toBe("scripts/run-phase-45-adoption-eval.ts");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.variants.noMemory.mode).toBe("no-memory");
    expect(report.variants.noMemory.observed).toBe(true);
    expect(report.variants.rulesOnlyGoodMemory.mode).toBe("rules-only-goodmemory");
    expect(report.variants.providerBackedGoodMemory.status).toBe("skipped");
    expect(report.scenarios.map((scenario) => scenario.family)).toEqual([
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
    ]);
    expect(report.scenarios.every((scenario) => scenario.productPath === "reference-product-backend")).toBe(true);
    expect(report.scenarios.every((scenario) => scenario.noMemory.observed === true)).toBe(true);
    expect(report.scenarios.every((scenario) => scenario.rawTranscriptPersisted === false)).toBe(true);
    expect(report.scenarios.some((scenario) => "acceptedCandidates" in scenario)).toBe(false);
    const observeScenario = report.scenarios.find((scenario) =>
      scenario.family === "observe_writeback_candidate_visibility"
    );
    expect(observeScenario?.redactedEvidence).toMatchObject({
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
    });
    const viewerScenario = report.scenarios.find((scenario) =>
      scenario.family === "local_viewer_trace_writeback_session_inspection"
    );
    expect(viewerScenario?.checks).toEqual([
      "session-start",
      "chat",
      "inspector-scope-catalog",
      "inspector-memory-list",
      "inspector-recall-trace",
      "runtime-viewer-read-only-adapter",
      "backend-mutation-flow",
      "session-end",
    ]);
    expect(viewerScenario?.redactedEvidence).toMatchObject({
      backendMutationCount: 2,
      handoffCount: 0,
      recordRefCount: 1,
      viewerMutationRejected: true,
    });
    expect(viewerScenario?.redactedEvidence.traceEventCount).toBeGreaterThan(0);
    expect(viewerScenario?.redactedEvidence.observedCandidateCount).toBeGreaterThan(0);
    expect(report.metrics.firstUsefulRecallRate).toBeGreaterThan(0);
    expect(report.metrics.wrongRecallRate).toBe(0);
    expect(report.metrics.missedRecallRate).toBe(0);
    expect(report.metrics.correctionSuccessRate).toBe(1);
    expect(report.metrics.staleMemoryRate).toBe(0);
    expect(report.metrics.timeToFirstMemoryValueMs).toBeGreaterThanOrEqual(0);
    expect(report.metrics.userVisibleSetupSteps).toBeGreaterThan(0);
    expect(report.metrics.observeToSelectiveConversionReadiness).toEqual({
      acceptedReviewedRatio: 0.5,
      observedCandidatesAcceptedAsUseful: 1,
      observedCandidatesRejectedAsUnsafeOrNoisy: 1,
      observedCandidatesReviewed: 2,
      scenariosWhereSelectiveWritebackJustified: 1,
    });
    expect(report.rawTranscriptPersistence.persistedRawTranscripts).toBe(false);
    expect(report.rawTranscriptPersistence.defaultRuntimeArchive).toBe("off");
    expect(JSON.stringify(report)).not.toContain("My name is Aster");
    expect(JSON.stringify(report)).not.toContain("sk-phase45-private");
    expect(JSON.stringify(report)).not.toContain("viewer.phase45@example.com");
    expect(JSON.stringify(report)).not.toContain("sk-phase45-viewer");
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/adoption/phase-45/run-phase45-adoption",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe(
      "/tmp/goodmemory/reports/eval/adoption/phase-45/run-phase45-adoption/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("does not accept provider-backed evidence without a real provider execution path", async () => {
    const originalFlag = process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
    const originalProvider = process.env.GOODMEMORY_EMBEDDING_PROVIDER;
    process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED = "1";
    process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
    try {
      const report = await runPhase45AdoptionEval({
        outputDir: "/tmp/goodmemory/reports/eval/adoption/phase-45",
        runId: "run-phase45-provider-guard",
      }, {
        ensureDir: async () => {},
        now: () => "2026-04-27T10:45:30.000Z",
        writeTextFile: async () => {},
      });

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.variants.providerBackedGoodMemory.status).toBe("skipped");
      expect(report.variants.providerBackedGoodMemory.reason).toContain(
        "not implemented",
      );
      const providerScenario = report.scenarios.find((scenario) =>
        scenario.family === "optional_provider_backed_retrieval_uplift"
      );
      expect(providerScenario?.providerBacked.status).toBe("skipped");
      expect(providerScenario?.checks).toContain(
        "provider-backed-real-execution-not-implemented",
      );
      expect(providerScenario?.passed).toBe(false);
    } finally {
      if (originalFlag === undefined) {
        delete process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
      } else {
        process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED = originalFlag;
      }
      if (originalProvider === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_PROVIDER;
      } else {
        process.env.GOODMEMORY_EMBEDDING_PROVIDER = originalProvider;
      }
    }
  });

  it("blocks provider-backed requests even when provider config is missing", async () => {
    const originalFlag = process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
    const originalProvider = process.env.GOODMEMORY_EMBEDDING_PROVIDER;
    const originalModel = process.env.GOODMEMORY_EMBEDDING_MODEL;
    process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED = "1";
    delete process.env.GOODMEMORY_EMBEDDING_PROVIDER;
    delete process.env.GOODMEMORY_EMBEDDING_MODEL;
    try {
      const report = await runPhase45AdoptionEval({
        outputDir: "/tmp/goodmemory/reports/eval/adoption/phase-45",
        runId: "run-phase45-provider-missing-config",
      }, {
        ensureDir: async () => {},
        now: () => "2026-04-27T10:45:30.000Z",
        writeTextFile: async () => {},
      });

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.variants.providerBackedGoodMemory.status).toBe("skipped");
      expect(report.variants.providerBackedGoodMemory.reason).toContain(
        "requested but not implemented",
      );
      const providerScenario = report.scenarios.find((scenario) =>
        scenario.family === "optional_provider_backed_retrieval_uplift"
      );
      expect(providerScenario?.passed).toBe(false);
      expect(providerScenario?.noMemory.observed).toBe(true);
    } finally {
      if (originalFlag === undefined) {
        delete process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
      } else {
        process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED = originalFlag;
      }
      if (originalProvider === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_PROVIDER;
      } else {
        process.env.GOODMEMORY_EMBEDDING_PROVIDER = originalProvider;
      }
      if (originalModel === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_MODEL;
      } else {
        process.env.GOODMEMORY_EMBEDDING_MODEL = originalModel;
      }
    }
  });

  it("does not tell local users to enable provider-backed uplift before a real runner exists", async () => {
    const originalFlag = process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
    const originalProvider = process.env.GOODMEMORY_EMBEDDING_PROVIDER;
    process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
    delete process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
    try {
      const report = await runPhase45AdoptionEval({
        outputDir: "/tmp/goodmemory/reports/eval/adoption/phase-45",
        runId: "run-phase45-provider-config-present",
      }, {
        ensureDir: async () => {},
        now: () => "2026-04-27T10:45:30.000Z",
        writeTextFile: async () => {},
      });

      expect(report.acceptance.decision).toBe("accepted");
      expect(report.variants.providerBackedGoodMemory.status).toBe("skipped");
      expect(report.variants.providerBackedGoodMemory.description).toContain(
        "no real provider-backed execution path",
      );
      expect(report.variants.providerBackedGoodMemory.reason).toContain(
        "explicitly skipped",
      );
      expect(report.variants.providerBackedGoodMemory.reason).not.toContain(
        "GOODMEMORY_PHASE45_PROVIDER_BACKED=1",
      );
    } finally {
      if (originalFlag === undefined) {
        delete process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED;
      } else {
        process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED = originalFlag;
      }
      if (originalProvider === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_PROVIDER;
      } else {
        process.env.GOODMEMORY_EMBEDDING_PROVIDER = originalProvider;
      }
    }
  });

  it("blocks acceptance when an observed no-memory baseline contains useful recall", async () => {
    const report = await runPhase45AdoptionEval({
      outputDir: "/tmp/goodmemory/reports/eval/adoption/phase-45",
      runId: "run-phase45-baseline-guard",
    }, {
      ensureDir: async () => {},
      now: () => "2026-04-27T10:45:30.000Z",
      overrideNoMemoryBaseline: (input) => ({
        missedRecall: false,
        observed: true,
        status: "passed",
        usefulRecall: input.caseId === "identity-background-continuity",
        wrongRecall: false,
      }),
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("no-memory baseline");
    expect(report.metrics.noMemoryLeakRate).toBeGreaterThan(0);
  });
});
