import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertC3GoodMemorySourceClean,
  collectC3GoodMemorySourceProvenance,
} from "../../scripts/codex-coding-effect/c3-source-provenance";

describe("Codex coding-effect C3 source provenance", () => {
  it("persists only sanitized metadata for a clean source tree", async () => {
    const repositoryRoot = await createRepository();
    try {
      const collected = await collectC3GoodMemorySourceProvenance({
        repositoryRoot,
      });

      expect(collected.provenance).toMatchObject({
        commit: expect.stringMatching(/^[a-f0-9]{40}$/u),
        dirty: false,
        sourceStateSha256: createHash("sha256")
          .update(collected.sourceStateArtifactBytes)
          .digest("hex"),
        statusSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        trackedDiffSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        tree: expect.stringMatching(/^[a-f0-9]{40}$/u),
        untrackedFiles: [],
      });
      expect(collected.provenance.sourceStateBytes).toBe(
        Buffer.byteLength(collected.sourceStateArtifactBytes),
      );
      expect(collected.sourceStateArtifactBytes).not.toContain("tracked\n");
      expect(() => assertC3GoodMemorySourceClean(collected.provenance))
        .not.toThrow();
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("summarizes dirty files without persisting content and blocks C3 execution", async () => {
    const repositoryRoot = await createRepository();
    try {
      const trackedSecret = "PRIVATE_TRACKED_SECRET";
      const untrackedSecret = "PRIVATE_UNTRACKED_SECRET";
      await writeFile(join(repositoryRoot, "tracked.txt"), trackedSecret, "utf8");
      await writeFile(join(repositoryRoot, "untracked.txt"), untrackedSecret, "utf8");

      const collected = await collectC3GoodMemorySourceProvenance({
        repositoryRoot,
      });

      expect(collected.provenance.dirty).toBe(true);
      expect(collected.provenance.untrackedFiles).toEqual([{
        bytes: Buffer.byteLength(untrackedSecret),
        path: "untracked.txt",
        sha256: createHash("sha256").update(untrackedSecret).digest("hex"),
      }]);
      expect(collected.sourceStateArtifactBytes).not.toContain(trackedSecret);
      expect(collected.sourceStateArtifactBytes).not.toContain(untrackedSecret);
      expect(() => assertC3GoodMemorySourceClean(collected.provenance))
        .toThrow("C3 requires a clean GoodMemory source tree");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("rejects an untracked symlink instead of reading its external target", async () => {
    const repositoryRoot = await createRepository();
    try {
      await symlink("/etc/hosts", join(repositoryRoot, "outside-link"));

      await expect(collectC3GoodMemorySourceProvenance({ repositoryRoot }))
        .rejects.toThrow("untracked source path must be a regular file");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });
});

async function createRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "goodmemory-source-"));
  await runGit(repositoryRoot, ["init", "--quiet"]);
  await writeFile(join(repositoryRoot, "tracked.txt"), "tracked\n", "utf8");
  await runGit(repositoryRoot, ["add", "tracked.txt"]);
  await runGit(repositoryRoot, [
    "-c",
    "user.name=GoodMemory Test",
    "-c",
    "user.email=test@goodmemory.local",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  return repositoryRoot;
}

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim());
  }
}
