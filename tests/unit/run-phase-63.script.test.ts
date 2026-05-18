import { describe, expect, it } from "bun:test";
import type { BeamReport } from "../../src/eval/beam";
import {
  buildPhase63BeamOptions,
  PHASE63_CANONICAL_RUN_ID,
  runPhase63Beam,
} from "../../scripts/run-phase-63-eval";
import {
  checkPhase63Readiness,
  parsePhase63CliOptions,
  resolvePhase63BenchmarkRoot,
  resolvePhase63OutputDir,
} from "../../scripts/run-phase-63-shared";

function buildReport(input: {
  benchmarkRoot: string;
  generatedBy: string;
  mode: "smoke" | "full";
  outputDir: string;
  runId?: string;
}): BeamReport {
  const runId = input.runId ?? PHASE63_CANONICAL_RUN_ID;
  return {
    benchmarkRoot: input.benchmarkRoot,
    generatedAt: "2026-05-18T00:00:00.000Z",
    generatedBy: input.generatedBy,
    mode: input.mode,
    outputDir: input.outputDir,
    phase: "phase-63",
    profiles: {},
    runDirectory: `${input.outputDir}/${runId}`,
    runId,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [],
      scale: "100K",
      totalCases: 0,
    },
  };
}

describe("run-phase-63 BEAM script", () => {
  it("resolves default smoke fixture and output roots", () => {
    expect(resolvePhase63BenchmarkRoot("/tmp/goodmemory", true)).toBe(
      "/tmp/goodmemory/fixtures/external-benchmarks/beam",
    );
    expect(resolvePhase63OutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/research/phase-63/beam",
    );
  });

  it("parses phase-63 cli flags", () => {
    expect(
      parsePhase63CliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-eval.ts",
        "--benchmark-root",
        "/tmp/beam",
        "--mode",
        "full",
        "--case-id",
        "beam-q1",
        "--profile",
        "goodmemory-hybrid",
        "--limit",
        "10",
        "--offset",
        "2",
        "--output-dir",
        "/tmp/out",
        "--question-type",
        "preference",
        "--run-id",
        "run-beam",
        "--scale",
        "500K",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/beam",
      caseIds: ["beam-q1"],
      limit: 10,
      mode: "full",
      offset: 2,
      outputDir: "/tmp/out",
      profiles: ["goodmemory-hybrid"],
      questionTypes: ["preference"],
      runId: "run-beam",
      scale: "500K",
    });
  });

  it("builds canonical smoke options", () => {
    const options = buildPhase63BeamOptions("/tmp/goodmemory", {
      mode: "smoke",
    });

    expect(options).toEqual({
      benchmarkRoot: "/tmp/goodmemory/fixtures/external-benchmarks/beam",
      caseIds: undefined,
      generatedBy: "scripts/run-phase-63-eval.ts",
      limit: undefined,
      mode: "smoke",
      offset: undefined,
      outputDir: "/tmp/goodmemory/reports/eval/research/phase-63/beam",
      profiles: undefined,
      questionTypes: undefined,
      runId: PHASE63_CANONICAL_RUN_ID,
      scale: "100K",
    });
  });

  it("runs through the BEAM suite with injected dependencies", async () => {
    let received:
      | {
          benchmarkRoot: string;
          generatedBy: string;
          mode: "smoke" | "full";
          outputDir: string;
          runId?: string;
        }
      | undefined;

    const report = await runPhase63Beam(
      {},
      {
        runSuite: async (input) => {
          received = input;
          return buildReport(input);
        },
      },
    );

    expect(received?.benchmarkRoot).toContain(
      "/fixtures/external-benchmarks/beam",
    );
    expect(received?.generatedBy).toBe("scripts/run-phase-63-eval.ts");
    expect(received?.mode).toBe("smoke");
    expect(report.runId).toBe(PHASE63_CANONICAL_RUN_ID);
  });

  it("reports missing full-mode BEAM data before execution", () => {
    const report = checkPhase63Readiness(
      {
        benchmarkRoot: "/tmp/missing-beam",
        mode: "full",
        profiles: ["goodmemory-hybrid"],
      },
      {
        fileExists: () => false,
      },
    );

    expect(report.ready).toBe(false);
    expect(report.mode).toBe("full");
    expect(report.checks.map((check) => check.key)).toEqual(["beam-data-file"]);
    expect(report.missing).toContain("BEAM data file");
    expect(report.profiles).toEqual(["goodmemory-hybrid"]);
  });
});
