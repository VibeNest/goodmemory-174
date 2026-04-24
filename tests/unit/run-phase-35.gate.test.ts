import { describe, expect, it } from "bun:test";
import {
  buildPhase35GateCommands,
  buildPhase35GateRunId,
  parsePhase35GateCliOptions,
  resolvePhase35CanonicalDeterministicReportPath,
  resolvePhase35CanonicalLiveReportPath,
  resolvePhase35GateOutputDir,
  runPhase35QualityGate,
} from "../../scripts/run-phase-35-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase35DeterministicReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason:
        "Installed-host hook middleware stayed non-regressive against the frozen Phase 32 text-only path and beat the no-memory baseline on every deterministic case.",
    },
    generatedAt: "2026-04-23T17:30:45.000Z",
    generatedBy: "scripts/run-phase-35-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-35`,
    phase: "phase-35",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-35/run-20260423173045`,
    runId: "run-20260423173045",
    summary: {
      middlewareNonRegressionPassCount: 3,
      middlewareWinOverNoMemoryCount: 3,
      totalCases: 3,
    },
  });
}

function createAcceptedPhase35LiveReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason:
        "Installed-package Codex middleware config, repo opt-in, hook injection, and read-only MCP all worked on the tarball-installed path.",
    },
    evidence: {
      hooks: {
        installRegistersHooks: true,
        sessionStart: {
          matchedExpectedFieldCount: 2,
          registeredCommandMatchesManagedConfig: true,
        },
        userPromptSubmit: {
          matchedExpectedFieldCount: 2,
          registeredCommandMatchesManagedConfig: true,
        },
      },
      mcp: {
        contextIncludesBlocker: true,
        contextIncludesSummaryRule: true,
        installRegistersMcp: true,
        registeredCommandMatchesManagedConfig: true,
      },
      releaseContract: {
        distribution: "tarball-first",
        runtime: "bun-only",
      },
      repoOptIn: {
        enabled: true,
        workspaceId: "consumer-workspace",
      },
    },
    evidenceContract: {
      phase35: {
        packageBoundary: "installed_package_public_imports",
        runner: "scripts/run-phase-35-live-memory.ts",
        runtimePath: "installed_package_user_level_hooks_and_mcp",
      },
    },
    generatedAt: "2026-04-23T19:00:00.000Z",
    generatedBy: "scripts/run-phase-35-live-memory.ts",
    mode: "live-memory",
    outputDir: `${ROOT}/reports/eval/live-memory/phase-35`,
    phase: "phase-35",
    runDirectory: `${ROOT}/reports/eval/live-memory/phase-35/run-phase35-live-current`,
    runId: "run-phase35-live-current",
  });
}

describe("run-phase-35 gate", () => {
  it("resolves the phase-35 output and canonical evidence paths", () => {
    expect(resolvePhase35GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-35",
    );
    expect(resolvePhase35CanonicalDeterministicReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-35/run-20260423173045/report.json",
    );
    expect(resolvePhase35CanonicalLiveReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-35/run-phase35-live-current/report.json",
    );
  });

  it("builds a deterministic phase-35 gate run id", () => {
    expect(buildPhase35GateRunId("2026-04-23T21:30:45.000Z")).toBe(
      "run-20260423213045",
    );
  });

  it("defaults reruns to a fresh gate run id instead of rewriting accepted evidence", async () => {
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase35QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-35",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-24T14:30:45.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-35/run-20260423173045/report.json")) {
            return createAcceptedPhase35DeterministicReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-35/run-phase35-live-current/report.json")) {
            return createAcceptedPhase35LiveReport();
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

    expect(report.runId).toBe("run-20260424143045");
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-35/run-20260424143045/phase-35-quality-gate.json",
    );
  });

  it("parses phase-35 gate cli flags", () => {
    expect(
      parsePhase35GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-35-gate.ts",
        "--output-dir",
        "/tmp/phase35-gate",
        "--run-id",
        "run-phase35-gate",
        "--live-report-path",
        "/tmp/live-phase35.json",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live-phase35.json",
      outputDir: "/tmp/phase35-gate",
      runId: "run-phase35-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase35GateCommands(ROOT)).toEqual([
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
          "tests/integration/host-mcp-server.test.ts",
          "tests/unit/run-phase-35.script.test.ts",
          "tests/unit/run-phase-35.live-memory.test.ts",
          "tests/unit/run-phase-35.gate.test.ts",
          "tests/cli/cli.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "targeted-regressions",
      },
    ]);
  });

  it("writes an accepted phase-35 quality gate when canonical evidence is accepted", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase35QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-35",
        runId: "run-phase35-gate-test",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-23T21:30:45.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-35/run-20260423173045/report.json")) {
            return createAcceptedPhase35DeterministicReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-35/run-phase35-live-current/report.json")) {
            return createAcceptedPhase35LiveReport();
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

    expect(report.phase).toBe("phase-35");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.artifactKind).toBe("ignored_generated");
    expect(report.evidence.deterministicReport.ignoredReportPath).toBe(
      "reports/eval/fallback/phase-35/run-20260423173045/report.json",
    );
    expect(report.evidence.deterministicReport.regenerateCommand).toBe(
      "bun run eval:phase-35 --run-id run-20260423173045",
    );
    expect(report.evidence.liveMemory.liveReportPath).toBe(
      "reports/eval/live-memory/phase-35/run-phase35-live-current/report.json",
    );
    expect(report.evidence.liveMemory.runtimePath).toBe(
      "installed_package_user_level_hooks_and_mcp",
    );
    expect(report.scope.inScope).toContain(
      "tarball-first installed-package Codex middleware validation for install, repo opt-in, hook injection, and read-only MCP availability",
    );
    expect(report.scope.outOfScope).toContain(
      "automatic writeback, transcript persistence, or stop-hook behavior",
    );
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-35/run-phase35-gate-test",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-35/run-phase35-gate-test/phase-35-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
