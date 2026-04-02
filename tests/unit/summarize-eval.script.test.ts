import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace } from "../../src/testing/utils";
import {
  resolveArgument,
  resolveRunDirectoryFromArgv,
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
});
