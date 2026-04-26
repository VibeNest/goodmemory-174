import { describe, expect, it } from "bun:test";
import {
  buildPhase42FallbackRunId,
  parsePhase42EvalCliOptions,
  resolvePhase42FallbackOutputDir,
  runPhase42FallbackEval,
} from "../../scripts/run-phase-42-eval";

describe("run-phase-42 eval script", () => {
  it("resolves the phase-42 deterministic output directory", () => {
    expect(resolvePhase42FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-42",
    );
  });

  it("builds a deterministic phase-42 run id", () => {
    expect(buildPhase42FallbackRunId("2026-04-26T09:30:00.000Z")).toBe(
      "run-20260426093000",
    );
  });

  it("parses phase-42 eval cli flags", () => {
    expect(
      parsePhase42EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-42-eval.ts",
        "--output-dir",
        "/tmp/phase42",
        "--run-id",
        "run-phase42",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase42",
      runId: "run-phase42",
    });
  });

  it("writes an accepted progressive recall protocol report", async () => {
    const directories: string[] = [];
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase42FallbackEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-42",
        runId: "run-phase42",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-26T09:30:00.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-42");
    expect(report.generatedBy).toBe("scripts/run-phase-42-eval.ts");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.summary.passCount).toBe(report.summary.totalChecks);
    expect(report.cases).toEqual({
      crossScopeDetailDenied: true,
      detailRejectsBareId: true,
      fragmentFallbackWithoutMcp: true,
      noRawScopeLeak: true,
      progressiveTokenBudgetPass: true,
      recallVisibleOnly: true,
      recordRefProtocolPass: true,
      workingMemoryRequired: true,
    });
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/fallback/phase-42/run-phase42",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-42/run-phase42/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
