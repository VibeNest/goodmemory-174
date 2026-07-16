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

  it("does not replace a host path that only shares a configured prefix", () => {
    const normalized = normalizeC3PathForEvidence(
      "/workspace-backup/bin:/workspace/bin",
      [["/workspace", "<workspace>"]],
    );

    expect(normalized).toBe("<host-path>:<workspace>/bin");
    expect(normalized).not.toContain("<workspace>-backup");
    expect(normalized).not.toContain("/workspace-backup");
  });
});
