import { join } from "node:path";
import type { GoodMemoryConfig } from "../api/contracts";
import type { InstalledHostKind } from "./hostInstall";
import { resolveInstallRoot } from "./hostRuntimeConfig";

// Shared option resolver for the two MCP serve entrypoints (the
// scripts/goodmemory-mcp.ts bin and CLI `goodmemory mcp serve`). Installed
// mode keeps the --host contract unchanged; standalone mode runs without any
// installed host config, collecting scope and storage from flags/env instead.
// Pure: env is injected so both callers and tests stay deterministic.

export type StandaloneStorageProvider = "memory" | "postgres" | "sqlite";

export interface StandaloneMcpConfig {
  agentId?: string;
  maxTokens?: number;
  retrievalProfile?: "coding_agent" | "general_chat";
  sessionId?: string;
  storage: NonNullable<GoodMemoryConfig["storage"]>;
  userId: string;
  workspaceId?: string;
}

export type McpServeOptions =
  | { allowWrite: boolean; host: InstalledHostKind; mode: "installed" }
  | { allowWrite: boolean; config: StandaloneMcpConfig; mode: "standalone" }
  | { message: string; mode: "error" };

export interface ResolveMcpServeOptionsInput {
  argv?: string[];
  env: Record<string, string | undefined>;
  flags?: Record<string, string>;
}

const STANDALONE_STORAGE_PROVIDERS: readonly StandaloneStorageProvider[] = [
  "memory",
  "postgres",
  "sqlite",
];

export function resolveMcpServeOptions(
  input: ResolveMcpServeOptionsInput,
): McpServeOptions {
  const flags = input.flags ?? parseArgvFlags(input.argv ?? []);
  const env = input.env;
  const allowWrite =
    flags["allow-write"] === "true" ||
    env.GOODMEMORY_MCP_ALLOW_WRITE === "1" ||
    env.GOODMEMORY_MCP_ALLOW_WRITE === "true";

  const host = flags.host;
  const standalone = flags.standalone === "true";

  if (host !== undefined && standalone) {
    return {
      message:
        "--host and --standalone are mutually exclusive. Use --host <codex|claude> for an installed host, or --standalone for hostless operation.",
      mode: "error",
    };
  }

  if (host !== undefined) {
    if (host !== "claude" && host !== "codex") {
      return {
        message: `Unsupported --host value: ${host}. Expected codex or claude.`,
        mode: "error",
      };
    }
    return { allowWrite, host, mode: "installed" };
  }

  if (!standalone) {
    return {
      message:
        "Missing mode flag. Use --host <codex|claude> for an installed host, or --standalone with --user-id <id> (or GOODMEMORY_USER_ID) for hostless operation.",
      mode: "error",
    };
  }

  const userId = flags["user-id"] ?? env.GOODMEMORY_USER_ID;
  if (!userId || userId.trim().length === 0) {
    return {
      message:
        "Standalone mode requires a user id. Pass --user-id <id> or set GOODMEMORY_USER_ID.",
      mode: "error",
    };
  }

  const storage = resolveStandaloneStorage(flags, env);
  if ("message" in storage) {
    return { message: storage.message, mode: "error" };
  }

  const maxTokensRaw = flags["max-tokens"];
  let maxTokens: number | undefined;
  if (maxTokensRaw !== undefined) {
    const parsed = Number.parseInt(maxTokensRaw, 10);
    if (!Number.isFinite(parsed) || String(parsed) !== maxTokensRaw || parsed <= 0) {
      return {
        message: `Invalid --max-tokens value: ${maxTokensRaw}. Expected a positive integer.`,
        mode: "error",
      };
    }
    maxTokens = parsed;
  }

  const retrievalProfile = flags["retrieval-profile"];
  if (
    retrievalProfile !== undefined &&
    retrievalProfile !== "coding_agent" &&
    retrievalProfile !== "general_chat"
  ) {
    return {
      message: `Invalid --retrieval-profile value: ${retrievalProfile}. Expected coding_agent or general_chat.`,
      mode: "error",
    };
  }

  const workspaceId = flags["workspace-id"] ?? env.GOODMEMORY_WORKSPACE_ID;
  const agentId = flags["agent-id"] ?? env.GOODMEMORY_AGENT_ID;
  const sessionId = flags["session-id"];

  return {
    allowWrite,
    config: {
      ...(agentId !== undefined ? { agentId } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(retrievalProfile !== undefined ? { retrievalProfile } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      storage: storage.storage,
      userId,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    },
    mode: "standalone",
  };
}

function resolveStandaloneStorage(
  flags: Record<string, string>,
  env: Record<string, string | undefined>,
):
  | { storage: StandaloneMcpConfig["storage"] }
  | { message: string } {
  const providerRaw =
    flags["storage-provider"] ?? env.GOODMEMORY_STORAGE_PROVIDER ?? "sqlite";
  if (!STANDALONE_STORAGE_PROVIDERS.includes(providerRaw as StandaloneStorageProvider)) {
    return {
      message: `Unsupported --storage-provider value: ${providerRaw}. Expected memory, sqlite, or postgres.`,
    };
  }
  const provider = providerRaw as StandaloneStorageProvider;
  const url = flags["storage-url"] ?? env.GOODMEMORY_STORAGE_URL;

  if (provider === "postgres") {
    if (!url || url.trim().length === 0) {
      return {
        message:
          "Standalone postgres storage requires --storage-url (or GOODMEMORY_STORAGE_URL).",
      };
    }
    return { storage: { provider, url } };
  }

  if (provider === "memory") {
    return { storage: { provider } };
  }

  return {
    storage: {
      provider,
      url: url ?? join(resolveInstallRoot(env.GOODMEMORY_HOME), "standalone.sqlite"),
    },
  };
}

// Mirrors the flag conventions of src/cli.ts parseArgs: `--flag value` pairs,
// bare `--flag` becomes "true", and `--flag=value` inline form is accepted.
// Sharing the convention keeps the argv (bin) and ParsedFlags (CLI) forms
// equivalent by construction.
function parseArgvFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
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
