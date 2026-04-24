import { describe, expect, it } from "bun:test";
import {
  buildPhase371GateCommands,
  parsePhase371GateCliOptions,
  runPhase371GateCli,
  runPhase371QualityGate,
} from "../../scripts/run-phase-37-1-gate";

const ROOT = "/tmp/goodmemory";

describe("run-phase-37-1 gate", () => {
  it("parses phase-37.1 gate cli options", () => {
    expect(
      parsePhase371GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-37-1-gate.ts",
        "--output-dir",
        "/tmp/phase371-gate",
        "--run-id",
        "run-phase371-gate",
        "--dogfood-report-path",
        "/tmp/dogfood/report.json",
      ]),
    ).toEqual({
      dogfoodReportPath: "/tmp/dogfood/report.json",
      outputDir: "/tmp/phase371-gate",
      runId: "run-phase371-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase371GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/host-writeback-audit-ledger.test.ts",
          "tests/unit/host-writeback-runtime.test.ts",
          "tests/integration/installed-host-writeback-audit.test.ts",
          "tests/integration/installed-host-writeback.test.ts",
          "tests/unit/run-phase-37-1-dogfood-summary.test.ts",
          "tests/unit/run-phase-37-1-gate.test.ts",
          "tests/cli/cli.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "phase-37-1-targeted-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-37-1-dogfood",
          "--",
          "--run-id",
          "run-phase37-1-dogfood-current",
          "--output-dir",
          "/tmp/goodmemory/reports/eval/dogfood/phase-37-1",
        ],
        cwd: ROOT,
        label: "phase-37-1-dogfood-summary",
      },
      {
        args: ["bun", "run", "gate:phase-37"],
        cwd: ROOT,
        label: "phase-37-regression-gate",
      },
      {
        args: ["bun", "run", "gate:phase-35"],
        cwd: ROOT,
        label: "phase-35-regression-gate",
      },
      {
        args: ["bun", "run", "gate:phase-36"],
        cwd: ROOT,
        label: "phase-36-regression-gate",
      },
    ]);
  });

  it("writes an accepted gate report when commands and dogfood evidence pass", async () => {
    const writes: Record<string, string> = {};
    const executedLabels: string[] = [];
    const report = await runPhase371QualityGate(
      {
        dogfoodReportPath: "/tmp/dogfood/report.json",
        outputDir: "/tmp/phase371-gate",
        runId: "run-phase371-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-24T12:00:00.000Z",
        readTextFile: async () =>
          JSON.stringify({
            acceptance: { decision: "accepted" },
            generatedBy: "scripts/run-phase-37-1-dogfood-summary.ts",
            phase: "phase-37.1",
            summary: {
              candidateCount: 20,
              duplicateCount: 1,
              durableWriteCount: 12,
              falseWriteRateManual: 0.05,
              forgottenCount: 1,
              nextSessionRecallHitCount: 8,
              sessionCount: 20,
            },
          }),
        runCommand: async (command) => {
          executedLabels.push(command.label);
          return {
            durationMs: 1,
            exitCode: 0,
            stderr: "",
            stdout: "",
          };
        },
        writeTextFile: async (path, content) => {
          writes[path] = content;
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(executedLabels).not.toContain("phase-37-1-dogfood-summary");
    expect(Object.keys(writes)).toEqual([
      "/tmp/phase371-gate/run-phase371-gate/phase-37-1-quality-gate.json",
    ]);
  });

  it("runs dogfood into the canonical report path when no precomputed report is supplied", async () => {
    const executedCommands: string[][] = [];
    const report = await runPhase371QualityGate(
      {
        outputDir: "/tmp/phase371-gate",
        runId: "run-phase371-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-24T12:00:00.000Z",
        readTextFile: async (path) => {
          expect(path).toBe(
            "/Users/hjqcan/Documents/GoodMomery/reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json",
          );
          return JSON.stringify({
            acceptance: { decision: "accepted" },
            generatedBy: "scripts/run-phase-37-1-dogfood-summary.ts",
            phase: "phase-37.1",
            summary: {
              candidateCount: 20,
              duplicateCount: 1,
              durableWriteCount: 12,
              falseWriteRateManual: 0.05,
              forgottenCount: 1,
              nextSessionRecallHitCount: 8,
              sessionCount: 20,
            },
          });
        },
        runCommand: async (command) => {
          executedCommands.push(command.args);
          return {
            durationMs: 1,
            exitCode: 0,
            stderr: "",
            stdout: "",
          };
        },
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(executedCommands).toContainEqual([
      "bun",
      "run",
      "eval:phase-37-1-dogfood",
      "--",
      "--run-id",
      "run-phase37-1-dogfood-current",
      "--output-dir",
      "/Users/hjqcan/Documents/GoodMomery/reports/eval/dogfood/phase-37-1",
    ]);
  });

  it("exits nonzero when the gate is blocked", async () => {
    let exitCode: number | undefined;
    await runPhase371GateCli({
      argv: ["bun", "run", "scripts/run-phase-37-1-gate.ts"],
      exit: (code) => {
        exitCode = code;
      },
      log: () => {},
      runGate: async () => ({
        acceptance: {
          decision: "blocked",
          reason: "failed",
        },
      } as Awaited<ReturnType<typeof runPhase371QualityGate>>),
    });

    expect(exitCode).toBe(1);
  });

  it("blocks incomplete or too-small dogfood evidence", async () => {
    const report = await runPhase371QualityGate(
      {
        dogfoodReportPath: "/tmp/dogfood/report.json",
        outputDir: "/tmp/phase371-gate",
        runId: "run-phase371-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-24T12:00:00.000Z",
        readTextFile: async () =>
          JSON.stringify({
            acceptance: { decision: "accepted" },
            generatedBy: "scripts/run-phase-37-1-dogfood-summary.ts",
            phase: "phase-37.1",
            summary: {
              candidateCount: 1,
              durableWriteCount: 1,
              falseWriteRateManual: 2,
              sessionCount: 1,
            },
          }),
        runCommand: async () => ({
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("dogfood");
  });
});
