import { lstat, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CodexCodingEffectLogger } from "./logging";
import { runBoundaryProcess } from "./process";

export interface IsolatedWorkspace {
  commit: string;
  path: string;
  tree: string;
}

export interface PrepareIsolatedWorkspaceInput {
  baseHealthCommand?: readonly string[];
  destination: string;
  expectedCommit: string;
  logger?: CodexCodingEffectLogger;
  sourceRepository: string;
}

export function assertUniqueWorkspacePaths(paths: readonly string[]): void {
  const resolved = new Set<string>();
  for (const path of paths) {
    const canonical = resolve(path);
    if (resolved.has(canonical)) {
      throw new Error("workspace paths must be unique");
    }
    resolved.add(canonical);
  }
}

export async function prepareIsolatedWorkspace(
  input: PrepareIsolatedWorkspaceInput,
): Promise<IsolatedWorkspace> {
  const sourceRepository = resolve(input.sourceRepository);
  const destination = resolve(input.destination);
  if (await pathExists(destination)) {
    throw new Error(`workspace destination already exists: ${destination}`);
  }

  const sourceHead = await runGit(sourceRepository, ["rev-parse", "HEAD"]);
  if (sourceHead !== input.expectedCommit) {
    throw new Error(
      "source repository HEAD does not match expected commit",
    );
  }
  const sourceStatus = await runGit(sourceRepository, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (sourceStatus.length > 0) {
    throw new Error("source repository must be clean");
  }

  await mkdir(dirname(destination), { recursive: true });
  await runGit(sourceRepository, [
    "worktree",
    "add",
    "--detach",
    destination,
    input.expectedCommit,
  ]);

  try {
    const commit = await runGit(destination, ["rev-parse", "HEAD"]);
    if (commit !== input.expectedCommit) {
      throw new Error("prepared workspace commit does not match expected commit");
    }
    const tree = await runGit(destination, ["rev-parse", "HEAD^{tree}"]);
    const workspaceStatus = await runGit(destination, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    if (workspaceStatus.length > 0) {
      throw new Error("prepared workspace must be clean");
    }

    if (input.baseHealthCommand !== undefined) {
      await runBaseHealthCommand(destination, input.baseHealthCommand);
    }

    input.logger?.("workspace_prepared", { commit, path: destination, tree });
    return { commit, path: destination, tree };
  } catch (error) {
    await releaseIsolatedWorkspace({
      path: destination,
      sourceRepository,
    });
    throw error;
  }
}

export async function releaseIsolatedWorkspace(input: {
  keep?: boolean;
  path: string;
  sourceRepository: string;
}): Promise<void> {
  if (input.keep) {
    return;
  }
  await runGit(resolve(input.sourceRepository), [
    "worktree",
    "remove",
    "--force",
    resolve(input.path),
  ]);
}

async function runBaseHealthCommand(
  cwd: string,
  command: readonly string[],
): Promise<void> {
  const executable = command[0];
  if (executable === undefined) {
    throw new Error("base-health command cannot be empty");
  }
  const result = await runBoundaryProcess({
    args: command.slice(1),
    cwd,
    executable,
    timeoutMs: 300_000,
  });
  if (result.spawnError !== undefined) {
    throw new Error(`base-health command failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error("base-health command timed out");
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `base-health command failed with exit code ${result.exitCode}`,
    );
  }
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 60_000,
  });
  if (result.spawnError !== undefined) {
    throw new Error(`git failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error(`git ${args[0] ?? "command"} timed out`);
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args[0] ?? "command"} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";
}
