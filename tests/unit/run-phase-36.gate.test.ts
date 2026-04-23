import { describe, expect, it } from "bun:test";
import {
  buildPhase36GateCommands,
  buildPhase36GateRunId,
  parsePhase36GateCliOptions,
  resolvePhase36CanonicalDeterministicReportPath,
  resolvePhase36CanonicalLiveReportPath,
  resolvePhase36GateOutputDir,
  runPhase36QualityGate,
} from "../../scripts/run-phase-36-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase36DeterministicReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
    },
    cases: [
      {
        caseId: "custom-assisted-composition",
        extractorIds: ["life-coach-launch-owner-extractor"],
        passed: true,
      },
    ],
    generatedBy: "scripts/run-phase-36-eval.ts",
    mode: "fallback",
    phase: "phase-36",
    summary: {
      acceptedCaseCount: 6,
      annotationPolicyPassCount: 2,
      domainMetadataPassCount: 1,
      extractorCompositionPassCount: 1,
      rulesDslPassCount: 1,
      traceCompletenessPassCount: 1,
      totalCases: 6,
    },
  });
}

function createAcceptedPhase36LiveReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
    },
    evidence: {
      extractorIds: ["life-coach-live-domain-extractor"],
      providerBacked: true,
      publicConfigOnly: true,
      wroteDomainMemory: true,
    },
    evidenceContract: {
      phase36: {
        runner: "scripts/run-phase-36-live-memory.ts",
        runtimePath: "provider_backed_public_write_smoke",
      },
    },
    generatedBy: "scripts/run-phase-36-live-memory.ts",
    mode: "live-memory",
    phase: "phase-36",
  });
}

describe("run-phase-36 gate", () => {
  it("resolves the phase-36 output and canonical evidence paths", () => {
    expect(resolvePhase36GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-36",
    );
    expect(resolvePhase36CanonicalDeterministicReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-36/run-20260423221045/report.json",
    );
    expect(resolvePhase36CanonicalLiveReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-36/run-phase36-live-current/report.json",
    );
  });

  it("builds a deterministic phase-36 gate run id", () => {
    expect(buildPhase36GateRunId("2026-04-23T22:30:45.000Z")).toBe(
      "run-20260423223045",
    );
  });

  it("parses phase-36 gate cli flags", () => {
    expect(
      parsePhase36GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-36-gate.ts",
        "--output-dir",
        "/tmp/phase36-gate",
        "--run-id",
        "run-phase36-gate",
        "--live-report-path",
        "/tmp/live-phase36.json",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live-phase36.json",
      outputDir: "/tmp/phase36-gate",
      runId: "run-phase36-gate",
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase36GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/remember.profiles.test.ts",
          "tests/unit/remember.extraction.test.ts",
          "tests/unit/remember.engine.test.ts",
          "tests/integration/remember.profiles.test.ts",
          "tests/unit/markdown-artifacts.test.ts",
          "tests/unit/run-phase-36.script.test.ts",
          "tests/unit/run-phase-36.live-memory.test.ts",
          "tests/unit/run-phase-36.gate.test.ts",
          "tests/release/release.test.ts",
        ],
        cwd: ROOT,
        label: "phase-36-targeted-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-36",
          "--run-id",
          "run-20260423221045",
        ],
        cwd: ROOT,
        label: "phase-36-fallback-eval",
      },
    ]);
  });

  it("writes an accepted phase-36 gate when canonical evidence is accepted", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase36QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-36",
        runId: "run-phase36-gate-test",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-23T22:30:45.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-36/run-20260423221045/report.json")) {
            return createAcceptedPhase36DeterministicReport();
          }
          if (path.endsWith("reports/eval/live-memory/phase-36/run-phase36-live-current/report.json")) {
            return createAcceptedPhase36LiveReport();
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

    expect(report.phase).toBe("phase-36");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.status).toBe("accepted");
    expect(report.evidence.liveMemory.status).toBe("accepted");
    expect(report.scope.outOfScope).toContain("turning OneLife into a built-in preset");
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-36/run-phase36-gate-test",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-36/run-phase36-gate-test/phase-36-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
