import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace } from "../../src/testing/utils";
import {
  collectTopFailurePaths,
  formatEvalSummary,
  loadEvalReport,
  resolveArgument,
  resolveRunDirectoryFromArgv,
  runSummaryFromArgv,
  summarizeRunDirectory,
} from "../../scripts/summarize-eval";

const ORIGINAL_CWD = process.cwd();

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
});

describe("summarize-eval script", () => {
  it("resolves inline arguments", () => {
    expect(resolveArgument(["bun", "scripts/summarize-eval.ts", "--mode=live"], "--mode")).toBe(
      "live",
    );
  });

  it("requires either an explicit run directory or --mode", async () => {
    await expect(
      resolveRunDirectoryFromArgv(["bun", "scripts/summarize-eval.ts"]),
    ).rejects.toThrow("Provide an explicit run directory or --mode=live|fallback");
  });

  it("resolves the latest run directory within the selected mode root", async () => {
    const workspace = await createTempWorkspace("goodmemory-summarize-eval");

    try {
      process.chdir(workspace.root);
      const liveRoot = join(workspace.root, "reports/eval/live");
      const fallbackRoot = join(workspace.root, "reports/eval/fallback");
      await mkdir(join(liveRoot, "run-001"), { recursive: true });
      await mkdir(join(liveRoot, "run-002"), { recursive: true });
      await mkdir(join(fallbackRoot, "run-003"), { recursive: true });
      await writeFile(
        join(liveRoot, "run-001", "report.json"),
        JSON.stringify({ mode: "live", runId: "run-001" }),
        "utf8",
      );
      await writeFile(
        join(liveRoot, "run-002", "report.json"),
        JSON.stringify({ mode: "live", runId: "run-002" }),
        "utf8",
      );

      expect(
        await resolveRunDirectoryFromArgv([
          "bun",
          "scripts/summarize-eval.ts",
          "--mode=live",
        ]),
      ).toBe(join("reports/eval/live", "run-002"));
    } finally {
      await workspace.cleanup();
    }
  });

  it("prefers an explicit run directory over mode selection", async () => {
    expect(
      await resolveRunDirectoryFromArgv([
        "bun",
        "scripts/summarize-eval.ts",
        "reports/eval/fallback/run-001",
        "--mode=live",
      ]),
    ).toBe("reports/eval/fallback/run-001");
  });

  it("loads reports, collects failure paths, and formats a full summary", async () => {
    const workspace = await createTempWorkspace("goodmemory-summarize-flow");

    try {
      process.chdir(workspace.root);
      const runDir = join(workspace.root, "reports/eval/fallback/run-001");
      await mkdir(join(runDir, "failures"), { recursive: true });
      await writeFile(
        join(runDir, "report.json"),
        JSON.stringify({
          mode: "fallback",
          runId: "run-001",
          summary: {
            totalCases: 4,
            winnerCounts: {
              baseline: 1,
              goodmemory: 2,
              tie: 1,
            },
            uplift: {
              identity_understanding: 0.5,
              history_continuation: 0.25,
              factual_alignment: 0.75,
              relevance: 0.1,
            },
          },
          runtime: {
            generationMode: "fallback",
            judgeMode: "fallback",
          },
        }),
        "utf8",
      );
      await writeFile(join(runDir, "failures", "b-case.json"), "{}", "utf8");
      await writeFile(join(runDir, "failures", "a-case.json"), "{}", "utf8");
      await writeFile(join(runDir, "failures", "summary.json"), "{}", "utf8");

      const report = await loadEvalReport(runDir);
      const failures = await collectTopFailurePaths(runDir);
      const formatted = formatEvalSummary(report, failures);
      const summary = await summarizeRunDirectory(runDir);

      expect(report.mode).toBe("fallback");
      expect(failures).toEqual([
        join(runDir, "failures", "a-case.json"),
        join(runDir, "failures", "b-case.json"),
      ]);
      expect(formatted).toContain("- Mode: `fallback`");
      expect(formatted).toContain("- Run: `run-001`");
      expect(formatted).toContain("generation=fallback, judge=fallback");
      expect(formatted).toContain("GoodMemory 2, Baseline 1, Tie 1");
      expect(formatted).toContain(join(runDir, "failures", "a-case.json"));
      expect(summary).toBe(formatted);
    } finally {
      await workspace.cleanup();
    }
  });

  it("runs the summary flow from argv", async () => {
    const workspace = await createTempWorkspace("goodmemory-summarize-main");

    try {
      process.chdir(workspace.root);
      const runDir = join(workspace.root, "reports/eval/live/run-123");
      await mkdir(runDir, { recursive: true });
      await writeFile(
        join(runDir, "report.json"),
        JSON.stringify({
          mode: "live",
          runId: "run-123",
          summary: {
            totalCases: 1,
            winnerCounts: {
              baseline: 0,
              goodmemory: 1,
              tie: 0,
            },
            uplift: {},
          },
          runtime: {
            generationMode: "live",
            judgeMode: "live",
          },
        }),
        "utf8",
      );

      const writes: string[] = [];
      const summary = await runSummaryFromArgv(
        ["bun", "scripts/summarize-eval.ts", "--mode=live"],
        (value) => writes.push(value),
      );

      expect(summary).toContain("- Mode: `live`");
      expect(writes).toEqual([summary]);
    } finally {
      await workspace.cleanup();
    }
  });
});
