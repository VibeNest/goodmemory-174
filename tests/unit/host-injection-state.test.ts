import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  injectionStatePath,
  isDuplicateInjection,
  readInstalledHostInjectionSession,
  recordInstalledHostInjection,
  resetInstalledHostInjectionSession,
} from "../../src/install/hostInjectionState";

// Per-session injection state powers duplicate suppression (the same
// fragment should not be re-injected on every prompt) and the injection
// telemetry ring. Session digests only; fail-open on corruption.

async function createHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "gm-injection-home-"));
}

describe("installed host injection state", () => {
  it("records injections and answers duplicate checks", async () => {
    const homeRoot = await createHome();

    expect(
      await readInstalledHostInjectionSession({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBeUndefined();

    await recordInstalledHostInjection({
      contentHash: "hash-1",
      event: {
        command: "user-prompt-submit",
        decision: "injected",
        estimatedTokens: 120,
        recallLatencyMs: 40,
        recordIds: ["fact-1", "pref-2"],
      },
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:00:00.000Z",
      recordIds: ["fact-1", "pref-2"],
      sessionDigest: "session:abc",
    });

    const session = await readInstalledHostInjectionSession({
      homeRoot,
      host: "claude",
      sessionDigest: "session:abc",
    });
    expect(session?.injectedRecordIds.sort()).toEqual(["fact-1", "pref-2"]);
    expect(session?.contentHashes).toEqual(["hash-1"]);

    expect(
      isDuplicateInjection({
        contentHash: "hash-1",
        recordIds: ["fact-1"],
        session,
      }),
    ).toBe(true);
    // New record id → not a duplicate even with a seen hash.
    expect(
      isDuplicateInjection({
        contentHash: "hash-1",
        recordIds: ["fact-1", "fact-9"],
        session,
      }),
    ).toBe(false);
    // Same records but changed rendered content → not a duplicate.
    expect(
      isDuplicateInjection({
        contentHash: "hash-2",
        recordIds: ["fact-1"],
        session,
      }),
    ).toBe(false);
    expect(
      isDuplicateInjection({ contentHash: "hash-1", recordIds: [], session: undefined }),
    ).toBe(false);
  });

  it("resets a session entry so post-compact briefs re-inject", async () => {
    const homeRoot = await createHome();
    await recordInstalledHostInjection({
      contentHash: "hash-1",
      event: {
        command: "session-start",
        decision: "injected",
        estimatedTokens: 300,
        recallLatencyMs: 25,
        recordIds: ["fact-1"],
      },
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:00:00.000Z",
      recordIds: ["fact-1"],
      sessionDigest: "session:abc",
    });

    await resetInstalledHostInjectionSession({
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:05:00.000Z",
      sessionDigest: "session:abc",
    });

    expect(
      await readInstalledHostInjectionSession({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBeUndefined();
  });

  it("prunes sessions and caps the event ring", async () => {
    const homeRoot = await createHome();
    for (let index = 0; index < 55; index += 1) {
      await recordInstalledHostInjection({
        contentHash: `hash-${index}`,
        event: {
          command: "user-prompt-submit",
          decision: "injected",
          estimatedTokens: 10,
          recallLatencyMs: 5,
          recordIds: [`fact-${index}`],
        },
        homeRoot,
        host: "claude",
        now: `2026-07-05T10:00:${String(index).padStart(2, "0")}.000Z`,
        recordIds: [`fact-${index}`],
        sessionDigest: `session:${String(index).padStart(3, "0")}`,
      });
    }

    const raw = JSON.parse(
      await readFile(injectionStatePath("claude", homeRoot), "utf8"),
    ) as {
      events: unknown[];
      sessions: Record<string, unknown>;
    };
    expect(Object.keys(raw.sessions)).toHaveLength(50);
    expect(Object.keys(raw.sessions)).not.toContain("session:000");
    expect(raw.events.length).toBeLessThanOrEqual(100);
  });

  it("treats corrupted state as fresh and keeps hook flow alive", async () => {
    const homeRoot = await createHome();
    await recordInstalledHostInjection({
      contentHash: "hash-1",
      event: {
        command: "user-prompt-submit",
        decision: "injected",
        estimatedTokens: 10,
        recallLatencyMs: 5,
        recordIds: ["fact-1"],
      },
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:00:00.000Z",
      recordIds: ["fact-1"],
      sessionDigest: "session:abc",
    });
    await writeFile(injectionStatePath("claude", homeRoot), "{broken", "utf8");

    expect(
      await readInstalledHostInjectionSession({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBeUndefined();

    await recordInstalledHostInjection({
      contentHash: "hash-2",
      event: {
        command: "user-prompt-submit",
        decision: "injected",
        estimatedTokens: 10,
        recallLatencyMs: 5,
        recordIds: ["fact-2"],
      },
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:01:00.000Z",
      recordIds: ["fact-2"],
      sessionDigest: "session:abc",
    });
    const session = await readInstalledHostInjectionSession({
      homeRoot,
      host: "claude",
      sessionDigest: "session:abc",
    });
    expect(session?.injectedRecordIds).toEqual(["fact-2"]);
  });
});
