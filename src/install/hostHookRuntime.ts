import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MemoryScope } from "../domain/scope";
import type { MemoryExtractionStrategy } from "../remember/candidates";
import {
  normalizeText,
  readOptionalText,
} from "./hostConfigValidation";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
  type InstalledHostContextDependencies,
  type InstalledHostResolvedContext,
} from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";
import { resolveInstallRoot } from "./hostRuntimeConfig";

export type InstalledHostHookCommand =
  | "session-start"
  | "session-stop"
  | "user-prompt-submit";

export interface InstalledHostHookDependencies
  extends InstalledHostContextDependencies {}

export interface InstalledHostHookExecutionInput {
  command: InstalledHostHookCommand;
  host: InstalledHostKind;
  homeRoot?: string;
  payload: Record<string, unknown>;
}

export interface InstalledHostHookExecutionResult {
  applied: boolean;
  autoLearn: InstalledHostHookAutoLearnResult;
  context: string | null;
  maxTokens?: number;
  output: Record<string, unknown> | null;
  query: string | null;
  reason:
    | "applied"
    | "auto_learn_failed"
    | "disabled"
    | "empty_context"
    | "empty_prompt"
    | "invalid_global_config"
    | "invalid_repo_config"
    | "learned"
    | "missing_global_config"
    | "missing_repo_config"
    | "recall_failed";
  scope: MemoryScope | null;
}

export interface InstalledHostHookAutoLearnResult {
  attempted: boolean;
  reason:
    | "disabled"
    | "duplicate"
    | "empty_content"
    | "failed"
    | "source_disabled"
    | "written";
}

const MAX_HOOK_CONTEXT_CHARS = 10_000;
const MAX_AUTO_LEARN_CHARS = 4_000;
const MAX_AUTO_LEARN_EVENTS = 1_000;
const MAX_AUTO_LEARN_LOCK_ATTEMPTS = 40;
const MAX_AUTO_LEARN_LOCK_DELAY_MS = 25;
const MAX_AUTO_LEARN_MESSAGES = 8;
const MAX_AUTO_LEARN_MESSAGE_CHARS = 800;

export async function executeInstalledHostHook(
  input: InstalledHostHookExecutionInput,
  dependencies: InstalledHostHookDependencies = {},
): Promise<InstalledHostHookExecutionResult> {
  const resolved = await resolveInstalledHostContext(
    {
      cwd: readOptionalText(input.payload, "cwd"),
      homeRoot: input.homeRoot,
      host: input.host,
      sessionId: readOptionalText(input.payload, "session_id"),
    },
    dependencies,
  );
  if (resolved.status !== "ok") {
    return buildHookSkipResult({
      debug: resolved.debug,
      host: input.host,
      reason: resolved.status,
      command: input.command,
    });
  }

  if (input.command === "session-stop") {
    const memory = createInstalledHostMemory(resolved.context, dependencies);
    const autoLearn = await runAutoLearn({
      command: input.command,
      context: resolved.context,
      homeRoot: input.homeRoot,
      host: input.host,
      memory,
      payload: input.payload,
    });

    return {
      applied: false,
      autoLearn,
      context: null,
      output: null,
      query: null,
      reason:
        autoLearn.reason === "written"
          ? "learned"
          : autoLearn.reason === "failed"
            ? "auto_learn_failed"
            : "empty_context",
      scope: resolved.context.scope,
    };
  }

  const query = deriveHookQuery(input.command, input.payload);
  if (!query) {
    return buildHookSkipResult({
      debug: resolved.context.debug,
      host: input.host,
      reason: "empty_prompt",
      command: input.command,
    });
  }

  const context = resolved.context;

  try {
    const memory = createInstalledHostMemory(context, dependencies);
    const recall = await memory.recall({
      scope: context.scope,
      query,
      retrievalProfile: context.retrievalProfile,
    });
    const builtContext = await memory.buildContext({
      recall,
      output: "developer_prompt_fragment",
      maxTokens: resolved.context.maxTokens,
    });
    const fragment = normalizeText(builtContext.content);
    if (!fragment) {
      return buildHookSkipResult({
        debug: resolved.context.debug,
        host: input.host,
        reason: "empty_context",
        command: input.command,
        maxTokens: resolved.context.maxTokens,
        query,
        scope: resolved.context.scope,
      });
    }

    const boundedContext = clampText(fragment, MAX_HOOK_CONTEXT_CHARS);
    const autoLearn = await runAutoLearn({
      command: input.command,
      context,
      homeRoot: input.homeRoot,
      host: input.host,
      memory,
      payload: input.payload,
    });
    return {
      applied: true,
      autoLearn,
      context: boundedContext,
      maxTokens: resolved.context.maxTokens,
      output: {
        hookSpecificOutput: {
          hookEventName: mapHookEventName(input.command),
          additionalContext: boundedContext,
        },
      },
      query,
      reason: "applied",
      scope: resolved.context.scope,
    };
  } catch {
    return buildHookSkipResult({
      debug: resolved.context.debug,
      host: input.host,
      reason: "recall_failed",
      command: input.command,
      maxTokens: resolved.context.maxTokens,
      query,
      scope: resolved.context.scope,
    });
  }
}

function buildHookSkipResult(input: {
  command: InstalledHostHookCommand;
  debug: boolean;
  host: InstalledHostKind;
  maxTokens?: number;
  query?: string | null;
  reason: InstalledHostHookExecutionResult["reason"];
  scope?: MemoryScope | null;
}): InstalledHostHookExecutionResult {
  return {
    applied: false,
    autoLearn: {
      attempted: false,
      reason: "disabled",
    },
    context: null,
    maxTokens: input.maxTokens,
    output: input.debug
      ? {
          systemMessage: `GoodMemory ${input.host} ${input.command} hook skipped: ${input.reason}.`,
        }
      : null,
    query: input.query ?? null,
    reason: input.reason,
    scope: input.scope ?? null,
  };
}

function deriveHookQuery(
  command: InstalledHostHookCommand,
  payload: Record<string, unknown>,
): string | null {
  if (command === "user-prompt-submit") {
    return normalizeText(readOptionalText(payload, "prompt"));
  }

  if (command === "session-stop") {
    return null;
  }

  const source = normalizeText(readOptionalText(payload, "source")) ?? "startup";
  return source === "resume"
    ? "What continuity, active context, and open loops should I resume for this coding session?"
    : "What active context, continuity, and open loops should I know at the start of this coding session?";
}

function mapHookEventName(
  command: InstalledHostHookCommand,
): "SessionStart" | "Stop" | "UserPromptSubmit" {
  if (command === "session-start") {
    return "SessionStart";
  }
  return command === "session-stop" ? "Stop" : "UserPromptSubmit";
}

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

async function runAutoLearn(input: {
  command: InstalledHostHookCommand;
  context: InstalledHostResolvedContext;
  homeRoot?: string;
  host: InstalledHostKind;
  memory: ReturnType<typeof createInstalledHostMemory>;
  payload: Record<string, unknown>;
}): Promise<InstalledHostHookAutoLearnResult> {
  const source = input.command === "session-stop" ? "session_stop" : "user_prompt";
  if (!input.context.autoLearn.enabled) {
    return {
      attempted: false,
      reason: "disabled",
    };
  }
  if (!input.context.autoLearn.sources.includes(source)) {
    return {
      attempted: false,
      reason: "source_disabled",
    };
  }

  const content = deriveAutoLearnContent(input.command, input.payload);
  if (!content) {
    return {
      attempted: false,
      reason: "empty_content",
    };
  }

  const eventKey = buildAutoLearnEventKey({
    command: input.command,
    content,
    host: input.host,
    payload: input.payload,
  });
  try {
    return await withAutoLearnLedgerLock(
      input.host,
      input.homeRoot,
      async () => {
        const ledger = await readAutoLearnLedger(input.host, input.homeRoot);
        if (ledger.events.includes(eventKey)) {
          return {
            attempted: false,
            reason: "duplicate",
          } satisfies InstalledHostHookAutoLearnResult;
        }

        await input.memory.remember({
          annotations: [
            {
              messageIndex: 0,
              reason: `GoodMemory installed ${input.host} ${input.command} auto-learn`,
              remember: "auto",
            },
          ],
          extractionStrategy:
            input.context.autoLearn.extractionStrategy as MemoryExtractionStrategy,
          messages: [
            {
              content,
              role: "user",
            },
          ],
          scope: input.context.scope,
        });
        await writeAutoLearnLedger(
          input.host,
          input.homeRoot,
          appendAutoLearnEvent(ledger.events, eventKey),
        );
        return {
          attempted: true,
          reason: "written",
        } satisfies InstalledHostHookAutoLearnResult;
      },
    );
  } catch {
    return {
      attempted: false,
      reason: "failed",
    };
  }
}

function deriveAutoLearnContent(
  command: InstalledHostHookCommand,
  payload: Record<string, unknown>,
): string | null {
  if (command === "user-prompt-submit") {
    return normalizeText(readOptionalText(payload, "prompt"));
  }
  if (command !== "session-stop") {
    return null;
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.transcript)
      ? payload.transcript
      : null;
  if (messages) {
    const rendered = messages
      .slice(-MAX_AUTO_LEARN_MESSAGES)
      .map(renderAutoLearnMessage)
      .filter((line): line is string => Boolean(line))
      .join("\n");
    return normalizeText(clampText(rendered, MAX_AUTO_LEARN_CHARS));
  }

  const summary = normalizeText(readOptionalText(payload, "summary"));
  if (summary) {
    return clampText(summary, MAX_AUTO_LEARN_CHARS);
  }

  const transcript = normalizeText(readOptionalText(payload, "transcript"));
  if (!transcript) {
    return null;
  }

  return clampText(
    `Recent session excerpt:\n${transcript.slice(-MAX_AUTO_LEARN_CHARS)}`,
    MAX_AUTO_LEARN_CHARS,
  );
}

function renderAutoLearnMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return clampText(value, MAX_AUTO_LEARN_MESSAGE_CHARS);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role : "message";
  const content = typeof record.content === "string" ? record.content : "";
  const normalized = normalizeText(content);
  return normalized
    ? `${role}: ${clampText(normalized, MAX_AUTO_LEARN_MESSAGE_CHARS)}`
    : null;
}

function buildAutoLearnEventKey(input: {
  command: InstalledHostHookCommand;
  content: string;
  host: InstalledHostKind;
  payload: Record<string, unknown>;
}): string {
  const explicitId =
    readOptionalText(input.payload, "turn_id") ??
    readOptionalText(input.payload, "event_id") ??
    readOptionalText(input.payload, "hook_event_id");
  const sessionId = readOptionalText(input.payload, "session_id") ?? "session";
  const idempotencySource =
    explicitId ??
    createHash("sha256").update(input.content).digest("hex").slice(0, 24);

  return [
    input.host,
    sessionId,
    input.command,
    mapHookEventName(input.command),
    idempotencySource,
  ].join(":");
}

function appendAutoLearnEvent(
  events: string[],
  eventKey: string,
): string[] {
  return events.includes(eventKey)
    ? events
    : [...events, eventKey].slice(-MAX_AUTO_LEARN_EVENTS);
}

async function withAutoLearnLedgerLock<T>(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const lockPath = `${autoLearnLedgerPath(host, homeRoot)}.lock`;
  let attempt = 0;

  while (attempt < MAX_AUTO_LEARN_LOCK_ATTEMPTS) {
    try {
      const lockHandle = await open(lockPath, "wx", 0o600);
      try {
        return await callback();
      } finally {
        await lockHandle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isLockAlreadyHeldError(error)) {
        throw error;
      }
    }

    attempt += 1;
    await delay(MAX_AUTO_LEARN_LOCK_DELAY_MS);
  }

  throw new Error(`Timed out waiting for the ${host} auto-learn ledger lock.`);
}

async function writeAutoLearnLedger(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  events: string[],
): Promise<void> {
  const path = autoLearnLedgerPath(host, homeRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        events,
        version: 1,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

async function readAutoLearnLedger(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): Promise<{ events: string[] }> {
  try {
    const parsed = JSON.parse(await readFile(autoLearnLedgerPath(host, homeRoot), "utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const events = (parsed as { events?: unknown }).events;
      if (Array.isArray(events)) {
        return {
          events: events.filter((event): event is string => typeof event === "string"),
        };
      }
    }
    throw new Error("GoodMemory auto-learn ledger must be a JSON object with an events array.");
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        events: [],
      };
    }
    throw error;
  }
}

function autoLearnLedgerPath(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): string {
  return join(resolveInstallRoot(homeRoot), `${host}-auto-learn-events.json`);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isLockAlreadyHeldError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
