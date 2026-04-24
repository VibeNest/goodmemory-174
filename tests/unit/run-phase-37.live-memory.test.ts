import { describe, expect, it } from "bun:test";
import {
  parsePhase37LiveMemoryCliOptions,
  resolvePhase37LiveMemoryOutputDir,
  runPhase37LiveMemoryEval,
} from "../../scripts/run-phase-37-live-memory";

describe("run-phase-37 live-memory script", () => {
  it("resolves the phase-37 live-memory output directory", () => {
    expect(resolvePhase37LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-37",
    );
  });

  it("parses phase-37 live-memory cli flags", () => {
    expect(
      parsePhase37LiveMemoryCliOptions([
        "bun",
        "run",
        "scripts/run-phase-37-live-memory.ts",
        "--output-dir",
        "/tmp/phase37-live",
        "--run-id",
        "run-phase37-live",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase37-live",
      runId: "run-phase37-live",
    });
  });

  it("writes a blocked report when provider credentials are unavailable", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase37LiveMemoryEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/live-memory/phase-37",
        runId: "run-phase37-live",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        env: {},
        now: () => "2026-04-24T10:20:45.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-37");
    expect(report.mode).toBe("live-memory");
    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.durableStorageProvider).toBe("sqlite");
    expect(report.evidence.providerBackedAssistedExtraction).toBe(false);
    expect(report.evidence.manualSeedUsed).toBe(false);
    expect(report.evidenceContract.phase37.runner).toBe(
      "scripts/run-phase-37-live-memory.ts",
    );
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/live-memory/phase-37/run-phase37-live",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-37/run-phase37-live/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });
});
