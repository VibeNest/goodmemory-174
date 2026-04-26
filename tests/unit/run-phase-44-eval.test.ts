import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  buildPhase44FallbackRunId,
  parsePhase44EvalCliOptions,
  resolvePhase44FallbackOutputDir,
  runPhase44FallbackEval,
} from "../../scripts/run-phase-44-eval";

describe("run-phase-44 eval script", () => {
  it("resolves the phase-44 deterministic output directory", () => {
    expect(resolvePhase44FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-44",
    );
  });

  it("builds a deterministic phase-44 run id", () => {
    expect(buildPhase44FallbackRunId("2026-04-26T15:30:00.000Z")).toBe(
      "run-20260426153000",
    );
  });

  it("parses phase-44 eval cli flags", () => {
    expect(
      parsePhase44EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-44-eval.ts",
        "--output-dir",
        "/tmp/phase44",
        "--run-id",
        "run-phase44",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase44",
      runId: "run-phase44",
    });
  });

  it("writes an accepted local viewer report", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-phase44-eval-"));
    try {
      const report = await runPhase44FallbackEval(
        {
          outputDir: join(root, "reports/eval/fallback/phase-44"),
          runId: "run-phase44-test",
        },
        {
          now: () => "2026-04-26T15:30:00.000Z",
          readTextFile: async (path) => {
            if (path.endsWith("src/index.ts")) {
              return "export { createGoodMemory } from './api/createGoodMemory';";
            }
            if (path.endsWith("package.json")) {
              return JSON.stringify({ exports: {}, files: ["src"] });
            }
            throw new Error(`Unexpected path: ${path}`);
          },
        },
      );
      const written = JSON.parse(
        await readFile(join(report.runDirectory, "report.json"), "utf8"),
      ) as typeof report;

      expect(report.phase).toBe("phase-44");
      expect(report.acceptance.decision).toBe("accepted");
      expect(report.summary).toEqual({
        passCount: 11,
        totalChecks: 11,
      });
      expect(Object.values(report.cases).every(Boolean)).toBe(true);
      expect(JSON.stringify(report)).not.toContain("raw phase44 transcript");
      expect(JSON.stringify(report)).not.toContain("phase44@example.com");
      expect(JSON.stringify(report)).not.toContain("sk-phase44secret");
      expect(written).toEqual(report);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
