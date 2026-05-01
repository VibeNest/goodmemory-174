import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../../src/eval/implicitmembench-research";
import { runPhase51Eval } from "../../scripts/run-phase-51-eval";
import {
  PHASE51_CANONICAL_LIVE_RUN_ID,
  runPhase51LiveMemoryEval,
} from "../../scripts/run-phase-51-live-memory";
import {
  parsePhase51CliOptions,
  resolvePhase51AdapterManifestPath,
  resolvePhase51BenchmarkRoot,
  resolvePhase51FallbackOutputDir,
  resolvePhase51FixtureRoot,
  resolvePhase51LiveMemoryOutputDir,
} from "../../scripts/run-phase-51-shared";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

describe("run-phase-51 scripts", () => {
  it("resolves phase-51 fixture and output directories", () => {
    expect(resolvePhase51FixtureRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-51",
    );
    expect(resolvePhase51BenchmarkRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-51",
    );
    expect(resolvePhase51AdapterManifestPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-51/adapter-manifest.json",
    );
    expect(resolvePhase51FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-51",
    );
    expect(resolvePhase51LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-51",
    );
  });

  it("parses phase-51 cli flags", () => {
    expect(
      parsePhase51CliOptions([
        "bun",
        "run",
        "scripts/run-phase-51-eval.ts",
        "--benchmark-root",
        "/tmp/bench",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase51",
        "--limit",
        "9",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/bench",
      limit: 9,
      outputDir: "/tmp/out",
      runId: "run-phase51",
      smoke: false,
    });
  });

  it("runs phase-51 fallback eval through the targeted fixture root", async () => {
    let receivedInput:
      | {
          benchmarkRoot: string;
          generatedBy: string;
          manifestPath: string;
          mode: string;
          outputDir: string;
        }
      | undefined;

    const report = await runPhase51Eval(
      {
        limit: 9,
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
            runDirectory: `${input.outputDir}/run-phase51`,
            runId: input.runId ?? "run-phase51",
            source: {
              benchmark: "ImplicitMemBench",
              license: "CC BY 4.0",
              url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
            },
            summary: {
              caseCountsByDataset: {
                classical_conditioning: 2,
                priming: 1,
                procedural_memory: 6,
              },
              caseCountsByScorer: {
                priming_pair_judge: 1,
                structured_first_action: 2,
                text_behavior_judge: 6,
              },
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 6,
              primingAverageScore: 0,
              totalBlockingCases: 8,
              totalCases: 9,
            },
          };
        },
      },
    );

    expect(report.kind).toBe("goodmemory");
    expect(receivedInput?.mode).toBe("smoke");
    expect(receivedInput?.benchmarkRoot).toContain(
      "/fixtures/implicitmembench-phase-51",
    );
    expect(receivedInput?.manifestPath).toContain(
      "/fixtures/implicitmembench-phase-51/adapter-manifest.json",
    );
    expect(receivedInput?.generatedBy).toBe("scripts/run-phase-51-eval.ts");
  });

  it("runs phase-51 live-memory eval with canonical live run id by default", async () => {
    let receivedInput:
      | {
          mode: string;
          outputDir: string;
          runId: string | undefined;
        }
      | undefined;

    const report = await runPhase51LiveMemoryEval(
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
            runId: input.runId ?? PHASE51_CANONICAL_LIVE_RUN_ID,
            source: {
              benchmark: "ImplicitMemBench",
              license: "CC BY 4.0",
              url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
            },
            summary: {
              caseCountsByDataset: {
                classical_conditioning: 2,
                priming: 1,
                procedural_memory: 6,
              },
              caseCountsByScorer: {
                priming_pair_judge: 1,
                structured_first_action: 2,
                text_behavior_judge: 6,
              },
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 7,
              primingAverageScore: 20,
              totalBlockingCases: 8,
              totalCases: 9,
            },
          };
        },
      },
    );

    expect(report.mode).toBe("live");
    expect(receivedInput).toEqual({
      mode: "live",
      outputDir:
        "/Users/hjqcan/Documents/GoodMomery/reports/eval/live-memory/phase-51",
      runId: PHASE51_CANONICAL_LIVE_RUN_ID,
    });
  });

  it("covers every targeted phase-51 case without deterministic execution failures", async () => {
    const outputDir = await createTempDir("phase51-fallback");
    const report = await runPhase51Eval({
      outputDir,
      runId: "run-phase51-test",
    });

    expect(report.mode).toBe("smoke");
    expect(report.summary.executionFailures).toBe(0);
    expect(report.summary.totalBlockingCases).toBe(16);
    expect(report.summary.passedBlockingCases).toBeGreaterThanOrEqual(8);
    expect(
      report.profiles["goodmemory-raw-experience"]?.totalBlockingCases,
    ).toBe(8);
    expect(
      report.profiles["goodmemory-distilled-feedback"]?.totalBlockingCases,
    ).toBe(8);
  });
});
