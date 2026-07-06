import { describe, expect, it } from "bun:test";
import {
  buildPhase40ProductEvalRunId,
  parsePhase40ProductEvalCliOptions,
  resolvePhase40ProductEvalOutputDir,
  runPhase40ProductEval,
} from "../../scripts/run-phase-40-product-eval";

describe("run-phase-40 product eval script", () => {
  it("resolves the phase-40 product eval output directory", () => {
    expect(resolvePhase40ProductEvalOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/product/phase-40",
    );
  });

  it("builds a deterministic phase-40 product eval run id", () => {
    expect(buildPhase40ProductEvalRunId("2026-04-25T08:55:44.000Z")).toBe(
      "run-20260425085544-product-eval",
    );
  });

  it("parses phase-40 product eval cli flags", () => {
    expect(
      parsePhase40ProductEvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-40-product-eval.ts",
        "--output-dir",
        "/tmp/phase40-product",
        "--run-id",
        "run-phase40-product",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase40-product",
      runId: "run-phase40-product",
    });
  });

  it("isolates the deterministic rollup from partial live provider environment variables", async () => {
    const envKeys = [
      "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
      "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL",
      "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
      "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
    ] as const;
    const envSnapshot = envKeys.map((key) => [key, process.env[key]] as const);

    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY = "partial-key";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL = "https://example.invalid/v1";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL = "partial-model";
    delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER;

    try {
      const report = await runPhase40ProductEval(
        {
          outputDir: "/tmp/goodmemory/reports/eval/product/phase-40",
          runId: "run-phase40-product-env-isolation",
        },
        {
          ensureDir: async () => {},
          now: () => "2026-04-25T08:55:44.000Z",
          writeTextFile: async () => {},
        },
      );

      expect(report.acceptance.decision).toBe("accepted");
      expect(process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY).toBe("partial-key");
      expect(process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER).toBeUndefined();
    } finally {
      for (const [key, value] of envSnapshot) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("writes an accepted product rollup with no-memory and GoodMemory variants", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase40ProductEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/product/phase-40",
        runId: "run-phase40-product",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-25T08:55:44.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ content, path });
        },
      },
    );

    expect(report.phase).toBe("phase-40");
    expect(report.mode).toBe("product-eval-rollup");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.variants.noMemory.mode).toBe("no-memory");
    expect(report.variants.withGoodMemory.mode).toBe("with-goodmemory");
    expect(report.cases.map((caseResult) => caseResult.focus)).toEqual([
      "identity_background",
      "historical_task_continuation",
      "open_loop_recall",
      "user_correction",
      "feedback_procedural_learning",
      "background_remember",
    ]);
    expect(report.metrics.correctness.continuityUplift).toBeGreaterThan(0);
    expect(report.metrics.correctness.missedRecallRate).toBe(0);
    expect(report.metrics.correctness.wrongRecallRate).toBe(0);
    expect(report.metrics.correctness.correctionSuccessRate).toBe(1);
    expect(report.metrics.productQuality.policyBlockExplainability).toBe(1);
    expect(report.metrics.productQuality.backgroundJobFailureVisibility).toBe(1);
    expect(report.metrics.productQuality.traceCompletenessRate).toBe(1);
    expect(report.metrics.productQuality.duplicateMemoryRate).toBe(0);
    expect(report.metrics.costLatency.withGoodMemoryContextTokens).toBeGreaterThan(0);
    expect(report.metrics.costLatency.backgroundRememberNonBlocking).toBe(true);
    expect(report.traceEvidence.whyRemembered.status).toBe("accepted");
    expect(report.traceEvidence.whyRecalled.status).toBe("accepted");
    expect(report.traceEvidence.whyBlocked.status).toBe("accepted");
    expect(report.traceEvidence.whyRevised.status).toBe("accepted");
    expect(report.rawTranscriptPersistence.persistedRawTranscripts).toBe(false);
    expect(report.rawTranscriptPersistence.defaultRuntimeArchive).toBe("off");
    expect(JSON.stringify(report)).not.toContain("My name is");
    expect(JSON.stringify(report)).not.toContain("private launch token");
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/product/phase-40/run-phase40-product",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe(
      "/tmp/goodmemory/reports/eval/product/phase-40/run-phase40-product/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
