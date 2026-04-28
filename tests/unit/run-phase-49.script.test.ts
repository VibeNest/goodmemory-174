import { describe, expect, it } from "bun:test";
import {
  runPhase49BaselineEval,
} from "../../scripts/run-phase-49-baseline";
import {
  runPhase49ComparisonEval,
} from "../../scripts/run-phase-49";
import {
  runPhase49GoodMemoryEval,
} from "../../scripts/run-phase-49-goodmemory";
import {
  parsePhase49CliOptions,
  resolvePhase49AdapterManifestPath,
  resolvePhase49BaselineOutputDir,
  resolvePhase49ComparisonOutputDir,
  resolvePhase49FixtureRoot,
  resolvePhase49GoodMemoryOutputDir,
  resolvePhase49SmokeBenchmarkRoot,
} from "../../scripts/run-phase-49-shared";

describe("run-phase-49 scripts", () => {
  it("resolves phase-49 fixture and output directories", () => {
    expect(resolvePhase49FixtureRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-research",
    );
    expect(resolvePhase49SmokeBenchmarkRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-research",
    );
    expect(resolvePhase49AdapterManifestPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-research/adapter-manifest.json",
    );
    expect(resolvePhase49BaselineOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/research/phase-49/baseline",
    );
    expect(resolvePhase49GoodMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/research/phase-49/goodmemory",
    );
    expect(resolvePhase49ComparisonOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/research/phase-49",
    );
  });

  it("parses phase-49 cli flags", () => {
    expect(
      parsePhase49CliOptions([
        "bun",
        "run",
        "scripts/run-phase-49.ts",
        "--benchmark-root",
        "/tmp/bench",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase49",
        "--limit",
        "12",
        "--smoke",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/bench",
      limit: 12,
      outputDir: "/tmp/out",
      runId: "run-phase49",
      smoke: true,
    });
  });

  it("runs phase-49 baseline eval through the smoke fixture root", async () => {
    let receivedBenchmarkRoot: string | undefined;
    let receivedManifestPath: string | undefined;

    const report = await runPhase49BaselineEval(
      {
        smoke: true,
      },
      {
        runEvaluation: async (input) => {
          receivedBenchmarkRoot = input.benchmarkRoot;
          receivedManifestPath = input.manifestPath;
          return {
            benchmarkRoot: input.benchmarkRoot,
            generatedAt: "2026-04-28T00:00:00.000Z",
            generatedBy: "tests",
            kind: "baseline",
            manifestPath: input.manifestPath,
            mode: input.mode,
            outputDir: input.outputDir,
            profiles: {},
            runDirectory: `${input.outputDir}/run-phase49`,
            runId: input.runId ?? "run-phase49",
            source: {
              benchmark: "ImplicitMemBench",
              license: "CC BY 4.0",
              url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
            },
            summary: {
              caseCountsByDataset: {
                classical_conditioning: 0,
                priming: 0,
                procedural_memory: 0,
              },
              caseCountsByScorer: {
                priming_pair_judge: 0,
                structured_first_action: 0,
                text_behavior_judge: 0,
              },
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 0,
              primingAverageScore: null,
              totalBlockingCases: 0,
              totalCases: 0,
            },
          };
        },
      },
    );

    expect(report.kind).toBe("baseline");
    expect(receivedBenchmarkRoot).toContain(
      "/fixtures/implicitmembench-research",
    );
    expect(receivedManifestPath).toContain(
      "/fixtures/implicitmembench-research/adapter-manifest.json",
    );
  });

  it("runs phase-49 goodmemory eval through the smoke fixture root", async () => {
    let receivedMode: string | undefined;

    const report = await runPhase49GoodMemoryEval(
      {
        smoke: true,
      },
      {
        runEvaluation: async (input) => {
          receivedMode = input.mode;
          return {
            benchmarkRoot: input.benchmarkRoot,
            generatedAt: "2026-04-28T00:00:00.000Z",
            generatedBy: "tests",
            kind: "goodmemory",
            manifestPath: input.manifestPath,
            mode: input.mode,
            outputDir: input.outputDir,
            profiles: {},
            runDirectory: `${input.outputDir}/run-phase49`,
            runId: input.runId ?? "run-phase49",
            source: {
              benchmark: "ImplicitMemBench",
              license: "CC BY 4.0",
              url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
            },
            summary: {
              caseCountsByDataset: {
                classical_conditioning: 0,
                priming: 0,
                procedural_memory: 0,
              },
              caseCountsByScorer: {
                priming_pair_judge: 0,
                structured_first_action: 0,
                text_behavior_judge: 0,
              },
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 0,
              primingAverageScore: null,
              totalBlockingCases: 0,
              totalCases: 0,
            },
          };
        },
      },
    );

    expect(report.kind).toBe("goodmemory");
    expect(receivedMode).toBe("smoke");
  });

  it("runs phase-49 comparison eval through the shared output contract", async () => {
    let receivedOutputDir: string | undefined;

    const reports = await runPhase49ComparisonEval(
      {
        smoke: true,
      },
      {
        runEvaluation: async (input) => {
          receivedOutputDir = input.outputDir;
          return {
            baselineReport: {
              benchmarkRoot: input.benchmarkRoot,
              generatedAt: "2026-04-28T00:00:00.000Z",
              generatedBy: "tests",
              kind: "baseline",
              manifestPath: input.manifestPath,
              mode: input.mode,
              outputDir: `${input.outputDir}/baseline`,
              profiles: {},
              runDirectory: `${input.outputDir}/baseline/run-phase49`,
              runId: input.runId ?? "run-phase49",
              source: {
                benchmark: "ImplicitMemBench",
                license: "CC BY 4.0",
                url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
              },
              summary: {
                caseCountsByDataset: {
                  classical_conditioning: 0,
                  priming: 0,
                  procedural_memory: 0,
                },
                caseCountsByScorer: {
                  priming_pair_judge: 0,
                  structured_first_action: 0,
                  text_behavior_judge: 0,
                },
                executionFailures: 0,
                explicitRecallLeakCount: 0,
                passedBlockingCases: 0,
                primingAverageScore: null,
                totalBlockingCases: 0,
                totalCases: 0,
              },
            },
            comparisonReport: {
              baselineReportPath: `${input.outputDir}/baseline/run-phase49/report.json`,
              benchmarkRoot: input.benchmarkRoot,
              comparison: {
                byScorer: {
                  priming_pair_judge: {
                    baselineBlockingPassRate: null,
                    caseCount: 1,
                    goodmemoryDistilledBlockingPassRate: null,
                    goodmemoryRawBlockingPassRate: null,
                    primingDeltaOfDelta: 0,
                    primingScoreBaseline: 0,
                    primingScoreRaw: 0,
                  },
                  structured_first_action: {
                    baselineBlockingPassRate: 0,
                    caseCount: 1,
                    goodmemoryDistilledBlockingPassRate: 1,
                    goodmemoryRawBlockingPassRate: 1,
                    primingDeltaOfDelta: null,
                    primingScoreBaseline: null,
                    primingScoreRaw: null,
                  },
                  text_behavior_judge: {
                    baselineBlockingPassRate: 0,
                    caseCount: 1,
                    goodmemoryDistilledBlockingPassRate: 1,
                    goodmemoryRawBlockingPassRate: 1,
                    primingDeltaOfDelta: null,
                    primingScoreBaseline: null,
                    primingScoreRaw: null,
                  },
                },
                cases: []
              },
              generatedAt: "2026-04-28T00:00:00.000Z",
              generatedBy: "tests",
              goodmemoryReportPath: `${input.outputDir}/goodmemory/run-phase49/report.json`,
              kind: "comparison",
              manifestPath: input.manifestPath,
              mode: input.mode,
              outputDir: `${input.outputDir}/comparison`,
              runDirectory: `${input.outputDir}/comparison/run-phase49`,
              runId: input.runId ?? "run-phase49",
              source: {
                benchmark: "ImplicitMemBench",
                license: "CC BY 4.0",
                url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
              },
              summary: {
                caseCount: 3,
                scorerFamilies: [
                  "structured_first_action",
                  "text_behavior_judge",
                  "priming_pair_judge",
                ],
              },
            },
            goodmemoryReport: {
              benchmarkRoot: input.benchmarkRoot,
              generatedAt: "2026-04-28T00:00:00.000Z",
              generatedBy: "tests",
              kind: "goodmemory",
              manifestPath: input.manifestPath,
              mode: input.mode,
              outputDir: `${input.outputDir}/goodmemory`,
              profiles: {},
              runDirectory: `${input.outputDir}/goodmemory/run-phase49`,
              runId: input.runId ?? "run-phase49",
              source: {
                benchmark: "ImplicitMemBench",
                license: "CC BY 4.0",
                url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
              },
              summary: {
                caseCountsByDataset: {
                  classical_conditioning: 0,
                  priming: 0,
                  procedural_memory: 0,
                },
                caseCountsByScorer: {
                  priming_pair_judge: 0,
                  structured_first_action: 0,
                  text_behavior_judge: 0,
                },
                executionFailures: 0,
                explicitRecallLeakCount: 0,
                passedBlockingCases: 0,
                primingAverageScore: null,
                totalBlockingCases: 0,
                totalCases: 0,
              },
            },
          };
        },
      },
    );

    expect(receivedOutputDir).toContain("/reports/eval/research/phase-49");
    expect(reports.comparisonReport.kind).toBe("comparison");
  });
});
