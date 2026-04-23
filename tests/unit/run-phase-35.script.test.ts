import { describe, expect, it } from "bun:test";
import {
  buildPhase35FallbackRunId,
  parsePhase35EvalCliOptions,
  resolvePhase35FallbackOutputDir,
  runPhase35FallbackEval,
} from "../../scripts/run-phase-35-eval";

describe("run-phase-35 eval script", () => {
  it("resolves the phase-35 deterministic output directory", () => {
    expect(resolvePhase35FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-35",
    );
  });

  it("builds a deterministic phase-35 run id", () => {
    expect(buildPhase35FallbackRunId("2026-04-23T17:30:45.000Z")).toBe(
      "run-20260423173045",
    );
  });

  it("parses phase-35 eval cli flags", () => {
    expect(
      parsePhase35EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-35-eval.ts",
        "--output-dir",
        "/tmp/phase35",
        "--run-id",
        "run-phase35",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase35",
      runId: "run-phase35",
    });
  });

  it("writes an accepted deterministic middleware report with dual baselines", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase35FallbackEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-35",
        runId: "run-phase35",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-23T17:30:45.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-35");
    expect(report.mode).toBe("fallback");
    expect(report.runId).toBe("run-phase35");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.summary.totalCases).toBe(3);
    expect(report.summary.middlewareNonRegressionPassCount).toBe(3);
    expect(report.summary.middlewareWinOverNoMemoryCount).toBe(3);
    expect(report.summary.middlewareAverageScore).toBeGreaterThanOrEqual(
      report.summary.textOnlyAverageScore,
    );
    expect(report.summary.middlewareAverageScore).toBeGreaterThan(
      report.summary.noMemoryAverageScore,
    );
    expect(
      report.cases.every((caseResult) => caseResult.nonRegressionAgainstTextOnly),
    ).toBe(true);
    expect(
      report.cases.every((caseResult) => caseResult.winOverNoMemory),
    ).toBe(true);
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "continuity-open-loop")
        ?.middleware.context,
    ).toContain("phase 35 middleware closeout");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "repeated-correction")
        ?.middleware.context,
    ).toContain("short next-step bullets");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "procedure-adherence")
        ?.middleware.context,
    ).toContain("smoke verification");
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/fallback/phase-35/run-phase35",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-35/run-phase35/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
