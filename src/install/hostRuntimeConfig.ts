import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseInstalledHostRuntimeConfig,
  parseWorkspaceHostOptInConfig,
} from "./hostConfigValidation";
import type { InstalledHostKind } from "./hostInstall";

export interface InstalledHostRuntimeConfigDependencies {
  readFile?: (path: string) => Promise<string>;
}

export async function readInstalledHostRuntimeConfig(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  dependencies: InstalledHostRuntimeConfigDependencies,
): Promise<
  | ReturnType<typeof parseInstalledHostRuntimeConfig>
  | { status: "invalid" | "missing" }
> {
  const text = await readFileIfPresent(
    join(resolveInstallRoot(homeRoot), `${host}.json`),
    dependencies,
  );
  if (text === null || text.trim().length === 0) {
    return { status: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "invalid" };
  }
  return parseInstalledHostRuntimeConfig(parsed, host);
}

export async function readInstalledHostDebug(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  dependencies: InstalledHostRuntimeConfigDependencies,
): Promise<boolean> {
  const config = await readInstalledHostRuntimeConfig(host, homeRoot, dependencies);
  return config.status === "ok" ? config.config.debug : false;
}

export async function readWorkspaceHostOptInConfig(
  host: InstalledHostKind,
  workspaceRoot: string,
  dependencies: InstalledHostRuntimeConfigDependencies,
): Promise<
  | ReturnType<typeof parseWorkspaceHostOptInConfig>
  | { status: "invalid" | "missing" }
> {
  const text = await readFileIfPresent(
    join(workspaceRoot, ".goodmemory", `${host}.json`),
    dependencies,
  );
  if (text === null || text.trim().length === 0) {
    return { status: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "invalid" };
  }
  return parseWorkspaceHostOptInConfig(parsed, host, workspaceRoot);
}

export function resolveInstallRoot(homeRoot: string | undefined): string {
  const resolvedHome = resolve(
    homeRoot ?? process.env.GOODMEMORY_HOME ?? homedir(),
  );
  return join(resolvedHome, ".goodmemory");
}

async function readFileIfPresent(
  path: string,
  dependencies: InstalledHostRuntimeConfigDependencies,
): Promise<string | null> {
  try {
    return await (dependencies.readFile ?? defaultReadFile)(path);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function defaultReadFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
