import { describe, expect, it } from "bun:test";
import { runFixtureEval, runSmokeEval } from "../../scripts/run-eval";

describe("eval smoke", () => {
  it("produces a minimal eval report shape", async () => {
    const report = await runSmokeEval();

    expect(report.runId.length).toBeGreaterThan(0);
    expect(report.summary.totalCases).toBeGreaterThan(0);
    expect(report.summary.totalCases).toBe(report.cases.length);
  });

  it("can run a fixture-backed eval suite", async () => {
    const report = await runFixtureEval({ limit: 1 });

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.winnerCounts.goodmemory).toBeGreaterThanOrEqual(0);
    expect(report.runtime.generationMode).toBe("fallback");
    expect(report.runtime.judgeMode).toBe("fallback");
  });
});
