import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "../..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/list-scenario-gates.ts");
const NARROW_GATE_ID_PATTERN = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/u;

async function runListScenarioGates(args: string[] = []): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  const proc = Bun.spawn([process.execPath, "run", SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    exitCode,
    stderr: stderr.trim(),
    stdout: stdout.trim(),
  };
}

describe("list-scenario-gates script", () => {
  it("prints a comma-separated narrow-gate id list by default", async () => {
    const result = await runListScenarioGates();
    const ids = result.stdout.split(",");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(ids.every((id) => NARROW_GATE_ID_PATTERN.test(id))).toBe(true);
  });

  it("prints one narrow-gate id per stdout line in pretty mode", async () => {
    const result = await runListScenarioGates(["--pretty"]);
    const ids = result.stdout.split("\n");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(",");
    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(ids.every((id) => NARROW_GATE_ID_PATTERN.test(id))).toBe(true);
  });
});
