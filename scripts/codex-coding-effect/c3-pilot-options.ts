import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "../cli-options";

const VALUE_FLAGS = new Set([
  "--auth-file",
  "--bun-binary",
  "--codex-binary",
  "--codex-model",
  "--fixture-root",
  "--npm-binary",
  "--output-dir",
  "--package-tarball",
  "--reasoning-effort",
  "--run-id",
  "--runtime-root",
  "--stage-timeout-ms",
  "--test-timeout-ms",
  "--workspace-root",
]);

export interface CodexC3PilotOptions {
  authFile: string;
  bunBinary: string;
  codexBinary: string;
  codexModel: string;
  fixtureRoot: string;
  npmBinary: string;
  outputDir: string;
  packageTarball: string;
  reasoningEffort: string;
  runId: string;
  runOutputDir: string;
  runtimeRoot: string;
  stageTimeoutMs: number;
  testTimeoutMs: number;
  workspaceRoot: string;
}

export interface CodexC3PilotOptionDefaults {
  bunBinary?: string;
  cwd?: string;
  homeDir?: string;
}

export function parseCodexC3PilotOptions(
  argv: readonly string[],
  defaults: CodexC3PilotOptionDefaults = {},
): CodexC3PilotOptions {
  assertKnownOptions(argv);
  const cwd = defaults.cwd ?? process.cwd();
  const homeDir = defaults.homeDir ?? homedir();
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
  const reasoningEffort = requireValue(
    resolveCliFlagValueStrict(argv, "--reasoning-effort"),
    "--reasoning-effort",
  );
  const outputDir = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--output-dir") ??
      join("reports", "eval", "research", "codex-coding-effect"),
  );
  const runOutputDir = join(outputDir, runId);
  const defaultRoot = join(
    homeDir,
    ".goodmemory-eval",
    "codex-coding-effect",
    runId,
    "c3-pilot",
  );
  const runtimeRoot = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--runtime-root") ??
      join(defaultRoot, "runtime"),
  );
  const workspaceRoot = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--workspace-root") ??
      join(defaultRoot, "workspaces"),
  );
  const fixtureRoot = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--fixture-root") ??
      join(defaultRoot, "fixture"),
  );
  const authFile = resolve(
    cwd,
    resolveCliFlagValueStrict(argv, "--auth-file") ??
      join(homeDir, ".codex", "auth.json"),
  );

  assertDisjoint("--runtime-root", runtimeRoot, "--package-tarball", packageTarball);
  assertDisjoint("--workspace-root", workspaceRoot, "--package-tarball", packageTarball);
  assertDisjoint("--fixture-root", fixtureRoot, "--package-tarball", packageTarball);
  assertDisjoint("--output-dir", runOutputDir, "--package-tarball", packageTarball);
  assertDisjoint("--runtime-root", runtimeRoot, "--workspace-root", workspaceRoot);
  assertDisjoint("--runtime-root", runtimeRoot, "--fixture-root", fixtureRoot);
  assertDisjoint("--workspace-root", workspaceRoot, "--fixture-root", fixtureRoot);
  assertDisjoint("--output-dir", runOutputDir, "--runtime-root", runtimeRoot);
  assertDisjoint("--output-dir", runOutputDir, "--workspace-root", workspaceRoot);
  assertDisjoint("--output-dir", runOutputDir, "--fixture-root", fixtureRoot);
  assertDisjoint("--auth-file", authFile, "--runtime-root", runtimeRoot);
  assertDisjoint("--auth-file", authFile, "--workspace-root", workspaceRoot);
  assertDisjoint("--auth-file", authFile, "--fixture-root", fixtureRoot);
  assertDisjoint("--auth-file", authFile, "--output-dir", runOutputDir);

  return {
    authFile,
    bunBinary: resolveExecutableValue(
      resolveCliFlagValueStrict(argv, "--bun-binary") ??
        defaults.bunBinary ?? process.execPath,
      cwd,
    ),
    codexBinary: resolveExecutableValue(
      resolveCliFlagValueStrict(argv, "--codex-binary") ?? "codex",
      cwd,
    ),
    codexModel,
    fixtureRoot,
    npmBinary: resolveExecutableValue(
      resolveCliFlagValueStrict(argv, "--npm-binary") ?? "npm",
      cwd,
    ),
    outputDir,
    packageTarball,
    reasoningEffort,
    runId,
    runOutputDir,
    runtimeRoot,
    stageTimeoutMs:
      parseCliPositiveIntegerFlagStrict(argv, "--stage-timeout-ms") ?? 900_000,
    testTimeoutMs:
      parseCliPositiveIntegerFlagStrict(argv, "--test-timeout-ms") ?? 300_000,
    workspaceRoot,
  };
}

function assertKnownOptions(argv: readonly string[]): void {
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === undefined) {
      return;
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
  return value.includes("/") || value.includes("\\")
    ? resolve(cwd, value)
    : value;
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
