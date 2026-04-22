import { describe, expect, it } from "bun:test";
import {
  buildPhase32GateCommands,
  buildPhase32GateRunId,
  buildPhase32GateScope,
  buildPhase32LiveReportContract,
  parsePhase32GateCliOptions,
  resolvePhase32CanonicalDeterministicReportPath,
  resolvePhase32CanonicalLiveReportPath,
  resolvePhase32GateOutputDir,
  runPhase32GateCli,
  runPhase32QualityGate,
} from "../../scripts/run-phase-32-gate";

const ROOT = "/tmp/goodmemory";
const LIVE_CONTRACT = buildPhase32LiveReportContract(ROOT);
const REPO_LIVE_CONTRACT = buildPhase32LiveReportContract(process.cwd());

function createAcceptedPhase32DeterministicReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "Event-backed path beats text-only and beats no-memory.",
    },
    cases: [
      {
        caseId: "continuity-open-loop",
        eventBacked: { score: 4 },
        textOnly: { score: 3 },
        noMemory: { score: 0 },
      },
      {
        caseId: "repeated-correction",
        eventBacked: { score: 3 },
        textOnly: { score: 2 },
        noMemory: { score: 0 },
      },
      {
        caseId: "procedure-adherence",
        eventBacked: { score: 4 },
        textOnly: { score: 3 },
        noMemory: { score: 0 },
      },
    ],
    generatedAt: "2026-04-22T17:30:45.000Z",
    generatedBy: "scripts/run-phase-32-eval.ts",
    mode: "fallback",
    outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-32",
    phase: "phase-32",
    runDirectory:
      "/tmp/goodmemory/reports/eval/fallback/phase-32/run-20260422173045",
    runId: "run-20260422173045",
    summary: {
      eventBackedAverageScore: 3.6667,
      eventBackedClearWinCount: 3,
      eventBackedNonRegressionPassCount: 3,
      noMemoryAverageScore: 0,
      textOnlyAverageScore: 2.6667,
      totalCases: 3,
    },
  });
}

function createAcceptedPhase32LiveReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "Installed-package Codex external-host evidence is trace-backed and accepted.",
    },
    comparison: {
      baselines: {
        noMemory: "no-memory",
        textOnly: "frozen-pre-phase31-public-text-only",
      },
      cases: [
        {
          caseId: "continuity-open-loop",
          hostExitCode: 0,
          nonRegressionAgainstTextOnly: true,
          winOverNoMemory: true,
        },
        {
          caseId: "repeated-correction",
          hostExitCode: 0,
          nonRegressionAgainstTextOnly: true,
          winOverNoMemory: true,
        },
        {
          caseId: "procedure-adherence",
          hostExitCode: 0,
          nonRegressionAgainstTextOnly: true,
          winOverNoMemory: true,
        },
      ],
    },
    evidence: {
      host: {
        exportedArtifactPaths: [
          ".goodmemory/hosts/codex/MEMORY.md",
          ".goodmemory/hosts/codex/session-memory/current.md",
        ],
        installedPackageBootstrap: true,
        kind: "codex",
        manifestPath: ".goodmemory/hosts/codex/export-manifest.json",
        traceBacked: true,
      },
    },
    evidenceContract: {
      phase32: {
        hostEventTransport: "native_host_events",
        packageBoundary: "installed_package_public_imports",
        runner: REPO_LIVE_CONTRACT.expectedGeneratedBy,
      },
    },
    generatedAt: "2026-04-22T18:00:00.000Z",
    generatedBy: REPO_LIVE_CONTRACT.expectedGeneratedBy,
    mode: "live-external-host",
    outputDir: REPO_LIVE_CONTRACT.expectedOutputDir,
    phase: "phase-32",
    runDirectory: REPO_LIVE_CONTRACT.expectedRunDirectory,
    runId: REPO_LIVE_CONTRACT.expectedRunId,
  });
}

describe("run-phase-32 gate", () => {
  it("resolves the phase-32 output and canonical evidence paths", () => {
    expect(resolvePhase32GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-32",
    );
    expect(resolvePhase32CanonicalDeterministicReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-32/run-20260422173045/report.json",
    );
    expect(resolvePhase32CanonicalLiveReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-32/run-phase32-live-current/report.json",
    );
  });

  it("builds a deterministic phase-32 gate run id", () => {
    expect(buildPhase32GateRunId("2026-04-22T18:15:30.000Z")).toBe(
      "run-20260422181530",
    );
  });

  it("parses phase-32 gate cli flags", () => {
    expect(
      parsePhase32GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-32-gate.ts",
        "--output-dir",
        "/tmp/phase32",
        "--run-id",
        "run-phase32-gate",
        "--live-report-path",
        "/tmp/live-phase32.json",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live-phase32.json",
      outputDir: "/tmp/phase32",
      runId: "run-phase32-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase32GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/context-builder.outputs.test.ts",
          "tests/unit/recall.evidence.test.ts",
          "tests/unit/run-phase-32.script.test.ts",
          "tests/unit/run-phase-32.gate.test.ts",
          "tests/unit/run-phase-32.live-memory.test.ts",
          "tests/integration/agent-events.ingestion.test.ts",
          "tests/eval/phase32.external-coding-agent.test.ts",
          "tests/cli/cli.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "phase-32-targeted-regressions",
      },
      {
        args: ["bun", "run", "eval:phase-32"],
        cwd: ROOT,
        label: "phase-32-fallback-eval",
      },
    ]);
  });

  it("writes an accepted gate report when deterministic coverage passes and canonical live evidence exists", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const commands: string[] = [];

    const report = await runPhase32QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-32",
        runId: "run-phase32-gate",
        liveReportPath: REPO_LIVE_CONTRACT.canonicalLiveReportPath,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-22T18:15:30.000Z",
        readTextFile: async (path) => {
          if (path === REPO_LIVE_CONTRACT.canonicalLiveReportPath) {
            return createAcceptedPhase32LiveReport();
          }

          return createAcceptedPhase32DeterministicReport();
        },
        runCommand: async (command) => {
          commands.push(command.label);
          return {
            durationMs: 10,
            exitCode: 0,
            stderr: "",
            stdout: "ok",
          };
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.status).toBe("accepted");
    expect(report.evidence.liveExternalHost.status).toBe("accepted");
    expect(report.evidence.liveExternalHost.traceBacked).toBe(true);
    expect(commands).toEqual([
      "typecheck",
      "phase-32-targeted-regressions",
      "phase-32-fallback-eval",
    ]);
    expect(report.scope).toEqual(buildPhase32GateScope());
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-32/run-phase32-gate/phase-32-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("blocks live external-host reports outside the canonical Phase 32 evidence path", async () => {
    const report = await runPhase32QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-32",
        runId: "run-phase32-gate",
        liveReportPath: "/tmp/live-phase32.json",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-22T18:15:30.000Z",
        readTextFile: async (path) => {
          if (path === "/tmp/live-phase32.json") {
            return createAcceptedPhase32LiveReport();
          }

          return createAcceptedPhase32DeterministicReport();
        },
        runCommand: async () => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.liveExternalHost.status).toBe("blocked");
    expect(report.evidence.liveExternalHost.reason).toContain("path is not canonical");
  });

  it("blocks live external-host reports that were not generated by the canonical runner", async () => {
    const parsed = JSON.parse(createAcceptedPhase32LiveReport()) as {
      evidenceContract: {
        phase32: {
          runner: string;
        };
      };
      generatedBy: string;
    };
    parsed.generatedBy = "manual-phase-32-external-host-report";
    parsed.evidenceContract.phase32.runner = "manual-phase-32-external-host-report";

    const report = await runPhase32QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-32",
        runId: "run-phase32-gate",
        liveReportPath: REPO_LIVE_CONTRACT.canonicalLiveReportPath,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-22T18:15:30.000Z",
        readTextFile: async (path) => {
          if (path === REPO_LIVE_CONTRACT.canonicalLiveReportPath) {
            return JSON.stringify(parsed);
          }

          return createAcceptedPhase32DeterministicReport();
        },
        runCommand: async () => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.liveExternalHost.status).toBe("blocked");
    expect(report.evidence.liveExternalHost.reason).toContain("canonical live runner");
  });

  it("blocks live external-host reports that do not preserve the required dual-baseline comparison semantics", async () => {
    const parsed = JSON.parse(createAcceptedPhase32LiveReport()) as {
      comparison: {
        cases: Array<{
          caseId: string;
          nonRegressionAgainstTextOnly: boolean;
          winOverNoMemory: boolean;
        }>;
      };
    };
    parsed.comparison.cases[2] = {
      ...parsed.comparison.cases[2]!,
      winOverNoMemory: false,
    };

    const report = await runPhase32QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-32",
        runId: "run-phase32-gate",
        liveReportPath: REPO_LIVE_CONTRACT.canonicalLiveReportPath,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-22T18:15:30.000Z",
        readTextFile: async (path) => {
          if (path === REPO_LIVE_CONTRACT.canonicalLiveReportPath) {
            return JSON.stringify(parsed);
          }

          return createAcceptedPhase32DeterministicReport();
        },
        runCommand: async () => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.liveExternalHost.status).toBe("blocked");
    expect(report.evidence.liveExternalHost.reason).toContain("dual-baseline comparison semantics");
  });

  it("blocks when the canonical live external-host evidence chain is missing", async () => {
    const report = await runPhase32QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-32",
        runId: "run-phase32-gate",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-22T18:15:30.000Z",
        readTextFile: async (path) => {
          if (
            path ===
            "/tmp/goodmemory/reports/eval/fallback/phase-32/run-20260422173045/report.json"
          ) {
            return createAcceptedPhase32DeterministicReport();
          }

          throw new Error("missing");
        },
        runCommand: async () => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.liveExternalHost.status).toBe("blocked");
    expect(report.evidence.liveExternalHost.reason).toContain(
      "Canonical Phase 32 live external-host report is missing or unreadable",
    );
  });

  it("runs the cli wrapper and forwards the exit code", async () => {
    const logged: string[] = [];
    let exitCode = -1;

    await runPhase32GateCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-32-gate.ts",
        "--output-dir",
        "/tmp/phase32",
        "--run-id",
        "run-phase32-gate",
        "--live-report-path",
        "/tmp/live-phase32.json",
      ],
      exit: (code) => {
        exitCode = code;
      },
      log: (message) => {
        logged.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "phase-32 accepted",
        },
        commands: [],
        evidence: {
          deterministicReport: {
            reason: "accepted",
            reportPath: "reports/eval/fallback/phase-32/run-20260422173045/report.json",
            status: "accepted",
          },
          liveExternalHost: {
            hostKind: "codex",
            liveReportPath:
              "reports/eval/live-memory/phase-32/run-phase32-live-current/report.json",
            reason: "accepted",
            status: "accepted",
            traceBacked: true,
          },
        },
        generatedAt: "2026-04-22T18:15:30.000Z",
        generatedBy: "scripts/run-phase-32-gate.ts",
        phase: "phase-32",
        runDirectory: "reports/quality-gates/phase-32/run-phase32-gate",
        runId: "run-phase32-gate",
        scope: buildPhase32GateScope(),
      }),
    });

    expect(exitCode).toBe(-1);
    expect(logged[0]).toContain("\"phase\": \"phase-32\"");
  });
});
