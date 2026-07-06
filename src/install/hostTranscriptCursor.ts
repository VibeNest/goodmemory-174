import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InstalledHostKind } from "./hostInstall";
import { resolveInstallRoot } from "./hostRuntimeConfig";

// Per-session byte cursors into host transcript files, so the per-turn Stop
// hook reads only the delta since the last successful writeback. Keys are
// session digests (never raw session ids or transcript paths); pruning keeps
// the file bounded across many sessions. Mirrors the writeback ledger's
// state-file conventions (0600, version field, wx-open lock).

interface TranscriptCursorEntry {
  offset: number;
  updatedAt: string;
}

interface TranscriptCursorState {
  cursors: Record<string, TranscriptCursorEntry>;
  version: 1;
}

const TRANSCRIPT_CURSOR_VERSION = 1;
const MAX_TRACKED_SESSIONS = 50;
const MAX_LOCK_ATTEMPTS = 50;
const LOCK_RETRY_DELAY_MS = 20;

export interface TranscriptCursorKeyInput {
  homeRoot: string | undefined;
  host: InstalledHostKind;
  sessionDigest: string;
}

export async function readInstalledHostTranscriptCursor(
  input: TranscriptCursorKeyInput,
): Promise<number | undefined> {
  const state = await readState(input.host, input.homeRoot);
  return state.cursors[input.sessionDigest]?.offset;
}

export async function writeInstalledHostTranscriptCursor(
  input: TranscriptCursorKeyInput & { now: string; offset: number },
): Promise<void> {
  const state = await readState(input.host, input.homeRoot);
  state.cursors[input.sessionDigest] = {
    offset: input.offset,
    updatedAt: input.now,
  };

  const entries = Object.entries(state.cursors)
    .sort((left, right) => left[1].updatedAt.localeCompare(right[1].updatedAt))
    .slice(-MAX_TRACKED_SESSIONS);

  const path = transcriptCursorPath(input.host, input.homeRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        cursors: Object.fromEntries(entries),
        version: TRANSCRIPT_CURSOR_VERSION,
      },
      null,
      2,
    ) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
}

export async function withInstalledHostTranscriptCursorLock<T>(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const lockPath = `${transcriptCursorPath(host, homeRoot)}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });

  let attempt = 0;
  while (attempt < MAX_LOCK_ATTEMPTS) {
    try {
      const lockHandle = await open(lockPath, "wx", 0o600);
      try {
        return await callback();
      } finally {
        await lockHandle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isLockHeldError(error)) {
        throw error;
      }
    }

    attempt += 1;
    await delay(LOCK_RETRY_DELAY_MS);
  }

  throw new Error(`Timed out waiting for the ${host} transcript cursor lock.`);
}

export function transcriptCursorPath(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): string {
  return join(resolveInstallRoot(homeRoot), `${host}-transcript-cursors.json`);
}

async function readState(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): Promise<TranscriptCursorState> {
  const fresh: TranscriptCursorState = {
    cursors: {},
    version: TRANSCRIPT_CURSOR_VERSION,
  };
  let raw: string;
  try {
    raw = await readFile(transcriptCursorPath(host, homeRoot), "utf8");
  } catch {
    return fresh;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fresh;
  }
  if (!isRecord(parsed) || !isRecord(parsed.cursors)) {
    return fresh;
  }

  const cursors: Record<string, TranscriptCursorEntry> = {};
  for (const [key, value] of Object.entries(parsed.cursors)) {
    if (
      isRecord(value) &&
      typeof value.offset === "number" &&
      Number.isFinite(value.offset) &&
      value.offset >= 0 &&
      typeof value.updatedAt === "string"
    ) {
      cursors[key] = { offset: value.offset, updatedAt: value.updatedAt };
    }
  }
  return { cursors, version: TRANSCRIPT_CURSOR_VERSION };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLockHeldError(error: unknown): boolean {
  return isRecord(error) && error.code === "EEXIST";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
