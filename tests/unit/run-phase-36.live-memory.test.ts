import { describe, expect, it } from "bun:test";
import {
  parsePhase36LiveMemoryCliOptions,
  resolvePhase36LiveMemoryOutputDir,
  runPhase36LiveMemoryEval,
} from "../../scripts/run-phase-36-live-memory";

describe("run-phase-36 live-memory script", () => {
  it("resolves the phase-36 live-memory output directory", () => {
    expect(resolvePhase36LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-36",
    );
  });

  it("parses phase-36 live-memory cli flags", () => {
    expect(
      parsePhase36LiveMemoryCliOptions([
        "bun",
        "run",
        "scripts/run-phase-36-live-memory.ts",
        "--output-dir",
        "/tmp/phase36-live",
        "--run-id",
        "run-phase36-live",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase36-live",
      runId: "run-phase36-live",
    });
  });

  it("writes a blocked report when provider credentials are unavailable", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase36LiveMemoryEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/live-memory/phase-36",
        runId: "run-phase36-live",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        env: {},
        now: () => "2026-04-23T22:20:45.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-36");
    expect(report.mode).toBe("live-memory");
    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.extractorIds).toEqual([]);
    expect(report.evidence.providerBacked).toBe(false);
    expect(report.evidence.publicConfigOnly).toBe(true);
    expect(report.evidenceContract.phase36.runner).toBe(
      "scripts/run-phase-36-live-memory.ts",
    );
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/live-memory/phase-36/run-phase36-live",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-36/run-phase36-live/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
