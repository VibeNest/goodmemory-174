import { describe, expect, it } from "bun:test";
import {
  buildPhase37GateCommands,
  buildPhase37GateRunId,
  parsePhase37GateCliOptions,
  resolvePhase37CanonicalDeterministicReportPath,
  resolvePhase37CanonicalExternalConsumerReportPath,
  resolvePhase37CanonicalLiveReportPath,
  resolvePhase37GateOutputDir,
  runPhase37GateCli,
  runPhase37QualityGate,
} from "../../scripts/run-phase-37-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase37DeterministicReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
    },
    generatedBy: "scripts/run-phase-37-eval.ts",
    mode: "fallback",
    phase: "phase-37",
    summary: {
      acceptedCaseCount: 8,
      blockedAssistantCount: 1,
      dedupePassCount: 1,
      durableWriteCount: 5,
      nextSessionRecallPassCount: 1,
      privacyMaskPassCount: 2,
      rawTranscriptRejectedPassCount: 1,
      totalCases: 8,
    },
  });
}

function createAcceptedPhase37LiveReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
    },
    evidence: {
      assistantUnconfirmedWritesBlocked: true,
      durableStorageProvider: "sqlite",
      manualSeedUsed: false,
      nextSessionRecallHit: true,
      providerBackedAssistedExtraction: true,
      rawTranscriptPersisted: false,
      resolvedExtractionStrategies: ["llm-assisted"],
      wroteDurableMemory: true,
      writebackMode: "selective",
    },
    evidenceContract: {
      phase37: {
        runner: "scripts/run-phase-37-live-memory.ts",
        runtimePath:
          "provider_backed_assisted_extraction_installed_host_selective_writeback",
      },
    },
    generatedBy: "scripts/run-phase-37-live-memory.ts",
    mode: "live-memory",
    phase: "phase-37",
  });
}

function createAcceptedPhase37ExternalReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
    },
    evidence: {
      installedPackageUsed: true,
      manualSeedUsed: false,
      nextSessionRecallHit: true,
      rawTranscriptPersisted: false,
      wroteDurableMemory: true,
      writebackMode: "selective",
    },
    evidenceContract: {
      phase37: {
        packageBoundary: "external_consumer_installed_package",
        runner: "scripts/run-phase-37-external-consumer.ts",
        runtimePath: "external_consumer_installed_host_writeback",
      },
    },
    generatedBy: "scripts/run-phase-37-external-consumer.ts",
    mode: "external-consumer",
    phase: "phase-37",
  });
}

describe("run-phase-37 gate", () => {
  it("resolves the phase-37 output and canonical evidence paths", () => {
    expect(resolvePhase37GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-37",
    );
    expect(resolvePhase37CanonicalDeterministicReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-37/run-20260424101045/report.json",
    );
    expect(resolvePhase37CanonicalLiveReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-37/run-phase37-live-current/report.json",
    );
    expect(resolvePhase37CanonicalExternalConsumerReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json",
    );
  });

  it("builds a deterministic phase-37 gate run id", () => {
    expect(buildPhase37GateRunId("2026-04-24T10:40:45.000Z")).toBe(
      "run-20260424104045",
    );
  });

  it("parses phase-37 gate cli flags", () => {
    expect(
      parsePhase37GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-37-gate.ts",
        "--output-dir",
        "/tmp/phase37-gate",
        "--run-id",
        "run-phase37-gate",
        "--live-report-path",
        "/tmp/live-phase37.json",
        "--external-report-path",
        "/tmp/external-phase37.json",
      ]),
    ).toEqual({
      externalReportPath: "/tmp/external-phase37.json",
      liveReportPath: "/tmp/live-phase37.json",
      outputDir: "/tmp/phase37-gate",
      runId: "run-phase37-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase37GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/host-writeback-runtime.test.ts",
          "tests/unit/host-writeback-config.test.ts",
          "tests/unit/host-hook-runtime.test.ts",
          "tests/unit/host-install.test.ts",
          "tests/integration/installed-host-writeback.test.ts",
          "tests/unit/run-phase-37.script.test.ts",
          "tests/unit/run-phase-37.live-memory.test.ts",
          "tests/unit/run-phase-37.external-consumer.test.ts",
          "tests/unit/run-phase-37.gate.test.ts",
          "tests/cli/cli.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "phase-37-targeted-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-37",
          "--run-id",
          "run-20260424101045",
        ],
        cwd: ROOT,
        label: "phase-37-fallback-eval",
      },
      {
        args: ["bun", "run", "eval:phase-37-live-memory"],
        cwd: ROOT,
        label: "phase-37-live-memory",
      },
      {
        args: ["bun", "run", "eval:phase-37-external-consumer"],
        cwd: ROOT,
        label: "phase-37-external-consumer",
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

  it("writes an accepted phase-37 gate when canonical evidence is accepted", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase37QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-37",
        runId: "run-phase37-gate-test",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-24T10:40:45.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-37/run-20260424101045/report.json")) {
            return createAcceptedPhase37DeterministicReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-37/run-phase37-live-current/report.json")) {
            return createAcceptedPhase37LiveReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json")) {
            return createAcceptedPhase37ExternalReport();
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

    expect(report.phase).toBe("phase-37");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.status).toBe("accepted");
    expect(report.evidence.liveMemory.status).toBe("accepted");
    expect(report.evidence.externalConsumer.status).toBe("accepted");
    expect(report.scope.outOfScope).toContain("default-on automatic writeback");
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-37/run-phase37-gate-test",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-37/run-phase37-gate-test/phase-37-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("exits nonzero when the phase-37 gate report is blocked", async () => {
    const exitCodes: number[] = [];
    const logs: string[] = [];

    await runPhase37GateCli({
      argv: ["bun", "run", "scripts/run-phase-37-gate.ts"],
      exit: (code) => {
        exitCodes.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "blocked",
          reason: "Provider-backed live-memory smoke did not run.",
        },
        commands: [],
        evidence: {
          deterministicReport: {
            reason: "ok",
            reportPath: "reports/eval/fallback/phase-37/run-20260424101045/report.json",
            status: "accepted",
          },
          externalConsumer: {
            reason: "ok",
            reportPath: "reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json",
            status: "accepted",
          },
          liveMemory: {
            reason: "missing provider env",
            reportPath: "reports/eval/live-memory/phase-37/run-phase37-live-current/report.json",
            runtimePath:
              "provider_backed_assisted_extraction_installed_host_selective_writeback",
            status: "blocked",
          },
        },
        generatedAt: "2026-04-24T10:40:45.000Z",
        generatedBy: "scripts/run-phase-37-gate.ts",
        phase: "phase-37",
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-37/run-phase37-gate",
        runId: "run-phase37-gate",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(exitCodes).toEqual([1]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("\"decision\": \"blocked\"");
  });
});
