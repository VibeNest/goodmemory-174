import { describe, expect, it } from "bun:test";
import {
  buildPhase44GateCommands,
  buildPhase44GateRunId,
  parsePhase44GateCliOptions,
  resolvePhase44CanonicalEvalReportPath,
  resolvePhase44GateOutputDir,
  runPhase44QualityGate,
} from "../../scripts/run-phase-44-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase44EvalReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    cases: {
      auditTraceSessionViewsPass: true,
      handoffReadOnlyPass: true,
      localBindPass: true,
      noCorsPass: true,
      noMutationRoutesPass: true,
      noRawTranscriptPass: true,
      noRootApiWideningPass: true,
      packageLicenseHygienePass: true,
      progressiveDrilldownPass: true,
      staticShellPass: true,
      tokenSecurityPass: true,
    },
    generatedAt: "2026-04-26T15:30:00.000Z",
    generatedBy: "scripts/run-phase-44-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-44`,
    phase: "phase-44",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-44/run-20260426153000`,
    runId: "run-20260426153000",
    summary: {
      passCount: 11,
      totalChecks: 11,
    },
  });
}

describe("run-phase-44 gate script", () => {
  it("resolves phase-44 output and canonical evidence paths", () => {
    expect(resolvePhase44GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-44",
    );
    expect(resolvePhase44CanonicalEvalReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-44/run-20260426153000/report.json",
    );
  });

  it("builds a deterministic phase-44 gate run id", () => {
    expect(buildPhase44GateRunId("2026-04-26T16:00:00.000Z")).toBe(
      "run-20260426160000",
    );
  });

  it("parses phase-44 gate cli flags", () => {
    expect(
      parsePhase44GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-44-gate.ts",
        "--output-dir",
        "/tmp/phase44-gate",
        "--run-id",
        "run-phase44-gate",
        "--eval-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      evalReportPath: "/tmp/report.json",
      outputDir: "/tmp/phase44-gate",
      runId: "run-phase44-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase44GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/runtime-viewer.test.ts",
          "tests/cli/runtime-viewer-cli.test.ts",
          "tests/unit/run-phase-44-eval.test.ts",
          "tests/unit/run-phase-44-gate.test.ts",
          "--test-name-pattern",
          "runtime viewer|run-phase-44",
        ],
        cwd: ROOT,
        label: "phase-44-viewer-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-44",
          "--run-id",
          "run-20260426153000",
        ],
        cwd: ROOT,
        label: "phase-44-fallback-eval",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-44|models fallback eval evidence|package metadata exposes bin|current status doc points|task-board current note|packs a tarball|root exports stay aligned",
        ],
        cwd: ROOT,
        env: {
          PHASE44_GATE_IN_PROGRESS: "1",
        },
        label: "phase-44-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-44 quality gate when evidence and boundaries pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const report = await runPhase44QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-44",
        runId: "run-phase44-gate-test",
        skipCommands: true,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-26T16:00:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-44/run-20260426153000/report.json")) {
            return createAcceptedPhase44EvalReport();
          }
          if (path.endsWith("src/cli.ts")) {
            return [
              "goodmemory runtime viewer --host <codex|claude>",
              "serveRuntimeViewer",
              "RUNTIME_VIEWER_HELP_TEXT",
            ].join("\n");
          }
          if (path.endsWith("src/index.ts")) {
            return "export { createGoodMemory } from './api/createGoodMemory';";
          }
          if (path.endsWith("src/runtime-viewer/public.ts")) {
            return [
              "normalizeRuntimeViewerBindHost",
              "GoodMemory runtime viewer is read-only",
              "rawTranscriptPersisted: false",
            ].join("\n");
          }
          if (path.endsWith("package.json")) {
            return JSON.stringify({
              exports: {},
              files: ["src"],
              scripts: {
                "eval:phase-44": "bun run scripts/run-phase-44-eval.ts",
                "gate:phase-44": "bun run scripts/run-phase-44-gate.ts",
              },
            });
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-44");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport).toMatchObject({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-44/run-20260426153000/report.json",
      status: "accepted",
    });
    expect(report.evidence.evalSummary).toEqual({
      passCount: 11,
      totalChecks: 11,
    });
    expect(report.evidence.noRootApiWidening).toBe(true);
    expect(report.evidence.viewerCliSurface).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("rejects summary-only eval reports without named viewer cases", async () => {
    await expect(runPhase44QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-44",
        runId: "run-phase44-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-44/run-20260426153000/report.json")) {
            return JSON.stringify({
              acceptance: { decision: "accepted" },
              generatedBy: "scripts/run-phase-44-eval.ts",
              mode: "fallback",
              phase: "phase-44",
              runId: "run-20260426153000",
              summary: {
                passCount: 11,
                totalChecks: 11,
              },
            });
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 44 eval report does not match the expected schema.");
  });
});
