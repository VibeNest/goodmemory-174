import { describe, expect, it } from "bun:test";
import {
  buildPhase41GateCommands,
  buildPhase41GateRunId,
  parsePhase41GateCliOptions,
  resolvePhase41CanonicalDeterministicReportPath,
  resolvePhase41CanonicalLiveReportPath,
  resolvePhase41GateOutputDir,
  runPhase41QualityGate,
} from "../../scripts/run-phase-41-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase41DeterministicReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason:
        "Installed pre-action matched the frozen Phase 34 wrapper on rewrite, veto, and low-risk control, beat the no-memory baseline on every deterministic case, and wrote action evidence to the shared installed storage path.",
    },
    generatedAt: "2026-04-25T21:30:45.000Z",
    generatedBy: "scripts/run-phase-41-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-41`,
    phase: "phase-41",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-41/run-20260425213045`,
    runId: "run-20260425213045",
    summary: {
      installedNonRegressionPassCount: 3,
      installedWinOverNoMemoryCount: 3,
      storageParityPassCount: 1,
      totalCases: 4,
    },
  });
}

function createAcceptedPhase41LiveReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason:
        "Tarball-installed Codex used the managed PreToolUse hook, redirected DeepAnalyzer through the installed action bridge, vetoed destructive AGENTS deletion, left low-risk QuickCheck unblocked, and wrote action evidence to the shared installed storage.",
    },
    evidence: {
      install: {
        registeredPreToolUseMatchesManagedConfig: true,
      },
      preAction: {
        deepAnalyzerDenied: true,
        deepAnalyzerExecutedStep: "./tools/QuickCheck",
        destructiveVetoed: true,
        lowRiskAllowed: true,
        sharedInstalledStorage: true,
      },
      releaseContract: {
        distribution: "tarball-first",
        runtime: "bun-only",
      },
    },
    evidenceContract: {
      phase41: {
        packageBoundary: "installed_package_public_imports",
        runner: "scripts/run-phase-41-live-memory.ts",
        runtimePath: "installed_package_pretooluse_and_action_bridge",
      },
    },
    generatedAt: "2026-04-25T22:00:00.000Z",
    generatedBy: "scripts/run-phase-41-live-memory.ts",
    mode: "live-memory",
    outputDir: `${ROOT}/reports/eval/live-memory/phase-41`,
    phase: "phase-41",
    runDirectory: `${ROOT}/reports/eval/live-memory/phase-41/run-phase41-live-current`,
    runId: "run-phase41-live-current",
  });
}

function createAcceptedPriorGate(phase: "phase-34" | "phase-35" | "phase-37"): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: `${phase} accepted`,
    },
    generatedAt: "2026-04-25T22:05:00.000Z",
    generatedBy: `scripts/run-${phase}-gate.ts`,
    phase,
  });
}

describe("run-phase-41 gate", () => {
  it("resolves the phase-41 output and canonical evidence paths", () => {
    expect(resolvePhase41GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-41",
    );
    expect(resolvePhase41CanonicalDeterministicReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-41/run-20260425213045/report.json",
    );
    expect(resolvePhase41CanonicalLiveReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-41/run-phase41-live-current/report.json",
    );
  });

  it("builds a deterministic phase-41 gate run id", () => {
    expect(buildPhase41GateRunId("2026-04-25T22:30:45.000Z")).toBe(
      "run-20260425223045",
    );
  });

  it("parses phase-41 gate cli flags", () => {
    expect(
      parsePhase41GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-41-gate.ts",
        "--output-dir",
        "/tmp/phase41-gate",
        "--run-id",
        "run-phase41-gate",
        "--live-report-path",
        "/tmp/live-phase41.json",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live-phase41.json",
      outputDir: "/tmp/phase41-gate",
      runId: "run-phase41-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase41GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/host-install.test.ts",
          "tests/unit/host-hook-runtime.test.ts",
          "tests/unit/host-action-runtime.test.ts",
          "tests/unit/host-bootstrap.test.ts",
          "tests/integration/installed-host-action.test.ts",
          "tests/unit/run-phase-41-eval.test.ts",
          "tests/unit/run-phase-41-live-memory.test.ts",
          "tests/unit/run-phase-41-gate.test.ts",
          "tests/cli/cli.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "targeted-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-41",
          "--run-id",
          "run-20260425213045",
        ],
        cwd: ROOT,
        label: "phase-41-fallback-eval",
      },
      {
        args: ["bun", "run", "eval:phase-41-live-memory"],
        cwd: ROOT,
        label: "phase-41-live-memory",
      },
      {
        args: ["bun", "run", "gate:phase-34"],
        cwd: ROOT,
        label: "phase-34-gate",
      },
      {
        args: ["bun", "run", "gate:phase-35"],
        cwd: ROOT,
        label: "phase-35-gate",
      },
      {
        args: ["bun", "run", "gate:phase-37"],
        cwd: ROOT,
        label: "phase-37-gate",
      },
    ]);
  });

  it("writes an accepted phase-41 quality gate when canonical evidence is accepted", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase41QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-41",
        runId: "run-phase41-gate-test",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-25T22:30:45.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-41/run-20260425213045/report.json")) {
            return createAcceptedPhase41DeterministicReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-41/run-phase41-live-current/report.json")) {
            return createAcceptedPhase41LiveReport();
          }
          if (path.endsWith("reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json")) {
            return createAcceptedPriorGate("phase-34");
          }
          if (path.endsWith("reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json")) {
            return createAcceptedPriorGate("phase-35");
          }
          if (path.endsWith("reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json")) {
            return createAcceptedPriorGate("phase-37");
          }
          throw new Error(`Unexpected report path: ${path}`);
        },
        runCommand: async () => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-41");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.ignoredReportPath).toBe(
      "reports/eval/fallback/phase-41/run-20260425213045/report.json",
    );
    expect(report.evidence.liveMemory.liveReportPath).toBe(
      "reports/eval/live-memory/phase-41/run-phase41-live-current/report.json",
    );
    expect(report.evidence.phase34Gate.phase).toBe("phase-34");
    expect(report.evidence.phase35Gate.phase).toBe("phase-35");
    expect(report.evidence.phase37Gate.phase).toBe("phase-37");
    expect(report.scope.inScope).toContain(
      "tarball-first installed-package live validation for the managed PreToolUse hook and installed action bridge",
    );
    expect(report.scope.outOfScope).toContain(
      "claiming Claude pre-action parity or a second live blocker",
    );
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-41/run-phase41-gate-test",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-41/run-phase41-gate-test/phase-41-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
