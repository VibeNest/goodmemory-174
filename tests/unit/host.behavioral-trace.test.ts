import { describe, expect, it } from "bun:test";
import {
  extractFirstBehavioralTraceAction,
  toBehavioralFirstAction,
  validateBehavioralTrace,
} from "../../src/host/behavioralTrace";

describe("host behavioral trace", () => {
  it("validates a codex behavioral trace and rejects malformed events", () => {
    expect(
      validateBehavioralTrace({
        hostKind: "codex",
        traceId: "trace-1",
        events: [
          {
            stepIndex: 0,
            actionKind: "tool_call",
            actionName: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
            outcome: "timeout",
          },
        ],
      }),
    ).toEqual({
      hostKind: "codex",
      traceId: "trace-1",
      events: [
        {
          stepIndex: 0,
          actionKind: "tool_call",
          actionName: "DeepAnalyzer",
          raw: "DeepAnalyzer --detailed",
          outcome: "timeout",
        },
      ],
    });

    expect(() =>
      validateBehavioralTrace({
        hostKind: "codex",
        traceId: "trace-2",
        events: [
          {
            stepIndex: 0,
            actionKind: "note",
            actionName: "DeepAnalyzer",
            outcome: "timeout",
          },
        ],
      }),
    ).toThrow("actionKind");
  });

  it("extracts the first executable action by step index and ignores later repaired actions", () => {
    const trace = validateBehavioralTrace({
      hostKind: "codex",
      traceId: "trace-1",
      events: [
        {
          stepIndex: 2,
          actionKind: "tool_call",
          actionName: "QuickCheck",
          raw: "QuickCheck --network",
          outcome: "success",
        },
        {
          stepIndex: 0,
          actionKind: "tool_call",
          actionName: "DeepAnalyzer",
          raw: "DeepAnalyzer --detailed",
          outcome: "timeout",
        },
        {
          stepIndex: 1,
          actionKind: "warning",
          actionName: "warn",
          raw: "Warning: switching to QuickCheck after timeout.",
          outcome: "user_corrected",
        },
      ],
    });

    const first = extractFirstBehavioralTraceAction(trace);
    expect(first?.stepIndex).toBe(0);
    expect(toBehavioralFirstAction(first!)).toEqual({
      kind: "tool_call",
      name: "DeepAnalyzer",
      raw: "DeepAnalyzer --detailed",
    });
  });

  it("rejects ambiguous step ordering in the source-of-truth trace", () => {
    expect(() =>
      validateBehavioralTrace({
        hostKind: "codex",
        traceId: "trace-duplicate-step",
        events: [
          {
            stepIndex: 0,
            actionKind: "tool_call",
            actionName: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
            outcome: "timeout",
          },
          {
            stepIndex: 0,
            actionKind: "tool_call",
            actionName: "QuickCheck",
            raw: "QuickCheck --network",
            outcome: "success",
          },
        ],
      }),
    ).toThrow("duplicate");

    expect(() =>
      validateBehavioralTrace({
        hostKind: "codex",
        traceId: "trace-fractional-step",
        events: [
          {
            stepIndex: 0.5,
            actionKind: "tool_call",
            actionName: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
            outcome: "timeout",
          },
        ],
      }),
    ).toThrow("integer");
  });
});
