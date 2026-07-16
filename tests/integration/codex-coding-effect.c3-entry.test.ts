import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runBoundaryProcess } from "../../scripts/codex-coding-effect/process";

describe("Codex coding-effect C3 pilot entry", () => {
  it("fails option validation before creating fixtures or launching Codex", async () => {
    const result = await runBoundaryProcess({
      args: [join(process.cwd(), "scripts/run-codex-coding-effect-c3-pilot.ts")],
      cwd: process.cwd(),
      executable: process.execPath,
      timeoutMs: 10_000,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("--package-tarball is required");
  });
});
