import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  buildPhase20GateRunId,
  buildPhase20GateCommands,
  defaultRunPhase20GateCommand,
  resolvePhase20GateOutputDir,
  runPhase20GateCli,
  runPhase20QualityGate,
} from "../../scripts/run-phase-20-gate";

describe("run-phase-20-gate script", () => {
  it("resolves the integrated gate output directory", () => {
    expect(resolvePhase20GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-20",
    );
  });

  it("builds the integrated release-hardening command list", () => {
    expect(buildPhase20GateCommands("/tmp/goodmemory")).toEqual([
      {
        label: "typecheck",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "coverage-regression-suite",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "test:coverage"],
      },
      {
        label: "cli-and-example-regressions",
        cwd: "/tmp/goodmemory",
        args: [
          "bun",
          "test",
          "tests/cli/cli.test.ts",
          "tests/examples/examples.test.ts",
          "tests/release/release.test.ts",
        ],
      },
      {
        label: "eval-smoke",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "eval:smoke"],
      },
      {
        label: "phase-16-gate",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "eval:phase-16"],
      },
      {
        label: "phase-17-gate",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "eval:phase-17"],
      },
      {
        label: "phase-18-gate",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "gate:phase-18"],
      },
      {
        label: "phase-19-reviewer-gate",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "gate:phase-19-reviewer"],
      },
      {
        label: "phase-19-maintenance-gate",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "gate:phase-19-maintenance"],
      },
      {
        label: "chat-example",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "example:chat"],
      },
      {
        label: "coding-agent-example",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "example:coding-agent"],
      },
      {
        label: "host-example-claude",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "example:host-claude"],
      },
      {
        label: "host-example-codex",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "example:host-codex"],
      },
    ]);
  });

  it("builds deterministic run ids from timestamps", () => {
    expect(buildPhase20GateRunId("2026-04-20T10:00:00.000Z")).toBe(
      "run-20260420100000",
    );
    expect(buildPhase20GateRunId("not-a-date")).toBe("run-phase20");
  });

  it("routes dependency gate artifacts under the phase-20 run directory", () => {
    const commands = buildPhase20GateCommands("/tmp/goodmemory", {
      runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-20/run-phase20",
      runId: "run-phase20",
    });

    expect(commands.find((command) => command.label === "phase-18-gate")?.args).toEqual([
      "bun",
      "run",
      "gate:phase-18",
      "--output-dir",
      "/tmp/goodmemory/reports/quality-gates/phase-20/run-phase20/dependency-gates/phase-18",
      "--run-id",
      "run-phase20-phase-18",
    ]);
    expect(
      commands.find((command) => command.label === "phase-19-reviewer-gate")?.args,
    ).toEqual([
      "bun",
      "run",
      "gate:phase-19-reviewer",
      "--output-dir",
      "/tmp/goodmemory/reports/quality-gates/phase-20/run-phase20/dependency-gates/phase-19-reviewer",
      "--run-id",
      "run-phase20-phase-19-reviewer",
    ]);
    expect(
      commands.find((command) => command.label === "phase-19-maintenance-gate")?.args,
    ).toEqual([
      "bun",
      "run",
      "gate:phase-19-maintenance",
      "--output-dir",
      "/tmp/goodmemory/reports/quality-gates/phase-20/run-phase20/dependency-gates/phase-19-maintenance",
      "--run-id",
      "run-phase20-phase-19-maintenance",
    ]);
  });

  it("can run a real command with the default command runner", async () => {
    const result = await defaultRunPhase20GateCommand({
      label: "bun-version",
      cwd: process.cwd(),
      args: ["bun", "--version"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
    expect(result.stderr).toBe("");
  });

  it("writes one accepted integrated gate report after all commands pass", async () => {
    const calls: string[] = [];
    const written: Array<{ path: string; content: string }> = [];

    const report = await runPhase20QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-20",
        runId: "run-phase20",
      },
      {
        now: () => "2026-04-20T10:00:00.000Z",
        ensureDir: async () => {},
        writeTextFile: async (path, content) => {
          written.push({ path, content });
        },
        runCommand: async (command) => {
          calls.push(command.label);

          return {
            exitCode: 0,
            durationMs: 25,
            stdout: `${command.label}: ok\n`,
            stderr: "",
          };
        },
      },
    );

    expect(calls).toEqual([
      "typecheck",
      "coverage-regression-suite",
      "cli-and-example-regressions",
      "eval-smoke",
      "phase-16-gate",
      "phase-17-gate",
      "phase-18-gate",
      "phase-19-reviewer-gate",
      "phase-19-maintenance-gate",
      "chat-example",
      "coding-agent-example",
      "host-example-claude",
      "host-example-codex",
    ]);
    expect(report.acceptance).toEqual({
      decision: "accepted",
      reason:
        "Phase 20 integrated release-hardening scope is regression-covered across the current v1 and post-v1 growth surfaces.",
    });
    expect(report.commands).toHaveLength(13);
    expect(report.runDirectory).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-20/run-phase20",
    );
    expect(written[0]?.path).toBe(
      join(
        "/tmp/goodmemory/reports/quality-gates/phase-20/run-phase20",
        "phase-20-quality-gate.json",
      ),
    );
    expect(written[0]?.content).toContain('"phase": "phase-20"');
    expect(written[0]?.content).toContain('"decision": "accepted"');
  });

  it("fails fast and records a blocked integrated report when a required regression command fails", async () => {
    const calls: string[] = [];
    const written: Array<{ path: string; content: string }> = [];

    const report = await runPhase20QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-20",
        runId: "run-phase20-fail",
      },
      {
        now: () => "2026-04-20T10:00:00.000Z",
        ensureDir: async () => {},
        writeTextFile: async (path, content) => {
          written.push({ path, content });
        },
        runCommand: async (command) => {
          calls.push(command.label);

          return {
            exitCode: command.label === "phase-18-gate" ? 1 : 0,
            durationMs: 10,
            stdout: "",
            stderr:
              command.label === "phase-18-gate" ? "host gate failed\nstack line\n" : "",
          };
        },
      },
    );

    expect(calls).toEqual([
      "typecheck",
      "coverage-regression-suite",
      "cli-and-example-regressions",
      "eval-smoke",
      "phase-16-gate",
      "phase-17-gate",
      "phase-18-gate",
    ]);
    expect(report.acceptance).toEqual({
      decision: "blocked",
      reason: "Required regression command failed: phase-18-gate",
    });
    expect(report.commands).toHaveLength(7);
    expect(report.commands[6]?.stderrTail).toEqual([
      "host gate failed",
      "stack line",
    ]);
    expect(written[0]?.content).toContain('"decision": "blocked"');
  });

  it("logs accepted reports without requesting process exit", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase20GateCli({
      log: (message) => {
        logs.push(message);
      },
      exit: (code) => {
        exits.push(code);
      },
      runGate: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "ok",
        },
        commands: [],
        generatedAt: "2026-04-20T10:00:00.000Z",
        generatedBy: "scripts/run-phase-20-gate.ts",
        phase: "phase-20",
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-20/run-accepted",
        runId: "run-accepted",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.acceptance.decision).toBe("accepted");
    expect(exits).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('"decision": "accepted"');
  });

  it("requests exit when the integrated gate is blocked", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase20GateCli({
      log: (message) => {
        logs.push(message);
      },
      exit: (code) => {
        exits.push(code);
      },
      runGate: async () => ({
        acceptance: {
          decision: "blocked",
          reason: "coverage failed",
        },
        commands: [],
        generatedAt: "2026-04-20T10:00:00.000Z",
        generatedBy: "scripts/run-phase-20-gate.ts",
        phase: "phase-20",
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-20/run-blocked",
        runId: "run-blocked",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(exits).toEqual([1]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('"decision": "blocked"');
  });
});
