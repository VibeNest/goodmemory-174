import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";

import type { CodexCodingEffectLogger } from "./logging";
import { runBoundaryProcess } from "./process";

export interface UntrackedFileEvidence {
  path: string;
  sha256: string;
  size: number;
}

export interface WorkspacePatch {
  baseCommit: string;
  changedFiles: string[];
  diff: string;
  forbiddenFiles: string[];
  hasPatch: boolean;
  sha256: string | null;
  untrackedFiles: UntrackedFileEvidence[];
}

export async function applyWorkspacePatch(input: {
  logger?: CodexCodingEffectLogger;
  patch: WorkspacePatch;
  workspace: string;
}): Promise<void> {
  if (input.patch.hasPatch) {
    const result = await runBoundaryProcess({
      args: ["apply", "--binary", "--whitespace=nowarn", "-"],
      cwd: input.workspace,
      executable: "git",
      stdin: input.patch.diff,
      timeoutMs: 60_000,
    });
    if (
      result.spawnError !== undefined ||
      result.timedOut ||
      result.exitCode !== 0
    ) {
      throw new Error(
        `failed to apply captured patch in evaluator workspace: ${result.stderr.trim()}`,
      );
    }
  }

  const applied = await captureWorkspacePatch({
    baseCommit: input.patch.baseCommit,
    workspace: input.workspace,
  });
  if (
    applied.sha256 !== input.patch.sha256 ||
    JSON.stringify(applied.changedFiles) !==
      JSON.stringify(input.patch.changedFiles)
  ) {
    throw new Error("evaluator workspace does not reproduce the captured patch");
  }
  input.logger?.("patch_applied_for_evaluation", {
    changedFileCount: applied.changedFiles.length,
    hasPatch: applied.hasPatch,
    sha256: applied.sha256,
  });
}

export async function captureWorkspacePatch(input: {
  baseCommit: string;
  forbiddenPaths?: readonly string[];
  logger?: CodexCodingEffectLogger;
  workspace: string;
}): Promise<WorkspacePatch> {
  const head = (await runGit(input.workspace, ["rev-parse", "HEAD"])).trim();
  if (head !== input.baseCommit) {
    throw new Error("workspace HEAD changed from the frozen stage commit");
  }

  const trackedFiles = parseNullSeparated(await runGit(input.workspace, [
    "diff",
    "--name-only",
    "-z",
    input.baseCommit,
    "--",
  ]));
  const untrackedPaths = parseNullSeparated(await runGit(input.workspace, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]));
  const changedFiles = [...new Set([...trackedFiles, ...untrackedPaths])]
    .sort((left, right) => left.localeCompare(right));
  const trackedDiff = await runGit(input.workspace, [
    "diff",
    "--binary",
    "--full-index",
    input.baseCommit,
    "--",
  ]);
  const untrackedDiffs: string[] = [];
  const untrackedFiles: UntrackedFileEvidence[] = [];
  for (const path of untrackedPaths) {
    const bytes = await readUntrackedFileBytes(join(input.workspace, path));
    untrackedFiles.push({
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.byteLength,
    });
    const result = await runBoundaryProcess({
      args: ["diff", "--no-index", "--binary", "--", "/dev/null", path],
      cwd: input.workspace,
      executable: "git",
      timeoutMs: 60_000,
    });
    if (result.spawnError !== undefined || result.timedOut || result.exitCode !== 1) {
      throw new Error(`failed to capture untracked patch for ${path}`);
    }
    untrackedDiffs.push(result.stdout);
  }

  const diff = [trackedDiff, ...untrackedDiffs].join("");
  const forbiddenFiles = changedFiles.filter((path) =>
    (input.forbiddenPaths ?? []).some((forbiddenPath) =>
      path === forbiddenPath || path.startsWith(`${forbiddenPath}/`)
    )
  );
  const hasPatch = changedFiles.length > 0;
  const patch: WorkspacePatch = {
    baseCommit: input.baseCommit,
    changedFiles,
    diff,
    forbiddenFiles,
    hasPatch,
    sha256: hasPatch
      ? createHash("sha256").update(diff).digest("hex")
      : null,
    untrackedFiles,
  };
  input.logger?.("patch_captured", {
    changedFileCount: changedFiles.length,
    forbiddenFileCount: forbiddenFiles.length,
    hasPatch,
    sha256: patch.sha256,
    untrackedFileCount: untrackedFiles.length,
  });
  return patch;
}

async function readUntrackedFileBytes(path: string): Promise<Uint8Array> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) {
    return Buffer.from(await readlink(path), "utf8");
  }
  if (!stats.isFile()) {
    throw new Error(`unsupported untracked file type: ${path}`);
  }
  return readFile(path);
}

function parseNullSeparated(value: string): string[] {
  return value.split("\0").filter((path) => path.length > 0);
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
  return result.stdout;
}
