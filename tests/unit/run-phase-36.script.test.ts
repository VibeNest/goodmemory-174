import { describe, expect, it } from "bun:test";
import {
  buildPhase36FallbackRunId,
  parsePhase36EvalCliOptions,
  resolvePhase36FallbackOutputDir,
  runPhase36FallbackEval,
} from "../../scripts/run-phase-36-eval";

describe("run-phase-36 eval script", () => {
  it("resolves the phase-36 deterministic output directory", () => {
    expect(resolvePhase36FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-36",
    );
  });

  it("builds a deterministic phase-36 run id", () => {
    expect(buildPhase36FallbackRunId("2026-04-23T22:10:45.000Z")).toBe(
      "run-20260423221045",
    );
  });

  it("parses phase-36 eval cli flags", () => {
    expect(
      parsePhase36EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-36-eval.ts",
        "--output-dir",
        "/tmp/phase36",
        "--run-id",
        "run-phase36",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase36",
      runId: "run-phase36",
    });
  });

  it("writes an accepted deterministic public write customization report", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase36FallbackEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-36",
        runId: "run-phase36",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-23T22:10:45.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-36");
    expect(report.mode).toBe("fallback");
    expect(report.runId).toBe("run-phase36");
    expect(report.acceptance.decision).toBe("accepted");
    expect(report.summary.totalCases).toBe(6);
    expect(report.summary.acceptedCaseCount).toBe(6);
    expect(report.summary.rulesDslPassCount).toBe(1);
    expect(report.summary.annotationPolicyPassCount).toBe(2);
    expect(report.summary.extractorCompositionPassCount).toBe(1);
    expect(report.summary.traceCompletenessPassCount).toBe(1);
    expect(report.summary.domainMetadataPassCount).toBe(1);
    expect(report.cases.every((caseResult) => caseResult.passed)).toBe(true);
    expect(
      report.cases.find(
        (caseResult) => caseResult.caseId === "custom-assisted-composition",
      )?.extractorIds,
    ).toEqual(["life-coach-launch-owner-extractor"]);
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/fallback/phase-36/run-phase36",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-36/run-phase36/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
