import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createGoodMemory } from "./api/createGoodMemory";
import type {
  ExportMemoryResult,
  GoodMemory,
  GoodMemoryConfig,
  RecallInput,
  RecallResult,
} from "./api/contracts";
import { bootstrapHostWorkspace, type BootstrapHostKind } from "./bootstrap/hostBootstrap";
import { normalizeScope, type MemoryScope } from "./domain/scope";
import {
  disableHostWorkspace,
  enableHostWorkspace,
  installHost,
  type InstalledHostKind,
  uninstallHost,
} from "./install/hostInstall";
import {
  type InstalledHostHookCommand,
  executeInstalledHostHook,
} from "./install/hostHookRuntime";
import { resolveInstalledHostContext } from "./install/hostExecutionContext";
import { serveGoodMemoryMcp } from "./install/hostMcpServer";
import type { RecallCandidateTrace } from "./recall/engine";
import type { RecallRouterStrategy } from "./recall/router";
import type { MemoryExtractionStrategy } from "./remember/candidates";
import { resolveStoragePlan } from "./api/runtimeResolution";
import {
  canBootstrapPostgresStorageBackend,
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
  probeReadOnlyPostgresStorageBackend,
  type ReadOnlyPostgresStorageProbeResult,
} from "./storage/postgres";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "./storage/sqlite";
import { createInMemoryVectorStore } from "./storage/memory";

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type ParsedFlags = Record<string, string>;

interface ParsedArgs {
  commands: string[];
  flags: ParsedFlags;
}

interface ProposalLifecycleTrace {
  experienceCount: number;
  experienceKindCounts?: Record<string, number>;
  proposalCount: number;
  proposalStatusCounts?: Record<string, number>;
  promotionCount: number;
  promotionDecisionCounts?: Record<string, number>;
  proposals: Array<{
    id: string;
    proposalType: string;
    status: string;
    summary: string;
    sourceExperienceIds: string[];
    linkedMemoryIds: string[];
    linkedArchiveIds: string[];
    linkedEvidenceIds: string[];
  }>;
  promotions: Array<{
    proposalId: string;
    decision: string;
    policyOutcome: string;
    verificationOutcome: string;
    evalOutcome: string;
  }>;
}

interface CLIStorageConfig {
  provider: NonNullable<GoodMemoryConfig["storage"]>["provider"];
  url?: string;
  displayValue: string;
}

interface DiagnosticMemoryOptions {
  includeVectorStore?: boolean;
  readOnlyStorage?: boolean;
}

export interface CLIStorageResolutionDependencies {
  canBootstrapPostgresStorageBackend?: (config: { url: string }) => Promise<boolean>;
  probeReadOnlyPostgresStorageBackend?: (
    config: { url: string },
  ) => Promise<ReadOnlyPostgresStorageProbeResult>;
  mkdir?: typeof mkdir;
  pathExists?: (path: string) => Promise<boolean>;
}

interface CLICommandOutput {
  json: unknown;
  text: string;
}

interface EvalInspectPayload {
  artifact: Record<string, unknown>;
  caseId: string;
  report: {
    mode?: string;
    runtime?: {
      generationMode?: string;
      judgeMode?: string;
    };
  };
}

interface EvalTracePayload {
  assertions: Record<string, unknown> | null;
  caseId: string;
  proposalTrace: ProposalLifecycleTrace | null;
  rawRecall: Record<string, unknown>;
  trace: Record<string, unknown>;
}

interface InternalDiagnosticGoodMemory extends GoodMemory {
  diagnoseRecall(input: RecallInput): Promise<RecallResult>;
}

const TOP_RECORD_LIMIT = 3;
const TRACE_SUPPRESSED_LIMIT = 8;
const ROOT_HELP_TEXT = [
  "GoodMemory CLI",
  "",
  "Usage",
  "  goodmemory <command> [options]",
  "",
  "Commands",
  "  remember        Write durable memory through the public API",
  "  feedback        Write explicit feedback or correction through the public API",
  "  forget          Delete one durable memory record or clear a scoped target",
  "  inspect         Inspect scope-bounded memory from durable storage",
  "  trace           Run read-only recall diagnostics for a scope and query",
  "  export-memory   Export a memory snapshot plus Markdown artifacts",
  "  stats           Show scope-bounded counts and storage metadata",
  "  install         Install managed global GoodMemory host config for Codex or Claude Code",
  "  uninstall       Remove managed global GoodMemory host config for Codex or Claude Code",
  "  enable          Enable repo-local GoodMemory host opt-in for Codex or Claude Code",
  "  disable         Disable repo-local GoodMemory host opt-in for Codex or Claude Code",
  "  mcp             Run the installed GoodMemory MCP server",
  "  codex           Codex bootstrap and installed hook commands",
  "  claude          Claude Code bootstrap and installed hook commands",
  "  eval            Inspect eval run artifacts",
  "",
  "Help",
  "  goodmemory --help",
  "  goodmemory <command> --help",
  "  goodmemory eval --help",
  "  goodmemory install --help",
  "  goodmemory enable --help",
  "  goodmemory mcp --help",
  "  goodmemory codex --help",
  "  goodmemory claude --help",
].join("\n");
const EVAL_HELP_TEXT = [
  "GoodMemory Eval CLI",
  "",
  "Usage",
  "  goodmemory eval <command> [options]",
  "",
  "Commands",
  "  inspect       Summarize one eval case from a run directory",
  "  trace         Render recall/write/assertion traces for one eval case",
  "  export-case   Copy one eval case artifact to a target path",
  "",
  "Help",
  "  goodmemory eval --help",
  "  goodmemory eval <command> --help",
].join("\n");
const INSPECT_HELP_TEXT = [
  "GoodMemory Inspect",
  "",
  "Usage",
  "  goodmemory inspect --user-id <id> [scope flags] [storage flags] [output flags]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "",
  "Output Flags",
  "  --include-runtime",
  "  --json",
].join("\n");
const TRACE_HELP_TEXT = [
  "GoodMemory Trace",
  "",
  "Usage",
  "  goodmemory trace --user-id <id> --query <text> [scope flags] [diagnostic flags] [storage flags]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Diagnostic Flags",
  "  --query <text>          Required",
  "  --retrieval-profile <general_chat|coding_agent>",
  "  --strategy <auto|rules-only|hybrid|llm-assisted>",
  "  --locale <locale>",
  "  --ignore-memory         Treat recall as an empty set and skip storage lookup",
  "  --json",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
].join("\n");
const EXPORT_MEMORY_HELP_TEXT = [
  "GoodMemory Export Memory",
  "",
  "Usage",
  "  goodmemory export-memory --user-id <id> --output <path> [scope flags] [storage flags] [options]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "",
  "Options",
  "  --output <path>         Required",
  "  --include-runtime",
  "  --force",
].join("\n");
const STATS_HELP_TEXT = [
  "GoodMemory Stats",
  "",
  "Usage",
  "  goodmemory stats --user-id <id> [scope flags] [storage flags] [output flags]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "",
  "Output Flags",
  "  --include-runtime",
  "  --json",
].join("\n");
const INSTALL_HELP_TEXT = [
  "GoodMemory Install CLI",
  "",
  "Usage",
  "  goodmemory install <codex|claude> [options]",
  "",
  "Commands",
  "  codex         Install managed global GoodMemory host config for Codex",
  "  claude        Install managed global GoodMemory host config for Claude Code",
  "",
  "Options",
  "  --user-id <id>            Optional, defaults to the current OS username",
  "  --memory-path <path>      Optional, defaults to ~/.goodmemory/memory.sqlite",
  "  --json",
].join("\n");
const UNINSTALL_HELP_TEXT = [
  "GoodMemory Uninstall CLI",
  "",
  "Usage",
  "  goodmemory uninstall <codex|claude> [--json]",
].join("\n");
const ENABLE_HELP_TEXT = [
  "GoodMemory Enable CLI",
  "",
  "Usage",
  "  goodmemory enable <codex|claude> [options]",
  "",
  "Options",
  "  --workspace-id <id>       Optional, defaults to the workspace folder name",
  "  --workspace-root <path>   Optional, defaults to the current working directory",
  "  --json",
].join("\n");
const DISABLE_HELP_TEXT = [
  "GoodMemory Disable CLI",
  "",
  "Usage",
  "  goodmemory disable <codex|claude> [options]",
  "",
  "Options",
  "  --workspace-root <path>   Optional, defaults to the current working directory",
  "  --json",
].join("\n");
const REMEMBER_HELP_TEXT = [
  "GoodMemory Remember",
  "",
  "Usage",
  "  goodmemory remember --message <text> [scope flags] [write flags] [storage flags] [installed-host flags]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required unless --host derives it from installed host config",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Write Flags",
  "  --message <text>        Required",
  "  --role <user|assistant>",
  "  --extraction-strategy <auto|rules-only|llm-assisted>",
  "  --locale <locale>",
  "",
  "Installed Host Flags",
  "  --host <codex|claude>   Reuse installed host storage and derive missing scope defaults",
  "  --workspace-root <path> Optional, defaults to the current working directory when --host is set",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "",
  "Output Flags",
  "  --json",
].join("\n");
const FEEDBACK_HELP_TEXT = [
  "GoodMemory Feedback",
  "",
  "Usage",
  "  goodmemory feedback --signal <text> [scope flags] [storage flags] [installed-host flags]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required unless --host derives it from installed host config",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Feedback Flags",
  "  --signal <text>         Required",
  "  --locale <locale>",
  "",
  "Installed Host Flags",
  "  --host <codex|claude>   Reuse installed host storage and derive missing scope defaults",
  "  --workspace-root <path> Optional, defaults to the current working directory when --host is set",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "",
  "Output Flags",
  "  --json",
].join("\n");
const FORGET_HELP_TEXT = [
  "GoodMemory Forget",
  "",
  "Usage",
  "  goodmemory forget --memory-id <id> [scope flags] [storage flags] [installed-host flags]",
  "  goodmemory forget --all [scope flags] [storage flags] [installed-host flags] [--include-runtime]",
  "",
  "Scope Flags",
  "  --user-id <id>          Required unless --host derives it from installed host config",
  "  --tenant-id <id>",
  "  --workspace-id <id>",
  "  --agent-id <id>",
  "  --session-id <id>",
  "",
  "Forget Flags",
  "  --memory-id <id>        Delete one durable memory record. Use either this or --all",
  "  --all                  Delete the full durable scope. Use either this or --memory-id",
  "  --include-runtime      Include working memory, journal, and artifact spills when used with --all",
  "",
  "Installed Host Flags",
  "  --host <codex|claude>   Reuse installed host storage and derive missing scope defaults",
  "  --workspace-root <path> Optional, defaults to the current working directory when --host is set",
  "",
  "Storage Flags",
  "  --storage-provider <memory|sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "",
  "Output Flags",
  "  --json",
].join("\n");
const MCP_HELP_TEXT = [
  "GoodMemory MCP CLI",
  "",
  "Usage",
  "  goodmemory mcp <command> [options]",
  "",
  "Commands",
  "  serve         Run the installed GoodMemory MCP server over stdio",
  "",
  "Help",
  "  goodmemory mcp --help",
  "  goodmemory mcp serve --help",
].join("\n");
const MCP_SERVE_HELP_TEXT = [
  "GoodMemory MCP Serve",
  "",
  "Usage",
  "  goodmemory mcp serve --host <codex|claude>",
].join("\n");
const EVAL_INSPECT_HELP_TEXT = [
  "GoodMemory Eval Inspect",
  "",
  "Usage",
  "  goodmemory eval inspect --run-dir <path> --case-id <id> [--json]",
].join("\n");
const EVAL_TRACE_HELP_TEXT = [
  "GoodMemory Eval Trace",
  "",
  "Usage",
  "  goodmemory eval trace --run-dir <path> --case-id <id> [--json]",
].join("\n");
const EVAL_EXPORT_CASE_HELP_TEXT = [
  "GoodMemory Eval Export Case",
  "",
  "Usage",
  "  goodmemory eval export-case --run-dir <path> --case-id <id> --output <path> [--force] [--json]",
].join("\n");
const CODEX_HELP_TEXT = [
  "GoodMemory Codex CLI",
  "",
  "Usage",
  "  goodmemory codex <command> [options]",
  "",
  "Commands",
  "  bootstrap     Generate repo-local Codex wiring on the installed package surface",
  "  hook          Run installed Codex hook handlers from stdin JSON",
  "",
  "Help",
  "  goodmemory codex --help",
  "  goodmemory codex bootstrap --help",
  "  goodmemory codex hook --help",
].join("\n");
const CLAUDE_HELP_TEXT = [
  "GoodMemory Claude CLI",
  "",
  "Usage",
  "  goodmemory claude <command> [options]",
  "",
  "Commands",
  "  bootstrap     Generate repo-local Claude Code wiring on the installed package surface",
  "  hook          Run installed Claude Code hook handlers from stdin JSON",
  "",
  "Help",
  "  goodmemory claude --help",
  "  goodmemory claude bootstrap --help",
  "  goodmemory claude hook --help",
].join("\n");
const CODEX_BOOTSTRAP_HELP_TEXT = [
  "GoodMemory Codex Bootstrap",
  "",
  "Usage",
  "  goodmemory codex bootstrap --user-id <id> [--workspace-id <id>] [--workspace-root <path>] [--json]",
].join("\n");
const CLAUDE_BOOTSTRAP_HELP_TEXT = [
  "GoodMemory Claude Bootstrap",
  "",
  "Usage",
  "  goodmemory claude bootstrap --user-id <id> [--workspace-id <id>] [--workspace-root <path>] [--json]",
].join("\n");
const CODEX_HOOK_HELP_TEXT = [
  "GoodMemory Codex Hook",
  "",
  "Usage",
  "  goodmemory codex hook <session-start|user-prompt-submit>",
  "",
  "Commands",
  "  session-start        Read Codex SessionStart JSON from stdin and emit additionalContext JSON",
  "  user-prompt-submit   Read Codex UserPromptSubmit JSON from stdin and emit additionalContext JSON",
].join("\n");
const CLAUDE_HOOK_HELP_TEXT = [
  "GoodMemory Claude Hook",
  "",
  "Usage",
  "  goodmemory claude hook <session-start|user-prompt-submit>",
  "",
  "Commands",
  "  session-start        Read Claude SessionStart JSON from stdin and emit additionalContext JSON",
  "  user-prompt-submit   Read Claude UserPromptSubmit JSON from stdin and emit additionalContext JSON",
].join("\n");

function parseArgs(argv: string[]): ParsedArgs {
  const commands: string[] = [];
  const flags: ParsedFlags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      commands.push(token);
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

  return {
    commands,
    flags,
  };
}

function flagEnabled(flags: ParsedFlags, name: string): boolean {
  return flags[name] === "true";
}

function helpRequested(flags: ParsedFlags): boolean {
  return flagEnabled(flags, "help");
}

function requireFlag(flags: ParsedFlags, name: string): string {
  const value = flags[name];
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }

  return value;
}

function helpResult(text: string): CLIResult {
  return {
    exitCode: 0,
    stderr: "",
    stdout: `${text}\n`,
  };
}

function errorResult(message: string): CLIResult {
  return {
    exitCode: 1,
    stderr: message,
    stdout: "",
  };
}

function clipText(content: string, maxLength = 100): string {
  return content.length <= maxLength
    ? content
    : `${content.slice(0, maxLength - 3)}...`;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function formatCountBreakdown(
  counts: Record<string, number> | undefined,
): string | null {
  if (!counts || Object.keys(counts).length === 0) {
    return null;
  }

  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function formatCountLine(
  label: string,
  total: number | undefined,
  counts: Record<string, number> | undefined,
): string {
  if (total === undefined) {
    return `${label}: unknown`;
  }

  const breakdown = formatCountBreakdown(counts);
  return breakdown ? `${label}: ${total} (${breakdown})` : `${label}: ${total}`;
}

function formatScope(scope: MemoryScope): string {
  const parts = [
    `user=${scope.userId}`,
    ...(scope.tenantId ? [`tenant=${scope.tenantId}`] : []),
    ...(scope.workspaceId ? [`workspace=${scope.workspaceId}`] : []),
    ...(scope.agentId ? [`agent=${scope.agentId}`] : []),
    ...(scope.sessionId ? [`session=${scope.sessionId}`] : []),
  ];

  return parts.join(", ");
}

function resolveSQLiteURL(rawPath: string | undefined): string {
  if (!rawPath || rawPath.trim().length === 0) {
    return resolve(".goodmemory/memory.sqlite");
  }

  return rawPath === ":memory:" ? rawPath : resolve(rawPath);
}

function describeStorageProbeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

export async function resolveStorageConfig(
  flags: ParsedFlags,
  options?: DiagnosticMemoryOptions,
  dependencies?: CLIStorageResolutionDependencies,
): Promise<CLIStorageConfig> {
  const pathExistsFn = dependencies?.pathExists ?? pathExists;
  const mkdirFn = dependencies?.mkdir ?? mkdir;
  const canBootstrapPostgresBackend =
    dependencies?.canBootstrapPostgresStorageBackend ??
    canBootstrapPostgresStorageBackend;
  const probeReadOnlyPostgresBackend =
    dependencies?.probeReadOnlyPostgresStorageBackend ??
    probeReadOnlyPostgresStorageBackend;
  const plan = resolveStoragePlan({
    storage: {
      provider:
        flags["storage-provider"] === undefined
          ? undefined
          : (flags["storage-provider"] as CLIStorageConfig["provider"]),
      url: flags["storage-url"],
    },
  });

  if (plan.mode === "explicit") {
    if (plan.storage.provider === "postgres") {
      return {
        provider: "postgres",
        url: plan.storage.url,
        displayValue: "configured",
      };
    }

    if (plan.storage.provider === "memory") {
      return {
        provider: "memory",
        displayValue: "in-memory",
      };
    }

    const url = resolveSQLiteURL(plan.storage.url);
    if (options?.readOnlyStorage && url !== ":memory:" && !(await pathExistsFn(url))) {
      throw new Error(
        `Read-only CLI commands require an existing sqlite database at ${url}; they do not create local sqlite state implicitly.`,
      );
    }

    if (!options?.readOnlyStorage && url !== ":memory:") {
      await mkdirFn(dirname(url), { recursive: true });
    }

    return {
      provider: "sqlite",
      url,
      displayValue: url,
    };
  }

  if (plan.postgresUrl) {
    try {
      if (options?.readOnlyStorage) {
        const probe = await probeReadOnlyPostgresBackend({
          url: plan.postgresUrl,
        });

        if (probe === "readable") {
          return {
            provider: "postgres",
            url: plan.postgresUrl,
            displayValue: "configured",
          };
        }

        if (probe === "inconclusive") {
          throw new Error(
            [
              "CLI auto storage could not safely determine whether the configured postgres backend remains the durable authority without mutating state.",
              "Falling back to sqlite would inspect the wrong durable authority.",
            ].join(" "),
          );
        }
      } else if (
        await canBootstrapPostgresBackend({
          url: plan.postgresUrl,
        })
      ) {
        return {
          provider: "postgres",
          url: plan.postgresUrl,
          displayValue: "configured",
        };
      }
    } catch (error) {
      if (options?.readOnlyStorage) {
        throw new Error(
          [
            "CLI auto storage could not verify the configured postgres backend without mutating durable authority.",
            "Falling back to sqlite would inspect the wrong durable authority.",
            `Underlying error: ${describeStorageProbeError(error)}`,
          ].join(" "),
        );
      }

      throw new Error(
        [
          "CLI auto storage could not establish the configured postgres backend as usable durable authority.",
          "Falling back to sqlite would inspect the wrong durable authority.",
          `Underlying error: ${describeStorageProbeError(error)}`,
        ].join(" "),
      );
    }
  }

  const url = resolveSQLiteURL(
    "sqliteUrl" in plan ? plan.sqliteUrl : undefined,
  );
  if (options?.readOnlyStorage && url !== ":memory:" && !(await pathExistsFn(url))) {
    throw new Error(
      `Read-only CLI commands require an existing sqlite database at ${url}; they do not create local sqlite state implicitly.`,
    );
  }

  if (!options?.readOnlyStorage && url !== ":memory:") {
    await mkdirFn(dirname(url), { recursive: true });
  }

  return {
    provider: "sqlite",
    url,
    displayValue: url,
  };
}

async function createDiagnosticMemory(
  flags: ParsedFlags,
  options?: DiagnosticMemoryOptions,
): Promise<{
  memory: InternalDiagnosticGoodMemory;
  storage: CLIStorageConfig;
}> {
  const storage = await resolveStorageConfig(flags, options);
  const readOnlySQLiteAdapters =
    options?.readOnlyStorage &&
    storage.provider === "sqlite" &&
    storage.url &&
    storage.url !== ":memory:"
      ? {
          documentStore: createSQLiteDocumentStore(storage.url, {
            readOnly: true,
          }),
          sessionStore: createSQLiteSessionStore(storage.url, {
            readOnly: true,
          }),
          vectorStore:
            options?.includeVectorStore === false
              ? createInMemoryVectorStore()
              : createSQLiteVectorStore(storage.url, {
                  readOnly: true,
                }),
        }
      : undefined;
  const readOnlyPostgresAdapters =
    options?.readOnlyStorage &&
    storage.provider === "postgres" &&
    storage.url
      ? {
          documentStore: createPostgresDocumentStore(
            { url: storage.url },
            { readOnly: true },
          ),
          sessionStore: createPostgresSessionStore(
            { url: storage.url },
            { readOnly: true },
          ),
          vectorStore:
            options?.includeVectorStore === false
              ? createInMemoryVectorStore()
              : createPostgresVectorStore(
                  { url: storage.url },
                  { readOnly: true },
                ),
        }
      : undefined;

  return {
    memory: createGoodMemory({
      adapters: readOnlySQLiteAdapters ?? readOnlyPostgresAdapters,
      storage: {
        provider: storage.provider,
        url: storage.url,
      },
    }) as InternalDiagnosticGoodMemory,
    storage,
  };
}

function createIgnoredDiagnosticMemory(): {
  memory: InternalDiagnosticGoodMemory;
  storage: CLIStorageConfig;
} {
  return {
    memory: createGoodMemory({
      storage: {
        provider: "memory",
      },
    }) as InternalDiagnosticGoodMemory,
    storage: {
      provider: "memory",
      displayValue: "ignored (--ignore-memory)",
    },
  };
}

interface WriteExecutionContext {
  host?: InstalledHostKind;
  memory: GoodMemory;
  scope: MemoryScope;
  storage: CLIStorageConfig;
  workspaceRoot?: string;
}

async function resolveWriteExecutionContext(
  flags: ParsedFlags,
): Promise<WriteExecutionContext> {
  const host = flags.host ? requireInstalledHostKind(flags.host) : undefined;

  if (!host) {
    const storage = await resolveStorageConfig(flags);
    return {
      memory: createGoodMemory({
        storage: {
          provider: storage.provider,
          url: storage.url,
        },
      }),
      scope: resolveScopeFromFlags(flags),
      storage,
    };
  }

  const resolved = await resolveInstalledHostContext({
    cwd: flags["workspace-root"],
    host,
    sessionId: flags["session-id"],
  });
  if (resolved.status !== "ok") {
    throw new Error(buildInstalledHostWriteErrorMessage(host, resolved));
  }

  const hasExplicitStorage =
    flags["storage-provider"] !== undefined || flags["storage-url"] !== undefined;
  const storage = hasExplicitStorage
    ? await resolveStorageConfig(flags)
    : {
        provider: resolved.context.storage?.provider ?? "memory",
        url: resolved.context.storage?.url,
        displayValue: describeStorageDisplayValue({
          provider: resolved.context.storage?.provider ?? "memory",
          url: resolved.context.storage?.url ?? "",
        }),
      };
  const scope = normalizeScope({
    userId: flags["user-id"] ?? resolved.context.scope.userId,
    tenantId: flags["tenant-id"],
    workspaceId: flags["workspace-id"] ?? resolved.context.scope.workspaceId,
    agentId: flags["agent-id"] ?? resolved.context.scope.agentId,
    sessionId: flags["session-id"] ?? resolved.context.scope.sessionId,
  });

  return {
    host,
    memory: createGoodMemory({
      storage: {
        provider: storage.provider,
        url: storage.url,
      },
    }),
    scope,
    storage,
    workspaceRoot: resolved.context.workspaceRoot,
  };
}

function buildInstalledHostWriteErrorMessage(
  host: InstalledHostKind,
  resolved: Exclude<
    Awaited<ReturnType<typeof resolveInstalledHostContext>>,
    { status: "ok" }
  >,
): string {
  if (resolved.status === "missing_global_config") {
    return `Run 'goodmemory install ${host}' first before using '--host ${host}'.`;
  }
  if (resolved.status === "invalid_global_config") {
    return `Installed ${host} host config is invalid. Reinstall with 'goodmemory install ${host}' or fix ~/.goodmemory/${host}.json before using '--host ${host}'.`;
  }
  if (resolved.status === "invalid_repo_config") {
    return `Installed ${host} repo config at ${join(resolved.workspaceRoot, ".goodmemory", `${host}.json`)} is invalid. Fix it before using '--host ${host}'.`;
  }

  return `Run 'goodmemory enable ${host} --workspace-root ${resolved.workspaceRoot}' first before using '--host ${host}'.`;
}

function resolveScopeFromFlags(flags: ParsedFlags): MemoryScope {
  return normalizeScope({
    userId: requireFlag(flags, "user-id"),
    tenantId: flags["tenant-id"],
    workspaceId: flags["workspace-id"],
    agentId: flags["agent-id"],
    sessionId: flags["session-id"],
  });
}

function shouldIncludeRuntime(flags: ParsedFlags, scope: MemoryScope): boolean {
  return flagEnabled(flags, "include-runtime") || scope.sessionId !== undefined;
}

function describeStorageDisplayValue(storage: {
  provider: "memory" | "postgres" | "sqlite";
  url?: string;
}): string {
  if (storage.provider === "memory") {
    return "in-memory";
  }
  if (storage.provider === "postgres") {
    return "configured";
  }

  return storage.url ?? "configured";
}

function countActiveRecords<TRecord extends { lifecycle?: string }>(
  records: TRecord[],
): number {
  return records.filter(isCurrentInspectRecord).length;
}

function isCurrentInspectRecord<TRecord extends { lifecycle?: string }>(
  record: TRecord,
): boolean {
  return record.lifecycle !== "superseded";
}

function buildProfileSummary(
  result: ExportMemoryResult,
): Record<string, unknown> | null {
  if (!result.durable.profile) {
    return null;
  }

  return {
    currentProjects: result.durable.profile.activeContext.currentProjects,
    goals: result.durable.profile.activeContext.goals,
    languagePreference:
      result.durable.profile.identity.languagePreference ?? null,
    location: result.durable.profile.identity.location ?? null,
    name: result.durable.profile.identity.name ?? null,
    organization: result.durable.profile.identity.organization ?? null,
    role: result.durable.profile.identity.role ?? null,
    timezone: result.durable.profile.identity.timezone ?? null,
  };
}

function sortByTimestamp<TRecord>(
  records: TRecord[],
  selector: (record: TRecord) => string,
): TRecord[] {
  return [...records].sort((left, right) => {
    const updated = selector(right).localeCompare(selector(left));
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(JSON.stringify(left), JSON.stringify(right));
  });
}

function selectCurrentTopTimestampedRecords<TRecord extends { lifecycle?: string }>(
  records: TRecord[],
  selector: (record: TRecord) => string,
): TRecord[] {
  return sortByTimestamp(
    records.filter(isCurrentInspectRecord),
    selector,
  ).slice(0, TOP_RECORD_LIMIT);
}

function buildInspectPayload(input: {
  result: ExportMemoryResult;
  storage: CLIStorageConfig;
}): Record<string, unknown> {
  const { result, storage } = input;
  const facts = selectCurrentTopTimestampedRecords(
    result.durable.facts,
    (record) => record.updatedAt,
  );
  const references = selectCurrentTopTimestampedRecords(
    result.durable.references,
    (record) => record.updatedAt,
  );
  const feedback = selectCurrentTopTimestampedRecords(
    result.durable.feedback,
    (record) => record.updatedAt,
  );
  const proposals = sortByTimestamp(
    result.durable.proposals,
    (record) => record.updatedAt,
  ).slice(0, TOP_RECORD_LIMIT);
  const promotions = sortByTimestamp(
    result.durable.promotions,
    (record) => record.decidedAt,
  ).slice(0, TOP_RECORD_LIMIT);

  return {
    counts: {
      archives: result.durable.archives.length,
      episodes: result.durable.episodes.length,
      evidence: result.durable.evidence.length,
      experiences: result.durable.experiences.length,
      facts: result.durable.facts.length,
      feedback: result.durable.feedback.length,
      preferences: result.durable.preferences.length,
      profile: result.durable.profile ? 1 : 0,
      promotions: result.durable.promotions.length,
      proposals: result.durable.proposals.length,
      references: result.durable.references.length,
      runtimeSpills: result.runtime?.spills.length ?? 0,
    },
    profile: buildProfileSummary(result),
    runtime: result.runtime
      ? {
          journal: result.runtime.journal ? 1 : 0,
          spills: result.runtime.spills.length,
          workingMemory: result.runtime.workingMemory ? 1 : 0,
        }
      : null,
    scope: result.scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
    topRecords: {
      facts: facts.map((record) => ({
        content: record.content,
        lifecycle: record.lifecycle,
        subject: record.subject ?? null,
      })),
      feedback: feedback.map((record) => ({
        kind: record.kind,
        lifecycle: record.lifecycle,
        rule: record.rule,
      })),
      promotions: promotions.map((record) => ({
        decision: record.decision,
        proposalId: record.proposalId,
        summary: record.summary,
      })),
      proposals: proposals.map((record) => ({
        status: record.status,
        summary: record.summary,
        type: record.proposalType,
      })),
      references: references.map((record) => ({
        lifecycle: record.lifecycle,
        pointer: record.pointer,
        title: record.title,
      })),
    },
  };
}

function renderInspectPayload(payload: Record<string, unknown>): string {
  const counts = payload.counts as Record<string, unknown>;
  const storage = payload.storage as Record<string, unknown>;
  const runtime = payload.runtime as Record<string, unknown> | null;
  const profile = payload.profile as Record<string, unknown> | null;
  const topRecords = payload.topRecords as Record<string, unknown>;
  const facts = topRecords.facts as Array<Record<string, unknown>>;
  const references = topRecords.references as Array<Record<string, unknown>>;
  const feedback = topRecords.feedback as Array<Record<string, unknown>>;
  const proposals = topRecords.proposals as Array<Record<string, unknown>>;
  const promotions = topRecords.promotions as Array<Record<string, unknown>>;

  return [
    `Scope: ${formatScope(payload.scope as unknown as MemoryScope)}`,
    `Storage: ${storage.provider} (${storage.location})`,
    `Profile: ${profile ? "present" : "absent"}`,
    `Preferences: ${counts.preferences}`,
    `References: ${counts.references}`,
    `Facts: ${counts.facts}`,
    `Feedback: ${counts.feedback}`,
    `Archives: ${counts.archives}`,
    `Evidence: ${counts.evidence}`,
    `Episodes: ${counts.episodes}`,
    `Experiences: ${counts.experiences}`,
    `Proposals: ${counts.proposals}`,
    `Promotions: ${counts.promotions}`,
    `Runtime: ${
      runtime
        ? `workingMemory=${runtime.workingMemory}, journal=${runtime.journal}, spills=${runtime.spills}`
        : "not requested"
    }`,
    ...(profile
      ? [
          "",
          "Profile Summary",
          `- name: ${profile.name ?? "unknown"}`,
          `- role: ${profile.role ?? "unknown"}`,
          `- location: ${profile.location ?? "unknown"}`,
          `- current projects: ${
            ((profile.currentProjects as string[]) ?? []).join(", ") || "none"
          }`,
        ]
      : []),
    "",
    "Top Facts",
    ...(facts.length > 0
      ? facts.map(
          (record) =>
            `- ${record.content}${
              record.subject
                ? ` [subject=${record.subject}]`
                : ""
            }`,
        )
      : ["- none"]),
    "",
    "Top References",
    ...(references.length > 0
      ? references.map(
          (record) =>
            `- ${record.title} -> ${record.pointer}`,
        )
      : ["- none"]),
    "",
    "Top Feedback",
    ...(feedback.length > 0
      ? feedback.map(
          (record) =>
            `- ${record.kind}: ${record.rule}`,
        )
      : ["- none"]),
    "",
    "Top Proposals",
    ...(proposals.length > 0
      ? proposals.map(
          (record) =>
            `- ${record.type} / ${record.status}: ${clipText(String(record.summary))}`,
        )
      : ["- none"]),
    "",
    "Top Promotions",
    ...(promotions.length > 0
      ? promotions.map(
          (record) =>
            `- ${record.proposalId} -> ${record.decision}: ${clipText(String(record.summary))}`,
        )
      : ["- none"]),
  ].join("\n");
}

function buildStatsPayload(input: {
  result: ExportMemoryResult;
  storage: CLIStorageConfig;
}): Record<string, unknown> {
  const { result, storage } = input;

  return {
    counts: {
      archives: result.durable.archives.length,
      episodes: result.durable.episodes.length,
      evidence: result.durable.evidence.length,
      experiences: result.durable.experiences.length,
      facts: result.durable.facts.length,
      factsActive: countActiveRecords(result.durable.facts),
      feedback: result.durable.feedback.length,
      feedbackActive: countActiveRecords(result.durable.feedback),
      preferences: result.durable.preferences.length,
      profile: result.durable.profile ? 1 : 0,
      promotions: result.durable.promotions.length,
      proposals: result.durable.proposals.length,
      references: result.durable.references.length,
      referencesActive: countActiveRecords(result.durable.references),
    },
    runtime: result.runtime
      ? {
          journal: result.runtime.journal ? 1 : 0,
          spills: result.runtime.spills.length,
          workingMemory: result.runtime.workingMemory ? 1 : 0,
        }
      : null,
    scope: result.scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };
}

function renderStatsPayload(payload: Record<string, unknown>): string {
  const counts = payload.counts as Record<string, unknown>;
  const storage = payload.storage as Record<string, unknown>;
  const runtime = payload.runtime as Record<string, unknown> | null;

  return [
    `Scope: ${formatScope(payload.scope as unknown as MemoryScope)}`,
    `Storage Provider: ${storage.provider}`,
    `Storage Location: ${storage.location}`,
    `Profile Records: ${counts.profile}`,
    `Preferences: ${counts.preferences}`,
    `References: ${counts.references} (active=${counts.referencesActive})`,
    `Facts: ${counts.facts} (active=${counts.factsActive})`,
    `Feedback: ${counts.feedback} (active=${counts.feedbackActive})`,
    `Episodes: ${counts.episodes}`,
    `Archives: ${counts.archives}`,
    `Evidence: ${counts.evidence}`,
    `Experiences: ${counts.experiences}`,
    `Proposals: ${counts.proposals}`,
    `Promotions: ${counts.promotions}`,
    `Runtime: ${
      runtime
        ? `workingMemory=${runtime.workingMemory}, journal=${runtime.journal}, spills=${runtime.spills}`
        : "not requested"
    }`,
  ].join("\n");
}

function parseRetrievalProfile(flags: ParsedFlags): "coding_agent" | "general_chat" {
  const profile = flags["retrieval-profile"] ?? "general_chat";
  if (profile === "coding_agent" || profile === "general_chat") {
    return profile;
  }

  throw new Error(
    `Unsupported retrieval profile: ${profile}. Expected general_chat|coding_agent.`,
  );
}

function parseRememberRole(flags: ParsedFlags): "assistant" | "user" {
  const role = flags.role ?? "user";
  if (role === "assistant" || role === "user") {
    return role;
  }

  throw new Error(
    `Unsupported remember role: ${role}. Expected user|assistant.`,
  );
}

function parseExtractionStrategy(flags: ParsedFlags): MemoryExtractionStrategy {
  const strategy = flags["extraction-strategy"] ?? "auto";
  if (
    strategy === "auto" ||
    strategy === "llm-assisted" ||
    strategy === "rules-only"
  ) {
    return strategy;
  }

  throw new Error(
    `Unsupported extraction strategy: ${strategy}. Expected auto|rules-only|llm-assisted.`,
  );
}

function parseRecallStrategy(flags: ParsedFlags): RecallRouterStrategy {
  const strategy = flags.strategy ?? "auto";
  if (
    strategy === "auto" ||
    strategy === "rules-only" ||
    strategy === "hybrid" ||
    strategy === "llm-assisted"
  ) {
    return strategy;
  }

  throw new Error(
    `Unsupported recall strategy: ${strategy}. Expected auto|rules-only|hybrid|llm-assisted.`,
  );
}

function buildTracePayload(input: {
  query: string;
  recall: RecallResult;
  scope: MemoryScope;
  storage: CLIStorageConfig;
}): Record<string, unknown> {
  return {
    candidateTraceCount: input.recall.metadata.candidateTraces.length,
    candidateTraces: input.recall.metadata.candidateTraces,
    hits: input.recall.metadata.hits,
    policyApplied: input.recall.metadata.policyApplied,
    query: input.query,
    routingDecision: input.recall.metadata.routingDecision,
    scope: input.scope,
    storage: {
      location: input.storage.displayValue,
      provider: input.storage.provider,
    },
    verificationHints: input.recall.metadata.verificationHints,
  };
}

function formatCandidateTrace(trace: RecallCandidateTrace): string {
  const outcome = trace.returned
    ? trace.whyReturned ?? "returned"
    : trace.whySuppressed ?? "suppressed";

  return `- ${trace.memoryType}:${trace.memoryId} slot=${trace.slot} ${
    trace.returned ? "returned" : "suppressed"
  } ${clipText(outcome, 160)}`;
}

function renderTracePayload(payload: Record<string, unknown>): string {
  const routingDecision =
    payload.routingDecision as RecallResult["metadata"]["routingDecision"];
  const hits = payload.hits as RecallResult["metadata"]["hits"];
  const candidateTraces =
    payload.candidateTraces as unknown as RecallCandidateTrace[];
  const verificationHints =
    payload.verificationHints as RecallResult["metadata"]["verificationHints"];
  const returned = candidateTraces.filter((trace) => trace.returned);
  const suppressed = candidateTraces
    .filter((trace) => !trace.returned)
    .slice(0, TRACE_SUPPRESSED_LIMIT);
  const policyApplied = payload.policyApplied as string[];
  const storage = payload.storage as Record<string, unknown>;

  return [
    `Scope: ${formatScope(payload.scope as unknown as MemoryScope)}`,
    `Storage: ${storage.provider} (${storage.location})`,
    `Query: ${payload.query}`,
    "",
    "Routing Decision",
    `- requested strategy: ${routingDecision.strategyExplanation.requestedStrategy}`,
    `- resolved strategy: ${routingDecision.strategyExplanation.resolvedStrategy}`,
    `- retrieval profile: ${routingDecision.retrievalProfile}`,
    `- intent: ${routingDecision.intent}`,
    `- explanation: ${routingDecision.strategyExplanation.summary}`,
    "",
    "Hits",
    ...(hits.length > 0
      ? hits.map(
          (hit) =>
            `- ${hit.type}: ${hit.reason ?? "no_reason"}${
              hit.evidenceIds?.length ? ` [evidence=${hit.evidenceIds.join(",")}]` : ""
            }`,
        )
      : ["- none"]),
    "",
    "Returned Candidate Traces",
    ...(returned.length > 0 ? returned.map(formatCandidateTrace) : ["- none"]),
    "",
    "Suppressed Candidate Traces",
    ...(suppressed.length > 0
      ? suppressed.map(formatCandidateTrace)
      : ["- none"]),
    "",
    "Verification Hints",
    ...(verificationHints.length > 0
      ? verificationHints.map(
          (hint) =>
            `- ${hint.memoryType}:${hint.memoryId} ${clipText(hint.reason, 160)}${
              hint.evidenceIds?.length ? ` [evidence=${hint.evidenceIds.join(",")}]` : ""
            }`,
        )
      : ["- none"]),
    "",
    "Policy Applied",
    ...(policyApplied.length > 0 ? policyApplied.map((item) => `- ${item}`) : ["- none"]),
  ].join("\n");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeExportMemoryOutput(input: {
  force: boolean;
  outputPath: string;
  result: ExportMemoryResult;
}): Promise<void> {
  if ((await pathExists(input.outputPath)) && !input.force) {
    throw new Error(
      `Output path already exists: ${input.outputPath}. Pass --force to overwrite.`,
    );
  }

  if (input.force) {
    await rm(input.outputPath, { force: true, recursive: true });
  }

  await mkdir(input.outputPath, { recursive: true });
  await writeFile(
    join(input.outputPath, "memory-export.json"),
    `${JSON.stringify(input.result, null, 2)}\n`,
    "utf8",
  );

  for (const file of input.result.artifacts.files) {
    const destination = join(
      input.outputPath,
      input.result.artifacts.rootPath,
      file.relativePath,
    );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
}

async function exportCaseArtifact(input: {
  caseId: string;
  force: boolean;
  outputPath: string;
  runDir: string;
}): Promise<void> {
  if ((await pathExists(input.outputPath)) && !input.force) {
    throw new Error(
      `Output path already exists: ${input.outputPath}. Pass --force to overwrite.`,
    );
  }

  if (input.force) {
    await rm(input.outputPath, { force: true });
  }

  await mkdir(dirname(input.outputPath), { recursive: true });
  await copyFile(
    join(input.runDir, "cases", `${input.caseId}.json`),
    input.outputPath,
  );
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function inspectEvalCase(
  runDir: string,
  caseId: string,
): Promise<EvalInspectPayload> {
  return {
    artifact: await readJson<Record<string, unknown>>(
      join(runDir, "cases", `${caseId}.json`),
    ),
    caseId,
    report: await readJson<EvalInspectPayload["report"]>(join(runDir, "report.json")),
  };
}

function renderEvalInspectPayload(payload: EvalInspectPayload): string {
  const artifact = payload.artifact as {
    assertions?: {
      contaminationFindings?: string[];
      passedChecks?: number;
      totalChecks?: number;
      updateFindings?: string[];
    };
    goodmemory?: {
      retrieved?: {
        archives?: unknown[];
        episodes?: unknown[];
        evidence?: unknown[];
        facts?: unknown[];
        feedback?: unknown[];
        policyApplied?: string[];
        preferences?: unknown[];
        references?: unknown[];
      };
      trace?: {
        proposalLifecycle?: ProposalLifecycleTrace | null;
        recallHitCount?: number;
      };
    };
    judge: { winner: string };
    metadata?: {
      evaluationSetting?: string;
      memorySourceDomains?: string[];
      targetDomain?: string;
      taskFamily?: string;
    };
  };
  const retrieved = artifact.goodmemory?.retrieved;
  const proposalLifecycle = artifact.goodmemory?.trace?.proposalLifecycle ?? null;

  return [
    `Run Mode: ${payload.report.mode ?? "unknown"}`,
    `Runtime: generation=${payload.report.runtime?.generationMode ?? "unknown"}, judge=${
      payload.report.runtime?.judgeMode ?? "unknown"
    }`,
    `Case: ${payload.caseId}`,
    `Task Family: ${artifact.metadata?.taskFamily ?? "unknown"}`,
    `Setting: ${artifact.metadata?.evaluationSetting ?? "unknown"}`,
    `Target Domain: ${artifact.metadata?.targetDomain ?? "unknown"}`,
    `Memory Source Domains: ${
      artifact.metadata?.memorySourceDomains?.join(", ") ?? "unknown"
    }`,
    `Winner: ${artifact.judge.winner}`,
    `References: ${retrieved?.references?.length ?? 0}`,
    `Facts: ${retrieved?.facts?.length ?? 0}`,
    `Feedback: ${retrieved?.feedback?.length ?? 0}`,
    `Archives: ${retrieved?.archives?.length ?? 0}`,
    `Evidence: ${retrieved?.evidence?.length ?? 0}`,
    `Episodes: ${retrieved?.episodes?.length ?? 0}`,
    formatCountLine(
      "Experience Records",
      proposalLifecycle?.experienceCount,
      proposalLifecycle?.experienceKindCounts,
    ),
    formatCountLine(
      "Proposals",
      proposalLifecycle?.proposalCount,
      proposalLifecycle?.proposalStatusCounts,
    ),
    formatCountLine(
      "Promotions",
      proposalLifecycle?.promotionCount,
      proposalLifecycle?.promotionDecisionCounts,
    ),
    `Recall Hits: ${artifact.goodmemory?.trace?.recallHitCount ?? 0}`,
    `Assertions: ${
      artifact.assertions
        ? `${artifact.assertions.passedChecks ?? 0}/${artifact.assertions.totalChecks ?? 0} passed`
        : "unknown"
    }`,
    `Contamination Findings: ${
      artifact.assertions?.contaminationFindings?.length ?? 0
    }`,
    `Update Findings: ${artifact.assertions?.updateFindings?.length ?? 0}`,
    `Policy Applied: ${
      retrieved?.policyApplied?.length ? retrieved.policyApplied.join(", ") : "none"
    }`,
  ].join("\n");
}

async function traceEvalCase(
  runDir: string,
  caseId: string,
): Promise<EvalTracePayload> {
  const trace = await readJson<Record<string, unknown>>(
    join(runDir, "traces", caseId, "goodmemory.json"),
  );
  const rawRecall = await readJson<Record<string, unknown>>(
    join(runDir, "traces", caseId, "raw-recall.json"),
  );
  const assertions = await readOptionalJson<Record<string, unknown>>(
    join(runDir, "traces", caseId, "assertions.json"),
  );
  const proposalTrace =
    (await readOptionalJson<ProposalLifecycleTrace>(
      join(runDir, "traces", caseId, "proposal-trace.json"),
    )) ??
    ((trace.trace as { proposalLifecycle?: ProposalLifecycleTrace | null })
      ?.proposalLifecycle ??
      null);

  return {
    assertions,
    caseId,
    proposalTrace,
    rawRecall,
    trace,
  };
}

function renderEvalTracePayload(payload: EvalTracePayload): string {
  const trace = payload.trace as {
    trace: {
      rememberEvents: Array<{
        accepted: number;
        events?: Array<{ memoryType: string; reason?: string }>;
        rejected: number;
        sessionId: string;
      }>;
    };
  };
  const rawRecall = payload.rawRecall as {
    hits?: Array<{ evidenceIds?: string[]; reason?: string; type: string }>;
    policyApplied?: string[];
    routingDecision?: {
      strategy?: string;
      strategyExplanation?: { summary?: string };
    };
    verificationHints?: Array<{
      evidenceIds?: string[];
      memoryType: string;
      reason: string;
    }>;
  };
  const assertions = payload.assertions as
    | {
        checks: Array<{ details: string[]; id: string; passed: boolean }>;
        contaminationFindings: string[];
        updateFindings: string[];
      }
    | null;
  const proposalTrace = payload.proposalTrace;

  const writeLines = trace.trace.rememberEvents.flatMap((session) => {
    const header = `- ${session.sessionId}: accepted=${session.accepted}, rejected=${session.rejected}`;
    const events = (session.events ?? []).map(
      (event) => `  * ${event.memoryType}: ${event.reason ?? "no_reason"}`,
    );
    return [header, ...events];
  });

  const hitLines = (rawRecall.hits ?? []).map(
    (hit) =>
      `- ${hit.type}: ${hit.reason ?? "no_reason"}${
        hit.evidenceIds?.length ? ` [evidence=${hit.evidenceIds.join(",")}]` : ""
      }`,
  );
  const routerLines = rawRecall.routingDecision
    ? [
        `- strategy: ${rawRecall.routingDecision.strategy ?? "unknown"}`,
        `- explanation: ${
          rawRecall.routingDecision.strategyExplanation?.summary ?? "no_explanation"
        }`,
      ]
    : ["- unavailable"];
  const verificationLines = (rawRecall.verificationHints ?? []).map(
    (hint) =>
      `- ${hint.memoryType}: ${hint.reason}${
        hint.evidenceIds?.length ? ` [evidence=${hint.evidenceIds.join(",")}]` : ""
      }`,
  );
  const policyLines = (rawRecall.policyApplied ?? []).map((policy) => `- ${policy}`);
  const proposalLines = proposalTrace
    ? [
        `- experiences: ${proposalTrace.experienceCount}${
          formatCountBreakdown(proposalTrace.experienceKindCounts)
            ? ` [${formatCountBreakdown(proposalTrace.experienceKindCounts)}]`
            : ""
        }`,
        `- proposals: ${proposalTrace.proposalCount}${
          formatCountBreakdown(proposalTrace.proposalStatusCounts)
            ? ` [${formatCountBreakdown(proposalTrace.proposalStatusCounts)}]`
            : ""
        }`,
        ...proposalTrace.proposals.map(
          (proposal) =>
            `- ${proposal.proposalType} / ${proposal.status}: ${clipText(proposal.summary)} ` +
            `[source=${proposal.sourceExperienceIds.length} memory=${proposal.linkedMemoryIds.length} ` +
            `archive=${proposal.linkedArchiveIds.length} evidence=${proposal.linkedEvidenceIds.length}]`,
        ),
      ]
    : ["- unavailable"];
  const promotionLines = proposalTrace
    ? proposalTrace.promotions.map(
        (promotion) =>
          `- ${promotion.proposalId} -> ${promotion.decision} ` +
          `[policy=${promotion.policyOutcome} verification=${promotion.verificationOutcome} eval=${promotion.evalOutcome}]`,
      )
    : ["- unavailable"];
  const assertionLines = assertions
    ? assertions.checks.map(
        (check) =>
          `- ${check.id}: ${check.passed ? "pass" : "fail"} (${check.details.join(", ")})`,
      )
    : ["- unavailable (legacy run)"];

  return [
    "Write Trace",
    ...writeLines,
    "",
    "Recall Hits",
    ...hitLines,
    "",
    "Router Strategy",
    ...routerLines,
    "",
    "Verification Hints",
    ...(verificationLines.length > 0 ? verificationLines : ["- none"]),
    "",
    "Policy Applied",
    ...(policyLines.length > 0 ? policyLines : ["- none"]),
    "",
    "Proposal Lifecycle",
    ...(proposalLines.length > 0 ? proposalLines : ["- none"]),
    "",
    "Promotion Decisions",
    ...(promotionLines.length > 0 ? promotionLines : ["- none"]),
    "",
    "Assertions",
    ...assertionLines,
    "",
    "Contamination Findings",
    ...(assertions?.contaminationFindings.length
      ? assertions.contaminationFindings.map((finding) => `- ${finding}`)
      : ["- none"]),
    "",
    "Update Findings",
    ...(assertions?.updateFindings.length
      ? assertions.updateFindings.map((finding) => `- ${finding}`)
      : ["- none"]),
  ].join("\n");
}

function renderOutput(
  output: CLICommandOutput,
  flags: ParsedFlags,
): CLIResult {
  return {
    exitCode: 0,
    stderr: "",
    stdout: flagEnabled(flags, "json")
      ? `${JSON.stringify(output.json, null, 2)}\n`
      : output.text,
  };
}

function renderBootstrapPayload(payload: {
  changes: Array<{
    action: "created" | "unchanged" | "updated";
    relativePath: string;
  }>;
  exportRootPath: string;
  host: BootstrapHostKind;
  instructionPath: string;
  scriptPath: string;
  workspaceId: string;
  workspaceRoot: string;
}): string {
  const hostLabel = payload.host === "codex" ? "Codex" : "Claude Code";
  const changeLines = payload.changes.map(
    (change) => `- ${change.relativePath} (${change.action})`,
  );

  return [
    `Bootstrapped ${hostLabel} workspace at ${payload.workspaceRoot}`,
    `- workspaceId: ${payload.workspaceId}`,
    `- instructions: ${payload.instructionPath}`,
    `- script: ${payload.scriptPath}`,
    `- export root: ${payload.exportRootPath}`,
    ...changeLines,
  ].join("\n");
}

function renderInstalledHostPayload(input: {
  actionLabel: "Disabled" | "Enabled" | "Installed" | "Uninstalled";
  payload: {
    changes: Array<{ action: string; relativePath: string }>;
    configPath?: string;
    host: string;
    instructionPath?: string;
    memoryPath?: string;
    userId?: string;
    workspaceRoot?: string;
  };
}): string {
  const hostLabel = input.payload.host === "codex" ? "Codex" : "Claude Code";
  const lines = [`${input.actionLabel} GoodMemory ${hostLabel} configuration`];

  for (const change of input.payload.changes) {
    lines.push(`- ${change.relativePath} (${change.action})`);
  }
  if (input.payload.configPath) {
    lines.push(`- config: ${input.payload.configPath}`);
  }
  if (input.payload.instructionPath) {
    lines.push(`- instructions: ${input.payload.instructionPath}`);
  }
  if (input.payload.memoryPath) {
    lines.push(`- memory path: ${input.payload.memoryPath}`);
  }
  if (input.payload.userId) {
    lines.push(`- userId: ${input.payload.userId}`);
  }
  if (input.payload.workspaceRoot) {
    lines.push(`- workspace: ${input.payload.workspaceRoot}`);
  }

  return lines.join("\n");
}

function renderRememberPayload(payload: {
  accepted: number;
  rejected: number;
  scope: MemoryScope;
  storage: {
    location: string;
    provider: CLIStorageConfig["provider"];
  };
}): string {
  return [
    `Remembered durable memory for ${formatScope(payload.scope)}`,
    `- storage: ${payload.storage.provider} (${payload.storage.location})`,
    `- accepted: ${payload.accepted}`,
    `- rejected: ${payload.rejected}`,
  ].join("\n");
}

function renderFeedbackPayload(payload: {
  accepted: boolean;
  kind?: string;
  memoryId?: string;
  outcome?: string;
  promotionReceiptCount: number;
  proposalReceiptCount: number;
  scope: MemoryScope;
  storage: {
    location: string;
    provider: CLIStorageConfig["provider"];
  };
}): string {
  return [
    `Stored feedback for ${formatScope(payload.scope)}`,
    `- storage: ${payload.storage.provider} (${payload.storage.location})`,
    `- accepted: ${payload.accepted}`,
    `- outcome: ${payload.outcome ?? "unknown"}`,
    `- kind: ${payload.kind ?? "unknown"}`,
    ...(payload.memoryId ? [`- memoryId: ${payload.memoryId}`] : []),
    `- proposal receipts: ${payload.proposalReceiptCount}`,
    `- promotion receipts: ${payload.promotionReceiptCount}`,
  ].join("\n");
}

function renderForgetPayload(payload: {
  forgotten: boolean;
  memoryId: string;
  scope: MemoryScope;
  storage: {
    location: string;
    provider: CLIStorageConfig["provider"];
  };
}): string {
  return [
    payload.forgotten
      ? `Forgot memory ${payload.memoryId} for ${formatScope(payload.scope)}`
      : `No memory forgotten for ${formatScope(payload.scope)}`,
    `- storage: ${payload.storage.provider} (${payload.storage.location})`,
  ].join("\n");
}

function renderForgetAllPayload(payload: {
  deleted: Record<string, number>;
  includeRuntime: boolean;
  scope: MemoryScope;
  storage: {
    location: string;
    provider: CLIStorageConfig["provider"];
  };
}): string {
  return [
    `Forgot scoped memory for ${formatScope(payload.scope)}`,
    `- storage: ${payload.storage.provider} (${payload.storage.location})`,
    `- includeRuntime: ${payload.includeRuntime}`,
    `- deleted: ${Object.entries(payload.deleted)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ") || "none"}`,
  ].join("\n");
}

function requireInstalledHostKind(value: string | undefined): InstalledHostKind {
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error(
    `Unknown host target: ${value ?? "(missing)"}. Use 'codex' or 'claude'.`,
  );
}

function requireInstalledHostHookCommand(
  value: string | undefined,
): InstalledHostHookCommand {
  if (value === "session-start" || value === "user-prompt-submit") {
    return value;
  }

  throw new Error(
    `Unknown hook command: ${value ?? "(missing)"}. Use 'session-start' or 'user-prompt-submit'.`,
  );
}

async function handleInspect(flags: ParsedFlags): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const includeRuntime = shouldIncludeRuntime(flags, scope);
  const { memory, storage } = await createDiagnosticMemory(flags, {
    includeVectorStore: false,
    readOnlyStorage: true,
  });
  const result = await memory.exportMemory({
    includeRuntime,
    scope,
  });
  const payload = buildInspectPayload({
    result,
    storage,
  });

  return {
    json: payload,
    text: renderInspectPayload(payload),
  };
}

async function handleStats(flags: ParsedFlags): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const includeRuntime = shouldIncludeRuntime(flags, scope);
  const { memory, storage } = await createDiagnosticMemory(flags, {
    includeVectorStore: false,
    readOnlyStorage: true,
  });
  const result = await memory.exportMemory({
    includeRuntime,
    scope,
  });
  const payload = buildStatsPayload({
    result,
    storage,
  });

  return {
    json: payload,
    text: renderStatsPayload(payload),
  };
}

async function handleTrace(flags: ParsedFlags): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const query = requireFlag(flags, "query");
  const retrievalProfile = parseRetrievalProfile(flags);
  const strategy = parseRecallStrategy(flags);
  const ignoreMemory = flagEnabled(flags, "ignore-memory");
  const { memory, storage } = ignoreMemory
    ? createIgnoredDiagnosticMemory()
    : await createDiagnosticMemory(flags, {
        readOnlyStorage: true,
      });
  const recall = await memory.diagnoseRecall({
    ignoreMemory,
    locale: flags.locale,
    query,
    retrievalProfile,
    scope,
    strategy,
  });
  const payload = buildTracePayload({
    query,
    recall,
    scope,
    storage,
  });

  return {
    json: payload,
    text: renderTracePayload(payload),
  };
}

async function handleExportMemory(
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const includeRuntime = shouldIncludeRuntime(flags, scope);
  const outputPath = resolve(requireFlag(flags, "output"));
  const force = flagEnabled(flags, "force");
  const { memory, storage } = await createDiagnosticMemory(flags, {
    includeVectorStore: false,
    readOnlyStorage: true,
  });
  const result = await memory.exportMemory({
    includeRuntime,
    scope,
  });

  await writeExportMemoryOutput({
    force,
    outputPath,
    result,
  });

  const payload = {
    artifactFileCount: result.artifacts.files.length,
    artifactRootPath: result.artifacts.rootPath,
    includeRuntime,
    jsonPath: join(outputPath, "memory-export.json"),
    outputPath,
    scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };

  return {
    json: payload,
    text:
      `Exported memory snapshot to ${outputPath}\n` +
      `- json: ${join(outputPath, "memory-export.json")}\n` +
      `- markdown root: ${join(outputPath, result.artifacts.rootPath)}`,
  };
}

async function handleRemember(flags: ParsedFlags): Promise<CLICommandOutput> {
  const { memory, scope, storage } = await resolveWriteExecutionContext(flags);
  const result = await memory.remember({
    extractionStrategy: parseExtractionStrategy(flags),
    locale: flags.locale,
    messages: [
      {
        content: requireFlag(flags, "message"),
        role: parseRememberRole(flags),
      },
    ],
    scope,
  });
  const payload = {
    accepted: result.accepted,
    events: result.events,
    metadata: result.metadata ?? null,
    rejected: result.rejected,
    scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };

  return {
    json: payload,
    text: renderRememberPayload(payload),
  };
}

async function handleFeedback(flags: ParsedFlags): Promise<CLICommandOutput> {
  const { memory, scope, storage } = await resolveWriteExecutionContext(flags);
  const result = await memory.feedback({
    locale: flags.locale,
    scope,
    signal: requireFlag(flags, "signal"),
  });
  const payload = {
    accepted: result.accepted,
    kind: result.kind,
    memoryId: result.memoryId,
    metadata: result.metadata ?? null,
    outcome: result.outcome,
    promotionReceiptCount: result.promotionReceipts?.length ?? 0,
    promotionReceipts: result.promotionReceipts ?? [],
    proposalReceiptCount: result.proposalReceipts?.length ?? 0,
    proposalReceipts: result.proposalReceipts ?? [],
    scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };

  return {
    json: payload,
    text: renderFeedbackPayload(payload),
  };
}

async function handleForget(flags: ParsedFlags): Promise<CLICommandOutput> {
  const { memory, scope, storage } = await resolveWriteExecutionContext(flags);
  const deleteAll = flagEnabled(flags, "all");
  const memoryId = flags["memory-id"];

  if (deleteAll && memoryId) {
    throw new Error("Use either --memory-id or --all, not both.");
  }
  if (!deleteAll && !memoryId) {
    throw new Error("Missing required flag --memory-id or --all.");
  }

  if (deleteAll) {
    const includeRuntime = flagEnabled(flags, "include-runtime");
    const payload = {
      deleted: (
        await memory.deleteAllMemory({
          includeRuntime,
          scope,
        })
      ).deleted,
      includeRuntime,
      scope,
      storage: {
        location: storage.displayValue,
        provider: storage.provider,
      },
    };

    return {
      json: payload,
      text: renderForgetAllPayload(payload),
    };
  }

  const payload = {
    ...(await memory.forget({
      memoryId,
      scope,
    })),
    memoryId,
    scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };

  return {
    json: payload,
    text: renderForgetPayload(payload),
  };
}

async function handleEvalInspect(
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const payload = await inspectEvalCase(
    requireFlag(flags, "run-dir"),
    requireFlag(flags, "case-id"),
  );
  return {
    json: payload,
    text: renderEvalInspectPayload(payload),
  };
}

async function handleEvalTrace(flags: ParsedFlags): Promise<CLICommandOutput> {
  const payload = await traceEvalCase(
    requireFlag(flags, "run-dir"),
    requireFlag(flags, "case-id"),
  );
  return {
    json: payload,
    text: renderEvalTracePayload(payload),
  };
}

async function handleEvalExportCase(
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const runDir = requireFlag(flags, "run-dir");
  const caseId = requireFlag(flags, "case-id");
  const outputPath = resolve(requireFlag(flags, "output"));
  await exportCaseArtifact({
    caseId,
    force: flagEnabled(flags, "force"),
    outputPath,
    runDir,
  });

  const payload = {
    caseId,
    outputPath,
    runDir,
  };

  return {
    json: payload,
    text: `Exported case artifact to ${outputPath}`,
  };
}

async function handleHostBootstrap(
  host: BootstrapHostKind,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const result = await bootstrapHostWorkspace({
    host,
    userId: requireFlag(flags, "user-id"),
    workspaceId: flags["workspace-id"],
    workspaceRoot: flags["workspace-root"],
  });
  const payload = {
    changes: result.changes.map((change) => ({
      action: change.action,
      path: change.path,
      relativePath: change.relativePath,
    })),
    exportRootPath: result.exportRootPath,
    host: result.host,
    instructionPath: result.instructionPath,
    scriptPath: result.scriptPath,
    userId: result.userId,
    workspaceId: result.workspaceId,
    workspaceRoot: result.workspaceRoot,
  };

  return {
    json: payload,
    text: renderBootstrapPayload(payload),
  };
}

async function handleHostInstall(
  host: InstalledHostKind,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const result = await installHost({
    host,
    memoryPath: flags["memory-path"],
    userId: flags["user-id"],
  });
  const payload = {
    changes: result.changes.map((change) => ({
      action: change.action,
      path: change.path,
      relativePath: change.relativePath,
    })),
    configPath: result.configPath,
    host: result.host,
    installRoot: result.installRoot,
    memoryPath: result.memoryPath,
    userId: result.userId,
  };

  return {
    json: payload,
    text: renderInstalledHostPayload({
      actionLabel: "Installed",
      payload,
    }),
  };
}

async function handleHostUninstall(
  host: InstalledHostKind,
): Promise<CLICommandOutput> {
  const result = await uninstallHost({ host });
  const payload = {
    changes: result.changes.map((change) => ({
      action: change.action,
      path: change.path,
      relativePath: change.relativePath,
    })),
    configPath: result.configPath,
    host: result.host,
  };

  return {
    json: payload,
    text: renderInstalledHostPayload({
      actionLabel: "Uninstalled",
      payload,
    }),
  };
}

async function handleHostEnable(
  host: InstalledHostKind,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const result = await enableHostWorkspace({
    host,
    workspaceId: flags["workspace-id"],
    workspaceRoot: flags["workspace-root"],
  });
  const payload = {
    changes: result.changes.map((change) => ({
      action: change.action,
      path: change.path,
      relativePath: change.relativePath,
    })),
    configPath: result.configPath,
    host: result.host,
    instructionPath: result.instructionPath,
    workspaceId: result.workspaceId,
    workspaceRoot: result.workspaceRoot,
  };

  return {
    json: payload,
    text: renderInstalledHostPayload({
      actionLabel: "Enabled",
      payload,
    }),
  };
}

async function handleHostDisable(
  host: InstalledHostKind,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const result = await disableHostWorkspace({
    host,
    workspaceRoot: flags["workspace-root"],
  });
  const payload = {
    changes: result.changes.map((change) => ({
      action: change.action,
      path: change.path,
      relativePath: change.relativePath,
    })),
    configPath: result.configPath,
    host: result.host,
    instructionPath: result.instructionPath,
    workspaceRoot: result.workspaceRoot,
  };

  return {
    json: payload,
    text: renderInstalledHostPayload({
      actionLabel: "Disabled",
      payload,
    }),
  };
}

async function handleHostHook(
  host: InstalledHostKind,
  command: InstalledHostHookCommand,
): Promise<CLICommandOutput> {
  const rawInput = await new Response(Bun.stdin.stream()).text();
  let payload: Record<string, unknown> = {};
  if (rawInput.trim().length > 0) {
    try {
      payload = JSON.parse(rawInput) as Record<string, unknown>;
    } catch {
      return {
        json: {},
        text: JSON.stringify({}, null, 2),
      };
    }
  }
  const result = await executeInstalledHostHook({
    command,
    host,
    payload,
  });
  const rendered = JSON.stringify(result.output ?? {}, null, 2);

  return {
    json: result.output ?? {},
    text: rendered,
  };
}

async function handleMcpServe(flags: ParsedFlags): Promise<void> {
  await serveGoodMemoryMcp({
    host: requireInstalledHostKind(flags.host),
  });
}

export async function runCLI(argv: string[]): Promise<CLIResult> {
  try {
    const { commands, flags } = parseArgs(argv);
    if (commands.length === 0) {
      return helpResult(ROOT_HELP_TEXT);
    }

    const primary = commands[0]!;

    if (helpRequested(flags)) {
      if (primary === "eval") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(EVAL_HELP_TEXT);
        }
        if (secondary === "inspect") {
          return helpResult(EVAL_INSPECT_HELP_TEXT);
        }
        if (secondary === "trace") {
          return helpResult(EVAL_TRACE_HELP_TEXT);
        }
        if (secondary === "export-case") {
          return helpResult(EVAL_EXPORT_CASE_HELP_TEXT);
        }

        return errorResult(
          `Unknown eval command: ${secondary}. Run 'goodmemory eval --help'.`,
        );
      }

      if (primary === "inspect") {
        return helpResult(INSPECT_HELP_TEXT);
      }
      if (primary === "remember") {
        return helpResult(REMEMBER_HELP_TEXT);
      }
      if (primary === "feedback") {
        return helpResult(FEEDBACK_HELP_TEXT);
      }
      if (primary === "forget") {
        return helpResult(FORGET_HELP_TEXT);
      }
      if (primary === "trace") {
        return helpResult(TRACE_HELP_TEXT);
      }
      if (primary === "stats") {
        return helpResult(STATS_HELP_TEXT);
      }
      if (primary === "export-memory") {
        return helpResult(EXPORT_MEMORY_HELP_TEXT);
      }
      if (primary === "codex") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(CODEX_HELP_TEXT);
        }
        if (secondary === "bootstrap") {
          return helpResult(CODEX_BOOTSTRAP_HELP_TEXT);
        }
        if (secondary === "hook") {
          const tertiary = commands[2];
          if (!tertiary) {
            return helpResult(CODEX_HOOK_HELP_TEXT);
          }
          requireInstalledHostHookCommand(tertiary);
          return helpResult(CODEX_HOOK_HELP_TEXT);
        }

        return errorResult(
          `Unknown Codex command: ${secondary}. Run 'goodmemory codex --help'.`,
        );
      }
      if (primary === "claude") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(CLAUDE_HELP_TEXT);
        }
        if (secondary === "bootstrap") {
          return helpResult(CLAUDE_BOOTSTRAP_HELP_TEXT);
        }
        if (secondary === "hook") {
          const tertiary = commands[2];
          if (!tertiary) {
            return helpResult(CLAUDE_HOOK_HELP_TEXT);
          }
          requireInstalledHostHookCommand(tertiary);
          return helpResult(CLAUDE_HOOK_HELP_TEXT);
        }

        return errorResult(
          `Unknown Claude command: ${secondary}. Run 'goodmemory claude --help'.`,
        );
      }
      if (primary === "install") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(INSTALL_HELP_TEXT);
        }
        requireInstalledHostKind(secondary);
        return helpResult(INSTALL_HELP_TEXT);
      }
      if (primary === "uninstall") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(UNINSTALL_HELP_TEXT);
        }
        requireInstalledHostKind(secondary);
        return helpResult(UNINSTALL_HELP_TEXT);
      }
      if (primary === "enable") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(ENABLE_HELP_TEXT);
        }
        requireInstalledHostKind(secondary);
        return helpResult(ENABLE_HELP_TEXT);
      }
      if (primary === "disable") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(DISABLE_HELP_TEXT);
        }
        requireInstalledHostKind(secondary);
        return helpResult(DISABLE_HELP_TEXT);
      }
      if (primary === "mcp") {
        const secondary = commands[1];
        if (!secondary) {
          return helpResult(MCP_HELP_TEXT);
        }
        if (secondary === "serve") {
          return helpResult(MCP_SERVE_HELP_TEXT);
        }

        return errorResult(
          `Unknown MCP command: ${secondary}. Run 'goodmemory mcp --help'.`,
        );
      }

      return errorResult(`Unknown command: ${primary}. Run 'goodmemory --help'.`);
    }

    if (primary === "eval") {
      const secondary = commands[1];
      if (!secondary) {
        return helpResult(EVAL_HELP_TEXT);
      }
      if (secondary === "inspect") {
        return renderOutput(await handleEvalInspect(flags), flags);
      }
      if (secondary === "trace") {
        return renderOutput(await handleEvalTrace(flags), flags);
      }
      if (secondary === "export-case") {
        return renderOutput(await handleEvalExportCase(flags), flags);
      }

      throw new Error(`Unknown eval command: ${secondary}. Run 'goodmemory eval --help'.`);
    }
    if (primary === "codex") {
      const secondary = commands[1];
      if (!secondary) {
        return helpResult(CODEX_HELP_TEXT);
      }
      if (secondary === "bootstrap") {
        return renderOutput(await handleHostBootstrap("codex", flags), flags);
      }
      if (secondary === "hook") {
        return renderOutput(
          await handleHostHook(
            "codex",
            requireInstalledHostHookCommand(commands[2]),
          ),
          flags,
        );
      }

      throw new Error(`Unknown Codex command: ${secondary}. Run 'goodmemory codex --help'.`);
    }
    if (primary === "claude") {
      const secondary = commands[1];
      if (!secondary) {
        return helpResult(CLAUDE_HELP_TEXT);
      }
      if (secondary === "bootstrap") {
        return renderOutput(await handleHostBootstrap("claude", flags), flags);
      }
      if (secondary === "hook") {
        return renderOutput(
          await handleHostHook(
            "claude",
            requireInstalledHostHookCommand(commands[2]),
          ),
          flags,
        );
      }

      throw new Error(`Unknown Claude command: ${secondary}. Run 'goodmemory claude --help'.`);
    }
    if (primary === "install") {
      return renderOutput(
        await handleHostInstall(requireInstalledHostKind(commands[1]), flags),
        flags,
      );
    }
    if (primary === "uninstall") {
      return renderOutput(
        await handleHostUninstall(requireInstalledHostKind(commands[1])),
        flags,
      );
    }
    if (primary === "enable") {
      return renderOutput(
        await handleHostEnable(requireInstalledHostKind(commands[1]), flags),
        flags,
      );
    }
    if (primary === "disable") {
      return renderOutput(
        await handleHostDisable(requireInstalledHostKind(commands[1]), flags),
        flags,
      );
    }
    if (primary === "mcp") {
      const secondary = commands[1];
      if (!secondary) {
        return helpResult(MCP_HELP_TEXT);
      }
      if (secondary === "serve") {
        await handleMcpServe(flags);
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        };
      }

      throw new Error(`Unknown MCP command: ${secondary}. Run 'goodmemory mcp --help'.`);
    }

    if (primary === "remember") {
      return renderOutput(await handleRemember(flags), flags);
    }
    if (primary === "feedback") {
      return renderOutput(await handleFeedback(flags), flags);
    }
    if (primary === "forget") {
      return renderOutput(await handleForget(flags), flags);
    }
    if (primary === "inspect") {
      return renderOutput(await handleInspect(flags), flags);
    }
    if (primary === "trace") {
      return renderOutput(await handleTrace(flags), flags);
    }
    if (primary === "stats") {
      return renderOutput(await handleStats(flags), flags);
    }
    if (primary === "export-memory") {
      return renderOutput(await handleExportMemory(flags), flags);
    }

    throw new Error(`Unknown command: ${primary}. Run 'goodmemory --help'.`);
  } catch (error) {
    return {
      exitCode: 1,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }
}
