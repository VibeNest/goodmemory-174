import { describe, expect, it } from "bun:test";
import { resolveRepoRootFromScriptUrl } from "../../scripts/script-paths";

describe("script path helpers", () => {
  it("decodes percent-encoded checkout paths into filesystem paths", () => {
    expect(
      resolveRepoRootFromScriptUrl(
        "file:///Users/hjqcan/Documents/Good%20Momery/scripts/run-phase-20-gate.ts",
      ),
    ).toBe("/Users/hjqcan/Documents/Good Momery");
  });

  it("resolves the repository root from a script file URL", () => {
    expect(
      resolveRepoRootFromScriptUrl(
        "file:///tmp/goodmemory/scripts/run-phase-20-gate.ts",
      ),
    ).toBe("/tmp/goodmemory");
  });
});
