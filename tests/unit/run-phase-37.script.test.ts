import { describe, expect, it } from "bun:test";
import {
  buildPhase37FallbackRunId,
  parsePhase37EvalCliOptions,
  resolvePhase37FallbackOutputDir,
  runPhase37FallbackEval,
} from "../../scripts/run-phase-37-eval";

describe("run-phase-37 eval script", () => {
  it("resolves the phase-37 deterministic output directory", () => {
    expect(resolvePhase37FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-37",
    );
  });

  it("builds a deterministic phase-37 run id", () => {
    expect(buildPhase37FallbackRunId("2026-04-24T10:10:45.000Z")).toBe(
      "run-20260424101045",
    );
  });

  it("parses phase-37 eval cli flags", () => {
    expect(
      parsePhase37EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-37-eval.ts",
        "--output-dir",
        "/tmp/phase37",
        "--run-id",
        "run-phase37",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase37",
      runId: "run-phase37",
    });
  });

  it("writes an accepted deterministic installed-host writeback report", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase37FallbackEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-37",
        runId: "run-phase37",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-24T10:10:45.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-37");
    expect(report.mode).toBe("fallback");
    expect(report.runId).toBe("run-phase37");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.summary.totalCases).toBe(8);
    expect(report.summary.acceptedCaseCount).toBe(8);
    expect(report.summary.durableWriteCount).toBe(5);
    expect(report.summary.blockedAssistantCount).toBe(1);
    expect(report.summary.privacyMaskPassCount).toBe(2);
    expect(report.summary.dedupePassCount).toBe(1);
    expect(report.summary.nextSessionRecallPassCount).toBe(1);
    expect(report.summary.rawTranscriptRejectedPassCount).toBe(1);
    expect(report.cases.every((caseResult) => caseResult.passed)).toBe(true);
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/fallback/phase-37/run-phase37",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-37/run-phase37/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
