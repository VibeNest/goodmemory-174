import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { readCodexRolloutDelta } from "../../src/install/hostTranscriptReader";

const FIXTURE_ROOT = join(import.meta.dir, "../../fixtures/codex-coding-effect");
const TRANSCRIPT_PATH = join(
  FIXTURE_ROOT,
  "codex-rollout-0.144.3.sanitized.jsonl",
);
const METADATA_PATH = join(
  FIXTURE_ROOT,
  "codex-rollout-0.144.3.metadata.json",
);

describe("Codex native transcript fixture", () => {
  it("pins the live 0.144.3 wire shape without retaining conversation content", async () => {
    const [transcript, metadataRaw] = await Promise.all([
      readFile(TRANSCRIPT_PATH, "utf8"),
      readFile(METADATA_PATH, "utf8"),
    ]);
    const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    const fixtureSha256 = createHash("sha256").update(transcript).digest("hex");

    expect(metadata).toMatchObject({
      codexVersion: "codex-cli 0.144.3",
      conversationMessageCount: 3,
      lineCount: 17,
      runId: "c2-native-20260715-010",
      sanitizedSha256: fixtureSha256,
      schemaVersion: 1,
    });
    expect(transcript).not.toContain("Handoff key");
    expect(transcript).not.toContain("release codename");

    const parsed = await readCodexRolloutDelta({ transcriptPath: TRANSCRIPT_PATH });
    expect(parsed.status).toBe("ok");
    expect(parsed.messages.map((message) => message.role)).toEqual([
      "user",
      "user",
      "assistant",
    ]);
    expect(parsed.nextOffset).toBe(Buffer.byteLength(transcript));
  });
});
