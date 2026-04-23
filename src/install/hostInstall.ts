import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  buildInvalidManagedConfigError,
  buildUnchangedFileChange,
  removeMarkerManagedFile,
  relativeToRoot,
  resolveWorkspaceId,
  writeManagedFile,
  writeMarkerManagedFile,
} from "../host/managedFiles";
import {
  DEFAULT_INSTALLED_HOST_MAX_TOKENS,
  DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE,
  isRecord,
  parseInstalledHostRuntimeConfig,
  readPositiveInteger,
  readRetrievalProfile,
} from "./hostConfigValidation";

export type InstalledHostKind = "claude" | "codex";

export interface InstalledHostFileChange {
  action: "created" | "deleted" | "unchanged" | "updated";
  path: string;
  relativePath: string;
}

export interface InstallHostInput {
  homeRoot?: string;
  host: InstalledHostKind;
  memoryPath?: string;
  userId?: string;
}

export interface InstallHostResult {
  changes: InstalledHostFileChange[];
  configPath: string;
  host: InstalledHostKind;
  installRoot: string;
  memoryPath: string;
  userId: string;
}

export interface UninstallHostInput {
  homeRoot?: string;
  host: InstalledHostKind;
}

export interface UninstallHostResult {
  changes: InstalledHostFileChange[];
  configPath: string;
  host: InstalledHostKind;
  installRoot: string;
}

export interface EnableHostWorkspaceInput {
  homeRoot?: string;
  host: InstalledHostKind;
  workspaceId?: string;
  workspaceRoot?: string;
}

export interface EnableHostWorkspaceResult {
  changes: InstalledHostFileChange[];
  configPath: string;
  host: InstalledHostKind;
  instructionPath: string;
  workspaceId: string;
  workspaceRoot: string;
}

export interface DisableHostWorkspaceInput {
  host: InstalledHostKind;
  workspaceRoot?: string;
}

export interface DisableHostWorkspaceResult {
  changes: InstalledHostFileChange[];
  configPath: string;
  host: InstalledHostKind;
  instructionPath: string;
  workspaceRoot: string;
}

interface HostInstallBlueprint {
  configFileName: string;
  host: InstalledHostKind;
  instructionFileName: string;
  installMarker: {
    end: string;
    start: string;
  };
}

interface HostInstallConfigRecord {
  debug: boolean;
  host: InstalledHostKind;
  maxTokens: number;
  retrievalProfile: "coding_agent" | "general_chat";
  storage: {
    path: string;
    provider: "sqlite";
  };
  userId: string;
  version: 1;
}

interface WorkspaceOptInConfigRecord {
  debug?: boolean;
  enabled: boolean;
  host: InstalledHostKind;
  maxTokens?: number;
  retrievalProfile?: "coding_agent" | "general_chat";
  version: 1;
  workspaceId: string;
}

const HOST_INSTALL_BLUEPRINTS: Record<InstalledHostKind, HostInstallBlueprint> = {
  codex: {
    configFileName: "codex.json",
    host: "codex",
    instructionFileName: "AGENTS.md",
    installMarker: {
      end: "<!-- GOODMEMORY-INSTALL:CODEX END -->",
      start: "<!-- GOODMEMORY-INSTALL:CODEX START -->",
    },
  },
  claude: {
    configFileName: "claude.json",
    host: "claude",
    instructionFileName: "CLAUDE.md",
    installMarker: {
      end: "<!-- GOODMEMORY-INSTALL:CLAUDE END -->",
      start: "<!-- GOODMEMORY-INSTALL:CLAUDE START -->",
    },
  },
};

const DEFAULT_MAX_TOKENS = DEFAULT_INSTALLED_HOST_MAX_TOKENS;
const DEFAULT_RETRIEVAL_PROFILE = DEFAULT_INSTALLED_HOST_RETRIEVAL_PROFILE;

export async function installHost(
  input: InstallHostInput,
): Promise<InstallHostResult> {
  const blueprint = HOST_INSTALL_BLUEPRINTS[input.host];
  const installRoot = resolveInstallRoot(input.homeRoot);
  const configPath = join(installRoot, blueprint.configFileName);
  const resolvedMemoryPath = resolve(
    input.memoryPath ?? join(installRoot, "memory.sqlite"),
  );
  const nextConfig = await mergeInstallConfig({
    configPath,
    host: input.host,
    installRoot,
    memoryPath: resolvedMemoryPath,
    preferInputMemoryPath: input.memoryPath !== undefined,
    preferInputUserId: input.userId !== undefined,
    userId: resolveUserId(input.userId, input.homeRoot),
  });

  return {
    changes: [
      await writeManagedFile(
        configPath,
        installRoot,
        JSON.stringify(nextConfig, null, 2) + "\n",
      ),
    ],
    configPath,
    host: input.host,
    installRoot,
    memoryPath: nextConfig.storage.path,
    userId: nextConfig.userId,
  };
}

export async function uninstallHost(
  input: UninstallHostInput,
): Promise<UninstallHostResult> {
  const blueprint = HOST_INSTALL_BLUEPRINTS[input.host];
  const installRoot = resolveInstallRoot(input.homeRoot);
  const configPath = join(installRoot, blueprint.configFileName);
  const existing = await readFileIfPresent(configPath);

  if (existing === null) {
    return {
      changes: [
        {
          action: "unchanged",
          path: configPath,
          relativePath: relativeToRoot(configPath, installRoot),
        },
      ],
      configPath,
      host: input.host,
      installRoot,
    };
  }

  await rm(configPath, { force: true });
  return {
    changes: [
      {
        action: "deleted",
        path: configPath,
        relativePath: relativeToRoot(configPath, installRoot),
      },
    ],
    configPath,
    host: input.host,
    installRoot,
  };
}

export async function enableHostWorkspace(
  input: EnableHostWorkspaceInput,
): Promise<EnableHostWorkspaceResult> {
  const blueprint = HOST_INSTALL_BLUEPRINTS[input.host];
  const workspaceRoot = resolve(input.workspaceRoot ?? ".");
  await assertInstalledHostConfigExists({
    homeRoot: input.homeRoot,
    host: input.host,
  });
  const configPath = join(workspaceRoot, ".goodmemory", blueprint.configFileName);
  const instructionPath = join(workspaceRoot, blueprint.instructionFileName);
  const nextConfig = await mergeWorkspaceConfig({
    configPath,
    host: input.host,
    preferInputWorkspaceId: input.workspaceId !== undefined,
    workspaceId: resolveWorkspaceId(workspaceRoot, input.workspaceId),
    workspaceRoot,
  });

  return {
    changes: [
      await writeManagedFile(
        configPath,
        workspaceRoot,
        JSON.stringify(nextConfig, null, 2) + "\n",
      ),
      await writeMarkerManagedFile(
        instructionPath,
        workspaceRoot,
        blueprint.installMarker,
        buildInstallInstructionBlock(blueprint),
      ),
    ],
    configPath,
    host: input.host,
    instructionPath,
    workspaceId: nextConfig.workspaceId,
    workspaceRoot,
  };
}

export async function disableHostWorkspace(
  input: DisableHostWorkspaceInput,
): Promise<DisableHostWorkspaceResult> {
  const blueprint = HOST_INSTALL_BLUEPRINTS[input.host];
  const workspaceRoot = resolve(input.workspaceRoot ?? ".");
  const configPath = join(workspaceRoot, ".goodmemory", blueprint.configFileName);
  const instructionPath = join(workspaceRoot, blueprint.instructionFileName);
  const existingConfig = await readFileIfPresent(configPath);
  const configChange =
    existingConfig === null
      ? buildUnchangedFileChange(configPath, workspaceRoot)
      : await writeManagedFile(
          configPath,
          workspaceRoot,
          JSON.stringify(
            await mergeWorkspaceConfig({
              configPath,
              enabled: false,
              host: input.host,
              workspaceId: resolveWorkspaceId(workspaceRoot, undefined),
              workspaceRoot,
            }),
            null,
            2,
          ) + "\n",
        );

  return {
    changes: [
      configChange,
      await removeMarkerManagedFile(
        instructionPath,
        workspaceRoot,
        blueprint.installMarker,
      ),
    ],
    configPath,
    host: input.host,
    instructionPath,
    workspaceRoot,
  };
}

function resolveInstallRoot(homeRoot: string | undefined): string {
  const resolvedHome = resolve(
    homeRoot ?? process.env.GOODMEMORY_HOME ?? homedir(),
  );
  return join(resolvedHome, ".goodmemory");
}

function resolveUserId(
  userId: string | undefined,
  homeRoot: string | undefined,
): string {
  const normalized = userId?.trim();
  if (normalized && normalized.length > 0) {
    return normalized;
  }

  const envCandidates = [
    process.env.GOODMEMORY_DEFAULT_USER_ID,
    process.env.USER,
    process.env.LOGNAME,
    process.env.USERNAME,
  ];
  for (const candidate of envCandidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length > 0) {
      return trimmed;
    }
  }

  const base = basename(
    resolve(homeRoot ?? process.env.GOODMEMORY_HOME ?? homedir()),
  ).trim();
  return base.length > 0 ? base : "goodmemory-user";
}

async function assertInstalledHostConfigExists(input: {
  homeRoot?: string;
  host: InstalledHostKind;
}): Promise<void> {
  const blueprint = HOST_INSTALL_BLUEPRINTS[input.host];
  const installRoot = resolveInstallRoot(input.homeRoot);
  const configPath = join(installRoot, blueprint.configFileName);
  const existing = await readFileIfPresent(configPath);

  if (existing === null || existing.trim().length === 0) {
    throw new Error(
      `Run 'goodmemory install ${input.host}' first to create ${configPath} before enabling this repository.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw buildInvalidManagedConfigError(
      relativeToRoot(configPath, installRoot),
      "file is not valid JSON",
    );
  }

  if (!isRecord(parsed)) {
    throw buildInvalidManagedConfigError(
      relativeToRoot(configPath, installRoot),
      "root value must be a JSON object",
    );
  }

  const validation = parseInstalledHostRuntimeConfig(parsed, input.host);
  if (validation.status !== "ok") {
    throw buildInvalidManagedConfigError(
      relativeToRoot(configPath, installRoot),
      validation.detail,
    );
  }
}

async function mergeInstallConfig(input: {
  configPath: string;
  host: InstalledHostKind;
  installRoot: string;
  memoryPath: string;
  preferInputMemoryPath: boolean;
  preferInputUserId: boolean;
  userId: string;
}): Promise<HostInstallConfigRecord> {
  const existing = await readFileIfPresent(input.configPath);

  if (existing === null || existing.trim().length === 0) {
    return {
      debug: false,
      host: input.host,
      maxTokens: DEFAULT_MAX_TOKENS,
      retrievalProfile: DEFAULT_RETRIEVAL_PROFILE,
      storage: {
        path: input.memoryPath,
        provider: "sqlite",
      },
      userId: input.userId,
      version: 1,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw buildInvalidManagedConfigError(
      relativeToRoot(input.configPath, input.installRoot),
      "file is not valid JSON",
    );
  }

  if (!isRecord(parsed)) {
    throw buildInvalidManagedConfigError(
      relativeToRoot(input.configPath, input.installRoot),
      "root value must be a JSON object",
    );
  }

  if (parsed.host !== undefined && parsed.host !== input.host) {
    throw buildInvalidManagedConfigError(
      relativeToRoot(input.configPath, input.installRoot),
      "host value does not match the managed config target",
    );
  }

  const storage = isRecord(parsed.storage) ? parsed.storage : {};
  const maxTokens = readPositiveInteger(parsed.maxTokens) ?? DEFAULT_MAX_TOKENS;
  const debug = parsed.debug === true;
  const retrievalProfile =
    readRetrievalProfile(parsed.retrievalProfile) ?? DEFAULT_RETRIEVAL_PROFILE;

  return {
    ...parsed,
    debug,
    host: input.host,
    maxTokens,
    retrievalProfile,
    storage: {
      ...storage,
      path: input.preferInputMemoryPath
        ? input.memoryPath
        : typeof storage.path === "string" && storage.path.trim().length > 0
          ? storage.path
          : input.memoryPath,
      provider: "sqlite",
    },
    userId:
      input.preferInputUserId ||
      !(typeof parsed.userId === "string" && parsed.userId.trim().length > 0)
        ? input.userId
        : parsed.userId,
    version: 1,
  } as HostInstallConfigRecord;
}

async function mergeWorkspaceConfig(input: {
  configPath: string;
  enabled?: boolean;
  host: InstalledHostKind;
  preferInputWorkspaceId?: boolean;
  workspaceId: string;
  workspaceRoot: string;
}): Promise<WorkspaceOptInConfigRecord> {
  const existing = await readFileIfPresent(input.configPath);

  if (existing === null || existing.trim().length === 0) {
    return {
      enabled: input.enabled ?? true,
      host: input.host,
      version: 1,
      workspaceId: input.workspaceId,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw buildInvalidManagedConfigError(
      relativeToRoot(input.configPath, input.workspaceRoot),
      "file is not valid JSON",
    );
  }

  if (!isRecord(parsed)) {
    throw buildInvalidManagedConfigError(
      relativeToRoot(input.configPath, input.workspaceRoot),
      "root value must be a JSON object",
    );
  }

  if (parsed.host !== undefined && parsed.host !== input.host) {
    throw buildInvalidManagedConfigError(
      relativeToRoot(input.configPath, input.workspaceRoot),
      "host value does not match the managed config target",
    );
  }

  const maxTokens = readPositiveInteger(parsed.maxTokens);
  const retrievalProfile = readRetrievalProfile(parsed.retrievalProfile);

  return {
    ...parsed,
    ...(parsed.debug === undefined ? {} : { debug: parsed.debug === true }),
    enabled: input.enabled ?? true,
    host: input.host,
    maxTokens,
    retrievalProfile,
    version: 1,
    workspaceId:
      input.preferInputWorkspaceId ||
      !(typeof parsed.workspaceId === "string" && parsed.workspaceId.trim().length > 0)
        ? input.workspaceId
        : parsed.workspaceId,
  } as WorkspaceOptInConfigRecord;
}

function buildInstallInstructionBlock(blueprint: HostInstallBlueprint): string {
  const hostLabel = blueprint.host === "codex" ? "Codex" : "Claude Code";
  return [
    `## GoodMemory ${hostLabel}`,
    "",
    `This repository opts into the installed GoodMemory ${hostLabel} host-config path.`,
    "",
    "Prefer hook-injected GoodMemory context when the installed host runtime provides it.",
    "Use GoodMemory MCP for deep memory inspection or recall debugging when the installed host runtime exposes it.",
    "Treat exported artifact files as projections, not canonical truth.",
  ].join("\n");
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
