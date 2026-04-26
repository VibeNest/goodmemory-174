import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import {
  buildPhase435FallbackRunId,
  parsePhase435EvalCliOptions,
  resolvePhase435FallbackOutputDir,
  runPhase435FallbackEval,
} from "../../scripts/run-phase-43-5-eval";

describe("run-phase-43-5 eval script", () => {
  it("resolves the phase-43-5 deterministic output directory", () => {
    expect(resolvePhase435FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-43-5",
    );
  });

  it("builds a deterministic phase-43-5 run id", () => {
    expect(buildPhase435FallbackRunId("2026-04-26T13:30:00.000Z")).toBe(
      "run-20260426133000",
    );
  });

  it("parses phase-43-5 eval cli flags", () => {
    expect(
      parsePhase435EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-43-5-eval.ts",
        "--output-dir",
        "/tmp/phase435",
        "--run-id",
        "run-phase435",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase435",
      runId: "run-phase435",
    });
  });

  it("writes an accepted optional worker report", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-phase435-eval-"));
    try {
      const report = await runPhase435FallbackEval({
        outputDir: join(root, "reports/eval/fallback/phase-43-5"),
        runId: "run-phase435-test",
      }, {
        now: () => "2026-04-26T13:30:00.000Z",
        readTextFile: async (path) => (
          path.endsWith("src/index.ts")
            ? "export { createGoodMemory } from './api/createGoodMemory';"
            : ""
        ),
      });
      const written = JSON.parse(
        await readFile(join(report.runDirectory, "report.json"), "utf8"),
      ) as typeof report;

      expect(report.phase).toBe("phase-43-5");
      expect(report.acceptance.decision).toBe("accepted");
      expect(report.summary).toEqual({
        passCount: 8,
        totalChecks: 8,
      });
      expect(Object.values(report.cases).every(Boolean)).toBe(true);
      expect(JSON.stringify(report)).not.toContain("phase435@example.com");
      expect(JSON.stringify(report)).not.toContain("sk-phase435secret");
      expect(written).toEqual(report);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("can regenerate the same run id without stale queue state", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-phase435-eval-"));
    try {
      const options = {
        outputDir: join(root, "reports/eval/fallback/phase-43-5"),
        runId: "run-phase435-test",
      };
      const dependencies = {
        now: () => "2026-04-26T13:30:00.000Z",
        readTextFile: async () => "export { createGoodMemory } from './api/createGoodMemory';",
      };

      const first = await runPhase435FallbackEval(options, dependencies);
      const second = await runPhase435FallbackEval(options, dependencies);

      expect(first.acceptance.decision).toBe("accepted");
      expect(second.acceptance.decision).toBe("accepted");
      expect(second.summary).toEqual({
        passCount: 8,
        totalChecks: 8,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
