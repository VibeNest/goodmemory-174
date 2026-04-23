import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildUnchangedFileChange,
  relativeToRoot,
  writeManagedFile,
} from "../host/managedFiles";
import type { InstalledHostFileChange, InstalledHostKind } from "./hostInstall";

const GOODMEMORY_MCP_COMMAND = "goodmemory-mcp";
const GOODMEMORY_MCP_MANAGED_BY_ENV = "GOODMEMORY_MANAGED_BY";
const GOODMEMORY_MCP_MANAGED_BY_VALUE = "goodmemory";
const GOODMEMORY_MCP_SERVER_NAME = "goodmemory";

interface InstalledHostMcpSpec {
  args: string[];
  command: string;
  env: Record<string, string>;
}

export async function registerInstalledHostMcp(input: {
  homeRoot?: string;
  host: InstalledHostKind;
}): Promise<InstalledHostFileChange> {
  const resolvedHomeRoot = resolveHomeRoot(input.homeRoot);
  const target = resolveMcpTargetPath(input.host, resolvedHomeRoot);
  const existing = await readFileIfPresent(target.path);
  const nextContent =
    input.host === "codex"
      ? mergeCodexMcpConfig(
          existing,
          buildInstalledHostMcpSpec(input.host, resolvedHomeRoot),
          input.host,
        )
      : mergeClaudeMcpConfig(
          existing,
          buildInstalledHostMcpSpec(input.host, resolvedHomeRoot),
          input.host,
        );

  return writeManagedFile(target.path, target.root, nextContent, {
    existingContent: existing,
  });
}

export async function unregisterInstalledHostMcp(input: {
  homeRoot?: string;
  host: InstalledHostKind;
}): Promise<InstalledHostFileChange> {
  const resolvedHomeRoot = resolveHomeRoot(input.homeRoot);
  const target = resolveMcpTargetPath(input.host, resolvedHomeRoot);
  const existing = await readFileIfPresent(target.path);
  if (existing === null) {
    return buildUnchangedFileChange(target.path, target.root);
  }

  const nextContent =
    input.host === "codex"
      ? removeCodexMcpConfig(existing, input.host)
      : removeClaudeMcpConfig(existing, input.host);

  if (nextContent === null) {
    await rm(target.path, { force: true });
    return {
      action: "deleted",
      path: target.path,
      relativePath: relativeToRoot(target.path, target.root),
    };
  }

  return writeManagedFile(target.path, target.root, nextContent, {
    existingContent: existing,
  });
}

function resolveHomeRoot(homeRoot: string | undefined): string {
  return resolve(homeRoot ?? process.env.GOODMEMORY_HOME ?? homedir());
}

function resolveMcpTargetPath(
  host: InstalledHostKind,
  homeRoot: string,
): { path: string; root: string } {
  return host === "codex"
    ? {
        path: join(homeRoot, ".codex", "config.toml"),
        root: homeRoot,
      }
    : {
        path: join(homeRoot, ".claude.json"),
        root: homeRoot,
      };
}

function buildInstalledHostMcpSpec(
  host: InstalledHostKind,
  homeRoot: string,
): InstalledHostMcpSpec {
  return {
    args: ["--host", host],
    command: GOODMEMORY_MCP_COMMAND,
    env: {
      GOODMEMORY_HOME: homeRoot,
      [GOODMEMORY_MCP_MANAGED_BY_ENV]: GOODMEMORY_MCP_MANAGED_BY_VALUE,
    },
  };
}

function mergeClaudeMcpConfig(
  existing: string | null,
  spec: InstalledHostMcpSpec,
  host: InstalledHostKind,
): string {
  if (existing === null || existing.trim().length === 0) {
    return renderClaudeConfig({
      mcpServers: {
        [GOODMEMORY_MCP_SERVER_NAME]: spec,
      },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "file is not valid JSON",
    );
  }

  if (!isRecord(parsed)) {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "root value must be a JSON object",
    );
  }

  const existingServers = parsed.mcpServers;
  if (existingServers !== undefined && !isRecord(existingServers)) {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "`mcpServers` must stay a JSON object",
    );
  }

  const existingServer = existingServers?.[GOODMEMORY_MCP_SERVER_NAME];
  if (
    existingServer !== undefined &&
    !isManagedClaudeMcpServer(existingServer, host)
  ) {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "`mcpServers.goodmemory` already exists and is not managed by GoodMemory",
    );
  }

  return renderClaudeConfig({
    ...parsed,
    mcpServers: {
      ...(existingServers ?? {}),
      [GOODMEMORY_MCP_SERVER_NAME]: spec,
    },
  });
}

function removeClaudeMcpConfig(
  existing: string,
  host: InstalledHostKind,
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "file is not valid JSON",
    );
  }

  if (!isRecord(parsed)) {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "root value must be a JSON object",
    );
  }

  const existingServers = parsed.mcpServers;
  if (existingServers === undefined) {
    return ensureTrailingNewline(existing);
  }
  if (!isRecord(existingServers)) {
    throw buildInvalidHostMcpConfigError(
      ".claude.json",
      "`mcpServers` must stay a JSON object",
    );
  }
  const existingServer = existingServers[GOODMEMORY_MCP_SERVER_NAME];
  if (
    existingServer === undefined ||
    !isManagedClaudeMcpServer(existingServer, host)
  ) {
    return ensureTrailingNewline(existing);
  }

  const nextServers = { ...existingServers };
  delete nextServers[GOODMEMORY_MCP_SERVER_NAME];
  const nextRoot = { ...parsed };
  if (Object.keys(nextServers).length === 0) {
    delete nextRoot.mcpServers;
  } else {
    nextRoot.mcpServers = nextServers;
  }

  return Object.keys(nextRoot).length === 0 ? null : renderClaudeConfig(nextRoot);
}

function renderClaudeConfig(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function mergeCodexMcpConfig(
  existing: string | null,
  spec: InstalledHostMcpSpec,
  host: InstalledHostKind,
): string {
  if (existing === null || existing.trim().length === 0) {
    return buildCodexConfig(spec);
  }

  if (containsCodexManagedArrayTable(existing)) {
    throw buildInvalidHostMcpConfigError(
      ".codex/config.toml",
      "`[[mcp_servers.goodmemory]]` is unsupported for managed MCP registration",
    );
  }

  const normalized = existing.replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  const blockRange = findCodexGoodmemoryBlock(lines);
  if (blockRange === null) {
    const trimmed = normalized.trimEnd();
    const separator = trimmed.length === 0 ? "" : "\n\n";
    return `${trimmed}${separator}${buildCodexConfig(spec)}`;
  }
  if (!isManagedCodexMcpBlock(lines.slice(blockRange.start, blockRange.end), host)) {
    throw buildInvalidHostMcpConfigError(
      ".codex/config.toml",
      "`[mcp_servers.goodmemory]` already exists and is not managed by GoodMemory",
    );
  }

  const replacement = buildCodexConfig(spec).trimEnd().split("\n");
  const merged = [
    ...lines.slice(0, blockRange.start),
    ...replacement,
    ...lines.slice(blockRange.end),
  ].join("\n");
  return ensureTrailingNewline(merged);
}

function removeCodexMcpConfig(
  existing: string,
  host: InstalledHostKind,
): string | null {
  if (containsCodexManagedArrayTable(existing)) {
    throw buildInvalidHostMcpConfigError(
      ".codex/config.toml",
      "`[[mcp_servers.goodmemory]]` is unsupported for managed MCP registration",
    );
  }

  const normalized = existing.replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  const blockRange = findCodexGoodmemoryBlock(lines);
  if (blockRange === null) {
    return ensureTrailingNewline(normalized);
  }
  if (!isManagedCodexMcpBlock(lines.slice(blockRange.start, blockRange.end), host)) {
    return ensureTrailingNewline(normalized);
  }

  const merged = [
    ...lines.slice(0, blockRange.start),
    ...lines.slice(blockRange.end),
  ]
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return merged.length === 0 ? null : `${merged}\n`;
}

function buildCodexConfig(spec: InstalledHostMcpSpec): string {
  return [
    `[mcp_servers.${GOODMEMORY_MCP_SERVER_NAME}]`,
    `command = ${renderTomlString(spec.command)}`,
    `args = ${renderTomlStringArray(spec.args)}`,
    `[mcp_servers.${GOODMEMORY_MCP_SERVER_NAME}.env]`,
    ...Object.entries(spec.env)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key} = ${renderTomlString(value)}`),
    "",
  ].join("\n");
}

function containsCodexManagedArrayTable(content: string): boolean {
  return /^\s*\[\[\s*mcp_servers\.goodmemory\s*\]\]\s*(?:#.*)?$/mu.test(content);
}

function findCodexGoodmemoryBlock(
  lines: string[],
): { end: number; start: number } | null {
  const managedHeaderPattern =
    /^\s*\[\s*mcp_servers\.goodmemory(?:\.[^\]]+)?\s*\]\s*(?:#.*)?$/u;
  const rootHeaderPattern =
    /^\s*\[\s*mcp_servers\.goodmemory\s*\]\s*(?:#.*)?$/u;
  const anyHeaderPattern = /^\s*\[[^\]]+\]\s*(?:#.*)?$/u;
  let start = -1;

  for (const [index, line] of lines.entries()) {
    if (rootHeaderPattern.test(line)) {
      start = index;
      break;
    }
  }

  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!anyHeaderPattern.test(line)) {
      continue;
    }
    if (managedHeaderPattern.test(line)) {
      continue;
    }

    end = index;
    break;
  }

  return { end, start };
}

function isManagedClaudeMcpServer(
  value: unknown,
  host: InstalledHostKind,
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.command === GOODMEMORY_MCP_COMMAND &&
    isManagedHostArgs(value.args, host) &&
    isManagedHostEnv(value.env)
  );
}

function isManagedCodexMcpBlock(
  blockLines: string[],
  host: InstalledHostKind,
): boolean {
  const argsPattern = new RegExp(
    `^\\s*args\\s*=\\s*\\["--host",\\s*${escapeRegex(renderTomlString(host))}\\]\\s*(?:#.*)?$`,
    "u",
  );

  return (
    blockLines.some((line) =>
      /^\s*command\s*=\s*"goodmemory-mcp"\s*(?:#.*)?$/u.test(line),
    ) &&
    blockLines.some((line) => argsPattern.test(line)) &&
    blockLines.some((line) =>
      /^\s*GOODMEMORY_MANAGED_BY\s*=\s*"goodmemory"\s*(?:#.*)?$/u.test(line),
    )
  );
}

function isManagedHostArgs(
  value: unknown,
  host: InstalledHostKind,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === "--host" &&
    value[1] === host
  );
}

function isManagedHostEnv(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value[GOODMEMORY_MCP_MANAGED_BY_ENV] === GOODMEMORY_MCP_MANAGED_BY_VALUE
  );
}

function renderTomlString(value: string): string {
  return JSON.stringify(value);
}

function renderTomlStringArray(values: string[]): string {
  return `[${values.map((value) => renderTomlString(value)).join(", ")}]`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildInvalidHostMcpConfigError(path: string, detail: string): Error {
  return new Error(
    `Refusing to overwrite existing ${path}: ${detail}. Remove or rename the conflicting MCP entry, or fix the managed MCP config, then rerun the GoodMemory command.`,
  );
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readFileIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
