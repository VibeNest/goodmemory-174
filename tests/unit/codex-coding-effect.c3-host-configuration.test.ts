import { describe, expect, it } from "bun:test";

import {
  normalizeC3PathForEvidence,
} from "../../scripts/codex-coding-effect/c3-host-configuration";

describe("Codex coding-effect C3 host configuration", () => {
  it("removes unmatched absolute host paths from trackable evidence", () => {
    const normalized = normalizeC3PathForEvidence(
      "/Users/alice/.bun/bin:/usr/bin:/bin",
      [],
    );

    expect(normalized).toBe("<host-path>");
    expect(normalized).not.toContain("/Users/alice");
    expect(normalized).not.toContain(".bun");
  });

  it("preserves declared runtime placeholders without retaining other host paths", () => {
    expect(normalizeC3PathForEvidence(
      "/private/c3/package/bin:/Users/alice/.bun/bin:/usr/bin",
      [["/private/c3/package", "<package-prefix>"]],
    )).toBe("<package-prefix>/bin:<host-path>");
  });
});
