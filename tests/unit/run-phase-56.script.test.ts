import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImplicitMemBenchResearchDependencies } from "../../src/eval/implicitmembench-research";
import { runPhase56Eval } from "../../scripts/run-phase-56-eval";
import {
  PHASE56_CANONICAL_LIVE_RUN_ID,
  runPhase56LiveMemoryEval,
} from "../../scripts/run-phase-56-live-memory";
import {
  parsePhase56CliOptions,
  resolvePhase56AdapterManifestPath,
  resolvePhase56BenchmarkRoot,
  resolvePhase56FallbackOutputDir,
  resolvePhase56FixtureRoot,
  resolvePhase56LiveMemoryOutputDir,
} from "../../scripts/run-phase-56-shared";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

describe("run-phase-56 scripts", () => {
  it("resolves phase-56 fixture and output directories", () => {
    expect(resolvePhase56FixtureRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-56",
    );
    expect(resolvePhase56BenchmarkRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-56",
    );
    expect(resolvePhase56AdapterManifestPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-phase-56/adapter-manifest.json",
    );
    expect(resolvePhase56FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-56",
    );
    expect(resolvePhase56LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-56",
    );
  });

  it("parses phase-56 cli flags", () => {
    expect(
      parsePhase56CliOptions([
        "bun",
        "run",
        "scripts/run-phase-56-eval.ts",
        "--benchmark-root",
        "/tmp/bench",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase56",
        "--limit",
        "12",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/bench",
      limit: 12,
      outputDir: "/tmp/out",
      runId: "run-phase56",
      smoke: false,
    });
  });

  it("runs phase-56 fallback eval through the targeted fixture root", async () => {
    let receivedInput:
      | {
          benchmarkRoot: string;
          generatedBy: string;
          manifestPath: string;
          mode: string;
          outputDir: string;
        }
      | undefined;

    const report = await runPhase56Eval(
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
            runDirectory: `${input.outputDir}/run-phase56`,
            runId: input.runId ?? "run-phase56",
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
      "/fixtures/implicitmembench-phase-56",
    );
    expect(receivedInput?.manifestPath).toContain(
      "/fixtures/implicitmembench-phase-56/adapter-manifest.json",
    );
    expect(receivedInput?.generatedBy).toBe("scripts/run-phase-56-eval.ts");
  });

  it("runs phase-56 live-memory eval with canonical live run id by default", async () => {
    let receivedInput:
      | {
          mode: string;
          outputDir: string;
          runId: string | undefined;
        }
      | undefined;

    const report = await runPhase56LiveMemoryEval(
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
            runId: input.runId ?? PHASE56_CANONICAL_LIVE_RUN_ID,
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
      outputDir: resolvePhase56LiveMemoryOutputDir(process.cwd()),
      runId: PHASE56_CANONICAL_LIVE_RUN_ID,
    });
  });

  it("covers every targeted phase-56 case without deterministic execution failures", async () => {
    const outputDir = await createTempDir("phase56-fallback");
    const report = await runPhase56Eval({
      outputDir,
      runId: "run-phase56-test",
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
