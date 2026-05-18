import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  BEAM_FULL_DATA_FILES,
  BEAM_SMOKE_DATA_FILES,
  normalizeBeamProfileList,
  type BeamMode,
  type BeamProfile,
} from "../src/eval/beam";

export interface Phase63CliOptions {
  benchmarkRoot?: string;
  caseIds?: readonly string[];
  limit?: number;
  mode: BeamMode;
  offset?: number;
  outputDir?: string;
  profiles?: readonly string[];
  questionTypes?: readonly string[];
  runId?: string;
  scale?: "100K" | "500K" | "1M" | "10M" | "unknown";
}

export interface Phase63ReadinessCheck {
  detail: string;
  key: string;
  missing: string[];
  status: "missing" | "ok";
}

export interface Phase63ReadinessReport {
  benchmarkRoot: string;
  candidateDataFiles: string[];
  checks: Phase63ReadinessCheck[];
  missing: string[];
  mode: BeamMode;
  profiles: BeamProfile[];
  ready: boolean;
}

export interface Phase63ReadinessDependencies {
  fileExists?: (path: string) => boolean;
}

export function resolvePhase63FixtureRoot(root: string): string {
  return join(root, "fixtures/external-benchmarks/beam");
}

export function resolvePhase63BenchmarkRoot(
  root: string,
  smoke: boolean,
): string {
  return smoke
    ? resolvePhase63FixtureRoot(root)
    : (process.env.GOODMEMORY_BEAM_ROOT ?? resolvePhase63FixtureRoot(root));
}

export function resolvePhase63OutputDir(root: string): string {
  return join(root, "reports/eval/research/phase-63/beam");
}

export function resolvePhase63DataFileCandidates(input: {
  benchmarkRoot: string;
  mode: BeamMode;
}): string[] {
  const names = input.mode === "smoke" ? BEAM_SMOKE_DATA_FILES : BEAM_FULL_DATA_FILES;
  return names.map((name) => join(input.benchmarkRoot, name));
}

export function checkPhase63Readiness(
  options: Pick<Phase63CliOptions, "benchmarkRoot" | "mode" | "profiles">,
  dependencies: Phase63ReadinessDependencies = {},
): Phase63ReadinessReport {
  const fileExists = dependencies.fileExists ?? existsSync;
  const benchmarkRoot = options.benchmarkRoot ?? process.env.GOODMEMORY_BEAM_ROOT;
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 63 readiness check requires --benchmark-root or GOODMEMORY_BEAM_ROOT.",
    );
  }

  const profiles = normalizeBeamProfileList(options.profiles);
  const candidateDataFiles = resolvePhase63DataFileCandidates({
    benchmarkRoot,
    mode: options.mode,
  });
  const foundDataFile = candidateDataFiles.find(fileExists);
  const checks: Phase63ReadinessCheck[] = [
    {
      detail: foundDataFile
        ? `Found BEAM data file: ${foundDataFile}`
        : `Could not find BEAM data file. Checked: ${candidateDataFiles.join(", ")}`,
      key: "beam-data-file",
      missing: foundDataFile ? [] : ["BEAM data file"],
      status: foundDataFile ? "ok" : "missing",
    },
  ];
  const missing = checks.flatMap((check) => check.missing);

  return {
    benchmarkRoot,
    candidateDataFiles,
    checks,
    missing,
    mode: options.mode,
    profiles,
    ready: missing.length === 0,
  };
}

export function assertPhase63Readiness(report: Phase63ReadinessReport): void {
  if (report.ready) {
    return;
  }

  const missingChecks = report.checks
    .filter((check) => check.status === "missing")
    .map((check) => `- ${check.key}: ${check.detail}`)
    .join("\n");
  throw new Error(`Phase 63 BEAM readiness failed:\n${missingChecks}`);
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return parsed;
}

function parseOffset(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("--offset must be a non-negative integer");
  }
  return parsed;
}

function parseMode(value: string | undefined): BeamMode {
  if (!value) {
    return "smoke";
  }
  if (value === "smoke" || value === "full") {
    return value;
  }
  throw new Error("--mode must be smoke or full");
}

function parseScale(value: string | undefined): Phase63CliOptions["scale"] {
  if (!value) {
    return undefined;
  }
  if (
    value === "100K" ||
    value === "500K" ||
    value === "1M" ||
    value === "10M" ||
    value === "unknown"
  ) {
    return value;
  }
  throw new Error("--scale must be 100K, 500K, 1M, 10M, or unknown");
}

function parseRepeatedFlag(
  argv: readonly string[],
  flagName: string,
): string[] | undefined {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flagName) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${flagName} requires a value`);
      }
      values.push(value);
    }
  }
  return values.length === 0 ? undefined : values;
}

export function parsePhase63CliOptions(
  argv: readonly string[],
): Phase63CliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ?? process.env.GOODMEMORY_BEAM_ROOT,
    caseIds: parseRepeatedFlag(argv, "--case-id"),
    limit: parseLimit(resolveCliFlagValue(argv, "--limit")),
    mode: parseMode(resolveCliFlagValue(argv, "--mode")),
    offset: parseOffset(resolveCliFlagValue(argv, "--offset")),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    profiles: parseRepeatedFlag(argv, "--profile"),
    questionTypes: parseRepeatedFlag(argv, "--question-type"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    scale: parseScale(resolveCliFlagValue(argv, "--scale")),
  };
}

export function resolvePhase63RepoRoot(): string {
  return resolveRepoRootFromScriptUrl(import.meta.url);
}
