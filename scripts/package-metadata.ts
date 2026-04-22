import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface PackageMetadata {
  name: string;
  version: string;
}

function parsePackageMetadata(raw: string): PackageMetadata {
  const parsed = JSON.parse(raw) as {
    name?: unknown;
    version?: unknown;
  };
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const version = typeof parsed.version === "string" ? parsed.version.trim() : "";

  if (name.length === 0 || version.length === 0) {
    throw new Error("package.json must define a non-empty name and version.");
  }

  return {
    name,
    version,
  };
}

function normalizePackageNameForTarball(name: string): string {
  return name.replace(/^@/u, "").replace(/\//gu, "-");
}

export function buildPackageTarballName(input: PackageMetadata): string {
  return `${normalizePackageNameForTarball(input.name)}-${input.version}.tgz`;
}

export async function loadPackageMetadata(root: string): Promise<PackageMetadata> {
  return parsePackageMetadata(await readFile(join(root, "package.json"), "utf8"));
}

export function loadPackageMetadataSync(root: string): PackageMetadata {
  return parsePackageMetadata(readFileSync(join(root, "package.json"), "utf8"));
}

export async function resolveCurrentPackageMetadata(
  scriptUrl: string,
): Promise<PackageMetadata> {
  return loadPackageMetadata(resolveRepoRootFromScriptUrl(scriptUrl));
}

export function resolveCurrentPackageMetadataSync(
  scriptUrl: string,
): PackageMetadata {
  return loadPackageMetadataSync(resolveRepoRootFromScriptUrl(scriptUrl));
}
