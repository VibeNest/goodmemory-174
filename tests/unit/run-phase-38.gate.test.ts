import { describe, expect, it } from "bun:test";
import {
  buildPhase38GateCommands,
  buildPhase38GateRunId,
  parsePhase38GateCliOptions,
  resolvePhase38GateOutputDir,
  runPhase38GateCli,
  runPhase38QualityGate,
} from "../../scripts/run-phase-38-gate";

const ROOT = "/tmp/goodmemory";

describe("run-phase-38 gate", () => {
  it("resolves the phase-38 output directory and deterministic run id", () => {
    expect(resolvePhase38GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-38",
    );
    expect(buildPhase38GateRunId("2026-04-25T08:40:45.000Z")).toBe(
      "run-20260425084045",
    );
  });

  it("parses phase-38 gate cli flags", () => {
    expect(
      parsePhase38GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-38-gate.ts",
        "--output-dir",
        "/tmp/phase38-gate",
        "--run-id",
        "run-phase38-gate",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase38-gate",
      runId: "run-phase38-gate",
    });
  });

  it("builds the expected regression chain", () => {
    expect(buildPhase38GateCommands(ROOT)).toEqual([
      {
        args: [
          "bun",
          "test",
          "tests/integration/observability.trace-sink.test.ts",
          "tests/integration/revise-memory.api.test.ts",
          "tests/integration/runtime-facade.api.test.ts",
          "tests/integration/background-jobs.api.test.ts",
          "tests/integration/provider-facade.api.test.ts",
          "tests/examples/examples.test.ts",
          "tests/types/public-config.types.ts",
          "tests/types/public-runtime.types.ts",
          "tests/unit/runtime-resolution.test.ts",
          "tests/unit/runtime.context-service.test.ts",
          "tests/unit/runtime.public.test.ts",
          "tests/unit/run-phase-38.gate.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "phase-38-targeted-regressions",
      },
      {
        args: ["bun", "run", "test:ci"],
        cwd: ROOT,
        label: "ci-regression-gate",
      },
      {
        args: [
          "bun",
          "run",
          "gate:phase-37-1",
          "--",
          "--output-dir",
          "/tmp/goodmemory/.tmp-goodmemory-phase38/quality-gates/phase-37-1",
          "--run-id",
          "run-phase38-preflight-37-1",
          "--dogfood-report-path",
          "/tmp/goodmemory/reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json",
          "--skip-dependency-gates",
        ],
        cwd: ROOT,
        label: "phase-37-1-hermetic-preflight-gate",
      },
    ]);
  });

  it("writes an accepted report when all regressions pass", async () => {
    const writes: Record<string, string> = {};
    const executedLabels: string[] = [];
    const report = await runPhase38QualityGate(
      {
        outputDir: "/tmp/phase38-gate",
        runId: "run-phase38-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-25T08:40:45.000Z",
        runCommand: async (command) => {
          executedLabels.push(command.label);
          return {
            durationMs: 10,
            exitCode: 0,
            stderr: "",
            stdout: "ok",
          };
        },
        writeTextFile: async (path, content) => {
          writes[path] = content;
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.generatedBy).toBe("scripts/run-phase-38-gate.ts");
    expect(report.phase).toBe("phase-38");
    expect(report.evidence.traceSink.status).toBe("accepted");
    expect(report.evidence.revision.status).toBe("accepted");
    expect(report.evidence.runtimeFacade.status).toBe("accepted");
    expect(report.evidence.backgroundJobs.status).toBe("accepted");
    expect(report.evidence.providerFacade.status).toBe("accepted");
    expect(report.evidence.expressFastifyExamples.status).toBe("accepted");
    expect(report.evidence.regressionChain.status).toBe("accepted");
    expect(executedLabels).toEqual([
      "phase-38-targeted-regressions",
      "ci-regression-gate",
      "phase-37-1-hermetic-preflight-gate",
    ]);
    expect(Object.keys(writes)).toEqual([
      "/tmp/phase38-gate/run-phase38-gate/phase-38-quality-gate.json",
    ]);
  });

  it("fails closed and writes a blocked report when a regression command fails", async () => {
    const writes: Record<string, string> = {};
    const report = await runPhase38QualityGate(
      {
        outputDir: "/tmp/phase38-gate",
        runId: "run-phase38-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-25T08:40:45.000Z",
        runCommand: async (command) => ({
          durationMs: 5,
          exitCode: command.label === "ci-regression-gate" ? 1 : 0,
          stderr: "failed",
          stdout: "",
        }),
        writeTextFile: async (path, content) => {
          writes[path] = content;
        },
      },
    );

    expect(report.acceptance).toEqual({
      decision: "blocked",
      reason: "Required Phase 38 command failed: ci-regression-gate.",
    });
    expect(report.commands.map((command) => command.label)).toEqual([
      "phase-38-targeted-regressions",
      "ci-regression-gate",
    ]);
    expect(Object.keys(writes)).toEqual([
      "/tmp/phase38-gate/run-phase38-gate/phase-38-quality-gate.json",
    ]);
  });

  it("runs the cli wrapper and forwards blocked exit codes", async () => {
    const exits: number[] = [];
    const logs: string[] = [];
    const report = await runPhase38GateCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-38-gate.ts",
        "--output-dir",
        "/tmp/phase38-gate",
      ],
      exit: (code) => {
        exits.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "blocked",
          reason: "blocked for test",
        },
        commands: [],
        evidence: {
          backgroundJobs: {
            reason: "not run",
            status: "blocked",
          },
          expressFastifyExamples: {
            reason: "not run",
            status: "blocked",
          },
          providerFacade: {
            reason: "not run",
            status: "blocked",
          },
          regressionChain: {
            reason: "not run",
            status: "blocked",
          },
          revision: {
            reason: "not run",
            status: "blocked",
          },
          runtimeFacade: {
            reason: "not run",
            status: "blocked",
          },
          traceSink: {
            reason: "not run",
            status: "blocked",
          },
        },
        generatedAt: "2026-04-25T08:40:45.000Z",
        generatedBy: "scripts/run-phase-38-gate.ts",
        phase: "phase-38",
        runDirectory: "/tmp/phase38-gate/run-phase38-gate",
        runId: "run-phase38-gate",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(exits).toEqual([1]);
    expect(logs[0]).toContain("Phase 38 quality gate blocked");
  });
});
