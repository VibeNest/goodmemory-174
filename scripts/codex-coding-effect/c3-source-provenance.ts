import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface C3GoodMemorySourceProvenance {
  commit: string;
  dirty: boolean;
  dirtyStateBytes: number;
  dirtyStateSha256: string;
  sourceStateBytes: number;
  sourceStateSha256: string;
  statusSha256: string;
  trackedDiffSha256: string;
  tree: string;
  untrackedFiles: Array<{
    bytes: number;
    path: string;
    sha256: string;
  }>;
}

export interface C3CollectedSourceProvenance {
  dirtyStateArtifactBytes: string;
  provenance: C3GoodMemorySourceProvenance;
  sourceStateArtifactBytes: string;
}

export async function collectC3GoodMemorySourceProvenance(
  input: { repositoryRoot?: string } = {},
): Promise<C3CollectedSourceProvenance> {
  const repositoryRoot = resolve(input.repositoryRoot ?? resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  ));
  const repositoryRealRoot = await realpath(repositoryRoot);
  const [commit, status, trackedDiff, tree, untrackedRaw] = await Promise.all([
    runGit(repositoryRoot, ["rev-parse", "HEAD"]),
    runGit(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]),
    runGit(repositoryRoot, ["diff", "--binary", "HEAD", "--"]),
    runGit(repositoryRoot, ["rev-parse", "HEAD^{tree}"]),
    runGit(repositoryRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]),
  ]);
  const untrackedPaths = untrackedRaw.split("\0").filter((path) => path.length > 0);
  const untrackedArtifacts = await Promise.all(untrackedPaths.map(async (path) => {
    const sourcePath = resolve(repositoryRoot, path);
    if (!pathInsideOrEqual(repositoryRoot, sourcePath)) {
      throw new Error(`untracked source path escapes repository: ${path}`);
    }
    const sourceStats = await lstat(sourcePath);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      throw new Error(`untracked source path must be a regular file: ${path}`);
    }
    const sourceRealPath = await realpath(sourcePath);
    if (!pathInsideOrEqual(repositoryRealRoot, sourceRealPath)) {
      throw new Error(`untracked source path escapes repository: ${path}`);
    }
    const content = await readFile(sourceRealPath);
    return {
      bytes: content.byteLength,
      path,
      sha256: sha256(content),
    };
  }));
  const sourceStateArtifactBytes = `${JSON.stringify({
    dirty: status.length > 0,
    schemaVersion: 1,
    statusBytes: Buffer.byteLength(status),
    statusSha256: sha256(status),
    trackedDiffBytes: Buffer.byteLength(trackedDiff),
    trackedDiffSha256: sha256(trackedDiff),
    untrackedFiles: untrackedArtifacts,
  }, null, 2)}\n`;
  const sourceStateSha256 = sha256(sourceStateArtifactBytes);
  return {
    dirtyStateArtifactBytes: sourceStateArtifactBytes,
    provenance: {
      commit: commit.trim(),
      dirty: status.length > 0,
      dirtyStateBytes: Buffer.byteLength(sourceStateArtifactBytes),
      dirtyStateSha256: sourceStateSha256,
      sourceStateBytes: Buffer.byteLength(sourceStateArtifactBytes),
      sourceStateSha256,
      statusSha256: sha256(status),
      trackedDiffSha256: sha256(trackedDiff),
      tree: tree.trim(),
      untrackedFiles: untrackedArtifacts.map(({ bytes, path, sha256 }) => ({
        bytes,
        path,
        sha256,
      })),
    },
    sourceStateArtifactBytes,
  };
}

export function assertC3GoodMemorySourceClean(
  provenance: C3GoodMemorySourceProvenance,
): void {
  if (provenance.dirty || provenance.untrackedFiles.length > 0) {
    throw new Error("C3 requires a clean GoodMemory source tree");
  }
}

function pathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const child = relative(parentPath, candidatePath);
  return child.length === 0 ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const child = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`failed to capture GoodMemory source provenance: ${stderr.trim()}`);
  }
  return stdout;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
