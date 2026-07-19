import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const REQUIRED_CLI_ENTRYPOINTS = [
  "scripts/prepare-codex-coding-effect-c5-pilot.ts",
  "scripts/run-codex-coding-effect-c5-pilot.ts",
] as const;
const RUNTIME_CONFIG_PATHS = [
  "bun.lock",
  "bunfig.toml",
  "package.json",
  "tsconfig.json",
] as const;
const C5_CLI_ENTRYPOINT_PATTERN =
  /^(?:gate|prepare|project|run|verify)-codex-coding-effect-c5(?:-[a-z0-9-]+)?\.ts$/u;

export interface C5RunnerSourceFileState {
  bytes: number;
  path: string;
  sha256: string;
  sourceBase64: string;
}

export interface C5RunnerSourceState {
  aggregateSha256: string;
  files: C5RunnerSourceFileState[];
  schemaVersion: 2;
}

export interface C5CapturedRunnerSourceState {
  sourceStateArtifactBytes: string;
  state: C5RunnerSourceState;
}

export async function captureC5RunnerSourceState(
  input: { repositoryRoot?: string } = {},
): Promise<C5CapturedRunnerSourceState> {
  const repositoryRoot = resolve(input.repositoryRoot ?? resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  ));
  await requireDirectory(repositoryRoot, "repository root");
  const scriptsDirectory = join(repositoryRoot, "scripts");
  await requireDirectory(scriptsDirectory, "scripts");
  const entries = await readdir(scriptsDirectory, { withFileTypes: true });
  const entrypoints = entries
    .filter((entry) => entry.isFile() && C5_CLI_ENTRYPOINT_PATTERN.test(entry.name))
    .map((entry) => `scripts/${entry.name}`)
    .sort(compareStrings);
  for (const requiredPath of REQUIRED_CLI_ENTRYPOINTS) {
    if (!entrypoints.includes(requiredPath)) {
      throw new Error(`missing required C5 runner source entry ${requiredPath}`);
    }
  }

  const files = new Map<string, C5RunnerSourceFileState>();
  for (const path of RUNTIME_CONFIG_PATHS) {
    files.set(path, await collectFile(repositoryRoot, path));
  }
  const pending = [...entrypoints];
  while (pending.length > 0) {
    const relativePath = pending.shift()!;
    if (files.has(relativePath)) continue;
    const file = await collectFile(repositoryRoot, relativePath);
    files.set(relativePath, file);
    const source = Buffer.from(file.sourceBase64, "base64").toString("utf8");
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      if (!imported.fileName.startsWith(".")) continue;
      const resolved = await resolveImportedFile({
        importer: relativePath,
        repositoryRoot,
        specifier: imported.fileName,
      });
      if (!files.has(resolved) && !pending.includes(resolved)) pending.push(resolved);
    }
    pending.sort(compareStrings);
  }

  const orderedFiles = [...files.values()].sort(compareFiles);
  const aggregateSha256 = sha256(`${JSON.stringify(orderedFiles)}\n`);
  const state: C5RunnerSourceState = {
    aggregateSha256,
    files: orderedFiles,
    schemaVersion: 2,
  };
  return {
    sourceStateArtifactBytes: `${JSON.stringify(state, null, 2)}\n`,
    state,
  };
}

export function assertC5RunnerSourceStateIdentical(
  before: C5RunnerSourceState,
  after: C5RunnerSourceState,
): void {
  if (
    !validAggregate(before) ||
    !validAggregate(after) ||
    JSON.stringify(before) !== JSON.stringify(after)
  ) {
    throw new Error("C5 runner source changed during the live pilot");
  }
}

async function resolveImportedFile(input: {
  importer: string;
  repositoryRoot: string;
  specifier: string;
}): Promise<string> {
  const importerDirectory = dirname(join(
    input.repositoryRoot,
    ...input.importer.split("/"),
  ));
  const unresolved = resolve(importerDirectory, input.specifier);
  canonicalRelativePath(input.repositoryRoot, unresolved);
  const extension = extname(unresolved);
  const candidates = extension.length > 0
    ? [
        unresolved,
        ...(extension === ".js" || extension === ".mjs" || extension === ".cjs"
          ? [
              unresolved.slice(0, -extension.length) + ".ts",
              unresolved.slice(0, -extension.length) + ".tsx",
              unresolved.slice(0, -extension.length) + ".mts",
              unresolved.slice(0, -extension.length) + ".cts",
            ]
          : []),
      ]
    : [
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        `${unresolved}.mts`,
        `${unresolved}.cts`,
        `${unresolved}.js`,
        `${unresolved}.json`,
        join(unresolved, "index.ts"),
        join(unresolved, "index.tsx"),
        join(unresolved, "index.mts"),
        join(unresolved, "index.js"),
      ];
  for (const candidate of candidates) {
    try {
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) {
        throw new Error(
          `C5 runner source entries must not be symbolic links: ${canonicalRelativePath(
            input.repositoryRoot,
            candidate,
          )}`,
        );
      }
      if (info.isFile()) return canonicalRelativePath(input.repositoryRoot, candidate);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
  throw new Error(
    `missing imported C5 runner source ${input.specifier} from ${input.importer}`,
  );
}

async function collectFile(
  repositoryRoot: string,
  relativePath: string,
): Promise<C5RunnerSourceFileState> {
  const sourcePath = join(repositoryRoot, ...relativePath.split("/"));
  let info;
  try {
    info = await lstat(sourcePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`missing required C5 runner source entry ${relativePath}`);
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(
      `C5 runner source entries must not be symbolic links: ${relativePath}`,
    );
  }
  if (!info.isFile()) {
    throw new Error(`C5 runner source entry must be a regular file: ${relativePath}`);
  }
  const canonicalPath = canonicalRelativePath(repositoryRoot, sourcePath);
  const content = await readFile(sourcePath);
  return {
    bytes: content.byteLength,
    path: canonicalPath,
    sha256: sha256(content),
    sourceBase64: content.toString("base64"),
  };
}

async function requireDirectory(path: string, label: string): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`missing required C5 runner source entry ${label}`);
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(`C5 runner source entries must not be symbolic links: ${label}`);
  }
  if (!info.isDirectory()) {
    throw new Error(`C5 runner source entry must be a directory: ${label}`);
  }
}

function canonicalRelativePath(repositoryRoot: string, sourcePath: string): string {
  const path = relative(repositoryRoot, sourcePath);
  if (
    path.length === 0 ||
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path)
  ) {
    throw new Error("C5 runner source entry escapes the repository");
  }
  return path.split(sep).join("/");
}

function validAggregate(state: C5RunnerSourceState): boolean {
  return state.schemaVersion === 2 &&
    state.files.every((file) => {
      const bytes = Buffer.from(file.sourceBase64, "base64");
      return bytes.toString("base64") === file.sourceBase64 &&
        bytes.byteLength === file.bytes &&
        sha256(bytes) === file.sha256;
    }) &&
    state.aggregateSha256 === sha256(`${JSON.stringify(state.files)}\n`);
}

function compareFiles(
  first: C5RunnerSourceFileState,
  second: C5RunnerSourceFileState,
): number {
  return compareStrings(first.path, second.path);
}

function compareStrings(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
