import { describe, expect, it } from "bun:test";
import {
  buildPhase25GateCommands,
  buildPhase25GateRunId,
  parsePhase25GateCliOptions,
  resolvePhase25GateOutputDir,
  runPhase25GateCli,
  runPhase25QualityGate,
} from "../../scripts/run-phase-25-gate";
import {
  resolvePhase25FallbackOutputDir,
  runPhase25FallbackEval,
} from "../../scripts/run-phase-25-eval";
import {
  resolvePhase25LiveMemoryOutputDir,
  runPhase25LiveMemoryEval,
} from "../../scripts/run-phase-25-live-memory";
import type { BehavioralAdaptationReport } from "../../src/eval/behavioral-adaptation";

function buildPhase25Report(): BehavioralAdaptationReport {
  return {
    generatedAt: "2026-04-20T12:00:00.000Z",
    generatedBy: "tests",
    mode: "fallback",
    outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-25",
    profiles: {
      "raw-experience": {
        behavioralRegressionCases: ["raw-experience:conditioning-1"],
        blockingSummary: {
          conditioning: {
            failedCases: ["conditioning-1"],
            passedCases: 0,
            totalCases: 1,
          },
          procedural: {
            failedCases: ["procedural-1"],
            passedCases: 0,
            totalCases: 1,
          },
        },
        cases: [],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        layer_d: {
          first_attempt_policy_adherence: 0,
          failure_avoidance_rate: 0,
          inhibition_success_rate: 0,
          procedure_generalization_rate: 0,
          priming_delta: 0.5,
          constraint_violation_rate: 0,
        },
        totalCases: 4,
      },
      "outcome-telemetry": {
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
        layer_d: {
          first_attempt_policy_adherence: 1,
          failure_avoidance_rate: 1,
          inhibition_success_rate: 1,
          procedure_generalization_rate: 0,
          priming_delta: 0,
          constraint_violation_rate: 0,
        },
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
            passedCases: 1,
            totalCases: 1,
          },
        },
        cases: [],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        layer_d: {
          first_attempt_policy_adherence: 1,
          failure_avoidance_rate: 1,
          inhibition_success_rate: 1,
          procedure_generalization_rate: 1,
          priming_delta: 0.5,
          constraint_violation_rate: 0,
        },
        totalCases: 4,
      },
    },
    runDirectory: "/tmp/goodmemory/reports/eval/fallback/phase-25/run-phase25",
    runId: "run-phase25",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      behavioralRegressionCases: ["raw-experience:conditioning-1", "raw-experience:procedural-1"],
      blockingSummary: {
        conditioning: {
          failedCases: ["conditioning-1"],
          passedCases: 2,
          totalCases: 3,
        },
        procedural: {
          failedCases: ["procedural-1"],
          passedCases: 1,
          totalCases: 2,
        },
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      layer_d: {
        first_attempt_policy_adherence: 0.6,
        failure_avoidance_rate: 0.6667,
        inhibition_success_rate: 0.6667,
        procedure_generalization_rate: 0.5,
        priming_delta: 0.3333,
        constraint_violation_rate: 0,
      },
      totalCases: 9,
    },
  };
}

describe("run-phase-25 scripts", () => {
  it("resolves phase-25 output directories", () => {
    expect(resolvePhase25FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-25",
    );
    expect(resolvePhase25LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-25",
    );
    expect(resolvePhase25GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-25",
    );
  });

  it("runs phase-25 fallback eval with canonical layer_d metrics", async () => {
    const report = await runPhase25FallbackEval(
      {
        runId: "run-phase25",
      },
      {
        runEvaluation: async (input) => ({
          ...buildPhase25Report(),
          outputDir: input.outputDir,
          runId: input.runId ?? "run-phase25",
        }),
      },
    );

    expect(report.runId).toBe("run-phase25");
    expect(report.profiles["outcome-telemetry"].layer_d.failure_avoidance_rate).toBe(1);
    expect(report.summary.layer_d.priming_delta).toBeGreaterThan(0);
  });

  it("runs phase-25 live-memory eval through the same report contract", async () => {
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
      const report = await runPhase25LiveMemoryEval(
        {
          runId: "run-phase25-live",
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
            content: JSON.stringify({
              answer: "QuickCheck --network",
              first_action: {
                kind: "tool_call",
                name: "QuickCheck",
                raw: "QuickCheck --network",
              },
            }),
          }),
          runEvaluation: async (input) => ({
            ...buildPhase25Report(),
            mode: "live-memory",
            outputDir: input.outputDir,
            runId: input.runId ?? "run-phase25-live",
          }),
        },
      );

      expect(report.mode).toBe("live-memory");
      expect(report.runId).toBe("run-phase25-live");
    } finally {
      process.env = originalEnv;
    }
  });

  it("builds the phase-25 gate command list and accepted report", async () => {
    expect(buildPhase25GateRunId("2026-04-20T12:00:00.000Z")).toBe(
      "run-20260420120000",
    );
    expect(buildPhase25GateCommands("/tmp/goodmemory").map((item) => item.label)).toEqual([
      "typecheck",
      "phase-25-targeted-regressions",
      "phase-25-fallback-eval",
    ]);

    const report = await runPhase25QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-25",
        runId: "run-phase25",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-20T12:00:00.000Z",
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
    expect(report.acceptance.reason).toContain("deterministic gate path");
    expect(report.acceptance.reason).toContain("outside this gate");
    expect(report.commands.map((command) => command.status)).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    expect(report.scope.outOfScope).toContain(
      "provider-backed live-memory behavioral closure",
    );
  });

  it("parses phase-25 gate cli flags and exits cleanly", async () => {
    expect(
      parsePhase25GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-25-gate.ts",
        "--output-dir",
        "/tmp/phase25",
        "--run-id",
        "run-phase25",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase25",
      runId: "run-phase25",
    });

    let exitCode = 0;
    const logs: string[] = [];
    const report = await runPhase25GateCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-25-gate.ts",
        "--run-id",
        "run-phase25",
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
        generatedAt: "2026-04-20T12:00:00.000Z",
        generatedBy: "tests",
        phase: "phase-25",
        runDirectory: "/tmp/phase25/run-phase25",
        runId: "run-phase25",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.runId).toBe("run-phase25");
    expect(exitCode).toBe(0);
    expect(logs[0]).toContain("\"phase\": \"phase-25\"");
  });
});
