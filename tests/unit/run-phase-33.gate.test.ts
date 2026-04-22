import { describe, expect, it } from "bun:test";
import {
  buildPhase33GateCommands,
  buildPhase33GateRunId,
  parsePhase33GateCliOptions,
  resolvePhase33GateOutputDir,
  runPhase33GateCli,
  runPhase33QualityGate,
} from "../../scripts/run-phase-33-gate";

const ROOT = "/tmp/goodmemory";

describe("run-phase-33 gate", () => {
  it("resolves the phase-33 output directory", () => {
    expect(resolvePhase33GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-33",
    );
  });

  it("builds a deterministic phase-33 gate run id", () => {
    expect(buildPhase33GateRunId("2026-04-23T10:11:12.000Z")).toBe(
      "run-20260423101112",
    );
  });

  it("parses phase-33 gate cli flags", () => {
    expect(
      parsePhase33GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-33-gate.ts",
        "--output-dir",
        "/tmp/phase33",
        "--run-id",
        "run-phase33-gate",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase33",
      runId: "run-phase33-gate",
    });
  });

  it("builds the expected phase-33 command set", () => {
    expect(buildPhase33GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: ["bun", "run", "build"],
        cwd: ROOT,
        label: "build",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/runtime-resolution.test.ts",
          "tests/release/node-package-boundary.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "package-boundary-regressions",
      },
    ]);
  });

  it("writes an accepted report when every command passes", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const createdDirs: string[] = [];
    const report = await runPhase33QualityGate(
      ROOT,
      {
        runId: "run-phase33-gate",
      },
      {
        ensureDir: async (path) => {
          createdDirs.push(path);
        },
        now: () => "2026-04-23T10:11:12.000Z",
        runCommand: async () => ({
          durationMs: 25,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.acceptance).toEqual({
      decision: "accepted",
      reason:
        "Build output, runtime fallback, and Bun/Node package-boundary regressions all passed.",
    });
    expect(report.commands).toHaveLength(3);
    expect(createdDirs).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-33/run-phase33-gate",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-33/run-phase33-gate/phase-33-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks and stops after the first failing command", async () => {
    const executedLabels: string[] = [];
    const report = await runPhase33QualityGate(
      ROOT,
      {
        runId: "run-phase33-gate",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-23T10:11:12.000Z",
        runCommand: async (command) => {
          executedLabels.push(command.label);
          return {
            durationMs: 10,
            exitCode: command.label === "build" ? 1 : 0,
            stderr: command.label === "build" ? "build failed" : "",
            stdout: "",
          };
        },
        writeTextFile: async () => undefined,
      },
    );

    expect(executedLabels).toEqual(["typecheck", "build"]);
    expect(report.acceptance).toEqual({
      decision: "blocked",
      reason: "Command failed: build",
    });
    expect(report.commands).toHaveLength(2);
    expect(report.commands[1]).toMatchObject({
      exitCode: 1,
      label: "build",
      status: "failed",
    });
  });

  it("logs the report and exits with success for an accepted gate", async () => {
    const exitCodes: number[] = [];
    const logs: string[] = [];

    await runPhase33GateCli({
      argv: ["bun", "run", "scripts/run-phase-33-gate.ts"],
      exit: (code) => {
        exitCodes.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () =>
        ({
          acceptance: {
            decision: "accepted",
            reason: "ok",
          },
          commands: [],
          generatedAt: "2026-04-23T10:11:12.000Z",
          generatedBy: "scripts/run-phase-33-gate.ts",
          phase: "phase-33",
          runDirectory: "/tmp/phase33/run-phase33-gate",
          runId: "run-phase33-gate",
          scope: {
            inScope: [],
            outOfScope: [],
          },
        }) as Awaited<ReturnType<typeof runPhase33QualityGate>>,
    });

    expect(exitCodes).toEqual([0]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("\"phase\": \"phase-33\"");
  });
});
