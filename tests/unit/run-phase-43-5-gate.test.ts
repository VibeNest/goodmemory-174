import { describe, expect, it } from "bun:test";
import {
  buildPhase435GateCommands,
  buildPhase435GateRunId,
  parsePhase435GateCliOptions,
  resolvePhase435CanonicalEvalReportPath,
  resolvePhase435GateOutputDir,
  runPhase435QualityGate,
} from "../../scripts/run-phase-43-5-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase435EvalReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    cases: {
      cliSurfacePass: true,
      coalescingPass: true,
      daemonOptionalPass: true,
      drainOnceIdempotencyPass: true,
      envelopeRedactionPass: true,
      noRootApiWideningPass: true,
      recoverDryRunPass: true,
      workerFailureIsolationPass: true,
    },
    generatedAt: "2026-04-26T13:30:00.000Z",
    generatedBy: "scripts/run-phase-43-5-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-43-5`,
    phase: "phase-43-5",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-43-5/run-20260426133000`,
    runId: "run-20260426133000",
    summary: {
      passCount: 8,
      totalChecks: 8,
    },
  });
}

describe("run-phase-43-5 gate script", () => {
  it("resolves phase-43-5 output and canonical evidence paths", () => {
    expect(resolvePhase435GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-43-5",
    );
    expect(resolvePhase435CanonicalEvalReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-43-5/run-20260426133000/report.json",
    );
  });

  it("builds a deterministic phase-43-5 gate run id", () => {
    expect(buildPhase435GateRunId("2026-04-26T14:00:00.000Z")).toBe(
      "run-20260426140000",
    );
  });

  it("parses phase-43-5 gate cli flags", () => {
    expect(
      parsePhase435GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-43-5-gate.ts",
        "--output-dir",
        "/tmp/phase435-gate",
        "--run-id",
        "run-phase435-gate",
        "--eval-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      evalReportPath: "/tmp/report.json",
      outputDir: "/tmp/phase435-gate",
      runId: "run-phase435-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase435GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/runtime-worker.test.ts",
          "tests/cli/runtime-worker-cli.test.ts",
          "tests/unit/run-phase-43-5-eval.test.ts",
          "tests/unit/run-phase-43-5-gate.test.ts",
          "--test-name-pattern",
          "runtime worker|run-phase-43-5",
        ],
        cwd: ROOT,
        label: "phase-43-5-core-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-43-5",
          "--run-id",
          "run-20260426133000",
        ],
        cwd: ROOT,
        label: "phase-43-5-fallback-eval",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-43.5|phase-43-5|models fallback eval evidence|package metadata exposes bin|current status doc points|task-board current note|packs a tarball",
        ],
        cwd: ROOT,
        env: {
          PHASE435_GATE_IN_PROGRESS: "1",
        },
        label: "phase-43-5-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-43-5 quality gate when evidence and boundaries pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const report = await runPhase435QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-43-5",
        runId: "run-phase435-gate-test",
        skipCommands: true,
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-26T14:00:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-43-5/run-20260426133000/report.json")) {
            return createAcceptedPhase435EvalReport();
          }
          if (path.endsWith("src/cli.ts")) {
            return "goodmemory runtime worker drain-once\nhandleRuntimeWorker\ncreateRuntimeWorkerQueue";
          }
          if (path.endsWith("src/index.ts")) {
            return "export { createGoodMemory } from './api/createGoodMemory';";
          }
          if (path.endsWith("package.json")) {
            return JSON.stringify({
              scripts: {
                "eval:phase-43-5": "bun run scripts/run-phase-43-5-eval.ts",
                "gate:phase-43-5": "bun run scripts/run-phase-43-5-gate.ts",
              },
              exports: {},
            });
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-43-5");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport).toMatchObject({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-43-5/run-20260426133000/report.json",
      status: "accepted",
    });
    expect(report.evidence.evalSummary).toEqual({
      passCount: 8,
      totalChecks: 8,
    });
    expect(report.evidence.noRootApiWidening).toBe(true);
    expect(report.evidence.workerCliSurface).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("rejects summary-only eval reports without named worker cases", async () => {
    await expect(runPhase435QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-43-5",
        runId: "run-phase435-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-43-5/run-20260426133000/report.json")) {
            return JSON.stringify({
              acceptance: { decision: "accepted" },
              generatedBy: "scripts/run-phase-43-5-eval.ts",
              mode: "fallback",
              phase: "phase-43-5",
              runId: "run-20260426133000",
              summary: {
                passCount: 8,
                totalChecks: 8,
              },
            });
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 43.5 eval report does not match the expected schema.");
  });
});
