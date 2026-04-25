import { describe, expect, it } from "bun:test";
import {
  buildPhase39GateCommands,
  buildPhase39GateRunId,
  parsePhase39GateCliOptions,
  resolvePhase39GateOutputDir,
  runPhase39GateCli,
  runPhase39QualityGate,
} from "../../scripts/run-phase-39-gate";

const ROOT = "/tmp/goodmemory";

describe("run-phase-39 gate", () => {
  it("resolves the phase-39 output directory and deterministic run id", () => {
    expect(resolvePhase39GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-39",
    );
    expect(buildPhase39GateRunId("2026-04-25T04:11:12.000Z")).toBe(
      "run-20260425041112",
    );
  });

  it("parses phase-39 gate cli flags", () => {
    expect(
      parsePhase39GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-39-gate.ts",
        "--output-dir",
        "/tmp/phase39-gate",
        "--run-id",
        "run-phase39-gate",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase39-gate",
      runId: "run-phase39-gate",
    });
  });

  it("builds the expected regression chain", () => {
    expect(buildPhase39GateCommands(ROOT)).toEqual([
      {
        args: [
          "bun",
          "test",
          "tests/integration/python-http-bridge.test.ts",
          "tests/integration/remember.profiles.test.ts",
          "tests/integration/background-jobs.api.test.ts",
          "tests/integration/revise-memory.api.test.ts",
          "tests/integration/runtime-facade.api.test.ts",
          "tests/unit/run-phase-39.gate.test.ts",
          "tests/release/node-package-boundary.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "phase-39-targeted-regressions",
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
          "gate:phase-38",
          "--",
          "--output-dir",
          "/tmp/goodmemory/.tmp-goodmemory-phase39/quality-gates/phase-38",
          "--run-id",
          "run-phase39-preflight-38",
        ],
        cwd: ROOT,
        label: "phase-38-hermetic-preflight-gate",
      },
    ]);
  });

  it("writes an accepted report when all regressions pass", async () => {
    const writes: Record<string, string> = {};
    const executedLabels: string[] = [];
    const report = await runPhase39QualityGate(
      {
        outputDir: "/tmp/phase39-gate",
        runId: "run-phase39-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-25T04:11:12.000Z",
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
    expect(report.generatedBy).toBe("scripts/run-phase-39-gate.ts");
    expect(report.phase).toBe("phase-39");
    expect(report.evidence.httpContract.status).toBe("accepted");
    expect(report.evidence.packagedBridge.status).toBe("accepted");
    expect(report.evidence.referenceBridge.status).toBe("accepted");
    expect(report.evidence.pythonConsumer.status).toBe("accepted");
    expect(report.evidence.scopedAuthorization.status).toBe("accepted");
    expect(report.evidence.asyncRememberJobs.status).toBe("accepted");
    expect(report.evidence.userControl.status).toBe("accepted");
    expect(report.evidence.regressionChain.status).toBe("accepted");
    expect(executedLabels).toEqual([
      "phase-39-targeted-regressions",
      "ci-regression-gate",
      "phase-38-hermetic-preflight-gate",
    ]);
    expect(Object.keys(writes)).toEqual([
      "/tmp/phase39-gate/run-phase39-gate/phase-39-quality-gate.json",
    ]);
  });

  it("fails closed and writes a blocked report when a regression command fails", async () => {
    const writes: Record<string, string> = {};
    const report = await runPhase39QualityGate(
      {
        outputDir: "/tmp/phase39-gate",
        runId: "run-phase39-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-25T04:11:12.000Z",
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
      reason: "Required Phase 39 command failed: ci-regression-gate.",
    });
    expect(report.commands.map((command) => command.label)).toEqual([
      "phase-39-targeted-regressions",
      "ci-regression-gate",
    ]);
    expect(Object.keys(writes)).toEqual([
      "/tmp/phase39-gate/run-phase39-gate/phase-39-quality-gate.json",
    ]);
  });

  it("runs the cli wrapper and forwards blocked exit codes", async () => {
    const exits: number[] = [];
    const logs: string[] = [];
    const report = await runPhase39GateCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-39-gate.ts",
        "--output-dir",
        "/tmp/phase39-gate",
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
          asyncRememberJobs: {
            reason: "not run",
            status: "blocked",
          },
          httpContract: {
            reason: "not run",
            status: "blocked",
          },
          packagedBridge: {
            reason: "not run",
            status: "blocked",
          },
          policyMapping: {
            reason: "not run",
            status: "blocked",
          },
          pythonConsumer: {
            reason: "not run",
            status: "blocked",
          },
          referenceBridge: {
            reason: "not run",
            status: "blocked",
          },
          regressionChain: {
            reason: "not run",
            status: "blocked",
          },
          scopedAuthorization: {
            reason: "not run",
            status: "blocked",
          },
          userControl: {
            reason: "not run",
            status: "blocked",
          },
        },
        generatedAt: "2026-04-25T04:11:12.000Z",
        generatedBy: "scripts/run-phase-39-gate.ts",
        phase: "phase-39",
        runDirectory: "/tmp/phase39-gate/run-phase39-gate",
        runId: "run-phase39-gate",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(exits).toEqual([1]);
    expect(logs[0]).toContain("Phase 39 quality gate blocked");
  });
});
