import { describe, expect, it } from "bun:test";
import {
  parsePhase49GateCliOptions,
  PHASE49_CANONICAL_SMOKE_RUN_ID,
  resolvePhase49CanonicalComparisonReportPath,
  resolvePhase49GateOutputDir,
  runPhase49Gate,
  runPhase49GateCli,
  runPhase49GateMain,
} from "../../scripts/run-phase-49-gate";

function buildResearchReport(kind: "baseline" | "goodmemory") {
  return {
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-research",
    generatedAt: "2026-04-28T00:00:00.000Z",
    generatedBy: "tests",
    kind,
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-research/adapter-manifest.json",
    mode: "smoke",
    outputDir: `/tmp/goodmemory/reports/eval/research/phase-49/${kind}`,
    profiles:
      kind === "baseline"
        ? {
            "baseline-upstream-chat": {
              caseCountsByDataset: {
                classical_conditioning: 1,
                priming: 1,
                procedural_memory: 2,
              },
              caseCountsByScorer: {
                priming_pair_judge: 1,
                structured_first_action: 1,
                text_behavior_judge: 2,
              },
              cases: [],
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 0,
              primingAverageScore: 0,
              totalBlockingCases: 3,
              totalCases: 4,
            },
          }
        : {
            "goodmemory-raw-experience": {
              caseCountsByDataset: {
                classical_conditioning: 1,
                priming: 1,
                procedural_memory: 2,
              },
              caseCountsByScorer: {
                priming_pair_judge: 1,
                structured_first_action: 1,
                text_behavior_judge: 2,
              },
              cases: [],
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 3,
              primingAverageScore: 30,
              totalBlockingCases: 3,
              totalCases: 4,
            },
            "goodmemory-distilled-feedback": {
              caseCountsByDataset: {
                classical_conditioning: 1,
                priming: 0,
                procedural_memory: 2,
              },
              caseCountsByScorer: {
                priming_pair_judge: 0,
                structured_first_action: 1,
                text_behavior_judge: 2,
              },
              cases: [],
              executionFailures: 0,
              explicitRecallLeakCount: 0,
              passedBlockingCases: 3,
              primingAverageScore: null,
              totalBlockingCases: 3,
              totalCases: 3,
            },
          },
    runDirectory: `/tmp/goodmemory/reports/eval/research/phase-49/${kind}/${PHASE49_CANONICAL_SMOKE_RUN_ID}`,
    runId: PHASE49_CANONICAL_SMOKE_RUN_ID,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCountsByDataset: {
        classical_conditioning: 1,
        priming: kind === "baseline" ? 1 : 1,
        procedural_memory: 2,
      },
      caseCountsByScorer: {
        priming_pair_judge: 1,
        structured_first_action: 1,
        text_behavior_judge: 2,
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      passedBlockingCases: kind === "baseline" ? 0 : 6,
      primingAverageScore: kind === "baseline" ? 0 : 30,
      totalBlockingCases: kind === "baseline" ? 3 : 6,
      totalCases: kind === "baseline" ? 4 : 7,
    },
  };
}

function buildComparisonReport() {
  return {
    baselineReportPath:
      "/tmp/goodmemory/reports/eval/research/phase-49/baseline/run-phase49-smoke-current/report.json",
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-research",
    comparison: {
      byScorer: {
        priming_pair_judge: {
          baselineBlockingPassRate: null,
          caseCount: 1,
          goodmemoryDistilledBlockingPassRate: null,
          goodmemoryRawBlockingPassRate: null,
          primingDeltaOfDelta: 30,
          primingScoreBaseline: 0,
          primingScoreRaw: 30,
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
          caseCount: 2,
          goodmemoryDistilledBlockingPassRate: 1,
          goodmemoryRawBlockingPassRate: 1,
          primingDeltaOfDelta: null,
          primingScoreBaseline: null,
          primingScoreRaw: null,
        },
      },
      cases: [
        {
          caseId: "a",
          datasetFamily: "procedural_memory",
          scorerFamily: "structured_first_action",
          sourceFile: "/tmp/a",
          taskFile: "reversed_parameter_protocol.json",
          taskName: "Reversed Parameter Protocol",
        },
      ],
    },
    generatedAt: "2026-04-28T00:00:00.000Z",
    generatedBy: "tests",
    goodmemoryReportPath:
      "/tmp/goodmemory/reports/eval/research/phase-49/goodmemory/run-phase49-smoke-current/report.json",
    kind: "comparison",
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-research/adapter-manifest.json",
    mode: "smoke",
    outputDir: "/tmp/goodmemory/reports/eval/research/phase-49/comparison",
    runDirectory:
      "/tmp/goodmemory/reports/eval/research/phase-49/comparison/run-phase49-smoke-current",
    runId: PHASE49_CANONICAL_SMOKE_RUN_ID,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCount: 4,
      scorerFamilies: [
        "structured_first_action",
        "text_behavior_judge",
        "priming_pair_judge",
      ],
    },
  };
}

describe("run-phase-49 gate", () => {
  it("resolves phase-49 gate output and canonical report paths", () => {
    expect(resolvePhase49GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-49",
    );
    expect(resolvePhase49CanonicalComparisonReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/research/phase-49/comparison/run-phase49-smoke-current/report.json",
    );
  });

  it("parses phase-49 gate cli flags", () => {
    expect(
      parsePhase49GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-49-gate.ts",
        "--benchmark-root",
        "/tmp/bench",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase49-gate",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/bench",
      outputDir: "/tmp/out",
      runId: "run-phase49-gate",
    });
  });

  it("accepts a gate report when smoke reports cover all scorer families", async () => {
    const writes = new Map<string, string>();
    const root = "/Users/hjqcan/Documents/GoodMomery";

    const report = await runPhase49Gate(
      {
        benchmarkRoot: `${root}/fixtures/implicitmembench-research`,
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-49",
        runId: "run-phase49-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-28T00:00:00.000Z",
        readTextFile: async (path) => {
          if (path.includes("/baseline/")) {
            return JSON.stringify(buildResearchReport("baseline"));
          }
          if (path.includes("/goodmemory/")) {
            return JSON.stringify(buildResearchReport("goodmemory"));
          }
          return JSON.stringify(buildComparisonReport());
        },
        runCommand: async () => ({
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async (path, content) => {
          writes.set(path, content);
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.coverage.scorerFamiliesPresent).toEqual([
      "priming_pair_judge",
      "structured_first_action",
      "text_behavior_judge",
    ]);
    expect(report.evidence.coverage.primingAbsentFromDistilled).toBe(true);
    expect(
      writes.has(
        "/tmp/goodmemory/reports/quality-gates/phase-49/run-phase49-gate-test/phase-49-quality-gate.json",
      ),
    ).toBe(true);
  });

  it("blocks when the distilled profile still contains priming cases", async () => {
    const brokenGoodmemory = buildResearchReport("goodmemory");
    const distilledProfile =
      brokenGoodmemory.profiles["goodmemory-distilled-feedback"];
    expect(distilledProfile).toBeDefined();
    distilledProfile!.caseCountsByDataset.priming = 1;

    const report = await runPhase49Gate(
      {
        benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-research",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-49",
        runId: "run-phase49-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-28T00:00:00.000Z",
        readTextFile: async (path) => {
          if (path.includes("/baseline/")) {
            return JSON.stringify(buildResearchReport("baseline"));
          }
          if (path.includes("/goodmemory/")) {
            return JSON.stringify(brokenGoodmemory);
          }
          return JSON.stringify(buildComparisonReport());
        },
        runCommand: async () => ({
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => undefined,
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("must not include priming");
  });

  it("exits non-zero from the injectable script entrypoint when the gate is blocked", async () => {
    const exitCodes: number[] = [];
    const logs: string[] = [];

    await runPhase49GateMain({
      argv: ["bun", "scripts/run-phase-49-gate.ts"],
      exit: (code) => {
        exitCodes.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "blocked",
          reason: "Command failed: phase-49-smoke-eval",
        },
        commands: [],
        evidence: {
          comparisonReportPath: "reports/eval/research/phase-49/comparison/report.json",
          coverage: {
            baselineProfilesPresent: [],
            goodmemoryProfilesPresent: [],
            primingAbsentFromDistilled: false,
            scorerFamiliesPresent: [],
            smokeBenchmarkRoot: "fixtures/implicitmembench-research",
            totalComparisonCases: 0,
          },
        },
        generatedAt: "2026-04-28T00:00:00.000Z",
        generatedBy: "scripts/run-phase-49-gate.ts",
        phase: "phase-49",
        runDirectory: "reports/quality-gates/phase-49/run-phase49-test",
        runId: "run-phase49-test",
      }),
    });

    expect(exitCodes).toEqual([1]);
    expect(logs[0]).toContain("\"decision\": \"blocked\"");
  });

  it("maps injected CLI gate decisions to process exit codes", async () => {
    const exitCodes: number[] = [];
    const logs: string[] = [];

    await runPhase49GateCli({
      argv: ["bun", "scripts/run-phase-49-gate.ts"],
      exit: (code) => {
        exitCodes.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "ok",
        },
        commands: [],
        evidence: {
          comparisonReportPath: "reports/eval/research/phase-49/comparison/report.json",
          coverage: {
            baselineProfilesPresent: ["baseline-upstream-chat"],
            goodmemoryProfilesPresent: [
              "goodmemory-distilled-feedback",
              "goodmemory-raw-experience",
            ],
            primingAbsentFromDistilled: true,
            scorerFamiliesPresent: [
              "priming_pair_judge",
              "structured_first_action",
              "text_behavior_judge",
            ],
            smokeBenchmarkRoot: "fixtures/implicitmembench-research",
            totalComparisonCases: 4,
          },
        },
        generatedAt: "2026-04-28T00:00:00.000Z",
        generatedBy: "scripts/run-phase-49-gate.ts",
        phase: "phase-49",
        runDirectory: "reports/quality-gates/phase-49/run-phase49-test",
        runId: "run-phase49-test",
      }),
    });

    expect(exitCodes).toEqual([0]);
    expect(logs[0]).toContain("\"decision\": \"accepted\"");
  });
});
