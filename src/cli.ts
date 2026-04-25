import { access, chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createGoodMemory } from "./api/createGoodMemory";
import type {
  ExportMemoryResult,
  GoodMemory,
  GoodMemoryConfig,
  RecallInput,
  RecallResult,
} from "./api/contracts";
import { bootstrapHostWorkspace } from "./bootstrap/hostBootstrap";
import type { BootstrapHostKind } from "./bootstrap/hostBootstrap";
import { normalizeScope } from "./domain/scope";
import type { MemoryScope } from "./domain/scope";
import {
  disableHostWorkspace,
  enableHostWorkspace,
  installHost,
  uninstallHost,
} from "./install/hostInstall";
import type {
  InstallHostResult,
  InstalledHostKind,
  InstalledHostStorageProvider,
} from "./install/hostInstall";
import {
  isInstalledHostHookRegistered,
  isInstalledHostPreActionHookRegistered,
  resolveInstalledHostHookTargetPath,
} from "./install/hostHookConfig";
import {
  executeInstalledHostHook,
} from "./install/hostHookRuntime";
import type { InstalledHostHookCommand } from "./install/hostHookRuntime";
import { executeInstalledHostAction } from "./install/hostActionRuntime";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
} from "./install/hostExecutionContext";
import type { InstalledHostResolvedContext } from "./install/hostExecutionContext";
import {
  forgetInstalledHostWritebackAuditEvent,
  inspectInstalledHostWritebackAudit,
} from "./install/hostWritebackAuditRuntime";
import type {
  InstalledHostActivationMode,
  InstalledHostEmbeddingProviderConfig,
  InstalledHostModelProviderConfig,
  InstalledHostProviderConfig,
  InstalledHostWritebackConfig,
  InstalledHostWritebackMode,
} from "./install/hostConfigValidation";
import {
  DEFAULT_INSTALLED_HOST_WRITEBACK,
  readWritebackMode,
} from "./install/hostConfigValidation";
import {
  readInstalledHostRuntimeConfig,
  resolveInstallRoot,
} from "./install/hostRuntimeConfig";
import {
  executeInstalledHostWriteback,
} from "./install/hostWritebackRuntime";
import type {
  InstalledHostWritebackResult,
} from "./install/hostWritebackRuntime";
import {
  isInstalledHostMcpRegistered,
  resolveInstalledHostMcpTargetPath,
} from "./install/hostMcpConfig";
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

export interface CLIInstallPrompt {
  ask(message: string): Promise<string>;
  askSecret?: (message: string) => Promise<string>;
  close?: () => Promise<void> | void;
}

export interface CLIRunDependencies {
  interactive?: boolean;
  prompt?: CLIInstallPrompt;
}

type InstallActivationSelection = "current-workspace" | "global" | "manual";
type SetupHostSelection = "both" | InstalledHostKind;

interface ResolvedInstallOptions {
  activationSelection?: InstallActivationSelection;
  flags: ParsedFlags;
  writeback?: InstalledHostWritebackConfig;
}

interface FileSnapshot {
  content?: string;
  existed: boolean;
  mode?: number;
  path: string;
}

interface PackageMetadata {
  version?: unknown;
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
  exitCode?: number;
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
const PACKAGE_JSON_URL = new URL("../package.json", import.meta.url);
const ROOT_HELP_TEXT = [
  "GoodMemory CLI",
  "",
  "Usage",
  "  goodmemory <command> [options]",
  "",
  "Commands",
  "  setup           Configure GoodMemory memory enhancement for installed hosts",
  "  remember        Write durable memory through the public API",
  "  feedback        Write explicit feedback or correction through the public API",
  "  forget          Delete one durable memory record or clear a scoped target",
  "  inspect         Inspect scope-bounded memory from durable storage",
  "  trace           Run read-only recall diagnostics for a scope and query",
  "  export-memory   Export a memory snapshot plus Markdown artifacts",
  "  stats           Show scope-bounded counts and storage metadata",
  "  status          Show installed host memory enhancement status",
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
  "  goodmemory setup --help",
  "  goodmemory status --help",
  "  goodmemory eval --help",
  "  goodmemory install --help",
  "  goodmemory enable --help",
  "  goodmemory mcp --help",
  "  goodmemory codex --help",
  "  goodmemory claude --help",
  "  goodmemory -V, --version",
].join("\n");
const SETUP_HELP_TEXT = [
  "GoodMemory Setup CLI",
  "",
  "Usage",
  "  goodmemory setup [options]",
  "",
  "Options",
  "  --host <codex|claude|both>  Optional, defaults to detected installed hosts",
  "  --user-id <id>              Optional, defaults to the current OS username",
  "  --activation-mode <global|workspace_opt_in>",
  "  --writeback <off|observe|selective>",
  "  --interactive",
  "  --no-interactive",
  "  --json",
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
  "  --memory-path <path>      SQLite shortcut. Defaults to ~/.goodmemory/memory.sqlite",
  "  --storage-provider <sqlite|postgres>",
  "  --storage-url <path-or-url>",
  "  --embedding-provider <openai>",
  "  --embedding-model <model>",
  "  --embedding-api-key <key>",
  "  --embedding-base-url <url>",
  "  --llm-provider <openai|anthropic>",
  "  --llm-model <model>",
  "  --llm-api-key <key>",
  "  --llm-base-url <url>",
  "  --activation-mode <global|workspace_opt_in>",
  "  --writeback <off|observe|selective>",
  "  --interactive",
  "  --no-interactive",
  "  --json",
  "",
  "Interactive terminals prompt for missing storage/provider settings unless --no-interactive or --json is used; --interactive forces prompts.",
  "If provider setup is skipped, install still succeeds in local rules-only mode.",
  "Add them later by rerunning install with flags or editing ~/.goodmemory/<host>.json.",
].join("\n");
const UNINSTALL_HELP_TEXT = [
  "GoodMemory Uninstall CLI",
  "",
  "Usage",
  "  goodmemory uninstall <codex|claude> [--json]",
].join("\n");
const STATUS_HELP_TEXT = [
  "GoodMemory Status CLI",
  "",
  "Usage",
  "  goodmemory status [codex|claude] [options]",
  "",
  "Options",
  "  --workspace-root <path>   Optional, defaults to the current working directory",
  "  --json",
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
  "  --writeback <off|observe|selective>",
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
  "  action        Run the installed Codex action bridge with pre-action assessment",
  "  bootstrap     Generate repo-local Codex wiring on the installed package surface",
  "  hook          Run installed Codex hook handlers from stdin JSON",
  "  writeback     Run opt-in installed Codex selective writeback from stdin JSON",
  "",
  "Help",
  "  goodmemory codex --help",
  "  goodmemory codex action --help",
  "  goodmemory codex bootstrap --help",
  "  goodmemory codex hook --help",
  "  goodmemory codex writeback --help",
].join("\n");
const CODEX_ACTION_HELP_TEXT = [
  "GoodMemory Codex Action",
  "",
  "Usage",
  "  goodmemory codex action --session-id <id> --command <command> [--run-id <id>] [--attempt-id <id>] [--action-id <id>] [--turn-id <id>] [--sequence <n>] [--json]",
  "",
  "Executes the installed Codex action bridge: assessAction(), rewrite/veto, first-step execution, and lineage/evidence recording in installed storage.",
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
  "  writeback     Run opt-in installed Claude Code selective writeback from stdin JSON",
  "",
  "Help",
  "  goodmemory claude --help",
  "  goodmemory claude bootstrap --help",
  "  goodmemory claude hook --help",
  "  goodmemory claude writeback --help",
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
  "  goodmemory codex hook <pre-tool-use|session-start|session-stop|user-prompt-submit>",
  "",
  "Commands",
  "  pre-tool-use        Read Codex PreToolUse Bash JSON from stdin and deny/redirect risky commands",
  "  session-start        Read Codex SessionStart JSON from stdin and emit additionalContext JSON",
  "  session-stop         Read Codex Stop JSON from stdin and learn bounded session signals",
  "  user-prompt-submit   Read Codex UserPromptSubmit JSON from stdin and emit additionalContext JSON",
].join("\n");
const CODEX_WRITEBACK_HELP_TEXT = [
  "GoodMemory Codex Writeback",
  "",
  "Usage",
  "  goodmemory codex writeback [--mode off|observe|selective] [--dry-run] [--json]",
  "  goodmemory codex writeback inspect [--limit <n>] [--json]",
  "  goodmemory codex writeback forget --event-id <id> [--review-outcome <valid_write|false_write|uncertain>] [--review-reason <text>] [--json]",
  "",
  "Modes",
  "  off        recall-only; no after-response candidate extraction",
  "  observe    stores local bounded/redacted candidate previews for review; no raw transcripts or durable memory writes",
  "  selective  writes selected candidates through public remember()",
  "",
  "Reads Codex after-response/session-end JSON from stdin and runs installed-host writeback.",
  "Inspect lists recent audit events. Forget deletes linked durable records, or dismisses observe-only events.",
].join("\n");
const CLAUDE_HOOK_HELP_TEXT = [
  "GoodMemory Claude Hook",
  "",
  "Usage",
  "  goodmemory claude hook <session-start|session-stop|user-prompt-submit>",
  "",
  "Commands",
  "  session-start        Read Claude SessionStart JSON from stdin and emit additionalContext JSON",
  "  session-stop         Read Claude Stop JSON from stdin and learn bounded session signals",
  "  user-prompt-submit   Read Claude UserPromptSubmit JSON from stdin and emit additionalContext JSON",
].join("\n");
const CLAUDE_WRITEBACK_HELP_TEXT = [
  "GoodMemory Claude Writeback",
  "",
  "Usage",
  "  goodmemory claude writeback [--mode off|observe|selective] [--dry-run] [--json]",
  "  goodmemory claude writeback inspect [--limit <n>] [--json]",
  "  goodmemory claude writeback forget --event-id <id> [--review-outcome <valid_write|false_write|uncertain>] [--review-reason <text>] [--json]",
  "",
  "Modes",
  "  off        recall-only; no after-response candidate extraction",
  "  observe    stores local bounded/redacted candidate previews for review; no raw transcripts or durable memory writes",
  "  selective  writes selected candidates through public remember()",
  "",
  "Reads Claude after-response/session-end JSON from stdin and runs installed-host writeback.",
  "Inspect lists recent audit events. Forget deletes linked durable records, or dismisses observe-only events.",
].join("\n");

function parseArgs(argv: string[]): ParsedArgs {
  const commands: string[] = [];
  const flags: ParsedFlags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "-V") {
      flags.version = "true";
      continue;
    }

    if (token === "--") {
      commands.push(...argv.slice(index + 1));
      break;
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

function versionRequested(flags: ParsedFlags): boolean {
  return flagEnabled(flags, "version");
}

let packageVersionCache: string | undefined;

async function readPackageVersion(): Promise<string> {
  if (packageVersionCache) {
    return packageVersionCache;
  }

  const packageJson = JSON.parse(
    await readFile(PACKAGE_JSON_URL, "utf8"),
  ) as PackageMetadata;
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("Unable to read GoodMemory package version.");
  }

  packageVersionCache = packageJson.version;
  return packageVersionCache;
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

async function versionResult(): Promise<CLIResult> {
  return {
    exitCode: 0,
    stderr: "",
    stdout: `goodmemory ${await readPackageVersion()}\n`,
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
    memory: hasExplicitStorage
      ? createGoodMemory({
          storage: {
            provider: storage.provider,
            url: storage.url,
          },
        })
      : createInstalledHostMemory(resolved.context),
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
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
    exitCode: output.exitCode ?? 0,
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
    activationMode?: string;
    changes: Array<{ action: string; relativePath: string }>;
    configPath?: string;
    host: string;
    instructionPath?: string;
    memoryPath?: string;
    providers?: {
      assistedExtractor: InstalledProviderStatus;
      embedding: InstalledProviderStatus;
    };
    storage?: {
      location: string;
      provider: string;
    };
    userId?: string;
    writeback?: InstalledHostWritebackConfig;
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
  if (input.payload.activationMode) {
    lines.push(`- activation: ${input.payload.activationMode}`);
  }
  if (input.payload.writeback) {
    lines.push(`- writeback: ${input.payload.writeback.mode}`);
    lines.push(
      ...formatInstalledHostWritebackGuidance(
        input.payload.host,
        input.payload.writeback.mode,
        "- ",
      ),
    );
  }
  if (input.payload.storage) {
    lines.push(
      `- storage: ${input.payload.storage.provider} (${input.payload.storage.location})`,
    );
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
  if (input.payload.providers) {
    lines.push(
      `- embedding provider: ${formatInstalledProviderStatus(input.payload.providers.embedding)}`,
    );
    lines.push(
      `- LLM extraction provider: ${formatInstalledProviderStatus(input.payload.providers.assistedExtractor)}`,
    );
    if (
      !input.payload.providers.embedding.configured ||
      !input.payload.providers.assistedExtractor.configured
    ) {
      lines.push(
        `- provider setup: rerun install with --embedding-* / --llm-* flags or edit ${input.payload.configPath ?? "~/.goodmemory/<host>.json"}`,
      );
    }
  }

  return lines.join("\n");
}

function renderSetupPayload(payload: {
  hosts: Array<{
    activationMode: InstalledHostActivationMode;
    changes: Array<{ action: string; relativePath: string }>;
    host: InstalledHostKind;
    storage: { location: string; provider: string };
    writeback: InstalledHostWritebackConfig;
  }>;
}): string {
  const lines = ["GoodMemory setup complete"];
  for (const host of payload.hosts) {
    lines.push(
      `- ${host.host}: ${host.activationMode}, writeback=${host.writeback.mode}, storage=${host.storage.provider}`,
    );
    lines.push(
      ...formatInstalledHostWritebackGuidance(
        host.host,
        host.writeback.mode,
        "  - ",
      ),
    );
    for (const change of host.changes) {
      lines.push(`  - ${change.relativePath} (${change.action})`);
    }
  }
  lines.push("- status: run goodmemory status");

  return lines.join("\n");
}

function renderStatusPayload(payload: {
  hosts: Array<Record<string, unknown>>;
}): string {
  const lines = ["GoodMemory status"];
  for (const host of payload.hosts) {
    const hostName = String(host.host);
    lines.push(`- ${hostName}: ${String(host.workspaceStatus)}`);
    lines.push(`  - config: ${String(host.config)}`);
    lines.push(`  - activation: ${String(host.activationMode ?? "unknown")}`);
    const writeback = host.writeback as InstalledHostWritebackConfig | null;
    lines.push(
      `  - writeback: ${writeback?.mode ?? "off"}`,
    );
    lines.push(
      ...formatInstalledHostWritebackGuidance(
        hostName,
        writeback?.mode ?? "off",
        "  - ",
      ),
    );
    lines.push(`  - hook: ${host.hookRegistered ? "registered" : "missing"}`);
    if (hostName === "codex") {
      lines.push(
        `  - pre-action hook: ${host.preActionRegistered ? "registered" : "missing"}`,
      );
    }
    lines.push(`  - MCP: ${host.mcpRegistered ? "registered" : "missing"}`);
    if (host.memoryStatus) {
      lines.push(`  - memory: ${String(host.memoryStatus)}`);
    }
    if (host.scope) {
      lines.push(`  - scope: ${formatScope(host.scope as MemoryScope)}`);
    }
    if (host.counts) {
      const counts = host.counts as Record<string, number>;
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      lines.push(`  - memories: ${total} (${formatCountBreakdown(counts) ?? "empty"})`);
    }
  }

  return lines.join("\n");
}

function formatInstalledHostWritebackGuidance(
  host: string,
  mode: InstalledHostWritebackMode,
  prefix: string,
): string[] {
  if (mode === "off") {
    return [
      `${prefix}writeback mode: recall-only; no after-response candidate extraction`,
      `${prefix}enable candidate review: goodmemory enable ${host} --writeback observe`,
    ];
  }
  if (mode === "observe") {
    return [
      `${prefix}writeback mode: candidate audit only; stores local bounded redacted previews, not raw transcripts or durable memory`,
      `${prefix}review candidates: goodmemory ${host} writeback inspect --json`,
      `${prefix}enable durable writes: goodmemory enable ${host} --writeback selective`,
    ];
  }

  return [
    `${prefix}writeback mode: durable remember writeback through public remember()`,
    `${prefix}inspect or undo: goodmemory ${host} writeback inspect --json`,
  ];
}

function formatInstalledProviderStatus(status: InstalledProviderStatus): string {
  if (!status.configured) {
    return "not configured (rules-only/local fallback remains available)";
  }

  return [
    status.provider,
    status.model,
    status.baseURLConfigured ? "custom base URL" : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" / ");
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
  if (
    value === "pre-tool-use" ||
    value === "session-start" ||
    value === "session-stop" ||
    value === "user-prompt-submit"
  ) {
    return value;
  }

  throw new Error(
    `Unknown hook command: ${value ?? "(missing)"}. Use 'pre-tool-use', 'session-start', 'session-stop', or 'user-prompt-submit'.`,
  );
}

function readNonNegativeIntegerFlag(value: string, flagName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Unsupported --${flagName}: ${value}. Expected a non-negative integer.`);
  }

  return parsed;
}

function readInstallStorageProviderFlag(
  value: string | undefined,
): InstalledHostStorageProvider | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "sqlite" || value === "postgres") {
    return value;
  }

  throw new Error(
    `Unsupported installed-host storage provider: ${value}. Expected sqlite|postgres.`,
  );
}

function readActivationModeFlag(
  value: string | undefined,
): InstalledHostActivationMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "global" || value === "workspace_opt_in") {
    return value;
  }

  throw new Error(
    `Unsupported installed-host activation mode: ${value}. Expected global|workspace_opt_in.`,
  );
}

function readInstallWritebackConfig(flags: ParsedFlags): InstalledHostWritebackConfig {
  const legacyAutoLearn = flagEnabled(flags, "auto-learn");
  const legacyNoAutoLearn = flagEnabled(flags, "no-auto-learn");
  if (legacyAutoLearn && legacyNoAutoLearn) {
    throw new Error("Use either --auto-learn or --no-auto-learn, not both.");
  }
  if (flags.writeback !== undefined && (legacyAutoLearn || legacyNoAutoLearn)) {
    throw new Error("Use --writeback instead of combining it with legacy auto-learn flags.");
  }

  if (flags.writeback !== undefined) {
    return buildWritebackConfig(readWritebackModeFlag(flags.writeback));
  }

  if (legacyAutoLearn || legacyNoAutoLearn) {
    return buildWritebackConfig(legacyAutoLearn ? "selective" : "off");
  }

  return DEFAULT_INSTALLED_HOST_WRITEBACK;
}

function readInstallWritebackConfigOverride(
  flags: ParsedFlags,
): InstalledHostWritebackConfig | undefined {
  if (
    flags.writeback !== undefined ||
    flagEnabled(flags, "auto-learn") ||
    flagEnabled(flags, "no-auto-learn")
  ) {
    return readInstallWritebackConfig(flags);
  }

  return undefined;
}

function buildWritebackConfig(
  mode: InstalledHostWritebackMode,
): InstalledHostWritebackConfig {
  return {
    ...DEFAULT_INSTALLED_HOST_WRITEBACK,
    mode,
  };
}

function readWritebackModeFlag(
  value: string | undefined,
): InstalledHostWritebackMode {
  const mode = readWritebackMode(value);
  if (!mode) {
    throw new Error(
      `Unsupported installed-host writeback mode: ${value ?? "(missing)"}. Expected off|observe|selective.`,
    );
  }

  return mode;
}

function readSetupHostSelection(
  value: string | undefined,
): SetupHostSelection | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "codex" || value === "claude" || value === "both") {
    return value;
  }

  throw new Error(
    `Unsupported setup host: ${value}. Expected codex|claude|both.`,
  );
}

function expandSetupHostSelection(selection: SetupHostSelection): InstalledHostKind[] {
  return selection === "both" ? ["codex", "claude"] : [selection];
}

async function detectSetupHostSelection(): Promise<SetupHostSelection> {
  const [codexAvailable, claudeAvailable] = await Promise.all([
    commandAvailable("codex"),
    commandAvailable("claude"),
  ]);
  if (codexAvailable && claudeAvailable) {
    return "both";
  }
  if (claudeAvailable) {
    return "claude";
  }

  return "codex";
}

async function commandAvailable(command: string): Promise<boolean> {
  const result = Bun.spawn({
    cmd: ["which", command],
    stderr: "ignore",
    stdout: "ignore",
  });
  return (await result.exited) === 0;
}

function readOptionalInstalledProviderConfig(input: {
  apiKeyFlag: string;
  baseUrlFlag: string;
  flags: ParsedFlags;
  modelFlag: string;
  providerFlag: string;
  providerLabel: string;
  supportedProviders: Array<InstalledHostModelProviderConfig["provider"]>;
}): InstalledHostModelProviderConfig | undefined {
  const rawProvider = input.flags[input.providerFlag];
  const rawModel = input.flags[input.modelFlag];
  const rawApiKey = input.flags[input.apiKeyFlag];
  const rawBaseURL = input.flags[input.baseUrlFlag];
  const provider = normalizeOptionalFlag(rawProvider);
  const model = normalizeOptionalFlag(rawModel);
  const apiKey = normalizeOptionalFlag(rawApiKey);
  const baseURL = normalizeOptionalFlag(rawBaseURL);
  const anyConfigured = [
    rawProvider,
    rawModel,
    rawApiKey,
    rawBaseURL,
  ].some((value) => value !== undefined);
  if (!anyConfigured) {
    return undefined;
  }

  if (!provider || !model || !apiKey) {
    const missingFlags = [
      provider ? null : `--${input.providerFlag}`,
      model ? null : `--${input.modelFlag}`,
      apiKey ? null : `--${input.apiKeyFlag}`,
    ].filter(Boolean) as string[];
    throw new Error(
      `Incomplete ${input.providerLabel} provider config. Missing ${missingFlags.join(", ")}.`,
    );
  }
  if (
    provider !== "openai" &&
    provider !== "anthropic"
  ) {
    throw new Error(
      `Unsupported ${input.providerLabel} provider: ${provider}. Expected ${input.supportedProviders.join("|")}.`,
    );
  }
  if (!input.supportedProviders.includes(provider)) {
    throw new Error(
      `Unsupported ${input.providerLabel} provider: ${provider}. Expected ${input.supportedProviders.join("|")}.`,
    );
  }

  return {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    model,
    provider,
  };
}

function normalizeOptionalFlag(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readOptionalEmbeddingProviderConfig(
  flags: ParsedFlags,
): InstalledHostEmbeddingProviderConfig | undefined {
  const config = readOptionalInstalledProviderConfig({
    apiKeyFlag: "embedding-api-key",
    baseUrlFlag: "embedding-base-url",
    flags,
    modelFlag: "embedding-model",
    providerFlag: "embedding-provider",
    providerLabel: "embedding",
    supportedProviders: ["openai"],
  });
  if (!config) {
    return undefined;
  }

  return {
    ...config,
    provider: "openai",
  };
}

function readOptionalAssistedExtractorProviderConfig(
  flags: ParsedFlags,
): InstalledHostModelProviderConfig | undefined {
  return readOptionalInstalledProviderConfig({
    apiKeyFlag: "llm-api-key",
    baseUrlFlag: "llm-base-url",
    flags,
    modelFlag: "llm-model",
    providerFlag: "llm-provider",
    providerLabel: "LLM",
    supportedProviders: ["openai", "anthropic"],
  });
}

interface InstalledProviderStatus {
  baseURLConfigured?: boolean;
  configured: boolean;
  model?: string;
  provider?: "anthropic" | "openai";
}

function summarizeInstalledProviderStatus(
  provider: InstalledHostModelProviderConfig | undefined,
): InstalledProviderStatus {
  return provider
    ? {
        baseURLConfigured: Boolean(provider.baseURL),
        configured: true,
        model: provider.model,
        provider: provider.provider,
      }
    : {
        configured: false,
      };
}

function summarizeInstalledProviders(
  providers: InstalledHostProviderConfig | undefined,
): {
  assistedExtractor: InstalledProviderStatus;
  embedding: InstalledProviderStatus;
} {
  return {
    assistedExtractor: summarizeInstalledProviderStatus(
      providers?.assistedExtractor,
    ),
    embedding: summarizeInstalledProviderStatus(providers?.embedding),
  };
}

const EMBEDDING_INSTALL_FLAGS = [
  "embedding-api-key",
  "embedding-base-url",
  "embedding-model",
  "embedding-provider",
];
const LLM_INSTALL_FLAGS = [
  "llm-api-key",
  "llm-base-url",
  "llm-model",
  "llm-provider",
];

async function resolveInteractiveInstallFlags(
  host: InstalledHostKind,
  flags: ParsedFlags,
  dependencies: CLIRunDependencies = {},
): Promise<ResolvedInstallOptions> {
  const prompt = resolveInstallPrompt(flags, dependencies);
  if (!prompt) {
    return {
      flags,
      writeback: readInstallWritebackConfigOverride(flags),
    };
  }

  try {
    const resolvedFlags = { ...flags };
    const activationSelection = await promptInstallActivationSelection(
      resolvedFlags,
      prompt,
    );
    const configPathHint = `~/.goodmemory/${host}.json`;
    await promptOptionalFlag({
      flagName: "user-id",
      flags: resolvedFlags,
      message:
        "GoodMemory user id for this host install (leave empty to use the OS account)",
      prompt,
    });
    await promptInstallStorage(resolvedFlags, prompt);
    await promptEmbeddingInstallConfig(resolvedFlags, prompt, configPathHint);
    await promptAssistedExtractorInstallConfig(resolvedFlags, prompt, configPathHint);
    const writeback = await promptWritebackInstallConfig({
      flags: resolvedFlags,
      host,
      prompt,
    });

    return {
      activationSelection,
      flags: resolvedFlags,
      writeback,
    };
  } finally {
    await prompt.close?.();
  }
}

async function promptInstallActivationSelection(
  flags: ParsedFlags,
  prompt: CLIInstallPrompt,
): Promise<InstallActivationSelection> {
  const flagMode = readActivationModeFlag(flags["activation-mode"]);
  if (flagMode === "global") {
    return "global";
  }
  if (flagMode === "workspace_opt_in") {
    return "manual";
  }

  return (await askChoice({
    choices: ["global", "current-workspace", "manual"],
    defaultValue: "global",
    message:
      "Where should GoodMemory memory enhancement run? [global/current-workspace/manual]",
    prompt,
  })) as InstallActivationSelection;
}

async function promptWritebackInstallConfig(input: {
  flags: ParsedFlags;
  host: InstalledHostKind;
  prompt: CLIInstallPrompt;
}): Promise<InstalledHostWritebackConfig | undefined> {
  if (
    input.flags.writeback !== undefined ||
    flagEnabled(input.flags, "auto-learn") ||
    flagEnabled(input.flags, "no-auto-learn")
  ) {
    return readInstallWritebackConfig(input.flags);
  }

  const existing = await readInstalledHostRuntimeConfig(input.host, undefined, {});
  if (existing.status === "ok") {
    const mode = await askChoice({
      choices: ["keep-current", "off", "observe", "selective"],
      defaultValue: "keep-current",
      message:
        `Installed-host writeback mode for ${input.host}? current=${existing.config.writeback.mode} [keep-current/off/observe/selective]`,
      prompt: input.prompt,
    });
    if (mode === "keep-current") {
      return undefined;
    }

    return buildWritebackConfig(mode as InstalledHostWritebackMode);
  }

  const mode = await askChoice({
    choices: ["off", "observe", "selective"],
    defaultValue: "observe",
    message: `Installed-host writeback mode for ${input.host}? [off/observe/selective]`,
    prompt: input.prompt,
  });

  return buildWritebackConfig(mode as InstalledHostWritebackMode);
}

function resolveInstallPrompt(
  flags: ParsedFlags,
  dependencies: CLIRunDependencies,
): CLIInstallPrompt | undefined {
  if (flagEnabled(flags, "interactive") && flagEnabled(flags, "no-interactive")) {
    throw new Error("Use either --interactive or --no-interactive, not both.");
  }
  if (flagEnabled(flags, "no-interactive")) {
    return undefined;
  }

  const shouldPrompt =
    flagEnabled(flags, "interactive") ||
    dependencies.interactive === true ||
    (dependencies.interactive !== false &&
      !flagEnabled(flags, "json") &&
      isProcessInteractive());
  if (!shouldPrompt) {
    return undefined;
  }

  const prompt = dependencies.prompt ?? createProcessInstallPrompt();
  if (!prompt) {
    throw new Error(
      "Interactive install requires a TTY. Re-run without --interactive for non-interactive mode, or pass provider flags directly.",
    );
  }

  return prompt;
}

function isProcessInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

function createProcessInstallPrompt(): CLIInstallPrompt | undefined {
  if (!isProcessInteractive()) {
    return undefined;
  }

  return {
    ask: askProcessLine,
    askSecret: askProcessSecret,
  };
}

async function askProcessLine(message: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    return await readline.question(message);
  } finally {
    readline.close();
  }
}

async function askProcessSecret(message: string): Promise<string> {
  if (typeof process.stdin.setRawMode !== "function") {
    return askProcessLine(message);
  }

  process.stderr.write(message);
  const wasRaw = process.stdin.isRaw === true;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return await new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = (): void => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(wasRaw);
      process.stderr.write("\n");
    };
    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Interactive install cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u0008" || char === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }

        value += char;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function promptOptionalFlag(input: {
  flagName: string;
  flags: ParsedFlags;
  message: string;
  prompt: CLIInstallPrompt;
}): Promise<void> {
  if (input.flags[input.flagName] !== undefined) {
    return;
  }

  const answer = await askPrompt(input.prompt, `${input.message}: `);
  if (answer) {
    input.flags[input.flagName] = answer;
  }
}

async function promptInstallStorage(
  flags: ParsedFlags,
  prompt: CLIInstallPrompt,
): Promise<void> {
  if (flags["memory-path"] !== undefined) {
    return;
  }

  const existingProvider = flags["storage-provider"];
  if (existingProvider !== undefined) {
    const provider = readInstallStorageProviderFlag(existingProvider);
    if (
      provider === "postgres" &&
      normalizeOptionalFlag(flags["storage-url"]) === undefined
    ) {
      const storageUrl = await askPrompt(
        prompt,
        "Postgres connection string for GoodMemory storage (leave empty to skip Postgres for now): ",
      );
      if (storageUrl) {
        flags["storage-url"] = storageUrl;
      } else {
        clearInstallStorageFlags(flags);
      }
    }
    return;
  }

  const choice = await askChoice({
    choices: ["sqlite", "postgres", "skip"],
    defaultValue: "sqlite",
    message:
      "Storage provider for GoodMemory host memory [sqlite/postgres/skip]",
    prompt,
  });
  if (choice === "skip") {
    return;
  }
  if (choice === "sqlite") {
    flags["storage-provider"] = "sqlite";
    return;
  }

  const storageUrl = await askPrompt(
    prompt,
    "Postgres connection string for GoodMemory storage (leave empty to skip Postgres for now): ",
  );
  if (storageUrl) {
    flags["storage-provider"] = "postgres";
    flags["storage-url"] = storageUrl;
  }
}

function clearInstallStorageFlags(flags: ParsedFlags): void {
  delete flags["storage-provider"];
  delete flags["storage-url"];
}

async function promptEmbeddingInstallConfig(
  flags: ParsedFlags,
  prompt: CLIInstallPrompt,
  configPathHint: string,
): Promise<void> {
  const requestedByFlags = hasAnyFlag(flags, EMBEDDING_INSTALL_FLAGS);
  if (!requestedByFlags) {
    const shouldConfigure = await askYesNo({
      defaultValue: false,
      message: "Embedding provider improves semantic recall. Configure OpenAI embeddings now?",
      prompt,
    });
    if (!shouldConfigure) {
      return;
    }
    flags["embedding-provider"] = "openai";
  } else if (flags["embedding-provider"] === undefined) {
    flags["embedding-provider"] = "openai";
  }

  await promptOptionalFlag({
    flagName: "embedding-model",
    flags,
    message:
      "Embedding model (for example text-embedding-3-small; leave empty to skip embeddings)",
    prompt,
  });
  await promptOptionalSecretFlag({
    flagName: "embedding-api-key",
    flags,
    message:
      `Embedding API key (stored in ${configPathHint}; leave empty to skip embeddings)`,
    prompt,
  });
  await promptOptionalFlag({
    flagName: "embedding-base-url",
    flags,
    message: "Embedding base URL (optional, leave empty for provider default)",
    prompt,
  });
  clearProviderFlagsIfRequiredValuesMissing(flags, EMBEDDING_INSTALL_FLAGS, [
    "embedding-api-key",
    "embedding-model",
    "embedding-provider",
  ]);
}

async function promptAssistedExtractorInstallConfig(
  flags: ParsedFlags,
  prompt: CLIInstallPrompt,
  configPathHint: string,
): Promise<void> {
  const requestedByFlags = hasAnyFlag(flags, LLM_INSTALL_FLAGS);
  if (!requestedByFlags) {
    const shouldConfigure = await askYesNo({
      defaultValue: false,
      message:
        "LLM extraction provider improves memory writes. Configure LLM extraction now?",
      prompt,
    });
    if (!shouldConfigure) {
      return;
    }
  }

  if (flags["llm-provider"] === undefined) {
    flags["llm-provider"] = await askChoice({
      choices: ["openai", "anthropic"],
      defaultValue: "openai",
      message: "LLM extraction provider [openai/anthropic]",
      prompt,
    });
  }
  await promptOptionalFlag({
    flagName: "llm-model",
    flags,
    message:
      "LLM extraction model (required; leave empty to skip LLM extraction)",
    prompt,
  });
  await promptOptionalSecretFlag({
    flagName: "llm-api-key",
    flags,
    message:
      `LLM API key (stored in ${configPathHint}; leave empty to skip LLM extraction)`,
    prompt,
  });
  await promptOptionalFlag({
    flagName: "llm-base-url",
    flags,
    message: "LLM base URL (optional, leave empty for provider default)",
    prompt,
  });
  clearProviderFlagsIfRequiredValuesMissing(flags, LLM_INSTALL_FLAGS, [
    "llm-api-key",
    "llm-model",
    "llm-provider",
  ]);
}

async function promptOptionalSecretFlag(input: {
  flagName: string;
  flags: ParsedFlags;
  message: string;
  prompt: CLIInstallPrompt;
}): Promise<void> {
  if (input.flags[input.flagName] !== undefined) {
    return;
  }

  const answer = await askSecretPrompt(input.prompt, `${input.message}: `);
  if (answer) {
    input.flags[input.flagName] = answer;
  }
}

async function askPrompt(
  prompt: CLIInstallPrompt,
  message: string,
): Promise<string | undefined> {
  const answer = (await prompt.ask(message)).trim();
  return answer.length > 0 ? answer : undefined;
}

async function askSecretPrompt(
  prompt: CLIInstallPrompt,
  message: string,
): Promise<string | undefined> {
  const answer = (await (prompt.askSecret ?? prompt.ask)(message)).trim();
  return answer.length > 0 ? answer : undefined;
}

async function askChoice(input: {
  choices: string[];
  defaultValue: string;
  message: string;
  prompt: CLIInstallPrompt;
}): Promise<string> {
  const answer =
    (await askPrompt(input.prompt, `${input.message} (${input.defaultValue}): `)) ??
    input.defaultValue;
  const normalized = answer.toLowerCase();
  if (!input.choices.includes(normalized)) {
    throw new Error(
      `Unsupported install prompt answer: ${answer}. Expected ${input.choices.join("|")}.`,
    );
  }

  return normalized;
}

async function askYesNo(input: {
  defaultValue: boolean;
  message: string;
  prompt: CLIInstallPrompt;
}): Promise<boolean> {
  const suffix = input.defaultValue ? "[Y/n]" : "[y/N]";
  const answer = await askPrompt(input.prompt, `${input.message} ${suffix}: `);
  if (answer === undefined) {
    return input.defaultValue;
  }

  const normalized = answer.toLowerCase();
  if (normalized === "y" || normalized === "yes") {
    return true;
  }
  if (
    normalized === "n" ||
    normalized === "no" ||
    normalized === "skip" ||
    normalized === "later"
  ) {
    return false;
  }

  throw new Error(`Unsupported yes/no answer: ${answer}. Expected yes|no.`);
}

function hasAnyFlag(flags: ParsedFlags, names: string[]): boolean {
  return names.some((name) => flags[name] !== undefined);
}

function clearProviderFlagsIfRequiredValuesMissing(
  flags: ParsedFlags,
  allFlagNames: string[],
  requiredFlagNames: string[],
): void {
  const hasRequiredValues = requiredFlagNames.every(
    (name) => normalizeOptionalFlag(flags[name]) !== undefined,
  );
  if (hasRequiredValues) {
    return;
  }

  for (const name of allFlagNames) {
    delete flags[name];
  }
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
  dependencies: CLIRunDependencies = {},
): Promise<CLICommandOutput> {
  const installOptions = await resolveInteractiveInstallFlags(host, flags, dependencies);
  const installFlags = installOptions.flags;
  const workspaceRoot =
    installOptions.activationSelection === "current-workspace"
      ? resolve(installFlags["workspace-root"] ?? ".")
      : undefined;

  return withManagedFileTransaction(
    resolveHostMutationPaths([
      {
        host,
        workspaceRoot,
      },
    ]),
    async () => {
      const activationMode =
        installOptions.activationSelection === "global"
          ? "global"
          : readActivationModeFlag(installFlags["activation-mode"]) ?? "workspace_opt_in";
      const result = await installHost({
        activationMode,
        assistedExtractor: readOptionalAssistedExtractorProviderConfig(installFlags),
        embedding: readOptionalEmbeddingProviderConfig(installFlags),
        host,
        memoryPath: installFlags["memory-path"],
        storageProvider: readInstallStorageProviderFlag(installFlags["storage-provider"]),
        storageUrl: installFlags["storage-url"],
        userId: installFlags["user-id"],
        writeback: installOptions.writeback,
      });
      const workspaceEnableResult =
        installOptions.activationSelection === "current-workspace"
          ? await enableHostWorkspace({
              host,
              workspaceId: installFlags["workspace-id"],
              workspaceRoot: installFlags["workspace-root"],
            })
          : null;
      const providerSummary = summarizeInstalledProviders(result.providers);
      const payload = {
        activationMode: result.activationMode,
        changes: [
          ...result.changes,
          ...(workspaceEnableResult?.changes ?? []),
        ].map((change) => ({
          action: change.action,
          path: change.path,
          relativePath: change.relativePath,
        })),
        configPath: result.configPath,
        host: result.host,
        installRoot: result.installRoot,
        ...(result.storage.provider === "sqlite" ? { memoryPath: result.memoryPath } : {}),
        providers: providerSummary,
        storage: result.storage,
        userId: result.userId,
        writeback: result.writeback,
        ...(workspaceEnableResult
          ? {
              instructionPath: workspaceEnableResult.instructionPath,
              workspaceRoot: workspaceEnableResult.workspaceRoot,
            }
          : {}),
      };

      return {
        json: payload,
        text: renderInstalledHostPayload({
          actionLabel: "Installed",
          payload,
        }),
      };
    },
  );
}

async function handleSetup(
  flags: ParsedFlags,
  dependencies: CLIRunDependencies = {},
): Promise<CLICommandOutput> {
  const setup = await resolveSetupOptions(flags, dependencies);
  const workspaceRoot =
    setup.activationSelection === "current-workspace"
      ? resolve(setup.flags["workspace-root"] ?? ".")
      : undefined;

  return withManagedFileTransaction(
    resolveHostMutationPaths(
      setup.hosts.map((host) => ({
        host,
        workspaceRoot,
      })),
    ),
    async () => {
      const installPayloads = [];

      for (const host of setup.hosts) {
        const activationMode =
          setup.activationSelection === "global" ? "global" : "workspace_opt_in";
        const result = await installHost({
          activationMode,
          assistedExtractor: readOptionalAssistedExtractorProviderConfig(setup.flags),
          embedding: readOptionalEmbeddingProviderConfig(setup.flags),
          host,
          memoryPath: setup.flags["memory-path"],
          storageProvider: readInstallStorageProviderFlag(setup.flags["storage-provider"]),
          storageUrl: setup.flags["storage-url"],
          userId: setup.flags["user-id"],
          writeback: setup.writebackByHost[host],
        });
        const workspaceEnableResult =
          setup.activationSelection === "current-workspace"
            ? await enableHostWorkspace({
                host,
                workspaceId: setup.flags["workspace-id"],
                workspaceRoot: setup.flags["workspace-root"],
              })
            : null;
        installPayloads.push(buildInstalledHostPayload(result, workspaceEnableResult));
      }

      const payload = {
        hosts: installPayloads,
      };

      return {
        json: payload,
        text: renderSetupPayload(payload),
      };
    },
  );
}

async function withManagedFileTransaction<T>(
  paths: string[],
  callback: () => Promise<T>,
): Promise<T> {
  const snapshots = await captureFileSnapshots(paths);

  try {
    return await callback();
  } catch (error) {
    try {
      await restoreFileSnapshots(snapshots);
    } catch (restoreError) {
      const primary = error instanceof Error ? error.message : String(error);
      const rollback =
        restoreError instanceof Error ? restoreError.message : String(restoreError);
      throw new Error(
        `GoodMemory CLI command failed and rollback was incomplete.\nPrimary error: ${primary}\nRollback error: ${rollback}`,
      );
    }
    throw error;
  }
}

async function captureFileSnapshots(paths: string[]): Promise<FileSnapshot[]> {
  const uniquePaths = [...new Set(paths)];
  return Promise.all(uniquePaths.map((path) => captureFileSnapshot(path)));
}

async function captureFileSnapshot(path: string): Promise<FileSnapshot> {
  try {
    const [content, details] = await Promise.all([
      readFile(path, "utf8"),
      stat(path),
    ]);
    return {
      content,
      existed: true,
      mode: details.mode & 0o777,
      path,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        existed: false,
        path,
      };
    }
    throw error;
  }
}

async function restoreFileSnapshots(snapshots: FileSnapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    if (!snapshot.existed) {
      await rm(snapshot.path, { force: true });
      continue;
    }

    await mkdir(dirname(snapshot.path), { recursive: true });
    await writeFile(snapshot.path, snapshot.content ?? "", "utf8");
    if (snapshot.mode !== undefined) {
      await chmod(snapshot.path, snapshot.mode);
    }
  }
}

function resolveHostMutationPaths(
  inputs: Array<{ host: InstalledHostKind; workspaceRoot?: string }>,
): string[] {
  const installRoot = resolveInstallRoot(undefined);
  const homeRoot = dirname(installRoot);
  const paths = inputs.flatMap((input) => {
    const basePaths = [
      join(installRoot, `${input.host}.json`),
      resolveInstalledHostHookTargetPath(input.host, homeRoot).path,
      resolveInstalledHostMcpTargetPath(input.host, homeRoot).path,
    ];

    if (!input.workspaceRoot) {
      return basePaths;
    }

    return [
      ...basePaths,
      join(input.workspaceRoot, ".goodmemory", `${input.host}.json`),
      join(
        input.workspaceRoot,
        input.host === "codex" ? "AGENTS.md" : "CLAUDE.md",
      ),
    ];
  });

  return [...new Set(paths)];
}

async function resolveSetupOptions(
  flags: ParsedFlags,
  dependencies: CLIRunDependencies,
): Promise<{
  activationSelection: InstallActivationSelection;
  flags: ParsedFlags;
  hosts: InstalledHostKind[];
  writebackByHost: Partial<Record<InstalledHostKind, InstalledHostWritebackConfig>>;
}> {
  const prompt = resolveInstallPrompt(flags, dependencies);
  if (!prompt) {
    const hostSelection =
      readSetupHostSelection(flags.host) ?? (await detectSetupHostSelection());
    const hosts = expandSetupHostSelection(hostSelection);
    const writeback = readInstallWritebackConfigOverride(flags);
    const writebackByHost: Partial<
      Record<InstalledHostKind, InstalledHostWritebackConfig>
    > = {};
    if (writeback) {
      for (const host of hosts) {
        writebackByHost[host] = writeback;
      }
    }
    return {
      activationSelection:
        readActivationModeFlag(flags["activation-mode"]) === "workspace_opt_in"
          ? "manual"
          : "global",
      flags,
      hosts,
      writebackByHost,
    };
  }

  try {
    const resolvedFlags = { ...flags };
    const hostSelection =
      readSetupHostSelection(resolvedFlags.host) ??
      ((await askChoice({
        choices: ["codex", "claude", "both"],
        defaultValue: await detectSetupHostSelection(),
        message: "Enable GoodMemory for which host? [codex/claude/both]",
        prompt,
      })) as SetupHostSelection);
    const hosts = expandSetupHostSelection(hostSelection);
    const activationSelection = await promptInstallActivationSelection(
      resolvedFlags,
      prompt,
    );
    await promptOptionalFlag({
      flagName: "user-id",
      flags: resolvedFlags,
      message:
        "GoodMemory user id for this setup (leave empty to use the OS account)",
      prompt,
    });
    await promptInstallStorage(resolvedFlags, prompt);
    await promptEmbeddingInstallConfig(
      resolvedFlags,
      prompt,
      "~/.goodmemory/<host>.json",
    );
    await promptAssistedExtractorInstallConfig(
      resolvedFlags,
      prompt,
      "~/.goodmemory/<host>.json",
    );
    const writebackByHost: Partial<
      Record<InstalledHostKind, InstalledHostWritebackConfig>
    > = {};
    for (const host of hosts) {
      const writeback = await promptWritebackInstallConfig({
        flags: resolvedFlags,
        host,
        prompt,
      });
      if (writeback) {
        writebackByHost[host] = writeback;
      }
    }

    return {
      activationSelection,
      flags: resolvedFlags,
      hosts,
      writebackByHost,
    };
  } finally {
    await prompt.close?.();
  }
}

function buildInstalledHostPayload(
  result: InstallHostResult,
  workspaceEnableResult: Awaited<ReturnType<typeof enableHostWorkspace>> | null,
): {
  activationMode: InstalledHostActivationMode;
  changes: Array<{
    action: string;
    path: string;
    relativePath: string;
  }>;
  configPath: string;
  host: InstalledHostKind;
  installRoot: string;
  instructionPath?: string;
  memoryPath?: string;
  providers: {
    assistedExtractor: InstalledProviderStatus;
    embedding: InstalledProviderStatus;
  };
  storage: {
    location: string;
    provider: string;
  };
  userId: string;
  writeback: InstalledHostWritebackConfig;
  workspaceRoot?: string;
} {
  return {
    activationMode: result.activationMode,
    changes: [
      ...result.changes,
      ...(workspaceEnableResult?.changes ?? []),
    ].map((change) => ({
      action: change.action,
      path: change.path,
      relativePath: change.relativePath,
    })),
    configPath: result.configPath,
    host: result.host,
    installRoot: result.installRoot,
    ...(result.storage.provider === "sqlite" ? { memoryPath: result.memoryPath } : {}),
    providers: summarizeInstalledProviders(result.providers),
    storage: result.storage,
    userId: result.userId,
    writeback: result.writeback,
    ...(workspaceEnableResult
      ? {
          instructionPath: workspaceEnableResult.instructionPath,
          workspaceRoot: workspaceEnableResult.workspaceRoot,
        }
      : {}),
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

async function handleStatus(
  host: InstalledHostKind | undefined,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const hosts = host ? [host] : (["codex", "claude"] as InstalledHostKind[]);
  const payload = {
    hosts: await Promise.all(hosts.map((target) => buildHostStatus(target, flags))),
  };

  return {
    json: payload,
    text: renderStatusPayload(payload),
  };
}

async function buildHostStatus(
  host: InstalledHostKind,
  flags: ParsedFlags,
): Promise<Record<string, unknown>> {
  const installRoot = resolveInstallRoot(undefined);
  const homeRoot = dirname(installRoot);
  const globalConfig = await readInstalledHostRuntimeConfig(host, undefined, {});
  const resolved = await resolveInstalledHostContext({
    cwd: flags["workspace-root"],
    host,
  });
  const base = {
    activationMode:
      globalConfig.status === "ok" ? globalConfig.config.activationMode : null,
    config: globalConfig.status,
    hookRegistered: await isInstalledHostHookRegistered({ homeRoot, host }),
    host,
    mcpRegistered: await isInstalledHostMcpRegistered({ homeRoot, host }),
    preActionRegistered: await isInstalledHostPreActionHookRegistered({
      homeRoot,
      host,
    }),
    writeback: globalConfig.status === "ok" ? globalConfig.config.writeback : null,
    workspaceStatus: resolved.status,
  };

  if (resolved.status !== "ok") {
    return base;
  }

  try {
    const memoryStatus = await exportInstalledHostMemoryStatus(resolved.context);
    return {
      ...base,
      ...memoryStatus,
      scope: resolved.context.scope,
      storage: resolved.context.storage,
      workspaceRoot: resolved.context.workspaceRoot,
    };
  } catch (error) {
    return {
      ...base,
      countsError: error instanceof Error ? error.message : String(error),
      scope: resolved.context.scope,
      storage: resolved.context.storage,
      workspaceRoot: resolved.context.workspaceRoot,
    };
  }
}

async function exportInstalledHostMemoryStatus(
  context: InstalledHostResolvedContext,
): Promise<{
  counts: Record<string, number>;
  memoryStatus: "ok" | "uninitialized";
}> {
  if (await isUninitializedInstalledHostStorage(context)) {
    return {
      counts: buildEmptyInstalledHostMemoryCounts(),
      memoryStatus: "uninitialized",
    };
  }

  const exported = await createReadOnlyInstalledHostMemory(context).exportMemory({
    includeRuntime: false,
    scope: context.scope,
  });

  return {
    counts: {
      archives: exported.durable.archives.length,
      episodes: exported.durable.episodes.length,
      facts: exported.durable.facts.length,
      feedback: exported.durable.feedback.length,
      preferences: exported.durable.preferences.length,
      profile: exported.durable.profile ? 1 : 0,
      references: exported.durable.references.length,
    },
    memoryStatus: "ok",
  };
}

async function isUninitializedInstalledHostStorage(
  context: InstalledHostResolvedContext,
): Promise<boolean> {
  const storage = context.storage;
  return (
    storage?.provider === "sqlite" &&
    storage.url !== undefined &&
    storage.url !== ":memory:" &&
    !(await pathExists(storage.url))
  );
}

function createReadOnlyInstalledHostMemory(
  context: InstalledHostResolvedContext,
): GoodMemory {
  const storage = context.storage;
  if (storage?.provider === "sqlite" && storage.url !== undefined) {
    return createGoodMemory({
      adapters: {
        documentStore: createSQLiteDocumentStore(storage.url, {
          readOnly: true,
        }),
        sessionStore: createSQLiteSessionStore(storage.url, {
          readOnly: true,
        }),
        vectorStore: createInMemoryVectorStore(),
      },
      storage: {
        provider: "sqlite",
        url: storage.url,
      },
    });
  }
  if (storage?.provider === "postgres" && storage.url !== undefined) {
    return createGoodMemory({
      adapters: {
        documentStore: createPostgresDocumentStore(
          { url: storage.url },
          { readOnly: true },
        ),
        sessionStore: createPostgresSessionStore(
          { url: storage.url },
          { readOnly: true },
        ),
        vectorStore: createInMemoryVectorStore(),
      },
      storage: {
        provider: "postgres",
        url: storage.url,
      },
    });
  }

  return createInstalledHostMemory(context);
}

function buildEmptyInstalledHostMemoryCounts(): Record<string, number> {
  return {
    archives: 0,
    episodes: 0,
    facts: 0,
    feedback: 0,
    preferences: 0,
    profile: 0,
    references: 0,
  };
}

async function handleHostEnable(
  host: InstalledHostKind,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const result = await enableHostWorkspace({
    host,
    writebackMode:
      flags.writeback === undefined ? undefined : readWritebackModeFlag(flags.writeback),
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
    ...(result.writeback ? { writeback: result.writeback } : {}),
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

async function handleCodexAction(
  flags: ParsedFlags,
  positionals: string[],
): Promise<CLICommandOutput> {
  const sessionId = normalizeOptionalFlag(flags["session-id"]);
  if (!sessionId) {
    throw new Error(
      "Codex action gate requires --session-id <session-id> to bind memory-backed policy to a real host session.",
    );
  }

  const command =
    normalizeOptionalFlag(flags.command) ??
    normalizeOptionalFlag(shellEscapeArgs(positionals));
  if (!command) {
    throw new Error(
      "Codex action gate requires --command <command> or command tokens after --.",
    );
  }

  const result = await executeInstalledHostAction({
    ...(flags["action-id"] ? { actionId: flags["action-id"] } : {}),
    ...(flags["attempt-id"] ? { attemptId: flags["attempt-id"] } : {}),
    command,
    cwd: process.cwd(),
    host: "codex",
    ...(flags["run-id"] ? { runId: flags["run-id"] } : {}),
    ...(flags.sequence !== undefined
      ? { sequence: readNonNegativeIntegerFlag(flags.sequence, "sequence") }
      : {}),
    sessionId,
    ...(flags["turn-id"] ? { turnId: flags["turn-id"] } : {}),
  });

  return {
    exitCode: result.exitCode,
    json: result.payload,
    text: JSON.stringify(result.payload, null, 2),
  };
}

function shellEscapeArgs(tokens: string[]): string {
  return tokens
    .map((token) => `'${token.replace(/'/g, "'\\''")}'`)
    .join(" ");
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

async function handleHostWriteback(
  host: InstalledHostKind,
  command: string | undefined,
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  if (command === "inspect") {
    const result = await inspectInstalledHostWritebackAudit({
      cwd: flags["workspace-root"] ? resolve(flags["workspace-root"]) : process.cwd(),
      host,
      limit: flags.limit === undefined ? undefined : Number(flags.limit),
    });
    return {
      json: result,
      text: JSON.stringify(result, null, 2),
    };
  }

  if (command === "forget") {
    const reviewOutcome = readWritebackReviewOutcome(flags["review-outcome"]);
    const result = await forgetInstalledHostWritebackAuditEvent({
      cwd: flags["workspace-root"] ? resolve(flags["workspace-root"]) : process.cwd(),
      eventId: requireFlag(flags, "event-id"),
      host,
      ...(reviewOutcome || flags["review-reason"]
        ? {
            review: {
              outcome: reviewOutcome ?? "uncertain",
              ...(flags["review-reason"] ? { reason: flags["review-reason"] } : {}),
            },
          }
        : {}),
    });
    return {
      json: result,
      text: JSON.stringify(result, null, 2),
    };
  }

  if (command !== undefined) {
    throw new Error(`Unknown ${host} writeback command: ${command}.`);
  }

  const rawInput = await new Response(Bun.stdin.stream()).text();
  const payload = rawInput.trim().length > 0
    ? JSON.parse(rawInput) as Record<string, unknown>
    : {};
  const result = await executeInstalledHostWriteback({
    command: "session-end",
    dryRun: flagEnabled(flags, "dry-run"),
    host,
    mode: flags.mode === undefined ? undefined : readWritebackModeFlag(flags.mode),
    payload,
  });

  return {
    exitCode: hostWritebackExitCode(result.reason),
    json: result,
    text: JSON.stringify(result, null, 2),
  };
}

function readWritebackReviewOutcome(
  value: string | undefined,
): "false_write" | "uncertain" | "valid_write" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "false_write" || value === "uncertain" || value === "valid_write") {
    return value;
  }
  throw new Error(
    `Unsupported writeback review outcome: ${value}. Expected valid_write|false_write|uncertain.`,
  );
}

function hostWritebackExitCode(
  reason: InstalledHostWritebackResult["reason"],
): number {
  return reason === "missing_config" ||
    reason === "audit_failed" ||
    reason === "missing_repo_opt_in" ||
    reason === "write_failed"
    ? 1
    : 0;
}

async function handleMcpServe(flags: ParsedFlags): Promise<void> {
  await serveGoodMemoryMcp({
    host: requireInstalledHostKind(flags.host),
  });
}

export async function runCLI(
  argv: string[],
  dependencies: CLIRunDependencies = {},
): Promise<CLIResult> {
  try {
    const { commands, flags } = parseArgs(argv);
    if (versionRequested(flags)) {
      return await versionResult();
    }

    if (commands.length === 0) {
      return helpResult(ROOT_HELP_TEXT);
    }

    const primary = commands[0]!;

    if (helpRequested(flags)) {
      if (primary === "setup") {
        return helpResult(SETUP_HELP_TEXT);
      }
      if (primary === "status") {
        return helpResult(STATUS_HELP_TEXT);
      }
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
        if (secondary === "action") {
          return helpResult(CODEX_ACTION_HELP_TEXT);
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
        if (secondary === "writeback") {
          return helpResult(CODEX_WRITEBACK_HELP_TEXT);
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
        if (secondary === "writeback") {
          return helpResult(CLAUDE_WRITEBACK_HELP_TEXT);
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

    if (primary === "setup") {
      return renderOutput(await handleSetup(flags, dependencies), flags);
    }
    if (primary === "status") {
      return renderOutput(
        await handleStatus(
          commands[1] ? requireInstalledHostKind(commands[1]) : undefined,
          flags,
        ),
        flags,
      );
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
      if (secondary === "action") {
        return renderOutput(await handleCodexAction(flags, commands.slice(2)), flags);
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
      if (secondary === "writeback") {
        return renderOutput(await handleHostWriteback("codex", commands[2], flags), flags);
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
      if (secondary === "writeback") {
        return renderOutput(await handleHostWriteback("claude", commands[2], flags), flags);
      }

      throw new Error(`Unknown Claude command: ${secondary}. Run 'goodmemory claude --help'.`);
    }
    if (primary === "install") {
      return renderOutput(
        await handleHostInstall(
          requireInstalledHostKind(commands[1]),
          flags,
          dependencies,
        ),
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
