import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  buildPhase18GateCommands,
  resolvePhase18GateOutputDir,
  runPhase18QualityGate,
} from "../../scripts/run-phase-18-gate";

describe("run-phase-18-gate script", () => {
  it("resolves the dedicated phase-18 gate output directory", () => {
    expect(resolvePhase18GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-18",
    );
  });

  it("builds the dedicated host-adapter regression command list", () => {
    expect(buildPhase18GateCommands("/tmp/goodmemory")).toEqual([
      {
        label: "typecheck",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "artifact-foundation-regressions",
        cwd: "/tmp/goodmemory",
        args: [
          "bun",
          "test",
          "tests/integration/governance.api.test.ts",
          "tests/integration/evolution.compiler.test.ts",
        ],
      },
      {
        label: "host-adapter-regressions",
        cwd: "/tmp/goodmemory",
        args: [
          "bun",
          "test",
          "tests/unit/markdown-artifacts.test.ts",
          "tests/unit/host.adapter.test.ts",
          "tests/unit/host.writeback.test.ts",
          "tests/examples/examples.test.ts",
          "tests/release/release.test.ts",
        ],
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

  it("writes one accepted phase-18 report after all commands pass", async () => {
    const calls: string[] = [];
    const written: Array<{ path: string; content: string }> = [];

    const report = await runPhase18QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-18",
        runId: "run-phase18",
      },
      {
        now: () => "2026-04-19T12:00:00.000Z",
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
      "artifact-foundation-regressions",
      "host-adapter-regressions",
      "host-example-claude",
      "host-example-codex",
    ]);
    expect(report.acceptance).toEqual({
      decision: "accepted",
      reason:
        "Phase 18 host-adapter scope is regression-covered on the current public path.",
    });
    expect(report.commands).toHaveLength(5);
    expect(report.runDirectory).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-18/run-phase18",
    );
    expect(written[0]?.path).toBe(
      join(
        "/tmp/goodmemory/reports/quality-gates/phase-18/run-phase18",
        "phase-18-quality-gate.json",
      ),
    );
    expect(written[0]?.content).toContain('"phase": "phase-18"');
    expect(written[0]?.content).toContain('"decision": "accepted"');
  });

  it("fails fast and records a blocked report when a required regression command fails", async () => {
    const calls: string[] = [];
    const written: Array<{ path: string; content: string }> = [];

    const report = await runPhase18QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-18",
        runId: "run-phase18-fail",
      },
      {
        now: () => "2026-04-19T12:00:00.000Z",
        ensureDir: async () => {},
        writeTextFile: async (path, content) => {
          written.push({ path, content });
        },
        runCommand: async (command) => {
          calls.push(command.label);

          return {
            exitCode: command.label === "host-adapter-regressions" ? 1 : 0,
            durationMs: 10,
            stdout: "",
            stderr:
              command.label === "host-adapter-regressions"
                ? "regression failed\nstack line\n"
                : "",
          };
        },
      },
    );

    expect(calls).toEqual([
      "typecheck",
      "artifact-foundation-regressions",
      "host-adapter-regressions",
    ]);
    expect(report.acceptance).toEqual({
      decision: "blocked",
      reason: "Required regression command failed: host-adapter-regressions",
    });
    expect(report.commands).toHaveLength(3);
    expect(report.commands[2]?.stderrTail).toEqual([
      "regression failed",
      "stack line",
    ]);
    expect(written[0]?.content).toContain('"decision": "blocked"');
  });
});
