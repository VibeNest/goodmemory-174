import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InstalledHostKind } from "./hostInstall";
import { resolveInstallRoot } from "./hostRuntimeConfig";

// Per-session injection state: which record sets and rendered-content hashes
// each session has already received (duplicate suppression for per-prompt
// injection) plus a bounded event ring for `goodmemory status` telemetry.
// Session digests only — never raw session ids or injected content. Every
// operation fails open: a lost or corrupted state file can only cause a
// re-injection or a missing stats line, never a broken hook.

export interface InstalledHostInjectionSession {
  contentHashes: string[];
  injectedRecordIds: string[];
  updatedAt: string;
}

export interface InstalledHostInjectionEvent {
  at: string;
  command: "session-start" | "user-prompt-submit";
  decision: "duplicate_context" | "injected" | "low_relevance";
  estimatedTokens: number;
  recallLatencyMs: number;
  recordIds: string[];
  sessionDigest?: string;
}

interface InjectionState {
  events: InstalledHostInjectionEvent[];
  maintenance?: { lastRunAt: string };
  sessions: Record<string, InstalledHostInjectionSession>;
  version: 1;
}

const INJECTION_STATE_VERSION = 1;
const MAX_TRACKED_SESSIONS = 50;
const MAX_EVENTS = 100;
const MAX_HASHES_PER_SESSION = 200;

export interface InjectionSessionKeyInput {
  homeRoot: string | undefined;
  host: InstalledHostKind;
  sessionDigest: string;
}

export async function readInstalledHostInjectionSession(
  input: InjectionSessionKeyInput,
): Promise<InstalledHostInjectionSession | undefined> {
  const state = await readState(input.host, input.homeRoot);
  return state.sessions[input.sessionDigest];
}

export async function readInstalledHostInjectionEvents(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): Promise<InstalledHostInjectionEvent[]> {
  return (await readState(host, homeRoot)).events;
}

// Opportunistic-maintenance cooldown mark (session-stop auto maintenance).
export async function readInstalledHostMaintenanceMark(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): Promise<string | undefined> {
  return (await readState(host, homeRoot)).maintenance?.lastRunAt;
}

export async function writeInstalledHostMaintenanceMark(input: {
  homeRoot: string | undefined;
  host: InstalledHostKind;
  lastRunAt: string;
}): Promise<void> {
  try {
    const state = await readState(input.host, input.homeRoot);
    state.maintenance = { lastRunAt: input.lastRunAt };
    await writeState(input.host, input.homeRoot, state);
  } catch {
    // Fail open: a lost mark only means the next stop retries the cooldown.
  }
}

export async function recordInstalledHostInjection(
  input: InjectionSessionKeyInput & {
    contentHash?: string;
    event: Omit<InstalledHostInjectionEvent, "at" | "sessionDigest">;
    now: string;
    recordIds?: string[];
  },
): Promise<void> {
  try {
    const state = await readState(input.host, input.homeRoot);
    const session = state.sessions[input.sessionDigest] ?? {
      contentHashes: [],
      injectedRecordIds: [],
      updatedAt: input.now,
    };
    if (input.contentHash && !session.contentHashes.includes(input.contentHash)) {
      session.contentHashes = [
        ...session.contentHashes.slice(-(MAX_HASHES_PER_SESSION - 1)),
        input.contentHash,
      ];
    }
    if (input.recordIds && input.recordIds.length > 0) {
      session.injectedRecordIds = [
        ...new Set([...session.injectedRecordIds, ...input.recordIds]),
      ];
    }
    session.updatedAt = input.now;
    state.sessions[input.sessionDigest] = session;
    state.events = [
      ...state.events.slice(-(MAX_EVENTS - 1)),
      { ...input.event, at: input.now, sessionDigest: input.sessionDigest },
    ];

    await writeState(input.host, input.homeRoot, state);
  } catch {
    // Fail open: telemetry/dedupe state is never worth breaking a hook.
  }
}

// Session-start with source clear|compact calls this so the fresh context
// window gets a full brief again.
export async function resetInstalledHostInjectionSession(
  input: InjectionSessionKeyInput & { now: string },
): Promise<void> {
  try {
    const state = await readState(input.host, input.homeRoot);
    if (!(input.sessionDigest in state.sessions)) {
      return;
    }
    delete state.sessions[input.sessionDigest];
    await writeState(input.host, input.homeRoot, state);
  } catch {
    // Fail open.
  }
}

export function isDuplicateInjection(input: {
  contentHash: string;
  recordIds: string[];
  session: InstalledHostInjectionSession | undefined;
}): boolean {
  if (!input.session) {
    return false;
  }
  if (!input.session.contentHashes.includes(input.contentHash)) {
    return false;
  }
  return input.recordIds.every((recordId) =>
    input.session!.injectedRecordIds.includes(recordId),
  );
}

// Digest of the rendered fragment, so duplicate suppression compares content
// identity without storing any injected text.
export function hashInjectionContent(content: string): string {
  return `content:${createHash("sha256").update(content).digest("hex").slice(0, 24)}`;
}

export function injectionStatePath(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): string {
  return join(resolveInstallRoot(homeRoot), `${host}-injection-state.json`);
}

async function readState(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): Promise<InjectionState> {
  const fresh: InjectionState = {
    events: [],
    sessions: {},
    version: INJECTION_STATE_VERSION,
  };
  let raw: string;
  try {
    raw = await readFile(injectionStatePath(host, homeRoot), "utf8");
  } catch {
    return fresh;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (!isRecord(parsed) || !isRecord(parsed.sessions)) {
    return fresh;
  }

  const sessions: Record<string, InstalledHostInjectionSession> = {};
  for (const [key, value] of Object.entries(parsed.sessions)) {
    if (
      isRecord(value) &&
      Array.isArray(value.contentHashes) &&
      Array.isArray(value.injectedRecordIds) &&
      typeof value.updatedAt === "string"
    ) {
      sessions[key] = {
        contentHashes: value.contentHashes.filter(
          (hash): hash is string => typeof hash === "string",
        ),
        injectedRecordIds: value.injectedRecordIds.filter(
          (recordId): recordId is string => typeof recordId === "string",
        ),
        updatedAt: value.updatedAt,
      };
    }
  }

  return {
    events: Array.isArray(parsed.events)
      ? parsed.events.flatMap(readInjectionEvent).slice(-MAX_EVENTS)
      : [],
    ...(isRecord(parsed.maintenance) &&
    typeof parsed.maintenance.lastRunAt === "string"
      ? { maintenance: { lastRunAt: parsed.maintenance.lastRunAt } }
      : {}),
    sessions,
    version: INJECTION_STATE_VERSION,
  };
}

async function writeState(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  state: InjectionState,
): Promise<void> {
  const entries = Object.entries(state.sessions)
    .sort((left, right) => left[1].updatedAt.localeCompare(right[1].updatedAt))
    .slice(-MAX_TRACKED_SESSIONS);

  const path = injectionStatePath(host, homeRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        events: state.events.slice(-MAX_EVENTS),
        ...(state.maintenance ? { maintenance: state.maintenance } : {}),
        sessions: Object.fromEntries(entries),
        version: INJECTION_STATE_VERSION,
      },
      null,
      2,
    ) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
}

function readInjectionEvent(value: unknown): InstalledHostInjectionEvent[] {
  if (!isRecord(value)) {
    return [];
  }
  if (
    typeof value.at !== "string" ||
    (value.command !== "session-start" && value.command !== "user-prompt-submit") ||
    (value.decision !== "duplicate_context" &&
      value.decision !== "injected" &&
      value.decision !== "low_relevance") ||
    typeof value.estimatedTokens !== "number" ||
    typeof value.recallLatencyMs !== "number" ||
    !Array.isArray(value.recordIds)
  ) {
    return [];
  }
  return [
    {
      at: value.at,
      command: value.command,
      decision: value.decision,
      estimatedTokens: value.estimatedTokens,
      recallLatencyMs: value.recallLatencyMs,
      recordIds: value.recordIds.filter(
        (recordId): recordId is string => typeof recordId === "string",
      ),
      ...(typeof value.sessionDigest === "string"
        ? { sessionDigest: value.sessionDigest }
        : {}),
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
