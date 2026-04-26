import { describe, expect, it } from "bun:test";
import {
  buildPhase43FallbackRunId,
  parsePhase43EvalCliOptions,
  resolvePhase43FallbackOutputDir,
  runPhase43FallbackEval,
} from "../../scripts/run-phase-43-eval";

describe("run-phase-43 eval script", () => {
  it("resolves the phase-43 deterministic output directory", () => {
    expect(resolvePhase43FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-43",
    );
  });

  it("builds a deterministic phase-43 run id", () => {
    expect(buildPhase43FallbackRunId("2026-04-26T11:30:00.000Z")).toBe(
      "run-20260426113000",
    );
  });

  it("parses phase-43 eval cli flags", () => {
    expect(
      parsePhase43EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-43-eval.ts",
        "--output-dir",
        "/tmp/phase43",
        "--run-id",
        "run-phase43",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase43",
      runId: "run-phase43",
    });
  });

  it("writes an accepted runtime-kit report", async () => {
    const directories: string[] = [];
    const writes: Array<{ content: string; path: string }> = [];

    const report = await runPhase43FallbackEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-43",
        runId: "run-phase43",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-26T11:30:00.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-43");
    expect(report.generatedBy).toBe("scripts/run-phase-43-eval.ts");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.summary.passCount).toBe(report.summary.totalChecks);
    expect(report.cases).toEqual({
      aiSdkRuntimeKitReuseBoundary: true,
      eventScopeDigestOnly: true,
      fragmentLifecyclePass: true,
      observeNoDurableWrite: true,
      preActionExecutionPlanPass: true,
      progressiveLifecyclePass: true,
      selectiveWritebackGovernancePass: true,
      sessionLifecycleNoTranscriptArchive: true,
    });
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/fallback/phase-43/run-phase43",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-43/run-phase43/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
