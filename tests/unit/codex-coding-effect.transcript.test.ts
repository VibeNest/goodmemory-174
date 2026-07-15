import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  auditAndSanitizeCodexTranscript,
  findCodexTranscriptByThreadId,
} from "../../scripts/codex-coding-effect/codex-transcript";

function currentTranscript(threadId = "thread-1"): string {
  return [
    JSON.stringify({
      payload: { id: threadId },
      timestamp: "2026-07-15T00:00:00.000Z",
      type: "session_meta",
    }),
    JSON.stringify({
      payload: {
        content: [{ text: "private user sentinel", type: "input_text" }],
        role: "user",
        type: "message",
      },
      timestamp: "2026-07-15T00:00:01.000Z",
      type: "response_item",
    }),
    JSON.stringify({
      payload: {
        content: [{ text: "private assistant sentinel", type: "output_text" }],
        role: "assistant",
        type: "message",
      },
      timestamp: "2026-07-15T00:00:02.000Z",
      type: "response_item",
    }),
  ].join("\n") + "\n";
}

describe("Codex native transcript boundary", () => {
  it("audits current rollout shape and emits a content-free fixture", () => {
    const result = auditAndSanitizeCodexTranscript({
      codexVersion: "codex-cli 0.144.3",
      raw: currentTranscript(),
      threadId: "thread-1",
    });

    expect(result.audit).toMatchObject({
      codexVersion: "codex-cli 0.144.3",
      conversationMessageCount: 2,
      formatDrift: null,
      lineCount: 3,
      sessionId: "thread-1",
    });
    expect(result.audit.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.sanitizedJsonl).not.toContain("private user sentinel");
    expect(result.sanitizedJsonl).not.toContain("private assistant sentinel");
    expect(result.sanitizedJsonl).toContain('"role":"user"');
    expect(result.sanitizedJsonl).toContain('"textSha256"');
    expect(result.sanitizedJsonl).toContain('"text":"<redacted-user-text>"');
    expect(result.sanitizedJsonl).toContain('"text":"<redacted-assistant-text>"');
  });

  it("fails explicitly on the first conversation shape drift without echoing content", () => {
    const raw = currentTranscript().replace(
      '"content":[{"text":"private user sentinel","type":"input_text"}]',
      '"content":"private drift sentinel"',
    );

    expect(() => auditAndSanitizeCodexTranscript({
      codexVersion: "codex-cli 0.144.3",
      raw,
      threadId: "thread-1",
    })).toThrow("Codex transcript format drift at line 2");
    try {
      auditAndSanitizeCodexTranscript({
        codexVersion: "codex-cli 0.144.3",
        raw,
        threadId: "thread-1",
      });
    } catch (error) {
      expect(String(error)).not.toContain("private drift sentinel");
    }
  });

  it("locates the exact thread transcript instead of the newest rollout", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c2-transcript-"));
    try {
      const sessionsRoot = join(root, "sessions", "2026", "07", "15");
      await mkdir(sessionsRoot, { recursive: true });
      const expected = join(
        sessionsRoot,
        "rollout-2026-07-15T00-00-00-thread-expected.jsonl",
      );
      await writeFile(expected, currentTranscript("thread-expected"), "utf8");
      await writeFile(
        join(sessionsRoot, "rollout-2026-07-15T01-00-00-thread-newer.jsonl"),
        currentTranscript("thread-newer"),
        "utf8",
      );

      expect(await findCodexTranscriptByThreadId({
        sessionsRoot: join(root, "sessions"),
        threadId: "thread-expected",
      })).toBe(expected);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
