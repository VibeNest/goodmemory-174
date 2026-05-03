import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../../src/eval/implicitmembench-research";
import { runPhase55Eval } from "../../scripts/run-phase-55-eval";
import {
  PHASE55_CANONICAL_LIVE_RUN_ID,
  runPhase55LiveMemoryEval,
} from "../../scripts/run-phase-55-live-memory";
import {
  parsePhase55CliOptions,
  resolvePhase55AdapterManifestPath,
  resolvePhase55BenchmarkRoot,
  resolvePhase55FallbackOutputDir,
  resolvePhase55FixtureRoot,
  resolvePhase55LiveMemoryOutputDir,
} from "../../scripts/run-phase-55-shared";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

describe("run-phase-55 scripts", () => {
  it("resolves phase-55 fixture and output directories", () => {
    expect(resolvePhase55FixtureRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-55",
    );
    expect(resolvePhase55BenchmarkRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-55",
    );
    expect(resolvePhase55AdapterManifestPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-55/adapter-manifest.json",
    );
    expect(resolvePhase55FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-55",
    );
    expect(resolvePhase55LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-55",
    );
  });

  it("parses phase-55 cli flags", () => {
    expect(
      parsePhase55CliOptions([
        "bun",
        "run",
        "scripts/run-phase-55-eval.ts",
        "--benchmark-root",
        "/tmp/bench",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase55",
        "--limit",
        "12",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/bench",
      limit: 12,
      outputDir: "/tmp/out",
      runId: "run-phase55",
      smoke: false,
    });
  });

  it("runs phase-55 fallback eval through the targeted fixture root", async () => {
    let receivedInput:
      | {
          benchmarkRoot: string;
          generatedBy: string;
          manifestPath: string;
          mode: string;
          outputDir: string;
        }
      | undefined;

    const report = await runPhase55Eval(
      {
        limit: 12,
      },
      {
        runEvaluation: async (input) => {
          receivedInput = {
            benchmarkRoot: input.benchmarkRoot,
            generatedBy: input.generatedBy,
            manifestPath: input.manifestPath,
            mode: input.mode,
            outputDir: input.outputDir,
          };
          return {
            benchmarkRoot: input.benchmarkRoot,
            generatedAt: "2026-04-30T00:00:00.000Z",
            generatedBy: input.generatedBy,
            kind: "goodmemory",
            manifestPath: input.manifestPath,
            mode: input.mode,
            outputDir: input.outputDir,
            profiles: {},
            runDirectory: `${input.outputDir}/run-phase55`,
            runId: input.runId ?? "run-phase55",
            source: {
              benchmark: "ImplicitMemBench",
              license: "CC BY 4.0",
              url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
            },
            summary: {
              caseCountsByDataset: {
                classical_conditioning: 5,
                priming: 0,
                procedural_memory: 7,
              },
              caseCountsByScorer: {
                priming_pair_judge: 0,
                structured_first_action: 5,
                text_behavior_judge: 7,
              },
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 10,
              primingAverageScore: 0,
              totalBlockingCases: 12,
              totalCases: 12,
            },
          };
        },
      },
    );

    expect(report.kind).toBe("goodmemory");
    expect(receivedInput?.mode).toBe("smoke");
    expect(receivedInput?.benchmarkRoot).toContain(
      "/fixtures/implicitmembench-phase-55",
    );
    expect(receivedInput?.manifestPath).toContain(
      "/fixtures/implicitmembench-phase-55/adapter-manifest.json",
    );
    expect(receivedInput?.generatedBy).toBe("scripts/run-phase-55-eval.ts");
  });

  it("runs phase-55 live-memory eval with canonical live run id by default", async () => {
    let receivedInput:
      | {
          mode: string;
          outputDir: string;
          runId: string | undefined;
        }
      | undefined;

    const report = await runPhase55LiveMemoryEval(
      undefined,
      {
        researchDependencies: {} as ImplicitMemBenchResearchDependencies,
        runEvaluation: async (input) => {
          receivedInput = {
            mode: input.mode,
            outputDir: input.outputDir,
            runId: input.runId,
          };
          return {
            benchmarkRoot: input.benchmarkRoot,
            generatedAt: "2026-04-30T00:00:00.000Z",
            generatedBy: input.generatedBy,
            kind: "goodmemory",
            manifestPath: input.manifestPath,
            mode: input.mode,
            outputDir: input.outputDir,
            profiles: {},
            runDirectory: `${input.outputDir}/${input.runId}`,
            runId: input.runId ?? PHASE55_CANONICAL_LIVE_RUN_ID,
            source: {
              benchmark: "ImplicitMemBench",
              license: "CC BY 4.0",
              url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
            },
            summary: {
              caseCountsByDataset: {
                classical_conditioning: 5,
                priming: 0,
                procedural_memory: 7,
              },
              caseCountsByScorer: {
                priming_pair_judge: 0,
                structured_first_action: 5,
                text_behavior_judge: 7,
              },
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 11,
              primingAverageScore: 0,
              totalBlockingCases: 12,
              totalCases: 12,
            },
          };
        },
      },
    );

    expect(report.mode).toBe("live");
    expect(receivedInput).toEqual({
      mode: "live",
      outputDir:
        "/Users/hjqcan/Documents/GoodMomery/reports/eval/live-memory/phase-55",
      runId: PHASE55_CANONICAL_LIVE_RUN_ID,
    });
  });

  it("covers every targeted phase-55 case without deterministic execution failures", async () => {
    const outputDir = await createTempDir("phase55-fallback");
    const report = await runPhase55Eval({
      outputDir,
      runId: "run-phase55-test",
    });

    expect(report.mode).toBe("smoke");
    expect(report.summary.executionFailures).toBe(0);
    expect(report.summary.totalBlockingCases).toBe(24);
    expect(report.summary.passedBlockingCases).toBeGreaterThanOrEqual(12);
    expect(
      report.profiles["goodmemory-raw-experience"]?.totalBlockingCases,
    ).toBe(12);
    expect(
      report.profiles["goodmemory-distilled-feedback"]?.totalBlockingCases,
    ).toBe(12);
  });
});
