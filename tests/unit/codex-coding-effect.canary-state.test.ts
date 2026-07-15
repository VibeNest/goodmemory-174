import { describe, expect, it } from "bun:test";

import {
  parseNativeCanaryCursorState,
  parseNativeCanaryInjectionState,
  parseNativeCanaryRememberResult,
  parseNativeCanaryStatus,
  parseNativeCanaryWritebackInspection,
} from "../../scripts/codex-coding-effect/native-canary-state";

describe("Codex native canary external state", () => {
  it("parses only the public host status fields used by acceptance", () => {
    expect(parseNativeCanaryStatus(JSON.stringify({
      hosts: [{
        hookRegistered: true,
        host: "codex",
        mcpRegistered: true,
        workspaceStatus: "ok",
        writeback: { mode: "selective", persistRawTranscript: false },
      }],
    }))).toEqual({
      hookRegistered: true,
      mcpRegistered: true,
      workspaceStatus: "ok",
      writeback: { mode: "selective", persistRawTranscript: false },
    });
  });

  it("extracts the seeded memory id from a governed remember result", () => {
    expect(parseNativeCanaryRememberResult(JSON.stringify({
      accepted: 1,
      events: [{ memoryId: "memory-seed", outcome: "written" }],
      rejected: 0,
    }))).toEqual({ accepted: 1, memoryId: "memory-seed", rejected: 0 });
  });

  it("parses redaction-safe injection, cursor, and public writeback evidence", () => {
    expect(parseNativeCanaryInjectionState(JSON.stringify({
      events: [{
        command: "user-prompt-submit",
        decision: "injected",
        recordIds: ["memory-seed"],
        sessionDigest: "session:abc",
      }],
      sessions: {},
      version: 1,
    }))).toEqual([{
      command: "user-prompt-submit",
      decision: "injected",
      recordIds: ["memory-seed"],
      sessionDigest: "session:abc",
    }]);

    expect(parseNativeCanaryCursorState(JSON.stringify({
      cursors: {
        "session:abc": { offset: 123, updatedAt: "2026-07-15T00:00:00.000Z" },
      },
      version: 1,
    }))).toEqual(["session:abc"]);

    expect(parseNativeCanaryWritebackInspection(JSON.stringify({
      events: [{
        command: "turn-end",
        contentPreview: "Next step is c2-action.",
        linkedRecordIds: [{ id: "memory-next", type: "memory" }],
        recallHitCount: 1,
        recalledBy: [{ sessionDigest: "session:def" }],
        sessionDigest: "session:abc",
        status: "committed",
      }],
      host: "codex",
    }))).toEqual([{
      command: "turn-end",
      contentPreview: "Next step is c2-action.",
      linkedRecordIds: [{ id: "memory-next", type: "memory" }],
      recallHitCount: 1,
      recalledBy: [{ sessionDigest: "session:def" }],
      sessionDigest: "session:abc",
      status: "committed",
    }]);
  });

  it("rejects malformed evidence instead of treating it as an empty channel", () => {
    expect(() => parseNativeCanaryStatus('{"hosts":[]}'))
      .toThrow("native canary status");
    expect(() => parseNativeCanaryInjectionState('{"events":[{"decision":"injected"}]}'))
      .toThrow("native canary injection state");
    expect(() => parseNativeCanaryCursorState('{"cursors":{"session:x":{"offset":-1}}}'))
      .toThrow("native canary transcript cursor state");
  });
});
