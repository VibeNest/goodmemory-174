import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  projectC3RunEvidence,
} from "../../scripts/codex-coding-effect/c3-projection";

describe("Codex coding-effect C3 projection", () => {
  it("rejects a projection directory inside the raw evidence tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-projection-"));
    const rawRunDirectory = join(root, "raw");
    try {
      await mkdir(rawRunDirectory);

      await expect(projectC3RunEvidence({
        outputDirectory: join(rawRunDirectory, "projection"),
        rawRunDirectory,
      })).rejects.toThrow(
        "C3 projection directory must not overlap the raw run directory",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
