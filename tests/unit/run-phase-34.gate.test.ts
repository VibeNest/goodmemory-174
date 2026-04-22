import { describe, expect, it } from "bun:test";
import {
  buildPhase34GateCommands,
  buildPhase34GateRunId,
  parsePhase34GateCliOptions,
  resolvePhase34CanonicalDeterministicReportPath,
  resolvePhase34CanonicalLiveReportPath,
  resolvePhase34GateOutputDir,
  runPhase34QualityGate,
} from "../../scripts/run-phase-34-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase34DeterministicReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason:
        "Policy-backed pre-action assessment intercepted every deterministic high-risk first step, rewrote or blocked it beyond the Phase 32 soft-guard baseline, and preserved the low-risk path.",
    },
    generatedAt: "2026-04-22T21:30:45.000Z",
    generatedBy: "scripts/run-phase-34-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-34`,
    phase: "phase-34",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-34/run-20260422213045`,
    runId: "run-20260422213045",
    summary: {
      completionNonRegressionPassCount: 3,
      correctedFirstStepCount: 2,
      correctedFirstStepRate: 1,
      falseBlockCount: 0,
      falseBlockRate: 0,
      firstActionInterceptionCount: 2,
      firstActionInterceptionRate: 1,
      highRiskCaseCount: 2,
      lowRiskCaseCount: 1,
      noMemoryReminderCount: 0,
      phase32SoftGuardReminderCount: 3,
      totalCases: 3,
    },
  });
}

function createAcceptedPhase34LiveReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason:
        "Installed-package Codex action-gate live evidence rewrote or blocked every canonical high-risk first action, proved at least one executable first-step rewrite, and preserved the low-risk path without regression.",
    },
    comparison: {
      baselines: {
        noMemory: "no-memory",
      },
      cases: [
        {
          caseId: "command-rewrite",
          completionNonRegressionPass: true,
          correctedFirstStep: true,
          falseBlock: false,
          firstActionIntercepted: true,
          risk: "high",
        },
        {
          caseId: "command-blocked-veto",
          completionNonRegressionPass: true,
          correctedFirstStep: true,
          falseBlock: false,
          firstActionIntercepted: true,
          risk: "high",
        },
        {
          caseId: "low-risk-guidance",
          completionNonRegressionPass: true,
          correctedFirstStep: false,
          falseBlock: false,
          firstActionIntercepted: false,
          risk: "low",
        },
      ],
    },
    evidence: {
      host: {
        actionGatePath: ".goodmemory/bootstrap/codex-action.mjs",
        bootstrapArtifactsPresent: {
          actionGateScript: true,
          agents: true,
          hooksConfig: true,
          hooksToml: true,
          rulesFile: true,
        },
        hookParityScaffoldOnly: true,
        installedPackageBootstrap: true,
        kind: "codex",
        liveEnforcementPath: "installed_package_action_gate_wrapper",
      },
    },
    evidenceContract: {
      phase34: {
        packageBoundary: "installed_package_public_imports",
        runner: "scripts/run-phase-34-live-memory.ts",
        runtimePath: "installed_package_action_gate_wrapper",
      },
    },
    generatedAt: "2026-04-22T23:40:00.000Z",
    generatedBy: "scripts/run-phase-34-live-memory.ts",
    mode: "live-memory",
    outputDir: `${ROOT}/reports/eval/live-memory/phase-34`,
    phase: "phase-34",
    runDirectory: `${ROOT}/reports/eval/live-memory/phase-34/run-phase34-live-current`,
    runId: "run-phase34-live-current",
    summary: {
      completionNonRegressionPassCount: 3,
      correctedFirstStepCount: 2,
      correctedFirstStepRate: 1,
      executableRewriteCount: 1,
      falseBlockCount: 0,
      falseBlockRate: 0,
      firstActionInterceptionCount: 2,
      firstActionInterceptionRate: 1,
      highRiskCaseCount: 2,
      lowRiskCaseCount: 1,
      totalCases: 3,
    },
  });
}

describe("run-phase-34 gate", () => {
  it("resolves the phase-34 output and canonical evidence paths", () => {
    expect(resolvePhase34GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-34",
    );
    expect(resolvePhase34CanonicalDeterministicReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-34/run-20260422213045/report.json",
    );
    expect(resolvePhase34CanonicalLiveReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-34/run-phase34-live-current/report.json",
    );
  });

  it("builds a deterministic phase-34 gate run id", () => {
    expect(buildPhase34GateRunId("2026-04-22T23:59:30.000Z")).toBe(
      "run-20260422235930",
    );
  });

  it("parses phase-34 gate cli flags", () => {
    expect(
      parsePhase34GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-34-gate.ts",
        "--output-dir",
        "/tmp/phase34-gate",
        "--run-id",
        "run-phase34-gate",
        "--live-report-path",
        "/tmp/live-phase34.json",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live-phase34.json",
      outputDir: "/tmp/phase34-gate",
      runId: "run-phase34-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase34GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/host.action-execution.test.ts",
          "tests/unit/host.pre-action-policy.test.ts",
          "tests/integration/host.action-assessment.test.ts",
          "tests/unit/run-phase-34.script.test.ts",
          "tests/unit/run-phase-34.live-memory.test.ts",
          "tests/unit/run-phase-34.gate.test.ts",
          "tests/cli/cli.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "targeted-regressions",
      },
    ]);
  });

  it("writes an accepted phase-34 quality gate when canonical evidence is accepted", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase34QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-34",
        runId: "run-phase34-gate-test",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-22T23:59:30.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-34/run-20260422213045/report.json")) {
            return createAcceptedPhase34DeterministicReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-34/run-phase34-live-current/report.json")) {
            return createAcceptedPhase34LiveReport();
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

    expect(report.phase).toBe("phase-34");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.reportPath).toBe(
      "reports/eval/fallback/phase-34/run-20260422213045/report.json",
    );
    expect(report.evidence.liveMemory.liveReportPath).toBe(
      "reports/eval/live-memory/phase-34/run-phase34-live-current/report.json",
    );
    expect(report.evidence.liveMemory.liveEnforcementPath).toBe(
      "installed_package_action_gate_wrapper",
    );
    expect(report.scope.inScope).toContain(
      "one canonical installed-package Codex action-gate live report for executable rewrite, destructive veto, and low-risk non-regression",
    );
    expect(report.scope.outOfScope).toContain(
      "claiming native Codex hook interception is the canonical live blocker when the current runtime does not prove it",
    );
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-34/run-phase34-gate-test",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-34/run-phase34-gate-test/phase-34-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
