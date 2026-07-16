import { describe, expect, it } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import {
  prepareC3IsolatedClone,
} from "../../scripts/codex-coding-effect/c3-workspace";
import { runBoundaryProcess } from "../../scripts/codex-coding-effect/process";

describe("Codex coding-effect C3 isolated workspace", () => {
  it("copies each agent snapshot into an independent local Git database", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-clone-"));
    const sourceRepository = join(root, "source");
    const firstPath = join(root, "first");
    const secondPath = join(root, "second");
    try {
      await mkdir(sourceRepository);
      await writeFile(join(sourceRepository, "AGENTS.md"), "# C3 fixture\n", "utf8");
      await git(sourceRepository, "init", "--quiet");
      await git(sourceRepository, "add", ".");
      await git(
        sourceRepository,
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=C3 Fixture",
        "-c",
        "user.email=c3@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      );
      const commit = await git(sourceRepository, "rev-parse", "HEAD");

      const first = await prepareC3IsolatedClone({
        destination: firstPath,
        expectedCommit: commit,
        sourceRepository,
      });
      const second = await prepareC3IsolatedClone({
        destination: secondPath,
        expectedCommit: commit,
        sourceRepository,
      });

      expect(first).toMatchObject({ commit, path: resolve(firstPath) });
      expect(second).toMatchObject({ commit, path: resolve(secondPath) });
      expect((await lstat(join(firstPath, ".git"))).isDirectory()).toBe(true);
      expect((await lstat(join(secondPath, ".git"))).isDirectory()).toBe(true);
      expect(pathInside(await realpath(firstPath), first.gitDirectory)).toBe(true);
      expect(pathInside(await realpath(secondPath), second.gitDirectory)).toBe(true);
      expect(first.gitDirectory).not.toBe(second.gitDirectory);
      expect(await git(sourceRepository, "status", "--porcelain=v1"))
        .toBe("");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function pathInside(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate));
  return child === "" ||
    (!child.startsWith(`..${sep}`) && child !== "..");
}
