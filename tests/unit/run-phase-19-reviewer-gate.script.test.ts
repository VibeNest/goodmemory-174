import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  buildPhase19ReviewerGateCommands,
  resolvePhase19ReviewerGateOutputDir,
  runPhase19ReviewerQualityGate,
} from "../../scripts/run-phase-19-reviewer-gate";

describe("run-phase-19-reviewer-gate script", () => {
  it("resolves the dedicated reviewer gate output directory", () => {
    expect(resolvePhase19ReviewerGateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-19-reviewer",
    );
  });

  it("builds the dedicated reviewer rollout regression command list", () => {
    expect(buildPhase19ReviewerGateCommands("/tmp/goodmemory")).toEqual([
      {
        label: "typecheck",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "reviewer-rollout-regressions",
        cwd: "/tmp/goodmemory",
        args: [
          "bun",
          "test",
          "tests/eval/runners.test.ts",
          "tests/eval/suite.test.ts",
          "tests/eval/reporting.test.ts",
          "tests/unit/evolution.reviewer.test.ts",
          "tests/integration/evolution.reviewer.test.ts",
          "tests/integration/maintenance.api.test.ts",
        ],
      },
      {
        label: "retrieval-rollout-regressions",
        cwd: "/tmp/goodmemory",
        args: [
          "bun",
          "test",
          "tests/unit/eval.strategy-rollout.test.ts",
          "tests/unit/eval.strategy-promotion-gate.test.ts",
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

  it("writes one accepted reviewer gate report after all commands pass", async () => {
    const calls: string[] = [];
    const written: Array<{ path: string; content: string }> = [];

    const report = await runPhase19ReviewerQualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-19-reviewer",
        runId: "run-phase19-reviewer",
      },
      {
        now: () => "2026-04-19T12:30:00.000Z",
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
      "reviewer-rollout-regressions",
      "retrieval-rollout-regressions",
      "host-adapter-regressions",
      "host-example-claude",
      "host-example-codex",
    ]);
    expect(report.acceptance).toEqual({
      decision: "accepted",
      reason:
        "Phase 19 reviewer rollout is regression-covered on top of the closed retrieval and host surfaces.",
    });
    expect(report.commands).toHaveLength(6);
    expect(report.runDirectory).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-19-reviewer/run-phase19-reviewer",
    );
    expect(written[0]?.path).toBe(
      join(
        "/tmp/goodmemory/reports/quality-gates/phase-19-reviewer/run-phase19-reviewer",
        "phase-19-reviewer-quality-gate.json",
      ),
    );
    expect(written[0]?.content).toContain('"phase": "phase-19-reviewer"');
    expect(written[0]?.content).toContain('"decision": "accepted"');
  });

  it("fails fast and records a blocked reviewer report when a required regression command fails", async () => {
    const calls: string[] = [];
    const written: Array<{ path: string; content: string }> = [];

    const report = await runPhase19ReviewerQualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-19-reviewer",
        runId: "run-phase19-reviewer-fail",
      },
      {
        now: () => "2026-04-19T12:30:00.000Z",
        ensureDir: async () => {},
        writeTextFile: async (path, content) => {
          written.push({ path, content });
        },
        runCommand: async (command) => {
          calls.push(command.label);

          return {
            exitCode: command.label === "reviewer-rollout-regressions" ? 1 : 0,
            durationMs: 10,
            stdout: "",
            stderr:
              command.label === "reviewer-rollout-regressions"
                ? "reviewer regression failed\nstack line\n"
                : "",
          };
        },
      },
    );

    expect(calls).toEqual([
      "typecheck",
      "reviewer-rollout-regressions",
    ]);
    expect(report.acceptance).toEqual({
      decision: "blocked",
      reason: "Required regression command failed: reviewer-rollout-regressions",
    });
    expect(report.commands).toHaveLength(2);
    expect(report.commands[1]?.stderrTail).toEqual([
      "reviewer regression failed",
      "stack line",
    ]);
    expect(written[0]?.content).toContain('"decision": "blocked"');
  });
});
