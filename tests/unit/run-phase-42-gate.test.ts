import { describe, expect, it } from "bun:test";
import {
  buildPhase42GateCommands,
  buildPhase42GateRunId,
  parsePhase42GateCliOptions,
  resolvePhase42CanonicalEvalReportPath,
  resolvePhase42GateOutputDir,
  runPhase42QualityGate,
} from "../../scripts/run-phase-42-gate";

const ROOT = "/tmp/goodmemory";

function createAcceptedPhase42EvalReport(): string {
  return JSON.stringify({
    acceptance: {
      decision: "accepted",
      reason: "accepted",
    },
    generatedAt: "2026-04-26T09:30:00.000Z",
    generatedBy: "scripts/run-phase-42-eval.ts",
    mode: "fallback",
    outputDir: `${ROOT}/reports/eval/fallback/phase-42`,
    phase: "phase-42",
    runDirectory: `${ROOT}/reports/eval/fallback/phase-42/run-20260426093000`,
    runId: "run-20260426093000",
    summary: {
      passCount: 8,
      totalChecks: 8,
    },
  });
}

describe("run-phase-42 gate script", () => {
  it("resolves phase-42 output and canonical evidence paths", () => {
    expect(resolvePhase42GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-42",
    );
    expect(resolvePhase42CanonicalEvalReportPath(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-42/run-20260426093000/report.json",
    );
  });

  it("builds a deterministic phase-42 gate run id", () => {
    expect(buildPhase42GateRunId("2026-04-26T10:00:00.000Z")).toBe(
      "run-20260426100000",
    );
  });

  it("parses phase-42 gate cli flags", () => {
    expect(
      parsePhase42GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-42-gate.ts",
        "--output-dir",
        "/tmp/phase42-gate",
        "--run-id",
        "run-phase42-gate",
        "--eval-report-path",
        "/tmp/report.json",
        "--skip-commands",
      ]),
    ).toEqual({
      evalReportPath: "/tmp/report.json",
      outputDir: "/tmp/phase42-gate",
      runId: "run-phase42-gate",
      skipCommands: true,
    });
  });

  it("builds the expected targeted command set", () => {
    expect(buildPhase42GateCommands(ROOT)).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: ROOT,
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/progressive-recall.service.test.ts",
        "tests/integration/host-mcp-server.test.ts",
        "tests/unit/host-hook-runtime.test.ts",
        "tests/unit/host-writeback-config.test.ts",
        "tests/unit/host-install.test.ts",
        "tests/unit/run-phase-42-eval.test.ts",
        "tests/unit/run-phase-42-gate.test.ts",
      ],
      cwd: ROOT,
      label: "phase-42-core-regressions",
    },
    {
      args: [
          "bun",
          "run",
          "eval:phase-42",
          "--run-id",
          "run-20260426093000",
        ],
      cwd: ROOT,
      label: "phase-42-fallback-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/cli/cli.test.ts",
        "--test-name-pattern",
        "contextMode|context mode|status text does not report invalid contextMode|status reports installed host activation",
      ],
      cwd: ROOT,
      label: "phase-42-cli-regressions",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-42|models fallback eval evidence|package metadata exposes bin|packs a tarball",
      ],
      cwd: ROOT,
      env: {
        PHASE42_GATE_IN_PROGRESS: "1",
      },
      label: "phase-42-release-regressions",
    },
  ]);
  });

  it("writes an accepted phase-42 quality gate when evidence and boundaries pass", async () => {
    const directories: string[] = [];
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase42QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-42",
        runId: "run-phase42-gate-test",
        skipCommands: true,
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-26T10:00:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith("reports/eval/fallback/phase-42/run-20260426093000/report.json")) {
            return createAcceptedPhase42EvalReport();
          }
          if (path.endsWith("src/install/hostMcpServer.ts")) {
            return [
              "createInstalledHostProgressiveRecallService",
              "goodmemory_search_index",
            ].join("\n");
          }
          if (path.endsWith("src/index.ts")) {
            return "export { createGoodMemory } from './api/createGoodMemory';";
          }
          throw new Error(`Unexpected path: ${path}`);
        },
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-42");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence).toEqual({
      deterministicReport: {
        artifactKind: "ignored_generated",
        ignoredReportPath:
          "reports/eval/fallback/phase-42/run-20260426093000/report.json",
        reason: "Phase 42 deterministic progressive recall protocol evidence is accepted.",
        regenerateCommand: "bun run eval:phase-42 --run-id run-20260426093000",
        status: "accepted",
      },
      evalSummary: {
        passCount: 8,
        totalChecks: 8,
      },
      mcpWrapsProgressiveService: true,
      noRootApiWidening: true,
    });
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-42/run-phase42-gate-test",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-42/run-phase42-gate-test/phase-42-quality-gate.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
