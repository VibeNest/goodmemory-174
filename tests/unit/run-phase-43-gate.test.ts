import { describe, expect, it } from "bun:test";
import {
  buildPhase43GateCommands,
  buildPhase43GateRunId,
  parsePhase43GateCliOptions,
  resolvePhase43CanonicalEvalReportPath,
  resolvePhase43GateOutputDir,
  runPhase43QualityGate,
} from "../../scripts/run-phase-43-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase43EvalReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    cases: {
      aiSdkRuntimeKitReuseBoundary: true,
      eventScopeDigestOnly: true,
      fragmentLifecyclePass: true,
      observeNoDurableWrite: true,
      preActionExecutionPlanPass: true,
      progressiveLifecyclePass: true,
      selectiveWritebackGovernancePass: true,
      sessionLifecycleNoTranscriptArchive: true,
    },
    generatedAt: "2026-04-26T11:30:00.000Z",
    generatedBy: "scripts/run-phase-43-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-43`,
    phase: "phase-43",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-43/run-20260426113000`,
    runId: "run-20260426113000",
    summary: {
      passCount: 8,
      totalChecks: 8,
    },
  });
}

describe("run-phase-43 gate script", () => {
  it("resolves phase-43 output and canonical evidence paths", () => {
    expect(resolvePhase43GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-43",
    );
    expect(resolvePhase43CanonicalEvalReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-43/run-20260426113000/report.json",
    );
  });

  it("builds a deterministic phase-43 gate run id", () => {
    expect(buildPhase43GateRunId("2026-04-26T12:00:00.000Z")).toBe(
      "run-20260426120000",
    );
  });

  it("parses phase-43 gate cli flags", () => {
    expect(
      parsePhase43GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-43-gate.ts",
        "--output-dir",
        "/tmp/phase43-gate",
        "--run-id",
        "run-phase43-gate",
        "--eval-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      evalReportPath: "/tmp/report.json",
      outputDir: "/tmp/phase43-gate",
      runId: "run-phase43-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase43GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/runtime-kit.test.ts",
          "tests/unit/ai-sdk.public.test.ts",
          "tests/unit/architecture.boundaries.test.ts",
          "tests/unit/run-phase-43-eval.test.ts",
          "tests/unit/run-phase-43-gate.test.ts",
          "--test-name-pattern",
          "runtime-kit|ai-sdk adapter|AI SDK adapter|run-phase-43",
        ],
        cwd: ROOT,
        label: "phase-43-core-regressions",
      },
      {
        args: [
          "bun",
          "run",
          "eval:phase-43",
          "--run-id",
          "run-20260426113000",
        ],
        cwd: ROOT,
        label: "phase-43-fallback-eval",
      },
      {
        args: [
          "bun",
          "test",
          "tests/examples/examples.test.ts",
          "--test-name-pattern",
          "vercel ai example|plain ai sdk server",
        ],
        cwd: ROOT,
        label: "phase-43-example-regressions",
      },
      {
        args: [
          "bun",
          "test",
          "tests/release/release.test.ts",
          "--test-name-pattern",
          "phase-43|models fallback eval evidence|package metadata exposes bin|root exports stay aligned|current status doc points|task-board current note|packs a tarball",
        ],
        cwd: ROOT,
        env: {
          PHASE43_GATE_IN_PROGRESS: "1",
        },
        label: "phase-43-release-regressions",
      },
    ]);
  });

  it("writes an accepted phase-43 quality gate when evidence and boundaries pass", async () => {
    const directories: string[] = [];
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase43QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-43",
        runId: "run-phase43-gate-test",
        skipCommands: true,
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-26T12:00:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-43/run-20260426113000/report.json")) {
            return createAcceptedPhase43EvalReport();
          }
          if (path.endsWith("src/ai-sdk/public.ts")) {
            return [
              "createGoodMemoryRuntimeKit",
              "beforeModelCall",
              "afterModelCall",
            ].join("\n");
          }
          if (path.endsWith("src/index.ts")) {
            return "export { createGoodMemory } from './api/createGoodMemory';";
          }
          if (path.endsWith("package.json")) {
            return JSON.stringify({
              exports: {
                "./runtime-kit": {
                  types: "./dist/runtime-kit/index.d.ts",
                  import: "./dist/runtime-kit/index.js",
                },
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

    expect(report.phase).toBe("phase-43");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence).toEqual({
      aiSdkUsesRuntimeKit: true,
      deterministicReport: {
        artifactKind: "ignored_generated",
        ignoredReportPath:
          "reports/eval/fallback/phase-43/run-20260426113000/report.json",
        reason: "Phase 43 deterministic runtime-kit evidence is accepted.",
        regenerateCommand: "bun run eval:phase-43 --run-id run-20260426113000",
        status: "accepted",
      },
      evalSummary: {
        passCount: 8,
        totalChecks: 8,
      },
      noRootApiWidening: true,
      runtimeKitSubpathExported: true,
    });
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-43/run-phase43-gate-test",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-43/run-phase43-gate-test/phase-43-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("rejects summary-only eval reports without named runtime-kit cases", async () => {
    await expect(runPhase43QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-43",
        runId: "run-phase43-gate-test",
        skipCommands: true,
      },
      {
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-43/run-20260426113000/report.json")) {
            return JSON.stringify({
              acceptance: {
                decision: "accepted",
              },
              generatedBy: "scripts/run-phase-43-eval.ts",
              mode: "fallback",
              phase: "phase-43",
              runId: "run-20260426113000",
              summary: {
                passCount: 8,
                totalChecks: 8,
              },
            });
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    )).rejects.toThrow("Phase 43 eval report does not match the expected schema.");
  });
});
