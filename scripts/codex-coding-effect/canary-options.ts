import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  hasCliFlagStrict,
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "../cli-options";

const VALUE_FLAGS = new Set([
  "--auth-file",
  "--codex-binary",
  "--codex-model",
  "--npm-binary",
  "--output-dir",
  "--package-tarball",
  "--reasoning-effort",
  "--run-id",
  "--runtime-root",
  "--source-root",
  "--timeout-ms",
]);

const BOOLEAN_FLAGS = new Set(["--keep-runtime"]);

export interface CodexNativeCanaryOptions {
  authFile: string;
  codexBinary: string;
  codexModel: string;
  keepRuntime: boolean;
  npmBinary: string;
  outputDir: string;
  packageTarball: string;
  reasoningEffort?: string;
  runId: string;
  runOutputDir: string;
  runtimeRoot: string;
  sourceRoot: string;
  timeoutMs: number;
}

export interface CodexNativeCanaryOptionDefaults {
  cwd?: string;
  homeDir?: string;
  tmpDir?: string;
}

export function parseCodexNativeCanaryOptions(
  argv: readonly string[],
  defaults: CodexNativeCanaryOptionDefaults = {},
): CodexNativeCanaryOptions {
  assertKnownOptions(argv);
  const cwd = defaults.cwd ?? process.cwd();
  const homeDir = defaults.homeDir ?? homedir();
  const tempDir = defaults.tmpDir ?? tmpdir();
  const packageTarball = resolve(cwd, requireValue(
    resolveCliFlagValueStrict(argv, "--package-tarball"),
    "--package-tarball",
  ));
  if (!packageTarball.endsWith(".tgz")) {
    throw new Error("--package-tarball must point to a .tgz package artifact");
  }
  const runId = requireValue(
    resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
    "--run-id",
  );
  const codexModel = requireValue(
    resolveCliFlagValueStrict(argv, "--codex-model"),
    "--codex-model",
  );
  const outputDir = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--output-dir") ??
      join("reports", "eval", "research", "codex-coding-effect"),
  );
  const runOutputDir = join(outputDir, runId);
  const runtimeRoot = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--runtime-root") ??
      join(tempDir, "goodmemory-codex-coding-effect", runId, "native-canary"),
  );
  const authFile = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--auth-file") ??
      join(homeDir, ".codex", "auth.json"),
  );

  assertDisjoint("--runtime-root", runtimeRoot, "--package-tarball", packageTarball);
  assertDisjoint("--runtime-root", runtimeRoot, "--output-dir", runOutputDir);
  assertDisjoint("--output-dir", runOutputDir, "--package-tarball", packageTarball);
  assertDisjoint("--runtime-root", runtimeRoot, "--auth-file", authFile);
  assertDisjoint("--output-dir", runOutputDir, "--auth-file", authFile);

  const reasoningEffort = resolveCliFlagValueStrict(argv, "--reasoning-effort");
  return {
    authFile,
    codexBinary: resolveExecutableValue(
      resolveCliFlagValueStrict(argv, "--codex-binary") ?? "codex",
      cwd,
    ),
    codexModel,
    keepRuntime: hasCliFlagStrict(argv, "--keep-runtime"),
    npmBinary: resolveExecutableValue(
      resolveCliFlagValueStrict(argv, "--npm-binary") ?? "npm",
      cwd,
    ),
    outputDir,
    packageTarball,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    runId,
    runOutputDir,
    runtimeRoot,
    sourceRoot: resolve(
      cwd,
      resolveCliFlagValueStrict(argv, "--source-root") ?? cwd,
    ),
    timeoutMs: parseCliPositiveIntegerFlagStrict(argv, "--timeout-ms") ?? 900_000,
  };
}

function assertKnownOptions(argv: readonly string[]): void {
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === undefined) {
      return;
    }
    if (BOOLEAN_FLAGS.has(option)) {
      continue;
    }
    if (!VALUE_FLAGS.has(option)) {
      throw new Error(`unknown option ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${option} requires a value.`);
    }
    index += 1;
  }
}

function requireValue(value: string | undefined, flag: string): string {
  if (value === undefined) {
    throw new Error(`${flag} is required`);
  }
  return value;
}

function resolveExecutableValue(value: string, cwd: string): string {
  return value.includes("/") || value.includes("\\") ? resolve(cwd, value) : value;
}

function assertDisjoint(
  firstFlag: string,
  firstPath: string,
  secondFlag: string,
  secondPath: string,
): void {
  if (!pathsOverlap(firstPath, secondPath)) {
    return;
  }
  throw new Error(`${firstFlag} must not overlap ${secondFlag}`);
}

function pathsOverlap(firstPath: string, secondPath: string): boolean {
  return pathInsideOrEqual(firstPath, secondPath) ||
    pathInsideOrEqual(secondPath, firstPath);
}

function pathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath));
}
