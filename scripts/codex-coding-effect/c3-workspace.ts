import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { runBoundaryProcess } from "./process";

export interface C3IsolatedClone {
  commit: string;
  gitDirectory: string;
  path: string;
  tree: string;
}

export async function prepareC3IsolatedClone(input: {
  destination: string;
  expectedCommit: string;
  sourceRepository: string;
}): Promise<C3IsolatedClone> {
  const destination = resolve(input.destination);
  const sourceRepository = resolve(input.sourceRepository);
  if (await pathExists(destination)) {
    throw new Error(`C3 clone destination already exists: ${destination}`);
  }
  if (await git(sourceRepository, ["rev-parse", "HEAD"]) !== input.expectedCommit) {
    throw new Error("C3 source repository HEAD does not match expected commit");
  }
  if (
    await git(sourceRepository, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]) !== ""
  ) {
    throw new Error("C3 source repository must be clean");
  }

  await mkdir(dirname(destination), { recursive: true });
  await git(sourceRepository, [
    "clone",
    "--quiet",
    "--no-local",
    "--no-checkout",
    "--",
    sourceRepository,
    destination,
  ]);
  await git(destination, ["checkout", "--quiet", "--detach", input.expectedCommit]);
  await git(destination, ["remote", "remove", "origin"]);

  const commit = await git(destination, ["rev-parse", "HEAD"]);
  const tree = await git(destination, ["rev-parse", "HEAD^{tree}"]);
  const canonicalDestination = await realpath(destination);
  const gitDirectory = await realpath(resolve(
    destination,
    await git(destination, ["rev-parse", "--git-dir"]),
  ));
  if (
    commit !== input.expectedCommit ||
    await git(destination, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]) !== "" ||
    !(await lstat(gitDirectory)).isDirectory() ||
    !pathInsideOrEqual(canonicalDestination, gitDirectory)
  ) {
    throw new Error("C3 isolated clone failed its snapshot boundary");
  }
  return { commit, gitDirectory, path: destination, tree };
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 60_000,
  });
  if (result.spawnError !== undefined) {
    throw new Error(`git ${args[0] ?? "command"} failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error(`git ${args[0] ?? "command"} timed out`);
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args[0] ?? "command"} failed with code ${String(result.exitCode)}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

function pathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const child = relative(resolve(parentPath), resolve(candidatePath));
  return child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
