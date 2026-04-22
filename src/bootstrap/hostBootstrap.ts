import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export type BootstrapHostKind = "claude" | "codex";

export interface BootstrapHostWorkspaceInput {
  host: BootstrapHostKind;
  userId: string;
  workspaceId?: string;
  workspaceRoot?: string;
}

export interface BootstrapHostWorkspaceFileChange {
  action: "created" | "unchanged" | "updated";
  path: string;
  relativePath: string;
}

export interface BootstrapHostWorkspaceResult {
  changes: BootstrapHostWorkspaceFileChange[];
  exportRootPath: string;
  host: BootstrapHostKind;
  instructionPath: string;
  scriptPath: string;
  userId: string;
  workspaceId: string;
  workspaceRoot: string;
}

interface HostBootstrapBlueprint {
  artifactHints: string[];
  exportRootRelativePath: string;
  host: BootstrapHostKind;
  hostKindLiteral: BootstrapHostKind;
  instructionFileName: string;
  instructionMarker: {
    end: string;
    start: string;
  };
  readableArtifactTypes: string[];
  requiresSessionId: boolean;
  runtimeDefault: boolean;
  scriptFileName: string;
}

const HOST_BLUEPRINTS: Record<BootstrapHostKind, HostBootstrapBlueprint> = {
  codex: {
    artifactHints: [
      "./.goodmemory/hosts/codex/session-memory/current.md",
      "./.goodmemory/hosts/codex/MEMORY.md",
      "./.goodmemory/hosts/codex/playbooks/*.md",
    ],
    exportRootRelativePath: ".goodmemory/hosts/codex",
    host: "codex",
    hostKindLiteral: "codex",
    instructionFileName: "AGENTS.md",
    instructionMarker: {
      end: "<!-- GOODMEMORY-BOOTSTRAP:CODEX END -->",
      start: "<!-- GOODMEMORY-BOOTSTRAP:CODEX START -->",
    },
    readableArtifactTypes: ["memory_index", "session_memory", "playbook"],
    requiresSessionId: true,
    runtimeDefault: true,
    scriptFileName: "codex-export.mjs",
  },
  claude: {
    artifactHints: [
      "./.goodmemory/hosts/claude/MEMORY.md",
      "./.goodmemory/hosts/claude/user.md",
      "./.goodmemory/hosts/claude/playbooks/*.md",
    ],
    exportRootRelativePath: ".goodmemory/hosts/claude",
    host: "claude",
    hostKindLiteral: "claude",
    instructionFileName: "CLAUDE.md",
    instructionMarker: {
      end: "<!-- GOODMEMORY-BOOTSTRAP:CLAUDE END -->",
      start: "<!-- GOODMEMORY-BOOTSTRAP:CLAUDE START -->",
    },
    readableArtifactTypes: ["memory_index", "playbook", "user_memory"],
    requiresSessionId: false,
    runtimeDefault: false,
    scriptFileName: "claude-export.mjs",
  },
};

export async function bootstrapHostWorkspace(
  input: BootstrapHostWorkspaceInput,
): Promise<BootstrapHostWorkspaceResult> {
  const blueprint = HOST_BLUEPRINTS[input.host];
  const workspaceRoot = resolve(input.workspaceRoot ?? ".");
  const workspaceId = resolveWorkspaceId(workspaceRoot, input.workspaceId);
  const exportRootPath = join(workspaceRoot, blueprint.exportRootRelativePath);
  const scriptPath = join(
    workspaceRoot,
    ".goodmemory",
    "bootstrap",
    blueprint.scriptFileName,
  );
  const instructionPath = join(workspaceRoot, blueprint.instructionFileName);

  const scriptChange = await writeManagedFile(
    scriptPath,
    workspaceRoot,
    buildBootstrapScript({
      blueprint,
      userId: input.userId,
      workspaceId,
    }),
  );
  const instructionChange = await writeMarkerManagedFile(
    instructionPath,
    workspaceRoot,
    blueprint.instructionMarker,
    buildInstructionBlock(blueprint),
  );

  return {
    changes: [instructionChange, scriptChange],
    exportRootPath,
    host: blueprint.host,
    instructionPath,
    scriptPath,
    userId: input.userId,
    workspaceId,
    workspaceRoot,
  };
}

function resolveWorkspaceId(
  workspaceRoot: string,
  workspaceId: string | undefined,
): string {
  const normalized = workspaceId?.trim();
  if (normalized && normalized.length > 0) {
    return normalized;
  }

  const derived = basename(workspaceRoot).trim();
  return derived.length > 0 ? derived : "goodmemory-workspace";
}

async function writeManagedFile(
  path: string,
  workspaceRoot: string,
  content: string,
): Promise<BootstrapHostWorkspaceFileChange> {
  const existing = await readFileIfPresent(path);
  if (existing === content) {
    return {
      action: "unchanged",
      path,
      relativePath: relativeToWorkspace(path, workspaceRoot),
    };
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");

  return {
    action: existing === null ? "created" : "updated",
    path,
    relativePath: relativeToWorkspace(path, workspaceRoot),
  };
}

async function writeMarkerManagedFile(
  path: string,
  workspaceRoot: string,
  marker: HostBootstrapBlueprint["instructionMarker"],
  section: string,
): Promise<BootstrapHostWorkspaceFileChange> {
  const existing = await readFileIfPresent(path);
  const block = `${marker.start}\n${section.trimEnd()}\n${marker.end}\n`;
  let nextContent = block;

  if (existing !== null) {
    if (existing.includes(marker.start) && existing.includes(marker.end)) {
      const pattern = new RegExp(
        `${escapeRegExp(marker.start)}[\\s\\S]*?${escapeRegExp(marker.end)}\\n?`,
        "m",
      );
      nextContent = existing.replace(pattern, block);
    } else {
      const separator = existing.endsWith("\n") ? "\n" : "\n\n";
      nextContent = `${existing}${separator}${block}`;
    }
  }

  return writeManagedFile(path, workspaceRoot, nextContent);
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

function relativeToWorkspace(path: string, workspaceRoot: string): string {
  const normalizedRoot = resolve(workspaceRoot);
  return path.startsWith(`${normalizedRoot}/`)
    ? path.slice(normalizedRoot.length + 1)
    : path;
}

function buildInstructionBlock(blueprint: HostBootstrapBlueprint): string {
  const scriptRelativePath = `./${join(
    ".goodmemory",
    "bootstrap",
    blueprint.scriptFileName,
  )}`;
  const commandSuffix = blueprint.requiresSessionId
    ? " --session-id <session-id>"
    : "";
  const artifactHintLines = blueprint.artifactHints
    .map((artifactPath) => `- \`${artifactPath}\``)
    .join("\n");
  const hostLabel = blueprint.host === "codex" ? "Codex" : "Claude Code";
  const sessionRequirementLine = blueprint.requiresSessionId
    ? `Use the real active session id so \`session-memory/current.md\` maps to a real handoff.`
    : undefined;

  return [
    `## GoodMemory ${hostLabel} Bootstrap`,
    "",
    `This workspace uses GoodMemory through the installed package surface.`,
    "",
    `Refresh the exported ${hostLabel} artifacts with:`,
    `\`bun ${scriptRelativePath}${commandSuffix}\``,
    "",
    ...(sessionRequirementLine ? [sessionRequirementLine, ""] : []),
    `Read these compiled files when present before repeating a failed procedure or reconstructing context:`,
    artifactHintLines,
    "",
    `Treat exported files as compiled guidance, not canonical truth. Update canonical memory through your app or the public GoodMemory APIs, then rerun the export script.`,
  ].join("\n");
}

function buildBootstrapScript(input: {
  blueprint: HostBootstrapBlueprint;
  userId: string;
  workspaceId: string;
}): string {
  const { blueprint, userId, workspaceId } = input;
  const artifactTypesLiteral = JSON.stringify(blueprint.readableArtifactTypes);
  const exportRootLiteral = JSON.stringify(blueprint.exportRootRelativePath);
  const defaultScopeLiteral = `{
  userId: ${JSON.stringify(userId)},
  workspaceId: ${JSON.stringify(workspaceId)},
}`;
  const sessionIdRequiredLiteral = blueprint.requiresSessionId ? "true" : "false";
  const sessionIdRequiredMessageLiteral = JSON.stringify(
    `${blueprint.host === "codex" ? "Codex" : "Claude Code"} export requires --session-id <session-id> to target a real session handoff.`,
  );

  return `#!/usr/bin/env bun
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGoodMemory } from "goodmemory";
import { createHostAdapter } from "goodmemory/host";

const DEFAULT_SCOPE = ${defaultScopeLiteral};
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "..", "..");
process.chdir(WORKSPACE_ROOT);
const OUTPUT_ROOT = resolve(WORKSPACE_ROOT, ${exportRootLiteral});
const READABLE_ARTIFACT_TYPES = ${artifactTypesLiteral};
const INCLUDE_RUNTIME_BY_DEFAULT = ${blueprint.runtimeDefault ? "true" : "false"};
const SESSION_ID_REQUIRED = ${sessionIdRequiredLiteral};

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith("--")) {
      continue;
    }

    const inlineSeparator = token.indexOf("=");
    if (inlineSeparator >= 0) {
      flags[token.slice(2, inlineSeparator)] = token.slice(inlineSeparator + 1);
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      flags[key] = value;
      index += 1;
      continue;
    }

    flags[key] = "true";
  }

  return flags;
}

function flagEnabled(flags, name) {
  return flags[name] === "true";
}

function readTextFlag(flags, name) {
  const value = flags[name];

  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "true" ? trimmed : undefined;
}

const flags = parseArgs(process.argv.slice(2));
const sessionId = readTextFlag(flags, "session-id");

if (SESSION_ID_REQUIRED && !sessionId) {
  console.error(${sessionIdRequiredMessageLiteral});
  process.exit(1);
}

const scope = {
  userId: readTextFlag(flags, "user-id") ?? DEFAULT_SCOPE.userId,
  workspaceId: readTextFlag(flags, "workspace-id") ?? DEFAULT_SCOPE.workspaceId,
  ...(sessionId
    ? {
        sessionId,
      }
    : {}),
};

const memory = createGoodMemory({});
const adapter = createHostAdapter({
  id: "goodmemory-${blueprint.host}-bootstrap",
  hostKind: ${JSON.stringify(blueprint.hostKindLiteral)},
  memory,
  readableArtifactTypes: READABLE_ARTIFACT_TYPES,
});
const result = await adapter.readArtifacts({
  scope,
  includeRuntime: flagEnabled(flags, "include-runtime") || INCLUDE_RUNTIME_BY_DEFAULT,
});

await rm(OUTPUT_ROOT, { recursive: true, force: true });

for (const artifact of result.artifacts) {
  const artifactPath = resolve(OUTPUT_ROOT, artifact.relativePath);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, artifact.content, "utf8");

  if (artifact.artifactType === "session_memory") {
    const currentPath = resolve(OUTPUT_ROOT, "session-memory/current.md");
    await mkdir(dirname(currentPath), { recursive: true });
    await writeFile(currentPath, artifact.content, "utf8");
  }
}

const manifest = {
  artifactCount: result.artifacts.length,
  artifacts: result.artifacts.map((artifact) => ({
    artifactType: artifact.artifactType,
    relativePath: artifact.relativePath,
  })),
  exportedAt: new Date().toISOString(),
  host: ${JSON.stringify(blueprint.host)},
  outputRoot: OUTPUT_ROOT,
  scope,
};

await mkdir(OUTPUT_ROOT, { recursive: true });
await writeFile(
  resolve(OUTPUT_ROOT, "export-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\\n",
  "utf8",
);

console.log(JSON.stringify(manifest, null, 2));
`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
