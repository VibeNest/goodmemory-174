import { describe, expect, it } from "bun:test";
import {
  buildPhase24GateCommands,
  buildPhase24GateRunId,
  parsePhase24GateCliOptions,
  resolvePhase24GateOutputDir,
  runPhase24GateCli,
  runPhase24QualityGate,
} from "../../scripts/run-phase-24-gate";
import {
  resolvePhase24FallbackOutputDir,
  runPhase24FallbackEval,
} from "../../scripts/run-phase-24-eval";
import {
  resolvePhase24LiveMemoryOutputDir,
  runPhase24LiveMemoryEval,
} from "../../scripts/run-phase-24-live-memory";
import type { ImplicitBehaviorReport } from "../../src/eval/implicit-behavior";

function buildPhase24Report(): ImplicitBehaviorReport {
  return {
    generatedAt: "2026-04-20T10:00:00.000Z",
    generatedBy: "tests",
    mode: "fallback" as const,
    outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-24",
    profiles: {
      "raw-experience": {
        behavioralRegressionCases: ["raw-experience:case-1"],
        blockingSummary: {
          conditioning: {
            failedCases: ["case-1"],
            passedCases: 0,
            totalCases: 1,
          },
          procedural: {
            failedCases: [],
            passedCases: 0,
            totalCases: 0,
          },
        },
        cases: [],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        failureAvoidanceRate: 0,
        firstAttemptPassRate: 0,
        inhibitionPassRate: 0,
        primingInfluenceScore: 0,
        proceduralAdherenceRate: 0,
        totalCases: 1,
      },
      "distilled-feedback": {
        behavioralRegressionCases: [],
        blockingSummary: {
          conditioning: {
            failedCases: [],
            passedCases: 1,
            totalCases: 1,
          },
          procedural: {
            failedCases: [],
            passedCases: 0,
            totalCases: 0,
          },
        },
        cases: [],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        failureAvoidanceRate: 1,
        firstAttemptPassRate: 1,
        inhibitionPassRate: 1,
        primingInfluenceScore: 0,
        proceduralAdherenceRate: 1,
        totalCases: 1,
      },
    },
    runDirectory: "/tmp/goodmemory/reports/eval/fallback/phase-24/run-phase24",
    runId: "run-phase24",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      behavioralRegressionCases: ["raw-experience:case-1"],
      blockingSummary: {
        conditioning: {
          failedCases: ["case-1"],
          passedCases: 1,
          totalCases: 2,
        },
        procedural: {
          failedCases: [],
          passedCases: 0,
          totalCases: 0,
        },
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      failureAvoidanceRate: 0.5,
      firstAttemptPassRate: 0.5,
      inhibitionPassRate: 0.5,
      primingInfluenceScore: 0,
      proceduralAdherenceRate: 0.5,
      totalCases: 2,
    },
  };
}

describe("run-phase-24 scripts", () => {
  it("resolves phase-24 output directories", () => {
    expect(resolvePhase24FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-24",
    );
    expect(resolvePhase24LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-24",
    );
  });

  it("runs phase-24 fallback eval with split profiles", async () => {
    const report = await runPhase24FallbackEval(
      {
        runId: "run-phase24",
      },
      {
        runEvaluation: async (input) => ({
          ...buildPhase24Report(),
          outputDir: input.outputDir,
          runId: input.runId ?? "run-phase24",
        }),
      },
    );

    expect(report.runId).toBe("run-phase24");
    expect(Object.keys(report.profiles)).toEqual([
      "raw-experience",
      "distilled-feedback",
    ]);
    expect(report.summary.behavioralRegressionCases).toEqual([
      "raw-experience:case-1",
    ]);
  });

  it("runs phase-24 live-memory eval through the same report contract", async () => {
    const originalEnv = { ...process.env };
    process.env.GOODMEMORY_TEST_POSTGRES_URL = "postgres://example/test";
    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";
    process.env.GOODMEMORY_EVAL_MODEL = "gpt-5.4";
    process.env.GOODMEMORY_EVAL_API_KEY = "key";
    process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
    process.env.GOODMEMORY_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.GOODMEMORY_EMBEDDING_API_KEY = "key";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER = "openai";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL = "gpt-4o-mini";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY = "key";

    try {
      const report = await runPhase24LiveMemoryEval(
        {
          runId: "run-phase24-live",
        },
        {
          createEmbeddingAdapter: () => ({
            async embed(texts) {
              return texts.map(() => [1, 0, 0]);
            },
          }),
          createMemoryExtractor: () => ({
            async extract() {
              return {
                candidates: [],
                ignoredMessageCount: 0,
              };
            },
          }),
          createTextGenerator: () => async () => ({
            content: "QuickCheck --network",
          }),
          runEvaluation: async (input) => ({
            ...buildPhase24Report(),
            mode: "live-memory",
            outputDir: input.outputDir,
            runId: input.runId ?? "run-phase24-live",
          }),
        },
      );

      expect(report.mode).toBe("live-memory");
      expect(report.runId).toBe("run-phase24-live");
    } finally {
      process.env = originalEnv;
    }
  });

  it("builds the phase-24 gate command list and accepted report", async () => {
    expect(resolvePhase24GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-24",
    );
    expect(buildPhase24GateRunId("2026-04-20T10:00:00.000Z")).toBe(
      "run-20260420100000",
    );
    expect(buildPhase24GateCommands("/tmp/goodmemory").map((item) => item.label)).toEqual([
      "typecheck",
      "phase-24-targeted-regressions",
      "phase-24-fallback-eval",
    ]);

    const report = await runPhase24QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-24",
        runId: "run-phase24",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-20T10:00:00.000Z",
        runCommand: async (command) => ({
          durationMs: 5,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        }),
        writeTextFile: async () => undefined,
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.commands.map((command) => command.status)).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    expect(report.evidence.deterministicReports).toEqual([
      {
        artifactKind: "ignored_generated",
        ignoredReportPath:
          "reports/eval/fallback/phase-24/run-phase24/report.json",
        regenerateCommand: "bun run eval:phase-24 --run-id run-phase24",
      },
    ]);
  });

  it("parses phase-24 gate cli flags and exits cleanly", async () => {
    expect(
      parsePhase24GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-24-gate.ts",
        "--output-dir",
        "/tmp/phase24",
        "--run-id",
        "run-phase24",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase24",
      runId: "run-phase24",
    });

    let exitCode = 0;
    const logs: string[] = [];
    const report = await runPhase24GateCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-24-gate.ts",
        "--run-id",
        "run-phase24",
      ],
      exit: (code) => {
        exitCode = code;
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
          deterministicReports: [],
        },
        generatedAt: "2026-04-20T10:00:00.000Z",
        generatedBy: "tests",
        phase: "phase-24",
        runDirectory: "/tmp/phase24/run-phase24",
        runId: "run-phase24",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.runId).toBe("run-phase24");
    expect(exitCode).toBe(0);
    expect(logs[0]).toContain("\"phase\": \"phase-24\"");
  });
});
