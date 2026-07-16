import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  assertCliPathSegmentValue,
  hasCliFlagStrict,
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "../cli-options";
import {
  CODEX_CODING_EFFECT_ARMS,
  isCodexCodingEffectArm,
  isCodexCodingEffectEvidenceClass,
} from "./contracts";
import type {
  CodexCodingEffectArm,
  CodexCodingEffectEvidenceClass,
} from "./contracts";

const VALUE_FLAGS = new Set([
  "--arm",
  "--attempts-root",
  "--codex-model",
  "--dataset-root",
  "--episode-id",
  "--evidence-class",
  "--max-concurrency",
  "--network-mode",
  "--output-dir",
  "--package-tarball",
  "--reasoning-effort",
  "--repetition-count",
  "--run-id",
  "--seed",
  "--stage-timeout-ms",
  "--test-timeout-ms",
  "--workspace-root",
]);

const BOOLEAN_FLAGS = new Set([
  "--dry-run",
  "--keep-workspaces",
  "--resume",
]);

const NETWORK_MODES = [
  "disabled",
  "dependency-setup-only",
  "allowlisted",
] as const;

type NetworkMode = (typeof NETWORK_MODES)[number];

export interface CodexCodingEffectCliOptions {
  arms: CodexCodingEffectArm[];
  attemptsRoot: string;
  codexModel?: string;
  datasetRoot: string;
  dryRun: boolean;
  episodeIds: string[];
  evidenceClass: CodexCodingEffectEvidenceClass;
  keepWorkspaces: boolean;
  maxConcurrency: number;
  networkMode: NetworkMode;
  outputDir: string;
  packageTarball?: string;
  reasoningEffort?: string;
  repetitionCount: number;
  resume: boolean;
  runId: string;
  runOutputDir: string;
  seeds: number[];
  stageTimeoutMs: number;
  testTimeoutMs: number;
  workspaceRoot: string;
}

export function parseCodexCodingEffectCliOptions(
  argv: readonly string[],
): CodexCodingEffectCliOptions {
  assertKnownOptions(argv);

  const runId = requireValue(
    resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
    "--run-id",
  );
  const datasetRoot = resolve(requireValue(
    resolveCliFlagValueStrict(argv, "--dataset-root"),
    "--dataset-root",
  ));
  const evidenceClass = parseEvidenceClass(
    resolveCliFlagValueStrict(argv, "--evidence-class") ??
      "deterministic-smoke",
  );
  if (evidenceClass === "codex-coding-effect-accepted") {
    throw new Error(
      "codex-coding-effect-accepted is produced by the gate, not the runner",
    );
  }

  const outputDir = resolve(
    resolveCliFlagValueStrict(argv, "--output-dir") ??
      join(process.cwd(), "reports", "eval", "research", "codex-coding-effect"),
  );
  const runOutputDir = join(outputDir, runId);
  const runtimeRoot = join(tmpdir(), "goodmemory-codex-coding-effect", runId);
  const workspaceRoot = resolve(
    resolveCliFlagValueStrict(argv, "--workspace-root") ??
      join(runtimeRoot, "workspaces"),
  );
  const attemptsRoot = resolve(
    resolveCliFlagValueStrict(argv, "--attempts-root") ??
      join(runtimeRoot, "attempts"),
  );
  const packageTarballValue = resolveCliFlagValueStrict(
    argv,
    "--package-tarball",
  );
  const packageTarball = packageTarballValue === undefined
    ? undefined
    : resolve(packageTarballValue);
  const explicitArms = parseRepeatableStringFlag(argv, "--arm");
  const arms = explicitArms.length === 0
    ? defaultArms(evidenceClass)
    : explicitArms.map((arm) => {
      if (!isCodexCodingEffectArm(arm)) {
        throw new Error(
          `--arm must be one of ${CODEX_CODING_EFFECT_ARMS.join(", ")}.`,
        );
      }
      return arm;
    });
  const episodeIds = parseRepeatableStringFlag(argv, "--episode-id");
  for (const episodeId of episodeIds) {
    assertCliPathSegmentValue({ flag: "--episode-id", value: episodeId });
  }
  const seeds = parseRepeatablePositiveIntegers(argv, "--seed");
  const networkMode = parseNetworkMode(
    resolveCliFlagValueStrict(argv, "--network-mode") ?? "disabled",
  );
  const codexModel = resolveCliFlagValueStrict(argv, "--codex-model");
  const reasoningEffort = resolveCliFlagValueStrict(argv, "--reasoning-effort");

  validateArmCompatibility(evidenceClass, arms);
  validatePinnedLiveIdentity({
    codexModel,
    evidenceClass,
    packageTarball,
    reasoningEffort,
  });
  assertDisjointCliPaths("--output-dir", runOutputDir, "--dataset-root", datasetRoot);
  assertDisjointCliPaths("--output-dir", runOutputDir, "--workspace-root", workspaceRoot);
  assertDisjointCliPaths("--output-dir", runOutputDir, "--attempts-root", attemptsRoot);
  assertDisjointCliPaths("--workspace-root", workspaceRoot, "--attempts-root", attemptsRoot);
  assertDisjointCliPaths("--workspace-root", workspaceRoot, "--dataset-root", datasetRoot);
  assertDisjointCliPaths("--attempts-root", attemptsRoot, "--dataset-root", datasetRoot);
  if (packageTarball !== undefined) {
    assertDisjointCliPaths(
      "--output-dir",
      runOutputDir,
      "--package-tarball",
      packageTarball,
    );
    assertDisjointCliPaths(
      "--workspace-root",
      workspaceRoot,
      "--package-tarball",
      packageTarball,
    );
    assertDisjointCliPaths(
      "--attempts-root",
      attemptsRoot,
      "--package-tarball",
      packageTarball,
    );
  }

  return {
    arms,
    attemptsRoot,
    ...(codexModel === undefined ? {} : { codexModel }),
    datasetRoot,
    dryRun: hasCliFlagStrict(argv, "--dry-run"),
    episodeIds,
    evidenceClass,
    keepWorkspaces: hasCliFlagStrict(argv, "--keep-workspaces"),
    maxConcurrency:
      parseCliPositiveIntegerFlagStrict(argv, "--max-concurrency") ?? 1,
    networkMode,
    outputDir,
    packageTarball,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    repetitionCount:
      parseCliPositiveIntegerFlagStrict(argv, "--repetition-count") ?? 1,
    resume: hasCliFlagStrict(argv, "--resume"),
    runId,
    runOutputDir,
    seeds: seeds.length === 0 ? [1] : seeds,
    stageTimeoutMs:
      parseCliPositiveIntegerFlagStrict(argv, "--stage-timeout-ms") ?? 900_000,
    testTimeoutMs:
      parseCliPositiveIntegerFlagStrict(argv, "--test-timeout-ms") ?? 300_000,
    workspaceRoot,
  };
}

function validatePinnedLiveIdentity(input: {
  codexModel?: string;
  evidenceClass: CodexCodingEffectEvidenceClass;
  packageTarball?: string;
  reasoningEffort?: string;
}): void {
  if (input.evidenceClass === "deterministic-smoke") {
    return;
  }
  if (input.packageTarball === undefined) {
    throw new Error(`${input.evidenceClass} requires --package-tarball`);
  }
  if (!input.packageTarball.endsWith(".tgz")) {
    throw new Error("--package-tarball must point to a .tgz package artifact");
  }
  if (input.codexModel === undefined) {
    throw new Error(`${input.evidenceClass} requires --codex-model`);
  }
  if (input.reasoningEffort === undefined) {
    throw new Error(`${input.evidenceClass} requires --reasoning-effort`);
  }
}

function assertKnownOptions(argv: readonly string[]): void {
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === undefined) {
      break;
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

function parseRepeatableStringFlag(
  argv: readonly string[],
  flag: string,
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    if (value.trim().length === 0 || value.trim() !== value) {
      throw new Error(`${flag} cannot be empty or whitespace-padded.`);
    }
    if (!seen.has(value)) {
      values.push(value);
      seen.add(value);
    }
    index += 1;
  }
  return values;
}

function parseRepeatablePositiveIntegers(
  argv: readonly string[],
  flag: string,
): number[] {
  return parseRepeatableStringFlag(argv, flag).map((value) => {
    if (!/^[1-9]\d*$/u.test(value)) {
      throw new Error(`${flag} must be a positive integer.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${flag} must be a positive integer.`);
    }
    return parsed;
  });
}

function parseEvidenceClass(value: string): CodexCodingEffectEvidenceClass {
  if (!isCodexCodingEffectEvidenceClass(value)) {
    throw new Error(`invalid --evidence-class ${value}`);
  }
  return value;
}

function parseNetworkMode(value: string): NetworkMode {
  const mode = NETWORK_MODES.find((candidate) => candidate === value);
  if (mode === undefined) {
    throw new Error(`--network-mode must be one of ${NETWORK_MODES.join(", ")}.`);
  }
  return mode;
}

function defaultArms(
  evidenceClass: CodexCodingEffectEvidenceClass,
): CodexCodingEffectArm[] {
  if (evidenceClass === "host-canary") {
    return ["goodmemory-installed"];
  }
  if (evidenceClass === "codex-coding-effect-candidate") {
    return ["no-memory", "flat-summary", "goodmemory-installed"];
  }
  return ["no-memory", "goodmemory-installed"];
}

function validateArmCompatibility(
  evidenceClass: CodexCodingEffectEvidenceClass,
  arms: readonly CodexCodingEffectArm[],
): void {
  if (
    evidenceClass === "host-canary" &&
    (arms.length !== 1 || arms[0] !== "goodmemory-installed")
  ) {
    throw new Error(
      "host-canary runs require only the goodmemory-installed arm",
    );
  }

  if (evidenceClass === "codex-coding-effect-candidate") {
    for (const requiredArm of [
      "no-memory",
      "goodmemory-installed",
    ] as const) {
      if (!arms.includes(requiredArm)) {
        throw new Error(`claim-candidate runs require the ${requiredArm} arm`);
      }
    }
    if (!arms.includes("flat-summary")) {
      throw new Error("claim-candidate runs require the flat-summary arm");
    }
  }
}

function assertDisjointCliPaths(
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
  return pathIsInsideOrEqual(firstPath, secondPath) ||
    pathIsInsideOrEqual(secondPath, firstPath);
}

function pathIsInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath));
}

function requireValue<T>(value: T | undefined, flag: string): T {
  if (value === undefined) {
    throw new Error(`${flag} is required.`);
  }
  return value;
}
