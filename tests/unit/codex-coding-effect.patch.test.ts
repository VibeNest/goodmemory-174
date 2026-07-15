import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  captureWorkspacePatch,
} from "../../scripts/codex-coding-effect/patch";
import { runBoundaryProcess } from "../../scripts/codex-coding-effect/process";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 5_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout.trim();
}

async function withRepository(
  run: (repository: string, baseCommit: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-codex-patch-"));
  const repository = join(root, "repository");
  try {
    await mkdir(join(repository, "src"), { recursive: true });
    await git(repository, "init", "--quiet");
    await writeFile(join(repository, "src", "value.txt"), "base\n", "utf8");
    await git(repository, "add", "src/value.txt");
    await git(
      repository,
      "-c",
      "user.name=GoodMemory Test",
      "-c",
      "user.email=goodmemory@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "base",
    );
    await run(repository, await git(repository, "rev-parse", "HEAD"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Codex coding-effect patch capture", () => {
  it("captures a tracked patch relative to the frozen stage commit", async () => {
    await withRepository(async (repository, baseCommit) => {
      await writeFile(join(repository, "src", "value.txt"), "fixed\n", "utf8");

      const patch = await captureWorkspacePatch({ baseCommit, workspace: repository });

      expect(patch.hasPatch).toBe(true);
      expect(patch.changedFiles).toEqual(["src/value.txt"]);
      expect(patch.forbiddenFiles).toEqual([]);
      expect(patch.diff).toContain("+fixed");
      expect(patch.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it("reports a clean workspace as no patch", async () => {
    await withRepository(async (repository, baseCommit) => {
      expect(await captureWorkspacePatch({
        baseCommit,
        workspace: repository,
      })).toMatchObject({
        changedFiles: [],
        diff: "",
        forbiddenFiles: [],
        hasPatch: false,
        sha256: null,
        untrackedFiles: [],
      });
    });
  });

  it("includes untracked-file solutions and their audit hashes", async () => {
    await withRepository(async (repository, baseCommit) => {
      await writeFile(join(repository, "src", "new-value.txt"), "new answer\n", "utf8");

      const patch = await captureWorkspacePatch({ baseCommit, workspace: repository });

      expect(patch.changedFiles).toEqual(["src/new-value.txt"]);
      expect(patch.diff).toContain("src/new-value.txt");
      expect(patch.diff).toContain("+new answer");
      expect(patch.untrackedFiles).toEqual([{
        path: "src/new-value.txt",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        size: 11,
      }]);
    });
  });

  it("hashes an untracked symlink itself instead of reading outside the workspace", async () => {
    await withRepository(async (repository, baseCommit) => {
      const linkTarget = "../evaluator-secret.txt";
      await writeFile(
        join(repository, "..", "evaluator-secret.txt"),
        "hidden evaluator contents\n",
        "utf8",
      );
      await symlink(linkTarget, join(repository, "solution-link"));

      const patch = await captureWorkspacePatch({ baseCommit, workspace: repository });

      expect(patch.diff).toContain("new file mode 120000");
      expect(patch.untrackedFiles).toEqual([{
        path: "solution-link",
        sha256: createHash("sha256").update(linkTarget).digest("hex"),
        size: Buffer.byteLength(linkTarget),
      }]);
    });
  });

  it("marks exact and directory-prefixed forbidden changes", async () => {
    await withRepository(async (repository, baseCommit) => {
      await mkdir(join(repository, "evaluator"), { recursive: true });
      await writeFile(join(repository, "evaluator", "hidden.test.ts"), "tampered\n");
      await writeFile(join(repository, "AGENTS.md"), "tampered\n");

      const patch = await captureWorkspacePatch({
        baseCommit,
        forbiddenPaths: ["AGENTS.md", "evaluator"],
        workspace: repository,
      });

      expect(patch.forbiddenFiles).toEqual([
        "AGENTS.md",
        "evaluator/hidden.test.ts",
      ]);
    });
  });
});
