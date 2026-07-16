import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import type {
  C3InstalledArmRuntime,
  C3NoMemoryArmRuntime,
} from "./c3-runtime";

export interface C3NormalizedConfigurationFile {
  normalizedText: string;
  sourceSha256: string;
}

export interface C3NormalizedArmHostConfiguration {
  codexConfig: C3NormalizedConfigurationFile;
  environment: Record<string, string>;
  goodmemoryConfig: C3NormalizedConfigurationFile | null;
  hooksConfig: C3NormalizedConfigurationFile | null;
  profile: C3InstalledArmRuntime["profile"] | null;
}

export interface C3HostConfigurationDiffEntry {
  goodmemoryInstalled: unknown;
  noMemory: unknown;
  path: string;
}

export interface C3HostConfigurationEvidence {
  arms: {
    goodmemoryInstalled: C3NormalizedArmHostConfiguration;
    noMemory: C3NormalizedArmHostConfiguration;
  };
  normalizedDiff: C3HostConfigurationDiffEntry[];
  schemaVersion: 1;
}

export async function collectC3HostConfigurationEvidence(input: {
  installedRuntime: C3InstalledArmRuntime;
  noMemoryRuntime: C3NoMemoryArmRuntime;
}): Promise<C3HostConfigurationEvidence> {
  const noMemory = await collectArmConfiguration({
    runtime: input.noMemoryRuntime,
  });
  const goodmemoryInstalled = await collectArmConfiguration({
    runtime: input.installedRuntime,
  });
  return buildC3HostConfigurationEvidence({
    goodmemoryInstalled,
    noMemory,
  });
}

export function buildC3HostConfigurationEvidence(input: {
  goodmemoryInstalled: C3NormalizedArmHostConfiguration;
  noMemory: C3NormalizedArmHostConfiguration;
}): C3HostConfigurationEvidence {
  return {
    arms: {
      goodmemoryInstalled: input.goodmemoryInstalled,
      noMemory: input.noMemory,
    },
    normalizedDiff: diffConfigurations(input.noMemory, input.goodmemoryInstalled),
    schemaVersion: 1,
  };
}

export function serializeC3HostConfigurationEvidence(
  evidence: C3HostConfigurationEvidence,
): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

async function collectArmConfiguration(input: {
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime;
}): Promise<C3NormalizedArmHostConfiguration> {
  const replacements = buildReplacements(input.runtime);
  const installed = input.runtime.plan.arm === "goodmemory-installed"
    ? input.runtime as C3InstalledArmRuntime
    : null;
  return {
    codexConfig: await readConfigurationFile(
      join(input.runtime.plan.paths.codexHome, "config.toml"),
      replacements,
    ),
    environment: normalizeEnvironment(input.runtime.env, replacements),
    goodmemoryConfig: installed === null
      ? null
      : await readConfigurationFile(
          join(installed.plan.paths.home, ".goodmemory", "codex.json"),
          replacements,
        ),
    hooksConfig: installed === null
      ? null
      : await readConfigurationFile(
          join(installed.plan.paths.codexHome, "hooks.json"),
          replacements,
        ),
    profile: installed?.profile ?? null,
  };
}

async function readConfigurationFile(
  path: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): Promise<C3NormalizedConfigurationFile> {
  const source = await readFile(path, "utf8");
  return {
    normalizedText: normalizeText(source, replacements),
    sourceSha256: sha256(source),
  };
}

function buildReplacements(
  runtime: C3InstalledArmRuntime | C3NoMemoryArmRuntime,
): Array<readonly [string, string]> {
  const replacements: Array<readonly [string, string]> = [
    [runtime.plan.paths.codexHome, "<codex-home>"],
    [runtime.plan.paths.workspace, "<workspace>"],
    [runtime.plan.paths.armRoot, "<arm-root>"],
    [runtime.plan.paths.result, "<result>"],
    [runtime.plan.paths.cache, "<cache>"],
    [runtime.plan.paths.temp, "<temp>"],
    [runtime.plan.paths.home, "<home>"],
    [runtime.plan.scopes.sessionId, "<session-id>"],
    [runtime.plan.scopes.userId, "<user-id>"],
    [runtime.plan.scopes.workspaceId, "<workspace-id>"],
  ];
  const packagePrefix = runtime.plan.paths.packagePrefix;
  if (packagePrefix !== undefined) {
    replacements.push([packagePrefix, "<package-prefix>"]);
  }
  return replacements.sort((first, second) => second[0].length - first[0].length);
}

function normalizeEnvironment(
  environment: Record<string, string>,
  replacements: ReadonlyArray<readonly [string, string]>,
): Record<string, string> {
  const names = [
    "CODEX_HOME",
    "GOODMEMORY_HOME",
    "HOME",
    "PATH",
    "TMPDIR",
  ];
  return Object.fromEntries(names.flatMap((name) => {
    const value = environment[name];
    if (value === undefined) {
      return [];
    }
    return [[
      name,
      name === "PATH"
        ? normalizeC3PathForEvidence(value, replacements)
        : normalizeText(value, replacements),
    ]];
  }));
}

export function normalizeC3PathForEvidence(
  value: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): string {
  return [...new Set(value.split(delimiter).map((entry) => {
    for (const [source, replacement] of replacements) {
      if (entry === source) {
        return replacement;
      }
      if (entry.startsWith(`${source}/`)) {
        return `${replacement}${entry.slice(source.length)}`;
      }
    }
    return "<host-path>";
  }))].join(delimiter);
}

function normalizeText(
  value: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): string {
  return replacements.reduce(
    (normalized, [source, replacement]) => normalized.replaceAll(source, replacement),
    value,
  );
}

function diffConfigurations(
  noMemory: C3NormalizedArmHostConfiguration,
  goodmemoryInstalled: C3NormalizedArmHostConfiguration,
): C3HostConfigurationDiffEntry[] {
  const left = flatten(noMemory);
  const right = flatten(goodmemoryInstalled);
  return [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .flatMap((path) => {
      const noMemoryValue = left.get(path);
      const installedValue = right.get(path);
      return JSON.stringify(noMemoryValue) === JSON.stringify(installedValue)
        ? []
        : [{
            goodmemoryInstalled: installedValue ?? null,
            noMemory: noMemoryValue ?? null,
            path,
          }];
    });
}

function flatten(
  value: unknown,
  prefix = "",
  output = new Map<string, unknown>(),
): Map<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    output.set(prefix, value);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix.length === 0 ? key : `${prefix}.${key}`, output);
  }
  return output;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
