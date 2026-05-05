import { describe, expect, it } from "bun:test";
import type {
  ImplicitMemBenchComparisonReport,
  ImplicitMemBenchResearchReport,
} from "../../src/eval/implicitmembench-research";
import type { Phase60OverallSummary } from "../../src/eval/phase60";
import {
  PHASE60_CANONICAL_RUN_ID,
  runPhase60Eval,
} from "../../scripts/run-phase-60-eval";
import {
  PHASE60_CANONICAL_OVERALL_RUN_ID,
  runPhase60Overall,
} from "../../scripts/run-phase-60-overall";
import {
  parsePhase60CliOptions,
  resolvePhase60FallbackOutputDir,
  resolvePhase60FixtureRoot,
  resolvePhase60OverallSummaryPath,
} from "../../scripts/run-phase-60-shared";

function buildReport(kind: "baseline" | "goodmemory"): ImplicitMemBenchResearchReport {
  return {
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-research",
    generatedAt: "2026-05-05T00:00:00.000Z",
    generatedBy: "tests",
    kind,
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-research/adapter-manifest.json",
    mode: "smoke",
    outputDir: `/tmp/out/${kind}`,
    profiles: {},
    runDirectory: `/tmp/out/${kind}/run`,
    runId: "run",
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
}

function buildComparisonReport(): ImplicitMemBenchComparisonReport {
  return {
    baselineReportPath: "/tmp/out/baseline/run/report.json",
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-research",
    comparison: {
      byScorer: {
        priming_pair_judge: {
          baselineBlockingPassRate: null,
          caseCount: 1,
          goodmemoryDistilledBlockingPassRate: null,
          goodmemoryRawBlockingPassRate: null,
          primingDeltaOfDelta: 1,
          primingScoreBaseline: 0,
          primingScoreRaw: 1,
        },
        structured_first_action: {
          baselineBlockingPassRate: 1,
          caseCount: 1,
          goodmemoryDistilledBlockingPassRate: 1,
          goodmemoryRawBlockingPassRate: 1,
          primingDeltaOfDelta: null,
          primingScoreBaseline: null,
          primingScoreRaw: null,
        },
        text_behavior_judge: {
          baselineBlockingPassRate: 1,
          caseCount: 1,
          goodmemoryDistilledBlockingPassRate: 1,
          goodmemoryRawBlockingPassRate: 1,
          primingDeltaOfDelta: null,
          primingScoreBaseline: null,
          primingScoreRaw: null,
        },
      },
      cases: [],
    },
    generatedAt: "2026-05-05T00:00:00.000Z",
    generatedBy: "tests",
    goodmemoryReportPath: "/tmp/out/goodmemory/run/report.json",
    kind: "comparison",
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-research/adapter-manifest.json",
    mode: "smoke",
    outputDir: "/tmp/out/comparison",
    runDirectory: "/tmp/out/comparison/run",
    runId: "run",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCount: 0,
      scorerFamilies: [
        "structured_first_action",
        "text_behavior_judge",
        "priming_pair_judge",
      ],
    },
  };
}

describe("run-phase-60 scripts", () => {
  it("resolves phase-60 fallback and summary paths", () => {
    expect(resolvePhase60FixtureRoot("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/implicitmembench-research",
    );
    expect(resolvePhase60FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-60",
    );
    expect(
      resolvePhase60OverallSummaryPath(
        "/tmp/goodmemory/reports/eval/fallback/phase-60",
        PHASE60_CANONICAL_RUN_ID,
      ),
    ).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-60/run-phase60-fallback-current/overall-summary.json",
    );
  });

  it("parses phase-60 cli flags with smoke mode as the default", () => {
    expect(
      parsePhase60CliOptions([
        "bun",
        "run",
        "scripts/run-phase-60-eval.ts",
        "--benchmark-root",
        "/tmp/bench",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase60",
        "--limit",
        "5",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/bench",
      limit: 5,
      maxConcurrency: 1,
      outputDir: "/tmp/out",
      runId: "run-phase60",
      smoke: true,
    });
  });

  it("runs phase-60 eval through comparison and writes an overall summary", async () => {
    let receivedInput:
      | {
          generatedBy: string;
          mode: string;
          outputDir: string;
          runId: string | undefined;
        }
      | undefined;
    let writtenSummary: Phase60OverallSummary | undefined;

    const result = await runPhase60Eval(
      {
        outputDir: "/tmp/out",
        runId: "run-phase60",
      },
      {
        listCases: async () => [],
        runComparison: async (input) => {
          receivedInput = {
            generatedBy: input.generatedBy,
            mode: input.mode,
            outputDir: input.outputDir,
            runId: input.runId,
          };
          return {
            baselineReport: buildReport("baseline"),
            comparisonReport: buildComparisonReport(),
            goodmemoryReport: buildReport("goodmemory"),
          };
        },
        writeOverallSummary: async (_path, summary) => {
          writtenSummary = summary;
        },
      },
    );

    expect(receivedInput).toEqual({
      generatedBy: "scripts/run-phase-60-eval.ts",
      mode: "smoke",
      outputDir: "/tmp/out",
      runId: "run-phase60",
    });
    expect(result.phase60Summary.kind).toBe(
      "phase-60-implicitmembench-overall-summary",
    );
    expect(writtenSummary?.runId).toBe("run-phase60");
  });

  it("builds an overall summary from existing report paths", async () => {
    const reads = new Map<string, string>([
      ["/tmp/baseline.json", JSON.stringify(buildReport("baseline"))],
      ["/tmp/goodmemory.json", JSON.stringify(buildReport("goodmemory"))],
    ]);
    let writePath = "";

    const summary = await runPhase60Overall(
      {
        baselineReportPath: "/tmp/baseline.json",
        goodmemoryReportPath: "/tmp/goodmemory.json",
        outputDir: "/tmp/out",
        runId: PHASE60_CANONICAL_OVERALL_RUN_ID,
      },
      {
        ensureDir: async () => undefined,
        listCases: async () => [],
        now: () => "2026-05-05T00:00:00.000Z",
        readTextFile: async (path) => reads.get(path) ?? "{}",
        writeTextFile: async (path) => {
          writePath = path;
        },
      },
    );

    expect(summary.generatedBy).toBe("scripts/run-phase-60-overall.ts");
    expect(writePath).toBe(
      "/tmp/out/run-phase60-overall-current/overall-summary.json",
    );
  });
});
