import { describe, expect, it } from "bun:test";
import type { AgentEventStructuredValue } from "../../src/ai-sdk";
import {
  isAgentInputEvent,
  validateAgentInputEvent,
} from "../../src/ai-sdk";
import {
  isHostAgentEvent,
  validateHostAgentEvent,
} from "../../src/host";

describe("adapter-level agent event contracts", () => {
  it("validates ai-sdk agent input events with structured tool payloads", () => {
    const payload: AgentEventStructuredValue = {
      checks: ["network"],
      dryRun: true,
      limit: 2,
      options: {
        includeWarnings: true,
      },
    };

    const event = validateAgentInputEvent({
      surface: "ai-sdk",
      kind: "tool_call",
      eventId: "event-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      toolName: "QuickCheck",
      payload,
    });

    expect(event.surface).toBe("ai-sdk");
    expect(event.eventId).toBe("event-1");
    expect(event.runId).toBe("run-1");
    expect(event.turnId).toBe("turn-1");
    expect(event.sequence).toBe(0);
    expect(event.kind).toBe("tool_call");
    if (event.kind !== "tool_call") {
      throw new Error("expected tool_call event");
    }
    expect(event.toolName).toBe("QuickCheck");
    expect(event.payload).toEqual(payload);
  });

  it("validates host agent events and keeps the naming family distinct", () => {
    const event = validateHostAgentEvent({
      surface: "host",
      kind: "tool_result",
      eventId: "event-2",
      attemptId: "attempt-1",
      turnId: "turn-1",
      sequence: 1,
      occurredAt: "2026-04-22T00:00:01.000Z",
      parentEventId: "event-1",
      hostKind: "claude",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      toolName: "QuickCheck",
      outcome: "success",
      excerpt: "Reachability confirmed.",
    });

    expect(event.surface).toBe("host");
    expect(event.attemptId).toBe("attempt-1");
    expect(event.parentEventId).toBe("event-1");
    expect(event.kind).toBe("tool_result");
    expect(event.hostKind).toBe("claude");
  });

  it("rejects events that do not provide run or attempt identity", () => {
    expect(() =>
      validateAgentInputEvent({
        surface: "ai-sdk",
        kind: "task_transition",
        eventId: "event-1",
        turnId: "turn-1",
        sequence: 0,
        occurredAt: "2026-04-22T00:00:00.000Z",
        hostKind: "generic",
        scope: {
          userId: "u-1",
        },
        nextState: "review",
      })
    ).toThrow("event must include runId or attemptId");
  });

  it("rejects invalid surface discriminators and exposes safe type guards", () => {
    const aiLifecycleTelemetry = {
      phase: "recall",
      status: "applied",
      retrievalProfile: "coding_agent",
      scope: {
        userId: "u-1",
      },
    };

    expect(isAgentInputEvent(aiLifecycleTelemetry)).toBe(false);
    expect(isHostAgentEvent(aiLifecycleTelemetry)).toBe(false);
    expect(() =>
      validateHostAgentEvent({
        surface: "ai-sdk",
        kind: "user_correction",
        correction: "Use QuickCheck first.",
        eventId: "event-3",
        runId: "run-1",
        turnId: "turn-2",
        sequence: 2,
        occurredAt: "2026-04-22T00:00:02.000Z",
        hostKind: "codex",
        scope: {
          userId: "u-1",
        },
      })
    ).toThrow("event.surface must be host");
  });

  it("rejects file-edit paths that are not normalized relative paths", () => {
    for (const relativePath of [
      "/tmp/report.md",
      "../report.md",
      "playbooks/../report.md",
      "playbooks//report.md",
      "C:/tmp/report.md",
      "playbooks\\report.md",
    ]) {
      expect(() =>
        validateHostAgentEvent({
          surface: "host",
          kind: "file_edit",
          eventId: "event-file-1",
          runId: "run-1",
          turnId: "turn-2",
          sequence: 3,
          occurredAt: "2026-04-22T00:00:03.000Z",
          hostKind: "codex",
          scope: {
            userId: "u-1",
          },
          operation: "update",
          relativePath,
        })
      ).toThrow(
        "event.relativePath must be a normalized relative path without traversal or absolute segments",
      );
    }
  });
});
