import { describe, expect, it } from "bun:test";

import {
  normalizeCodexEvents,
  parseCodexJsonl,
} from "../../scripts/codex-coding-effect/codex-events";

describe("Codex coding-effect JSONL events", () => {
  it("normalizes thread, command, file-change, final-message, and usage events", () => {
    const events = parseCodexJsonl([
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "bun test",
          status: "completed",
          exit_code: 0,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "file_change",
          status: "completed",
          changes: [{ path: "src/example.ts", kind: "update" }],
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          status: "completed",
          text: "Done.",
        },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 },
      }),
    ].join("\n"));

    expect(normalizeCodexEvents(events)).toEqual({
      commands: [{
        command: "bun test",
        exitCode: 0,
        sourceEventIndex: 1,
        status: "completed",
      }],
      fileChanges: [{
        kind: "update",
        path: "src/example.ts",
        sourceEventIndex: 2,
      }],
      finalMessage: "Done.",
      finalMessageEventIndex: 3,
      threadId: "thread-1",
      threadStartedEventIndex: 0,
      usage: {
        cachedInputTokens: 2,
        inputTokens: 10,
        outputTokens: 4,
      },
      usageEventIndex: 4,
    });
  });

  it("accepts a valid final JSON object without a trailing newline", () => {
    expect(parseCodexJsonl(
      '{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}',
    )).toHaveLength(1);
  });

  it("rejects malformed JSONL with the exact line and no raw payload echo", () => {
    expect(() => parseCodexJsonl([
      '{"type":"thread.started","thread_id":"thread-1"}',
      '{"type":',
    ].join("\n"))).toThrow("invalid Codex JSONL at line 2");

    try {
      parseCodexJsonl('{"type":"agent_message","secret":"private-sentinel"');
    } catch (error) {
      expect(String(error)).not.toContain("private-sentinel");
    }
  });

  it("rejects rows without a string event type", () => {
    expect(() => parseCodexJsonl('{"thread_id":"thread-1"}\n'))
      .toThrow("invalid Codex event shape at line 1");
  });
});
