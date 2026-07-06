import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Codex CLI has no working hooks surface today (the managed hooks.json is a
// forward-compatible scaffold), so rollout files under
// ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl are the honest
// capture source: `goodmemory codex writeback --from-rollout` feeds the
// newest (or an explicit) rollout through the same transcript-hydration
// pipeline the Claude Stop hook uses.

const ROLLOUT_FILE_PATTERN = /^rollout-.*\.jsonl$/;
const ROLLOUT_SESSION_ID_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

export async function resolveLatestCodexRolloutPath(input: {
  sessionsRoot?: string;
}): Promise<string | null> {
  const root = input.sessionsRoot ?? join(homedir(), ".codex", "sessions");
  let latest: { mtimeMs: number; path: string } | null = null;

  const walk = async (directory: string, depth: number): Promise<void> => {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry);
      let info;
      try {
        info = await stat(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        // Layout is sessions/YYYY/MM/DD/, so three levels below the root.
        if (depth < 3) {
          await walk(path, depth + 1);
        }
        continue;
      }
      if (!ROLLOUT_FILE_PATTERN.test(entry)) {
        continue;
      }
      if (!latest || info.mtimeMs > latest.mtimeMs) {
        latest = { mtimeMs: info.mtimeMs, path };
      }
    }
  };

  await walk(root, 0);
  return latest ? (latest as { path: string }).path : null;
}

// The rollout filename carries the session uuid; falling back to the
// filename keeps cursors keyed even when the uuid shape drifts.
export function codexRolloutSessionId(rolloutPath: string): string {
  const match = ROLLOUT_SESSION_ID_PATTERN.exec(rolloutPath);
  return match?.[1] ?? rolloutPath;
}
