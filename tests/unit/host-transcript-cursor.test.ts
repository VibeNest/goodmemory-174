import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readInstalledHostTranscriptCursor,
  transcriptCursorPath,
  withInstalledHostTranscriptCursorLock,
  writeInstalledHostTranscriptCursor,
} from "../../src/install/hostTranscriptCursor";

// Per-session transcript byte cursors let the per-turn Stop hook process only
// the delta since the last successful writeback. Only session digests are
// stored — never raw session ids or transcript paths.

async function createHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "gm-cursor-home-"));
}

describe("installed host transcript cursor store", () => {
  it("round-trips offsets keyed by session digest with private file mode", async () => {
    const homeRoot = await createHome();

    expect(
      await readInstalledHostTranscriptCursor({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBeUndefined();

    await writeInstalledHostTranscriptCursor({
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:00:00.000Z",
      offset: 4096,
      sessionDigest: "session:abc",
    });

    expect(
      await readInstalledHostTranscriptCursor({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBe(4096);

    const path = transcriptCursorPath("claude", homeRoot);
    const raw = JSON.parse(await readFile(path, "utf8")) as {
      cursors: Record<string, unknown>;
      version: number;
    };
    expect(raw.version).toBe(1);
    expect(Object.keys(raw.cursors)).toEqual(["session:abc"]);
    const mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("prunes to the most recent 50 sessions by update time", async () => {
    const homeRoot = await createHome();

    for (let index = 0; index < 55; index += 1) {
      await writeInstalledHostTranscriptCursor({
        homeRoot,
        host: "claude",
        now: `2026-07-05T10:00:${String(index).padStart(2, "0")}.000Z`,
        offset: index,
        sessionDigest: `session:${String(index).padStart(3, "0")}`,
      });
    }

    const raw = JSON.parse(
      await readFile(transcriptCursorPath("claude", homeRoot), "utf8"),
    ) as { cursors: Record<string, { offset: number }> };
    const keys = Object.keys(raw.cursors);
    expect(keys).toHaveLength(50);
    expect(keys).not.toContain("session:000");
    expect(keys).not.toContain("session:004");
    expect(raw.cursors["session:054"]?.offset).toBe(54);
  });

  it("serializes concurrent updates under the cursor lock", async () => {
    const homeRoot = await createHome();

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        withInstalledHostTranscriptCursorLock("claude", homeRoot, async () => {
          const current =
            (await readInstalledHostTranscriptCursor({
              homeRoot,
              host: "claude",
              sessionDigest: "session:shared",
            })) ?? 0;
          await writeInstalledHostTranscriptCursor({
            homeRoot,
            host: "claude",
            now: `2026-07-05T11:00:0${index}.000Z`,
            offset: current + 1,
            sessionDigest: "session:shared",
          });
        }),
      ),
    );

    expect(
      await readInstalledHostTranscriptCursor({
        homeRoot,
        host: "claude",
        sessionDigest: "session:shared",
      }),
    ).toBe(6);
  });

  it("treats a corrupted state file as fresh state", async () => {
    const homeRoot = await createHome();
    const path = transcriptCursorPath("claude", homeRoot);
    await writeInstalledHostTranscriptCursor({
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:00:00.000Z",
      offset: 10,
      sessionDigest: "session:abc",
    });
    await writeFile(path, "{corrupt", "utf8");

    expect(
      await readInstalledHostTranscriptCursor({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBeUndefined();

    await writeInstalledHostTranscriptCursor({
      homeRoot,
      host: "claude",
      now: "2026-07-05T10:01:00.000Z",
      offset: 20,
      sessionDigest: "session:abc",
    });
    expect(
      await readInstalledHostTranscriptCursor({
        homeRoot,
        host: "claude",
        sessionDigest: "session:abc",
      }),
    ).toBe(20);
  });
});
