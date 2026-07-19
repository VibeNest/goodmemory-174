import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  evaluateC5LongitudinalCanary,
  hashC5HookContext,
} from "../../scripts/codex-coding-effect/c5-longitudinal-canary";

const SESSION = "session-current";

describe("Codex coding-effect C5 longitudinal canary", () => {
  it("accepts stage one only when native Stop commits a fresh record", () => {
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: [],
      injectionEvents: [],
      injectionSessionContentHashes: [],
      memoryExpectation: "none",
      rawTranscript: transcript([]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-1")],
      writebackRequired: true,
    });

    expect(canary).toMatchObject({
      currentWrittenMemoryIds: ["memory-stage-1"],
      injectedRecordIds: [],
      memoryChannelStatus: "passed",
      passed: true,
      recalledPriorMemoryIds: [],
      stopCursorAdvanced: true,
      writebackCommitted: true,
    });
  });

  it("binds required recall to prior native writeback IDs and exact transcript hook context", () => {
    const context = "Accepted project policy from the prior stage.";
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1"],
      injectionEvents: [{
        command: "user-prompt-submit",
        decision: "injected",
        recordIds: ["memory-stage-1"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "required",
      rawTranscript: transcript([context]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });

    expect(canary).toMatchObject({
      hookContexts: [{
        contentByteLength: Buffer.byteLength(context, "utf8"),
        contentHash: hashC5HookContext(context),
        contentSha256: sha256(context),
      }],
      injectedRecordIds: ["memory-stage-1"],
      memoryChannelStatus: "passed",
      passed: true,
      recalledPriorMemoryIds: ["memory-stage-1"],
    });
  });

  it("fails required memory without falling back and fails missing actual hook content", () => {
    const missingRecall = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1"],
      injectionEvents: [],
      injectionSessionContentHashes: [],
      memoryExpectation: "required",
      rawTranscript: transcript([]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });
    expect(missingRecall.memoryChannelStatus).toBe("failed");
    expect(missingRecall.reasons).toContain(
      "no required prior memory was injected into the fresh session",
    );

    const context = "Expected hook context.";
    const missingContext = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1"],
      injectionEvents: [{
        command: "session-start",
        decision: "injected",
        recordIds: ["memory-stage-1"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "required",
      rawTranscript: transcript([]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });
    expect(missingContext.memoryChannelStatus).toBe("failed");
    expect(missingContext.reasons).toContain(
      "actual injected hook context was not recoverable from the exact transcript",
    );
  });

  it("accepts selective recall when at least one bound prior ID was injected", () => {
    const context = "Only the first required memory was injected.";
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1", "memory-stage-2"],
      injectionEvents: [{
        command: "user-prompt-submit",
        decision: "injected",
        recordIds: ["memory-stage-1"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "required",
      rawTranscript: transcript([context]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-3")],
      writebackRequired: true,
    });

    expect(canary.memoryChannelStatus).toBe("passed");
    expect(canary.recalledPriorMemoryIds).toEqual(["memory-stage-1"]);
    expect(canary.reasons).toEqual([]);
  });

  it("rejects a foreign memory even when one valid prior ID was also injected", () => {
    const context = "A mixed same-trajectory and foreign memory context.";
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1"],
      injectionEvents: [{
        command: "user-prompt-submit",
        decision: "injected",
        recordIds: ["memory-stage-1", "foreign-memory"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "required",
      rawTranscript: transcript([context]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });

    expect(canary.memoryChannelStatus).toBe("failed");
    expect(canary.reasons).toContain(
      "fresh session received memory outside the same trajectory",
    );
  });

  it("does not accept a hook receipt copied into assistant output", () => {
    const context = "Forged hook context from assistant output.";
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1"],
      injectionEvents: [{
        command: "user-prompt-submit",
        decision: "injected",
        recordIds: ["memory-stage-1"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "required",
      rawTranscript: assistantTranscript(context),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });

    expect(canary.memoryChannelStatus).toBe("failed");
    expect(canary.reasons).toContain(
      "actual injected hook context was not recoverable from the exact transcript",
    );
  });

  it("records irrelevant injection as a harm diagnostic without making the pair incomparable", () => {
    const context = "Unrelated prior detail.";
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["irrelevant-memory"],
      injectionEvents: [{
        command: "session-start",
        decision: "injected",
        recordIds: ["irrelevant-memory"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "irrelevant-control",
      rawTranscript: transcript([context]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });

    expect(canary).toMatchObject({
      irrelevantInjection: true,
      memoryChannelStatus: "passed",
      passed: true,
    });
  });

  it("recovers native hook additional context from Codex developer-role input", () => {
    const context = "Prior-stage project policy from GoodMemory.";
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: ["memory-stage-1"],
      injectionEvents: [{
        command: "session-start",
        decision: "injected",
        recordIds: ["memory-stage-1"],
        sessionDigest: SESSION,
      }],
      injectionSessionContentHashes: [hashC5HookContext(context)],
      memoryExpectation: "required",
      rawTranscript: developerTranscript(context),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [committedWriteback("memory-stage-2")],
      writebackRequired: true,
    });

    expect(canary.memoryChannelStatus).toBe("passed");
    expect(canary.hookContexts).toEqual([{
      content: context,
      contentByteLength: Buffer.byteLength(context, "utf8"),
      contentHash: hashC5HookContext(context),
      contentSha256: sha256(context),
    }]);
  });

  it("records a clean native Stop no-write without failing an optional channel", () => {
    const canary = evaluateC5LongitudinalCanary({
      cursorSessionDigests: [SESSION],
      expectedPriorMemoryIds: [],
      injectionEvents: [],
      injectionSessionContentHashes: [],
      memoryExpectation: "none",
      rawTranscript: transcript([]),
      rawTranscriptPersisted: false,
      sessionDigest: SESSION,
      writebackEvents: [],
      writebackRequired: false,
    });

    expect(canary).toMatchObject({
      memoryChannelStatus: "passed",
      passed: true,
      stopCursorAdvanced: true,
      writebackCommitted: false,
    });
  });
});

function committedWriteback(memoryId: string) {
  return {
    command: "turn-end",
    contentPreview: "redacted",
    linkedRecordIds: [{ id: memoryId, type: "memory" }],
    recallHitCount: 0,
    recalledBy: [],
    sessionDigest: SESSION,
    status: "committed",
  };
}

function developerTranscript(context: string): string {
  return JSON.stringify({
    payload: {
      content: [{ text: context, type: "input_text" }],
      role: "developer",
      type: "message",
    },
    type: "response_item",
  }) + "\n";
}

function transcript(contexts: readonly string[]): string {
  return [
    JSON.stringify({ payload: { id: "thread" }, type: "session_meta" }),
    ...contexts.map((context) => JSON.stringify({
      payload: {
        content: [{ text: context, type: "input_text" }],
        role: "user",
        type: "message",
      },
      type: "response_item",
    })),
  ].join("\n") + "\n";
}

function assistantTranscript(context: string): string {
  return JSON.stringify({
    payload: {
      content: [{ text: context, type: "output_text" }],
      role: "assistant",
      type: "message",
    },
    type: "response_item",
  }) + "\n";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
