import { describe, expect, it } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertUniqueWorkspacePaths,
  prepareIsolatedWorkspace,
  releaseIsolatedWorkspace,
} from "../../scripts/codex-coding-effect/workspace";
import type {
  CodexCodingEffectLogEvent,
} from "../../scripts/codex-coding-effect/logging";
import {
  createCodexCodingEffectLogger,
} from "../../scripts/codex-coding-effect/logging";
import { runBoundaryProcess } from "../../scripts/codex-coding-effect/process";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 5_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

async function createSourceRepository(root: string): Promise<{
  commit: string;
  path: string;
}> {
  const path = join(root, "source");
  await mkdir(path, { recursive: true });
  await git(path, "init", "--quiet");
  await writeFile(join(path, "value.txt"), "base\n", "utf8");
  await git(path, "add", "value.txt");
  await git(
    path,
    "-c",
    "user.name=GoodMemory Test",
    "-c",
    "user.email=goodmemory@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "base",
  );
  return { commit: await git(path, "rev-parse", "HEAD"), path };
}

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-codex-workspace-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Codex coding-effect workspace lifecycle", () => {
  it("creates a clean detached workspace at the exact source commit", async () => {
    await withRoot(async (root) => {
      const source = await createSourceRepository(root);
      const destination = join(root, "workspaces", "no-memory");
      const logs: CodexCodingEffectLogEvent[] = [];
      const logger = createCodexCodingEffectLogger({
        arm: "no-memory",
        attemptId: "attempt-001",
        episodeId: "episode-001",
        repetition: 1,
        runId: "run-c1",
        seed: 1,
        stageId: "stage-1",
        traceId: "trace-001",
      }, (event) => logs.push(event));

      const workspace = await prepareIsolatedWorkspace({
        destination,
        expectedCommit: source.commit,
        logger,
        sourceRepository: source.path,
      });

      expect(workspace).toEqual({
        commit: source.commit,
        path: destination,
        tree: await git(source.path, "rev-parse", `${source.commit}^{tree}`),
      });
      expect(await git(destination, "status", "--porcelain=v1", "--untracked-files=all"))
        .toBe("");
      expect(logs.map((event) => event.event)).toEqual(["workspace_prepared"]);

      await releaseIsolatedWorkspace({
        path: destination,
        sourceRepository: source.path,
      });
      await expect(access(destination)).rejects.toThrow();
    });
  });

  it("rejects a source commit mismatch before creating the workspace", async () => {
    await withRoot(async (root) => {
      const source = await createSourceRepository(root);
      const destination = join(root, "workspaces", "no-memory");

      await expect(prepareIsolatedWorkspace({
        destination,
        expectedCommit: "0".repeat(40),
        sourceRepository: source.path,
      })).rejects.toThrow("source repository HEAD does not match expected commit");
      await expect(access(destination)).rejects.toThrow();
    });
  });

  it("rejects a dirty source repository", async () => {
    await withRoot(async (root) => {
      const source = await createSourceRepository(root);
      await writeFile(join(source.path, "untracked.txt"), "dirty\n", "utf8");

      await expect(prepareIsolatedWorkspace({
        destination: join(root, "workspaces", "no-memory"),
        expectedCommit: source.commit,
        sourceRepository: source.path,
      })).rejects.toThrow("source repository must be clean");
    });
  });

  it("rejects path-equivalent sibling workspaces", () => {
    expect(() => assertUniqueWorkspacePaths([
      "/tmp/codex-effect/no-memory",
      "/tmp/codex-effect/nested/../no-memory",
    ])).toThrow("workspace paths must be unique");
  });

  it("honors keep-workspaces and later performs Git-owned cleanup", async () => {
    await withRoot(async (root) => {
      const source = await createSourceRepository(root);
      const destination = join(root, "workspaces", "goodmemory");
      await prepareIsolatedWorkspace({
        destination,
        expectedCommit: source.commit,
        sourceRepository: source.path,
      });

      await releaseIsolatedWorkspace({
        keep: true,
        path: destination,
        sourceRepository: source.path,
      });
      await access(destination);

      await releaseIsolatedWorkspace({
        path: destination,
        sourceRepository: source.path,
      });
      await expect(access(destination)).rejects.toThrow();
    });
  });

  it("removes a workspace whose base-health command fails", async () => {
    await withRoot(async (root) => {
      const source = await createSourceRepository(root);
      const destination = join(root, "workspaces", "bad-base");

      await expect(prepareIsolatedWorkspace({
        baseHealthCommand: [process.execPath, "-e", "process.exit(7)"],
        destination,
        expectedCommit: source.commit,
        sourceRepository: source.path,
      })).rejects.toThrow("base-health command failed with exit code 7");
      await expect(access(destination)).rejects.toThrow();
    });
  });
});
